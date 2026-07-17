const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");

require("dotenv").config();
console.log("Loaded client ID:", !!process.env.GOOGLE_CLIENT_ID);

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ["GET", "POST"] },
});
require("./socket")(io);

// Middleware
// app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      process.env.ALLOWED_ORIGIN || "",
      process.env.NEXT_PUBLIC_APP_URL || "",
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = await User.findOne({ email: profile.emails[0].value });
          if (user) {
            user.googleId = profile.id;
            user.avatar = profile.photos[0]?.value;
            await user.save();
          } else {
            user = await User.create({
              googleId: profile.id,
              name: profile.displayName,
              email: profile.emails[0].value,
              avatar: profile.photos[0]?.value,
              role: "seeker",
              isVerified: true,
            });
          }
        }
        done(null, user);
      } catch (err) {
        console.log(err);
        
        done(err, null);
      }
    },
  ),
);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/company", require("./routes/company"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/saved", require("./routes/saved"));
// app.use("/api/auth/google", require('./config/passport'));

// Messages REST fallback
app.get(
  "/api/messages/:userId",
  require("./middleware/auth").protect,
  async (req, res) => {
    try {
      const Message = require("./models/Message");
      const messages = await Message.find({
        $or: [
          { sender: req.user._id, receiver: req.params.userId },
          { sender: req.params.userId, receiver: req.user._id },
        ],
      })
        .populate("sender", "name avatar")
        .sort("createdAt")
        .lean();
      res.json({ success: true, messages });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// Public sitemap
app.get("/sitemap.xml", async (req, res) => {
  try {
    const Job = require("./models/Job");
    const jobs = await Job.find({ isApproved: true, isActive: true })
      .select("_id updatedAt")
      .lean();
    const base = process.env.FRONTEND_URL;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${base}</loc><priority>1.0</priority></url>
<url><loc>${base}/jobs</loc><priority>0.9</priority></url>
${jobs.map((j) => `<url><loc>${base}/jobs/${j._id}</loc><lastmod>${j.updatedAt?.toISOString().split("T")[0]}</lastmod><priority>0.8</priority></url>`).join("\n")}
</urlset>`;
    res.header("Content-Type", "application/xml").send(xml);
  } catch (err) {
    res.status(500).send("Error generating sitemap");
  }
});

// Health check
app.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date() }),
);

// 404
app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ success: false, message: err.message || "Server error" });
});

// Connect DB & start
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    // Start cron jobs
    require("./cron/emailAlerts");
    require("./cron/archiveJobs");

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });

module.exports = { app, server };
