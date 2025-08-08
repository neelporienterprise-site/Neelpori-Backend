const express = require('express');
const router = express.Router();
const { authMiddleware, checkPermission } = require('../middleware/auth');
const homePageController = require('../controllers/homePageController');

// Apply auth middleware to all routes using a wrapper function
const authenticateAdmin = (req, res, next) => {
  return authMiddleware(req, res, next);
};

// Hero Section Routes
router.get('/hero', homePageController.getHeroSections);
router.post('/hero', authenticateAdmin, homePageController.createHeroSection);
router.put('/hero/:id', authenticateAdmin, homePageController.updateHeroSection);
router.delete('/hero/:id', authenticateAdmin, homePageController.deleteHeroSection);

// Best Sellers Routes
router.get('/bestsellers', homePageController.getBestSellers);
router.post('/bestsellers', authenticateAdmin, checkPermission('product_manage'), homePageController.addBestSeller);
router.delete('/bestsellers/:id', authenticateAdmin, checkPermission('product_manage'), homePageController.removeBestSeller);

// New Arrivals Routes
router.get('/newarrivals', homePageController.getNewArrivals);
router.post('/newarrivals', authenticateAdmin, checkPermission('product_manage'), homePageController.addNewArrival);
router.delete('/newarrivals/:id', authenticateAdmin, checkPermission('product_manage'), homePageController.removeNewArrival);

// Testimonials Routes
router.get('/testimonials', homePageController.getTestimonials);
router.post('/testimonials', authenticateAdmin, homePageController.createTestimonial);
router.put('/testimonials/:id', authenticateAdmin, homePageController.updateTestimonial);
router.delete('/testimonials/:id', authenticateAdmin, homePageController.deleteTestimonial);

// Watch and Shop Routes
router.get('/watchandshop', homePageController.getWatchAndShopItems);
router.post('/watchandshop', authenticateAdmin, homePageController.createWatchAndShopItem);
router.put('/watchandshop/:id', authenticateAdmin, homePageController.updateWatchAndShopItem);
router.delete('/watchandshop/:id', authenticateAdmin, homePageController.deleteWatchAndShopItem);

module.exports = router;