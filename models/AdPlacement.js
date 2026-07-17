const mongoose = require('mongoose');

const adPlacementSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slot: {
    type: String,
    required: true,
    enum: [
      'homepage_top_banner',
      'homepage_sidebar',
      'homepage_mid_feed',
      'job_list_top',
      'job_list_sidebar',
      'job_list_inline',
      'job_detail_top',
      'job_detail_sidebar',
      'job_detail_bottom',
      'company_page_top',
      'search_results_top',
      'dashboard_banner',
    ],
  },
  type: { type: String, enum: ['adsense', 'video', 'custom_html', 'image'], required: true },
  // Google AdSense
  adClient: { type: String },      // e.g. ca-pub-XXXXXXXXXXXXXXXX
  adSlotId: { type: String },      // numeric slot ID
  adFormat: { type: String, default: 'auto' },
  // Video Ad (YouTube embed or direct video)
  videoUrl: { type: String },      // YouTube embed URL or direct mp4
  videoTitle: { type: String },
  videoPoster: { type: String },
  videoAutoplay: { type: Boolean, default: false },
  videoMuted: { type: Boolean, default: true },
  videoDuration: { type: Number }, // seconds, 0 = no skip timer
  videoClickUrl: { type: String }, // where clicking takes the user
  // Custom HTML (raw Google Ads tag, etc.)
  customHtml: { type: String },
  // Image Ad
  imageUrl: { type: String },
  imageAlt: { type: String },
  imageClickUrl: { type: String },
  // Common
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  startDate: { type: Date },
  endDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('AdPlacement', adPlacementSchema);
