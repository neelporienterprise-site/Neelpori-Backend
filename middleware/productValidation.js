const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

const productValidation = {
  // Validation for creating a new product
  create: [
    body('title')
      .notEmpty()
      .withMessage('Product title is required')
      .isLength({ min: 2, max: 200 })
      .withMessage('Title must be between 2 and 200 characters')
      .trim(),

    body('description')
      // .notEmpty()
      .withMessage('Product description is required')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Description must be between 10 and 5000 characters')
      .trim(),

    body('shortDescription')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Short description cannot exceed 500 characters')
      .trim(),

    body('category')
      // .notEmpty()
      .withMessage('Category is required')
      .isMongoId()
      .withMessage('Invalid category ID'),

    body('sku')
      .optional()
      .isLength({ min: 3, max: 50 })
      .withMessage('SKU must be between 3 and 50 characters')
      .matches(/^[A-Z0-9-_]+$/)
      .withMessage('SKU can only contain uppercase letters, numbers, hyphens, and underscores'),

    body('price.original')
      .notEmpty()
      .withMessage('Original price is required')
      .isFloat({ min: 0 })
      .withMessage('Original price must be a positive number'),

    body('price.selling')
      .notEmpty()
      .withMessage('Selling price is required')
      .isFloat({ min: 0 })
      .withMessage('Selling price must be a positive number'),

    body('price.currency')
      .optional()
      .isIn(['INR', 'USD', 'EUR', 'GBP'])
      .withMessage('Invalid currency'),

    body('discount.type')
      .optional()
      .isIn(['percentage', 'fixed'])
      .withMessage('Discount type must be percentage or fixed'),

    body('discount.value')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Discount value must be a positive number'),

    body('discount.startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),

    body('discount.endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format')
      .custom((endDate, { req }) => {
        if (req.body.discount?.startDate && new Date(endDate) <= new Date(req.body.discount.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),

    body('stock.quantity')
      .notEmpty()
      .withMessage('Stock quantity is required')
      .isInt({ min: 0 })
      .withMessage('Stock quantity must be a non-negative integer'),

    body('stock.lowStockThreshold')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Low stock threshold must be a non-negative integer'),

    body('stock.trackInventory')
      .optional()
      .isBoolean()
      .withMessage('Track inventory must be a boolean'),

    body('specifications')
      .optional()
      .isObject()
      .withMessage('Specifications must be an object'),

    body('seo.metaTitle')
      .optional()
      .isLength({ max: 60 })
      .withMessage('Meta title cannot exceed 60 characters'),

    body('seo.metaDescription')
      .optional()
      .isLength({ max: 160 })
      .withMessage('Meta description cannot exceed 160 characters'),

    body('seo.keywords')
      .optional()
      .isArray()
      .withMessage('SEO keywords must be an array'),

    body('status')
      .optional()
      .isIn(['draft', 'active', 'inactive', 'discontinued'])
      .withMessage('Invalid status'),

    body('visibility')
      .optional()
      .isIn(['public', 'private', 'hidden'])
      .withMessage('Invalid visibility'),

    body('isFeatured')
      .optional()
      .isBoolean()
      .withMessage('isFeatured must be a boolean'),

    body('isTrending')
      .optional()
      .isBoolean()
      .withMessage('isTrending must be a boolean'),

    body('shipping.weight')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Weight must be a positive number'),

    body('shipping.dimensions.length')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Length must be a positive number'),

    body('shipping.dimensions.width')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Width must be a positive number'),

    body('shipping.dimensions.height')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Height must be a positive number'),

    body('shipping.dimensions.unit')
      .optional()
      .isIn(['cm', 'inch'])
      .withMessage('Dimension unit must be cm or inch'),

    body('shipping.freeShipping')
      .optional()
      .isBoolean()
      .withMessage('Free shipping must be a boolean'),

    body('shipping.shippingClass')
      .optional()
      .isIn(['standard', 'express', 'overnight'])
      .withMessage('Invalid shipping class'),

    // Custom validation for price logic
    body('price.selling')
      .custom((sellingPrice, { req }) => {
        const originalPrice = req.body.price?.original;
        if (originalPrice && sellingPrice > originalPrice) {
          throw new Error('Selling price cannot be higher than original price');
        }
        return true;
      }),

    // Custom validation for discount logic
    body('discount.value')
      .custom((discountValue, { req }) => {
        const discountType = req.body.discount?.type;
        const originalPrice = req.body.price?.original;
        
        if (discountValue && discountType === 'percentage' && discountValue > 100) {
          throw new Error('Percentage discount cannot exceed 100%');
        }
        
        if (discountValue && discountType === 'fixed' && originalPrice && discountValue >= originalPrice) {
          throw new Error('Fixed discount cannot be equal to or greater than original price');
        }
        
        return true;
      })
  ],

  // Validation for updating a product
  update: [
    param('id')
      .isMongoId()
      .withMessage('Invalid product ID'),

    body('title')
      .optional()
      .isLength({ min: 2, max: 200 })
      .withMessage('Title must be between 2 and 200 characters')
      .trim(),

    body('description')
      .optional()
      .isLength({ min: 10, max: 5000 })
      .withMessage('Description must be between 10 and 5000 characters')
      .trim(),

    body('shortDescription')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Short description cannot exceed 500 characters')
      .trim(),

    body('category')
      .optional()
      .isMongoId()
      .withMessage('Invalid category ID'),

    body('subCategories')
      .optional()
      .isArray()
      .withMessage('Sub categories must be an array'),

    body('subCategories.*')
      .optional()
      .isMongoId()
      .withMessage('Invalid sub category ID'),

    body('brand')
      .optional()
      .isMongoId()
      .withMessage('Invalid brand ID'),

    body('sku')
      .optional()
      .isLength({ min: 3, max: 50 })
      .withMessage('SKU must be between 3 and 50 characters')
      .matches(/^[A-Z0-9-_]+$/)
      .withMessage('SKU can only contain uppercase letters, numbers, hyphens, and underscores'),

    body('price.original')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Original price must be a positive number'),

    body('price.selling')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Selling price must be a positive number'),

    body('price.currency')
      .optional()
      .isIn(['INR', 'USD', 'EUR', 'GBP'])
      .withMessage('Invalid currency'),

    body('stock.quantity')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock quantity must be a non-negative integer'),

    body('status')
      .optional()
      .isIn(['draft', 'active', 'inactive', 'discontinued'])
      .withMessage('Invalid status'),

    body('visibility')
      .optional()
      .isIn(['public', 'private', 'hidden'])
      .withMessage('Invalid visibility'),

    body('deleteImages')
      .optional()
      .custom((value) => {
        if (Array.isArray(value)) {
          return value.every(id => mongoose.Types.ObjectId.isValid(id));
        }
        return mongoose.Types.ObjectId.isValid(value);
      })
      .withMessage('Invalid image ID format'),

    body('preserveImages')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('preserveImages must be true or false')
  ],

  // Validation for bulk operations
  bulkUpdate: [
    body('productIds')
      .isArray({ min: 1 })
      .withMessage('Product IDs array is required and must not be empty'),

    body('productIds.*')
      .isMongoId()
      .withMessage('Invalid product ID'),

    body('operation')
      .isIn(['updateStatus', 'updatePrices', 'delete'])
      .withMessage('Invalid operation'),

    body('updateData')
      .isObject()
      .withMessage('Update data must be an object'),

    // Conditional validation based on operation
    body('updateData.status')
      .if(body('operation').equals('updateStatus'))
      .isIn(['draft', 'active', 'inactive', 'discontinued'])
      .withMessage('Invalid status'),

    body('updateData.priceOperation')
      .if(body('operation').equals('updatePrices'))
      .isIn(['percentage', 'fixed'])
      .withMessage('Price operation must be percentage or fixed'),

    body('updateData.percentage')
      .if(body('updateData.priceOperation').equals('percentage'))
      .isFloat({ min: -100, max: 1000 })
      .withMessage('Percentage must be between -100 and 1000'),

    body('updateData.amount')
      .if(body('updateData.priceOperation').equals('fixed'))
      .isFloat()
      .withMessage('Amount must be a number')
  ],

  // Validation for search
  search: [
    query('q')
      .notEmpty()
      .withMessage('Search query is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),

    query('category')
      .optional()
      .isMongoId()
      .withMessage('Invalid category ID'),

    query('brand')
      .optional()
      .isMongoId()
      .withMessage('Invalid brand ID'),

    query('minPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum price must be a positive number'),

    query('maxPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum price must be a positive number'),

    query('minRating')
      .optional()
      .isFloat({ min: 0, max: 5 })
      .withMessage('Minimum rating must be between 0 and 5'),

    query('sortBy')
      .optional()
      .isIn(['relevance', 'price_low', 'price_high', 'rating', 'newest'])
      .withMessage('Invalid sort option'),

    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    // Custom validation for price range
    query('maxPrice')
      .custom((maxPrice, { req }) => {
        const minPrice = req.query.minPrice;
        if (minPrice && maxPrice && parseFloat(maxPrice) <= parseFloat(minPrice)) {
          throw new Error('Maximum price must be greater than minimum price');
        }
        return true;
      })
  ],

  // Validation for getting products with filters
  getProducts: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    query('status')
      .optional()
      .isIn(['draft', 'active', 'inactive', 'discontinued'])
      .withMessage('Invalid status'),

    query('category')
      .optional()
      .isMongoId()
      .withMessage('Invalid category ID'),

    query('brand')
      .optional()
      .isMongoId()
      .withMessage('Invalid brand ID'),

    query('minPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum price must be a positive number'),

    query('maxPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum price must be a positive number'),

    query('inStock')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('inStock must be true or false'),

    query('featured')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('featured must be true or false'),

    query('search')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),

    query('sort')
      .optional()
      .matches(/^(-?[a-zA-Z_]+\.?[a-zA-Z_]*,?\s*)+$/)
      .withMessage('Invalid sort format')
  ]
};

const stockValidation = {
  // Validation for updating stock
  update: [
    param('id')
      .isMongoId()
      .withMessage('Invalid product ID'),

    body('quantity')
      .notEmpty()
      .withMessage('Quantity is required')
      .isInt({ min: 0 })
      .withMessage('Quantity must be a non-negative integer'),

    body('operation')
      .optional()
      .isIn(['set', 'add', 'subtract'])
      .withMessage('Operation must be set, add, or subtract'),

    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Reason cannot exceed 500 characters')
      .trim(),

    // Custom validation for subtract operation
    body('operation')
      .custom((operation, { req }) => {
        if (operation === 'subtract' && !req.body.reason) {
          throw new Error('Reason is required when subtracting stock');
        }
        return true;
      })
  ]
};

module.exports = {
  productValidation,
  stockValidation
};