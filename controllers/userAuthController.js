const admin = require("firebase-admin");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const emailService = require('../services/emailService');

// Initialize Firebase Admin SDK using environment variables
const serviceAccount = {
  type: "service_account",
  project_id: "neelpori-5bbc4", // Your actual project ID
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
};

// Only initialize if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    const otp = generateOTP();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Temporarily store user details in-memory 
    req.app.locals.tempUser = { name, email, hashedPassword, phone, address, otp, otpExpires: Date.now() + 10 * 60 * 1000 };

    await emailService.sendOTP(email, otp, name);
    res.status(200).json({ message: "OTP sent to email. Verify your account." });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const tempUser = req.app.locals.tempUser;

    if (!tempUser || tempUser.email !== email) {
      return res.status(400).json({ message: "No pending registration found" });
    }

    if (tempUser.otp !== otp || tempUser.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Save user in database after OTP verification
    const newUser = new User({
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.hashedPassword,
      phone: tempUser.phone,
      address: tempUser.address,
      isVerified: true
    });

    await newUser.save();
    req.app.locals.tempUser = null;

    res.status(200).json({ message: "Email verified successfully. You can log in now." });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Login (Email & Password)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.status(400).json({ message: "Invalid credentials or email not verified" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.status(200).json({ token, role: user.role, user });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { email, name, picture, uid } = decodedToken;

    let user = await User.findOne({ email });

    if (!user) {
      // Register user if not found
      user = new User({
        name,
        email,
        googleId: uid,
        isVerified: true,
      });
      await user.save();
    }

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.status(200).json({ token, user });

  } catch (error) {
    res.status(401).json({ message: "Invalid Google authentication", error: error.message });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = user.getResetPasswordToken();
    await user.save();

    await emailService.sendPasswordResetEmail(email, resetToken);
    res.status(200).json({ message: "Password reset email sent" });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpires: { $gt: Date.now() } });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};