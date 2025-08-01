const OTP = require('../models/OTP');
const crypto = require('crypto');
const emailService = require('./emailService');

class OTPService {
  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  async createAndSendOTP(email, type) {
    // Delete any existing OTPs for this email and type
    await OTP.deleteMany({ email, type });

    const otp = this.generateOTP();
    
    // Create new OTP
    const otpDoc = new OTP({
      email,
      otp,
      type,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    await otpDoc.save();
    
    // Send email
    await emailService.sendOTP(email, otp, type);
    
    return otp;
  }

  async verifyOTP(email, otp, type) {
    const otpDoc = await OTP.findOne({
      email,
      type,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpDoc) {
      throw new Error('Invalid or expired OTP');
    }

    // Check attempts
    if (otpDoc.attempts >= 3) {
      await OTP.deleteOne({ _id: otpDoc._id });
      throw new Error('Too many invalid attempts. Please request a new OTP.');
    }

    if (otpDoc.otp !== otp) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      throw new Error('Invalid OTP');
    }

    // Mark as used
    otpDoc.isUsed = true;
    await otpDoc.save();

    return true;
  }

  async deleteOTP(email, type) {
    await OTP.deleteMany({ email, type });
  }
}

module.exports = new OTPService();
