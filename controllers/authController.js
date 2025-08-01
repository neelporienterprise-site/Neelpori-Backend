const Admin = require('../models/Admin');
const otpService = require('../services/otpService');
const { generateTokens } = require('../middleware/auth');
const { validationResult } = require('express-validator');

class AuthController {
  // Register Admin
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { email, password, firstName, lastName, phone } = req.body;

      // Check if admin already exists
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Admin already exists with this email'
        });
      }

      // Create admin
      const admin = new Admin({
        email,
        password,
        firstName,
        lastName,
        phone,
        permissions: ['products', 'orders', 'users'] // Default permissions
      });

      await admin.save();

      // Send verification OTP
      await otpService.createAndSendOTP(email, 'email_verification');

      res.status(201).json({
        success: true,
        message: 'Admin registered successfully. Please verify your email.',
        data: {
          adminId: admin._id,
          email: admin.email
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: error.message
      });
    }
  }

  // Verify Email
  async verifyEmail(req, res) {
    try {
      const { email, otp } = req.body;

      await otpService.verifyOTP(email, otp, 'email_verification');

      // Update admin verification status
      const admin = await Admin.findOneAndUpdate(
        { email },
        { isVerified: true },
        { new: true }
      ).select('-password');

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(admin._id);

      res.json({
        success: true,
        message: 'Email verified successfully',
        data: {
          admin,
          tokens: { accessToken, refreshToken }
        }
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Login
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { email, password } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress;

      // Find admin
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (admin.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked due to too many failed login attempts'
        });
      }

      // Check if email is verified
      if (!admin.isVerified) {
        return res.status(401).json({
          success: false,
          message: 'Email not verified. Please verify your email first.'
        });
      }

      // Check if account is active
      // if (!admin.isActive) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Account is deactivated'
      //   });
      // }

      // Verify password
      try {
        const isValidPassword = await admin.comparePassword(password);
        if (!isValidPassword) {
          await admin.handleFailedLogin();
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }
      } catch (error) {
        return res.status(423).json({
          success: false,
          message: error.message
        });
      }

      // Successful login
      await admin.handleSuccessfulLogin(clientIP);

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(admin._id);

      // Remove password from response
      const adminData = admin.toObject();
      delete adminData.password;

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          admin: adminData,
          tokens: { accessToken, refreshToken }
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: error.message
      });
    }
  }

  // Forgot Password
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const admin = await Admin.findOne({ email });
      if (!admin) {
        // Don't reveal if email exists
        return res.json({
          success: true,
          message: 'If the email exists, you will receive a password reset OTP'
        });
      }

      // Send OTP
      await otpService.createAndSendOTP(email, 'password_reset');

      res.json({
        success: true,
        message: 'Password reset OTP sent to your email'
      });

    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send reset email',
        error: error.message
      });
    }
  }

  // Reset Password
  async resetPassword(req, res) {
    try {
      const { email, otp, newPassword } = req.body;

      // Verify OTP
      await otpService.verifyOTP(email, otp, 'password_reset');

      // Find and update admin password
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      admin.password = newPassword;
      admin.loginAttempts = 0;
      admin.lockUntil = undefined;
      await admin.save();

      res.json({
        success: true,
        message: 'Password reset successfully'
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Refresh Token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token required'
        });
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token type'
        });
      }

      const admin = await Admin.findById(decoded.adminId);
      if (!admin || !admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Generate new tokens
      const tokens = generateTokens(admin._id);

      res.json({
        success: true,
        data: { tokens }
      });

    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
  }

  // Resend OTP
  async resendOTP(req, res) {
    try {
      const { email, type } = req.body;

      if (!['email_verification', 'password_reset'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid OTP type'
        });
      }

      await otpService.createAndSendOTP(email, type);

      res.json({
        success: true,
        message: 'OTP sent successfully'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP',
        error: error.message
      });
    }
  }
}

module.exports = new AuthController();
