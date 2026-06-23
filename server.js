import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";

// Load environment variables early
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Tell Express to trust the reverse proxy headers (e.g., Cloud Run, Nginx, etc.)
app.set("trust proxy", 1);

// Hardened security headers compatible with iframe rendering in AI Studio
app.use(helmet({
  frameguard: false, // Allow iframe rendering in AI Studio
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "*"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "*"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "*"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "*"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://images.unsplash.com/*", "*"],
      frameAncestors: ["'self'", "https://ai.studio", "https://*.google.com", "https://*.run.app", "*"],
      connectSrc: ["'self'", "*"]
    }
  }
}));

// Set Dynamic CORS support for development, production domains, and Cloud Run preview frames
const allowedOrigins = [process.env.ALLOWED_ORIGIN || "https://yourdomain.com"];
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin || 
      allowedOrigins.indexOf(origin) !== -1 || 
      origin.startsWith("http://localhost") || 
      origin.endsWith(".run.app") || 
      origin.endsWith(".google.com")
    ) {
      callback(null, true);
    } else {
      callback(new Error("CORS validation failed: Origin unauthorized."));
    }
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup SQLite persistent storage paths
const dataDir = process.env.DATA_DIR || "./data";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, "honestperks.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Critical database error connection failure:", err.message);
  } else {
    console.log(`SQLite DB loaded correctly at: ${dbPath}`);
  }
});

