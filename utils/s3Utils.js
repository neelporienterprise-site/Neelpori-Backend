require('dotenv').config()
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'ap-south-1'
});

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4'
});

// S3 configuration
const S3_CONFIG = {
  bucket: process.env.AWS_BUCKET_NAME,
  region: process.env.AWS_REGION || 'us-east-1',
  folders: {
    products: 'products',
    categories: 'categories',
    brands: 'brands',
    users: 'users',
    temp: 'temp'
  },
  allowedMimeTypes: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'text/plain',
    'application/json'
  ],
  maxFileSize: 5 * 1024 * 1024, // 5MB
  cdnUrl: process.env.AWS_CLOUDFRONT_URL || null
};

/**
 * Generate a unique file key for S3
 * @param {string} originalName - Original filename
 * @param {string} folder - Folder name (products, categories, etc.)
 * @param {string} prefix - Optional prefix
 * @returns {string} - Generated S3 key
 */
const generateFileKey = (originalName, folder = 'temp', prefix = '') => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const uuid = uuidv4();
  const timestamp = Date.now();
  
  const fileName = prefix 
    ? `${prefix}-${sanitizedBaseName}-${timestamp}-${uuid}${ext}`
    : `${sanitizedBaseName}-${timestamp}-${uuid}${ext}`;
  
  return `${S3_CONFIG.folders[folder] || folder}/${fileName}`;
};

/**
 * Upload file to S3
 * @param {Object} file - File object from multer
 * @param {string} folder - S3 folder name
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - S3 upload result
 */
const uploadToS3 = async (file, folder = 'temp', options = {}) => {
  try {
    // Validate file
    if (!file || !file.buffer) {
      throw new Error('Invalid file: File buffer is required');
    }
    
    if (!S3_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      throw new Error(`Invalid file type: ${file.mimetype} is not allowed`);
    }
    
    if (file.size > S3_CONFIG.maxFileSize) {
      throw new Error(`File size too large: Maximum size is ${S3_CONFIG.maxFileSize / (1024 * 1024)}MB`);
    }
    
    // Generate unique file key
    const key = generateFileKey(
      file.originalname || file.uniqueName || 'unnamed',
      folder,
      options.prefix
    );
    
    // Prepare upload parameters
    const uploadParams = {
      Bucket: S3_CONFIG.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: 'inline',
      CacheControl: 'max-age=31536000', // 1 year cache
      ...options.s3Params
    };
  
    
    // Add metadata
    uploadParams.Metadata = {
      originalName: file.originalname || 'unnamed',
      uploadedAt: new Date().toISOString(),
      uploadedBy: options.uploadedBy || 'system',
      folder: folder,
      ...options.metadata
    };
    
    console.log(`Uploading file to S3: ${key}`);
    
    // Upload to S3
    const result = await s3.upload(uploadParams).promise();
    
    // Prepare response
    const response = {
      Key: result.Key,
      Location: S3_CONFIG.cdnUrl ? result.Location.replace(
        `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com`,
        S3_CONFIG.cdnUrl
      ) : result.Location,
      originalLocation: result.Location,
      Bucket: result.Bucket,
      ETag: result.ETag,
      size: file.size,
      mimetype: file.mimetype,
      originalName: file.originalname,
      uploadedAt: new Date()
    };
    
    console.log(`File uploaded successfully: ${result.Key}`);
    return response;
    
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Upload multiple files to S3
 * @param {Array} files - Array of file objects from multer
 * @param {string} folder - S3 folder name
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} - Array of S3 upload results
 */
const uploadMultipleToS3 = async (files, folder = 'temp', options = {}) => {
  try {
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('Invalid files: Array of files is required');
    }
    
    console.log(`Uploading ${files.length} files to S3`);
    
    // Upload all files concurrently
    const uploadPromises = files.map((file, index) => {
      const fileOptions = {
        ...options,
        prefix: options.prefix ? `${options.prefix}-${index + 1}` : undefined
      };
      return uploadToS3(file, folder, fileOptions);
    });
    
    const results = await Promise.all(uploadPromises);
    console.log(`Successfully uploaded ${results.length} files to S3`);
    
    return results;
    
  } catch (error) {
    console.error('Multiple S3 upload error:', error);
    throw new Error(`Failed to upload files to S3: ${error.message}`);
  }
};

/**
 * Delete file from S3
 * @param {string} key - S3 object key
 * @returns {Promise<Object>} - S3 delete result
 */
const deleteFromS3 = async (key) => {
  try {
    if (!key) {
      throw new Error('S3 key is required for deletion');
    }
    
    console.log(`Deleting file from S3: ${key}`);
    
    const deleteParams = {
      Bucket: S3_CONFIG.bucket,
      Key: key
    };
    
    const result = await s3.deleteObject(deleteParams).promise();
    console.log(`File deleted successfully: ${key}`);
    
    return result;
    
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

module.exports={
    deleteFromS3,
    uploadToS3
}