const express = require('express');
const router = express.Router();
const SavedJob = require('../models/SavedJob');
const SavedSearch = require('../models/SavedSearch');
const Newsletter = require('../models/Newsletter');
const AdPlacement = require('../models/AdPlacement');
const { protect, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// ---- SAVED JOBS ----
router.get('/jobs', protect, authorize('seeker'), async (req, res) => {
  try {
    const saved = await SavedJob.find({ seeker: req.user._id }).populate('job').sort('-savedAt').lean();
    res.json({ success: true, saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/jobs/:jobId', protect, authorize('seeker'), async (req, res) => {
  try {
    const saved = await SavedJob.create({ seeker: req.user._id, job: req.params.jobId });
    res.status(201).json({ success: true, saved });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Already saved' });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/jobs/:jobId', protect, authorize('seeker'), async (req, res) => {
  try {
    await SavedJob.findOneAndDelete({ seeker: req.user._id, job: req.params.jobId });
    res.json({ success: true, message: 'Removed from saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- SAVED SEARCHES ----
router.get('/searches', protect, authorize('seeker'), async (req, res) => {
  try {
    const searches = await SavedSearch.find({ seeker: req.user._id }).sort('-createdAt').lean();
    res.json({ success: true, searches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/searches', protect, authorize('seeker'), [
  body('name').notEmpty().withMessage('Search name required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { name, query, alertEnabled } = req.body;
    const search = await SavedSearch.create({ seeker: req.user._id, name, query, alertEnabled });
    res.status(201).json({ success: true, search });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/searches/:id', protect, authorize('seeker'), async (req, res) => {
  try {
    await SavedSearch.findOneAndDelete({ _id: req.params.id, seeker: req.user._id });
    res.json({ success: true, message: 'Search deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- NEWSLETTER SUBSCRIBE ----
router.post('/newsletter', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });
    await Newsletter.findOneAndUpdate({ email: email.toLowerCase() }, { isActive: true }, { upsert: true });
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- PUBLIC ADS API ----
// GET /api/saved/ads?slot=homepage_top_banner
router.get('/ads', async (req, res) => {
  try {
    const { slot } = req.query;
    const filter = { isActive: true };
    if (slot) filter.slot = slot;

    // Filter by date range
    const now = new Date();
    filter.$or = [
      { startDate: { $exists: false } },
      { startDate: { $lte: now } },
    ];

    const ads = await AdPlacement.find(filter).sort('-priority').lean();

    // Filter out expired ads
    const activeAds = ads.filter(ad => !ad.endDate || new Date(ad.endDate) > now);
    res.json({ success: true, ads: activeAds });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
