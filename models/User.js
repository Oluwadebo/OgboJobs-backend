const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, select: false },
  role: { type: String, enum: ['seeker', 'employer', 'admin'], default: 'seeker' },
  googleId: { type: String },
  avatar: { type: String },
  phone: { type: String },
  location: { type: String },
  bio: { type: String },
  skills: [{ type: String }],
  experience: { type: String },
  resumeUrl: { type: String },
  resumeParsedData: {
    skills: [String],
    experience: String,
    education: String,
    rawText: String,
  },
  twoFactorEnabled: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);