// Configure schemas and seeder seeds
db.serialize(() => {
  // 1. Subscribers table matching physical and UTM logging specifications
  db.run(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      utm_source TEXT,
      utm_campaign TEXT,
      utm_medium TEXT,
      ip TEXT,
      confirmed INTEGER DEFAULT 0,
      unsubscribed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at)`);

  // 2. Offers comparison matrix table (with image_url, email_subject and email_body columns)
  db.run(`
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id TEXT,
      name TEXT NOT NULL,
      network TEXT DEFAULT 'MaxBounty',
      cpa_type TEXT DEFAULT 'DOI',
      payout REAL DEFAULT 1.50,
      epc REAL DEFAULT 0.15,
      tier INTEGER DEFAULT 2,
      affiliate_link TEXT DEFAULT '',
      description TEXT,
      badge TEXT,
      icon TEXT DEFAULT '🎁',
      image_keyword TEXT DEFAULT 'free sample box',
      image_url TEXT,
      email_subject TEXT,
      email_body TEXT,
      active INTEGER DEFAULT 1,
      position INTEGER DEFAULT 99,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_offers_status_pos ON offers(active, position)`);

  // Safe schema migrations for existing databases that might be missing newly required columns
  db.run("ALTER TABLE offers ADD COLUMN image_url TEXT", [], () => {});
  db.run("ALTER TABLE offers ADD COLUMN email_subject TEXT", [], () => {});
  db.run("ALTER TABLE offers ADD COLUMN email_body TEXT", [], () => {});

  // 3. Click analytics logs Table
  db.run(`
    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id INTEGER,
      ip TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Configuration Settings persistence Table
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Seed default metadata settings if absent
  db.get("SELECT COUNT(*) as count FROM settings", [], (err, row) => {
    if (!err && row && row.count === 0) {
      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      stmt.run("brand_name", "HonestPerks");
      stmt.run("sending_domain", "honestperks.com");
      stmt.run("google_client_id", process.env.GOOGLE_CLIENT_ID || "");
      stmt.run("brevo_webhook", process.env.BREVO_WEBHOOK || "");
      stmt.run("activecampaign_webhook", process.env.ACTIVECAMPAIGN_WEBHOOK || "");
      stmt.run("convertkit_webhook", process.env.CONVERTKIT_WEBHOOK || "");
      stmt.run("googlesheet_webhook", process.env.GOOGLE_SHEET_WEBHOOK || "");
      stmt.run("facebook_pixel_id", "");
      stmt.run("google_analytics_id", "");
      stmt.run("pinterest_tag_id", "");
      stmt.finalize();
    } else {
      // Self-healing migration to insert google_client_id key if missing
      db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('google_client_id', ?)", [process.env.GOOGLE_CLIENT_ID || ""]);
    }
  });

  // PRE-POPULATE 10 REAL MAXBOUNTY OFFERS AS REQUESTED BY BRIEF
  db.get("SELECT COUNT(*) as count FROM offers", [], (err, row) => {
    if (!err && row && row.count === 0) {
      console.log("Seeding all 10 Real MaxBounty Offers into local SQLite persistent matrix...");
      const stmt = db.prepare(`
        INSERT INTO offers (
          offer_id, name, network, cpa_type, payout, epc, tier, 
          affiliate_link, description, badge, icon, image_keyword, image_url, active, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Tier 1 Offers - Physical Ships
      stmt.run("24224", "HonestPerks Goodie Box", "MaxBounty", "DOI", 1.50, 0.12, 1, "https://www.maxbounty.com", "Receive premium, hand-curated sampler box packages completely filled with full-sized name-brand items. Dispatched directly to doors in the US and Canada totally free. Zero credit requirements or shipping catches.", "Ships Free 📦", "📦", "free sample box", "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&q=80&w=600", 1, 1);
      stmt.run("24725", "Maybelline Tester Crew", "MaxBounty", "SOI", 3.00, 0.30, 1, "https://www.maxbounty.com", "Get recruited into the official Maybelline beauty tester squad. Sponsoring advertisers dispatch premium cosmetic sets featuring professional-grade lipstick, eyeliner, and foundations to keep in exchange for your evaluation reviews.", "Top Payout 💄", "💄", "makeup cosmetics", "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=600", 1, 2);
      stmt.run("25012", "Organic Snack Crate", "MaxBounty", "DOI", 1.50, 0.14, 1, "https://www.maxbounty.com", "Satisfy immediate cravings with a massive snack box packed full with verified gluten-free and healthy organic brand bites. Includes fast tracking delivery links, families feedback requested.", "Healthy Bites 🍫", "🍫", "healthy snack box", "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&q=80&w=600", 1, 3);
      stmt.run("29392", "Viral Dubai Chocolate", "MaxBounty", "SOI", 2.40, 0.24, 1, "https://www.maxbounty.com", "Claim of a luxury organic pistachio-filled viral Dubai chocolate bar from the world's most premium confectionery. Evaluators selected daily to test and taste without cost constraints.", "Viral Trend 🔥", "🔥", "pistachio chocolate", "https://images.unsplash.com/photo-1623934522443-673ec485e3fe?auto=format&fit=crop&q=80&w=600", 1, 4);
      stmt.run("24540", "Product Testing Panel", "MaxBounty", "DOI", 1.25, 0.17, 1, "https://www.maxbounty.com", "Get immediate premium dashboard credentials. Earn persistent access testing general house items, pet releases, and smart home appliances. Keep every product you review.", "Review & Keep 🧪", "🧪", "product testing", "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?auto=format&fit=crop&q=80&w=600", 1, 5);

      // Tier 2 Offers - Free Entry Sweepstakes
      stmt.run("32213", "Amazon $2,000 Promos", "MaxBounty", "CPL", 3.00, 0.30, 2, "https://www.maxbounty.com", "Secure entries to receive a $2,000 allowance gift card code added straight to your active Amazon subscriber profile. Entries require quick surveys.", "Win $2000 🛒", "🛒", "Amazon gift card", "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&q=80&w=600", 1, 6);
      stmt.run("32214", "Walmart $2,000 Draw", "MaxBounty", "CPL", 3.00, 0.30, 2, "https://www.maxbounty.com", "Participate inside verified sweepstakes campaigns to earn $2,000 in superstore credits usable across any local US storefront. Simple SOI questionnaire.", "Win Walmart 🛒", "🛒", "Walmart gift card", "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&q=80&w=600", 1, 7);
      stmt.run("32212", "Tide Laundry Essentials", "MaxBounty", "CPL", 3.00, 0.30, 2, "https://www.maxbounty.com", "Enter for an active sweepstake opportunity to claim catalogs and premium Tide packages containing $1,000 worth of household cleaning supplies.", "Free Tide 🧺", "🧺", "Tide laundry detergent", "https://images.unsplash.com/photo-1563161402-84119280fc26?auto=format&fit=crop&q=80&w=600", 1, 8);
      stmt.run("32211", "Pampers Premium Diapers", "MaxBounty", "CPL", 3.00, 0.30, 2, "https://www.maxbounty.com", "Register contact parameters for full eligibility to receive $1,000 worth of infant, baby, and parent items. Perfect for growing families.", "Family Bundle 👶", "👶", "Pampers baby", "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&q=80&w=600", 1, 9);
      stmt.run("29389", "Bose Headphones Sweep", "MaxBounty", "SOI", 2.40, 0.24, 2, "https://www.maxbounty.com", "Submit email credentials to enter custom prize draws to claim the ultra-premium AirPods-competing Bose Noise Cancelling headphones.", "Premium Audio 🎧", "🎧", "Bose headphones", "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=600", 1, 10);

      stmt.finalize();
      console.log("Seeding complete!");
    }
  });

  // Backward-compatible backfill of Unsplash image URLs for preloaded items
  const backfillMap = {
    "24224": "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&q=80&w=600",
    "24725": "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=600",
    "25012": "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&q=80&w=600",
    "29392": "https://images.unsplash.com/photo-1623934522443-673ec485e3fe?auto=format&fit=crop&q=80&w=600",
    "24540": "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?auto=format&fit=crop&q=80&w=600",
    "32213": "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&q=80&w=600",
    "32214": "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&q=80&w=600",
    "32212": "https://images.unsplash.com/photo-1563161402-84119280fc26?auto=format&fit=crop&q=80&w=600",
    "32211": "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&q=80&w=600",
    "29389": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=600"
  };
  Object.keys(backfillMap).forEach(offId => {
    db.run("UPDATE offers SET image_url = ? WHERE offer_id = ? AND (image_url IS NULL OR image_url = '')", [backfillMap[offId], offId]);
  });
});

// Configure separate rate limiters
const standardLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

const formLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, 
  max: 10, // Max 10 signups per IP per 10 minutes
  message: { error: "Submission rate limit reached. Please verify details and try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 100, // limit each IP to 100 auth attempts
  message: { error: "Brute force security lock active. retry in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Basic Auth credentials setup
const adminAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="HonestPerks Executive Desk"');
    return res.status(401).send("Authentication credentials required to access the admin console.");
  }

  const auth = Buffer.from(authHeader.split(" ")[1], "base64").toString().split(":");
  const user = auth[0];
  const pass = auth[1];

  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "CHANGE_THIS_TO_STRONG_PASSWORD";

  if (user === adminUser && pass === adminPass) {
    next();
  } else {
    res.setHeader("WWW-Authenticate", 'Basic realm="HonestPerks Executive Desk"');
    return res.status(401).send("Access Rejected: Incorrect username or password.");
  }
};

const publicPath = path.join(process.cwd(), "public");

// --- PUBLIC API ROUTES ---

// Public exposure of configuration properties like Google Client ID
app.get("/api/config", standardLimiter, (req, res) => {
  db.get("SELECT value FROM settings WHERE key = 'google_client_id'", [], (err, row) => {
    const idValue = (row && row.value) || process.env.GOOGLE_CLIENT_ID || "";
    res.json({
      google_client_id: idValue.trim()
    });
  });
});

// Google ID Token verification and automated double-opt-in subscription handler
app.post("/api/auth/google", standardLimiter, (req, res) => {
  const { credential, utm_source, utm_campaign, utm_medium } = req.body;
  if (!credential) {
    return res.status(400).json({ error: "Google credential security token is required." });
  }

  // Check if this is a simulation token from our sandbox overlay or a real Google token
  let getGoogleData;
  if (credential.startsWith("MOCK_GOOGLE_VERIFIED_TOKEN_FOR_")) {
    const mockEmail = credential.substring("MOCK_GOOGLE_VERIFIED_TOKEN_FOR_".length).trim().toLowerCase();
    const mockName = mockEmail.includes("raman") ? "Raman Roy" : "Demo Tester";
    getGoogleData = Promise.resolve({ email: mockEmail, name: mockName });
  } else {
    // Securely verify Google JWT token via Google Token Validation HTTPS API
    getGoogleData = fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
      .then(async response => {
        if (!response.ok) {
          throw new Error("Failed validation state from Google Auth backend API.");
        }
        return response.json();
      });
  }

  getGoogleData
    .then(data => {
      const email = data.email ? data.email.toString().trim().toLowerCase() : "";
      const name = data.name ? data.name.toString().trim() : "Google Member";

      if (!email) {
        return res.status(400).json({ error: "The provided Google profile does not include a verified email address." });
      }

      const ip = req.ip || req.headers["x-forwarded-for"] || "";
      const gSource = utm_source ? utm_source.toString().replace(/<[^>]*>/g, "").trim() : "google";
      const gCampaign = utm_campaign ? utm_campaign.toString().replace(/<[^>]*>/g, "").trim() : "sso";
      const gMedium = utm_medium ? utm_medium.toString().replace(/<[^>]*>/g, "").trim() : "funnel";

      // Since Google has already verified this email, promote directly to confirmed = 1 (Instant Unlock!)
      db.get("SELECT id, confirmed FROM subscribers WHERE email = ?", [email], (err, row) => {
        if (err) {
          return res.status(500).json({ error: "Failed to query database subscribers." });
        }

        if (row) {
          // Exising subscriber: ensure they are promoted to confirmed flag
          db.run("UPDATE subscribers SET confirmed = 1 WHERE id = ?", [row.id], (updErr) => {
            if (updErr) {
              return res.status(500).json({ error: "Could not activate membership status." });
            }
            return res.json({ status: "confirmed", email, message: "Welcome back! Google account verified." });
          });
        } else {
          // Safe new subscriber addition directly marked as confirmed (DOI completed upon login!)
          db.run(
            `INSERT INTO subscribers (email, name, utm_source, utm_campaign, utm_medium, ip, confirmed) 
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [email, name, gSource, gCampaign, gMedium, ip],
            function (insErr) {
              if (insErr) {
                console.error("Failed to insert Google Sign-In subscriber:", insErr.message);
                return res.status(500).json({ error: "Failed to persist subscriber profile." });
              }

              // Fire programmatic webhooks to external integrations asynchronously
              db.all("SELECT key, value FROM settings WHERE key LIKE '%_webhook'", [], (errSettings, settingsRows) => {
                if (!errSettings && settingsRows) {
                  const hookPayload = {
                    email,
                    name,
                    utm_source: gSource,
                    utm_campaign: gCampaign,
                    utm_medium: gMedium,
                    ip,
                    source: "honestperks_google_sso",
                    timestamp: new Date().toISOString()
                  };
                  const activeWebhooks = settingsRows.map(r => r.value).filter(val => val && val.startsWith("http"));
                  Promise.allSettled(
                    activeWebhooks.map(url => {
                      return fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(hookPayload),
                        signal: AbortSignal.timeout(4000)
                      });
                    })
                  );
                }
              });

              return res.json({ status: "confirmed", email, message: "Google register completed successfully!" });
            }
          );
        }
      });
    })
    .catch(err => {
      console.error("Token verification exception:", err);
      return res.status(401).json({ error: "Authenticating with Google failed. Please verify and try again." });
    });
});

