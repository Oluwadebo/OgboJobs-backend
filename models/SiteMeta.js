const mongoose = require('mongoose');

const siteMetaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  title: String,
  description: String,
  keywords: String,
  ogImage: String,
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SiteMeta', siteMetaSchema);
