const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');

// Middleware to protect routes - requires valid JWT
const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.userId).select('-password');
    
    if (!currentUser) {
      return next(new ErrorResponse('User not found', 401));
    }

    req.user = currentUser;
    next();
  } catch (err) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
};

// Middleware to authorize specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};

// Middleware to check if user is verified
exports.checkVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return next(
      new ErrorResponse('Please verify your email address to access this feature', 403)
    );
  }
  next();
};

// Middleware to prevent brute force attacks
exports.preventBruteForce = async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) return next();

  try {
    const user = await User.findOne({ email });
    if (!user) return next();

    // If user has too many login attempts
    if (user.loginAttempts >= 5 && user.lastLoginAttempt > Date.now() - 30 * 60 * 1000) {
      const timeLeft = Math.round((30 - (Date.now() - user.lastLoginAttempt) / (60 * 1000)));
      return next(
        new ErrorResponse(
          `Too many login attempts. Try again in ${timeLeft} minutes`,
          429
        )
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};


module.exports = {
  protect
};