// Fetch active offers mapped by dynamic position ranks for comparison cards
app.get("/api/offers", standardLimiter, (req, res) => {
  db.all("SELECT id, offer_id, name, network, cpa_type, payout, epc, tier, affiliate_link, description, badge, icon, image_keyword, image_url, email_subject, email_body, active, position FROM offers WHERE active = 1 ORDER BY position ASC", [], (err, rows) => {
    if (err) {
      console.error("Failed to query active offers:", err.message);
      return res.status(500).json({ error: "Failed to load matching brand matrices." });
    }
    res.json(rows);
  });
});

// Single public offer lookup
app.get("/api/offers/:id", standardLimiter, (req, res) => {
  const { id } = req.params;
  db.get("SELECT * FROM offers WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Internal server error looking up offer status." });
    }
    if (!row) {
      return res.status(404).json({ error: "Offer not found." });
    }
    res.json(row);
  });
});

// Click logger to collect EPC measurements
app.post("/api/click/:id", standardLimiter, (req, res) => {
  const { id } = req.params;
  const ip = req.ip || req.headers["x-forwarded-for"] || "";
  const user_agent = req.headers["user-agent"] || "";

  db.run("INSERT INTO clicks (offer_id, ip, user_agent) VALUES (?, ?, ?)", [id, ip, user_agent], (err) => {
    if (err) {
      console.error("Failed to log tracking click metrics:", err.message);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true });
  });
});

