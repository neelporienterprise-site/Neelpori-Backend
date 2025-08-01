const mongoose = require('mongoose');

// Remove the model from cache if it exists
if (mongoose.connection.models['Category']) {
  delete mongoose.connection.models['Category'];
}

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters'],
    index: true // Matches name_1 index
  },
  
  slug: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true // Matches slug_1 index
  },

  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  image: {
    url: String,
    alt: String,
    s3Key: String
  },

  // Hierarchical category support (to match existing indexes)
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
    index: true // Matches parent_1 index
  },
  
  path: {
    type: String,
    index: true // Matches path_1 index
  },
  
  level: {
    type: Number,
    default: 0,
    min: 0
  },
  
  sortOrder: {
    type: Number,
    default: 0,
    index: true // Matches sortOrder_1 index
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    index: true // Matches status_1 index
  },
  
  isFeatured: {
    type: Boolean,
    default: false,
    index: true // Matches isFeatured_1 index
  },
  
  showOnHomepage: {
    type: Boolean,
    default: false
  },

  // Category statistics
  stats: {
    productCount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalSales: {
      type: Number,
      default: 0,
      min: 0
    },
    views: {
      type: Number,
      default: 0
    }
  },
  
  // Admin tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes (matching existing ones)
categorySchema.index({ parent: 1, status: 1 }); // Matches parent_1_status_1
categorySchema.index({ level: 1, sortOrder: 1 }); // Matches level_1_sortOrder_1

// Text search index (recreate if you want search functionality)
categorySchema.index({ 
  name: 'text', 
  description: 'text' 
}, {
  weights: { name: 1, description: 1 },
  name: 'name_text_description_text'
});

// Pre-save middleware for slug generation
categorySchema.pre('save', function(next) {
  if (!this.slug || this.isModified('name')) {
    const baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
      
    this.slug = `${baseSlug}-${Date.now().toString(36).slice(-6)}`;
  }
  next();
});

// Pre-save middleware for path generation (hierarchical categories)
categorySchema.pre('save', async function(next) {
  if (this.parent) {
    try {
      const parentCategory = await this.constructor.findById(this.parent);
      if (parentCategory) {
        this.level = parentCategory.level + 1;
        this.path = parentCategory.path ? `${parentCategory.path}/${this.slug}` : this.slug;
      }
    } catch (error) {
      console.error('Error setting category path:', error);
    }
  } else {
    this.level = 0;
    this.path = this.slug;
  }
  next();
});

// Virtual for children (if using hierarchical structure)
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

module.exports = mongoose.model('Category', categorySchema);