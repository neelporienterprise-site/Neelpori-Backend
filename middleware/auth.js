const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User'); // Add this import

const generateTokens = (adminId) => {
  const accessToken = jwt.sign(
    { adminId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    { adminId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Generate tokens for users
const generateUserTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
};

// Admin authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'access') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token type' 
      });
    }

    const admin = await Admin.findById(decoded.adminId).select('-password');
    
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin not found' 
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account is deactivated' 
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

// User authentication middleware (for regular users)
const userAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'access') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token type' 
      });
    }

    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account is deactivated' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const admin = req.admin;
    
    // Enhanced permission map including order permissions
    const permissionMap = {
      // Product permissions
      'product_read': 'products',
      'product_create': 'products',
      'product_update': 'products',
      'product_delete': 'products',
      'stock_update': 'products',
      'product_bulk_update': 'products',
      'product_analytics': 'products',
      'product_audit': 'products',
      'product_export': 'products',
      'product_reports': 'products',
      'product_dashboard': 'products',
      
      // Category permissions
      'category_read': 'categories',
      'category_create': 'categories',
      'category_update': 'categories',
      'category_delete': 'categories',
      'category_feature': 'categories',
      'category_dashboard': 'categories',
      
      // Order permissions - ADD THESE
      'order_view': 'orders',
      'order_update': 'orders',
      'order_delete': 'orders',
      'order_export': 'orders',
      'order_reports': 'orders',
      'order_dashboard': 'orders',
      'order_status_update': 'orders',
      'order_shipping_update': 'orders',
      'order_payment_update': 'orders',
      
      // User permissions
      'user_view': 'users',
      'user_update': 'users',
      'user_delete': 'users',
      'user_export': 'users',
      
      // Analytics permissions
      'analytics_view': 'analytics',
      'analytics_export': 'analytics',

      'content_manage': 'content',
      'product_manage': 'products',
    };
    
    const mappedPermission = permissionMap[requiredPermission];
    
    if (!mappedPermission) {
      return res.status(400).json({
        success: false,
        message: 'Invalid permission specified'
      });
    }
    
    if (!admin.permissions.includes(mappedPermission)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

// Middleware to check if user is super admin
const requireSuperAdmin = (req, res, next) => {
  const admin = req.admin;
  
  if (admin.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Super admin access required'
    });
  }
  
  next();
};

module.exports = {
  generateTokens,
  generateUserTokens,
  authMiddleware,
  userAuthMiddleware,
  checkPermission,
  requireSuperAdmin
};