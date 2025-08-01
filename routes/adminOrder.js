const express = require('express');
const router = express.Router();
const { authMiddleware, checkPermission } = require('../middleware/auth');
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getOrderStats
} = require('../controllers/adminOrderController'); 

// Apply auth middleware to all admin routes
router.use(authMiddleware);

/**
 * GET /api/admin/orders/stats
 * Get order dashboard statistics
 */
router.get('/stats', 
  checkPermission('order_view'),
  getOrderStats
);

/**
 * GET /api/admin/orders
 * Get all orders with pagination and filters
 */
router.get('/', 
  checkPermission('order_view'),
  getAllOrders
);

/**
 * GET /api/admin/orders/:orderId
 * Get single order details
 */
router.get('/:orderId', 
  checkPermission('order_view'),
  getOrderById
);

/**
 * PUT /api/admin/orders/:orderId/status
 * Update order status, shipping info, and payment status
 */
router.put('/:orderId/status', 
  checkPermission('order_update'),
  updateOrderStatus
);

/**
 * PUT /api/admin/orders/:orderId/shipping
 * Update shipping information specifically
 */
router.put('/:orderId/shipping', 
  checkPermission('order_update'),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { trackingId, awbNumber, courierName, shippingStatus } = req.body;

      // Call the updateOrderStatus function with shipping-specific data
      req.body = { shippingStatus, trackingId, awbNumber, courierName };
      return updateOrderStatus(req, res);
    } catch (error) {
      console.error("Update shipping info error:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/admin/orders/:orderId/payment
 * Update payment status
 */
router.put('/:orderId/payment', 
  checkPermission('order_update'),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { paymentStatus, transactionId } = req.body;

      // Call the updateOrderStatus function with payment-specific data
      req.body = { paymentStatus };
      if (transactionId) {
        // You might want to add transactionId handling to the updateOrderStatus function
        req.body.transactionId = transactionId;
      }
      return updateOrderStatus(req, res);
    } catch (error) {
      console.error("Update payment status error:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/admin/orders/:orderId/notes
 * Add notes to an order
 */
router.post('/:orderId/notes', 
  checkPermission('order_update'),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { notes } = req.body;

      if (!notes || notes.trim() === '') {
        return res.status(400).json({
          success: false,
          message: "Notes cannot be empty",
        });
      }

      // Call the updateOrderStatus function with notes only
      req.body = { notes };
      return updateOrderStatus(req, res);
    } catch (error) {
      console.error("Add order notes error:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/admin/orders/reports/export
 * Export orders data
 */
router.get('/reports/export', 
  checkPermission('order_export'),
  async (req, res) => {
    try {
      const { format = 'csv', startDate, endDate, status } = req.query;
      
      // Build query based on filters
      let query = {};
      
      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
      
      if (status && status !== 'all') {
        query.status = status;
      }

      const Order = require('../models/Order');
      const orders = await Order.find(query)
        .populate('user', 'name email phone')
        .populate('items.product', 'title sku')
        .sort({ createdAt: -1 })
        .lean();

      // Transform data for export
      const exportData = orders.map(order => ({
        orderNumber: order.orderNumber,
        customerName: order.user?.name || 'N/A',
        customerEmail: order.user?.email || 'N/A',
        customerPhone: order.user?.phone || 'N/A',
        status: order.status,
        paymentStatus: order.payment?.status || 'N/A',
        paymentMethod: order.payment?.method || 'N/A',
        shippingStatus: order.shipping?.status || 'N/A',
        trackingId: order.shipping?.trackingId || 'N/A',
        subtotal: order.subtotal,
        shippingCost: order.shipping?.cost || 0,
        total: order.total,
        itemCount: order.items.length,
        items: order.items.map(item => item.product?.title || 'Unknown').join(', '),
        shippingAddress: `${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`,
        orderDate: order.createdAt,
        deliveredAt: order.deliveredAt || 'N/A',
        notes: order.notes || 'N/A'
      }));

      res.json({
        success: true,
        message: 'Orders exported successfully',
        data: {
          format,
          count: exportData.length,
          orders: exportData
        }
      });

    } catch (error) {
      console.error('Export orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Export failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

module.exports = router;