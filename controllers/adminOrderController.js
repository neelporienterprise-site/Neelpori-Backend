const Order = require("../models/Order");
const User = require("../models/User");
const Product = require("../models/Product");
const emailService = require('../services/emailService');

/**
 * Send order status update email to customer
 */
const sendOrderStatusUpdateEmail = async (email, order, customerName, statusUpdate) => {
  try {
    const orderData = {
      id: order._id,
      orderNumber: order.orderNumber,
      items: order.items.map(item => ({
        productId: {
          name: item.product?.title || 'Product Name Not Available'
        },
        quantity: item.quantity,
        price: item.price,
        total: (item.price * item.quantity).toFixed(2)
      })),
      totalAmount: order.total.toFixed(2),
      paymentStatus: order.payment?.status || 'pending',
      orderStatus: order.status,
      shippingStatus: order.shipping?.status || 'processing',
      address: {
        street: order.shippingAddress.street,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.pincode
      },
      customerName: customerName,
      subtotal: order.subtotal?.toFixed(2) || '0.00',
      shipping: order.shipping?.cost?.toFixed(2) || '0.00',
      createdAt: order.createdAt,
      updatedAt: new Date(),
      paymentMethod: order.payment?.method || 'N/A',
      trackingId: order.shipping?.trackingId || null,
      awbNumber: order.shipping?.awbNumber || null,
      courierName: order.shipping?.courierName || null,
      estimatedDelivery: order.shipping?.estimatedDelivery || null,
      actualDelivery: order.shipping?.actualDelivery || null,
      statusUpdate: statusUpdate
    };

    await emailService.sendOrderStatusUpdate(email, orderData);
    console.log(`Order status update email sent successfully to ${email} for order ${order._id}`);
    return true;
    
  } catch (error) {
    console.error('Error sending order status update email:', error);
    throw error;
  }
};

/**
 * Get all orders (Admin view)
 */
exports.getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const search = req.query.search;

    // Build query
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(query)
      .populate('user', 'name email phone')
      .populate('items.product', 'title images price sku')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(query);

    // Get order statistics
    const stats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          pages: Math.ceil(total / limit),
          total,
          limit,
        },
        stats
      }
    });
  } catch (error) {
    console.error("Get all orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/**
 * Get single order details (Admin view)
 */
exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('items.product', 'title images price description sku');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Get order by ID error:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/**
 * Update order status (Admin function)
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { 
      status, 
      shippingStatus, 
      trackingId, 
      awbNumber, 
      courierName, 
      paymentStatus,
      transactionId,
      notes 
    } = req.body;

    // Validate order status
    const validOrderStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    const validShippingStatuses = ['processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'failed'];
    const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded', 'unpaid'];

    if (status && !validOrderStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    if (shippingStatus && !validShippingStatuses.includes(shippingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shipping status",
      });
    }

    if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    const order = await Order.findById(orderId)
      .populate('items.product', 'title')
      .populate('user', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Store previous status for comparison
    const previousStatus = order.status;
    const previousShippingStatus = order.shipping?.status;

    // Update order fields
    if (status) {
      order.status = status;
      
      // Set delivered date if status is delivered
      if (status === 'delivered' && previousStatus !== 'delivered') {
        order.deliveredAt = new Date();
        order.shipping.actualDelivery = new Date();
      }
      
      // Set cancelled date if status is cancelled
      if (status === 'cancelled' && previousStatus !== 'cancelled') {
        order.cancelledAt = new Date();
      }
    }

    // Update shipping information
    if (shippingStatus) {
      order.shipping.status = shippingStatus;
      
      // Set estimated delivery (7 days from now) when shipped
      if (shippingStatus === 'shipped' && previousShippingStatus !== 'shipped') {
        const estimatedDelivery = new Date();
        estimatedDelivery.setDate(estimatedDelivery.getDate() + 7);
        order.shipping.estimatedDelivery = estimatedDelivery;
        order.expectedDelivery = estimatedDelivery;
      }
    }

    if (trackingId) order.shipping.trackingId = trackingId;
    if (awbNumber) order.shipping.awbNumber = awbNumber;
    if (courierName) order.shipping.courierName = courierName;

    // Update payment status
    if (paymentStatus) {
      order.payment.status = paymentStatus;
      
      // Set payment date if paid
      if (paymentStatus === 'paid' && order.payment.status !== 'paid') {
        order.payment.paymentDate = new Date();
      }
    }

    // Update transaction ID if provided
    if (transactionId) {
      order.payment.transactionId = transactionId;
    }

    // Add notes if provided
    if (notes) {
      const timestamp = new Date().toLocaleString();
      const newNote = `[${timestamp}] Admin: ${notes}`;
      order.notes = order.notes ? `${order.notes}\n${newNote}` : newNote;
    }

    await order.save();

    // Prepare status update information for email
    const statusUpdate = {
      previousStatus,
      newStatus: status || previousStatus,
      previousShippingStatus,
      newShippingStatus: shippingStatus || previousShippingStatus,
      hasStatusChanged: status && status !== previousStatus,
      hasShippingChanged: shippingStatus && shippingStatus !== previousShippingStatus,
      trackingAdded: trackingId && !order.shipping.trackingId,
      adminNotes: notes
    };

    // Send email notification to customer if status changed
    if (statusUpdate.hasStatusChanged || statusUpdate.hasShippingChanged || trackingId) {
      try {
        await sendOrderStatusUpdateEmail(order.user.email, order, order.user.name, statusUpdate);
      } catch (emailError) {
        console.error("Status update email sending error:", emailError);
        // Don't fail the request if email fails
      }
    }

    // Populate order for response
    const updatedOrder = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('items.product', 'title images price sku');

    res.json({
      success: true,
      message: "Order updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("Update order status error:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/**
 * Get order dashboard stats (Admin)
 */
exports.getOrderStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalOrders,
      todayOrders,
      weeklyOrders,
      monthlyOrders,
      statusStats,
      recentOrders,
      revenueStats
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfDay } }),
      Order.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$total' }
          }
        }
      ]),
      Order.find()
        .populate('user', 'name email')
        .populate('items.product', 'title')
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderNumber status total createdAt user items'),
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
            averageOrderValue: { $avg: '$total' },
            paidRevenue: {
              $sum: {
                $cond: [
                  { $eq: ['$payment.status', 'paid'] },
                  '$total',
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalOrders,
          todayOrders,
          weeklyOrders,
          monthlyOrders,
          totalRevenue: revenueStats[0]?.totalRevenue || 0,
          averageOrderValue: revenueStats[0]?.averageOrderValue || 0,
          paidRevenue: revenueStats[0]?.paidRevenue || 0
        },
        statusStats,
        recentOrders
      }
    });
  } catch (error) {
    console.error("Get order stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};