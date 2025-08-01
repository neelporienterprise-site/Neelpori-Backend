const Product = require('../models/Product');

/**
 * Validate cart items before checkout
 */
exports.validateCartItems = async (cartItems) => {
  const errors = [];
  
  // Get all product IDs from cart
  const productIds = cartItems.map(item => item.product);
  
  // Fetch all products at once for efficiency
  const products = await Product.find({ _id: { $in: productIds } });
  
  // Create a map for quick lookup
  const productMap = new Map();
  products.forEach(product => productMap.set(product._id.toString(), product));
  
  // Validate each cart item
  for (const item of cartItems) {
    const product = productMap.get(item.product.toString());
    
    if (!product) {
      errors.push({
        product: item.product,
        message: 'Product not found',
        action: 'remove'
      });
      continue;
    }
    
    if (product.status !== 'active' || product.visibility !== 'public') {
      errors.push({
        product: item.product,
        message: 'Product is no longer available',
        action: 'remove'
      });
      continue;
    }
    
    if (product.stock.trackInventory && product.availableStock < item.quantity) {
      errors.push({
        product: item.product,
        message: 'Insufficient stock',
        availableStock: product.availableStock,
        action: 'update'
      });
    }
    
    // Add more validations as needed (price changes, etc.)
  }
  
  return errors;
};