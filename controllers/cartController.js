const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const { calculateShipping } = require('../services/shippingService');
const { validateCartItems } = require('../utils/validators');

exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id })
      .populate('items.product', 'title price images slug')
      .lean();

    // if (!cart) {
    //   return res.status(200).json({
    //     success: true,
    //     data: {
    //       items: [],
    //       totalItems: 0,
    //       subtotal: 0,
    //       shipping: 0,
    //       total: 0,
    //       currency: 'INR'
    //     }
    //   });
    // }

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping =85;
    const total = subtotal + shipping;

    res.status(200).json({
      success: true,
      data: {
        ...cart,
        subtotal,
        shipping,
        total,
        currency: 'INR'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};


exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, selectedVariants } = req.body;

    // Validate input
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Check if product exists and is available
    const product = await Product.findOne({
      _id: productId,
      status: 'active',
      visibility: 'public'
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or unavailable'
      });
    }

    // // Check stock availability
    // if (product.stock.trackInventory && product.availableStock < quantity) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Insufficient stock available',
    //     availableStock: product.availableStock
    //   });
    // } --> not required currently

    // Find or create cart for user
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = new Cart({
        user: req.user._id,
        items: []
      });
    }

    // Check if product already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && 
      JSON.stringify(item.selectedVariants) === JSON.stringify(selectedVariants || {})
    );

    if (existingItemIndex >= 0) {
      // Update quantity if already in cart
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      cart.items.push({
        product: productId,
        quantity,
        price: product.price.selling,
        selectedVariants: selectedVariants || {},
        addedAt: new Date()
      });
    }

    // Validate cart items
    const validationErrors = await validateCartItems(cart.items);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart validation failed',
        errors: validationErrors
      });
    }

    await cart.save();

    // Populate product details for response
    await cart.populate('items.product', 'title price images slug');

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = 85; // changed this
    const total = subtotal + shipping;

    res.status(200).json({
      success: true,
      data: {
        ...cart.toObject(),
        subtotal,
        shipping,
        total,
        currency: 'INR'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};


exports.updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    // if (!quantity || isNaN(quantity) || quantity < 1) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Valid quantity is required'
    //   });
    // } --> not required for nnow

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Check product stock
    const product = await Product.findById(cart.items[itemIndex].product);
    if (product.stock.trackInventory && product.availableStock < quantity) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock available',
        availableStock: product.availableStock
      });
    }

    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    // Populate product details for response
    await cart.populate('items.product', 'title price images slug');

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = 85;
    const total = subtotal + shipping;

    res.status(200).json({
      success: true,
      data: {
        ...cart.toObject(),
        subtotal,
        shipping,
        total,
        currency: 'INR'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};


exports.removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter(item => item._id.toString() !== itemId);

    if (cart.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    await cart.save();

    await cart.populate('items.product', 'title price images slug');

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = 85;
    const total = subtotal + shipping;

    res.status(200).json({
      success: true,
      data: {
        ...cart.toObject(),
        subtotal,
        shipping,
        total,
        currency: 'INR'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [] } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: {
        items: [],
        totalItems: 0,
        subtotal: 0,
        shipping: 0,
        total: 0,
        currency: 'INR'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};