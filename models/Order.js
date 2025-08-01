const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  selectedVariants: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: true });

const addressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  country: { type: String, default: 'India' },
  phone: { type: String, required: true },
  landmark: String,
  type: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'home'
  }
});

const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['cod', 'prepaid', 'wallet', 'netbanking', 'card', 'upi'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'unpaid'],
    default: 'unpaid'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  transactionId: String,
  paymentDate: Date
});

const shippingSchema = new mongoose.Schema({
  trackingId: String,
  awbNumber: String,
  courierName: String,
  status: {
    type: String,
    enum: ['processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'failed'],
    default: 'processing'
  },
  cost: {
    type: Number,
    default: 0
  },
  estimatedDelivery: Date,
  actualDelivery: Date
});

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true,
    default: function() {
      return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    }
  },
  items: [orderItemSchema],
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  payment: paymentSchema,
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  shipping: shippingSchema,
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  notes: String,
  expectedDelivery: Date,
  deliveredAt: Date,
  cancelledAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total items in order
orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Add indexes
orderSchema.index({ user: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

// Pre-save hook to set billing address same as shipping if not provided
orderSchema.pre('save', function(next) {
  if (!this.billingAddress && this.shippingAddress) {
    this.billingAddress = { ...this.shippingAddress.toObject() };
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);