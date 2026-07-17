const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const TwoFactor = require('../models/TwoFactor');
const AuditLog = require('../models/AuditLog');
const { protect, generateToken } = require('../middleware/auth');
const { verifyRecaptcha } = require('../middleware/recaptcha');
const { sendWelcomeEmail, sendTwoFactorCode } = require('../services/emailService');
const { notifyNewEmployer } = require('../services/slackService');

const crypto = require('crypto');

// POST /api/auth/register
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
    body('role').isIn(['seeker', 'employer']).withMessage('Invalid role'),
  ],
  verifyRecaptcha,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { name, email, password, role } = req.body;
      const exists = await User.findOne({ email });
      if (exists) return res.status(400).json({ success: false, message: 'Email already registered' });

      const user = await User.create({ name, email, password, role });
      sendWelcomeEmail(email, name).catch(console.error);
      if (role === 'employer') notifyNewEmployer(user).catch(console.error);

      const token = generateToken(user._id);
      res.status(201).json({ success: true, token, user: { _id: user._id, name, email, role } });
    } catch (err) {
      console.log("Registration Error:", err);

      console.error("Registration Error:", err); // ADD THIS
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user || !user.password) return res.status(401).json({ success: false, message: 'Invalid credentials' });

      const match = await user.matchPassword(password);
      if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

      // 2FA for employer/admin
      if (user.role === 'employer' || user.role === 'admin') {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await TwoFactor.deleteMany({ user: user._id });
        await TwoFactor.create({
          user: user._id,
          code: await bcrypt.hash(code, 10),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        });
        await sendTwoFactorCode(user.email, code);
        return res.json({ success: true, requires2FA: true, userId: user._id });
      }

      user.lastLogin = new Date();
      await user.save();
      const token = generateToken(user._id);
      res.json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// POST /api/auth/verify-2fa
router.post('/verify-2fa', async (req, res) => {
  try {
    const { userId, code } = req.body;
    const record = await TwoFactor.findOne({ user: userId, used: false, expiresAt: { $gt: new Date() } });
    if (!record) return res.status(400).json({ success: false, message: 'Code expired or invalid' });

    const match = await bcrypt.compare(code, record.code);
    if (!match) return res.status(400).json({ success: false, message: 'Incorrect code' });

    record.used = true;
    await record.save();

    const user = await User.findById(userId);
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);
    res.json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// GET /api/auth/google/callback
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=google` }),
  (req, res) => {
    const token = generateToken(req.user._id);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&role=${req.user.role}`);
  }
);

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/profile
router.put('/profile', protect, async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'location', 'bio', 'skills', 'experience'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
