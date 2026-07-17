const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { uploadResume } = require('../middleware/upload');
const { parseResume } = require('../services/resumeParser');
const { sendApplicationAlert, sendJobApprovedEmail } = require('../services/emailService');
const { notifyNewJobPendingApproval } = require('../services/slackService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// GET /api/jobs - Browse & search with advanced filters
router.get('/', async (req, res) => {
  try {
    const {
      keyword, location, type, category, experienceLevel,
      salaryMin, salaryMax, datePosted, page = 1, limit = 12, sort = '-createdAt',
    } = req.query;

    const filter = { isApproved: true, isActive: true };

    if (keyword) filter.$text = { $search: keyword };
    if (location) filter.location = { $regex: location, $options: 'i' };
    if (type) filter.type = { $in: type.split(',') };
    if (category) filter.category = { $in: category.split(',') };
    if (experienceLevel) filter.experienceLevel = { $in: experienceLevel.split(',') };
    if (salaryMin) filter.salaryMin = { $gte: Number(salaryMin) };
    if (salaryMax) filter.salaryMax = { $lte: Number(salaryMax) };

    if (datePosted) {
      const now = new Date();
      const map = { '24h': 1, 'week': 7, 'month': 30 };
      const days = map[datePosted];
      if (days) filter.createdAt = { $gte: new Date(now - days * 86400000) };
    }

    const skip = (Number(page) - 1) * Number(limit);
    let queryExec = Job.find(filter)
      .populate('employer', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    if (keyword) queryExec = queryExec.select({ score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });

    const [jobs, total] = await Promise.all([
      queryExec.lean(),
      Job.countDocuments(filter),
    ]);

    res.json({ success: true, jobs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/jobs/:id
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate('employer', 'name email avatar');
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Increment view count (async, non-blocking)
    Job.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

    // Similar jobs via $text search
    let similar = [];
    if (job.title) {
      similar = await Job.find(
        { $text: { $search: `${job.title} ${job.skills.join(' ')}` }, _id: { $ne: job._id }, isApproved: true, isActive: true },
        { score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } }).limit(5).select('title company location type salaryMin salaryMax').lean();
    }

    res.json({ success: true, job, similar });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jobs - Create job (employer), requires Stripe payment
router.post('/',
  protect,
  authorize('employer'),
  [
    body('title').notEmpty(),
    body('description').notEmpty(),
    body('company').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { title, description, company, location, type, category, skills, salaryMin, salaryMax, experienceLevel, stripePaymentIntentId } = req.body;

      // Verify Stripe payment
      let isPaid = false;
      if (stripePaymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
        if (intent.status === 'succeeded') isPaid = true;
      }

      if (!isPaid) return res.status(402).json({ success: false, message: 'Payment required to post a job' });

      const job = await Job.create({
        title, description, company, location, type, category,
        skills: Array.isArray(skills) ? skills : (skills || '').split(',').map(s => s.trim()),
        salaryMin: Number(salaryMin), salaryMax: Number(salaryMax), experienceLevel,
        employer: req.user._id,
        stripePaymentId: stripePaymentIntentId,
        isPaid: true,
      });

      notifyNewJobPendingApproval(job, req.user).catch(console.error);
      res.status(201).json({ success: true, job });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// PUT /api/jobs/:id - Update job
router.put('/:id', protect, authorize('employer', 'admin'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (req.user.role === 'employer' && job.employer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const updated = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, job: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', protect, authorize('employer', 'admin'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (req.user.role === 'employer' && job.employer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await job.deleteOne();
    res.json({ success: true, message: 'Job deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jobs/:id/apply
router.post('/:id/apply', protect, authorize('seeker'), uploadResume.single('resume'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job || !job.isApproved || !job.isActive) {
      return res.status(404).json({ success: false, message: 'Job not available' });
    }

    const existing = await Application.findOne({ job: req.params.id, seeker: req.user._id });
    if (existing) return res.status(400).json({ success: false, message: 'Already applied' });

    const resumeUrl = req.file ? req.file.path : req.user.resumeUrl;

    const application = await Application.create({
      job: req.params.id,
      seeker: req.user._id,
      employer: job.employer,
      coverLetter: req.body.coverLetter,
      resumeUrl,
      statusHistory: [{ status: 'Applied' }],
    });

    // Auto-parse resume if uploaded
    if (req.file) {
      parseResume(req.file.path, req.file.mimetype).then(async (parsed) => {
        await User.findByIdAndUpdate(req.user._id, {
          resumeUrl: req.file.path,
          resumeParsedData: parsed,
          skills: parsed.skills.length > 0 ? parsed.skills : undefined,
        });
      }).catch(console.error);
    }

    // Increment job application count
    Job.findByIdAndUpdate(req.params.id, { $inc: { applicationCount: 1 } }).exec();

    res.status(201).json({ success: true, application });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Already applied' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/jobs/applications/:id/status - Employer updates status
router.put('/applications/:id/status', protect, authorize('employer'), async (req, res) => {
  try {
    const { status, note, interviewDate } = req.body;
    const validStatuses = ['Applied','Viewed','Shortlisted','Interview Scheduled','Offer','Hired','Rejected'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const application = await Application.findById(req.params.id).populate('job').populate('seeker', 'email name');
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });
    if (application.employer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    application.status = status;
    application.statusHistory.push({ status, note });
    if (interviewDate) application.interviewDate = interviewDate;
    if (status === 'Hired') application.job.filledAt = new Date();
    await application.save();

    sendApplicationAlert(application.seeker.email, application.job.title, status).catch(console.error);

    res.json({ success: true, application });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/jobs/my/applications - Seeker's applications
router.get('/my/applications', protect, authorize('seeker'), async (req, res) => {
  try {
    const applications = await Application.find({ seeker: req.user._id })
      .populate('job', 'title company location type')
      .sort('-appliedAt').lean();
    res.json({ success: true, applications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/jobs/employer/applications - Employer's received applications
router.get('/employer/applications', protect, authorize('employer'), async (req, res) => {
  try {
    const applications = await Application.find({ employer: req.user._id })
      .populate('job', 'title company')
      .populate('seeker', 'name email avatar skills location')
      .sort('-appliedAt').lean();
    res.json({ success: true, applications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/jobs/employer/my-jobs - Employer's job listings
router.get('/employer/my-jobs', protect, authorize('employer'), async (req, res) => {
  try {
    const jobs = await Job.find({ employer: req.user._id }).sort('-createdAt').lean();
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jobs/create-payment-intent
router.post('/create-payment-intent', protect, authorize('employer'), async (req, res) => {
  try {
    const intent = await stripe.paymentIntents.create({
      amount: parseInt(process.env.JOB_POST_PRICE) || 2999,
      currency: 'usd',
      metadata: { employerId: req.user._id.toString() },
    });
    res.json({ success: true, clientSecret: intent.client_secret, intentId: intent.id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/jobs/recommended - AI-powered recommendations based on past applications
router.get('/recommended/for-you', protect, authorize('seeker'), async (req, res) => {
  try {
    const applications = await Application.find({ seeker: req.user._id }).populate('job').limit(10).lean();
    const keywords = applications.flatMap(a => a.job ? [a.job.title, ...(a.job.skills || [])] : []);
    const searchText = [...new Set(keywords)].join(' ');

    if (!searchText.trim()) {
      const jobs = await Job.find({ isApproved: true, isActive: true }).sort('-createdAt').limit(6).lean();
      return res.json({ success: true, jobs });
    }

    const jobs = await Job.find(
      { $text: { $search: searchText }, isApproved: true, isActive: true },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(6).lean();

    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
