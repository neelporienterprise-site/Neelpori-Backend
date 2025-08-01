const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Product title is required"],
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      index: true,
    },

    category: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Category',
  required: [true, 'Product category is required'],
  index: true
  },

    description: {
      type: String,
      // required: [true, "Product description is required"],
      trim: true,
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: [500, "Short description cannot exceed 500 characters"],
    },

    sku: {
      type: String,
      unique: true,
      default: function () {
        return `SKU-${this.title.substring(0, 3).toUpperCase()}-${Date.now()
          .toString(36)
          .slice(-5)}`;
      },
    },

    images: [
      {
        url: {
          type: String,
          required: true,
        },
        alt: {
          type: String,
          default: "",
        },
        isPrimary: {
          type: Boolean,
          default: false,
        },
        s3Key: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    //   subCategories: [{
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'SubCategory',
    //     index: true
    //   }],

    brand:{
      type: String,
    },
    price: {
      original: {
        type: Number,
        // required: [true, "Original price is required"],
        min: [0, "Price cannot be negative"],
      },
      selling: {
        type: Number,
        // required: [true, "Selling price is required"],
        min: [0, "Price cannot be negative"],
      },
      currency: {
        type: String,
        default: "INR",
        enum: ["INR", "USD", "EUR", "GBP"],
      },
    },

    discount: {
      type: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage",
        set: (v) => v?.trim().toLowerCase(), // Auto-clean values
      },
      value: {
        type: Number,
        min: 0,
        default: 0,
      },
      startDate: Date,
      endDate: Date,
      isActive: {
        type: Boolean,
        default: false,
      },
    },

    stock: {
      quantity: {
        type: Number,
        required: [true, "Stock quantity is required"],
        min: [0, "Stock cannot be negative"],
        default: 0,
      },
      reserved: {
        type: Number,
        default: 0,
        min: 0,
      },
      lowStockThreshold: {
        type: Number,
        default: 10,
        min: 0,
      },
      trackInventory: {
        type: Boolean,
        default: true,
      },
    },

    specifications: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // SEO fields
    seo: {
      metaTitle: {
        type: String,
        // maxlength: [60, "Meta title cannot exceed 60 characters"],
      },
      metaDescription: {
        type: String,
        // maxlength: [160, "Meta description cannot exceed 160 characters"],
      },
      keywords: [String],
    },

    // Product status and visibility
    status: {
      type: String,
      enum: ["active", "inactive", "discontinued"],
      default: "active",
      set: (v) => v?.trim().toLowerCase(), // Auto-clean values
    },

    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
      set: (v) => v?.trim().toLowerCase(), // Auto-clean values
    },

    // Featured and trending
    isFeatured: {
      type: Boolean,
      default: false,
    },

    isTrending: {
      type: Boolean,
      default: false,
    },

    // Shipping information
    shipping: {
      weight: {
        type: Number,
        min: 0,
      },
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
        unit: {
          type: String,
          enum: ["cm", "inch"],
          set: (v) => v?.trim().toLowerCase(), // Auto-clean values
          default: "cm",
        },
      },
      freeShipping: {
        type: Boolean,
        default: false,
      },
      shippingClass: {
        type: String,
        enum: ["standard", "express", "overnight"],
        default: "standard",
        set: (v) => v?.trim().toLowerCase(), // Auto-clean values
      },
    },

    // Ratings and reviews
    ratings: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
        min: 0,
      },
      distribution: {
        5: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        1: { type: Number, default: 0 },
      },
    },

    // Analytics
    analytics: {
      views: {
        type: Number,
        default: 0,
      },
      purchases: {
        type: Number,
        default: 0,
      },
      wishlistCount: {
        type: Number,
        default: 0,
      },
      lastViewed: Date,
    },

    // Admin tracking
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Audit trail
    auditLog: [
      {
        action: {
          type: String,
          enum: [
            "created",
            "updated",
            "deleted",
            "status_changed",
            "price_changed",
            "stock_updated",
          ],
          required: true,
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Admin",
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        changes: mongoose.Schema.Types.Mixed,
        notes: String,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for available stock
productSchema.virtual("availableStock").get(function () {
  return this.stock.quantity - this.stock.reserved;
});

productSchema.pre("save", function (next) {
  if (!this.slug || this.isModified("title")) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .concat(`-${Date.now().toString(36).slice(-4)}`); // Add unique suffix
  }
  next();
});

productSchema.pre("save", function (next) {
  if (!this.sku) {
    this.sku = `SKU-${this.title.substring(0, 3).toUpperCase()}-${Date.now()
      .toString(36)
      .slice(-5)}`;
  }
  next();
});

// Virtual for discount amount
productSchema.virtual("discountAmount").get(function () {
  if (!this.discount.isActive || !this.discount.value) return 0;

  if (this.discount.type === "percentage") {
    return (this.price.original * this.discount.value) / 100;
  }
  return this.discount.value;
});

// Virtual for final price after discount
productSchema.virtual("finalPrice").get(function () {
  const discountAmount = this.discountAmount;
  return Math.max(0, this.price.selling - discountAmount);
});

// Virtual for stock status
productSchema.virtual("stockStatus").get(function () {
  const available = this.availableStock;

  if (available <= 0) return "out_of_stock";
  if (available <= this.stock.lowStockThreshold) return "low_stock";
  return "in_stock";
});

// Pre-save middleware to generate slug
productSchema.pre("save", function (next) {
  if (this.isModified("title") || this.isNew) {
    this.slug = this.title
      // .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

// Pre-save middleware to calculate selling price if discount is active
productSchema.pre("save", function (next) {
  if (this.discount.isActive && this.discount.value > 0) {
    if (this.discount.type === "percentage") {
      const discountAmount = (this.price.original * this.discount.value) / 100;
      this.price.selling = Math.max(0, this.price.original - discountAmount);
    } else {
      this.price.selling = Math.max(
        0,
        this.price.original - this.discount.value
      );
    }
  }
  next();
});

// Static method to find products with filters
productSchema.statics.findWithFilters = function (filters = {}) {
  const query = this.find();

  // Status filter
  if (filters.status) {
    query.where("status").equals(filters.status);
  } else {
    query.where("status").ne("deleted");
  }

  // Brand filter
  if (filters.brand) {
    query.where("brand").equals(filters.brand);
  }

  // Price range filter
  if (filters.minPrice || filters.maxPrice) {
    const priceFilter = {};
    if (filters.minPrice) priceFilter.$gte = filters.minPrice;
    if (filters.maxPrice) priceFilter.$lte = filters.maxPrice;
    query.where("price.selling", priceFilter);
  }

  // Stock filter
  if (filters.inStock === true) {
    query.where("stock.quantity").gt(0);
  } else if (filters.inStock === false) {
    query.where("stock.quantity").lte(0);
  }

  // Featured filter
  if (filters.featured === true) {
    query.where("isFeatured").equals(true);
  }

  // Search filter
  if (filters.search) {
    query.where({
      $text: { $search: filters.search },
    });
  }

  // Sorting
  if (filters.sort) {
    query.sort(filters.sort);
  } else {
    query.sort({ createdAt: -1 });
  }

  return query;
};

// Instance method to update stock
productSchema.methods.updateStock = function (
  quantity,
  operation = "set",
  reason = ""
) {
  const oldQuantity = this.stock.quantity;

  switch (operation) {
    case "add":
      this.stock.quantity += quantity;
      break;
    case "subtract":
      this.stock.quantity = Math.max(0, this.stock.quantity - quantity);
      break;
    case "set":
      this.stock.quantity = Math.max(0, quantity);
      break;
  }

  // Add to audit log
  this.auditLog.push({
    action: "stock_updated",
    performedBy: this.updatedBy,
    changes: {
      oldQuantity,
      newQuantity: this.stock.quantity,
      operation,
      reason,
    },
  });

  return this.save();
};

// Instance method to add audit log entry
productSchema.methods.addAuditLog = function (
  action,
  performedBy,
  changes = {},
  notes = ""
) {
  this.auditLog.push({
    action,
    performedBy,
    changes,
    notes,
  });
};


productSchema.index({ 'price.selling': 1 });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ status: 1, visibility: 1 });
productSchema.index({ isFeatured: 1 });
productSchema.index({ isTrending: 1 });
productSchema.index({ 'ratings.average': -1 });
productSchema.index({ 'stock.quantity': 1 });
productSchema.index({ createdAt: -1 });

// Compound indexes for common queries
productSchema.index({ status: 1, visibility: 1, category: 1 });
productSchema.index({ status: 1, visibility: 1, isFeatured: 1 });
productSchema.index({ status: 1, visibility: 1, 'price.selling': 1 });

module.exports = mongoose.model("Product", productSchema);
