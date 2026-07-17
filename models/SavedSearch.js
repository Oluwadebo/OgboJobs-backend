const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  seeker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  query: {
    keyword: String,
    location: String,
    type: String,
    salaryMin: Number,
    salaryMax: Number,
    experienceLevel: String,
    category: String,
  },
  alertEnabled: { type: Boolean, default: true },
  lastAlertSent: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