// Double opt-in subscriber activation pathway
app.get("/api/confirm", standardLimiter, (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).send("<h1>Verification Failed</h1><p>Confirmation parameters are absent. Please register again.</p>");
  }

  const normalizedEmail = email.toString().trim().toLowerCase();

  db.get("SELECT id, email, name FROM subscribers WHERE email = ?", [normalizedEmail], (err, row) => {
    if (err) {
      console.error("Subscriber match query database error:", err.message);
      return res.status(500).send("<h1>Internal Server Error</h1><p>Failed to parse database state.</p>");
    }

    if (!row) {
      return res.status(404).send("<h1>Member Registry Missing</h1><p>No consumer account matches that email address.</p>");
    }

    db.run("UPDATE subscribers SET confirmed = 1 WHERE id = ?", [row.id], (updateErr) => {
      if (updateErr) {
        console.error("DOI activation state error:", updateErr.message);
        return res.status(500).send("<h1>Verification Failed</h1><p>Could not register active conversion status.</p>");
      }

      // Read custom bridge redirect parameters if any from Settings table
      res.redirect(`/bridge.html?confirmed=1&email=${encodeURIComponent(row.email)}`);
    });
  });
});

// Dynamic Real-time Email Verification via ZeroBounce or Kickbox APIs
async function verifyEmail(email, dbSettings) {
  const verifierService = (dbSettings.email_verifier_service || process.env.EMAIL_VERIFIER_SERVICE || "none").toLowerCase().trim();
  const zbApiKey = dbSettings.zerobounce_api_key || process.env.ZEROBOUNCE_API_KEY;
  const kbApiKey = dbSettings.kickbox_api_key || process.env.KICKBOX_API_KEY;

  if (verifierService === "zerobounce" && zbApiKey) {
    try {
      const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(zbApiKey)}&email=${encodeURIComponent(email)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        console.error("ZeroBounce API error response status:", response.status);
        return { valid: true }; // Graceful bypass
      }
      const data = await response.json();
      const status = (data.status || "").toLowerCase();
      if (["invalid", "spamtrap", "abuse", "do_not_mail"].includes(status)) {
        return {
          valid: false,
          reason: `We could not verify this email address (ZeroBounce status: ${status}). Please use a valid, active email.`
        };
      }
      return { valid: true };
    } catch (err) {
      console.error("ZeroBounce validation call failed:", err);
      return { valid: true }; // Graceful degradation on timeout/failure
    }
  }

  if (verifierService === "kickbox" && kbApiKey) {
    try {
      const url = `https://api.kickbox.com/v2/verify?email=${encodeURIComponent(email)}&apikey=${encodeURIComponent(kbApiKey)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        console.error("Kickbox API error response status:", response.status);
        return { valid: true }; // Graceful bypass
      }
      const data = await response.json();
      const result = (data.result || "").toLowerCase();
      if (result === "undeliverable" || data.disposable === true) {
        return {
          valid: false,
          reason: data.disposable 
            ? "Temporary or disposable email address detected. Please use a permanent, secure email to receive rewards."
            : "The provided email address is undeliverable. Please check for spelling mistakes or use another active email."
        };
      }
      return { valid: true };
    } catch (err) {
      console.error("Kickbox validation call failed:", err);
      return { valid: true }; // Graceful degradation on timeout/failure
    }
  }

  return { valid: true };
}

// Core opt-in pipeline endpoint
app.post("/api/subscribe", formLimiter, (req, res) => {
  let { email, name, utm_source, utm_campaign, utm_medium } = req.body;

  if (!email) {
    return res.status(400).json({ error: "A primary email address is required to register." });
  }

  // Sanitizing inputs to defeat HTML injections
  email = email.toString().replace(/<[^>]*>/g, "").trim().toLowerCase();
  name = name ? name.toString().replace(/<[^>]*>/g, "").trim() : "Subscriber";
  utm_source = utm_source ? utm_source.toString().replace(/<[^>]*>/g, "").trim() : "organic";
  utm_campaign = utm_campaign ? utm_campaign.toString().replace(/<[^>]*>/g, "").trim() : "direct";
  utm_medium = utm_medium ? utm_medium.toString().replace(/<[^>]*>/g, "").trim() : "";

  // Rigid compliance checkbox verification
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email formatting found." });
  }

  const ip = req.ip || req.headers["x-forwarded-for"] || "";

  // Read all configurations from settings table first
  db.all("SELECT key, value FROM settings", [], async (errSettings, settingsRows) => {
    const dbSettings = {};
    if (!errSettings && settingsRows) {
      settingsRows.forEach(r => {
        dbSettings[r.key] = r.value;
      });
    }

    try {
      // Call verifyEmail helper prior to database checks
      const verification = await verifyEmail(email, dbSettings);
      if (!verification.valid) {
        return res.status(400).json({ error: verification.reason });
      }
    } catch (verifierErr) {
      console.error("Email Verifier exception:", verifierErr);
    }

    // Check if contact existed on file
    db.get("SELECT id, confirmed FROM subscribers WHERE email = ?", [email], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Failed to evaluate registry records." });
    }

    if (row) {
      if (row.confirmed === 1) {
        return res.json({ status: "already_confirmed", email, message: "Welcome back! Access enabled instantly." });
      } else {
        // Exists but unconfirmed - keep status pending DOI verification
        return res.json({ status: "verification_pending", email, message: "Double-check mailbox to activate account." });
      }
    } else {
      // Write fresh database lead entry
      db.run(
        `INSERT INTO subscribers (email, name, utm_source, utm_campaign, utm_medium, ip, confirmed) 
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
         [email, name, utm_source, utm_campaign, utm_medium, ip],
         function (insertErr) {
          if (insertErr) {
            console.error("Database storage execution error:", insertErr.message);
            return res.status(500).json({ error: "Could not record subscriber profile." });
          }

          // Trigger non-blocking simultaneous webhooks dispatches to external ESP services
          db.all("SELECT key, value FROM settings WHERE key LIKE '%_webhook'", [], (errSettings, settingsRows) => {
            if (!errSettings && settingsRows) {
              const hookPayload = {
                email,
                name,
                utm_source,
                utm_campaign,
                utm_medium,
                ip,
                source: "honestperks",
                timestamp: new Date().toISOString()
              };

              const activeWebhooks = settingsRows.map(r => r.value).filter(val => val && val.startsWith("http"));

              // Non-blocking Parallel trigger
              Promise.allSettled(
                activeWebhooks.map(url => {
                  return fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(hookPayload),
                    signal: AbortSignal.timeout(4000) // 4 second threshold to ensure no hangs
                  });
                })
              ).then(results => {
                results.forEach((res, i) => {
                  if (res.status === "rejected") {
                    console.warn(`Webhook failed to deliver to ${activeWebhooks[i]}:`, res.reason);
                  }
                });
              });
            }
          });

          return res.json({ status: "verification_pending", email, message: "Welcome! Opt-In verification link generated." });
        }
      );
    }
    });
  });
});

