require("dotenv").config();

const express = require("express");
const path = require("path");
const { Resend } = require("resend");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "madalitsotambala2@gmail.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "Tambala Technologies <onboarding@resend.dev>";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});

const requests = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const previous = requests.get(key) || [];
  const recent = previous.filter((time) => now - time < RATE_LIMIT_WINDOW);

  if (recent.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      message: "Too many enquiries from this connection. Please try again later."
    });
  }

  recent.push(now);
  requests.set(key, recent);
  next();
}

function clean(value, maxLength = 500) {
  return String(value ?? "").trim().replace(/[<>]/g, "").slice(0, maxLength);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "Tambala Technologies enquiry API",
    emailConfigured: Boolean(resend)
  });
});

app.post("/api/enquiries", rateLimit, async (req, res) => {
  try {
    // Honeypot field: legitimate visitors should leave this empty.
    if (clean(req.body.website, 200)) {
      return res.status(400).json({
        success: false,
        message: "Invalid enquiry."
      });
    }

    const name = clean(req.body.name, 100);
    const email = clean(req.body.email, 160).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const service = clean(req.body.service, 100);
    const budget = clean(req.body.budget, 100);
    const message = clean(req.body.message, 3000);

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email and message are required."
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address."
      });
    }

    if (!resend) {
      console.error("RESEND_API_KEY is not configured.");
      return res.status(503).json({
        success: false,
        message: "The enquiry service is temporarily unavailable."
      });
    }

    const submittedAt = new Date().toISOString();

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18231d">
        <h2>New Tambala Technologies Project Enquiry</h2>
        <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
        <hr>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone / WhatsApp:</strong> ${escapeHtml(phone || "Not provided")}</p>
        <p><strong>Service:</strong> ${escapeHtml(service || "Not specified")}</p>
        <p><strong>Budget:</strong> ${escapeHtml(budget || "Not specified")}</p>
        <p><strong>Project details:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [CONTACT_EMAIL],
      replyTo: email,
      subject: `New project enquiry — ${name}`,
      html
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(502).json({
        success: false,
        message: "We could not send your enquiry right now. Please try WhatsApp instead."
      });
    }

    return res.status(201).json({
      success: true,
      message: "Thanks! Your enquiry has been sent. We will get back to you soon."
    });
  } catch (error) {
    console.error("Enquiry API error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again."
    });
  }
});

app.use(express.static(path.join(__dirname)));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found."
  });
});

app.listen(PORT, () => {
  console.log(`Tambala Technologies server running on port ${PORT}`);
});
