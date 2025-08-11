const mongoose = require('mongoose');
const Product = require('./Product');
const User = require('./User');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  userName: {
    type: String,
    required: true
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Indexes for better performance
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ user: 1, product: 1 }, { unique: true }); // One review per product per user

// Update product ratings when a review is saved or removed
reviewSchema.post('save', async function(doc) {
  await updateProductRatings(doc.product);
});

reviewSchema.post('remove', async function(doc) {
  await updateProductRatings(doc.product);
});

async function updateProductRatings(productId) {
  const stats = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { 
      $group: {
        _id: '$product',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
        ratingDistribution: {
          $push: {
            rating: '$rating',
            count: 1
          }
        }
      }
    }
  ]);

  if (stats.length > 0) {
    const ratingStats = {
      'ratings.average': parseFloat(stats[0].averageRating.toFixed(1)),
      'ratings.count': stats[0].reviewCount,
      'ratings.distribution': {
        5: stats[0].ratingDistribution.filter(r => r.rating === 5).length,
        4: stats[0].ratingDistribution.filter(r => r.rating === 4).length,
        3: stats[0].ratingDistribution.filter(r => r.rating === 3).length,
        2: stats[0].ratingDistribution.filter(r => r.rating === 2).length,
        1: stats[0].ratingDistribution.filter(r => r.rating === 1).length
      }
    };
    
    await Product.findByIdAndUpdate(productId, ratingStats);
  } else {
    // No approved reviews - reset ratings
    await Product.findByIdAndUpdate(productId, {
      'ratings.average': 0,
      'ratings.count': 0,
      'ratings.distribution': { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    });
  }
}

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;