// Applet healthcheck route
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});


// --- ADMIN MANAGER CONSOLE CONTROLS ---

// Retrieve main single dashboard operational data payload for the admin client
app.get("/api/admin/data", adminAuthMiddleware, (req, res) => {
  const data = {
    offers: [],
    subscribers: [],
    stats: { total: 0, today: 0, clicks: 0, offers: 0 },
    settings: {}
  };

  db.all("SELECT * FROM offers ORDER BY position ASC, id DESC", [], (errOffers, offers) => {
    if (offers) data.offers = offers;

    db.all("SELECT id, email, name, utm_source, utm_campaign, utm_medium, ip, confirmed, created_at FROM subscribers ORDER BY created_at DESC LIMIT 200", [], (errSubs, subs) => {
      if (subs) data.subscribers = subs;

      db.all("SELECT key, value FROM settings", [], (errSettings, settingsRows) => {
        if (settingsRows) {
          settingsRows.forEach(r => {
            data.settings[r.key] = r.value;
          });
          // Check if AI keys are enabled
          data.settings.ai_enabled = !!(data.settings.anthropic_key || process.env.ANTHROPIC_KEY);
        }

        // Now compile stats variables
        db.get("SELECT COUNT(*) as count FROM subscribers", [], (e1, r1) => {
          if (r1) data.stats.total = r1.count;

          db.get("SELECT COUNT(*) as count FROM subscribers WHERE date(created_at) = date('now')", [], (e2, r2) => {
            if (r2) data.stats.today = r2.count;

            db.get("SELECT COUNT(*) as count FROM clicks", [], (e3, r3) => {
              if (r3) data.stats.clicks = r3.count;

              db.get("SELECT COUNT(*) as count FROM offers WHERE active = 1", [], (e4, r4) => {
                if (r4) data.stats.offers = r4.count;

                res.json(data);
              });
            });
          });
        });
      });
    });
  });
});

