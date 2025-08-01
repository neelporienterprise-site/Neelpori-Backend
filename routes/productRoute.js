const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authMiddleware, checkPermission } = require('../middleware/auth');
// const { productValidation, stockValidation } = require('../middleware/productValidation');
const { uploadMiddleware } = require('../middleware/uploadMiddleware');
const rateLimit = require('express-rate-limit');
const Product = require('../models/Product');


// router.use(productRateLimit);

// Get featured products
router.get('/featured', productController.getFeaturedProducts);

// Search products
router.get('/search', productController.searchProducts);


// Get single product (public view)
router.get('/:id', productController.getProduct);

// Get all products (admin view with all data)
router.get('/', 
  productController.getProducts
);

router.use(authMiddleware);


// Create new product
router.post('/json', 
  // createProductRateLimit,
  // checkPermission('product_create'),
  uploadMiddleware.array('images', 10),
  // productValidation.create,
  productController.createProduct
);

// Update product
router.put('/:id', 
  // checkPermission('product_update'),
  uploadMiddleware.array('images', 10),
  // productValidation.update,
  productController.updateProduct
);

// Delete product (soft delete)
router.delete('/:id', 
  // checkPermission('product_delete'),
  productController.deleteProduct
);

// ================================================================
// STOCK MANAGEMENT ROUTES
// ================================================================

// Update product stock
router.patch('/:id/stock', 
  checkPermission('stock_update'),
  // stockValidation.update,
  productController.updateStock
);

// ================================================================
// BULK OPERATIONS ROUTES
// ================================================================

// Bulk update products
router.post('/bulk/update', 
  checkPermission('product_bulk_update'),
  // productValidation.bulkUpdate,
  productController.bulkUpdate
);

// ================================================================
// ANALYTICS AND REPORTING ROUTES
// ================================================================

// Get product analytics
router.get('/:id/analytics', 
  checkPermission('product_analytics'),
  productController.getAnalytics
);

// Get product audit log
router.get('/:id/audit-log', 
  checkPermission('product_audit'),
  productController.getAuditLog
);


// Export/Import routes for bulk operations
router.post('/export', 
  checkPermission('product_export'),
  async (req, res) => {
    try {
      const { format = 'csv', filters = {} } = req.body;
      
      // Build query based on filters
      const query = Product.findWithFilters(filters)
        .populate([
          { path: 'category', select: 'name' },
          { path: 'brand', select: 'name' },
          { path: 'subCategories', select: 'name' }
        ]);

      const products = await query.lean();

      // Transform data for export
      const exportData = products.map(product => ({
        sku: product.sku,
        title: product.title,
        description: product.description,
        category: product.category?.name,
        brand: product.brand?.name,
        originalPrice: product.price.original,
        sellingPrice: product.price.selling,
        stock: product.stock.quantity,
        status: product.status,
        rating: product.ratings.average,
        createdAt: product.createdAt
      }));

      res.json({
        success: true,
        message: 'Products exported successfully',
        data: {
          format,
          count: exportData.length,
          products: exportData
        }
      });

    } catch (error) {
      console.error('Export products error:', error);
      res.status(500).json({
        success: false,
        message: 'Export failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Get low stock products
router.get('/reports/low-stock', 
  checkPermission('product_reports'),
  async (req, res) => {
    try {
      const { threshold } = req.query;
      const stockThreshold = threshold ? parseInt(threshold) : 10;

      const lowStockProducts = await Product.find({
        $or: [
          { 'stock.quantity': { $lte: stockThreshold } },
          { $expr: { $lte: ['$stock.quantity', '$stock.lowStockThreshold'] } }
        ],
        status: 'active'
      })
        .populate([
          { path: 'category', select: 'name' },
          { path: 'brand', select: 'name' }
        ])
        .sort({ 'stock.quantity': 1 })
        .select('title sku stock category brand price');

      res.json({
        success: true,
        message: 'Low stock report generated successfully',
        data: {
          threshold: stockThreshold,
          count: lowStockProducts.length,
          products: lowStockProducts
        }
      });

    } catch (error) {
      console.error('Low stock report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate low stock report',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Get products summary/dashboard data
router.get('/dashboard/summary', 
  checkPermission('product_dashboard'),
  async (req, res) => {
    try {
      const [
        totalProducts,
        activeProducts,
        lowStockProducts,
        outOfStockProducts,
        featuredProducts,
        recentProducts
      ] = await Promise.all([
        Product.countDocuments(),
        Product.countDocuments({ status: 'active' }),
        Product.countDocuments({
          $expr: { $lte: ['$stock.quantity', '$stock.lowStockThreshold'] },
          status: 'active'
        }),
        Product.countDocuments({ 'stock.quantity': 0, status: 'active' }),
        Product.countDocuments({ isFeatured: true, status: 'active' }),
        Product.find({ status: 'active' })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate([
            { path: 'category', select: 'name' },
            { path: 'brand', select: 'name' }
          ])
          .select('title sku price stock createdAt')
      ]);

      // Calculate average rating
      const ratingStats = await Product.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$ratings.average' },
            averagePrice: { $avg: '$price.selling' },
            totalValue: { $sum: { $multiply: ['$stock.quantity', '$price.selling'] } }
          }
        }
      ]);

      res.json({
        success: true,
        message: 'Dashboard summary retrieved successfully',
        data: {
          summary: {
            totalProducts,
            activeProducts,
            lowStockProducts,
            outOfStockProducts,
            featuredProducts,
            averageRating: ratingStats[0]?.averageRating || 0,
            averagePrice: ratingStats[0]?.averagePrice || 0,
            totalInventoryValue: ratingStats[0]?.totalValue || 0
          },
          recentProducts
        }
      });

    } catch (error) {
      console.error('Dashboard summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard summary',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

module.exports = router;