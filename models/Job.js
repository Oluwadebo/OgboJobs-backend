const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true, index: 'text' },
  description: { type: String, required: true, index: 'text' },
  company: { type: String, required: true },
  employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: { type: String },
  type: { type: String, enum: ['remote', 'hybrid', 'on-site'], default: 'on-site' },
  category: { type: String },
  skills: [{ type: String, index: 'text' }],
  salaryMin: { type: Number },
  salaryMax: { type: Number },
  experienceLevel: { type: String, enum: ['entry', 'mid', 'senior', 'executive'], default: 'mid' },
  isApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isPaid: { type: Boolean, default: false },
  stripePaymentId: { type: String },
  expiryDate: { type: Date, default: () => new Date(+new Date() + 30 * 24 * 60 * 60 * 1000) },
  views: { type: Number, default: 0 },
  applicationCount: { type: Number, default: 0 },
  filledAt: { type: Date },
  seoTitle: { type: String },
  seoDescription: { type: String },
  // For text search scoring
  score: { type: Number },
}, { timestamps: true });

jobSchema.index({ title: 'text', description: 'text', skills: 'text', company: 'text' });

module.exports = mongoose.model('Job', jobSchema);
