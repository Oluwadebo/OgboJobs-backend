const express = require('express');
const router = express.Router();
const CompanyProfile = require('../models/CompanyProfile');
const Job = require('../models/Job');
const { protect, authorize } = require('../middleware/auth');
const { uploadLogo } = require('../middleware/upload');

// GET /api/company/:id - Public company page
router.get('/:id', async (req, res) => {
  try {
    const company = await CompanyProfile.findOne({ employer: req.params.id }).populate('employer', 'name email').lean();
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const jobs = await Job.find({ employer: req.params.id, isApproved: true, isActive: true }).sort('-createdAt').lean();
    res.json({ success: true, company, jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/company - All companies (public)
router.get('/', async (req, res) => {
  try {
    const companies = await CompanyProfile.find().populate('employer', 'name').sort('-createdAt').limit(50).lean();
    res.json({ success: true, companies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/company - Create company profile (employer)
router.post('/', protect, authorize('employer'), uploadLogo.single('logo'), async (req, res) => {
  try {
    const existing = await CompanyProfile.findOne({ employer: req.user._id });
    if (existing) return res.status(400).json({ success: false, message: 'Company profile already exists. Use PUT to update.' });

    const data = { ...req.body, employer: req.user._id };
    if (req.file) data.logo = req.file.path;
    if (req.body.social) {
      try { data.social = typeof req.body.social === 'string' ? JSON.parse(req.body.social) : req.body.social; } catch {}
    }

    const company = await CompanyProfile.create(data);
    res.status(201).json({ success: true, company });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/company - Update company profile
router.put('/', protect, authorize('employer'), uploadLogo.single('logo'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) data.logo = req.file.path;
    if (req.body.social) {
      try { data.social = typeof req.body.social === 'string' ? JSON.parse(req.body.social) : req.body.social; } catch {}
    }

    const company = await CompanyProfile.findOneAndUpdate({ employer: req.user._id }, data, { new: true, upsert: true });
    res.json({ success: true, company });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
