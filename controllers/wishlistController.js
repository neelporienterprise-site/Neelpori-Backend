const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

/**
 * @desc    Get user's wishlist
 * @route   GET /api/wishlist
 * @access  Private
 */
exports.getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id })
      .populate('items.product', 'title price images slug')
      .lean();

    if (!wishlist) {
      return res.status(200).json({
        success: true,
        data: {
          items: [],
          totalItems: 0
        }
      });
    }

    res.status(200).json({
      success: true,
      data: wishlist
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

/**
 * @desc    Add item to wishlist
 * @route   POST /api/wishlist
 * @access  Private
 */
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

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

    // Find or create wishlist for user
    let wishlist = await Wishlist.findOne({ user: req.user._id });

    if (!wishlist) {
      wishlist = new Wishlist({
        user: req.user._id,
        items: []
      });
    }

    // Check if product already exists in wishlist
    const existingItemIndex = wishlist.items.findIndex(
      item => item.product.toString() === productId
    );

    if (existingItemIndex >= 0) {
      return res.status(400).json({
        success: false,
        message: 'Product already in wishlist'
      });
    }

    // Add new item to wishlist
    wishlist.items.push({
      product: productId,
      addedAt: new Date()
    });

    await wishlist.save();

    // Update product's wishlist count
    await Product.findByIdAndUpdate(productId, {
      $inc: { 'analytics.wishlistCount': 1 }
    });

    // Populate product details for response
    await wishlist.populate('items.product', 'title price images slug');

    res.status(200).json({
      success: true,
      data: wishlist
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

/**
 * @desc    Remove item from wishlist
 * @route   DELETE /api/wishlist/:itemId
 * @access  Private
 */
exports.removeFromWishlist = async (req, res) => {
  try {
    const { itemId } = req.params;

    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const initialLength = wishlist.items.length;
    const removedItem = wishlist.items.find(item => item._id.toString() === itemId);
    
    wishlist.items = wishlist.items.filter(item => item._id.toString() !== itemId);

    if (wishlist.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in wishlist'
      });
    }

    await wishlist.save();

    // Update product's wishlist count
    if (removedItem && removedItem.product) {
      await Product.findByIdAndUpdate(removedItem.product, {
        $inc: { 'analytics.wishlistCount': -1 }
      });
    }

    // Populate product details for response
    await wishlist.populate('items.product', 'title price images slug');

    res.status(200).json({
      success: true,
      data: wishlist
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

/**
 * @desc    Move item from wishlist to cart
 * @route   POST /api/wishlist/:itemId/move-to-cart
 * @access  Private
 */
exports.moveToCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity = 1 } = req.body;

    // First remove from wishlist
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const itemIndex = wishlist.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in wishlist'
      });
    }

    const productId = wishlist.items[itemIndex].product;
    
    // Remove from wishlist
    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    // Update product's wishlist count
    await Product.findByIdAndUpdate(productId, {
      $inc: { 'analytics.wishlistCount': -1 }
    });

    // Now add to cart
    const cartController = require('./cartController');
    req.body = { productId, quantity };
    return cartController.addToCart(req, res);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};