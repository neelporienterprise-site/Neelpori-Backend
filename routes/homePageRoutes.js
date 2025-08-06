const express = require('express');
const router = express.Router();
const { authMiddleware, checkPermission } = require('../middleware/auth');
const homePageController = require('../controllers/homePageController');

// Apply auth middleware to all routes using a wrapper function
const authenticateAdmin = (req, res, next) => {
  return authMiddleware(req, res, next);
};

// Hero Section Routes
router.get('/hero', authenticateAdmin, homePageController.getHeroSections);
router.post('/hero', authenticateAdmin, checkPermission('content_manage'), homePageController.createHeroSection);
router.put('/hero/:id', authenticateAdmin, checkPermission('content_manage'), homePageController.updateHeroSection);
router.delete('/hero/:id', authenticateAdmin, checkPermission('content_manage'), homePageController.deleteHeroSection);

// Best Sellers Routes
router.get('/bestsellers', authenticateAdmin, homePageController.getBestSellers);
router.post('/bestsellers', authenticateAdmin, checkPermission('product_manage'), homePageController.addBestSeller);
router.delete('/bestsellers/:id', authenticateAdmin, checkPermission('product_manage'), homePageController.removeBestSeller);

// New Arrivals Routes
router.get('/newarrivals', authenticateAdmin, homePageController.getNewArrivals);
router.post('/newarrivals', authenticateAdmin, checkPermission('product_manage'), homePageController.addNewArrival);
router.delete('/newarrivals/:id', authenticateAdmin, checkPermission('product_manage'), homePageController.removeNewArrival);

// Testimonials Routes
router.get('/testimonials', authenticateAdmin, homePageController.getTestimonials);
router.post('/testimonials', authenticateAdmin, checkPermission('content_manage'), homePageController.createTestimonial);
router.put('/testimonials/:id', authenticateAdmin, checkPermission('content_manage'), homePageController.updateTestimonial);
router.delete('/testimonials/:id', authenticateAdmin, checkPermission('content_manage'), homePageController.deleteTestimonial);

// Watch and Shop Routes
router.get('/watchandshop', authenticateAdmin, homePageController.getWatchAndShopItems);
router.post('/watchandshop', authenticateAdmin, checkPermission('content_manage'), homePageController.createWatchAndShopItem);
router.put('/watchandshop/:id', authenticateAdmin, checkPermission('content_manage'), homePageController.updateWatchAndShopItem);
router.delete('/watchandshop/:id', authenticateAdmin, checkPermission('content_manage'), homePageController.deleteWatchAndShopItem);

module.exports = router;