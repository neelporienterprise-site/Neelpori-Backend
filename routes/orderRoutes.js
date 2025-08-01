const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Create new order from cart
router.post('/', orderController.createOrder);

// Get user's orders
router.get('/', orderController.getUserOrders);

router.get('/:orderId', orderController.getOrderDetails);
router.put('/:orderId/cancel', orderController.cancelOrder);

module.exports = router;