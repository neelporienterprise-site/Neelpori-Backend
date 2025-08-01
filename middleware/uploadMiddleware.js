const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, JPG, PNG, GIF, and WebP files are allowed.'));
  }
};

// Configure multer for memory storage (since we're uploading to S3)
const storage = multer.memoryStorage();

// Create multer upload instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 10 // Maximum 10 files
  },
  fileFilter: fileFilter
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size too large. Maximum size is 5MB per file.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Maximum 10 files allowed.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field.';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in multipart form.';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long.';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long.';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields.';
        break;
      default:
        message = error.message;
    }
    
    return res.status(400).json({
      success: false,
      message: message,
      error: {
        code: error.code,
        field: error.field
      }
    });
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

// Enhanced upload middleware with additional processing
const uploadMiddleware = {
  // Single file upload
  single: (fieldName) => {
    return [
      upload.single(fieldName),
      handleMulterError,
      (req, res, next) => {
        if (req.file) {
          // Add unique identifier to prevent filename conflicts
          req.file.uniqueName = `${uuidv4()}-${req.file.originalname}`;
          
          // Add file metadata
          req.file.uploadedAt = new Date();
          req.file.uploadedBy = req.admin?._id;
        }
        next();
      }
    ];
  },

  // Multiple files upload
  array: (fieldName, maxCount = 10) => {
    return [
      upload.array(fieldName, maxCount),
      handleMulterError,
      (req, res, next) => {
        if (req.files && req.files.length > 0) {
          req.files = req.files.map(file => ({
            ...file,
            uniqueName: `${uuidv4()}-${file.originalname}`,
            uploadedAt: new Date(),
            uploadedBy: req.admin?._id
          }));
        }
        next();
      }
    ];
  },

  // Multiple fields with different names
  fields: (fields) => {
    return [
      upload.fields(fields),
      handleMulterError,
      (req, res, next) => {
        if (req.files) {
          // Process each field
          Object.keys(req.files).forEach(fieldName => {
            req.files[fieldName] = req.files[fieldName].map(file => ({
              ...file,
              uniqueName: `${uuidv4()}-${file.originalname}`,
              uploadedAt: new Date(),
              uploadedBy: req.admin?._id
            }));
          });
        }
        next();
      }
    ];
  },

  // No file upload (for form data only)
  none: () => {
    return [
      upload.none(),
      handleMulterError
    ];
  },

  // Any files upload (not recommended for production)
  any: () => {
    return [
      upload.any(),
      handleMulterError,
      (req, res, next) => {
        if (req.files && req.files.length > 0) {
          req.files = req.files.map(file => ({
            ...file,
            uniqueName: `${uuidv4()}-${file.originalname}`,
            uploadedAt: new Date(),
            uploadedBy: req.admin?._id
          }));
        }
        next();
      }
    ];
  }
};

// Utility functions for file validation
const validateFileSize = (maxSize) => {
  return (req, res, next) => {
    if (req.file && req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`
      });
    }
    
    if (req.files && req.files.length > 0) {
      const oversizedFile = req.files.find(file => file.size > maxSize);
      if (oversizedFile) {
        return res.status(400).json({
          success: false,
          message: `File ${oversizedFile.originalname} exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`
        });
      }
    }
    
    next();
  };
};

const validateFileCount = (maxCount) => {
  return (req, res, next) => {
    if (req.files && req.files.length > maxCount) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${maxCount} files allowed`
      });
    }
    next();
  };
};

const validateFileType = (allowedTypes) => {
  return (req, res, next) => {
    const typeRegex = new RegExp(allowedTypes.join('|'));
    
    if (req.file && !typeRegex.test(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
      });
    }
    
    if (req.files && req.files.length > 0) {
      const invalidFile = req.files.find(file => !typeRegex.test(file.mimetype));
      if (invalidFile) {
        return res.status(400).json({
          success: false,
          message: `Invalid file type for ${invalidFile.originalname}. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
    }
    
    next();
  };
};

// Image processing middleware (optional - requires sharp)
const processImages = (options = {}) => {
  return async (req, res, next) => {
    try {
      // Only process if sharp is available
      let sharp;
      try {
        sharp = require('sharp');
      } catch (error) {
        console.warn('Sharp not installed, skipping image processing');
        return next();
      }

      const {
        resize = { width: 800, height: 600, fit: 'inside' },
        format = 'jpeg',
        quality = 85
      } = options;

      if (req.file && req.file.mimetype.startsWith('image/')) {
        req.file.buffer = await sharp(req.file.buffer)
          .resize(resize.width, resize.height, { fit: resize.fit })
          .toFormat(format, { quality })
          .toBuffer();
        
        req.file.mimetype = `image/${format}`;
        req.file.originalname = req.file.originalname.replace(/\.[^/.]+$/, `.${format}`);
        req.file.uniqueName = req.file.uniqueName.replace(/\.[^/.]+$/, `.${format}`);
      }

      if (req.files && req.files.length > 0) {
        req.files = await Promise.all(
          req.files.map(async (file) => {
            if (file.mimetype.startsWith('image/')) {
              file.buffer = await sharp(file.buffer)
                .resize(resize.width, resize.height, { fit: resize.fit })
                .toFormat(format, { quality })
                .toBuffer();
              
              file.mimetype = `image/${format}`;
              file.originalname = file.originalname.replace(/\.[^/.]+$/, `.${format}`);
              file.uniqueName = file.uniqueName.replace(/\.[^/.]+$/, `.${format}`);
            }
            return file;
          })
        );
      }

      next();
    } catch (error) {
      console.error('Image processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing images',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  };
};

// Middleware to generate thumbnails
const generateThumbnails = (sizes = [{ width: 150, height: 150, suffix: 'thumb' }]) => {
  return async (req, res, next) => {
    try {
      let sharp;
      try {
        sharp = require('sharp');
      } catch (error) {
        console.warn('Sharp not installed, skipping thumbnail generation');
        return next();
      }

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          if (file.mimetype.startsWith('image/')) {
            file.thumbnails = {};
            
            for (const size of sizes) {
              const thumbnailBuffer = await sharp(file.buffer)
                .resize(size.width, size.height, { fit: 'cover' })
                .jpeg({ quality: 80 })
                .toBuffer();
              
              file.thumbnails[size.suffix] = {
                buffer: thumbnailBuffer,
                width: size.width,
                height: size.height,
                mimetype: 'image/jpeg'
              };
            }
          }
        }
      }

      next();
    } catch (error) {
      console.error('Thumbnail generation error:', error);
      next(); // Continue even if thumbnail generation fails
    }
  };
};

module.exports = {
  uploadMiddleware,
  validateFileSize,
  validateFileCount,
  validateFileType,
  processImages,
  generateThumbnails,
  handleMulterError
};