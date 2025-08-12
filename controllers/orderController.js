const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const emailService = require("../services/emailService");

/**
 * Validate cart items before checkout
 */
const validateCartItems = async (cartItems) => {
  const errors = [];

  // Validate each cart item (products are already populated)
  for (const item of cartItems) {
    // Check if product is populated properly
    if (!item.product || !item.product._id) {
      errors.push({
        product: item.product,
        message: "Product not found",
        action: "remove",
      });
      continue;
    }

    // Check if product is active and public
    if (
      item.product.status !== "active" ||
      item.product.visibility !== "public"
    ) {
      errors.push({
        product: item.product,
        message: "Product is no longer available",
        action: "remove",
      });
      continue;
    }

    // Check stock availability
    if (item.product.stock && item.product.stock.trackInventory) {
      const availableStock =
        item.product.stock.quantity - (item.product.stock.reserved || 0);
      if (availableStock < item.quantity) {
        errors.push({
          product: item.product,
          message: `Only ${availableStock} items available in stock`,
          availableStock: availableStock,
          action: "update",
        });
      }
    }
  }

  return errors;
};

/**
 * Calculate shipping cost
 */
const calculateShipping = async (cartItems) => {
  // Implement your shipping calculation logic here
  // For now, returning a fixed amount
  return 85;
};

/**
 * Send order confirmation email (mock function)
 */
const sendOrderConfirmationEmail = async (email, order, customerName) => {
  try {
    // Transform the order data to match your EJS template structure
    const orderData = {
      id: order._id,
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        productId: {
            name: item.product?.title || item.product?.name || 'Product Name Not Available'
        },
        quantity: item.quantity,
        price: item.price,
        total: (item.price * item.quantity).toFixed(2),
      })),
      totalAmount: order.total.toFixed(2),
      paymentStatus: order.payment?.status || "pending",
      orderStatus: order.status,
      address: {
        street: order.shippingAddress.street,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.pincode,
      },
      customerName: customerName,
      subtotal: order.subtotal?.toFixed(2) || "0.00",
      shipping: order.shipping?.cost?.toFixed(2) || "0.00",
      createdAt: order.createdAt,
      paymentMethod: order.payment?.method || "N/A",
    };

    // Use your existing email service
    await emailService.sendOrderConfirmation(email, orderData);

    console.log(
      `Order confirmation email sent successfully to ${email} for order ${order._id}`
    );
    return true;
  } catch (error) {
    console.error("Error sending order confirmation email:", error);
    throw error;
  }
};

/**
 * Send order cancellation email
 */
const sendOrderCancellationEmail = async (
  email,
  order,
  customerName,
  cancellationReason
) => {
  try {
    // Transform the order data for cancellation email
    const orderData = {
      id: order._id,
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        productId: {
          name: item.product?.title || "Product Name Not Available",
        },
        quantity: item.quantity,
        price: item.price,
        total: (item.price * item.quantity).toFixed(2),
      })),
      totalAmount: order.total.toFixed(2),
      paymentStatus: order.payment?.status || "pending",
      orderStatus: order.status,
      address: {
        street: order.shippingAddress.street,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.pincode,
      },
      customerName: customerName,
      subtotal: order.subtotal?.toFixed(2) || "0.00",
      shipping: order.shipping?.cost?.toFixed(2) || "0.00",
      createdAt: order.createdAt,
      cancelledAt: order.cancelledAt,
      paymentMethod: order.payment?.method || "N/A",
      cancellationReason: cancellationReason || "No reason provided",
      refundStatus:
        order.payment?.status === "refunded"
          ? "Refund processed"
          : order.payment?.method === "cod"
          ? "No payment to refund"
          : "Refund will be processed within 3-5 business days",
    };

    // Use your existing email service (you'll need to add this method)
    await emailService.sendOrderCancellation(email, orderData);

    console.log(
      `Order cancellation email sent successfully to ${email} for order ${order._id}`
    );
    return true;
  } catch (error) {
    console.error("Error sending order cancellation email:", error);
    throw error;
  }
};

/**
 * Create a new order
 */
