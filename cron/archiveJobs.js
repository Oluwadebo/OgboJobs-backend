const cron = require('node-cron');
const Job = require('../models/Job');

const archiveExpiredJobs = async () => {
  console.log('[CRON] Archiving expired jobs...');
  try {
    const result = await Job.updateMany(
      { expiryDate: { $lt: new Date() }, isActive: true },
      { $set: { isActive: false } }
    );
    console.log(`[CRON] Archived ${result.modifiedCount} expired jobs.`);
  } catch (err) {
    console.error('[CRON] Archive jobs error:', err.message);
  }
};

// Run daily at midnight
cron.schedule('0 0 * * *', archiveExpiredJobs);

module.exports = { archiveExpiredJobs };
