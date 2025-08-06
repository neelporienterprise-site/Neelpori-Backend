const {
  HeroSection,
  BestSeller,
  NewArrival,
  Testimonial,
  WatchAndShop
} = require('../models/homePageModels');
const Product = require('../models/Product');
const Review = require('../models/Review');

exports.getHeroSections = async (req, res) => {
  try {
    const heroSections = await HeroSection.find({ isActive: true }).sort({ slideNumber: 1 });
    res.json({ success: true, data: heroSections });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createHeroSection = async (req, res) => {
  try {
    const { slideNumber, title, subtitle, description, image } = req.body;
    
    const heroSection = new HeroSection({
      slideNumber,
      title,
      subtitle,
      description,
      image
    });
    
    await heroSection.save();
    res.status(201).json({ success: true, data: heroSection });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateHeroSection = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    updates.updatedAt = Date.now();
    
    const heroSection = await HeroSection.findByIdAndUpdate(id, updates, { new: true });
    if (!heroSection) {
      return res.status(404).json({ success: false, message: 'Hero section not found' });
    }
    
    res.json({ success: true, data: heroSection });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteHeroSection = async (req, res) => {
  try {
    const { id } = req.params;
    const heroSection = await HeroSection.findByIdAndDelete(id);
    
    if (!heroSection) {
      return res.status(404).json({ success: false, message: 'Hero section not found' });
    }
    
    res.json({ success: true, message: 'Hero section deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Best Sellers
exports.getBestSellers = async (req, res) => {
  try {
    const bestSellers = await BestSeller.find()
      .populate('product', 'title price images sku')
      .sort({ position: 1 });
      
    res.json({ success: true, data: bestSellers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addBestSeller = async (req, res) => {
  try {
    const { productId } = req.body;
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // Check if already a best seller
    const existing = await BestSeller.findOne({ product: productId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Product already in best sellers' });
    }
    
    const bestSeller = new BestSeller({ product: productId });
    await bestSeller.save();
    
    res.status(201).json({ success: true, data: bestSeller });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.removeBestSeller = async (req, res) => {
  try {
    const { id } = req.params;
    const bestSeller = await BestSeller.findByIdAndDelete(id);
    
    if (!bestSeller) {
      return res.status(404).json({ success: false, message: 'Best seller entry not found' });
    }
    
    res.json({ success: true, message: 'Removed from best sellers' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// New Arrivals (similar to best sellers)
exports.getNewArrivals = async (req, res) => {
  try {
    const newArrivals = await NewArrival.find()
      .populate('product', 'title price images sku')
      .sort({ createdAt: -1 })
      .limit(10);
      
    res.json({ success: true, data: newArrivals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addNewArrival = async (req, res) => {
  try {
    const { productId } = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const existing = await NewArrival.findOne({ product: productId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Product already in new arrivals' });
    }
    
    const newArrival = new NewArrival({ product: productId });
    await newArrival.save();
    
    res.status(201).json({ success: true, data: newArrival });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.removeNewArrival = async (req, res) => {
  try {
    const { id } = req.params;
    const newArrival = await NewArrival.findByIdAndDelete(id);
    
    if (!newArrival) {
      return res.status(404).json({ success: false, message: 'New arrival entry not found' });
    }
    
    res.json({ success: true, message: 'Removed from new arrivals' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Testimonials
exports.getTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find()
      .sort({ createdAt: -1 });
      
    res.json({ success: true, data: testimonials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTestimonial = async (req, res) => {
  try {
    const { name, location, rating, text, product, verified, avatar, reviewId } = req.body;
    
    let testimonialData = {
      name,
      location,
      rating,
      text,
      product,
      verified,
      avatar
    };
    
    if (reviewId) {
      const review = await Review.findById(reviewId);
      if (!review) {
        return res.status(404).json({ success: false, message: 'Review not found' });
      }
      
      testimonialData = {
        ...testimonialData,
        name: review.userName,
        rating: review.rating,
        text: review.comment,
        product: review.productName,
        isCustom: false,
        review: reviewId
      };
    }
    
    const testimonial = new Testimonial(testimonialData);
    await testimonial.save();
    
    res.status(201).json({ success: true, data: testimonial });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const testimonial = await Testimonial.findByIdAndUpdate(id, updates, { new: true });
    if (!testimonial) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }
    
    res.json({ success: true, data: testimonial });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const testimonial = await Testimonial.findByIdAndDelete(id);
    
    if (!testimonial) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }
    
    res.json({ success: true, message: 'Testimonial deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Watch and Shop
exports.getWatchAndShopItems = async (req, res) => {
  try {
    const items = await WatchAndShop.find({ isActive: true })
      .populate('product', 'title price images sku');
      
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createWatchAndShopItem = async (req, res) => {
  try {
    const { productId, videoUrl, videoTitle } = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const item = new WatchAndShop({
      product: productId,
      videoUrl,
      videoTitle
    });
    
    await item.save();
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateWatchAndShopItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const item = await WatchAndShop.findByIdAndUpdate(id, updates, { new: true })
      .populate('product', 'title price images sku');
      
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteWatchAndShopItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await WatchAndShop.findByIdAndDelete(id);
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};