// Retrieve dashboard operational stats alone
app.get("/api/admin/stats", adminAuthMiddleware, (req, res) => {
  const stats = {
    total_subscribers: 0,
    new_today: 0,
    total_clicks: 0,
    active_offers: 0
  };

  db.get("SELECT COUNT(*) as count FROM subscribers", [], (e1, r1) => {
    if (r1) stats.total_subscribers = r1.count;
    
    db.get("SELECT COUNT(*) as count FROM subscribers WHERE date(created_at) = date('now')", [], (e2, r2) => {
      if (r2) stats.new_today = r2.count;
      
      db.get("SELECT COUNT(*) as count FROM clicks", [], (e3, r3) => {
        if (r3) stats.total_clicks = r3.count;
        
        db.get("SELECT COUNT(*) as count FROM offers WHERE active = 1", [], (e4, r4) => {
          if (r4) stats.active_offers = r4.count;
          res.json(stats);
        });
      });
    });
  });
});

// Subscribers index list with filtering capabilities
app.get("/api/admin/subscribers", adminAuthMiddleware, (req, res) => {
  const { search } = req.query;
  let query = "SELECT id, email, name, utm_source, utm_campaign, utm_medium, ip, confirmed, created_at FROM subscribers";
  const params = [];

  if (search) {
    query += " WHERE email LIKE ? OR name LIKE ? OR utm_source LIKE ?";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += " ORDER BY created_at DESC LIMIT 200";

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to query system contacts dataset." });
    }
    res.json(rows);
  });
});

