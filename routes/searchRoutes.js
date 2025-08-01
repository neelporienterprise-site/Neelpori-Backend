const express = require('express');
const router = express.Router();
const Product = require('../models/Product'); // Adjust path as needed

// Public search endpoint
router.get('/search', async (req, res) => {
  try {
    const {
      q, // search query
      category,
      brand,
      minPrice,
      maxPrice,
      sortBy = 'relevance',
      page = 1,
      limit = 20,
      inStock,
      featured,
      trending
    } = req.query;

    // Build the search query
    let searchQuery = {
      status: 'active',
      visibility: 'public'
    };

    // Text search across title, description, and brand
    if (q && q.trim()) {
      searchQuery.$or = [
        { title: { $regex: q.trim(), $options: 'i' } },
        { description: { $regex: q.trim(), $options: 'i' } },
        { shortDescription: { $regex: q.trim(), $options: 'i' } },
        { brand: { $regex: q.trim(), $options: 'i' } },
        { 'seo.keywords': { $in: [new RegExp(q.trim(), 'i')] } }
      ];
    }

    // Category filter
    if (category) {
      searchQuery.category = category;
    }

    // Brand filter
    if (brand) {
      searchQuery.brand = { $regex: brand, $options: 'i' };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      searchQuery['price.selling'] = {};
      if (minPrice) searchQuery['price.selling'].$gte = parseFloat(minPrice);
      if (maxPrice) searchQuery['price.selling'].$lte = parseFloat(maxPrice);
    }

    // Stock filter
    if (inStock === 'true') {
      searchQuery['stock.quantity'] = { $gt: 0 };
    } else if (inStock === 'false') {
      searchQuery['stock.quantity'] = { $lte: 0 };
    }

    // Featured filter
    if (featured === 'true') {
      searchQuery.isFeatured = true;
    }

    // Trending filter
    if (trending === 'true') {
      searchQuery.isTrending = true;
    }

    // Build sort options
    let sortOptions = {};
    switch (sortBy) {
      case 'price_low':
        sortOptions = { 'price.selling': 1 };
        break;
      case 'price_high':
        sortOptions = { 'price.selling': -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'rating':
        sortOptions = { 'ratings.average': -1, 'ratings.count': -1 };
        break;
      case 'popular':
        sortOptions = { 'analytics.purchases': -1, 'analytics.views': -1 };
        break;
      case 'name_asc':
        sortOptions = { title: 1 };
        break;
      case 'name_desc':
        sortOptions = { title: -1 };
        break;
      default: // relevance
        if (q && q.trim()) {
          // For text search, sort by relevance (MongoDB text search score)
          sortOptions = { score: { $meta: 'textScore' } };
        } else {
          // Default sort when no search query
          sortOptions = { isFeatured: -1, createdAt: -1 };
        }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // Max 50 items per page
    const skip = (pageNum - 1) * limitNum;

    // Execute search query
    let query;
    
    // Handle text search with proper score metadata
    if (q && q.trim() && sortBy === 'relevance') {
      // For text search, we need to modify the query structure
      const textSearchQuery = {
        ...searchQuery,
        $text: { $search: q.trim() }
      };
      
      // Remove the $or clause when using $text search to avoid conflicts
      if (textSearchQuery.$or) {
        delete textSearchQuery.$or;
      }
      
      query = Product.find(textSearchQuery, { score: { $meta: 'textScore' } })
        .populate('category', 'name slug')
        .select('-auditLog -createdBy -updatedBy -__v')
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limitNum);
    } else {
      // Regular query without text search
      query = Product.find(searchQuery)
        .populate('category', 'name slug')
        .select('-auditLog -createdBy -updatedBy -__v')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum);
    }

    const products = await query;

    // Get total count for pagination (use separate query for count)
    let countQuery = { ...searchQuery };
    
    // For text search count, we need to handle it differently
    if (q && q.trim() && sortBy === 'relevance') {
      countQuery = {
        ...searchQuery,
        $text: { $search: q.trim() }
      };
      // Remove $or clause for text search
      if (countQuery.$or) {
        delete countQuery.$or;
      }
    }
    
    const totalCount = await Product.countDocuments(countQuery);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Increment view count for found products (optional - you might want to do this on product detail view instead)
    if (products.length > 0) {
      await Product.updateMany(
        { _id: { $in: products.map(p => p._id) } },
        { $inc: { 'analytics.views': 1 } }
      );
    }

    // Build response
    const response = {
      success: true,
      data: {
        products: products.map(product => ({
          _id: product._id,
          title: product.title,
          slug: product.slug,
          brand: product.brand,
          category: product.category,
          shortDescription: product.shortDescription,
          images: product.images.filter(img => img.isPrimary).slice(0, 1), // Only primary image
          price: {
            original: product.price.original,
            selling: product.price.selling,
            currency: product.price.currency
          },
          discount: product.discount.isActive ? {
            type: product.discount.type,
            value: product.discount.value,
            isActive: product.discount.isActive
          } : null,
          ratings: product.ratings,
          stockStatus: product.stockStatus,
          availableStock: product.availableStock,
          isFeatured: product.isFeatured,
          isTrending: product.isTrending,
          finalPrice: product.finalPrice,
          discountAmount: product.discountAmount
        }))
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      },
      filters: {
        query: q || '',
        category,
        brand,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        sortBy,
        inStock: inStock === 'true' ? true : inStock === 'false' ? false : null,
        featured: featured === 'true' ? true : null,
        trending: trending === 'true' ? true : null
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Search API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error occurred while searching products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get search suggestions (autocomplete)
router.get('/suggestions', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query must be at least 2 characters long'
      });
    }

    const suggestions = await Product.aggregate([
      {
        $match: {
          status: 'active',
          visibility: 'public',
          $or: [
            { title: { $regex: q.trim(), $options: 'i' } },
            { brand: { $regex: q.trim(), $options: 'i' } }
          ]
        }
      },
      {
        $project: {
          title: 1,
          brand: 1,
          _id: 1
        }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Extract unique suggestions
    const titleSuggestions = suggestions.map(s => s.title);
    const brandSuggestions = [...new Set(suggestions.map(s => s.brand).filter(Boolean))];

    res.status(200).json({
      success: true,
      data: {
        products: titleSuggestions,
        brands: brandSuggestions
      }
    });

  } catch (error) {
    console.error('Suggestions API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error occurred while fetching suggestions'
    });
  }
});

module.exports = router;