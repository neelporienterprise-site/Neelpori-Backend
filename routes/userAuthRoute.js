const express = require("express");
const router = express.Router();
const authController = require("../controllers/userAuthController");

// Authentication Routes
router.post("/register", authController.register);
router.post("/verify-otp", authController.verifyOTP);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post('/google-auth', authController.googleLogin);

module.exports = router;
