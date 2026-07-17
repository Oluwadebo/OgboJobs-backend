const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  seeker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coverLetter: { type: String },
  resumeUrl: { type: String },
  status: {
    type: String,
    enum: ['Applied', 'Viewed', 'Shortlisted', 'Interview Scheduled', 'Offer', 'Hired', 'Rejected'],
    default: 'Applied',
  },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    note: String,
  }],
  interviewDate: { type: Date },
  notes: { type: String },
  appliedAt: { type: Date, default: Date.now },
}, { timestamps: true });

applicationSchema.index({ job: 1, seeker: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);
