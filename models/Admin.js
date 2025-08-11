const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin'],
    default: 'admin'
  },
  permissions: [{
    type: String,
    enum: ['products', 'orders', 'users', 'categories', 'brands', 'reviews', 'analytics', 'settings',
      'product_read', 'product_create', 'product_update', 'product_delete',
    'stock_update', 'product_bulk_update', 'product_analytics', 
    'product_audit', 'product_export', 'product_reports', 'product_dashboard', 'orders', 'content'
    ]
  }],
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Email Verification
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // Password Reset
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Login Security
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
  lastLoginAt: Date,
  lastLoginIP: String
}, {
  timestamps: true
});

// Virtual for account lock status
adminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save hook to hash password
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.isLocked) {
    throw new Error('Account is temporarily locked due to too many failed login attempts');
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to handle failed login attempts
adminSchema.methods.handleFailedLogin = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1, loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to handle successful login
adminSchema.methods.handleSuccessfulLogin = async function(ip) {
  const updates = {
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { 
      lastLoginAt: new Date(),
      lastLoginIP: ip 
    }
  };
  return this.updateOne(updates);
};

// Indexes
adminSchema.index({ emailVerificationToken: 1 });
adminSchema.index({ passwordResetToken: 1 });

module.exports = mongoose.model('Admin', adminSchema);