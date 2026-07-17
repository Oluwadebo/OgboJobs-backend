const axios = require('axios');

exports.verifyRecaptcha = async (req, res, next) => {
  console.log("RECAPTCHA_SECRET_KEY exists:", !!process.env.RECAPTCHA_SECRET_KEY);
  const token = req.body.recaptchaToken;
  if (!token) return res.status(400).json({ success: false, message: 'reCAPTCHA token required' });

  try {
    const { data } = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      { params: { secret: process.env.RECAPTCHA_SECRET_KEY, response: token } }
    );
console.log("Google reCAPTCHA API Response:", data);
    if (!data.success || data.score < 0.5) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'reCAPTCHA service error' });
  }
};
