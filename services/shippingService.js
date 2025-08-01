const Product = require('../models/Product');

/**
 * Calculate shipping cost based on cart items
 */
exports.calculateShipping = async (cartItems) => {
  try {
    // In a real implementation, this would call a shipping API
    // For now, we'll use a simple calculation
    
    // Get product details for weight/dimensions
    const productIds = cartItems.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('shipping.weight shipping.dimensions shipping.freeShipping');
    
    // Check if any product has free shipping
    const hasFreeShipping = products.some(p => p.shipping.freeShipping);
    if (hasFreeShipping) return 0;
    
    // Simple shipping calculation (replace with real logic)
    const totalWeight = products.reduce((sum, product) => {
      return sum + (product.shipping.weight || 0.5) * 
        cartItems.find(i => i.product.equals(product._id)).quantity;
    }, 0);
    
    // Basic shipping rates (replace with your actual rates)
    if (totalWeight <= 0.5) return 40; // 40 INR for <= 500g
    if (totalWeight <= 1) return 60;    // 60 INR for <= 1kg
    if (totalWeight <= 2) return 80;    // 80 INR for <= 2kg
    return 80 + Math.ceil((totalWeight - 2) / 0.5) * 20; // 20 INR per additional 500g
    
  } catch (error) {
    console.error('Shipping calculation error:', error);
    return 0; // Fallback to free shipping if calculation fails
  }
};