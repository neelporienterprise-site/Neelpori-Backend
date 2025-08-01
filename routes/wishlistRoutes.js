const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const { protect } = require('../middleware/authMiddleware'); // Destructure protect

// Apply auth middleware to all routes
router.use(protect); // Use the protect middleware directly

// Get user's wishlist
router.get('/', wishlistController.getWishlist);

// Add item to wishlist
router.post('/', wishlistController.addToWishlist);

// Remove item from wishlist
router.delete('/:itemId', wishlistController.removeFromWishlist);

// Move item from wishlist to cart
router.post('/:itemId/move-to-cart', wishlistController.moveToCart);

module.exports = router;