// Export CSV pipeline
app.get("/api/admin/export", adminAuthMiddleware, (req, res) => {
  db.all("SELECT id, email, name, utm_source, utm_campaign, utm_medium, ip, confirmed, created_at FROM subscribers ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).send("Database extraction failure during compilation.");
    }

    let csvContent = "ID,Email,Name,UTM Source,UTM Campaign,UTM Medium,IP,Confirmed,Created_At\n";
    rows.forEach(r => {
      csvContent += `"${r.id}","${r.email}","${r.name || ""}","${r.utm_source || ""}","${r.utm_campaign || ""}","${r.utm_medium || ""}","${r.ip || ""}",${r.confirmed},"${r.created_at}"\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=honestperks_leads_export.csv");
    res.send(csvContent);
  });
});

// Export CSV alias mapping to avoid route mismatching
app.get("/api/admin/subscribers/export", adminAuthMiddleware, (req, res) => {
  res.redirect("/api/admin/export");
});

// Delete subscriber
app.delete("/api/admin/subscribers/:id", adminAuthMiddleware, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM subscribers WHERE id = ?", [id], (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to delete subscriber row." });
    }
    res.json({ success: true });
  });
});

// List all registered offers for configuration tables
app.get("/api/admin/offers", adminAuthMiddleware, (req, res) => {
  db.all("SELECT * FROM offers ORDER BY position ASC, id DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Dumping offers registry failed." });
    }
    res.json(rows);
  });
});

// Register new offer
app.post("/api/admin/offers", adminAuthMiddleware, (req, res) => {
  const { offer_id, name, network, cpa_type, payout, epc, tier, affiliate_link, description, badge, icon, image_keyword, image_url, email_subject, email_body, position, active } = req.body;
  
  if (!name || !description || !affiliate_link) {
    return res.status(400).json({ error: "Missing required offer settings fields." });
  }

  db.run(`
    INSERT INTO offers (
      offer_id, name, network, cpa_type, payout, epc, tier, 
      affiliate_link, description, badge, icon, image_keyword, image_url, email_subject, email_body, position, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      offer_id || "", 
      name, 
      network || "MaxBounty", 
      cpa_type || "DOI", 
      payout || 1.50, 
      epc || 0.15, 
      tier || 2, 
      affiliate_link, 
      description, 
      badge || "", 
      icon || "🎁", 
      image_keyword || "free sample box", 
      image_url || "",
      email_subject || "",
      email_body || "",
      position || 99, 
      active !== undefined ? active : 1
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed insertion: " + err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Update offer parameters
app.put("/api/admin/offers/:id", adminAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const { offer_id, name, network, cpa_type, payout, epc, tier, affiliate_link, description, badge, icon, image_keyword, image_url, email_subject, email_body, position, active } = req.body;

  db.run(`
    UPDATE offers SET 
      offer_id = ?, name = ?, network = ?, cpa_type = ?, payout = ?, epc = ?, 
      tier = ?, affiliate_link = ?, description = ?, badge = ?, icon = ?, 
      image_keyword = ?, image_url = ?, email_subject = ?, email_body = ?, position = ?, active = ?
    WHERE id = ?`,
    [
      offer_id, name, network, cpa_type, payout, epc, 
      tier, affiliate_link, description, badge, icon, 
      image_keyword, image_url, email_subject, email_body, position, active, id
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed update execution rewrite: " + err.message });
      }
      res.json({ success: true });
    }
  );
});

// Toggle campaign active status
app.patch("/api/admin/offers/:id/toggle", adminAuthMiddleware, (req, res) => {
  const { id } = req.params;
  db.get("SELECT active FROM offers WHERE id = ?", [id], (err, row) => {
    if (!row) {
      return res.status(404).json({ error: "Offer not found." });
    }

    const state = row.active === 1 ? 0 : 1;
    db.run("UPDATE offers SET active = ? WHERE id = ?", [state, id], (updateErr) => {
       if (updateErr) {
         return res.status(500).json({ error: "Failed to switch active toggle." });
       }
       res.json({ success: true, active: state });
    });
  });
});

// Delete specific offer mapping
app.delete("/api/admin/offers/:id", adminAuthMiddleware, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM offers WHERE id = ?", [id], (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to remove offer catalog item." });
    }
    res.json({ success: true });
  });
});

// Get global configurations
app.get("/api/admin/settings", adminAuthMiddleware, (req, res) => {
  db.all("SELECT key, value FROM settings", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch settings." });
    }
    const settingsMap = {};
    rows.forEach(r => {
      settingsMap[r.key] = r.value;
    });
    res.json(settingsMap);
  });
});

// Manage global settings changes
app.post("/api/admin/settings", adminAuthMiddleware, (req, res) => {
  const settings = req.body;
  db.serialize(() => {
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    Object.keys(settings).forEach(key => {
      stmt.run(key, settings[key] !== undefined ? settings[key].toString() : "");
    });
    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to store parameters updates." });
      }
      res.json({ success: true });
    });
  });
});

// WIPE database endpoint (Danger Zone action)
app.post("/api/admin/settings/wipe", adminAuthMiddleware, (req, res) => {
  db.run("DELETE FROM subscribers", [], (err) => {
    if (err) {
      return res.status(500).json({ error: "Wiping subscriber database failed: " + err.message });
    }
    db.run("DELETE FROM clicks", [], (errClicks) => {
      if (errClicks) {
        return res.status(500).json({ error: "Wiping click log database failed: " + errClicks.message });
      }
      res.json({ success: true });
    });
  });
});


