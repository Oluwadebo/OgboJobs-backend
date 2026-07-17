const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Base branded HTML wrapper for all outgoing OgboJobs emails
const wrap = (bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f0fdf4;font-family:Inter,Arial,sans-serif;color:#0f172a}
  .shell{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#052e16,#16a34a);padding:28px 32px;text-align:center}
  .header-logo{display:inline-flex;align-items:center;gap:10px;text-decoration:none}
  .header-icon{background:rgba(255,255,255,.2);border-radius:8px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff}
  .header-name{font-size:20px;font-weight:900;color:#fff}
  .body{padding:32px}
  .footer{background:#f0fdf4;border-top:1px solid #d1fae5;padding:20px 32px;text-align:center;font-size:12px;color:#6b7280}
  .footer a{color:#16a34a;text-decoration:none}
  h2{font-size:20px;font-weight:800;margin:0 0 12px;color:#052e16}
  p{margin:0 0 14px;line-height:1.7;color:#374151;font-size:15px}
  .btn{display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;margin:8px 0}
  .divider{height:1px;background:#d1fae5;margin:24px 0}
  ul{padding-left:20px;margin:0 0 14px} li{margin-bottom:6px;line-height:1.6;color:#374151}
  .tag{display:inline-block;background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;margin:2px}
</style>
</head>
<body>
<div class="shell">
  <div class="header">
    <div class="header-logo">
      <div class="header-icon">OJ</div>
      <span class="header-name">OgboJobs</span>
    </div>
    <div style="color:rgba(255,255,255,.8);font-size:12px;margin-top:6px">Ogbomosho's #1 Job Platform</div>
  </div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">
    <p style="margin:0 0 6px">© ${new Date().getFullYear()} OgboJobs · Ogbomosho, Oyo State, Nigeria 🇳🇬</p>
    <p style="margin:0"><a href="${process.env.FRONTEND_URL}/jobs">Browse Jobs</a> &nbsp;·&nbsp; <a href="${process.env.FRONTEND_URL}/privacy">Privacy Policy</a> &nbsp;·&nbsp; <a href="mailto:hello@ogbojobs.com">Contact Us</a></p>
    <p style="margin:6px 0 0;color:#9ca3af;font-size:11px">You received this email because you have an OgboJobs account. <a href="${process.env.FRONTEND_URL}/unsubscribe" style="color:#9ca3af">Unsubscribe</a></p>
  </div>
</div>
</body></html>`;

const send = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"OgboJobs" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  });
};

// ── Transactional emails ──────────────────────────────────────────────────────

exports.sendWelcomeEmail = (email, name) => send({
  to: email,
  subject: '🎉 Welcome to OgboJobs – Your Ogbomosho Career Starts Here!',
  html: wrap(`
    <h2>Welcome aboard, ${name}! 👋</h2>
    <p>You've just joined OgboJobs — Ogbomosho's #1 platform for jobs and career opportunities across Oyo State and Nigeria.</p>
    <div class="divider"></div>
    <p><strong>Here's what you can do next:</strong></p>
    <ul>
      <li>🔍 <a href="${process.env.FRONTEND_URL}/jobs">Browse hundreds of local job listings</a></li>
      <li>🔖 Save jobs you like and get daily alerts</li>
      <li>📄 Upload your CV and let employers find you</li>
      <li>🤖 Get AI-powered job recommendations</li>
    </ul>
    <a href="${process.env.FRONTEND_URL}/jobs" class="btn">Browse Jobs Now →</a>
    <div class="divider"></div>
    <p style="font-size:13px;color:#6b7280">Questions? Reply to this email or reach us at <a href="mailto:hello@ogbojobs.com">hello@ogbojobs.com</a></p>
  `),
});

exports.sendTwoFactorCode = (email, code) => send({
  to: email,
  subject: '🔐 Your OgboJobs Login Code',
  html: wrap(`
    <h2>Security Verification</h2>
    <p>Use the code below to complete your login. It expires in <strong>10 minutes</strong>.</p>
    <div style="background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:28px;text-align:center;margin:20px 0">
      <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#16a34a;font-family:monospace">${code}</div>
    </div>
    <p style="font-size:13px;color:#6b7280">⚠️ If you didn't try to log in, please ignore this email and consider changing your password.</p>
  `),
});

exports.sendJobApprovedEmail = (email, jobTitle) => send({
  to: email,
  subject: `✅ Your job "${jobTitle}" is now live on OgboJobs!`,
  html: wrap(`
    <h2>Your job is live! 🎉</h2>
    <p>Great news! Your OgboJobs listing <strong>"${jobTitle}"</strong> has been approved by our team and is now visible to thousands of job seekers in Ogbomosho and across Oyo State.</p>
    <a href="${process.env.FRONTEND_URL}/employer/dashboard" class="btn">View Your Dashboard →</a>
    <div class="divider"></div>
    <p style="font-size:13px;color:#6b7280">Your listing will remain active for 30 days. Log in to your dashboard to track views, applications and chat with applicants.</p>
  `),
});

exports.sendApplicationAlert = (seekerEmail, jobTitle, company, status) => send({
  to: seekerEmail,
  subject: `📬 Application Update: ${jobTitle} at ${company}`,
  html: wrap(`
    <h2>Your application was updated</h2>
    <p>The employer at <strong>${company}</strong> has updated your application status for <strong>"${jobTitle}"</strong>:</p>
    <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0">
      <span style="font-size:18px;font-weight:800;color:#16a34a">${status}</span>
    </div>
    <a href="${process.env.FRONTEND_URL}/my-applications" class="btn">View My Applications →</a>
    <div class="divider"></div>
    <p style="font-size:13px;color:#6b7280">You can also chat directly with the employer through OgboJobs.</p>
  `),
});

exports.sendSavedSearchAlert = async (seekerEmail, searchName, jobs) => {
  const jobList = jobs.map(j =>
    `<li><a href="${process.env.FRONTEND_URL}/jobs/${j._id}" style="color:#16a34a;font-weight:600">${j.title}</a> — ${j.company}${j.location ? ` · ${j.location}` : ''}</li>`
  ).join('');
  await send({
    to: seekerEmail,
    subject: `🔔 ${jobs.length} new job${jobs.length > 1 ? 's' : ''} matching "${searchName}"`,
    html: wrap(`
      <h2>New jobs for you!</h2>
      <p>We found <strong>${jobs.length} new job${jobs.length > 1 ? 's' : ''}</strong> matching your saved search <strong>"${searchName}"</strong>:</p>
      <ul>${jobList}</ul>
      <a href="${process.env.FRONTEND_URL}/jobs" class="btn">See All Jobs →</a>
      <div class="divider"></div>
      <p style="font-size:13px;color:#6b7280">Manage your saved searches and alert preferences in your <a href="${process.env.FRONTEND_URL}/saved-jobs">OgboJobs dashboard</a>.</p>
    `),
  });
};

exports.sendPasswordReset = (email, link) => send({
  to: email,
  subject: '🔑 Reset your OgboJobs password',
  html: wrap(`
    <h2>Password Reset Request</h2>
    <p>We received a request to reset the password for your OgboJobs account. Click the button below to create a new password:</p>
    <a href="${link}" class="btn">Reset My Password →</a>
    <div class="divider"></div>
    <p style="font-size:13px;color:#6b7280">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
  `),
});

// ── Admin bulk mail ────────────────────────────────────────────────────────────

/**
 * Send a single branded email to one address.
 * The admin's custom HTML is injected inside the OgboJobs wrapper.
 */
exports.sendSingleEmail = (to, subject, bodyHtml) =>
  send({ to, subject, html: wrap(bodyHtml) });

/**
 * Send bulk emails in controlled batches of 10 with 1-second delays
 * so we don't blow SMTP rate limits.
 * Returns { sent, failed, errors }
 */
exports.sendBulkEmail = async (emails, subject, bodyHtml) => {
  const html = wrap(bodyHtml);
  const BATCH = 10;
  const DELAY = 1000; // ms between batches
  let sent = 0;
  const errors = [];

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(email =>
        send({ to: email, subject, html })
          .then(() => { sent++; })
          .catch(err => errors.push({ email, error: err.message }))
      )
    );
    if (i + BATCH < emails.length) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }

  return { sent, failed: errors.length, errors };
};
