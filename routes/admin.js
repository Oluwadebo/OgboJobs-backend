const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Newsletter = require('../models/Newsletter');
const SiteMeta = require('../models/SiteMeta');
const AuditLog = require('../models/AuditLog');
const AdPlacement = require('../models/AdPlacement');
const { protect, authorize } = require('../middleware/auth');
const { sendBulkEmail, sendSingleEmail, sendJobApprovedEmail } = require('../services/emailService');
const { body, validationResult } = require('express-validator');

router.use(protect, authorize('admin'));

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalJobs, totalApps, pendingJobs, totalEmployers, totalSeekers, newsletterCount] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments({ isApproved: true, isActive: true }),
      Application.countDocuments(),
      Job.countDocuments({ isApproved: false, isPaid: true }),
      User.countDocuments({ role: 'employer' }),
      User.countDocuments({ role: 'seeker' }),
      Newsletter.countDocuments({ isActive: true }),
    ]);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyJobs = await Job.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    res.json({ success: true, stats: { totalUsers, totalJobs, totalApps, pendingJobs, totalEmployers, totalSeekers, newsletterCount, monthlyJobs } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { role, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const [users, total] = await Promise.all([
      User.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, users, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive, role: req.body.role }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── MAIL TO USERS ──────────────────────────────────────────────────────────────

// POST /api/admin/mail/send
// audience: 'all' | 'seekers' | 'employers' | 'newsletter' | 'single'
// If audience === 'single', provide targetEmail field
router.post('/mail/send', [
  body('subject').notEmpty().withMessage('Subject required'),
  body('html').notEmpty().withMessage('Email body required'),
  body('audience').isIn(['all', 'seekers', 'employers', 'newsletter', 'single']).withMessage('Invalid audience'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { subject, html, audience, targetEmail } = req.body;

    let emails = [];

    if (audience === 'single') {
      if (!targetEmail) return res.status(400).json({ success: false, message: 'targetEmail required for single send' });
      const user = await User.findOne({ email: targetEmail.toLowerCase().trim(), isActive: true });
      if (!user) return res.status(404).json({ success: false, message: 'No active user found with that email' });
      await sendSingleEmail(targetEmail, subject, html);
      // Log it
      await AuditLog.create({ user: req.user._id, action: 'ADMIN_MAIL_SINGLE', details: { to: targetEmail, subject } });
      return res.json({ success: true, message: `Email sent to ${targetEmail}`, sent: 1, failed: 0 });
    }

    if (audience === 'newsletter') {
      const subs = await Newsletter.find({ isActive: true }).lean();
      emails = subs.map(s => s.email);
    } else {
      const filter = { isActive: true };
      if (audience === 'seekers') filter.role = 'seeker';
      if (audience === 'employers') filter.role = 'employer';
      const users = await User.find(filter).select('email').lean();
      emails = users.map(u => u.email);
    }

    if (emails.length === 0) return res.status(400).json({ success: false, message: 'No recipients found for this audience' });

    // Fire-and-forget bulk send, respond immediately with count
    sendBulkEmail(emails, subject, html)
      .then(result => {
        AuditLog.create({ user: req.user._id, action: 'ADMIN_MAIL_BULK', details: { audience, subject, sent: result.sent, failed: result.failed } }).catch(() => {});
        console.log(`[MAIL] Bulk send complete: ${result.sent} sent, ${result.failed} failed`);
      })
      .catch(err => console.error('[MAIL] Bulk send error:', err.message));

    res.json({ success: true, message: `Sending to ${emails.length} recipient${emails.length !== 1 ? 's' : ''}. You'll see results in the audit log.`, queued: emails.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/mail/preview  – returns audience counts for the UI
router.get('/mail/preview', async (req, res) => {
  try {
    const [allUsers, seekers, employers, newsletter] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true, role: 'seeker' }),
      User.countDocuments({ isActive: true, role: 'employer' }),
      Newsletter.countDocuments({ isActive: true }),
    ]);
    res.json({ success: true, counts: { all: allUsers, seekers, employers, newsletter } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── JOBS ──────────────────────────────────────────────────────────────────────

router.get('/jobs/pending', async (req, res) => {
  try {
    const jobs = await Job.find({ isApproved: false, isPaid: true }).populate('employer', 'name email').sort('-createdAt').lean();
    res.json({ success: true, jobs });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/jobs/:id/approve', async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true }).populate('employer', 'email name');
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    sendJobApprovedEmail(job.employer.email, job.title).catch(console.error);
    await AuditLog.create({ user: req.user._id, action: 'JOB_APPROVED', entityId: job._id, details: { title: job.title } });
    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/jobs/:id/reject', async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, { isApproved: false, isActive: false }, { new: true });
    await AuditLog.create({ user: req.user._id, action: 'JOB_REJECTED', entityId: job._id });
    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/jobs/bulk-extend', async (req, res) => {
  try {
    const { jobIds, days = 30 } = req.body;
    const newExpiry = new Date(Date.now() + days * 86400000);
    const result = await Job.updateMany({ _id: { $in: jobIds } }, { $set: { expiryDate: newExpiry, isActive: true } });
    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/jobs', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (search) filter.$text = { $search: search };
    const [jobs, total] = await Promise.all([
      Job.find(filter).populate('employer', 'name email').sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)).lean(),
      Job.countDocuments(filter),
    ]);
    res.json({ success: true, jobs, total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── SEO ───────────────────────────────────────────────────────────────────────

router.get('/seo', async (req, res) => {
  try {
    const metas = await SiteMeta.find();
    res.json({ success: true, metas });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/seo/:key', async (req, res) => {
  try {
    const meta = await SiteMeta.findOneAndUpdate({ key: req.params.key }, { ...req.body, updatedAt: new Date() }, { upsert: true, new: true });
    res.json({ success: true, meta });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NEWSLETTER SUBSCRIBERS ────────────────────────────────────────────────────

router.get('/newsletter/subscribers', async (req, res) => {
  try {
    const subscribers = await Newsletter.find({ isActive: true }).lean();
    res.json({ success: true, subscribers, count: subscribers.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── SITEMAP ───────────────────────────────────────────────────────────────────

router.get('/sitemap', async (req, res) => {
  try {
    const jobs = await Job.find({ isApproved: true, isActive: true }).select('_id updatedAt').lean();
    const base = process.env.FRONTEND_URL;
    const urls = [
      { loc: base, priority: '1.0' },
      { loc: `${base}/jobs`, priority: '0.9' },
      { loc: `${base}/companies`, priority: '0.8' },
      { loc: `${base}/register`, priority: '0.7' },
      ...jobs.map(j => ({ loc: `${base}/jobs/${j._id}`, lastmod: j.updatedAt?.toISOString().split('T')[0], priority: '0.8' })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>`;
    res.header('Content-Type', 'application/xml').send(xml);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── AUDIT LOGS ────────────────────────────────────────────────────────────────

router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find().populate('user', 'name email').sort('-createdAt').limit(200).lean();
    res.json({ success: true, logs });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── AD PLACEMENTS ─────────────────────────────────────────────────────────────

router.get('/ads', async (req, res) => {
  try {
    const ads = await AdPlacement.find().sort('-createdAt').lean();
    res.json({ success: true, ads });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/ads', [
  body('name').notEmpty().withMessage('Ad name required'),
  body('slot').notEmpty().withMessage('Slot required'),
  body('type').notEmpty().withMessage('Type required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const ad = await AdPlacement.create(req.body);
    res.status(201).json({ success: true, ad });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/ads/:id', async (req, res) => {
  try {
    const ad = await AdPlacement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, ad });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/ads/:id', async (req, res) => {
  try {
    await AdPlacement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Ad deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/ads/:id/toggle', async (req, res) => {
  try {
    const ad = await AdPlacement.findById(req.params.id);
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    ad.isActive = !ad.isActive;
    await ad.save();
    res.json({ success: true, ad });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
