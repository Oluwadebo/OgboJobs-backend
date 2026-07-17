const axios = require('axios');

const send = async (text, blocks) => {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text, blocks });
  } catch (err) {
    console.error('Slack notification failed:', err.message);
  }
};

exports.notifyNewEmployer = (employer) => send(
  `🏢 New employer registered: *${employer.name}* (${employer.email})`,
  [{
    type: 'section',
    text: { type: 'mrkdwn', text: `🏢 *New Employer Registered*\n*Name:* ${employer.name}\n*Email:* ${employer.email}\n*Time:* ${new Date().toLocaleString()}` }
  }]
);

exports.notifyNewJobPendingApproval = (job, employer) => send(
  `📋 New job pending approval: "${job.title}" by ${employer.name}`,
  [{
    type: 'section',
    text: { type: 'mrkdwn', text: `📋 *New Job Pending Approval*\n*Title:* ${job.title}\n*Company:* ${job.company}\n*Posted by:* ${employer.name} (${employer.email})\n*Review:* ${process.env.FRONTEND_URL}/admin/dashboard` }
  }]
);

exports.notifyNewApplication = (job, seeker) => send(
  `👤 New application for "${job.title}" from ${seeker.name}`
);