exports.createOrder = async (req, res) => {
  try {
    let { shippingAddress, paymentMethod, notes } = req.body;

    // Handle string shippingAddress (convert to object)
    if (typeof shippingAddress === "string") {
      shippingAddress = {
        street: shippingAddress,
        city: "Not specified",
        state: "Not specified",
        pincode: "000000",
        phone: "Not specified",
      };
    }

    // Validate shipping address
    if (!shippingAddress || !shippingAddress.street) {
      return res.status(400).json({
        success: false,
        message: "Shipping address is required",
      });
    }

    // Set default values for missing address fields
    if (!shippingAddress.city) shippingAddress.city = "Not specified";
    if (!shippingAddress.state) shippingAddress.state = "Not specified";
    if (!shippingAddress.pincode) shippingAddress.pincode = "000000";
    if (!shippingAddress.phone) shippingAddress.phone = "Not specified";

    // Validate payment method
    const validPaymentMethods = [
      "cod",
      "prepaid",
      "wallet",
      "netbanking",
      "card",
      "upi",
    ];
    if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Valid payment method is required",
      });
    }

    // Get user's cart with populated products
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.product"
    );
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items in cart to place order",
      });
    }

    // Validate cart items
    const validationErrors = await validateCartItems(cart.items);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot place order with current cart items",
        errors: validationErrors,
      });
    }

    // Calculate totals
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const shipping = await calculateShipping(cart.items);
    const total = subtotal + shipping;

    // Create order
    const order = new Order({
      user: req.user._id,
      items: cart.items.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.price,
        selectedVariants: item.selectedVariants || {},
      })),
      shippingAddress,
      payment: {
        method: paymentMethod,
        status: paymentMethod === "cod" ? "pending" : "unpaid",
        amount: total,
      },
      subtotal,
      shipping: {
        cost: shipping,
        status: "processing",
      },
      total,
      status: "processing",
    });

    // Save order
    await order.save();
    await order.populate("items.product", "title name images price");
    // Update product stock
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: {
          "stock.quantity": -item.quantity,
          "analytics.purchases": 1,
        },
      });
    }

    // Clear cart
    await Cart.findByIdAndUpdate(cart._id, { $set: { items: [] } });

    // Send order confirmation email
    try {
      const user = await User.findById(req.user._id);
      await sendOrderConfirmationEmail(user.email, order, user.name);
    } catch (emailError) {
      console.error("Email sending error:", emailError);
    }

    // Populate order for response
    const populatedOrder = await Order.findById(order._id).populate(
      "items.product",
      "title name images price"
    );

    res.status(201).json({
      success: true,
      data: populatedOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/**
 * Get user's orders
 */
exports.getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ user: req.user._id })
      .populate("items.product", "title images price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ user: req.user._id });

    res.json({
      success: true,
      data: orders,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        total,
        limit,
      },
    });
  } catch (error) {
    console.error("Get user orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/**
 * Get order details
 */
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    }).populate("items.product", "title images price description");

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
    console.error("Get order details error:", error);

    // Handle MongoDB cast error specifically
    if (error.name === "CastError") {
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
 * Cancel order
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Safely extract reason from req.body with default value
    const reason = req.body && req.body.reason ? req.body.reason : null;

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    }).populate("items.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled
    const cancellableStatuses = ["pending", "processing"];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage",
      });
    }

    // Update order status
    order.status = "cancelled";
    order.cancelledAt = new Date();
    if (reason) {
      order.notes = order.notes
        ? `${order.notes}\nCancellation reason: ${reason}`
        : `Cancellation reason: ${reason}`;
    }

    await order.save();
    await order.populate("items.product", "title name images price");

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product._id || item.product, {
        $inc: {
          "stock.quantity": item.quantity,
          "analytics.purchases": -1,
        },
      });
    }

    // Handle payment refund if needed
    if (order.payment.status === "paid") {
      // Implement refund logic here
      order.payment.status = "refunded";
      await order.save();
    }

    // Send order cancellation email
    try {
      const user = await User.findById(req.user._id);
      await sendOrderCancellationEmail(user.email, order, user.name, reason);
    } catch (emailError) {
      console.error("Cancellation email sending error:", emailError);
    }

    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    console.error("Cancel order error:", error);

    // Handle MongoDB cast error specifically
    if (error.name === "CastError") {
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
