const { validationResult } = require("express-validator");
const Category = require("../models/Category");
const { deleteFromS3, uploadToS3 } = require("../utils/s3Utils");
const mongoose = require("mongoose");

class CategoryController {
  // Create a new category
 async createCategory(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const categoryData = {
      name: req.body.name?.trim(),
      description: req.body.description?.trim(),
      status: req.body.status?.trim().toLowerCase() || 'active',
      isFeatured: req.body.isFeatured === true || req.body.isFeatured === 'true' || false,
      showOnHomepage: req.body.showOnHomepage === true || req.body.showOnHomepage === 'true' || false,
      createdBy: req.admin._id,
      updatedBy: req.admin._id
    };

    // Handle image upload
    if (req.file) {
      const s3Result = await uploadToS3(req.file, "categories");
      categoryData.image = {
        url: s3Result.Location,
        alt: req.body.imageAlt || "",
        s3Key: s3Result.Key, // Make sure to store this for cleanup
      };
    }

    const category = new Category(categoryData);
    await category.save();

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error("Create category error:", error);
    
    // Handle different types of duplicate errors
    if (error.code === 11000) {
      let message = "Duplicate entry detected";
      
      if (error.keyPattern.slug) {
        message = "Category with similar name already exists";
      } else if (error.keyPattern.code) {
        message = "Category code already exists";
      }
      
      return res.status(400).json({
        success: false,
        message: message,
        error: "Please try a different category name"
      });
    }

    // Clean up uploaded image if category creation fails
    if (req.file && req.file.s3Key) {
      try {
        await deleteFromS3(req.file.s3Key);
      } catch (cleanupError) {
        console.error("Error cleaning up uploaded image:", cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
}

  // Get all categories with filtering, sorting, and pagination
  async getCategories(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      featured,
      search,
      sort = "-createdAt",
    } = req.query;

    const filters = {};

    // Build filters object
    if (status) {
      filters.status = status;
    }
    
    if (featured !== undefined) {
      filters.isFeatured = featured === "true";
    }
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = Category.find(filters)
      .populate([
        { path: "createdBy", select: "name email" },
        { path: "updatedBy", select: "name email" },
      ])
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const [categories, totalCategories] = await Promise.all([
      query.exec(),
      Category.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(totalCategories / parseInt(limit));

    res.json({
      success: true,
      message: "Categories retrieved successfully",
      data: {
        categories,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCategories,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve categories",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
}

// Get single category by ID
async getCategory(req, res) {
  try {
    const { id } = req.params;

    const category = await Category.findById(id).populate([
      { path: "createdBy", select: "name email" },
      { path: "updatedBy", select: "name email" },
    ]);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Update view count
    category.stats.views += 1;
    await category.save();

    res.json({
      success: true,
      message: "Category retrieved successfully",
      data: category,
    });
  } catch (error) {
    console.error("Get category error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve category",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
}

  // Update category
  async updateCategory(req, res) {
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

      // Get existing category
      const existingCategory = await Category.findById(id);
      if (!existingCategory) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // Handle new image upload
      if (req.file) {
        const s3Result = await uploadToS3(req.file, "categories");
        updateData.image = {
          url: s3Result.Location,
          alt: req.body.imageAlt || "",
          s3Key: s3Result.Key,
        };

        // Delete old image if it exists
        if (existingCategory.image?.s3Key) {
          await deleteFromS3(existingCategory.image.s3Key);
        }
      }

      // Handle image deletion if requested
      if (req.body.deleteImage === "true" && existingCategory.image?.s3Key) {
        await deleteFromS3(existingCategory.image.s3Key);
        updateData.image = null;
      }

      // Update category
      updateData.updatedBy = req.admin._id;
      const category = await Category.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).populate([
        { path: "updatedBy", select: "name email" },
      ]);

      res.json({
        success: true,
        message: "Category updated successfully",
        data: category,
      });
    } catch (error) {
      console.error("Update category error:", error);
      
      // Clean up uploaded image if update fails
      if (req.file && req.file.s3Key) {
        try {
          await deleteFromS3(req.file.s3Key);
        } catch (cleanupError) {
          console.error("Error cleaning up uploaded image:", cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        message: "Failed to update category",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Delete category (soft delete by changing status)
  async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      const { permanent = false } = req.body;

      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      if (permanent === true || permanent === "true") {
        // Permanent deletion - remove image from S3
        if (category.image?.s3Key) {
          await deleteFromS3(category.image.s3Key);
        }

        await Category.findByIdAndDelete(id);

        res.json({
          success: true,
          message: "Category permanently deleted",
        });
      } else {
        // Soft delete - change status
        category.status = "inactive";
        category.updatedBy = req.admin._id;
        await category.save();

        res.json({
          success: true,
          message: "Category deleted successfully",
        });
      }
    } catch (error) {
      console.error("Delete category error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete category",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Get featured categories
  async getFeaturedCategories(req, res) {
    try {
      const { limit = 10 } = req.query;

      const categories = await Category.find({
        isFeatured: true,
        status: "active",
      })
        .sort({ "stats.views": -1, createdAt: -1 })
        .limit(parseInt(limit));

      res.json({
        success: true,
        message: "Featured categories retrieved successfully",
        data: categories,
      });
    } catch (error) {
      console.error("Get featured categories error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve featured categories",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  // Get categories for homepage
  async getHomepageCategories(req, res) {
    try {
      const categories = await Category.find({
        showOnHomepage: true,
        status: "active",
      })
        .sort({ createdAt: -1 })
        .limit(12);

      res.json({
        success: true,
        message: "Homepage categories retrieved successfully",
        data: categories,
      });
    } catch (error) {
      console.error("Get homepage categories error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve homepage categories",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
}

module.exports = new CategoryController();