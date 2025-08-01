const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authMiddleware, checkPermission } = require('../middleware/auth');
const { uploadMiddleware } = require('../middleware/uploadMiddleware');
const rateLimit = require('express-rate-limit');

const createCategoryRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each IP to 50 category creations per hour
  message: {
    success: false,
    message: 'Too many category creation attempts, please try again later.'
  }
});

// Public routes
router.get('/featured', categoryController.getFeaturedCategories);
router.get('/homepage', categoryController.getHomepageCategories);

// Get single category (public view)
router.get('/:id', categoryController.getCategory);

// Get all categories (admin view with all data)
router.get('/', 
  categoryController.getCategories
);

// Admin routes - require authentication
router.use(authMiddleware);

// Create new category
router.post('/', 
  createCategoryRateLimit,
  // checkPermission('category_create'),
  uploadMiddleware.single('image'),
  categoryController.createCategory
);

// Update category
router.put('/:id', 
  // checkPermission('category_update'),
  uploadMiddleware.single('image'),
  categoryController.updateCategory
);

// Delete category (soft delete)
router.delete('/:id', 
  // checkPermission('category_delete'),
  categoryController.deleteCategory
);

module.exports = router;