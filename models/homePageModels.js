const mongoose = require("mongoose");

const heroSectionSchema = new mongoose.Schema({
  slideNumber: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  subtitle: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const bestSellerSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  position: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const newArrivalSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  position: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const testimonialSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, required: true },
  product: { type: String },
  verified: { type: Boolean, default: false },
  avatar: { type: String },
  isCustom: { type: Boolean, default: true },
  //   review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
  review: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const watchAndShopSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  videoUrl: { type: String, required: true },
  videoTitle: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const HeroSection = mongoose.model("HeroSection", heroSectionSchema);
const BestSeller = mongoose.model("BestSeller", bestSellerSchema);
const NewArrival = mongoose.model("NewArrival", newArrivalSchema);
const Testimonial = mongoose.model("Testimonial", testimonialSchema);
const WatchAndShop = mongoose.model("WatchAndShop", watchAndShopSchema);

module.exports = {
  HeroSection,
  BestSeller,
  NewArrival,
  Testimonial,
  WatchAndShop,
};