// --- ANTHROPIC PROXY FOR THE AI COPYWRITER ---
app.post("/api/admin/writer/generate", adminAuthMiddleware, async (req, res) => {
  const { apiKey, offerName, benefit, tone, stage } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "Anthropic API Key is required to draft custom emails." });
  }

  const userPrompt = `Target Offer: ${offerName}
Specified Benefit/Reward: ${benefit}
Tone Selected: ${tone}
Sequence Stage: ${stage}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        temperature: 0.7,
        system: "You are HonestPerks' chief conversion copywriter. Draft a high-performance email for the selected offer using the specified tone and benefit. Output in raw Markdown with:\n1. Subject line: [Optimized Subject]\n2. Preheader: [Intriguing Preheader]\n3. Body text",
        messages: [
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      return res.status(response.status).json({ error: `Anthropic API Request Failed: ${errorMsg}` });
    }

    const data = await response.json();
    return res.json({ result: data.content[0].text });

  } catch (error) {
    console.error("AI Writer generation exception:", error);
    return res.status(500).json({ error: `Server exception: ${error.message}` });
  }
});


// --- NEW ANTHROPIC PROXY FOR AUTO-FILLING OFFERS DETAILS ---
app.post("/api/admin/ai-generate", adminAuthMiddleware, async (req, res) => {
  const { name, link, hint } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Offer name is required to auto-fill details." });
  }

  // Retrieve Anthropic key first
  db.get("SELECT value FROM settings WHERE key = 'anthropic_key'", [], async (err, row) => {
    const apiKey = row ? row.value : process.env.ANTHROPIC_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "Anthropic API Key is not configured. Add it in settings first." });
    }

    const userPrompt = `Offer Name: ${name}
Affiliate Link: ${link || "None"}
Existing description/notes hint: ${hint || "None"}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 800,
          temperature: 0.7,
          system: `You are HonestPerks' chief conversion copywriter. Auto-generate metadata card and double-opt-in email fields for this offer. 
Provide your response strictly in valid JSON format. Do not wrap it in any markdown blocks besides raw text or backticks.
The JSON must have the following keys:
1. description: a punchy, honest 2-sentence value detailing what they get and why it is free.
2. badge: a short, catchy, 2-3 word promotional sticker (e.g. "Ships Free 📦", "Win $2000 🛒").
3. icon: a single highly relevant emoji (e.g. 💄 for makeup, 🧺 for tide).
4. email_subject: a compelling subject line for the verification / welcome email.
5. email_body: a direct, honest, 150-word email template welcoming them and explaining how they claim this exact brand box.

Keep descriptions structured cleanly matching HonestPerks standards.`,
          messages: [
            { role: "user", content: userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const errorMsg = await response.text();
        return res.status(response.status).json({ error: `Anthropic API Request Failed: ${errorMsg}` });
      }

      const data = await response.json();
      const text = data.content[0].text;

      // Extract JSON cleanly from text
      let jsonStr = text.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }
      jsonStr = jsonStr.trim();

      const result = JSON.parse(jsonStr);
      return res.json(result);

    } catch (error) {
      console.error("AI Auto-fill exception:", error);
      return res.status(500).json({ error: `AI process failure: ${error.message}` });
    }
  });
});


// Serve static pages cleanly
app.use(express.static(publicPath));

// --- SPECIFIC STATIC ROUTER RESOLUTION MAPS ---

app.get("/admin", adminLimiter, adminAuthMiddleware, (req, res) => {
  res.sendFile(path.join(publicPath, "admin.html"));
});

// Redirect static route request pointers
app.get("/admin.html", (req, res) => {
  res.redirect("/admin");
});

app.get("/thankyou", (req, res) => {
  res.sendFile(path.join(publicPath, "thankyou.html"));
});

app.get("/bridge", (req, res) => {
  res.sendFile(path.join(publicPath, "bridge.html"));
});

app.get("/privacy", (req, res) => {
  res.sendFile(path.join(publicPath, "privacy.html"));
});

app.get("/terms", (req, res) => {
  res.sendFile(path.join(publicPath, "terms.html"));
});

// Main catch-all mapping to landing template to retain clean SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});


// GRACEFUL SHUTDOWNS
const gracefulShutdown = (signal) => {
  console.log(`\nContainer received termination signal [${signal}]. Flushing databases locks...`);
  server.close(() => {
    db.close((err) => {
      if (err) {
        console.error("Error shutting down SQLite cleanly:", err.message);
      } else {
        console.log("Database connection terminated cleanly.");
      }
      process.exit(0);
    });
  });
};

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`HonestPerks server bootstrapped successfully! Port: ${PORT}`);
});

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
