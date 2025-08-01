const { validationResult } = require("express-validator");
const Product = require("../models/Product");
// const Category = require('../models/category');
// const Brand = require('../models/Brand');
const { deleteFromS3, uploadToS3 } = require("../utils/s3Utils");
const mongoose = require("mongoose");

class ProductController {
  // Create a new product
  async createProduct(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      // Clean and parse the incoming data
      const productData = {
        title: req.body.title?.trim(),
        category: req.body.category?.trim(),
        description: req.body.description?.trim(),
        shortDescription: req.body.shortDescription?.trim(),
        brand: req.body.brand?.trim(),
        price: {
          original: parseFloat(req.body.price?.original || 0),
          selling: parseFloat(req.body.price?.selling || 0),
          currency: req.body.price?.currency?.trim().toUpperCase() || "INR",
        },
        discount: {
          type: req.body.discount?.type?.trim().toLowerCase() || "percentage",
          value: parseFloat(req.body.discount?.value || 0),
          isActive:
            req.body.discount?.isActive === "true" ||
            req.body.discount?.isActive === true ||
            false,
          startDate: req.body.discount?.startDate,
          endDate: req.body.discount?.endDate,
        },
        stock: {
          quantity: parseInt(req.body.stock?.quantity || 0),
          reserved: parseInt(req.body.stock?.reserved || 0),
          lowStockThreshold: parseInt(req.body.stock?.lowStockThreshold || 10),
          trackInventory:
            req.body.stock?.trackInventory === "true" ||
            req.body.stock?.trackInventory === true ||
            true,
        },
        specifications: req.body.specifications || {},
        status: req.body.status?.trim().toLowerCase() || "active",
        visibility: req.body.visibility?.trim().toLowerCase() || "public",
        seo: {
          metaTitle: req.body.seo?.metaTitle?.trim(),
          metaDescription: req.body.seo?.metaDescription?.trim(),
          keywords: Array.isArray(req.body.seo?.keywords) 
            ? req.body.seo.keywords.map(k => k?.trim()).filter(k => k)
            : [],
        },
        createdBy: req.admin._id,
        updatedBy: req.admin._id,
      };

      if (!productData.sku) {
        // i am generating a more unique SKU
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        productData.sku = `PRD-${timestamp}-${random}`.toUpperCase();
      }

      // Handle image uploads
      if (req.files && req.files.length > 0) {
        const imageUploads = await Promise.all(
          req.files.map(async (file, index) => {
            const s3Result = await uploadToS3(file, "products");
            return {
              url: s3Result.Location,
              alt: req.body.imageAlts?.[index] || "",
              isPrimary: index === 0,
              s3Key: s3Result.Key,
            };
          })
        );
        productData.images = imageUploads;
      }

      const product = new Product(productData);
      await product.save();

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: product,
      });
    } catch (error) {
      console.error("Create product error:", error);

      // Clean up uploaded images if product creation fails
      if (req.files && req.files.length > 0) {
        try {
          await Promise.all(
            req.files.map((file) => {
              if (file.s3Key) {
                return deleteFromS3(file.s3Key);
              }
              return Promise.resolve();
            })
          );
        } catch (cleanupError) {
          console.error("Error cleaning up uploaded images:", cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        message: "Failed to create product",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Get all products with filtering, sorting, and pagination
  async getProducts(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        category,
        brand,
        minPrice,
        maxPrice,
        inStock,
        featured,
        search,
        sort = "-createdAt",
      } = req.query;

      const filters = {
        status,
        category,
        brand,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        inStock: inStock !== undefined ? inStock === "true" : undefined,
        featured: featured !== undefined ? featured === "true" : undefined,
        search,
        sort,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) delete filters[key];
      });

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build query using static method
      const query = Product.findWithFilters(filters)
        .populate([
          { path: "category", select: "name code" },
          // { path: 'brand', select: 'name code' },
          // { path: 'subCategories', select: 'name' }
        ])
        .skip(skip)
        .limit(parseInt(limit));

      const [products, totalProducts] = await Promise.all([
        query.exec(),
        Product.countDocuments(query.getFilter()),
      ]);

      const totalPages = Math.ceil(totalProducts / parseInt(limit));

      res.json({
        success: true,
        message: "Products retrieved successfully",
        data: {
          products,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalProducts,
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get products error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve products",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Get single product by ID or slug
  async getProduct(req, res) {
    try {
      const { id } = req.params;

      // Check if id is a valid ObjectId or treat as slug
      const isObjectId = mongoose.Types.ObjectId.isValid(id);
      const query = isObjectId ? { _id: id } : { slug: id };

      const product = await Product.findOne(query).populate([
        { path: "category", select: "name code description" },
        // { path: 'brand', select: 'name code description logo' },
        // { path: 'subCategories', select: 'name description' },
        { path: "createdBy", select: "name email" },
        { path: "updatedBy", select: "name email" },
      ]);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Update view count
      product.analytics.views += 1;
      product.analytics.lastViewed = new Date();
      await product.save();

      res.json({
        success: true,
        message: "Product retrieved successfully",
        data: product,
      });
    } catch (error) {
      console.error("Get product error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve product",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Update product
  async updateProduct(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const updateData = { ...req.body };

      // Get existing product
      const existingProduct = await Product.findById(id);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Store old values for audit log
      const oldValues = existingProduct.toObject();

      // Handle new image uploads
      if (req.files && req.files.length > 0) {
        const newImages = await Promise.all(
          req.files.map(async (file, index) => {
            const s3Result = await uploadToS3(file, "products");
            return {
              url: s3Result.Location,
              alt: req.body.imageAlts ? req.body.imageAlts[index] : "",
              isPrimary:
                index === 0 &&
                (!updateData.images || updateData.images.length === 0),
              s3Key: s3Result.Key,
            };
          })
        );

        // Merge with existing images if preserveImages flag is set
        if (req.body.preserveImages === "true" && existingProduct.images) {
          updateData.images = [...existingProduct.images, ...newImages];
        } else {
          // Delete old images from S3
          if (existingProduct.images && existingProduct.images.length > 0) {
            await Promise.all(
              existingProduct.images.map((img) =>
                img.s3Key ? deleteFromS3(img.s3Key) : Promise.resolve()
              )
            );
          }
          updateData.images = newImages;
        }
      }

      // Handle image deletions
      if (req.body.deleteImages) {
        const imagesToDelete = Array.isArray(req.body.deleteImages)
          ? req.body.deleteImages
          : [req.body.deleteImages];

        for (const imageId of imagesToDelete) {
          const imageToDelete = existingProduct.images.id(imageId);
          if (imageToDelete && imageToDelete.s3Key) {
            await deleteFromS3(imageToDelete.s3Key);
          }
        }

        updateData.$pull = { images: { _id: { $in: imagesToDelete } } };
      }

      // Update product
      updateData.updatedBy = req.admin._id;

      const product = await Product.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).populate([
        { path: "category", select: "name code" },
        // { path: "brand", select: "name code" },
        // { path: "subCategories", select: "name" },
        { path: "updatedBy", select: "name email" },
      ]);

      // Add audit log entry
      // product.addAuditLog(
      //   "updated",
      //   req.admin._id,
      //   {
      //     oldValues: oldValues,
      //     newValues: updateData,
      //   },
      //   "Product updated"
      // );

      await product.save();

      res.json({
        success: true,
        message: "Product updated successfully",
        data: product,
      });
    } catch (error) {
      console.error("Update product error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update product",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Delete product (soft delete by changing status)
  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const { permanent = false } = req.body; // Changed from req.query to req.body

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (permanent === true || permanent === "true") {
        // Permanent deletion - remove images from S3
        if (product.images && product.images.length > 0) {
          await Promise.all(
            product.images.map((img) =>
              img.s3Key ? deleteFromS3(img.s3Key) : Promise.resolve()
            )
          );
        }

        await Product.findByIdAndDelete(id);

        res.json({
          success: true,
          message: "Product permanently deleted",
        });
      } else {
        // Soft delete - change status
        product.status = "inactive";
        product.updatedBy = req.admin._id;
        // product.addAuditLog(
        //   "deleted",
        //   req.admin._id,
        //   {},
        //   "Product soft deleted"
        // );

        await product.save();

        res.json({
          success: true,
          message: "Product deleted successfully",
        });
      }
    } catch (error) {
      console.error("Delete product error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete product",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Update product stock
  async updateStock(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { quantity, operation = "set", reason = "" } = req.body;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      product.updatedBy = req.admin._id;
      await product.updateStock(quantity, operation, reason);

      res.json({
        success: true,
        message: "Stock updated successfully",
        data: {
          productId: product._id,
          newStock: product.stock.quantity,
          availableStock: product.availableStock,
          stockStatus: product.stockStatus,
        },
      });
    } catch (error) {
      console.error("Update stock error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update stock",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Bulk operations
  async bulkUpdate(req, res) {
    try {
      const { productIds, updateData, operation } = req.body;

      if (
        !productIds ||
        !Array.isArray(productIds) ||
        productIds.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Product IDs array is required",
        });
      }

      let result;

      switch (operation) {
        case "updateStatus":
          result = await Product.updateMany(
            { _id: { $in: productIds } },
            {
              status: updateData.status,
              updatedBy: req.admin._id,
            }
          );
          break;

        case "updatePrices":
          if (updateData.priceOperation === "percentage") {
            // Update by percentage
            const products = await Product.find({ _id: { $in: productIds } });
            const bulkOps = products.map((product) => ({
              updateOne: {
                filter: { _id: product._id },
                update: {
                  "price.original":
                    product.price.original * (1 + updateData.percentage / 100),
                  "price.selling":
                    product.price.selling * (1 + updateData.percentage / 100),
                  updatedBy: req.admin._id,
                },
              },
            }));
            result = await Product.bulkWrite(bulkOps);
          } else {
            // Fixed amount update
            result = await Product.updateMany(
              { _id: { $in: productIds } },
              {
                $inc: {
                  "price.original": updateData.amount || 0,
                  "price.selling": updateData.amount || 0,
                },
                updatedBy: req.admin._id,
              }
            );
          }
          break;

        case "delete":
          result = await Product.updateMany(
            { _id: { $in: productIds } },
            {
              status: "inactive",
              updatedBy: req.admin._id,
            }
          );
          break;

        default:
          return res.status(400).json({
            success: false,
            message: "Invalid operation",
          });
      }

      res.json({
        success: true,
        message: `Bulk ${operation} completed successfully`,
        data: {
          modifiedCount: result.modifiedCount || result.matchedCount,
          matchedCount: result.matchedCount,
        },
      });
    } catch (error) {
      console.error("Bulk update error:", error);
      res.status(500).json({
        success: false,
        message: "Bulk operation failed",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Get product analytics
  async getAnalytics(req, res) {
    try {
      const { id } = req.params;
      const { period = "30d" } = req.query;

      const product = await Product.findById(id).select("analytics title sku");
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case "7d":
          startDate.setDate(endDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(endDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(endDate.getDate() - 90);
          break;
        case "1y":
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      // You can extend this to get more detailed analytics from other collections
      // like Order, Review, etc.

      res.json({
        success: true,
        message: "Product analytics retrieved successfully",
        data: {
          product: {
            id: product._id,
            title: product.title,
            sku: product.sku,
          },
          analytics: product.analytics,
          period: {
            startDate,
            endDate,
            period,
          },
        },
      });
    } catch (error) {
      console.error("Get analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve analytics",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Search products with advanced filters
  async searchProducts(req, res) {
    try {
      const {
        q: searchQuery,
        category,
        brand,
        minPrice,
        maxPrice,
        minRating,
        sortBy = "relevance",
        page = 1,
        limit = 20,
      } = req.query;

      if (!searchQuery) {
        return res.status(400).json({
          success: false,
          message: "Search query is required",
        });
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build search aggregation pipeline
      const pipeline = [
        // Text search stage
        {
          $match: {
            $text: { $search: searchQuery },
            status: "active",
          },
        },

        // Add score for text search relevance
        {
          $addFields: {
            score: { $meta: "textScore" },
          },
        },
      ];

      // Add filters
      const matchConditions = {};

      // if (category) matchConditions.category = mongoose.Types.ObjectId(category);
      if (brand) matchConditions.brand = mongoose.Types.ObjectId(brand);
      if (minPrice || maxPrice) {
        matchConditions["price.selling"] = {};
        if (minPrice)
          matchConditions["price.selling"].$gte = parseFloat(minPrice);
        if (maxPrice)
          matchConditions["price.selling"].$lte = parseFloat(maxPrice);
      }
      if (minRating)
        matchConditions["ratings.average"] = { $gte: parseFloat(minRating) };

      if (Object.keys(matchConditions).length > 0) {
        pipeline.push({ $match: matchConditions });
      }

      // Add sorting
      const sortStage = {};
      switch (sortBy) {
        case "price_low":
          sortStage["price.selling"] = 1;
          break;
        case "price_high":
          sortStage["price.selling"] = -1;
          break;
        case "rating":
          sortStage["ratings.average"] = -1;
          break;
        case "newest":
          sortStage.createdAt = -1;
          break;
        case "relevance":
        default:
          sortStage.score = { $meta: "textScore" };
          break;
      }
      pipeline.push({ $sort: sortStage });

      // Add pagination
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: parseInt(limit) });

      // Add population
      // pipeline.push({
      //   $lookup: {
      //     from: 'categories',
      //     localField: 'category',
      //     foreignField: '_id',
      //     as: 'category'
      //   }
      // });
      // pipeline.push({
      //   $lookup: {
      //     from: 'brands',
      //     localField: 'brand',
      //     foreignField: '_id',
      //     as: 'brand'
      //   }
      // });

      // Unwind populated fields
      // pipeline.push({ $unwind: '$category' });
      // pipeline.push({ $unwind: '$brand' });

      const [products, totalCount] = await Promise.all([
        Product.aggregate(pipeline),
        Product.countDocuments({
          $text: { $search: searchQuery },
          status: "active",
          ...matchConditions,
        }),
      ]);

      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.json({
        success: true,
        message: "Search completed successfully",
        data: {
          products,
          searchQuery,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalResults: totalCount,
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1,
          },
        },
      });
    } catch (error) {
      console.error("Search products error:", error);
      res.status(500).json({
        success: false,
        message: "Search failed",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Get featured products
  async getFeaturedProducts(req, res) {
    try {
      const { limit = 10 } = req.query;

      const products = await Product.find({
        isFeatured: true,
        status: "active",
        "stock.quantity": { $gt: 0 },
      })
        .populate([
          { path: "category", select: "name code" },
          { path: "brand", select: "name code" },
        ])
        .sort({ "ratings.average": -1, createdAt: -1 })
        .limit(parseInt(limit));

      res.json({
        success: true,
        message: "Featured products retrieved successfully",
        data: products,
      });
    } catch (error) {
      console.error("Get featured products error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve featured products",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Get product audit log
  async getAuditLog(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const product = await Product.findById(id)
        .populate({
          path: "auditLog.performedBy",
          select: "name email",
        })
        .select("auditLog title sku");

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const auditLog = product.auditLog
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(skip, skip + parseInt(limit));

      const totalLogs = product.auditLog.length;
      const totalPages = Math.ceil(totalLogs / parseInt(limit));

      res.json({
        success: true,
        message: "Audit log retrieved successfully",
        data: {
          product: {
            id: product._id,
            title: product.title,
            sku: product.sku,
          },
          auditLog,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalLogs,
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get audit log error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve audit log",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
}

module.exports = new ProductController();
