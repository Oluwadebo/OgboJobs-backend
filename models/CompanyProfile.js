const mongoose = require('mongoose');

const companyProfileSchema = new mongoose.Schema({
  employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  companyName: { type: String, required: true },
  logo: { type: String },
  coverImage: { type: String },
  description: { type: String },
  website: { type: String },
  industry: { type: String },
  size: { type: String, enum: ['1-10', '11-50', '51-200', '201-1000', '1000+'] },
  founded: { type: Number },
  headquarters: { type: String },
  social: {
    linkedin: String,
    twitter: String,
    facebook: String,
    instagram: String,
  },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('CompanyProfile', companyProfileSchema);
