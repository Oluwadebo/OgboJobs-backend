const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Application = require('../models/Application');
const { protect, authorize } = require('../middleware/auth');

// GET /api/analytics/employer
router.get('/employer', protect, authorize('employer'), async (req, res) => {
  try {
    const jobs = await Job.find({ employer: req.user._id }).lean();
    const jobIds = jobs.map(j => j._id);

    const applications = await Application.find({ employer: req.user._id })
      .populate('seeker', 'location')
      .populate('job', 'title createdAt filledAt')
      .lean();

    // Views per job
    const viewsPerJob = jobs.map(j => ({ title: j.title, views: j.views, id: j._id }));

    // Applications per job
    const appCountMap = {};
    applications.forEach(a => {
      const key = a.job?._id?.toString();
      if (key) appCountMap[key] = (appCountMap[key] || 0) + 1;
    });
    const appsPerJob = jobs.map(j => ({ title: j.title, count: appCountMap[j._id.toString()] || 0 }));

    // Average time to fill (days)
    const filledJobs = jobs.filter(j => j.filledAt);
    const avgTimeToFill = filledJobs.length > 0
      ? filledJobs.reduce((sum, j) => sum + (j.filledAt - j.createdAt) / 86400000, 0) / filledJobs.length
      : null;

    // Applicant location distribution
    const locationMap = {};
    applications.forEach(a => {
      const loc = a.seeker?.location || 'Unknown';
      locationMap[loc] = (locationMap[loc] || 0) + 1;
    });
    const locationDistribution = Object.entries(locationMap).map(([location, count]) => ({ location, count }));

    // Status pipeline breakdown
    const statusMap = {};
    applications.forEach(a => { statusMap[a.status] = (statusMap[a.status] || 0) + 1; });

    res.json({
      success: true,
      analytics: {
        totalJobs: jobs.length,
        totalApplications: applications.length,
        viewsPerJob,
        appsPerJob,
        avgTimeToFill,
        locationDistribution,
        statusBreakdown: statusMap,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public ad impression/click tracking
// POST /api/analytics/ad-impression/:id
router.post('/ad-impression/:id', async (req, res) => {
  try {
    const AdPlacement = require('../models/AdPlacement');
    await AdPlacement.findByIdAndUpdate(req.params.id, { $inc: { impressions: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/analytics/ad-click/:id
router.post('/ad-click/:id', async (req, res) => {
  try {
    const AdPlacement = require('../models/AdPlacement');
    await AdPlacement.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
