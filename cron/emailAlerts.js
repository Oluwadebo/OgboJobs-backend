const cron = require('node-cron');
const SavedSearch = require('../models/SavedSearch');
const Job = require('../models/Job');
const User = require('../models/User');
const { sendSavedSearchAlert } = require('../services/emailService');

const buildQuery = (q) => {
  const filter = { isApproved: true, isActive: true };
  if (q.keyword) filter.$text = { $search: q.keyword };
  if (q.location) filter.location = { $regex: q.location, $options: 'i' };
  if (q.type) filter.type = q.type;
  if (q.experienceLevel) filter.experienceLevel = q.experienceLevel;
  if (q.category) filter.category = q.category;
  if (q.salaryMin) filter.salaryMin = { $gte: q.salaryMin };
  if (q.salaryMax) filter.salaryMax = { $lte: q.salaryMax };
  return filter;
};

const runEmailAlerts = async () => {
  console.log('[CRON] Running saved search email alerts...');
  try {
    const searches = await SavedSearch.find({ alertEnabled: true }).populate('seeker');

    for (const search of searches) {
      if (!search.seeker || !search.seeker.isActive) continue;
      const since = search.lastAlertSent || new Date(0);
      const filter = buildQuery(search.query);
      filter.createdAt = { $gt: since };

      const newJobs = await Job.find(filter).limit(10).lean();
      if (newJobs.length === 0) continue;

      await sendSavedSearchAlert(search.seeker.email, search.name, newJobs);
      search.lastAlertSent = new Date();
      await search.save();
      console.log(`[CRON] Alert sent to ${search.seeker.email} for search "${search.name}"`);
    }
  } catch (err) {
    console.error('[CRON] Email alert error:', err.message);
  }
};

// Run daily at 8 AM
cron.schedule('0 8 * * *', runEmailAlerts);

module.exports = { runEmailAlerts };
