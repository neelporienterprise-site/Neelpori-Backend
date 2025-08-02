const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
// const mongoSanitize = require('express-mongo-sanitize'); // Removed
// const xss = require('xss-clean'); // Removed - causing the error
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const userAuthRoutes=require('./routes/userAuthRoute')
const productRoutes = require('./routes/productRoute');
const categoryRoutes = require('./routes/categoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const orderRoutes = require('./routes/orderRoutes');
const searchRoutes = require('./routes/searchRoutes');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const requestLogger = require('./middleware/requestLogger');

const app = express();

// Trust proxy (important for rate limiting and IP detection)
app.set('trust proxy', 1);

// Custom security middleware to replace problematic packages
const customSecurityMiddleware = (req, res, next) => {
  // MongoDB injection prevention
  const mongoSanitize = (obj) => {
    if (obj && typeof obj === 'object') {
      for (let key in obj) {
        if (typeof key === 'string' && (key.includes('$') || key.includes('.'))) {
          delete obj[key];
        } else if (typeof obj[key] === 'object') {
          mongoSanitize(obj[key]);
        }
      }
    }
    return obj;
  };

  // XSS prevention
  const xssClean = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    } else if (obj && typeof obj === 'object') {
      for (let key in obj) {
        obj[key] = xssClean(obj[key]);
      }
    }
    return obj;
  };

  try {
    // Sanitize request body
    if (req.body) {
      req.body = mongoSanitize(req.body);
      req.body = xssClean(req.body);
    }

    // Sanitize query parameters (create new object to avoid read-only issues)
    if (req.query && Object.keys(req.query).length > 0) {
      try {
        const sanitizedQuery = JSON.parse(JSON.stringify(req.query));
        const cleanQuery = xssClean(mongoSanitize(sanitizedQuery));
        
        // Try to replace query object, but don't fail if we can't
        Object.defineProperty(req, 'query', {
          value: cleanQuery,
          writable: true,
          configurable: true
        });
      } catch (queryError) {
        // If we can't modify req.query, log and continue
        console.warn('Could not sanitize query parameters:', queryError.message);
      }
    }

    // Sanitize params
    if (req.params) {
      req.params = mongoSanitize(req.params);
      req.params = xssClean(req.params);
    }

  } catch (error) {
    console.warn('Security sanitization error:', error.message);
  }

  next();
};

// Helmet - Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:3001', 'https://www.neelpori.com', 'https://neelpori-frontend.vercel.app/'];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Rate Limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    success: false,
    message
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
      retryAfter: Math.round(windowMs / 1000)
    });
  }
});

// Global rate limit
app.use('/api/', createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP'
));

// Stricter rate limit for auth routes
app.use('/api/auth/', createRateLimit(
  15 * 60 * 1000, // 15 minutes
  20, // limit each IP to 20 requests per windowMs
  'Too many authentication attempts'
));

// Very strict rate limit for sensitive auth operations
app.use('/api/auth/login', createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 login attempts per windowMs
  'Too many login attempts'
));

app.use('/api/auth/forgot-password', createRateLimit(
  60 * 60 * 1000, // 1 hour
  3, // limit each IP to 3 password reset attempts per hour
  'Too many password reset attempts'
));

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Custom security middleware (replaces express-mongo-sanitize and xss-clean)
app.use(customSecurityMiddleware);

// Prevent HTTP Parameter Pollution
app.use(hpp({
  whitelist: ['sort', 'fields', 'page', 'limit'] // Allow these parameters to be duplicated
}));

// Compression middleware
app.use(compression());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Custom request logger middleware
app.use(requestLogger);

// ================================================================
// ROUTES
// ================================================================


// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
// User routes
app.use('/api/user/auth', userAuthRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/orders', require('./routes/adminOrder'));
app.use('/api/search', searchRoutes);
app.get('/', (req, res) => {
  res.send('Welcome to the backend API');
});
app.get('/favicon.ico', (req, res) => res.status(204));


app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});
// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;