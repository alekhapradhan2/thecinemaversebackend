const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

// ── Multer: disk storage for blog inline images ──────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "public", "blog-uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const blogImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const name = `blog-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const blogImageUpload = multer({
  storage: blogImageStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB max
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed (jpeg, png, webp, gif)"));
  },
});

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// ── Passive visitor tracking middleware ──────────────────────────────────────
// Fires on every public GET /api/* — silently logs IP, device, page, location
const TRACK_SKIP = ["/api/admin", "/api/auth", "/api/cast-auth", "/api/ping", "/blog-uploads"];

app.use(async (req, _res, next) => {
  try {
    if (req.method !== "GET") return next();
    if (TRACK_SKIP.some(p => req.path.startsWith(p))) return next();
    if (!req.path.startsWith("/api/")) return next();

    const ua = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
      || req.socket?.remoteAddress || "";
    const ref = req.headers["referer"] || req.headers["referrer"] || "";

    const isMobile = /Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTablet = /iPad|Tablet|PlayBook/i.test(ua);
    const device = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";

    const os = /Windows/i.test(ua) ? "Windows"
      : /Android/i.test(ua) ? "Android"
        : /iPhone|iPad/i.test(ua) ? "iOS"
          : /Mac/i.test(ua) ? "macOS"
            : /Linux/i.test(ua) ? "Linux" : "Other";

    const browser = /Edg\//i.test(ua) ? "Edge"
      : /OPR\//i.test(ua) ? "Opera"
        : /Chrome/i.test(ua) ? "Chrome"
          : /Firefox/i.test(ua) ? "Firefox"
            : /Safari/i.test(ua) ? "Safari" : "Other";

    const page = req.path.replace(/^\/api/, "") || "/";

    let country = "", city = "";
    if (ip && ip !== "::1" && ip !== "127.0.0.1" && !ip.startsWith("::ffff:127")) {
      try {
        const geo = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,status`, { signal: AbortSignal.timeout(2000) });
        const gd = await geo.json();
        if (gd.status === "success") { country = gd.country || ""; city = gd.city || ""; }
      } catch { /* geo timeout — visit still logged */ }
    }

    // fire-and-forget — never block the request
    VisitorLog.create({ ip, country, city, device, os, browser, page, referrer: ref, visitedAt: new Date() }).catch(() => { });
  } catch { /* never block */ }
  next();
});

// Serve uploaded blog images publicly
app.use("/blog-uploads", express.static(UPLOADS_DIR));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

/** Canonical site origin — used everywhere a blog/movie/cast URL is built
 *  (canonical tags, OG/Twitter meta, JSON-LD @id/url fields, sitemaps).
 *  Moved to the top of the file (was previously declared just above
 *  /robots.txt) so every blog-HTML builder can reference the SAME
 *  constant instead of hardcoding "https://ollypedia.in" inline — fixes
 *  the www vs non-www canonical mismatch flagged in the SEO audit. */
const SITE_URL = process.env.SITE_URL || "https://www.ollypedia.in";

/** Is s a valid 24-hex MongoDB ObjectId string? */
const isOid = (s) => typeof s === "string" && /^[a-f0-9]{24}$/i.test(s.trim());

// Slugify a movie title + year into a clean URL-safe slug
// e.g. "Bindusagar" 2026 → "bindusagar-2026"
function makeMovieSlug(title, releaseDate) {
  const year = releaseDate ? new Date(releaseDate).getFullYear() : "";
  const base = String(title || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
  return year ? `${base}-${year}` : base;
}

/** Extract bare 11-char YouTube ID from any URL or ID */
const ytId = (input) => {
  if (!input) return "";
  const s = String(input).trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return "";
};

/**
 * parseToRupeesGlobal — canonical currency parser used everywhere in this file.
 *
 * Converts any human-readable currency string to raw rupees (integer).
 *   "₹3.36 Cr"  → 33600000
 *   "0.17L"     → 17000
 *   "0.1L"      → 10000
 *   "0.01L"     → 1000
 *   "33,00,000" → 3300000
 *
 * SAFETY: bare numbers with no unit (e.g. "7", "3.36") are treated as 0
 * because they are corrupted entries — the value was produced by raw float
 * arithmetic (3.37 - 3.30 = 0.07) instead of proper rupee maths.
 * Only bare integers ≥ 1000 are trusted as already-in-rupees values.
 */
function parseToRupeesGlobal(str) {
  if (!str) return 0;
  const s = String(str).replace(/[₹,\s]/g, "").toLowerCase();
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  if (s.includes("cr") || s.includes("crore")) return Math.round(n * 1_00_00_000);
  if (s.includes("l") || s.includes("lakh")) return Math.round(n * 1_00_000);
  // Bare integer — trust only if it looks like actual rupees (≥ 1000)
  if (n >= 1000) return Math.round(n);
  return 0; // "7", "0.17" etc. with no unit = corrupted — discard
}

/** Format raw rupees (integer) → "₹X.XX Cr" / "₹X.XX L" */
function formatINRGlobal(n) {
  if (!n || isNaN(n)) return "—";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

/** GST_RATE — Gross = Net × 1.18 (18% entertainment tax/GST). Used by the
 *  bulk box-office upload route and mirrored in BoxOfficePanel.jsx on the
 *  frontend so previews match exactly what gets saved. */
const GST_RATE_GLOBAL = 1.18;

/** addDaysToISO — given a releaseDate (any parseable date string) and a
 *  1-indexed day number, returns the calendar date for that day as
 *  "YYYY-MM-DD". Day 1 == releaseDate itself. Returns "" if releaseDate
 *  is missing/invalid. */
function addDaysToISO(releaseDate, dayNum) {
  if (!releaseDate) return "";
  const d = new Date(releaseDate);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + (Number(dayNum) - 1));
  return d.toISOString().slice(0, 10);
}

/** Auth middleware — sets req.prodId (string) */
const auth = (req, res, next) => {
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.prodId = String(decoded.productionId);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

/** CastMember auth middleware */
const castAuth = (req, res, next) => {
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.castMemberId = String(decoded.castMemberId);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

/** Admin auth middleware */
const adminAuth = (req, res, next) => {
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: "Not admin" });
    req.admin = decoded;
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
};

const canEdit = (movie, prodId) =>
  String(movie.productionId) === prodId ||
  (movie.collaborators || []).some(c => String(c) === prodId);

// ════════════════════════════════════════════════════════════════
// SCHEMAS
// ════════════════════════════════════════════════════════════════

const ProductionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  logo: { type: String, default: "" },
  banner: { type: String, default: "" },
  bio: { type: String, default: "" },
  founded: { type: String, default: "" },
  website: { type: String, default: "" },
  location: { type: String, default: "" },
}, { timestamps: true });

/**
 * Cast — a public profile for any cast/crew member.
 * movies[] is a back-reference array for filmography display.
 */
const CastSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, default: "Actor" },   // primary / legacy (comma-separated)
  roles: [{ type: String }],                   // multi-role array e.g. ["Actor","Singer"]
  bio: { type: String, default: "" },
  photo: { type: String, default: "" },
  dob: { type: String, default: "" },
  gender: { type: String, default: "" },
  location: { type: String, default: "" },
  website: { type: String, default: "" },
  instagram: { type: String, default: "" },
  banner: { type: String, default: "" },
  movies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
}, { timestamps: true });

const ReviewSchema = new mongoose.Schema({
  user: { type: String, default: "Anonymous" },
  rating: Number,
  text: String,
  date: String,
  likes: { type: Number, default: 0 },
  replies: [{
    user: { type: String, default: "Anonymous" },
    text: { type: String, default: "" },
    date: { type: String, default: "" },
  }],
});

const SongSchema = new mongoose.Schema({
  title: { type: String, default: "" },
  singer: { type: String, default: "" },
  singerRef: [{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
  musicDirector: { type: String, default: "" },
  musicDirectorRef: [{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
  lyricist: { type: String, default: "" },
  lyricistRef: [{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
  ytId: { type: String, default: "" },
  url: { type: String, default: "" },
  thumbnailUrl: { type: String, default: "" },
  lyrics: { type: String, default: "" },
  description: { type: String, default: "" },
});

/**
 * CastEntrySchema — embedded in Movie.cast[].
 * _id: false avoids a sub-document _id which can cause confusing cast errors.
 */
const CastEntrySchema = new mongoose.Schema({
  castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast", required: true },
  name: { type: String, default: "" },
  photo: { type: String, default: "" },
  type: { type: String, default: "Actor" },
  role: { type: String, default: "" },
}, { _id: false });

const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, default: "Feature Film" },
  genre: [{ type: String }],
  releaseDate: { type: String, default: "" },
  releaseTBA: { type: Boolean, default: false },
  director: { type: String, default: "" },
  producer: { type: String, default: "" },
  budget: { type: String, default: "" },
  language: { type: String, default: "Odia" },
  synopsis: { type: String, default: "" },
  posterUrl: { type: String, default: "" },
  thumbnailUrl: { type: String, default: "" },
  bannerUrl: { type: String, default: "" },
  runtime: { type: String, default: "" },
  imdbId: { type: String, default: "" },
  imdbRating: { type: String, default: "" },
  imdbVotes: { type: String, default: "" },
  contentRating: { type: String, default: "" },
  productionId: { type: mongoose.Schema.Types.ObjectId, ref: "Production", required: true },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "Production" }],
  cast: [CastEntrySchema],
  media: {
    trailer: {
      ytId: { type: String, default: "" },
      url: { type: String, default: "" },
      thumbnailUrl: { type: String, default: "" },
    },
    songs: [SongSchema],
  },
  boxOffice: {
    opening: { type: String, default: "TBA" },
    firstWeek: { type: String, default: "TBA" },
    total: { type: String, default: "TBA" },
  },
  boxOfficeDays: [{
    day: { type: Number, required: true },
    net: { type: String, default: "" },
    gross: { type: String, default: "" },
    date: { type: String, default: "" },
    note: { type: String, default: "" },
  }],
  verdict: { type: String, default: "Upcoming" },
  status: { type: String, default: "Upcoming" },
  reviews: [ReviewSchema],
  news: [{ type: mongoose.Schema.Types.ObjectId, ref: "News" }],
  slug: { type: String, default: "", index: true },
  interestedYes: { type: Number, default: 0 },
  interestedNo: { type: Number, default: 0 },   // SEO slug e.g. "bindusagar-2026"
  streamingOn: { type: String, default: "" },  // OTT platform name e.g. "Aao NXT"
  streamingUrl: { type: String, default: "" },  // Direct link to stream the movie
  ottReleaseDate: { type: String, default: "" },  // OTT release date (ISO string or "TBA")
  detailBlogId: { type: mongoose.Schema.Types.ObjectId, ref: "Blog", default: null }, // auto-generated "Movie Details" blog
  songBlogIds: { type: Map, of: mongoose.Schema.Types.ObjectId, default: {} },       // song slug → Blog._id (auto-generated song First Drop blogs)
  ottBlogId: { type: mongoose.Schema.Types.ObjectId, ref: "Blog", default: null }, // auto-generated "OTT Release" blog
  ottLiveBlogId: { type: mongoose.Schema.Types.ObjectId, ref: "Blog", default: null }, // auto-generated "Now Streaming on OTT" blog
}, { timestamps: true });

const NewsSchema = new mongoose.Schema({
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
  movieTitle: { type: String, default: "" },
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: "Update" },
  imageUrl: { type: String, default: "" },
  published: { type: Boolean, default: true },
  sourceUrl: { type: String, default: "" },   // link to original article
  ytId: { type: String, default: "" },   // YouTube video ID (for video news)
  newsType: { type: String, default: "article" }, // "article" | "video"
}, { timestamps: true });

// ── Blog / Article Schema ────────────────────────────────────────
const BlogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  excerpt: { type: String, default: "" },        // 1–2 sentence teaser
  content: { type: String, required: true },     // full article HTML/text
  category: { type: String, default: "General" }, // "Movie Review","Top 10","Actor Spotlight","News","General"
  tags: [{ type: String }],                   // ["Odia 2025","Babushaan","Action"]
  coverImage: { type: String, default: "" },
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" }, // optional link
  movieTitle: { type: String, default: "" },
  castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast" },  // optional cast link
  castName: { type: String, default: "" },
  author: { type: String, default: "Ollypedia Team" },
  published: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  indexed: { type: Boolean, default: true },               // ★ false = noindex meta + excluded from sitemap
  views: { type: Number, default: 0 },
  readTime: { type: Number, default: 5 },         // minutes
  seoTitle: { type: String, default: "" },
  seoDesc: { type: String, default: "" },
  youtubeVideoId: { type: String, default: "" },  // optional embedded YouTube video
  reviews: [ReviewSchema],
}, { timestamps: true });

// Auto-generate slug from title
BlogSchema.pre("validate", function (next) {
  if (this.isNew && !this.slug && this.title) {
    this.slug = this.title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()
      + "-" + Date.now().toString(36);
  }
  if (!this.readTime && this.content) {
    this.readTime = Math.max(1, Math.ceil(this.content.split(/\s+/).length / 200));
  }
  next();
});

const Blog = mongoose.model("Blog", BlogSchema);

const CastMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  roles: [String],
  photo: { type: String, default: "" },
  banner: { type: String, default: "" },
  bio: { type: String, default: "" },
  dob: { type: String, default: "" },
  gender: { type: String, default: "" },
  location: { type: String, default: "" },
  website: { type: String, default: "" },
  instagram: { type: String, default: "" },
  castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast" },
}, { timestamps: true });

const Production = mongoose.model("Production", ProductionSchema);

// ── Auto-generate slug on Movie create/update ─────────────────
MovieSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("title") || this.isModified("releaseDate") || !this.slug) {
    const base = makeMovieSlug(this.title, this.releaseDate);
    let slug = base; let attempt = 0;
    while (true) {
      const existing = await mongoose.models.Movie?.findOne({ slug, _id: { $ne: this._id } }).lean();
      if (!existing) break;
      slug = `${base}-${++attempt}`;
    }
    this.slug = slug;
  }
  next();
});

MovieSchema.pre("findOneAndUpdate", async function (next) {
  const u = this.getUpdate();
  const titleNew = u.title ?? u.$set?.title;
  const dateNew = u.releaseDate ?? u.$set?.releaseDate;
  if (titleNew !== undefined || dateNew !== undefined) {
    const doc = await this.model.findOne(this.getQuery()).lean();
    const title = titleNew ?? doc?.title ?? "";
    const releaseDate = dateNew ?? doc?.releaseDate ?? "";
    const base = makeMovieSlug(title, releaseDate);
    let slug = base; let attempt = 0;
    while (true) {
      const existing = await this.model.findOne({ slug, _id: { $ne: doc?._id } }).lean();
      if (!existing) break;
      slug = `${base}-${++attempt}`;
    }
    if (!u.$set) u.$set = {};
    u.$set.slug = slug;
  }
  next();
});

const Movie = mongoose.model("Movie", MovieSchema);
const Cast = mongoose.model("Cast", CastSchema);
const News = mongoose.model("News", NewsSchema);
const CastMember = mongoose.model("CastMember", CastMemberSchema);


// ════════════════════════════════════════════════════════════════
// AUTO-BLOG-ON-MOVIE — auto-generates "Movie Details" + "OTT Release"
// blogs whenever a movie is created/edited via the admin portal.
// ════════════════════════════════════════════════════════════════

/** Human-readable date — "15 August 2026". Returns "" for missing/invalid. */
function formatHumanDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d).trim() === "TBA" ? "TBA" : String(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** Is this OTT release date a real date (not blank / not "TBA")? */
function isRealDate(d) {
  if (!d) return false;
  const s = String(d).trim();
  if (!s || s.toUpperCase() === "TBA") return false;
  return !isNaN(new Date(s).getTime());
}

/** Wrap AI text into styled <p> blocks — same convention as the rest of the app. */
function autoBlogParagraphs(text) {
  return String(text || "")
    .replace(/`/g, "&#96;")
    .trim()
    .split(/\n{2,}/)
    .map(chunk => chunk.split(/\n/).map(l => l.trim()).filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .map(p => `<p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${p}</p>`)
    .join("\n");
}

/**
 * BLOG_RESPONSIVE_STYLES — shared, presentation-only CSS reset injected into
 * every auto-generated blog type (Movie Details, OTT Announcement, OTT
 * Release/Live, Box Office, etc.) so generated content never stretches
 * beyond its container on desktop or overflows horizontally on tablet/mobile.
 * Purely visual — does NOT touch markup structure, content, SEO tags,
 * schema, or any business logic. Scoped entirely under .bp-article-html
 * (the wrapper class the frontend renders all blog HTML inside), so it
 * cannot leak out and affect any other part of the site.
 */
const BLOG_RESPONSIVE_STYLES = `
<!-- RESPONSIVE STYLES — scoped, presentation-only, no logic/SEO impact -->
<style>
.bp-article-html,
.bp-article-html * { box-sizing: border-box; }

.bp-article-html {
  max-width: 100%;
  overflow-x: hidden;
  word-break: break-word;
}

.bp-article-html p,
.bp-article-html span,
.bp-article-html strong,
.bp-article-html em,
.bp-article-html a,
.bp-article-html h1,
.bp-article-html h2,
.bp-article-html h3,
.bp-article-html h4,
.bp-article-html li,
.bp-article-html td,
.bp-article-html th {
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

.bp-article-html img,
.bp-article-html svg,
.bp-article-html video,
.bp-article-html iframe,
.bp-article-html embed,
.bp-article-html object,
.bp-article-html canvas {
  max-width: 100%;
  height: auto;
}

.bp-article-html pre {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.bp-article-html code {
  overflow-wrap: break-word;
  word-break: break-word;
}
.bp-article-html blockquote {
  max-width: 100%;
  overflow-wrap: break-word;
  word-break: break-word;
}

.bp-article-html table {
  max-width: 100%;
  width: 100%;
  table-layout: auto;
}
.bp-article-html .tbl-scroll {
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}

.bp-article-html .blog-content-layout,
.bp-article-html .blog-live-layout,
.bp-article-html .hero-section,
.bp-article-html section,
.bp-article-html div {
  max-width: 100%;
}

@media (max-width: 640px) {
  .bp-article-html .hero-section {
    padding: 20px 16px 18px !important;
  }
  .bp-article-html section[style*="background:#181818"],
  .bp-article-html section[style*="background: #181818"] {
    padding: 18px 14px !important;
  }
  .bp-article-html section[style*="background:#111"] {
    padding: 16px 14px !important;
  }
  .bp-article-html .stat-chips {
    grid-template-columns: 1fr 1fr !important;
  }
  .bp-article-html .perf-stats {
    flex-direction: column !important;
    gap: 12px !important;
  }
  .bp-article-html nav[aria-label="Day navigation"] {
    flex-direction: column !important;
  }
  .bp-article-html .info-table td:first-child {
    width: 38% !important;
    font-size: 0.8rem !important;
  }
  .bp-article-html .data-table td,
  .bp-article-html .data-table th {
    padding: 8px 8px !important;
    font-size: 0.78rem !important;
  }
  .bp-article-html .bar-table td {
    padding: 8px 8px !important;
  }
  .bp-article-html .also-read-grid {
    grid-template-columns: 1fr !important;
  }
  .bp-article-html .tag-chip {
    font-size: 0.7rem !important;
    padding: 3px 10px !important;
  }
  .bp-article-html .cta-btn {
    display: block !important;
    width: 100% !important;
    box-sizing: border-box !important;
    text-align: center !important;
  }
  .bp-article-html .faq-section {
    padding: 18px 14px !important;
  }
}

@media (max-width: 400px) {
  .bp-article-html .stat-chips {
    grid-template-columns: 1fr !important;
  }
  .bp-article-html h1 {
    font-size: 1.1rem !important;
  }
}
</style>
`;

/**
 * extractMovieCastCrew — pulls out director/producer/key-crew + a clean
 * lead-cast list from movie.cast[]. Mirrors the logic already used by
 * the Sacnilk auto-blog function, generalised for any movie.
 */
function extractMovieCastCrew(movie) {
  const cast = Array.isArray(movie.cast) ? movie.cast : [];
  const findByRole = (keywords) =>
    cast.find(m => keywords.some(k => (m.role || m.type || "").toLowerCase().includes(k)));

  const directorEntry = cast.find(m => {
    const r = (m.role || m.type || "").toLowerCase().trim();
    return r === "director" || r === "film director" || r === "movie director" ||
      (r.includes("director") && !["music", "art", "action", "stunt", "assistant", "co-", "associate"].some(x => r.includes(x)));
  });
  const director = directorEntry?.name || movie.director || "";
  // NEW (additive): keep the matched cast entry too, so callers that want a
  // clickable link to the director's cast profile can build one via
  // castProfileUrl(cc.directorEntry) — `director` (the plain name string)
  // is unchanged and still used everywhere it already was.

  const producerEntry = cast.find(m => {
    const r = (m.role || m.type || "").toLowerCase().trim();
    return r === "producer" ||
      (r.includes("producer") && !["executive", "co-", "line", "associate", "assistant"].some(x => r.includes(x)));
  });
  const producer = producerEntry?.name || movie.producer || "";

  // NEW (additive): keep the matched entry object for each of these too —
  // same purpose as directorEntry above — so the "Key Crew" rows can link
  // to a cast profile page wherever one exists, without changing any of
  // the existing plain-string fields (musicDirector, writer, dop, editor)
  // that other code already depends on.
  const musicDirectorEntry = findByRole(["music director"]);
  const writerEntry = findByRole(["writer", "screenplay", "story", "dialogue"]);
  const dopEntry = findByRole(["cinematographer", "dop", "director of photography"]);
  const editorEntry = findByRole(["editor"]);
  const musicDirector = musicDirectorEntry?.name || "";
  const writer = writerEntry?.name || "";
  const dop = dopEntry?.name || "";
  const editor = editorEntry?.name || "";

  const CREW_KW = ["director", "producer", "writer", "screenplay", "story", "dialogue", "music director", "cinematographer", "dop", "editor", "choreographer", "art director", "costume", "sound", "stunt", "vfx"];
  const actingKW = ["actor", "actress", "lead", "hero", "heroine", "supporting", "cameo", "special appearance"];
  const actors = cast.filter(m => {
    const r = (m.role || m.type || "").toLowerCase();
    const isCrew = CREW_KW.some(k => r.includes(k)) && !actingKW.some(k => r.includes(k));
    return !isCrew;
  });

  const leadCast = actors.slice(0, 6);

  // ── OTT-blog-only cast filter ──────────────────────────────────────────
  // BUGFIX: the OTT Announcement and OTT Streaming blogs were displaying
  // crew members (Cinematographer, Editor, Music Director, Choreographer,
  // etc.) in their "Cast" section whenever a person's `role`/`type` string
  // didn't match one of the CREW_KW substrings above — the `actors` filter
  // above is "exclude known-crew" (fail-open), so anyone with an
  // unrecognized or missing role string falls through and gets treated as
  // cast by default. That's correct for `leadCast`/`fullCast` (used on the
  // Movie Details page and in the shared JSON-LD `actor[]` array, which
  // this fix must NOT touch), but it's wrong for the OTT blogs' "Cast"
  // section, which must show ONLY Director, Actor, and Actress.
  //
  // `ottCast` below is therefore the inverse approach — "include
  // known-cast" (fail-closed): a person is only included if their
  // role/type string explicitly indicates Director, Actor, or Actress.
  // Anyone else (Cinematographer, Editor, Music Director, Lyricist,
  // Producer, Writer, Choreographer, Art Director, Costume Designer, or
  // any other/miscellaneous crew role) is excluded, even if their role
  // string is something this codebase has never seen before.
  //
  // This is a NEW, additive field — `leadCast` and `fullCast` (and every
  // existing call site that reads them) are completely unchanged.
  //
  // Director sub-roles that are NOT the film's director (must stay excluded
  // even though their role string contains "director").
  const OTT_NON_FILM_DIRECTOR_KW = ["music", "art", "action", "stunt", "casting", "assistant", "co-", "associate", "photography", "of photography"];
  const isOttDirector = (r) => r === "director" || r === "film director" || r === "movie director" ||
    (r.includes("director") && !OTT_NON_FILM_DIRECTOR_KW.some(x => r.includes(x)));
  const isOttActingRole = (r) => ["actor", "actress", "lead", "hero", "heroine", "supporting", "cameo", "special appearance", "cast"].some(k => r.includes(k));
  const ottCast = cast.filter(m => {
    const r = (m.role || m.type || "").toLowerCase().trim();
    if (!r) return false; // no role/type at all → cannot confirm cast/director, so exclude (fail-closed)
    return isOttDirector(r) || isOttActingRole(r);
  });

  return {
    director, producer, musicDirector, writer, dop, editor, leadCast, fullCast: cast, ottCast,
    // NEW (additive): raw cast entries (with castId) for crew roles, so
    // callers can build clickable cast-profile links via castProfileUrl(...)
    // wherever a crew member's name is displayed. None of the existing
    // string fields above changed.
    directorEntry: directorEntry || null,
    producerEntry: producerEntry || null,
    musicDirectorEntry: musicDirectorEntry || null,
    writerEntry: writerEntry || null,
    dopEntry: dopEntry || null,
    editorEntry: editorEntry || null,
  };
}

/** Returns the canonical cast profile URL — always /cast/{castId} (ObjectId only). */
function castProfileUrl(entry) {
  if (!entry || !entry.castId) return "";
  return `/cast/${entry.castId}`;
}

/**
 * fetchRelatedMovies — SEO FIX: powers the "Related Odia Movies" / "More
 * Odia Movies on {Platform}" internal linking sections recommended by the
 * audit (closes the "content island" gap — blog pages currently have zero
 * links to other movies). When `preferPlatform` is true (OTT pages), tries
 * same-streaming-platform matches first per the audit's "Also available on
 * {Platform}" recommendation, then tops up with genre matches. Never
 * throws — callers fire-and-forget blog generation, so a lookup failure
 * here must degrade to "no related movies" rather than block publishing.
 */
async function fetchRelatedMovies(movie, limit = 4, preferPlatform = false) {
  try {
    const genres = Array.isArray(movie.genre) ? movie.genre.filter(Boolean) : [];
    const baseFilter = { _id: { $ne: movie._id }, slug: { $exists: true, $ne: "" } };
    const fields = "title slug posterUrl thumbnailUrl releaseDate genre streamingOn";

    let related = [];
    if (preferPlatform && movie.streamingOn) {
      related = await Movie.find({ ...baseFilter, streamingOn: movie.streamingOn }, fields)
        .sort({ createdAt: -1 }).limit(limit).lean();
    }
    if (related.length < limit) {
      const have = new Set(related.map(m => String(m._id)));
      const genreFilter = { ...baseFilter };
      if (genres.length) genreFilter.genre = { $in: genres };
      const extra = await Movie.find(genreFilter, fields)
        .sort({ createdAt: -1 }).limit(limit - related.length + have.size).lean();
      for (const m of extra) {
        if (related.length >= limit) break;
        if (have.has(String(m._id))) continue;
        related.push(m);
        have.add(String(m._id));
      }
    }
    return Array.isArray(related) ? related.slice(0, limit) : [];
  } catch {
    return [];
  }
}

/** Builds the "Related Odia Movies" internal-linking HTML block, or "" if
 *  there are no related movies to show. Shared across all 3 blog types.
 *  `heading` lets OTT pages say "More Odia Movies on {Platform}" instead
 *  per the audit's competitor-comparison recommendation. */
function buildRelatedMoviesHtml(related, accentColor = "#c9973a", heading = "Related Odia Movies") {
  if (!Array.isArray(related) || !related.length) return "";
  const cards = related.map(m => {
    const img = m.posterUrl || m.thumbnailUrl || "";
    const yr = m.releaseDate ? new Date(m.releaseDate).getFullYear() : "";
    return `
      <a href="/movie/${m.slug}" style="display:block;background:#181818;border:1px solid #242424;border-radius:10px;overflow:hidden;text-decoration:none;width:140px;flex-shrink:0;">
        ${img ? `<img src="${img}" alt="${m.title} Poster" loading="lazy" width="140" height="210" style="width:100%;height:auto;display:block;object-fit:cover;" />` : ""}
        <div style="padding:8px 10px;">
          <div style="color:#ddd;font-size:0.8rem;font-weight:700;line-height:1.3;">${m.title}${yr ? ` (${yr})` : ""}</div>
        </div>
      </a>`;
  }).join("");
  return `
    <section id="related-movies" style="background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;">
      <h2 style="font-size:1.05rem;font-weight:800;color:${accentColor};border-left:4px solid ${accentColor};padding-left:12px;margin:0 0 18px;line-height:1.3;">${heading}</h2>
      <div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:4px;">${cards}</div>
    </section>`;
}

/**
 * FESTIVAL_WINDOWS_2026 — verified Odisha festival date windows for 2026,
 * used only as soft context fed to the AI (so it can naturally mention
 * "just in time for Raja" etc. in body copy when relevant) — never used
 * to force a claim into a title or meta tag.
 *
 * MAINTENANCE: these are lunar/solar dates that shift every year — verify
 * against an official Odisha calendar/panchang before adding new years.
 * Years not in this table simply produce no festival context — safe by
 * default, never a stale or wrong claim.
 */
const FESTIVAL_WINDOWS_2026 = [
  { label: "Makar Sankranti", start: "2026-01-12", end: "2026-01-16" },
  { label: "Maha Vishuba Sankranti", start: "2026-04-12", end: "2026-04-16" },
  { label: "Raja Parba", start: "2026-06-12", end: "2026-06-17" },
  { label: "Ratha Yatra", start: "2026-07-14", end: "2026-07-19" },
  { label: "Nuakhai", start: "2026-09-14", end: "2026-09-18" },
  { label: "Durga Puja", start: "2026-10-16", end: "2026-10-21" },
  { label: "Diwali", start: "2026-11-06", end: "2026-11-10" },
];

/** Returns "Raja Parba" etc. if dateStr falls in/near a known festival
 *  window (±a few days buffer), else "" (graceful fallback — see note above). */
function findNearbyFestival(dateStr) {
  if (!isRealDate(dateStr)) return "";
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const table = year === 2026 ? FESTIVAL_WINDOWS_2026 : [];
  const BUFFER_DAYS = 6;
  for (const f of table) {
    const start = new Date(f.start); start.setDate(start.getDate() - BUFFER_DAYS);
    const end = new Date(f.end); end.setDate(end.getDate() + 2);
    if (d >= start && d <= end) return f.label;
  }
  return "";
}

/** Deterministic, always-consistent SEO title for the "Movie Details" blog —
 *  built in code (not left to the AI) so the format never drifts:
 *  "Kali Gita (2026) Movie Details, Cast, Crew, Story, Release Date & Latest Updates" */
function buildMovieDetailsTitle(movie) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  return `${movie.title}${year ? ` (${year})` : ""} Movie Details, Cast, Crew, Story, Release Date & Latest Updates`;
}

/** Deterministic, always-consistent SEO title for the "OTT Release" blog —
 *  built in code so lead-actor names and the platform always appear exactly
 *  the way you want: "Bindusagar OTT Release Date: A & B Starrer Premieres
 *  on Tarang Plus on 26 June 2026" (falls back to "Announced Soon" if the
 *  date isn't a clean, parseable date).
 *  SEO FIX: capped at 90 chars (Google's effective title display ceiling) —
 *  first tries 2 lead names, then falls back to 1, then 0, so the title
 *  degrades gracefully instead of getting cut off mid-word. */
function buildOttTitle(movie, cc) {
  const dateTail = isRealDate(movie.ottReleaseDate) ? `on ${formatHumanDate(movie.ottReleaseDate)}` : "— Announced Soon";
  // BUGFIX: use the strictly-filtered ottCast (Director + Actor + Actress
  // only) so a Cinematographer/Editor/Music Director never ends up named
  // as a "Starrer" in the page title — same root cause as the Cast-section
  // bug, fixed the same way, scoped only to this OTT-blog title builder.
  const build = (leadCount) => {
    const leads = (cc.ottCast || cc.leadCast || []).slice(0, leadCount).map(c => c.name).filter(Boolean);
    const subject = leads.length ? `${leads.join(" & ")} Starrer` : "Odia Movie";
    return `${movie.title} OTT Release Date: ${subject} Premieres on ${movie.streamingOn} ${dateTail}`.replace(/\s+/g, " ").trim();
  };
  let title = build(2);
  if (title.length > 90) title = build(1);
  if (title.length > 90) title = build(0);
  return title.length > 90 ? title.slice(0, 89).trim() + "…" : title;
}

/**
 * callGroqStructured — internal Groq call (no HTTP round-trip), returns a
 * parsed JSON object matching `keys`, falling back to `fallbacks` per-key
 * if Groq is unavailable, errors, or returns malformed JSON. This NEVER
 * throws — auto-blog generation must never break movie creation.
 *
 * SEO FIX: if the returned `metaDescription` is outside Google's effective
 * snippet window (100–165 chars), it's replaced with the (length-capped)
 * fallback description instead of being published as-is — the small
 * instant model occasionally returns descriptions that are too short/long
 * or too generic, and an out-of-range meta description risks Google
 * rewriting the snippet itself.
 */
async function callGroqStructured(systemPrompt, userPrompt, keys, fallbacks, maxTokens = 2200) {
  const groqKey = process.env.GROQ_API_KEY || "";
  if (!groqKey) { console.warn("⚠️ GROQ_API_KEY not set — auto-blog using template fallback content."); return fallbacks; }
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.9,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) { console.warn(`⚠️ Groq API responded ${response.status} — auto-blog using fallback content.`); return fallbacks; }
    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) return fallbacks;
    const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(clean);
    const out = {};
    for (const k of keys) out[k] = (parsed[k] !== undefined && parsed[k] !== null && parsed[k] !== "") ? parsed[k] : fallbacks[k];
    if (keys.includes("metaDescription") && typeof out.metaDescription === "string") {
      const len = out.metaDescription.trim().length;
      if (len < 100 || len > 165) {
        out.metaDescription = String(fallbacks.metaDescription || "").slice(0, 160);
      }
    }
    return out;
  } catch (e) {
    console.warn("⚠️ Groq call failed — auto-blog using fallback content:", e.message);
    return fallbacks;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOVIE DETAILS BLOG
// ─────────────────────────────────────────────────────────────────────────────

async function generateMovieDetailsAiSections(movie, cc) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const genre = (movie.genre || []).join(", ") || "Odia";
  const leadNames = cc.leadCast.map(c => c.name).filter(Boolean).join(", ");
  const hasSongs = Array.isArray(movie.media?.songs) && movie.media.songs.length > 0;
  const songNames = hasSongs ? movie.media.songs.map(s => s.title).filter(Boolean).join(", ") : "";
  const festival = findNearbyFestival(movie.releaseDate);

  const ctx = `Movie: "${movie.title}"${year ? ` (${year})` : ""} | Genre: ${genre} | Language: ${movie.language || "Odia"} | Director: ${cc.director || "N/A"} | Producer: ${cc.producer || "N/A"} | Lead Cast: ${leadNames || "N/A"} | Music Director: ${cc.musicDirector || "N/A"} | Writer: ${cc.writer || "N/A"} | Cinematographer: ${cc.dop || "N/A"} | Release Date: ${movie.releaseDate ? formatHumanDate(movie.releaseDate) : "TBA"} | Runtime: ${movie.runtime || "N/A"} | Certification: ${movie.contentRating || "N/A"} | Songs: ${songNames || "N/A"} | Synopsis: ${movie.synopsis || "N/A"}${festival ? ` | Note: release falls close to ${festival} — you may mention this naturally if it fits.` : ""}`;

  const userPrompt = `Write deeply detailed, SEO-rich JSON content for a comprehensive movie-details article on Ollypedia, an Odia (Ollywood) cinema website, about the film "${movie.title}". This MUST be a full editorial article with long, rich, substantive paragraphs — each paragraph must feel like it was written by a professional film journalist. Use ONLY the details given below. Naturally weave in the movie title, genre, director, and lead cast names across paragraphs. Do NOT include HTML or markdown.

${ctx}

Return a JSON object with exactly these keys (plain text only, NO HTML, NO markdown, aim for maximum detail and length):
- metaDescription: 150-160 characters mentioning movie title, release date and genre, maximising Google click-through rate
- introParagraph: 250-350 words introducing the film in depth — cover its genre, Ollywood landscape expectations, production scale, what makes it different, key anticipation factors. Start with "${movie.title}".
- storyParagraph: 350-500 words expanding on the synopsis — discuss narrative background, story world, major themes, emotional conflicts, character arcs, setting, tone and pacing. Do not invent specific plot twists not in the synopsis; if synopsis is thin, write richly about the genre, tone, emotional stakes, and cultural context.
- castCrewParagraph: 300-400 words covering each lead cast member individually — their character roles, acting style, notable past work, what they bring to this film specifically. Name every cast member. Discuss director-cast collaboration, chemistry, and ensemble dynamics.
- directorVisionParagraph: 250-350 words about the director's signature filmmaking style, technical execution for this project, visual language, production design, use of locations, cinematography approach, and creative ambition. If director name is N/A, write about the production team's craft and values.
- musicParagraph: 200-280 words about the soundtrack, background score, mood of the music, genre of songs. If song titles are listed, describe each one briefly. If no songs listed, discuss the musical traditions of Odia cinema and what this film's genre demands from its score.
- whereToWatchParagraph: 180-250 words on the theatrical release strategy — major circuits in Odisha (Bhubaneswar, Cuttack, Berhampur, Sambalpur, Rourkela, Puri, Balasore), importance of supporting Odia films in theatres, how to find showtimes, family viewing experience, and the cinematic experience advantage.
- anticipationParagraph: 250-350 words on audience expectations, industry buzz, social media reception, trailer/teaser reception if known, comparison with similar Odia films, box office potential, why this film matters for Ollywood, and the overall cultural significance of this release.`;

  const fallbacks = {
    metaDescription: `${movie.title}${year ? ` (${year})` : ""}: full cast, crew, story and release date. Read the complete details on Ollypedia, your home for Odia cinema.`,
    introParagraph: `${movie.title}${year ? ` (${year})` : ""} is one of the most awaited ${genre} films in Odia cinema, bringing together a talented cast and crew under the ${movie.language || "Odia"} banner. The film has sparked widespread discussion among Odia cinema fans for its bold premise, its choice of genre, and the calibre of talent involved in front of and behind the camera. From its story to its theatrical release plans, here is everything Ollywood fans need to know about this hotly anticipated production. With ${cc.director ? `director ${cc.director} at the helm` : "a skilled creative team guiding the vision"}, the film is set to make a significant mark on the Odia film industry this year.`,
    // SEO FIX: this is the canonical, full-length synopsis presentation —
    // the OTT Release and "Now Streaming" pages reframe (not repeat) this
    // text in their own fallbacks below, to avoid duplicate-content
    // penalties across the three blog pages for the same movie.
    storyParagraph: movie.synopsis || `Full plot details for ${movie.title} will be updated as soon as they are officially released by the production team. What is known is that this ${genre} drama carries a story designed to resonate deeply with Odia audiences — touching on universal themes of identity, family, love, and struggle, placed firmly in the cultural and social landscape of Odisha. The film promises a narrative that goes beyond surface-level entertainment, aiming to deliver emotional depth, strong character writing, and a cinematic experience that stays with the viewer long after the credits roll. Odia cinema audiences have long been waiting for a ${genre} film of this calibre, and ${movie.title} appears ready to deliver on those expectations.`,
    castCrewParagraph: `${movie.title} is helmed by ${cc.director || "the director"}${cc.producer ? ` and produced by ${cc.producer}` : ""}, with ${leadNames || "a talented cast"} leading the film. ${leadNames ? `${leadNames.split(",")[0]} headlines the cast` : "The cast"} alongside a carefully chosen supporting ensemble drawn from Ollywood's growing and versatile talent pool. Each cast member brings their unique strengths and experience to the project, creating a dynamic ensemble that promises powerful on-screen performances. The chemistry between the lead actors has been a talking point in promotional discussions, and audiences can expect nuanced, layered portrayals from every member of the cast.`,
    directorVisionParagraph: cc.director ? `${cc.director} brings a distinct and considered vision to ${movie.title}, shaping its ${genre.toLowerCase()} narrative with a sharp eye for authentic Odia storytelling. Known for meticulous attention to production detail, the director has assembled a technical crew that reflects the ambition of this project — from the cinematography and production design to the editing and sound design. The visual language of ${movie.title} is expected to reflect the emotional texture of its story, using lighting, framing, and location choices to build a vivid and immersive world for the audience.` : `The creative team behind ${movie.title} is focused on delivering an authentic ${genre.toLowerCase()} experience rooted in Odia storytelling traditions, combining modern production techniques with culturally grounded narrative choices. Every aspect of the film's technical execution has been crafted to serve the story and the emotional journey of its characters.`,
    musicParagraph: hasSongs ? `The music of ${movie.title}${cc.musicDirector ? `, composed by ${cc.musicDirector},` : ""} features tracks including ${songNames}, adding to the film's emotional and entertainment value. The soundtrack blends melodious compositions with energetic numbers, catering to a wide range of musical tastes within the Odia audience. Each song has been crafted to complement a key moment in the film's narrative, enhancing the emotional resonance of the story on screen.` : `Music plays a central and irreplaceable role in Odia cinema, and ${movie.title} is expected to feature a soundtrack that perfectly complements its ${genre.toLowerCase()} tone and emotional arc. Full album details, song titles, and composer credits will be updated as they are officially released by the production team. Fans can expect a mix of melodious and peppy tracks that reflect the spirit of the film and the cultural heartbeat of Odisha.`,
    whereToWatchParagraph: (() => {
      // SEO FIX: this fallback previously rendered byte-identical across
      // every movie, which the audit flags as a duplicate-content risk.
      // Deterministically rotate city order + phrasing per movie (seeded
      // off the title) so the AI-down fallback still varies page to page.
      const cities = ["Bhubaneswar", "Cuttack", "Berhampur", "Sambalpur", "Rourkela", "Puri", "Balasore"];
      const seed = String(movie.title || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
      const rotated = [...cities.slice(seed % cities.length), ...cities.slice(0, seed % cities.length)];
      const openers = [
        `${movie.title} is set for a wide theatrical release across Odisha, covering major cities and districts including`,
        `Moviegoers across Odisha can catch ${movie.title} in theatres, with screenings planned across`,
        `${movie.title} arrives in cinemas throughout Odisha, releasing in major centres such as`,
      ];
      const opener = openers[seed % openers.length];
      return `${opener} ${rotated.join(", ")}. Ollypedia strongly encourages Odia cinema fans to experience this film on the big screen — the theatrical experience, with its immersive visuals, surround sound, and shared audience energy, brings the story of ${movie.title} to life in a way that no home viewing can replicate. Supporting Odia films in cinemas also directly helps the Ollywood industry grow and produce more high-quality content for audiences everywhere.`;
    })(),
    anticipationParagraph: `With its promising cast, strong creative team, and a story that taps into the pulse of Odia society, ${movie.title} has generated significant buzz and anticipation among Odia cinema audiences. Fans of ${genre.toLowerCase()} films in particular have reason to look forward to this one, given the quality of talent assembled and the ambition of the production. Social media has been buzzing with discussions about the film's trailer, posters, and music — all of which point to a major release that could define this season for Ollywood. Box office observers are closely watching ${movie.title} as a potential standout film of the year.`,
  };

  return callGroqStructured(
    "You are a senior Odia cinema (Ollywood) journalist writing long-form, highly detailed, SEO-optimised editorial articles for Ollypedia. Return ONLY a valid JSON object — no markdown, no code fences, no extra text. All values must be plain text with no HTML tags. Each paragraph must be thorough, specific, and feel like professional film journalism. Never use placeholder or filler sentences — every sentence must add real value and information.",
    userPrompt,
    ["metaDescription", "introParagraph", "storyParagraph", "castCrewParagraph", "directorVisionParagraph", "musicParagraph", "whereToWatchParagraph", "anticipationParagraph"],
    fallbacks,
    4500
  );
}

function buildMovieDetailsBlogHTML(movie, cc, ai, blogSlug, seoTitle, datePublished, dateModified, relatedMovies = []) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const genre = (movie.genre || []).join(", ") || "Odia";
  const releaseFmt = movie.releaseTBA || !movie.releaseDate ? "To Be Announced" : formatHumanDate(movie.releaseDate);
  // Falls back to the site logo only when the movie has no poster/thumbnail/
  // banner at all — same fallback asset the rest of the codebase already
  // relies on (kept as logo.png rather than introducing a new, unverified
  // asset path), just sourced from SITE_URL for www/non-www consistency.
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;
  const movieUrl = `/movie/${movie.slug}`;
  const hasSongs = Array.isArray(movie.media?.songs) && movie.media.songs.length > 0;
  const trailerId = movie.media?.trailer?.ytId || "";
  const imdbNum = parseFloat(movie.imdbRating);
  const hasImdb = !isNaN(imdbNum) && imdbNum > 0 && imdbNum <= 10;
  const hasBoxOffice = movie.boxOffice && Object.values(movie.boxOffice).some(v => v && v !== "TBA");
  // SEO FIX: productionCompany for the Movie schema — only added when
  // productionId has actually been populated to an object (it's sometimes
  // just an ObjectId depending on the caller), so this never renders a raw
  // Mongo ID string into the page.
  const productionCompanyName = (movie.productionId && typeof movie.productionId === "object" && movie.productionId.name) ? movie.productionId.name : "";
  const dp = datePublished || new Date().toISOString();
  const dm = dateModified || dp;

  const card = `background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;`;
  const h2 = `font-size:1.05rem;font-weight:800;color:#c9973a;border-left:4px solid #c9973a;padding-left:12px;margin:0 0 18px;line-height:1.3;`;
  const h3 = `color:#ccc;font-size:0.95rem;font-weight:700;margin:18px 0 8px;`;
  const tdL = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.87rem;width:38%;vertical-align:top;`;
  const tdR = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;font-weight:600;`;
  const th = `padding:11px 14px;background:#1f1f1f;color:#888;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;text-align:left;border-bottom:2px solid #2a2a2a;`;
  const td = `padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;`;

  const castRows = (cc.fullCast || []).map(c => {
    const url = castProfileUrl(c);
    return `
      <tr>
        <td style="${td}font-weight:600;">${url ? `<a href="${url}" style="color:#e8c87a;text-decoration:underline;text-underline-offset:2px;">${c.name || ""}</a>` : (c.name || "")}</td>
        <td style="${td}color:#c9973a;">${c.role || c.type || ""}</td>
      </tr>`;
  }).join("");

  // Each crew name links to its cast profile (same /cast/{id} pattern used
  // for the full cast table below) when a matching cast entry exists;
  // falls back to plain text exactly as before when it doesn't (e.g. when
  // the name came from movie.director rather than a matched cast entry).
  const crewLink = (name, entry) => {
    const url = castProfileUrl(entry);
    return url ? `<a href="${url}" style="color:#e8c87a;text-decoration:underline;text-underline-offset:2px;">${name}</a>` : name;
  };
  const keyCrewRows = [
    ["Director", cc.director, cc.directorEntry], ["Producer", cc.producer, cc.producerEntry],
    ["Music Director", cc.musicDirector, cc.musicDirectorEntry],
    ["Writer", cc.writer, cc.writerEntry], ["Cinematography", cc.dop, cc.dopEntry],
    ["Editor", cc.editor, cc.editorEntry],
  ].filter(([, v]) => v).map(([k, v, entry]) => `
      <tr><td style="${tdL}">${k}</td><td style="${tdR}">${crewLink(v, entry)}</td></tr>`).join("");

  const songRows = hasSongs ? movie.media.songs.map(s => `
      <tr><td style="${td}font-weight:600;">${s.title || ""}</td><td style="${td}">${s.singer || ""}</td></tr>`).join("") : "";

  const leadNames = cc.leadCast.map(c => c.name).filter(Boolean);
  const keywordsArr = [
    movie.title, `${movie.title} cast`, `${movie.title} release date`, `${movie.title} story`,
    `${movie.title} director`, year ? `${movie.title} ${year}` : "", `${movie.title} odia movie`,
    "Odia movie", "Ollywood", genre ? `${genre} odia movie` : "", movie.language || "Odia",
    cc.director ? `${cc.director} movies` : "", cc.musicDirector ? `${cc.musicDirector} music` : "",
    ...leadNames.map(n => `${n} movies`),
  ].filter(Boolean);
  const keywordsStr = [...new Set(keywordsArr)].join(", ");

  const toc = [
    ["Quick Facts", "quick-facts"], ["Story & Plot", "story"], ["Cast & Crew", "cast-crew"],
    ["Director's Vision", "director-vision"], hasSongs ? ["Music & Soundtrack", "music"] : null,
    trailerId ? ["Official Trailer", "trailer"] : null,
    hasBoxOffice ? ["Box Office Collection", "box-office"] : null,
    ["Where to Watch", "where-to-watch"],
    // SEO FIX: non-keyword-aligned heading replaced with a search-intent match
    [`Why Watch ${movie.title}?`, "anticipation"],
    relatedMovies.length ? ["Related Movies", "related-movies"] : null,
  ].filter(Boolean);
  const tocHtml = `
<nav aria-label="Table of contents" style="${card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    ${toc.map(([label, id]) => `<li><a href="#${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">${label}</a></li>`).join("")}
  </ul>
</nav>`;

  // SEO FIX: real word count for the schema "wordCount" field (and a more
  // honest internal readTime), counted from the AI prose only — not HTML
  // tags/inline style strings, which previously inflated the count.
  const plainWordCount = [ai.introParagraph, ai.storyParagraph, ai.castCrewParagraph, ai.directorVisionParagraph, ai.musicParagraph, ai.whereToWatchParagraph, ai.anticipationParagraph]
    .filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;

  // SEO FIX: Event schema for the theatrical release (matches BookMyShow /
  // PVR-style sites per the audit's competitor comparison) — only emitted
  // when there's a real release date to anchor it to.
  const eventSchema = (movie.releaseDate && !movie.releaseTBA) ? `,
    {
      "@type": "Event",
      "name": ${JSON.stringify(`${movie.title} — Theatrical Release`)},
      "startDate": "${movie.releaseDate}",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": { "@type": "Place", "name": "Cinemas across Odisha", "address": { "@type": "PostalAddress", "addressRegion": "Odisha", "addressCountry": "IN" } },
      "workPerformed": { "@type": "Movie", "name": ${JSON.stringify(movie.title)} },
      "image": ${JSON.stringify(ogImage)},
      "organizer": { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
    }` : "";

  // SEO FIX: MusicRecording schema per song — targets "{Song} lyrics" /
  // "{Song} singer" queries per the audit's ranking-gain recommendations.
  const musicRecordingSchema = hasSongs ? movie.media.songs.filter(s => s.title).map(s => `,
    {
      "@type": "MusicRecording",
      "name": ${JSON.stringify(s.title)},
      "inAlbum": { "@type": "MusicAlbum", "name": ${JSON.stringify(`${movie.title} (Original Motion Picture Soundtrack)`)} }${s.singer ? `,
      "byArtist": { "@type": "Person", "name": ${JSON.stringify(s.singer)} }` : ""}${s.musicDirector ? `,
      "composer": { "@type": "Person", "name": ${JSON.stringify(s.musicDirector)} }` : ""}${s.lyricist ? `,
      "lyricist": { "@type": "Person", "name": ${JSON.stringify(s.lyricist)} }` : ""}
    }`).join("") : "";

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${seoTitle}
  description:    ${ai.metaDescription}
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${blogSlug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${seoTitle}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${blogSlug}
  og:image:       ${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dm}
  article:author: Ollypedia Team
  article:section: ${(movie.genre || [])[0] || "Movies"}
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${seoTitle}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
  twitter:image:alt: ${movie.title} Poster
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(seoTitle)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dm}",
      "inLanguage": "en",
      "wordCount": ${plainWordCount},
      "keywords": ${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}",
                     "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" } },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${blogSlug}" },
      "about": {
        "@type": "Movie",
        "name": ${JSON.stringify(movie.title)},
        "url": "${SITE_URL}${movieUrl}",
        "image": ${JSON.stringify(ogImage)},
        "inLanguage": ${JSON.stringify(movie.language || "Odia")},
        "genre": ${JSON.stringify(genre)}${movie.releaseDate ? `,
        "datePublished": "${movie.releaseDate}"` : ""}${movie.contentRating ? `,
        "contentRating": ${JSON.stringify(movie.contentRating)}` : ""}${movie.runtime ? `,
        "duration": ${JSON.stringify(movie.runtime)}` : ""}${productionCompanyName ? `,
        "productionCompany": { "@type": "Organization", "name": ${JSON.stringify(productionCompanyName)} }` : ""}${cc.director ? `,
        "director": { "@type": "Person", "name": ${JSON.stringify(cc.director)} }` : ""}${cc.producer ? `,
        "producer": { "@type": "Person", "name": ${JSON.stringify(cc.producer)} }` : ""}${cc.leadCast.length ? `,
        "actor": [${cc.leadCast.map(a => { const u = castProfileUrl(a); return `{ "@type": "Person", "name": ${JSON.stringify(a.name)}${u ? `, "url": "${SITE_URL}${u}"` : ""} }`; }).join(", ")}]` : ""}${trailerId ? `,
        "trailer": { "@type": "VideoObject", "name": ${JSON.stringify(`${movie.title} — Official Trailer`)}, "embedUrl": "https://www.youtube.com/embed/${trailerId}", "thumbnailUrl": ${JSON.stringify(movie.media?.trailer?.thumbnailUrl || `https://img.youtube.com/vi/${trailerId}/hqdefault.jpg`)}, "uploadDate": "${movie.createdAt ? new Date(movie.createdAt).toISOString() : dp}" }` : ""}${hasImdb ? `,
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": ${imdbNum}, "bestRating": "10"${movie.imdbVotes ? `, "ratingCount": ${JSON.stringify(String(movie.imdbVotes).replace(/[^0-9]/g, "") || "1")}` : ""} }` : ""}
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Movies", "item": "${SITE_URL}/movies" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movie.title)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "Details & Cast", "item": "${SITE_URL}/blog/${blogSlug}" }
      ]
    }${trailerId ? `,
    {
      "@type": "VideoObject",
      "name": ${JSON.stringify(`${movie.title} — Official Trailer`)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "thumbnailUrl": ${JSON.stringify(movie.media?.trailer?.thumbnailUrl || `https://img.youtube.com/vi/${trailerId}/hqdefault.jpg`)},
      "uploadDate": "${movie.createdAt ? new Date(movie.createdAt).toISOString() : dp}",
      "embedUrl": "https://www.youtube.com/embed/${trailerId}"
    }` : ""}${eventSchema}${musicRecordingSchema}
  ]
}
</script>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/" style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/movies" style="color:#777;text-decoration:none;">Movies</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movie.title}</a>
    <span style="color:#333;">›</span>
    <span style="color:#999;">Details &amp; Cast</span>
  </nav>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#1a0e00 0%,#121212 100%);border:1px solid #2e2000;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
  <h1 style="color:#fff;font-size:1.4rem;font-weight:800;margin:0 0 12px;line-height:1.3;">${seoTitle}</h1>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
    <span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#c9973a;font-weight:700;">${genre}</span>
    <span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#7ec8e3;font-weight:700;">${movie.language || "Odia"}</span>
    <span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#e8c87a;font-weight:700;">📅 ${releaseFmt}</span>
    ${hasImdb ? `<span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#f5c518;font-weight:700;">⭐ ${imdbNum}/10 IMDb</span>` : ""}
  </div>
  ${autoBlogParagraphs(ai.introParagraph)}
</div>

${tocHtml}

${BLOG_RESPONSIVE_STYLES}
<style>
  .blog-content-layout { display: flex; flex-direction: column; gap: 24px; }
  .blog-poster-aside { width: 100%; max-width: 300px; margin: 0 auto; }
  .blog-poster-aside img { width: 100%; height: auto; border-radius: 12px; border: 1px solid #242424; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
  @media (min-width: 900px) {
    .blog-content-layout { flex-direction: row; align-items: flex-start; }
    .blog-poster-aside { width: 240px; position: sticky; top: 80px; flex-shrink: 0; }
  }
</style>

<div class="blog-content-layout">
  <aside class="blog-poster-aside">
    ${poster ? `<img src="${poster}" alt="${movie.title} Poster" width="240" height="360" fetchpriority="high" style="object-fit:cover;" onError="this.style.display='none'" />` : ""}
    <a href="${movieUrl}" style="display:block;background:#c9973a;color:#000;font-weight:800;font-size:0.82rem;padding:10px;border-radius:8px;text-decoration:none;margin-top:12px;text-align:center;">View Full Movie Page →</a>
  </aside>
  <div style="flex: 1; min-width: 0;">
    <section id="quick-facts" style="${card}">
      <h2 style="${h2}">Quick Facts</h2>
      <table style="width:100%;border-collapse:collapse;" class="info-table">
        <tbody>
          <tr><td style="${tdL}">Release Date</td><td style="${tdR}">${releaseFmt}</td></tr>
          <tr><td style="${tdL}">Genre</td><td style="${tdR}">${genre}</td></tr>
          <tr><td style="${tdL}">Language</td><td style="${tdR}">${movie.language || "Odia"}</td></tr>
          ${movie.runtime ? `<tr><td style="${tdL}">Runtime</td><td style="${tdR}">${movie.runtime}</td></tr>` : ""}
          ${movie.contentRating ? `<tr><td style="${tdL}">Certification</td><td style="${tdR}">${movie.contentRating}</td></tr>` : ""}
          ${keyCrewRows}
        </tbody>
      </table>
    </section>

    <section id="story" style="${card}">
      <h2 style="${h2}">Story &amp; Plot</h2>
      ${autoBlogParagraphs(ai.storyParagraph)}
    </section>

    <section id="cast-crew" style="${card}">
      <h2 style="${h2}">Cast &amp; Crew</h2>
      ${autoBlogParagraphs(ai.castCrewParagraph)}
      ${castRows ? `
      <h3 style="${h3}">Lead Cast</h3>
      <div class="tbl-scroll" style="overflow-x:auto;margin-top:10px;">
        <table style="width:100%;border-collapse:collapse;min-width:320px;" class="data-table">
          <thead><tr><th style="${th}">Name</th><th style="${th}">Role</th></tr></thead>
          <tbody>${castRows}</tbody>
        </table>
      </div>` : ""}
      ${keyCrewRows ? `<h3 style="${h3}">Key Crew</h3><p style="color:#999;line-height:1.8;margin:0;font-size:0.87rem;">See the full crew breakdown in Quick Facts above, including director, producer, music direction, writing, cinematography, and editing credits.</p>` : ""}
    </section>

    <section id="director-vision" style="${card}">
      <h2 style="${h2}">Director's Vision</h2>
      ${autoBlogParagraphs(ai.directorVisionParagraph)}
    </section>

    ${hasSongs ? `
    <section id="music" style="${card}">
      <h2 style="${h2}">Music &amp; Soundtrack</h2>
      ${autoBlogParagraphs(ai.musicParagraph)}
      <div class="tbl-scroll" style="overflow-x:auto;margin-top:10px;">
        <table style="width:100%;border-collapse:collapse;min-width:320px;" class="data-table">
          <thead><tr><th style="${th}">Song</th><th style="${th}">Singer</th></tr></thead>
          <tbody>${songRows}</tbody>
        </table>
      </div>
    </section>` : `
    <section id="music" style="${card}">
      <h2 style="${h2}">Music &amp; Soundtrack</h2>
      ${autoBlogParagraphs(ai.musicParagraph)}
    </section>`}

    ${trailerId ? `
    <section id="trailer" style="${card}">
      <h2 style="${h2}">Official Trailer</h2>
      <div style="position:relative;padding-top:56.25%;border-radius:10px;overflow:hidden;background:#000;">
        <iframe src="https://www.youtube.com/embed/${trailerId}" loading="lazy" title="${movie.title} Official Trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe>
      </div>
    </section>` : ""}

    ${hasBoxOffice ? `
    <section id="box-office" style="${card}">
      <h2 style="${h2}">Box Office Collection</h2>
      <table style="width:100%;border-collapse:collapse;" class="info-table">
        <tbody>
          ${movie.boxOffice.opening && movie.boxOffice.opening !== "TBA" ? `<tr><td style="${tdL}">Opening Day</td><td style="${tdR}">${movie.boxOffice.opening}</td></tr>` : ""}
          ${movie.boxOffice.firstWeek && movie.boxOffice.firstWeek !== "TBA" ? `<tr><td style="${tdL}">First Week</td><td style="${tdR}">${movie.boxOffice.firstWeek}</td></tr>` : ""}
          ${movie.boxOffice.total && movie.boxOffice.total !== "TBA" ? `<tr><td style="${tdL}">Total Collection</td><td style="${tdR}">${movie.boxOffice.total}</td></tr>` : ""}
        </tbody>
      </table>
    </section>` : ""}

    <section id="where-to-watch" style="${card}">
      <h2 style="${h2}">Where to Watch</h2>
      ${autoBlogParagraphs(ai.whereToWatchParagraph)}
    </section>

    <section id="anticipation" style="${card}">
      <h2 style="${h2}">Why Watch ${movie.title}?</h2>
      ${autoBlogParagraphs(ai.anticipationParagraph)}
    </section>

    ${buildRelatedMoviesHtml(relatedMovies, "#c9973a")}

    <section style="background:#111;border-radius:14px;padding:20px 26px;margin-bottom:22px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="/movies" style="display:inline-block;background:#c9973a;color:#000;font-weight:800;font-size:0.85rem;padding:10px 22px;border-radius:8px;text-decoration:none;">Browse More Odia Movies →</a>
    </section>
  </div>
</div>`;
}

/**
 * autoGenerateMovieDetailsBlog — orchestrates AI + HTML + publish for the
 * "Movie Details" blog. Creates a new Blog if movie.detailBlogId is empty,
 * otherwise updates the existing one. Never throws — caller fire-and-forgets.
 */
/** Build a URL-safe slug from the full SEO title — preserves key words for SEO.
 *  Legacy helper, still used as a final fallback for slug collisions. */
function titleToSlug(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 120); // max 120 chars to keep URLs manageable
}

/** Trim a hyphenated slug down to maxLen WITHOUT cutting a word in half —
 *  drops whole trailing segments instead of leaving a truncated half-word. */
function trimSlugToLength(slug, maxLen) {
  if (slug.length <= maxLen) return slug;
  const parts = slug.split("-");
  let out = "";
  for (const part of parts) {
    const next = out ? `${out}-${part}` : part;
    if (next.length > maxLen) break;
    out = next;
  }
  return out || slug.slice(0, maxLen);
}

/** SEO FIX: short, clean, keyword-rich slug for the Movie Details blog —
 *  "bindusagar-2026-movie-details" instead of the full ~120-char SEO-title
 *  slug. Capped at 60 chars per Google's URL-length guidance. */
function buildMovieDetailsSlug(movie) {
  const base = trimSlugToLength(makeMovieSlug(movie.title, movie.releaseDate), 45);
  return trimSlugToLength(`${base}-movie-details`, 60);
}

/** SEO FIX: short OTT-release slug that does NOT embed the release date
 *  (a date-bearing slug goes stale the moment the film actually releases).
 *  "bindusagar-2026-ott-release-tarang-plus" — platform name included for
 *  keyword relevance, capped at 60 chars. */
function buildOttSlug(movie) {
  const base = trimSlugToLength(makeMovieSlug(movie.title, movie.releaseDate), 35);
  const platform = trimSlugToLength(
    String(movie.streamingOn || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim(),
    15
  );
  return trimSlugToLength(`${base}-ott-release${platform ? `-${platform}` : ""}`, 60);
}

/** SEO FIX: short "now streaming" slug — distinct from buildOttSlug so the
 *  two OTT pages never collide, and short enough to stay memorable. */
function buildOttLiveSlug(movie) {
  const base = trimSlugToLength(makeMovieSlug(movie.title, movie.releaseDate), 30);
  const platform = trimSlugToLength(
    String(movie.streamingOn || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim(),
    15
  );
  return trimSlugToLength(`${base}-streaming-now${platform ? `-${platform}` : ""}`, 60);
}

async function autoGenerateMovieDetailsBlog(movie) {
  try {
    const cc = extractMovieCastCrew(movie);
    const ai = await generateMovieDetailsAiSections(movie, cc);
    const seoTitle = buildMovieDetailsTitle(movie);
    // SEO FIX: short, clean slug (≤60 chars) instead of the full ~120-char
    // SEO-title slug — e.g. "bindusagar-2026-movie-details".
    const baseSlug = buildMovieDetailsSlug(movie);
    // SEO FIX: related movies for internal linking (closes the "content
    // island" gap flagged in the audit's contextual-information section).
    const relatedMovies = await fetchRelatedMovies(movie);

    let blog = movie.detailBlogId ? await Blog.findById(movie.detailBlogId) : null;
    if (!blog) blog = await Blog.findOne({ slug: baseSlug }); // catch orphaned/duplicate slug instead of crashing
    const slug = blog ? blog.slug : baseSlug;
    // dateModified should reflect the real last-edit time, not "now" on every
    // regeneration — pass the existing blog's updatedAt through (createdAt for
    // brand-new posts so datePublished === dateModified on first publish).
    const datePublished = blog?.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString();
    const dateModified = new Date().toISOString();
    const html = buildMovieDetailsBlogHTML(movie, cc, ai, slug, seoTitle, datePublished, dateModified, relatedMovies);

    const fields = {
      title: seoTitle,
      excerpt: ai.metaDescription,
      content: html,
      category: "Movie Update",
      tags: [movie.title, "Ollywood", "Odia Movie", ...(movie.genre || [])],
      coverImage: movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "",
      movieId: movie._id,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      readTime: Math.max(1, Math.ceil(html.split(/\s+/).length / 200)),
      seoTitle: seoTitle,
      seoDesc: ai.metaDescription,
    };

    if (blog) {
      Object.assign(blog, fields);
      await blog.save();
    } else {
      blog = await Blog.create({ ...fields, slug });
      await Movie.findByIdAndUpdate(movie._id, { detailBlogId: blog._id });
    }
    console.log(`✅ Auto-published Movie Details blog for "${movie.title}" → /blog/${blog.slug}`);
    return blog;
  } catch (e) {
    console.error(`❌ autoGenerateMovieDetailsBlog failed for "${movie?.title}":`, e.message);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  SONG FIRST DROP BLOG
// ─────────────────────────────────────────────────────────────────────────────
/**
 * cleanSongTitle — strips YouTube video title noise after the first " | "
 * e.g. "Megha Kadamba | Full Video Song | Rakta Golapa | ..."  →  "Megha Kadamba"
 * Safe for plain song titles that have no pipe — returns as-is.
 */
function cleanSongTitle(raw) {
  return String(raw || "").split("|")[0].trim();
}

/**
 * buildSongSlug — "[song-title]-[drop-name]-from-[movie-slug]-song-details"
 * Max 100 chars, URL-safe.
 */
function buildSongSlug(songTitle, movie, dropSlug, hasLyrics) {
  const clean = cleanSongTitle(songTitle);
  // Allow all unicode letters and numbers
  const st = trimSlugToLength(
    clean.toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") // remove leading/trailing hyphens
      .trim(),
    40
  );
  const ms = trimSlugToLength(makeMovieSlug(movie.title, movie.releaseDate), 30);
  const drop = dropSlug || "first-drop";
  const slugPrefix = st ? `${st}-` : "";

  if (hasLyrics) {
    return trimSlugToLength(`${slugPrefix}${drop}-lyrics-from-${ms}`, 100);
  }
  return trimSlugToLength(`${slugPrefix}${drop}-from-${ms}-song-details`, 100);
}

/**
 * buildSongTitle — SEO title for the song blog. Capped at 130 chars (user requested longer, detailed titles).
 * Uses cleanSongTitle() to strip YouTube video title noise.
 */
function buildSongTitle(songTitle, movie, dropLabel, hasLyrics, singer, md) {
  const clean = cleanSongTitle(songTitle);
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const movieStr = `${movie.title}${year ? ` (${year})` : ""}`;
  const dLabel = dropLabel || "First Drop";
  const sng = singer ? `, ${singer}` : "";
  const mus = md ? `, ${md}` : "";

  let full;
  if (hasLyrics) {
    full = `${clean} ${dLabel} Lyrics from ${movieStr} – Full Lyrics${sng}${mus} & Song Details`;
  } else {
    full = `${clean} ${dLabel} from ${movieStr} – Release${sng}${mus} & Full Details`;
  }

  // Increased limit from 70 to 130 so the rich user-requested template doesn't fallback incorrectly
  if (full.length <= 130) return full;

  // Shorter fallback pattern
  const short = hasLyrics
    ? `${clean} ${dLabel} Lyrics | ${movieStr} | Ollypedia`
    : `${clean} ${dLabel} | ${movieStr} | Ollypedia`;

  if (short.length <= 130) return short;
  return short.slice(0, 127) + "...";
}

/**
 * buildSongSeoDesc — meta description for the song blog.
 * Uses cleanSongTitle() to strip YouTube noise from song.title.
 */
function buildSongSeoDesc(song, movie) {
  const clean = cleanSongTitle(song.title);
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const singer = song.singer || "";
  const md = song.musicDirector || "";
  return [
    `Listen to "${clean}" — the latest song from ${movie.title}${year ? ` (${year})` : ""} Odia film.`,
    singer ? `Sung by ${singer}.` : "",
    md ? `Music by ${md}.` : "",
    `Watch the official video, read lyrics, and get full song details on Ollypedia.`,
  ].filter(Boolean).join(" ").slice(0, 160);
}

/**
 * generateSongAiSections — Groq-powered editorial content for the song blog.
 * Returns { intro, aboutSong, lyricsNote, verdict, metaDescription }
 *
 * When song.description is provided it is used as the PRIMARY source of truth —
 * the AI must rewrite it into a rich, human-like multi-paragraph editorial.
 * Raw description text must NEVER be copied verbatim into the output.
 */
async function generateSongAiSections(song, movie, cc) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const singer = song.singer || "the vocalist";
  const md = song.musicDirector || cc.musicDirector || "the music director";
  const lyricist = song.lyricist || "";
  const genre = (movie.genre || []).join(", ") || "Odia";
  const hasDesc = !!(song.description || "").trim();
  const hasLyrics = !!(song.lyrics || "").trim();

  const fallbacks = {
    intro: `${song.title} is the latest song from the Odia film ${movie.title}${year ? ` (${year})` : ""}. Sung by ${singer} with music by ${md}, this track is poised to become a defining highlight of the film's soundtrack.`,
    aboutSong: hasDesc
      ? `${song.title} captures the emotional essence of ${movie.title} in a way that only a song crafted with this much care can. ${singer}'s voice carries the melody with effortless grace, while ${md}'s composition creates a sonic landscape that lingers long after the music ends. Every element — from the arrangement to the production — speaks to the ambition behind this release, making it one of the standout tracks of the Ollywood season.`
      : `The song showcases the vocal brilliance of ${singer} and the musical craftsmanship of ${md}. It perfectly captures the emotional mood of the ${genre} film and is expected to resonate deeply with Ollywood audiences. The composition strikes a careful balance between melody and feeling, making it a track that will stay with listeners well beyond their first listen.`,
    lyricsNote: hasLyrics
      ? `The lyrics of ${song.title} are steeped in Odia cultural expression, giving voice to emotions that feel both personal and universal. Reading through the full lyrics below reveals the depth of craft behind the song's story, adding a new layer of appreciation beyond the melody itself.`
      : `The lyrics of ${song.title} are poetic and deeply rooted in Odia cultural sensibility, weaving themes of emotion and lived experience that fans of ${movie.title} will immediately connect with.`,
    verdict: `${song.title} is a soulful and memorable addition to the ${movie.title} soundtrack — the kind of song that earns repeat listens. With ${singer}'s heartfelt delivery and ${md}'s evocative composition, this is Ollywood music at its finest. Watch the full video on Ollypedia.`,
    metaDescription: buildSongSeoDesc(song, movie),
    audioCredits: [],
    videoCredits: [],
  };

  // Build the description context block for the prompt
  const descContext = hasDesc
    ? `\n\nSong Description provided by creators (CRITICAL: Extract ALL audio & video credits if mentioned. Also use this to write the aboutSong editorial):\n"""\n${song.description}\n"""`
    : "";

  const aboutSongInstruction = hasDesc
    ? `- aboutSong (5-6 long, highly detailed paragraphs): A deeply human, engaging editorial review of the song. You MUST incorporate every detail, fact, name, or context mentioned in the "Song Description" above. Discuss emotional tone, artists' performances, production nuances. Write in a warm, enthusiastic, and sophisticated journalistic voice (300-400 words).\n- audioCredits: Extract a JSON array of objects with keys "role" and "name" for all audio-related credits (Singer, Music Director, Lyricist, etc.) from the description.\n- videoCredits: Extract a JSON array of objects with keys "role" and "name" for all video-related credits (Director, Choreographer, Editor, etc.) from the description.`
    : `- aboutSong (3-4 paragraphs, each 4-5 sentences): A human-like editorial about the song — musical style, emotional mood, the artist's delivery, and what makes this track special for ${genre} fans.\n- audioCredits: []\n- videoCredits: []`;

  return callGroqStructured(
    `You are a seasoned Odia film music journalist writing long-form, deeply expressive, and human-like editorial articles for Ollypedia.in.
Write in fluent, highly engaging, and descriptive English. Be specific and enthusiastic. Avoid sounding robotic.
Never copy source text verbatim — always rewrite into uniquely phrased, original editorial prose.
Return ONLY a valid JSON object with exactly these keys: intro, aboutSong, lyricsNote, verdict, metaDescription, audioCredits, videoCredits.
For credits, return a JSON array of objects with "role" and "name" keys. If none exist, return an empty array [].`,
    `Write a full, rich song feature article for the Ollywood song:
Song title: "${song.title}"
Movie: "${movie.title}" (${year || "upcoming"})
Genre: ${genre}
Singer: ${singer}
Music Director: ${md}${lyricist ? `\nLyricist: ${lyricist}` : ""}
${hasLyrics ? "Lyrics: PROVIDED (full lyrics are displayed on this page — mention naturally in lyricsNote)" : "Lyrics: Not provided"}${descContext}

Keys to fill:
- intro (3–4 sentences): A compelling opening hook that introduces the song and its emotional significance within ${movie.title}. Set the stage like the opening line of a great music review.
${aboutSongInstruction}
- lyricsNote (3-4 sentences): About the lyrical theme, depth, and emotional connect. Dive into how the words elevate the music.${hasLyrics ? " Naturally mention that full lyrics are available below on this page." : ""}
- verdict (2-3 sentences): A strong, memorable closing recommendation. End with exactly "Watch the full video on Ollypedia."
- metaDescription (max 155 chars): SEO meta description.${hasLyrics ? ' Include the word "lyrics" naturally.' : ""}`,
    ["intro", "aboutSong", "lyricsNote", "verdict", "metaDescription", "audioCredits", "videoCredits"],
    fallbacks,
    3000
  );
}

/**
 * buildSongBlogHTML — full article HTML for the song First Drop blog.
 * Follows the same dark-theme design system as movie detail / OTT blogs.
 */
function buildSongBlogHTML(song, movie, cc, ai, blogSlug, seoTitle, datePublished, dateModified, relatedMovies = [], dropLabel = "First Drop") {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const singer = song.singer || "";
  const md = song.musicDirector || cc.musicDirector || "";
  const lyricist = song.lyricist || "";
  const genre = (movie.genre || []).join(", ") || "Odia";
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;
  const movieUrl = `/movie/${movie.slug || movie._id}`;
  const songUrl = `/songs/${movie.slug || movie._id}/${(movie.media?.songs || []).findIndex(s => s.title === song.title)}/${String(song.title || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").trim()}`;
  const dp = datePublished || new Date().toISOString();
  const dm = dateModified || dp;
  const ytVideoId = song.ytId || "";
  const thumbnail = song.thumbnailUrl || (ytVideoId ? `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg` : ogImage);

  const card = `background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;`;
  const h2 = `font-size:1.05rem;font-weight:800;color:#c9973a;border-left:4px solid #c9973a;padding-left:12px;margin:0 0 18px;line-height:1.3;`;
  const tdL = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.87rem;width:38%;vertical-align:top;`;
  const tdR = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;font-weight:600;`;

  const leadNames = cc.leadCast.map(c => c.name).filter(Boolean);
  const allSongs = (movie.media?.songs || []).filter(s => s.title && s.title !== song.title);

  // ── Schema JSON-LD ─────────────────────────────────────────────────────────
  const schemaObj = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Article", "MusicRecording"],
        "headline": seoTitle.replace(/ \| Ollypedia$/, ""),
        "description": ai.metaDescription || buildSongSeoDesc(song, movie),
        "datePublished": dp,
        "dateModified": dm,
        "image": thumbnail,
        "inLanguage": "en-IN",
        "articleSection": "Songs",
        "author": { "@type": "Organization", "name": "Ollypedia", "url": SITE_URL },
        "publisher": {
          "@type": "Organization", "name": "Ollypedia", "url": SITE_URL,
          "logo": { "@type": "ImageObject", "url": `${SITE_URL}/logo.png`, "width": 600, "height": 60 }
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `${SITE_URL}/blog/${blogSlug}` },
        "about": { "@type": "Movie", "name": movie.title, "url": `${SITE_URL}${movieUrl}` },
        ...(singer ? { "byArtist": { "@type": "MusicGroup", "name": singer } } : {}),
        ...(md ? { "producer": { "@type": "Person", "name": md } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": "Songs", "item": `${SITE_URL}/songs` },
          { "@type": "ListItem", "position": 3, "name": movie.title, "item": `${SITE_URL}${movieUrl}` },
          { "@type": "ListItem", "position": 4, "name": `${song.title} ${dropLabel}`, "item": `${SITE_URL}/blog/${blogSlug}` },
        ],
      },
      ...(ytVideoId ? [{
        "@type": "VideoObject",
        "name": `${song.title} — Official Video | ${movie.title}`,
        "description": ai.metaDescription || buildSongSeoDesc(song, movie),
        "thumbnailUrl": thumbnail,
        "uploadDate": dp,
        "embedUrl": `https://www.youtube.com/embed/${ytVideoId}`,
        "contentUrl": `https://www.youtube.com/watch?v=${ytVideoId}`,
      }] : []),
    ],
  };

  // ── Keywords ────────────────────────────────────────────────────────────────
  const keywordsArr = [
    song.title, `${song.title} lyrics`, `${song.title} video`,
    `${song.title} ${movie.title}`, `${song.title} odia song`,
    singer ? `${song.title} ${singer}` : "",
    singer ? `${singer} songs` : "",
    md ? `${md} music` : "",
    movie.title, `${movie.title} songs`, `${movie.title} ${year || ""}`.trim(),
    "Odia songs", "Odia film songs", "Ollywood songs",
    ...leadNames.map(n => `${n} songs`),
    genre ? `${genre} odia songs` : "",
  ].filter(Boolean);
  const keywordsStr = [...new Set(keywordsArr)].join(", ");

  // ── Other songs from same movie ─────────────────────────────────────────────
  const otherSongsHtml = allSongs.length > 0 ? `
<section style="${card}">
  <h2 style="${h2}">More Songs from ${movie.title}</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;">
    ${allSongs.map(s => {
    const sIdx = (movie.media?.songs || []).findIndex(x => x.title === s.title);
    const dropSlug = ordinalDropName(sIdx > -1 ? sIdx : 0).slug;
    const sBlogSlug = buildSongSlug(s.title, movie, dropSlug, Boolean(s.lyrics?.trim()));
    const cTitle = cleanSongTitle(s.title);
    return `
    <a href="/blog/${sBlogSlug}" style="display:flex;flex-direction:column;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;text-decoration:none;transition:border-color 0.2s;">
      <div style="position:relative;width:100%;padding-bottom:56.25%;background:#000;">
        ${s.ytId ? `<img src="https://img.youtube.com/vi/${s.ytId}/hqdefault.jpg" alt="${cTitle}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" loading="lazy">` : `<div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">🎵</div>`}
      </div>
      <div style="padding:12px 14px;">
        <div style="font-size:0.85rem;font-weight:700;color:#ddd;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${cTitle}">${cTitle}</div>
        ${s.singer ? `<div style="font-size:0.72rem;color:#666;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${s.singer}">${s.singer}</div>` : ""}
      </div>
    </a>`;
  }).join("")}
  </div>
</section>` : "";

  // ── Related movies ──────────────────────────────────────────────────────────
  const relatedHtml = relatedMovies.length > 0 ? buildRelatedMoviesHtml(relatedMovies, "#c9973a", "More Odia Films") : "";

  // ── Also Read ───────────────────────────────────────────────────────────────
  const alsoReadHtml = `
<section class="faq-section" style="${card}margin-bottom:22px;">
  <h2 style="${h2}">Also Read</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
    <a href="${movieUrl}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎬</span>
      <div><div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movie.title} — Full Movie Details</div><div style="font-size:0.72rem;color:#666;margin-top:2px;">Cast, story & release info</div></div>
    </a>
    <a href="/songs" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎵</span>
      <div><div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">All Odia Songs</div><div style="font-size:0.72rem;color:#666;margin-top:2px;">Latest Ollywood music</div></div>
    </a>
    <a href="/blog?category=Songs" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">📰</span>
      <div><div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">More Song Features</div><div style="font-size:0.72rem;color:#666;margin-top:2px;">Odia music coverage on Ollypedia</div></div>
    </a>
  </div>
</section>`;

  // ── Tags ────────────────────────────────────────────────────────────────────
  const tagChip = (t) => `<span style="display:inline-block;background:#1e1e1e;color:#c9973a;border:1px solid #3a2800;border-radius:20px;padding:4px 13px;font-size:0.78rem;font-weight:600;margin:2px;">#${t.replace(/\s+/g, "")}</span>`;
  const tagsList = [song.title, `${song.title}Song`, movie.title, "OdiaSong", "Ollywood", "OdiaMusic", singer ? singer.replace(/\s/g, "") : "", "OllywoodSongs"].filter(Boolean);

  // ── Full HTML ───────────────────────────────────────────────────────────────
  return `${BLOG_RESPONSIVE_STYLES}

<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — Song ${dropLabel} Blog
  title:       ${seoTitle}
  description: ${ai.metaDescription || buildSongSeoDesc(song, movie)}
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
${JSON.stringify(schemaObj, null, 2)}
</script>

<!-- BREADCRUMB + TIMESTAMP -->
<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/" style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/songs" style="color:#777;text-decoration:none;">Songs</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movie.title}</a>
    <span style="color:#333;">›</span>
    <span style="color:#c9973a;">${song.title} ${dropLabel}</span>
  </nav>
  <time datetime="${dp.split("T")[0]}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Published: ${formatHumanDate(dp)}
  </time>
</div>

<!-- HERO BANNER -->
<div class="hero-section" style="background:linear-gradient(135deg,#0e001a 0%,#121212 100%);border:1px solid #2e0050;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
  <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    <span style="display:inline-block;background:#1a0030;color:#b388ff;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a0060;">🎵 Song ${dropLabel}</span>
    <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">${movie.title}${year ? ` (${year})` : ""}</span>
  </div>

  <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.7rem);line-height:1.3;font-weight:800;margin:0 0 12px;word-break:break-word;">
    ${song.title} — ${dropLabel} from ${movie.title}${year ? ` (${year})` : ""}
  </h1>

  <p style="color:#bbb;font-size:0.97rem;line-height:1.85;margin:0 0 20px;">${ai.intro}</p>

  <div class="stat-chips" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;">
    ${singer ? `<div style="background:rgba(0,0,0,0.5);border:1px solid #2e0050;border-radius:10px;padding:12px 14px;"><div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">Singer</div><div style="font-size:0.92rem;font-weight:800;color:#b388ff;word-break:break-word;">${singer}</div></div>` : ""}
    ${md ? `<div style="background:rgba(0,0,0,0.5);border:1px solid #1a2a3a;border-radius:10px;padding:12px 14px;"><div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">Music</div><div style="font-size:0.92rem;font-weight:800;color:#7ec8e3;word-break:break-word;">${md}</div></div>` : ""}
    ${lyricist ? `<div style="background:rgba(0,0,0,0.5);border:1px solid #222;border-radius:10px;padding:12px 14px;"><div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">Lyricist</div><div style="font-size:0.92rem;font-weight:800;color:#fff;word-break:break-word;">${lyricist}</div></div>` : ""}
    <div style="background:rgba(0,0,0,0.5);border:1px solid #2a2a2a;border-radius:10px;padding:12px 14px;"><div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">Film</div><div style="font-size:0.92rem;font-weight:800;color:#c9973a;word-break:break-word;">${movie.title}</div></div>
  </div>
</div>

<!-- YOUTUBE VIDEO EMBED -->
${ytVideoId ? `
<section style="${card}">
  <h2 style="${h2}">🎬 Official Video — ${song.title}</h2>
  <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#000;">
    <iframe
      src="https://www.youtube.com/embed/${ytVideoId}?rel=0&modestbranding=1"
      title="${song.title} — Official Video from ${movie.title}"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      loading="lazy"
      style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:10px;">
    </iframe>
  </div>
  <p style="color:#555;font-size:0.75rem;margin:10px 0 0;">▶ Watch "${song.title}" official video from <strong style="color:#777;">${movie.title}</strong> on YouTube</p>
</section>` : poster ? `
<section style="${card}text-align:center;">
  <h2 style="${h2}">🎵 ${song.title}</h2>
  <img src="${poster}" alt="${song.title} — ${movie.title}" style="max-width:320px;width:100%;border-radius:12px;border:1px solid #2a2a2a;" loading="lazy">
  <p style="color:#555;font-size:0.78rem;margin:12px 0 0;">Official video coming soon. Follow Ollypedia for updates.</p>
</section>` : ""}

<!-- SONG DETAILS TABLE -->
<section style="${card}">
  <h2 style="${h2}">Song Details — ${song.title}</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tbody>
      <tr><td style="${tdL}">Song Title</td><td style="${tdR}">${song.title}</td></tr>
      <tr><td style="${tdL}">Film</td><td style="${tdR}"><a href="${movieUrl}" style="color:#c9973a;text-decoration:underline;text-underline-offset:2px;">${movie.title}${year ? ` (${year})` : ""}</a></td></tr>
      ${singer ? `<tr><td style="${tdL}">Singer</td><td style="${tdR}">${singer}</td></tr>` : ""}
      ${md ? `<tr><td style="${tdL}">Music Director</td><td style="${tdR}">${md}</td></tr>` : ""}
      ${lyricist ? `<tr><td style="${tdL}">Lyricist</td><td style="${tdR}">${lyricist}</td></tr>` : ""}
      ${cc.director ? `<tr><td style="${tdL}">Director</td><td style="${tdR}">${cc.director}</td></tr>` : ""}
      <tr><td style="${tdL}">Language</td><td style="${tdR}">Odia</td></tr>
      <tr><td style="${tdL}">Industry</td><td style="${tdR}">Ollywood</td></tr>
    </tbody>
  </table>
  <div style="text-align:center;margin-top:20px;">
    <a href="${movieUrl}" style="display:inline-block;background:#c9973a;color:#000;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:800;font-size:0.9rem;">
      🎬 View Full Movie Details
    </a>
  </div>
</section>

<!-- ABOUT THE SONG -->
<section style="${card}">
  <h2 style="${h2}">About the Song — ${song.title}</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 14px;font-size:0.97rem;">${ai.aboutSong}</p>
</section>

<!-- LYRICS NOTE -->
<section style="${card}">
  <h2 style="${h2}">Lyrics & Theme</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 14px;font-size:0.97rem;">${ai.lyricsNote}</p>
  ${song.lyrics ? `
  <div style="background:#0f0f0f;border:1px solid #2a2a2a;border-radius:10px;padding:20px 22px;margin-top:14px;">
    <h3 style="font-size:0.8rem;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px;">Song Lyrics</h3>
    <pre style="color:#aaa;font-size:0.9rem;line-height:1.9;white-space:pre-wrap;word-break:break-word;margin:0;font-family:inherit;">${song.lyrics}</pre>
  </div>` : ""}
</section>

<!-- VERDICT -->
<section style="${card}">
  <h2 style="${h2}">Verdict</h2>
  <div style="border-left:4px solid #c9973a;padding-left:16px;">
    <p style="color:#ccc;line-height:1.9;margin:0;font-size:0.97rem;">${ai.verdict}</p>
  </div>
</section>

${(() => {
      const buildCreditsTable = (title, credits) => {
        if (!Array.isArray(credits) || credits.length === 0) return "";
        return `
<section style="${card}">
  <h3 style="${h2.replace('1.05rem', '0.95rem')}">${title}</h3>
  <table style="width:100%;border-collapse:collapse;">
    <tbody>
      ${credits.map(c => `<tr><td style="${tdL}">${c.role || "Credit"}</td><td style="${tdR}">${c.name || "-"}</td></tr>`).join("")}
    </tbody>
  </table>
</section>`;
      };
      return buildCreditsTable("Audio Credits", ai.audioCredits) + buildCreditsTable("Video Credits", ai.videoCredits);
    })()}

<!-- MORE SONGS FROM THIS MOVIE -->
${otherSongsHtml}

<!-- RELATED MOVIES -->
${relatedHtml}

<!-- ALSO READ -->
${alsoReadHtml}

<!-- TAGS -->
<section style="background:#111;border-radius:14px;padding:18px 22px;margin-bottom:22px;">
  <h2 style="font-size:0.7rem;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px;">Tags</h2>
  <div style="display:flex;flex-wrap:wrap;gap:5px;">${tagsList.map(t => tagChip(t)).join("")}</div>
</section>

<!-- FOOTER -->
<div style="border-top:1px solid #1c1c1c;padding-top:14px;margin-top:4px;">
  <p style="color:#444;font-size:0.8rem;line-height:1.8;margin:0;">
    <strong style="color:#555;">Source:</strong> Ollypedia Song Database &nbsp;·&nbsp;
    <strong style="color:#555;">Published:</strong> <time datetime="${dp.split("T")[0]}" style="color:#444;">${formatHumanDate(dp)}</time> &nbsp;·&nbsp;
    <a href="${movieUrl}" style="color:#c9973a;text-decoration:none;">View ${movie.title} full details →</a>
  </p>
</div>`;
}

/**
 * Helper to generate ordinal drop names (First Drop, Second Drop, etc.)
 */
function ordinalDropName(index) {
  const words = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
  const label = words[index] ? `${words[index]} Drop` : `Drop ${index + 1}`;
  const slug = words[index] ? `${words[index].toLowerCase()}-drop` : `drop-${index + 1}`;
  return { label, slug };
}

/**
 * autoGenerateSongBlog — creates a "Nth Drop" blog for a single song.
 *
 * songIndex: 0-based position of the song in movie.media.songs.
 *   - Index 0 → First Drop, 1 → Second Drop, etc.
 *   - Used in slug, title, meta description, hero badge, breadcrumb, and structured data.
 *
 * onlyIfNew: when true (default), the blog is SKIPPED if one already exists for this
 *   song slug. This prevents re-generation when editing a movie that already has song
 *   blogs — only truly new songs get a blog created.
 *   Pass false when you explicitly want to regenerate/update an existing blog
 *   (e.g. when the song's ytId or lyrics are updated via the dedicated song edit route).
 */
async function autoGenerateSongBlog(song, movie, songIndex = 0, onlyIfNew = true) {
  if (!song?.title?.trim()) return null;
  try {
    const { label: dropLabel, slug: dropSlug } = ordinalDropName(songIndex);
    const cc = extractMovieCastCrew(movie);
    const hasLyrics = Boolean(song.lyrics?.trim());
    const seoTitle = buildSongTitle(song.title, movie, dropLabel, hasLyrics, song.singer || "", song.musicDirector || cc.musicDirector || "");
    const baseSlug = buildSongSlug(song.title, movie, dropSlug, hasLyrics);
    const seoDesc = buildSongSeoDesc(song, movie, dropLabel);

    // ── Existence check ───────────────────────────────────────────────────
    // If onlyIfNew is true, skip silently when a blog already exists for this song.
    // Instead of relying on baseSlug (which changes based on index and lyrics), 
    // we query the DB directly using movieId and song title inside tags.
    let blog = null;
    if (onlyIfNew) {
      blog = await Blog.findOne({ movieId: movie._id, category: { $in: ["Songs", "Song Updates"] }, tags: song.title });
      if (blog) {
        console.log(`⏭ Song blog already exists for "${song.title}" (${movie.title}) — skipping (onlyIfNew=true)`);
        return blog;
      }
    } else {
      // For updates, try finding by title first, otherwise fallback to existing baseSlug mapping.
      blog = await Blog.findOne({ movieId: movie._id, category: { $in: ["Songs", "Song Updates"] }, tags: song.title });
      if (!blog) {
        const existingId = movie.songBlogIds instanceof Map
          ? movie.songBlogIds.get(baseSlug)
          : (movie.songBlogIds || {})[baseSlug];
        if (existingId) blog = await Blog.findById(existingId);
        if (!blog) blog = await Blog.findOne({ slug: baseSlug });
      }
    }

    const relatedMovies = await fetchRelatedMovies(movie);
    const ai = await generateSongAiSections(song, movie, cc);
    const dp = new Date().toISOString();
    const datePublished = blog?.createdAt ? new Date(blog.createdAt).toISOString() : dp;
    const dateModified = dp;
    const html = buildSongBlogHTML(song, movie, cc, ai, blog?.slug || baseSlug, seoTitle, datePublished, dateModified, relatedMovies, dropLabel);

    const fields = {
      title: seoTitle,
      excerpt: seoDesc,
      content: html,
      category: "Song Updates",
      tags: [song.title, movie.title, "Odia Songs", "Ollywood", "Odia Music", song.singer || "", song.musicDirector || cc.musicDirector || ""].filter(Boolean),
      coverImage: song.thumbnailUrl || (song.ytId ? `https://img.youtube.com/vi/${song.ytId}/hqdefault.jpg` : movie.posterUrl || movie.thumbnailUrl || ""),
      movieId: movie._id,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      indexed: true,   // song blogs are always indexable — each is a unique entity
      readTime: Math.max(1, Math.ceil(html.split(/\s+/).length / 200)),
      seoTitle: seoTitle,
      seoDesc: seoDesc,
      youtubeVideoId: song.ytId || "",
    };

    if (blog) {
      Object.assign(blog, fields);
      await blog.save();
      console.log(`✅ Updated Song blog for "${song.title}" (${movie.title}) → /blog/${blog.slug}`);
    } else {
      blog = await Blog.create({ ...fields, slug: baseSlug });
      // Store the blog ID in the movie's songBlogIds map
      await Movie.findByIdAndUpdate(movie._id, {
        $set: { [`songBlogIds.${baseSlug}`]: blog._id },
      });
      console.log(`✅ Created Song blog for "${song.title}" (${movie.title}) → /blog/${blog.slug} [${dropLabel}]`);
    }
    return blog;
  } catch (e) {
    console.error(`❌ autoGenerateSongBlog failed for "${song?.title}" (${movie?.title}):`, e.message);
    return null;
  }
}

/**
 * autoGenerateAllSongBlogs — iterates all songs of a movie and generates a blog for each.
 * Called when a movie is created with songs already attached.
 * Always passes onlyIfNew=true so existing song blogs are never clobbered on re-runs.
 */
async function autoGenerateAllSongBlogs(movie) {
  const songs = movie.media?.songs || [];
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (song?.title?.trim()) {
      await autoGenerateSongBlog(song, movie, i, true);
    }
  }
}



// ─────────────────────────────────────────────────────────────────────────────
//  OTT RELEASE BLOG
// ─────────────────────────────────────────────────────────────────────────────

async function generateOttAiSections(movie, cc) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const isDateAvailable = isRealDate(movie.ottReleaseDate);
  const ottDateFmt = isDateAvailable ? formatHumanDate(movie.ottReleaseDate) : "Release Date Not Announced";
  // BUGFIX: use the strictly-filtered ottCast so the AI is never told a
  // Cinematographer/Editor/Music Director is part of the "Lead Cast".
  const leadNames = (cc.ottCast || cc.leadCast).map(c => c.name).filter(Boolean).join(", ");
  const festival = isDateAvailable ? findNearbyFestival(movie.ottReleaseDate) : "";

  const ctx = `Movie: "${movie.title}"${year ? ` (${year})` : ""} | OTT Platform: ${movie.streamingOn} | OTT Release Date: ${ottDateFmt} | Genre: ${(movie.genre || []).join(", ") || "Odia"} | Language: ${movie.language || "Odia"} | Lead Cast: ${leadNames || "N/A"} | Director: ${cc.director || "N/A"} | Synopsis: ${movie.synopsis || "N/A"}${festival ? ` | Note: this OTT release falls close to ${festival} — you may mention this naturally if it fits.` : ""}`;

  const userPrompt = `Write deeply detailed, SEO-rich JSON content for an OTT-release announcement article on Ollypedia, an Odia (Ollywood) cinema website, about the film "${movie.title}" streaming on ${movie.streamingOn}. This MUST be a full editorial article with long, rich paragraphs — each paragraph should feel like professional journalism. Use ONLY the details given. No HTML or markdown.

${ctx}

Return a JSON object with exactly these keys (plain text only, NO HTML, NO markdown, aim for maximum detail):
- metaDescription: 150-160 characters mentioning movie title, OTT platform and release status/date, maximising Google click-through
- introParagraph: 220-320 words announcing that "${movie.title}" will stream on ${movie.streamingOn}. Name the lead cast, detail the genre and story highlights, explain why this OTT release is significant for Odia cinema fans, and clearly state the release status: ${ottDateFmt}.
- synopsisParagraph: 200-280 words recapping the film's story, genre, thematic conflicts, emotional highlights, and what makes it worth watching on OTT. Draw from the synopsis and genre; do not invent specific plot points not mentioned. Write to help a viewer decide whether to watch. IMPORTANT: paraphrase and reframe in your own words for an OTT/streaming context — do not copy the source synopsis verbatim, since this same film also has a separate theatrical-release article with its own story section.
- castHighlightParagraph: 200-280 words specifically naming and highlighting each lead actor — their roles, acting style, past notable performances in Odia cinema, and what they bring to this specific film. Make it feel like a genuine talent profile piece.
- howToWatchParagraph: 180-250 words explaining step-by-step how Odisha audiences can stream the film on ${movie.streamingOn} — app download, website access, subscription tiers, regional language content availability, and how digital OTT access is transforming Odia cinema viewership.
- platformParagraph: 150-220 words introducing ${movie.streamingOn} as an OTT platform — its founding story, growth, content library, focus on regional Indian language films, contribution to Odia cinema's digital accessibility, and why it is a key destination for Ollywood fans.`;

  const fallbacks = {
    metaDescription: `${movie.title} streams on ${movie.streamingOn}. Get cast, release details and how-to-watch info on Ollypedia.`,
    introParagraph: `${movie.title}${leadNames ? `, starring ${leadNames},` : ""} is set to stream on the popular OTT platform ${movie.streamingOn}. The OTT release status is currently: ${ottDateFmt}. This digital premiere marks an exciting milestone for Odia cinema fans everywhere, giving audiences across Odisha and around the world the opportunity to experience this ${(movie.genre || []).join(", ") || "Odia"} film from the comfort of their homes. With the growing reach of regional OTT platforms like ${movie.streamingOn}, Odia cinema is finding new audiences far beyond the traditional theatrical circuit, and ${movie.title} is set to be a significant addition to this wave of digital content.`,
    // SEO FIX: previously fell back to the raw, unmodified `movie.synopsis`
    // string — byte-identical to the Movie Details page's storyParagraph
    // fallback, which the audit flags as duplicate content across blog
    // pages for the same movie. Now reframes the synopsis with OTT-specific
    // context instead of repeating it verbatim.
    synopsisParagraph: movie.synopsis
      ? `Now streaming on ${movie.streamingOn}, ${movie.title} tells a story that has resonated strongly with Odia audiences since it was first announced. ${movie.synopsis} For viewers deciding whether to press play, this ${(movie.genre || []).join(", ") || "Odia"} film offers a self-contained viewing experience that holds up just as well on a home screen as it did in theatres.`
      : `${movie.title} is a ${(movie.genre || []).join(", ") || "Odia"} film that has drawn considerable attention from Ollywood audiences and critics alike. The film carries a story built around the cultural and emotional landscape of Odisha, exploring themes that resonate deeply with Odia viewers. Full story details, including character backgrounds and plot specifics, will be updated as officially confirmed by the production team. What is clear is that ${movie.title} combines strong performances with a compelling narrative structure that is ideal for OTT viewing.`,
    castHighlightParagraph: leadNames ? `${leadNames} lead the cast of ${movie.title}, each bringing their distinctive acting strengths and on-screen presence to their respective roles. The ensemble is widely regarded as one of the strongest assembled for an Odia film in recent memory, with each actor having established themselves as a significant talent in the Ollywood industry. Their combined performances are expected to be a major draw for OTT audiences discovering the film on ${movie.streamingOn}, and early reviews of their work on screen have been overwhelmingly positive.` : `${movie.title} features a talented cast of Odia cinema's most acclaimed performers, whose nuanced portrayals and strong screen chemistry are expected to be the highlight of this OTT viewing experience on ${movie.streamingOn}. The casting choices reflect the production team's commitment to quality storytelling and authentic representation of Odia culture and characters.`,
    howToWatchParagraph: `Viewers can catch ${movie.title} on ${movie.streamingOn} by downloading the official app from the Google Play Store or Apple App Store, or by visiting the platform's website directly. ${movie.streamingOn} offers subscription plans tailored for Odia-speaking audiences, with options for monthly and annual memberships that provide unlimited access to its growing library of Odia films, web series, and regional content. Once subscribed, simply search for "${movie.title}" in the app or website to start streaming. Ollypedia will update the direct streaming link as soon as it goes live officially.`,
    platformParagraph: `${movie.streamingOn} is among the leading OTT platforms dedicated to bringing Odia-language films, web series, and regional entertainment to digital screens across India and beyond. With a rapidly growing content library and a strong focus on authentic regional storytelling, ${movie.streamingOn} has become a vital destination for Odia cinema fans who want to stay connected with Ollywood's latest releases. The platform's commitment to supporting Odia-language content creators and giving regional films a digital home has made it an important part of the Ollywood ecosystem.`,
  };

  return callGroqStructured(
    "You are a senior Odia cinema (Ollywood) journalist writing long-form, highly detailed, SEO-optimised editorial articles for Ollypedia. Return ONLY a valid JSON object — no markdown, no code fences, no extra text. All values must be plain text with no HTML. Each paragraph must be thorough, specific, and written like professional film journalism. Every sentence must add real value.",
    userPrompt,
    ["metaDescription", "introParagraph", "synopsisParagraph", "castHighlightParagraph", "howToWatchParagraph", "platformParagraph"],
    fallbacks,
    4000
  );
}

function buildOttBlogHTML(movie, cc, ai, blogSlug, seoTitle, datePublished, dateModified, relatedMovies = []) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const isDateAvailable = isRealDate(movie.ottReleaseDate);
  const ottDateFmt = isDateAvailable ? formatHumanDate(movie.ottReleaseDate) : "Release Date Not Announced";
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;
  const movieUrl = `/movie/${movie.slug}`;
  // BUGFIX: use the strictly-filtered ottCast (Director + Actor + Actress
  // only) for this blog's Cast section and its actor[] schema — NOT the
  // shared cc.leadCast, which can include crew (Cinematographer, Editor,
  // Music Director, etc.) whenever their role string isn't recognized by
  // the shared fail-open filter in extractMovieCastCrew. Scoped to this
  // function only; cc.leadCast itself is untouched, so the Movie Details
  // page (and its JSON-LD) are completely unaffected.
  const leadCast = cc.ottCast || cc.leadCast || [];
  const imdbNum = parseFloat(movie.imdbRating);
  const hasImdb = !isNaN(imdbNum) && imdbNum > 0 && imdbNum <= 10;
  const dp = datePublished || new Date().toISOString();
  const dm = dateModified || dp;

  const card = `background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;`;
  const h2 = `font-size:1.05rem;font-weight:800;color:#7ec8e3;border-left:4px solid #7ec8e3;padding-left:12px;margin:0 0 18px;line-height:1.3;`;
  const tdL = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.87rem;width:38%;vertical-align:top;`;
  const tdR = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;font-weight:600;`;

  const castChips = leadCast.map(c => {
    const url = castProfileUrl(c);
    return `<span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#ddd;">${url ? `<a href="${url}" style="color:#7ec8e3;text-decoration:underline;text-underline-offset:2px;">${c.name}</a>` : c.name}</span>`;
  }).join("");

  const leadNames = leadCast.map(c => c.name).filter(Boolean);
  const keywordsArr = [
    movie.title, `${movie.title} OTT release date`, `${movie.title} ${movie.streamingOn}`,
    `watch ${movie.title} online`, `${movie.title} streaming`, movie.streamingOn,
    `${movie.streamingOn} odia movies`, "Odia movie OTT", "Ollywood streaming",
    ...leadNames.map(n => `${n} movies`),
  ].filter(Boolean);
  const keywordsStr = [...new Set(keywordsArr)].join(", ");

  const toc = [
    ["OTT Release Details", "release-details"], ["Story", "synopsis"], ["Cast Highlights", "cast"],
    ["How to Watch", "how-to-watch"], [`About ${movie.streamingOn}`, "platform"],
    relatedMovies.length ? ["Related Movies", "related-movies"] : null,
  ].filter(Boolean);
  const tocHtml = `
<nav aria-label="Table of contents" style="${card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    ${toc.map(([label, id]) => `<li><a href="#${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">${label}</a></li>`).join("")}
  </ul>
</nav>`;

  const plainWordCount = [ai.introParagraph, ai.synopsisParagraph, ai.castHighlightParagraph, ai.howToWatchParagraph, ai.platformParagraph]
    .filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;

  // SEO FIX: Event schema for the OTT premiere — only emitted with a real date.
  const eventSchema = isDateAvailable ? `,
    {
      "@type": "Event",
      "name": ${JSON.stringify(`${movie.title} — OTT Premiere on ${movie.streamingOn}`)},
      "startDate": "${movie.ottReleaseDate}",
      "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": { "@type": "VirtualLocation", "url": ${JSON.stringify(movie.streamingUrl || SITE_URL + movieUrl)} },
      "workPerformed": { "@type": "Movie", "name": ${JSON.stringify(movie.title)} },
      "image": ${JSON.stringify(ogImage)},
      "organizer": { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
    }` : "";

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${seoTitle}
  description:    ${ai.metaDescription}
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${blogSlug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${seoTitle}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${blogSlug}
  og:image:       ${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dm}
  article:author: Ollypedia Team
  article:section: OTT Release
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${seoTitle}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
  twitter:image:alt: ${movie.title} Poster
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(seoTitle)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dm}",
      "inLanguage": "en",
      "wordCount": ${plainWordCount},
      "keywords": ${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}",
                     "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" } },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${blogSlug}" },
      "about": {
        "@type": "Movie",
        "name": ${JSON.stringify(movie.title)},
        "url": "${SITE_URL}${movieUrl}",
        "image": ${JSON.stringify(ogImage)},
        "inLanguage": ${JSON.stringify(movie.language || "Odia")}${movie.releaseDate ? `,
        "datePublished": "${movie.releaseDate}"` : ""}${movie.runtime ? `,
        "duration": ${JSON.stringify(movie.runtime)}` : ""}${cc.director ? `,
        "director": { "@type": "Person", "name": ${JSON.stringify(cc.director)} }` : ""}${leadCast.length ? `,
        "actor": [${leadCast.map(a => { const u = castProfileUrl(a); return `{ "@type": "Person", "name": ${JSON.stringify(a.name)}${u ? `, "url": "${SITE_URL}${u}"` : ""} }`; }).join(", ")}]` : ""}${hasImdb ? `,
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": ${imdbNum}, "bestRating": "10"${movie.imdbVotes ? `, "ratingCount": ${JSON.stringify(String(movie.imdbVotes).replace(/[^0-9]/g, "") || "1")}` : ""} }` : ""}${movie.streamingUrl ? `,
        "potentialAction": {
          "@type": "WatchAction",
          "target": ${JSON.stringify(movie.streamingUrl)}
        }` : ""}
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Movies", "item": "${SITE_URL}/movies" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movie.title)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "OTT Release", "item": "${SITE_URL}/blog/${blogSlug}" }
      ]
    }${eventSchema}
  ]
}
</script>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/" style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/movies" style="color:#777;text-decoration:none;">Movies</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movie.title}</a>
    <span style="color:#333;">›</span>
    <span style="color:#999;">OTT Release</span>
  </nav>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#001a1e 0%,#121212 100%);border:1px solid #00343d;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
  <h1 style="color:#fff;font-size:1.4rem;font-weight:800;margin:0 0 12px;line-height:1.3;">${seoTitle}</h1>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
    <span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#7ec8e3;font-weight:700;">📺 ${movie.streamingOn}</span>
    <span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#e8c87a;font-weight:700;">📅 ${ottDateFmt}</span>
    ${castChips}
  </div>
  ${autoBlogParagraphs(ai.introParagraph)}
</div>

${tocHtml}

${BLOG_RESPONSIVE_STYLES}
<style>
  .blog-content-layout { display: flex; flex-direction: column; gap: 24px; }
  .blog-poster-aside { width: 100%; max-width: 300px; margin: 0 auto; }
  .blog-poster-aside img { width: 100%; height: auto; border-radius: 12px; border: 1px solid #242424; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
  @media (min-width: 900px) {
    .blog-content-layout { flex-direction: row; align-items: flex-start; }
    .blog-poster-aside { width: 240px; position: sticky; top: 80px; flex-shrink: 0; }
  }
</style>

<div class="blog-content-layout">
  <aside class="blog-poster-aside">
    ${poster ? `<img src="${poster}" alt="${movie.title} Poster" width="240" height="360" fetchpriority="high" style="object-fit:cover;" onError="this.style.display='none'" />` : ""}
    ${movie.streamingUrl ? `<a href="${movie.streamingUrl}" target="_blank" rel="nofollow noopener noreferrer" style="display:block;background:#7ec8e3;color:#000;font-weight:800;font-size:0.82rem;padding:10px;border-radius:8px;text-decoration:none;margin-top:12px;text-align:center;">▶ Watch on ${movie.streamingOn}</a>` : `<a href="${movieUrl}" style="display:block;background:#7ec8e3;color:#000;font-weight:800;font-size:0.82rem;padding:10px;border-radius:8px;text-decoration:none;margin-top:12px;text-align:center;">View Full Movie Page →</a>`}
  </aside>
  <div style="flex: 1; min-width: 0;">
    <section id="release-details" style="${card}">
      <h2 style="${h2}">OTT Release Details</h2>
      <table style="width:100%;border-collapse:collapse;" class="info-table">
        <tbody>
          <tr><td style="${tdL}">Streaming Platform</td><td style="${tdR}">${movie.streamingOn}</td></tr>
          <tr><td style="${tdL}">OTT Release Date</td><td style="${tdR}">${ottDateFmt}</td></tr>
          <tr><td style="${tdL}">Language</td><td style="${tdR}">${movie.language || "Odia"}</td></tr>
          ${(movie.genre || []).length ? `<tr><td style="${tdL}">Genre</td><td style="${tdR}">${(movie.genre || []).join(", ")}</td></tr>` : ""}
          ${movie.releaseDate ? `<tr><td style="${tdL}">Theatrical Release</td><td style="${tdR}">${formatHumanDate(movie.releaseDate)}</td></tr>` : ""}
        </tbody>
      </table>
    </section>

    <section id="synopsis" style="${card}">
      <h2 style="${h2}">Story</h2>
      ${autoBlogParagraphs(ai.synopsisParagraph)}
    </section>

    <section id="cast" style="${card}">
      <h2 style="${h2}">Cast Highlights</h2>
      ${autoBlogParagraphs(ai.castHighlightParagraph)}
    </section>

    <section id="how-to-watch" style="${card}">
      <h2 style="${h2}">How to Watch</h2>
      ${autoBlogParagraphs(ai.howToWatchParagraph)}
      ${movie.streamingUrl ? `<a href="${movie.streamingUrl}" target="_blank" rel="nofollow noopener noreferrer" class="cta-btn" style="display:inline-block;background:#7ec8e3;color:#000;font-weight:800;font-size:0.85rem;padding:10px 22px;border-radius:8px;text-decoration:none;margin-top:6px;">Watch on ${movie.streamingOn} →</a>` : ""}
    </section>

    <section id="platform" style="${card}">
      <h2 style="${h2}">About ${movie.streamingOn}</h2>
      ${autoBlogParagraphs(ai.platformParagraph)}
    </section>

    ${buildRelatedMoviesHtml(relatedMovies, "#7ec8e3", `More Odia Movies on ${movie.streamingOn}`)}

    <section style="background:#111;border-radius:14px;padding:20px 26px;margin-bottom:22px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="${movieUrl}" style="display:inline-block;background:#c9973a;color:#000;font-weight:800;font-size:0.85rem;padding:10px 22px;border-radius:8px;text-decoration:none;">View Full Movie Page →</a>
      <a href="/movies" style="display:inline-block;background:transparent;border:1px solid #333;color:#ccc;font-weight:700;font-size:0.85rem;padding:10px 22px;border-radius:8px;text-decoration:none;">Browse More Odia Movies →</a>
    </section>
  </div>
</div>`;
}

/**
 * autoGenerateOttBlog — orchestrates AI + HTML + publish for the
 * "OTT Release" blog. Creates a new Blog if movie.ottBlogId is empty,
 * otherwise updates the existing one (so correcting the OTT date later
 * doesn't create a duplicate post). Never throws.
 */
async function autoGenerateOttBlog(movie) {
  try {
    if (!movie.streamingOn) return null;

    const cc = extractMovieCastCrew(movie);
    const ai = await generateOttAiSections(movie, cc);
    const seoTitle = buildOttTitle(movie, cc);
    // SEO FIX: short slug that does NOT embed the OTT release date (so it
    // never goes stale), e.g. "bindusagar-2026-ott-release-tarang-plus".
    const baseSlug = buildOttSlug(movie);
    // SEO FIX: prefer related movies on the SAME platform first (the audit's
    // "Also available on {Platform}" recommendation), falling back to
    // genre-matched movies if the platform alone doesn't yield enough.
    const relatedMovies = await fetchRelatedMovies(movie, 4, true);

    let blog = movie.ottBlogId ? await Blog.findById(movie.ottBlogId) : null;
    if (!blog) blog = await Blog.findOne({ slug: baseSlug }); // catch orphaned/duplicate slug instead of crashing
    const slug = blog ? blog.slug : baseSlug;
    const datePublished = blog?.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString();
    const dateModified = new Date().toISOString();
    const html = buildOttBlogHTML(movie, cc, ai, slug, seoTitle, datePublished, dateModified, relatedMovies);

    const fields = {
      title: seoTitle,
      excerpt: ai.metaDescription,
      content: html,
      category: "OTT Release",
      tags: [movie.title, movie.streamingOn, "OTT Release", "Odia Movie"],
      coverImage: movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "",
      movieId: movie._id,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      readTime: Math.max(1, Math.ceil(html.split(/\s+/).length / 200)),
      seoTitle: seoTitle,
      seoDesc: ai.metaDescription,
    };

    if (blog) {
      Object.assign(blog, fields);
      await blog.save();
    } else {
      blog = await Blog.create({ ...fields, slug });
      await Movie.findByIdAndUpdate(movie._id, { ottBlogId: blog._id });
    }
    console.log(`✅ Auto-published OTT Release blog for "${movie.title}" → /blog/${blog.slug}`);
    return blog;
  } catch (e) {
    console.error(`❌ autoGenerateOttBlog failed for "${movie?.title}":`, e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  "NOW STREAMING ON OTT" LIVE BLOG
//  Generated when the OTT release date has arrived (today >= ottReleaseDate).
//  Stored in movie.ottLiveBlogId — completely separate from ottBlogId.
// ─────────────────────────────────────────────────────────────────────────────

/** SEO title for the "Now Streaming" blog.
 *  SEO FIX: dropped the redundant "Available to Watch Online" padding
 *  (every streaming announcement implies availability — the phrase added
 *  no keyword value) and capped at 90 chars so long names/platforms don't
 *  get truncated by Google with a graceful 1-lead-name fallback. */
function buildOttLiveTitle(movie, cc) {
  // BUGFIX: same fix as buildOttTitle — use the strictly-filtered ottCast
  // so a crew member never ends up named as a "Starrer" in the title.
  const build = (leadCount) => {
    const leads = (cc.ottCast || cc.leadCast || []).slice(0, leadCount).map(c => c.name).filter(Boolean);
    const subject = leads.length ? `${leads.join(" & ")} Starrer` : "Odia Movie";
    return `${movie.title} Is Now Streaming on ${movie.streamingOn}: ${subject}`.replace(/\s+/g, " ").trim();
  };
  let title = build(2);
  if (title.length > 90) title = build(1);
  if (title.length > 90) title = build(0);
  return title.length > 90 ? title.slice(0, 89).trim() + "…" : title;
}

async function generateOttLiveAiSections(movie, cc) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const ottDateFmt = isRealDate(movie.ottReleaseDate) ? formatHumanDate(movie.ottReleaseDate) : "Now";
  // BUGFIX: use the strictly-filtered ottCast so the AI is never told a
  // Cinematographer/Editor/Music Director is part of the "Lead Cast".
  const leadNames = (cc.ottCast || cc.leadCast).map(c => c.name).filter(Boolean).join(", ");
  const genre = (movie.genre || []).join(", ") || "Odia";

  const ctx = `Movie: "${movie.title}"${year ? ` (${year})` : ""} | Now Streaming on: ${movie.streamingOn} | OTT Release Date: ${ottDateFmt} | Genre: ${genre} | Language: ${movie.language || "Odia"} | Lead Cast: ${leadNames || "N/A"} | Director: ${cc.director || "N/A"} | Synopsis: ${movie.synopsis || "N/A"} | Streaming URL: ${movie.streamingUrl || "N/A"}`;

  const userPrompt = `Write deeply detailed, SEO-rich JSON content for a "Now Streaming on OTT" announcement article on Ollypedia, an Odia (Ollywood) cinema website. The film "${movie.title}" is NOW AVAILABLE to stream on ${movie.streamingOn} as of ${ottDateFmt}. Write in an excited, celebratory, present-tense editorial tone. This must feel like a breaking news announcement for Odia cinema fans. No HTML or markdown in values.

${ctx}

Return a JSON object with exactly these keys (plain text only, NO HTML, NO markdown):
- metaDescription: 150-160 characters announcing that "${movie.title}" is NOW streaming on ${movie.streamingOn}, with date, maximising click-through
- introParagraph: 250-350 words — breaking-news style announcement that "${movie.title}" is NOW AVAILABLE on ${movie.streamingOn} as of ${ottDateFmt}. Name the lead cast, describe what kind of film it is (genre, emotional tone, story highlights), explain why this is an exciting moment for Odia cinema, and urge fans to watch it today.
- whyWatchParagraph: 250-350 words — a compelling editorial making the case for why viewers should watch "${movie.title}" RIGHT NOW on ${movie.streamingOn}. Cover the story's emotional appeal, the quality of the performances, the director's craft, what makes this film stand out from other Odia films, and what kind of viewer will love it most.
- synopsisParagraph: 200-280 words — a vivid, spoiler-free retelling of the film's story that makes viewers want to press play immediately. Focus on the opening setup, main conflict, and emotional stakes without revealing major plot twists. IMPORTANT: paraphrase and reframe in your own words — do not copy the source synopsis verbatim, since this same film also has separate theatrical-release and OTT-release articles with their own story sections.
- castReviewParagraph: 220-300 words — present-tense review-style writing about the lead actors' performances in the film. Name each lead actor, describe their character briefly, and discuss what they bring to the film and why their performances are worth seeing on OTT.
- howToWatchParagraph: 180-250 words — direct, step-by-step guide to streaming "${movie.title}" on ${movie.streamingOn} RIGHT NOW. Include app download instructions, website access, subscription info, and a call to action to start watching immediately.`;

  const fallbacks = {
    metaDescription: `${movie.title} is NOW streaming on ${movie.streamingOn}! Watch this Odia ${genre} film online today. Full details on Ollypedia.`,
    introParagraph: `${movie.title}${leadNames ? `, starring ${leadNames},` : ""} is officially now available to stream on ${movie.streamingOn} as of ${ottDateFmt}. This eagerly awaited Odia ${genre} film has made its digital debut, giving fans across Odisha and around the world the chance to experience it from the comfort of their homes. Directed by ${cc.director || "the talented creative team"}, the film brings together a stellar cast and a compelling story that has been the talk of Ollywood since its theatrical run. With its arrival on ${movie.streamingOn}, ${movie.title} joins the growing library of premium Odia cinema available on OTT, marking another milestone for Ollywood's digital expansion.`,
    whyWatchParagraph: `${movie.title} is the kind of Odia film that demands to be experienced \u2014 and now that it is available on ${movie.streamingOn}, there has never been a better time to press play. The film combines a gripping ${genre.toLowerCase()} narrative with outstanding performances from its lead cast, creating an experience that is both entertaining and emotionally resonant. The direction, cinematography, and production values set a new benchmark for Odia cinema, proving that Ollywood continues to grow in ambition and craft. Whether you are a long-time Odia cinema fan or a newcomer discovering Ollywood through OTT, ${movie.title} is the perfect film to start with.`,
    // SEO FIX: previously fell back to the raw, unmodified `movie.synopsis`
    // string — identical to the other two blog pages' fallbacks. Reframed
    // with "now streaming" / spoiler-light viewing-decision framing instead
    // of repeating the synopsis verbatim, so all three pages read distinctly.
    synopsisParagraph: movie.synopsis
      ? `Here's the setup, without spoiling the journey: ${movie.synopsis} It's a story Odia audiences have already responded to strongly, and watching it now on ${movie.streamingOn} means experiencing those emotional beats with the comfort of a pause button — perfect for catching every detail you might have missed on the big screen.`
      : `${movie.title} is a ${genre} film set in the heart of Odisha, weaving a story that touches on themes of identity, love, struggle, and triumph. The narrative unfolds with a compelling central conflict that keeps viewers engaged from the first scene to the last. With strong character development, authentic dialogue, and a richly depicted setting, the film creates a world that feels real and emotionally involving. Without giving too much away, ${movie.title} delivers a satisfying and memorable cinematic journey that OTT viewers are sure to appreciate at home on ${movie.streamingOn}.`,
    castReviewParagraph: leadNames ? `${leadNames} deliver performances in ${movie.title} that are among the finest of their careers in Odia cinema. Each actor brings depth, authenticity, and a genuine emotional investment to their role, creating characters that linger in the memory long after the film ends. The ensemble dynamic is one of the film's greatest strengths, with the cast working in perfect harmony to bring the story to life with nuance and power. OTT viewers on ${movie.streamingOn} are in for a treat as they experience these performances for the first time.` : `The cast of ${movie.title} delivers remarkable performances that elevate this Odia ${genre.toLowerCase()} film to a memorable cinematic experience. Available now on ${movie.streamingOn}, viewers can witness the full depth and range of the ensemble cast's talents in the comfort of their own homes.`,
    howToWatchParagraph: `To start watching ${movie.title} on ${movie.streamingOn} right now, download the ${movie.streamingOn} app from the Google Play Store or Apple App Store on your smartphone or tablet. Alternatively, visit the ${movie.streamingOn} website directly in your browser. Create an account or log in if you already have one, then choose a subscription plan that suits you \u2014 ${movie.streamingOn} offers flexible monthly and annual options. Once subscribed, search for "${movie.title}" using the search bar and press play to begin streaming instantly. The film is available in Odia with optional subtitles for wider accessibility.`,
  };

  return callGroqStructured(
    "You are a senior Odia cinema (Ollywood) journalist writing a 'Now Streaming on OTT' announcement article for Ollypedia. Return ONLY a valid JSON object \u2014 no markdown, no code fences, no extra text. All values must be plain text with no HTML. Write in an engaged, celebratory, present-tense tone that makes Odia cinema fans excited to watch the film right now. Every sentence must add real value.",
    userPrompt,
    ["metaDescription", "introParagraph", "whyWatchParagraph", "synopsisParagraph", "castReviewParagraph", "howToWatchParagraph"],
    fallbacks,
    4000
  );
}

function buildOttLiveBlogHTML(movie, cc, ai, blogSlug, seoTitle, datePublished, dateModified, relatedMovies = []) {
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const ottDateFmt = isRealDate(movie.ottReleaseDate) ? formatHumanDate(movie.ottReleaseDate) : "Now Available";
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;
  const movieUrl = `/movie/${movie.slug}`;
  // BUGFIX: same fix as the OTT Release blog — use the strictly-filtered
  // ottCast (Director + Actor + Actress only) for this blog's Cast section
  // and its actor[] schema, instead of the shared cc.leadCast (which can
  // include crew). Scoped to this function only.
  const leadCast = cc.ottCast || cc.leadCast || [];
  const genre = (movie.genre || []).join(", ") || "Odia";
  const imdbNum = parseFloat(movie.imdbRating);
  const hasImdb = !isNaN(imdbNum) && imdbNum > 0 && imdbNum <= 10;
  const dp = datePublished || new Date().toISOString();
  const dm = dateModified || dp;

  const card = `background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;`;
  const h2 = `font-size:1.05rem;font-weight:800;color:#4ade80;border-left:4px solid #4ade80;padding-left:12px;margin:0 0 18px;line-height:1.3;`;
  const tdL = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.87rem;width:38%;vertical-align:top;`;
  const tdR = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;font-weight:600;`;

  const castChips = leadCast.map(c => {
    const url = castProfileUrl(c);
    return `<span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#ddd;">${url ? `<a href="${url}" style="color:#4ade80;text-decoration:underline;text-underline-offset:2px;">${c.name}</a>` : c.name}</span>`;
  }).join("");

  const leadNames = leadCast.map(c => c.name).filter(Boolean);
  const keywordsArr = [
    movie.title, `${movie.title} OTT`, `${movie.title} streaming now`, `watch ${movie.title} online`,
    `${movie.title} ${movie.streamingOn}`, movie.streamingOn, `${movie.streamingOn} odia movies`,
    "Odia movie OTT", "Ollywood streaming", "watch odia movie online",
    ...leadNames.map(n => `${n} movies`),
  ].filter(Boolean);
  const keywordsStr = [...new Set(keywordsArr)].join(", ");

  const toc = [
    ["Streaming Details", "stream-details"], ["Why You Should Watch", "why-watch"],
    ["Story", "synopsis"], ["Cast Performances", "cast-review"], ["How to Watch Now", "how-to-watch"],
    relatedMovies.length ? ["Related Movies", "related-movies"] : null,
  ].filter(Boolean);
  const tocHtml = `
<nav aria-label="Table of contents" style="${card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    ${toc.map(([label, id]) => `<li><a href="#${id}" style="color:#4ade80;text-decoration:none;font-size:0.85rem;">${label}</a></li>`).join("")}
  </ul>
</nav>`;

  const plainWordCount = [ai.introParagraph, ai.whyWatchParagraph, ai.synopsisParagraph, ai.castReviewParagraph, ai.howToWatchParagraph]
    .filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${seoTitle}
  description:    ${ai.metaDescription}
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${blogSlug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${seoTitle}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${blogSlug}
  og:image:       ${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dm}
  article:author: Ollypedia Team
  article:section: OTT Release
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${seoTitle}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
  twitter:image:alt: ${movie.title} Poster
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(seoTitle)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dm}",
      "inLanguage": "en",
      "wordCount": ${plainWordCount},
      "keywords": ${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}",
                     "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" } },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${blogSlug}" },
      "about": {
        "@type": "Movie",
        "name": ${JSON.stringify(movie.title)},
        "url": "${SITE_URL}${movieUrl}",
        "image": ${JSON.stringify(ogImage)},
        "inLanguage": ${JSON.stringify(movie.language || "Odia")},
        "genre": ${JSON.stringify(genre)}${movie.releaseDate ? `,
        "datePublished": "${movie.releaseDate}"` : ""}${movie.runtime ? `,
        "duration": ${JSON.stringify(movie.runtime)}` : ""}${cc.director ? `,
        "director": { "@type": "Person", "name": ${JSON.stringify(cc.director)} }` : ""}${leadCast.length ? `,
        "actor": [${leadCast.map(a => { const u = castProfileUrl(a); return `{ "@type": "Person", "name": ${JSON.stringify(a.name)}${u ? `, "url": "${SITE_URL}${u}"` : ""} }`; }).join(", ")}]` : ""}${hasImdb ? `,
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": ${imdbNum}, "bestRating": "10"${movie.imdbVotes ? `, "ratingCount": ${JSON.stringify(String(movie.imdbVotes).replace(/[^0-9]/g, "") || "1")}` : ""} }` : ""}${movie.streamingUrl ? `,
        "potentialAction": {
          "@type": "WatchAction",
          "target": ${JSON.stringify(movie.streamingUrl)}
        }` : ""}
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Movies", "item": "${SITE_URL}/movies" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movie.title)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "Watch Online", "item": "${SITE_URL}/blog/${blogSlug}" }
      ]
    }
  ]
}
</script>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/" style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/movies" style="color:#777;text-decoration:none;">Movies</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movie.title}</a>
    <span style="color:#333;">›</span>
    <span style="color:#999;">Watch Online</span>
  </nav>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#001a0e 0%,#121212 100%);border:1px solid #004d1a;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
  <div style="display:inline-block;background:#4ade80;color:#000;font-size:0.7rem;font-weight:800;padding:4px 12px;border-radius:20px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.08em;">🔴 Now Streaming</div>
  <h1 style="color:#fff;font-size:1.4rem;font-weight:800;margin:0 0 12px;line-height:1.3;">${seoTitle}</h1>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
    <span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#4ade80;font-weight:700;">📺 ${movie.streamingOn}</span>
    <span style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:20px;padding:5px 14px;font-size:0.78rem;color:#e8c87a;font-weight:700;">🗓 ${ottDateFmt}</span>
    ${castChips}
  </div>
  ${autoBlogParagraphs(ai.introParagraph)}
  ${movie.streamingUrl ? `<a href="${movie.streamingUrl}" target="_blank" rel="nofollow noopener noreferrer" style="display:inline-block;background:#4ade80;color:#000;font-weight:800;font-size:0.9rem;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:10px;">▶ Watch Now on ${movie.streamingOn}</a>` : ""}
</div>

${tocHtml}

${BLOG_RESPONSIVE_STYLES}
<style>
  .blog-live-layout { display: flex; flex-direction: column; gap: 24px; }
  .blog-live-poster { width: 100%; max-width: 300px; margin: 0 auto; }
  .blog-live-poster img { width: 100%; height: auto; border-radius: 12px; border: 2px solid #4ade80; box-shadow: 0 8px 32px rgba(74,222,128,0.15); }
  @media (min-width: 900px) {
    .blog-live-layout { flex-direction: row; align-items: flex-start; }
    .blog-live-poster { width: 240px; position: sticky; top: 80px; flex-shrink: 0; }
  }
</style>

<div class="blog-live-layout">
  <aside class="blog-live-poster">
    ${poster ? `<img src="${poster}" alt="${movie.title} Poster" width="240" height="360" fetchpriority="high" style="object-fit:cover;" onError="this.style.display='none'" />` : ""}
    ${movie.streamingUrl ? `<a href="${movie.streamingUrl}" target="_blank" rel="nofollow noopener noreferrer" style="display:block;background:#4ade80;color:#000;font-weight:800;font-size:0.82rem;padding:10px;border-radius:8px;text-decoration:none;margin-top:12px;text-align:center;">▶ Watch on ${movie.streamingOn}</a>` : ""}
  </aside>
  <div style="flex: 1; min-width: 0;">
    <section id="stream-details" style="${card}">
      <h2 style="${h2}">Streaming Details</h2>
      <table style="width:100%;border-collapse:collapse;" class="info-table">
        <tbody>
          <tr><td style="${tdL}">Streaming Platform</td><td style="${tdR}">${movie.streamingOn}</td></tr>
          <tr><td style="${tdL}">OTT Release Date</td><td style="${tdR}">${ottDateFmt}</td></tr>
          <tr><td style="${tdL}">Language</td><td style="${tdR}">${movie.language || "Odia"}</td></tr>
          ${genre ? `<tr><td style="${tdL}">Genre</td><td style="${tdR}">${genre}</td></tr>` : ""}
          ${movie.releaseDate ? `<tr><td style="${tdL}">Theatrical Release</td><td style="${tdR}">${formatHumanDate(movie.releaseDate)}</td></tr>` : ""}
          ${cc.director ? `<tr><td style="${tdL}">Director</td><td style="${tdR}">${(() => { const u = castProfileUrl(cc.directorEntry); return u ? `<a href="${u}" style="color:#4ade80;text-decoration:underline;text-underline-offset:2px;">${cc.director}</a>` : cc.director; })()}</td></tr>` : ""}
          ${movie.runtime ? `<tr><td style="${tdL}">Runtime</td><td style="${tdR}">${movie.runtime}</td></tr>` : ""}
        </tbody>
      </table>
    </section>

    <section id="why-watch" style="${card}">
      <h2 style="${h2}">Why You Should Watch ${movie.title}</h2>
      ${autoBlogParagraphs(ai.whyWatchParagraph)}
    </section>

    <section id="synopsis" style="${card}">
      <h2 style="${h2}">Story</h2>
      ${autoBlogParagraphs(ai.synopsisParagraph)}
    </section>

    <section id="cast-review" style="${card}">
      <h2 style="${h2}">Cast Performances</h2>
      ${autoBlogParagraphs(ai.castReviewParagraph)}
    </section>

    <section id="how-to-watch" style="${card}">
      <h2 style="${h2}">How to Watch Now on ${movie.streamingOn}</h2>
      ${autoBlogParagraphs(ai.howToWatchParagraph)}
      ${movie.streamingUrl ? `<a href="${movie.streamingUrl}" target="_blank" rel="nofollow noopener noreferrer" style="display:inline-block;background:#4ade80;color:#000;font-weight:800;font-size:0.85rem;padding:10px 22px;border-radius:8px;text-decoration:none;margin-top:6px;">▶ Start Watching on ${movie.streamingOn} →</a>` : ""}
    </section>

    ${buildRelatedMoviesHtml(relatedMovies, "#4ade80", `More Odia Movies on ${movie.streamingOn}`)}

    <section style="background:#111;border-radius:14px;padding:20px 26px;margin-bottom:22px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="${movieUrl}" style="display:inline-block;background:#c9973a;color:#000;font-weight:800;font-size:0.85rem;padding:10px 22px;border-radius:8px;text-decoration:none;">View Full Movie Page →</a>
      <a href="/movies" style="display:inline-block;background:transparent;border:1px solid #333;color:#ccc;font-weight:700;font-size:0.85rem;padding:10px 22px;border-radius:8px;text-decoration:none;">Browse More Odia Movies →</a>
    </section>
  </div>
</div>`;
}

/**
 * autoGenerateOttLiveBlog — generates/updates the "Now Streaming on OTT" blog
 * when the OTT release date has arrived. Stored separately in movie.ottLiveBlogId.
 */
async function autoGenerateOttLiveBlog(movie) {
  try {
    if (!movie.streamingOn) return null;
    const cc = extractMovieCastCrew(movie);
    const ai = await generateOttLiveAiSections(movie, cc);
    const seoTitle = buildOttLiveTitle(movie, cc);
    // SEO FIX: short, clean slug (≤60 chars), distinct from the OTT-release
    // slug so the two pages never collide, e.g. "bindusagar-2026-streaming-now-tarang-plus".
    const baseSlug = buildOttLiveSlug(movie);
    const relatedMovies = await fetchRelatedMovies(movie, 4, true);

    let blog = movie.ottLiveBlogId ? await Blog.findById(movie.ottLiveBlogId) : null;
    if (!blog) blog = await Blog.findOne({ slug: baseSlug }); // catch orphaned/duplicate slug instead of crashing
    const slug = blog ? blog.slug : baseSlug;
    const datePublished = blog?.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString();
    const dateModified = new Date().toISOString();
    const html = buildOttLiveBlogHTML(movie, cc, ai, slug, seoTitle, datePublished, dateModified, relatedMovies);

    const fields = {
      title: seoTitle,
      excerpt: ai.metaDescription,
      content: html,
      category: "OTT Release",
      tags: [movie.title, movie.streamingOn, "Now Streaming", "Odia Movie OTT", "Watch Online"],
      coverImage: movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "",
      movieId: movie._id,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      readTime: Math.max(1, Math.ceil(html.split(/\s+/).length / 200)),
      seoTitle: seoTitle,
      seoDesc: ai.metaDescription,
    };

    if (blog) {
      Object.assign(blog, fields);
      await blog.save();
    } else {
      blog = await Blog.create({ ...fields, slug });
      await Movie.findByIdAndUpdate(movie._id, { ottLiveBlogId: blog._id });
    }
    console.log(`✅ Auto-published "Now Streaming" OTT blog for "${movie.title}" → /blog/${blog.slug}`);
    return blog;
  } catch (e) {
    console.error(`❌ autoGenerateOttLiveBlog failed for "${movie?.title}":`, e.message);
    return null;
  }
}

// ════════════════════ END AUTO-BLOG-ON-MOVIE ════════════════════

// Admin User model
const AdminUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}, { timestamps: true });
const AdminUser = mongoose.model("AdminUser", AdminUserSchema);

// ── Contact / Enquiry ─────────────────────────────────────────────
const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  subject: { type: String, default: "General Inquiry" },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
}, { timestamps: true });
const Contact = mongoose.model("Contact", ContactSchema);

// ════════════════════════════════════════════════════════════════
// VISITOR ANALYTICS SCHEMA
// ════════════════════════════════════════════════════════════════
const VisitorLogSchema = new mongoose.Schema({
  ip: { type: String, default: "" },
  country: { type: String, default: "" },
  city: { type: String, default: "" },
  device: { type: String, default: "" },   // "Mobile" | "Desktop" | "Tablet"
  os: { type: String, default: "" },   // "Android" | "iOS" | "Windows" etc.
  browser: { type: String, default: "" },   // "Chrome" | "Safari" etc.
  page: { type: String, default: "/" },  // e.g. "/movies/abc"
  referrer: { type: String, default: "" },
  visitedAt: { type: Date, default: Date.now },
}, { timestamps: false });

VisitorLogSchema.index({ visitedAt: -1 });
VisitorLogSchema.index({ ip: 1, visitedAt: 1 });

const VisitorLog = mongoose.model("VisitorLog", VisitorLogSchema);

// ════════════════════════════════════════════════════════════════
// CAST RESOLUTION HELPER
// ════════════════════════════════════════════════════════════════

/**
 * resolveCastEntry(item) — given a raw cast item from the request body,
 * returns a PLAIN JS object (not a Mongoose doc) ready to be pushed
 * into Movie.cast[]:
 *   { castId: ObjectId, name, photo, type, role }
 *
 * Logic:
 *  • item.castId is a valid 24-hex string AND the Cast doc exists → use it
 *  • otherwise → create a new Cast doc
 *
 * CRITICAL: We never return a stringified ObjectId. We return the actual
 * ObjectId instance so Mongoose can cast it against CastEntrySchema.castId.
 */
async function resolveCastEntry(item) {
  const name = String(item.name || "").trim();
  const type = String(item.type || "Actor");
  const role = String(item.role || "");
  const photo = String(item.photo || "");
  const bio = String(item.bio || "");

  // item.castId could be:
  //  - a valid 24-hex string like "69afd5e377d28936ba5e0344"
  //  - a Mongoose ObjectId object (toString gives the hex)
  //  - an empty string, null, undefined
  //  - something totally wrong like "[object Object]"
  const rawId = item.castId != null ? String(item.castId).trim() : "";
  const validId = isOid(rawId) ? rawId : null;

  if (validId) {
    const existing = await Cast.findById(validId).lean();
    if (existing) {
      // Use the values sent from the form — they reflect the admin's edits.
      // Fall back to the stored Cast doc only if the field is empty.
      const resolvedName = name || existing.name;
      const resolvedPhoto = photo || existing.photo;   // ← was existing.photo || photo (wrong priority)
      const resolvedType = type || existing.type;
      // Also update the Cast doc itself so changes persist on the cast profile
      if (photo && photo !== existing.photo) {
        await Cast.findByIdAndUpdate(validId, { photo });
      }
      return {
        castId: existing._id,
        name: resolvedName,
        photo: resolvedPhoto,
        type: resolvedType,
        role,
      };
    }
  }

  // Create new Cast document
  if (!name) throw new Error("Cast entry requires a name");
  const rolesArr = type ? type.split(",").map(r => r.trim()).filter(Boolean) : ["Actor"];
  const nc = await Cast.create({ name, type: rolesArr[0], roles: rolesArr, bio, photo });
  return {
    castId: nc._id,     // ObjectId instance
    name: nc.name,
    photo: nc.photo,
    type: nc.type,
    role,
  };
}

// ════════════════════════════════════════════════════════════════
// PRODUCTION AUTH
// ════════════════════════════════════════════════════════════════

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, logo, bio, founded, website, location } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Company name required" });
    if (!email) return res.status(400).json({ error: "Email required" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (await Production.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: "Email already registered" });

    const prod = await Production.create({
      name: name.trim(), email: email.toLowerCase(),
      password: await bcrypt.hash(password, 10),
      logo: logo || "", bio: bio || "", founded: founded || "",
      website: website || "", location: location || "",
    });
    const token = jwt.sign({ productionId: prod._id, email: prod.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const obj = prod.toObject(); delete obj.password;
    res.json({ token, production: obj });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const prod = await Production.findOne({ email: email?.toLowerCase() });
    if (!prod || !(await bcrypt.compare(password, prod.password)))
      return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ productionId: prod._id, email: prod.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const obj = prod.toObject(); delete obj.password;
    res.json({ token, production: obj });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// CAST MEMBER AUTH
// ════════════════════════════════════════════════════════════════

app.post("/api/cast-auth/register", async (req, res) => {
  try {
    const { name, email, password, roles, photo, bio, gender, location, dob } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    if (!email) return res.status(400).json({ error: "Email required" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (!roles?.length) return res.status(400).json({ error: "Select at least one role" });
    if (await CastMember.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: "Email already registered" });

    const castDoc = await Cast.create({ name: name.trim(), type: roles[0], bio: bio || "", photo: photo || "" });
    const member = await CastMember.create({
      name: name.trim(), email: email.toLowerCase(), password: await bcrypt.hash(password, 10),
      roles, photo: photo || "", bio: bio || "", gender: gender || "", location: location || "", dob: dob || "",
      castId: castDoc._id,
    });
    const token = jwt.sign({ castMemberId: member._id, email: member.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const obj = member.toObject(); delete obj.password;
    res.json({ token, castMember: obj });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/cast-auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const member = await CastMember.findOne({ email: email?.toLowerCase() });
    if (!member || !(await bcrypt.compare(password, member.password)))
      return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ castMemberId: member._id, email: member.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const obj = member.toObject(); delete obj.password;
    res.json({ token, castMember: obj });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/cast-auth/me", castAuth, async (req, res) => {
  try {
    const member = await CastMember.findById(req.castMemberId).select("-password").lean();
    if (!member) return res.status(404).json({ error: "Not found" });
    const movies = await Movie.find(
      { "cast.castId": member.castId },
      "title posterUrl releaseDate verdict genre productionId cast"
    ).populate("productionId", "name logo").lean();
    res.json({ ...member, movies });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/cast-auth/me", castAuth, async (req, res) => {
  try {
    const allowed = ["name", "photo", "banner", "bio", "gender", "location", "dob", "website", "instagram", "roles"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const member = await CastMember.findByIdAndUpdate(req.castMemberId, update, { new: true, select: "-password" });
    if (member?.castId) {
      const cu = {};
      if (update.name) cu.name = update.name;
      if (update.photo) cu.photo = update.photo;
      if (update.bio) cu.bio = update.bio;
      if (update.location) cu.location = update.location;
      if (update.website) cu.website = update.website;
      if (update.instagram) cu.instagram = update.instagram;
      if (update.roles && Array.isArray(update.roles) && update.roles.length) {
        cu.roles = update.roles;
        cu.type = update.roles[0]; // keep primary type in sync
      }
      if (Object.keys(cu).length) await Cast.findByIdAndUpdate(member.castId, cu);
    }
    res.json(member);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════

app.get("/api/productions", async (req, res) => {
  try {
    const prods = await Production.find({}, "-password -email").lean();
    const counts = await Movie.aggregate([{ $group: { _id: "$productionId", count: { $sum: 1 } } }]);
    const cm = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
    res.json(prods.map(p => ({ ...p, movieCount: cm[String(p._id)] || 0 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// IMPORTANT: /search/:q must come before /:id
app.get("/api/productions/search/:q", async (req, res) => {
  try {
    const prods = await Production.find({ name: { $regex: req.params.q, $options: "i" } }, "-password -email").limit(10).lean();
    res.json(prods);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/productions/:id/movies", async (req, res) => {
  try {
    const movies = await Movie.find({
      $or: [{ productionId: req.params.id }, { collaborators: req.params.id }]
    }, "-reviews").populate("productionId", "name logo").populate("collaborators", "name logo").populate("news").lean();
    res.json(movies);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/productions/:id", async (req, res) => {
  try {
    const prod = await Production.findById(req.params.id, "-password -email").lean();
    if (!prod) return res.status(404).json({ error: "Not found" });
    res.json(prod);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/movies", async (req, res) => {
  try {
    const movies = await Movie.find({}, "-reviews").populate("productionId", "name logo").populate("collaborators", "name logo").lean();
    res.json(movies);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/movies/:id", async (req, res) => {
  try {
    const param = req.params.id;
    // Accept both ObjectId (24-hex) and human-readable slug (e.g. "bindusagar-2026")
    let movie = null;
    if (isOid(param)) {
      movie = await Movie.findById(param)
        .populate("productionId", "name logo").populate("collaborators", "name logo").populate("news").lean();
    } else {
      // Slug lookup — strip any trailing ObjectId if old URLs sneak through
      const slugPart = param.replace(/-[a-f0-9]{24}$/i, "");
      movie = await Movie.findOne({ slug: slugPart })
        .populate("productionId", "name logo").populate("collaborators", "name logo").populate("news").lean();
    }
    if (!movie) return res.status(404).json({ error: "Not found" });
    res.json(movie);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// IMPORTANT: /search/:q must come before /:id
app.get("/api/cast/search/:q", async (req, res) => {
  try {
    const cast = await Cast.find({ name: { $regex: req.params.q, $options: "i" } }).limit(10).lean();
    res.json(cast);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/cast/:id", async (req, res) => {
  try {
    const param = req.params.id;
    let c = null;
    if (isOid(param)) {
      // Standard ObjectId lookup
      c = await Cast.findById(param).lean();
    } else {
      // Name-slug lookup: "babushaan-mohanty" → search by name
      // Convert slug back to searchable name (hyphens → spaces)
      const nameQuery = param.replace(/-/g, " ").trim();
      // Exact case-insensitive match first
      c = await Cast.findOne({ name: { $regex: new RegExp("^" + nameQuery + "$", "i") } }).lean();
      // Fallback: match any cast member whose name words all appear in the slug
      if (!c) {
        const words = nameQuery.split(" ").filter(w => w.length > 2);
        const pattern = words.map(w => "(?=.*" + w + ")").join("") + ".*";
        c = await Cast.findOne({ name: { $regex: new RegExp(pattern, "i") } }).lean();
      }
    }
    if (!c) return res.status(404).json({ error: "Not found" });
    const movies = await Movie.find({ "cast.castId": c._id }, "title posterUrl releaseDate verdict productionId genre cast slug")
      .populate("productionId", "name logo").lean();
    res.json({ ...c, moviesList: movies });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/cast", async (req, res) => {
  try { res.json(await Cast.find().lean()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/news", async (req, res) => {
  try { res.json(await News.find({ published: true }).sort({ createdAt: -1 }).lean()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/news/:newsId", async (req, res) => {
  try {
    const item = await News.findById(req.params.newsId).lean();
    if (!item) return res.status(404).json({ error: "Not found" });
    const related = await News.find({
      _id: { $ne: item._id }, published: true,
      $or: [{ category: item.category }, { movieId: item.movieId }]
    }).sort({ createdAt: -1 }).limit(4).lean();
    let movie = null;
    if (item.movieId)
      movie = await Movie.findById(item.movieId, "title posterUrl genre verdict releaseDate productionId")
        .populate("productionId", "name logo").lean();
    res.json({ ...item, related, movie });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/songs", async (req, res) => {
  try {
    const movies = await Movie.find({}, "title posterUrl media").lean();
    res.json(movies.flatMap(m => (m.media?.songs || []).map(s => ({ ...s, movieTitle: m.title, movieId: m._id, moviePoster: m.posterUrl }))));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/movies/:id/reviews", async (req, res) => {
  try {
    const { user, rating, text } = req.body;
    if (!user?.trim() || !text?.trim()) return res.status(400).json({ error: "Name and review required." });
    const query = isOid(req.params.id) ? { _id: req.params.id } : { slug: req.params.id };
    const movie = await Movie.findOneAndUpdate(
      query,
      { $push: { reviews: { user: user.trim(), rating: Number(rating) || 5, text: text.trim(), date: new Date().toISOString().split("T")[0] } } },
      { new: true }
    );
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    res.json(movie.reviews);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/movies/:id/interested — vote yes or no
app.post("/api/movies/:id/interested", async (req, res) => {
  try {
    const { vote } = req.body;  // "yes" | "no"
    if (!["yes", "no"].includes(vote)) return res.status(400).json({ error: "vote must be yes or no" });
    const query = isOid(req.params.id) ? { _id: req.params.id } : { slug: req.params.id };
    const field = vote === "yes" ? "interestedYes" : "interestedNo";
    const movie = await Movie.findOneAndUpdate(query, { $inc: { [field]: 1 } }, { new: true });
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    res.json({ yes: movie.interestedYes || 0, no: movie.interestedNo || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/movies/:id/interested — get counts
app.get("/api/movies/:id/interested", async (req, res) => {
  try {
    const query = isOid(req.params.id) ? { _id: req.params.id } : { slug: req.params.id };
    const movie = await Movie.findOne(query, "interestedYes interestedNo").lean();
    if (!movie) return res.status(404).json({ error: "Not found" });
    res.json({ yes: movie.interestedYes || 0, no: movie.interestedNo || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// PROTECTED ROUTES
// ════════════════════════════════════════════════════════════════

/**
 * POST /api/movies — Create a new movie
 *
 * The entire cast pipeline:
 *  1. Parse cast from body (array or JSON string)
 *  2. For each item, call resolveCastEntry() which returns a plain object
 *     with castId as a real Mongoose ObjectId (not a string, not "[object Object]")
 *  3. Pass resolvedCast directly to Movie.create({ cast: resolvedCast })
 *  4. After movie is saved, update Cast.movies[] back-references
 */
app.post("/api/movies", auth, async (req, res) => {
  try {
    const b = req.body;

    const title = String(b.title || "").trim();
    if (!title) return res.status(400).json({ error: "Movie title is required" });

    // ── Parse cast ──
    let rawCast = b.cast;
    if (typeof rawCast === "string") {
      try { rawCast = JSON.parse(rawCast); } catch { rawCast = []; }
    }
    if (!Array.isArray(rawCast)) rawCast = [];

    // ── Resolve cast entries ──
    const resolvedCast = [];
    for (const item of rawCast) {
      if (!item) continue;
      // Must have either a name or a valid castId
      const hasName = String(item.name || "").trim().length > 0;
      const hasId = isOid(String(item.castId || "").trim());
      if (!hasName && !hasId) continue;
      try {
        resolvedCast.push(await resolveCastEntry(item));
      } catch (err) {
        console.warn("⚠️  Skipping cast entry:", item.name || item.castId, "—", err.message);
      }
    }

    // ── Parse collaborators ──
    let rawCollab = b.collaborators;
    if (typeof rawCollab === "string") {
      try { rawCollab = JSON.parse(rawCollab); } catch { rawCollab = []; }
    }
    const collabIds = [];
    for (const cid of (Array.isArray(rawCollab) ? rawCollab : [])) {
      if (isOid(String(cid || ""))) {
        const p = await Production.findById(String(cid)).lean();
        if (p) collabIds.push(p._id);
      }
    }

    // ── Media ──
    const rm = (b.media && typeof b.media === "object") ? b.media : {};
    const tid = ytId(rm.trailer?.ytId || rm.trailer?.url || "");
    const media = {
      trailer: { ytId: tid, url: rm.trailer?.url || "", thumbnailUrl: tid ? `https://img.youtube.com/vi/${tid}/hqdefault.jpg` : "" },
      songs: (Array.isArray(rm.songs) ? rm.songs : []).map(s => {
        const sid = ytId(s.ytId || s.url || "");
        return {
          title: String(s.title || ""), singer: String(s.singer || ""),
          ytId: sid, url: String(s.url || ""),
          thumbnailUrl: String(s.thumbnailUrl || (sid ? `https://img.youtube.com/vi/${sid}/hqdefault.jpg` : "")),
        };
      }),
    };

    const director = resolvedCast.find(c => c.type === "Director")?.name || String(b.director || "");
    const producer = resolvedCast.find(c => c.type === "Producer")?.name || String(b.producer || "");

    // ── Create movie ──
    // resolvedCast is a plain array of { castId: ObjectId, name, photo, type, role }
    // Mongoose will cast this correctly against CastEntrySchema
    const movie = await Movie.create({
      title,
      category: String(b.category || "Feature Film"),
      genre: Array.isArray(b.genre) ? b.genre.map(String) : [],
      releaseDate: String(b.releaseDate || ""),
      releaseTBA: !!b.releaseTBA,
      director, producer,
      budget: String(b.budget || ""),
      language: String(b.language || "Odia"),
      synopsis: String(b.synopsis || ""),
      posterUrl: String(b.posterUrl || ""),
      thumbnailUrl: String(b.thumbnailUrl || ""),
      verdict: String(b.verdict || "Upcoming"),
      status: b.verdict && b.verdict !== "Upcoming" ? "Released" : "Upcoming",
      media,
      productionId: req.prodId,
      collaborators: collabIds,
      cast: resolvedCast,
    });

    // ── Back-references ──
    for (const entry of resolvedCast) {
      await Cast.findByIdAndUpdate(entry.castId, { $addToSet: { movies: movie._id } });
    }

    const populated = await Movie.findById(movie._id)
      .populate("productionId", "name logo")
      .populate("collaborators", "name logo")
      .lean();

    console.log(`✅ Movie "${movie.title}" created with ${resolvedCast.length} cast member(s)`);
    res.status(201).json(populated);
  } catch (e) {
    console.error("❌ Create movie error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/movies/:id", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (!canEdit(movie, req.prodId)) return res.status(403).json({ error: "Forbidden" });
    const allowed = ["title", "category", "genre", "releaseDate", "releaseTBA", "director", "producer", "budget", "language", "synopsis", "posterUrl", "thumbnailUrl", "verdict", "status", "streamingOn", "streamingUrl", "ottReleaseDate"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (req.body.verdict) update.status = req.body.verdict === "Upcoming" ? "Upcoming" : "Released";
    const updated = await Movie.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("productionId", "name logo").populate("collaborators", "name logo").lean();
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/movies/:id/boxoffice", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (!canEdit(movie, req.prodId)) return res.status(403).json({ error: "Forbidden" });
    const { opening, firstWeek, total, verdict } = req.body;
    const updated = await Movie.findByIdAndUpdate(
      req.params.id,
      { boxOffice: { opening, firstWeek, total }, verdict, status: verdict === "Upcoming" ? "Upcoming" : "Released" },
      { new: true }
    ).populate("productionId", "name logo").lean();
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/movies/:id/cast", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (String(movie.productionId) !== req.prodId) return res.status(403).json({ error: "Only owner can manage cast" });

    const entry = await resolveCastEntry(req.body);
    const exists = movie.cast.some(c => String(c.castId) === String(entry.castId));
    if (exists) return res.status(400).json({ error: "This person is already in the cast list" });

    const updated = await Movie.findByIdAndUpdate(req.params.id, { $push: { cast: entry } }, { new: true })
      .populate("productionId", "name logo").populate("collaborators", "name logo").lean();
    await Cast.findByIdAndUpdate(entry.castId, { $addToSet: { movies: movie._id } });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/movies/:id/cast/:castId", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (String(movie.productionId) !== req.prodId) return res.status(403).json({ error: "Only owner can manage cast" });
    if (!isOid(req.params.castId)) return res.status(400).json({ error: "Invalid castId" });
    const updated = await Movie.findByIdAndUpdate(
      req.params.id,
      { $pull: { cast: { castId: new mongoose.Types.ObjectId(req.params.castId) } } },
      { new: true }
    ).populate("productionId", "name logo").populate("collaborators", "name logo").lean();
    const stillLinked = await Movie.exists({ "cast.castId": req.params.castId, _id: { $ne: req.params.id } });
    if (!stillLinked) await Cast.findByIdAndUpdate(req.params.castId, { $pull: { movies: movie._id } });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/movies/:id/songs", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (String(movie.productionId) !== req.prodId) return res.status(403).json({ error: "Forbidden" });
    const sid = ytId(req.body.ytId || req.body.url || "");
    const song = { title: String(req.body.title || ""), singer: String(req.body.singer || ""), ytId: sid, url: String(req.body.url || ""), thumbnailUrl: sid ? `https://img.youtube.com/vi/${sid}/hqdefault.jpg` : "" };
    const updated = await Movie.findByIdAndUpdate(req.params.id, { $push: { "media.songs": song } }, { new: true }).populate("productionId", "name logo").lean();
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/movies/:id/songs/:songIndex", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (String(movie.productionId) !== req.prodId) return res.status(403).json({ error: "Forbidden" });
    const songs = (movie.media?.songs || []).filter((_, i) => i !== parseInt(req.params.songIndex, 10));
    const updated = await Movie.findByIdAndUpdate(req.params.id, { "media.songs": songs }, { new: true }).populate("productionId", "name logo").lean();
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/movies/:id/trailer", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (String(movie.productionId) !== req.prodId) return res.status(403).json({ error: "Forbidden" });
    const tid = ytId(req.body.ytId || req.body.url || "");
    const updated = await Movie.findByIdAndUpdate(
      req.params.id,
      { "media.trailer": { ytId: tid, url: req.body.url || "", thumbnailUrl: tid ? `https://img.youtube.com/vi/${tid}/hqdefault.jpg` : "" } },
      { new: true }
    ).populate("productionId", "name logo").lean();
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/movies/:id/collaborators", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (String(movie.productionId) !== req.prodId) return res.status(403).json({ error: "Forbidden" });
    const collab = await Production.findById(req.body.productionId);
    if (!collab) return res.status(404).json({ error: "Production company not found" });
    await Movie.findByIdAndUpdate(req.params.id, { $addToSet: { collaborators: collab._id } });
    res.json({ message: `${collab.name} added as collaborator` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/movies/:id/news", auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    if (!canEdit(movie, req.prodId)) return res.status(403).json({ error: "Forbidden" });
    const item = await News.create({ ...req.body, movieId: movie._id, movieTitle: movie.title });
    await Movie.findByIdAndUpdate(req.params.id, { $push: { news: item._id } });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/news/:newsId", auth, async (req, res) => {
  try {
    const item = await News.findById(req.params.newsId);
    if (!item) return res.status(404).json({ error: "Not found" });
    const movie = await Movie.findById(item.movieId);
    if (!movie || !canEdit(movie, req.prodId)) return res.status(403).json({ error: "Forbidden" });
    const allowed = ["title", "content", "category", "imageUrl", "published"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    res.json(await News.findByIdAndUpdate(req.params.newsId, update, { new: true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/news/:newsId", auth, async (req, res) => {
  try {
    const item = await News.findById(req.params.newsId);
    if (!item) return res.status(404).json({ error: "Not found" });
    const movie = await Movie.findById(item.movieId);
    if (!movie || !canEdit(movie, req.prodId)) return res.status(403).json({ error: "Forbidden" });
    await News.findByIdAndDelete(req.params.newsId);
    await Movie.findByIdAndUpdate(item.movieId, { $pull: { news: item._id } });
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/productions/me", auth, async (req, res) => {
  try {
    const allowed = ["name", "logo", "banner", "bio", "founded", "website", "location"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const prod = await Production.findByIdAndUpdate(req.prodId, update, { new: true, select: "-password -email" });
    res.json(prod);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// SEARCH CAST BY TYPE
// ════════════════════════════════════════════════════════════════
app.get("/api/cast/search-type/:type/:q", async (req, res) => {
  try {
    const results = await Cast.find({
      type: { $regex: req.params.type, $options: "i" },
      name: { $regex: req.params.q, $options: "i" },
    }).limit(10).lean();
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// ADMIN AUTH ROUTES
// ════════════════════════════════════════════════════════════════

// Check if any admin exists
app.get("/api/admin/setup-status", async (req, res) => {
  try {
    const count = await AdminUser.countDocuments();
    res.json({ hasAdmin: count > 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin register (first-time or with existing admin token / secret)
app.post("/api/admin/register", async (req, res) => {
  try {
    const { username, email, password, adminSecret } = req.body;
    if (!username?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: "Username, email and password required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const existingCount = await AdminUser.countDocuments();
    if (existingCount > 0) {
      let ok = false;
      const token = (req.headers.authorization || "").split(" ")[1];
      if (token) { try { const d = jwt.verify(token, process.env.JWT_SECRET); if (d.isAdmin) ok = true; } catch { } }
      if (!ok && process.env.ADMIN_REGISTER_SECRET && adminSecret === process.env.ADMIN_REGISTER_SECRET) ok = true;
      if (!ok) return res.status(403).json({ error: "Admin already exists. Provide admin token or register secret." });
    }

    const exists = await AdminUser.findOne({ $or: [{ username: username.trim() }, { email: email.toLowerCase() }] });
    if (exists) return res.status(400).json({ error: "Username or email already taken" });

    const hashed = await bcrypt.hash(password, 10);
    const admin = await AdminUser.create({ username: username.trim(), email: email.toLowerCase(), password: hashed });
    const jwtToken = jwt.sign({ isAdmin: true, username: admin.username, adminId: admin._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token: jwtToken, admin: { username: admin.username, email: admin.email, _id: admin._id } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim() || !password) return res.status(400).json({ error: "Username and password required" });
    const admin = await AdminUser.findOne({ $or: [{ username: username.trim() }, { email: username.toLowerCase() }] });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ isAdmin: true, username: admin.username, adminId: admin._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, admin: { username: admin.username, email: admin.email, _id: admin._id } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin change password
app.post("/api/admin/change-password", adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
    const admin = await AdminUser.findById(req.admin.adminId);
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    if (currentPassword) {
      const ok = await bcrypt.compare(currentPassword, admin.password);
      if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
    }
    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    res.json({ message: "Password updated successfully" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// ADMIN STATS
// ════════════════════════════════════════════════════════════════
app.get("/api/admin/stats", adminAuth, async (req, res) => {
  try {
    const [movies, cast, productions, news] = await Promise.all([
      Movie.countDocuments(), Cast.countDocuments(),
      Production.countDocuments(), News.countDocuments(),
    ]);
    const recentMovies = await Movie.find().sort({ createdAt: -1 }).limit(5)
      .populate("productionId", "name").lean();
    res.json({ movies, cast, productions, news, recentMovies });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/admin/news", adminAuth, async (req, res) => {
  try {
    const items = await News.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// ADMIN — MOVIES (uses resolveCastEntry for cast, same as public)
// ════════════════════════════════════════════════════════════════

// Helper to get/create the admin production placeholder
async function getAdminProd() {
  let p = await Production.findOne({ email: "admin@ollipedia.local" }).lean();
  if (!p) {
    const h = await bcrypt.hash("adminprod123", 10);
    p = await Production.create({ name: "Ollipedia Admin", email: "admin@ollipedia.local", password: h });
  }
  return p;
}

// Helper to parse songs with new fields
function parseSongs(rawSongs) {
  if (!Array.isArray(rawSongs)) return [];
  const safeRefs = (arr) => Array.isArray(arr) ? arr.filter(id => isOid(String(id))) : [];
  return rawSongs.map(s => {
    const sid = ytId(s.ytId || s.url || "");
    return {
      title: String(s.title || ""),
      singer: String(s.singer || ""),
      singerRef: safeRefs(s.singerRef),
      musicDirector: String(s.musicDirector || ""),
      musicDirectorRef: safeRefs(s.musicDirectorRef),
      lyricist: String(s.lyricist || ""),
      lyricistRef: safeRefs(s.lyricistRef),
      ytId: sid,
      url: String(s.url || ""),
      thumbnailUrl: String(s.thumbnailUrl || (sid ? `https://img.youtube.com/vi/${sid}/hqdefault.jpg` : "")),
      lyrics: String(s.lyrics || ""),
      description: String(s.description || ""),
    };
  });
}

app.post("/api/admin/movies", adminAuth, async (req, res) => {
  try {
    const b = req.body;

    // Parse cast using the same robust resolveCastEntry helper
    let rawCast = b.cast;
    if (typeof rawCast === "string") { try { rawCast = JSON.parse(rawCast); } catch { rawCast = []; } }
    if (!Array.isArray(rawCast)) rawCast = [];

    const resolvedCast = [];
    for (let item of rawCast) {
      if (typeof item === "string") { try { item = JSON.parse(item); } catch { continue; } }
      if (!item) continue;
      const hasName = String(item.name || "").trim().length > 0;
      const hasId = isOid(String(item.castId || "").trim());
      if (!hasName && !hasId) continue;
      try { resolvedCast.push(await resolveCastEntry(item)); }
      catch (err) { console.warn("⚠️ Skipping cast entry:", item.name || item.castId, "—", err.message); }
    }

    // Parse productions — use exactly what the admin provides; only fall back
    // to the admin placeholder production when none was given, since
    // productionId is required on the Movie schema and Movie.create() always
    // runs full validation (unlike the update route below, which doesn't).
    let prods = b.productions || [];
    if (typeof prods === "string") { try { prods = JSON.parse(prods); } catch { prods = []; } }
    const validProds = Array.isArray(prods) ? prods.filter(id => isOid(String(id))).map(String) : [];
    let validProdId = validProds.length > 0 ? validProds[0] : null;
    const collabIds = validProds.slice(1);

    if (!validProdId) {
      const adminProd = await getAdminProd();
      validProdId = String(adminProd._id);
    }

    // Media
    const rm = (b.media && typeof b.media === "object") ? b.media : {};
    const tid = ytId(rm.trailer?.ytId || rm.trailer?.url || "");
    const media = {
      trailer: { ytId: tid, url: rm.trailer?.url || "", thumbnailUrl: tid ? `https://img.youtube.com/vi/${tid}/hqdefault.jpg` : "" },
      songs: parseSongs(rm.songs),
    };

    const movie = await Movie.create({
      title: String(b.title || "").trim(),
      category: String(b.category || "Feature Film"),
      genre: Array.isArray(b.genre) ? b.genre.map(String) : [],
      releaseDate: String(b.releaseDate || ""),
      releaseTBA: !!b.releaseTBA,
      director: String(b.director || ""),
      producer: String(b.producer || ""),
      budget: String(b.budget || ""),
      language: String(b.language || "Odia"),
      synopsis: String(b.synopsis || ""),
      posterUrl: String(b.posterUrl || ""),
      thumbnailUrl: String(b.thumbnailUrl || ""),
      verdict: String(b.verdict || "Upcoming"),
      status: b.verdict && b.verdict !== "Upcoming" ? "Released" : "Upcoming",
      imdbId: String(b.imdbId || ""),
      imdbRating: String(b.imdbRating || ""),
      imdbVotes: String(b.imdbVotes || ""),
      contentRating: String(b.contentRating || ""),
      runtime: String(b.runtime || ""),
      bannerUrl: String(b.bannerUrl || ""),
      boxOffice: b.boxOffice || { opening: "TBA", firstWeek: "TBA", total: "TBA" },
      streamingOn: String(b.streamingOn || ""),
      streamingUrl: String(b.streamingUrl || ""),
      ottReleaseDate: String(b.ottReleaseDate || ""),
      media,
      productionId: validProdId,
      collaborators: collabIds,
      cast: resolvedCast,
    });

    for (const entry of resolvedCast) {
      await Cast.findByIdAndUpdate(entry.castId, { $addToSet: { movies: movie._id } });
    }

    const populated = await Movie.findById(movie._id)
      .populate("productionId", "name logo")
      .populate("collaborators", "name logo").lean();

    // ── Auto-blog: Movie Details (always) + OTT Release (if OTT info given) + Song First Drops ──
    autoGenerateMovieDetailsBlog(movie).catch(() => { });
    // ★ Generate a First Drop blog for each song if songs were included at creation time
    autoGenerateAllSongBlogs(populated).catch(() => { });
    if (movie.streamingOn) {
      autoGenerateOttBlog(movie).catch(() => { });
      // Also trigger "Now Streaming" blog if OTT date has already arrived
      if (isRealDate(movie.ottReleaseDate) && Date.now() >= new Date(movie.ottReleaseDate).getTime()) {
        autoGenerateOttLiveBlog(movie).catch(() => { });
      }
    }

    res.status(201).json(populated);
  } catch (e) { console.error("Admin create movie error:", e.message); res.status(500).json({ error: e.message }); }
});

app.patch("/api/admin/movies/:id", adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    const b = req.body;
    const update = {};

    // Scalar fields
    const scalars = ["title", "category", "genre", "releaseDate", "releaseTBA", "director", "producer",
      "budget", "language", "synopsis", "posterUrl", "thumbnailUrl", "verdict", "status",
      "imdbId", "imdbRating", "imdbVotes", "contentRating", "runtime", "bannerUrl",
      "streamingOn", "streamingUrl", "ottReleaseDate"];
    scalars.forEach(k => { if (b[k] !== undefined) update[k] = b[k]; });
    if (b.verdict) update.status = b.verdict === "Upcoming" ? "Upcoming" : "Released";
    if (b.boxOffice) update.boxOffice = b.boxOffice;

    // ── Auto-blog: detect whether OTT info is newly added/changed in this edit ──
    const ottStreamingOnNew = update.streamingOn !== undefined ? update.streamingOn : movie.streamingOn;
    const ottReleaseDateNew = update.ottReleaseDate !== undefined ? update.ottReleaseDate : movie.ottReleaseDate;
    const ottChanged =
      (update.streamingOn !== undefined && update.streamingOn !== movie.streamingOn) ||
      (update.ottReleaseDate !== undefined && update.ottReleaseDate !== movie.ottReleaseDate) ||
      (update.streamingUrl !== undefined && update.streamingUrl !== movie.streamingUrl);

    // SEO FIX: previously, editing a movie's title/synopsis/cast/director/etc.
    // never refreshed the "Movie Details" blog post — so its dateModified
    // (and content) silently went stale the moment an editor corrected a
    // typo or updated the cast list post-publish. Detect content-relevant
    // field changes here and refresh the blog (only if one already exists —
    // this never creates a new blog as a side effect of an unrelated edit).
    const detailContentFields = ["title", "genre", "releaseDate", "releaseTBA", "director", "producer",
      "language", "synopsis", "posterUrl", "thumbnailUrl", "bannerUrl", "imdbRating", "imdbVotes",
      "contentRating", "runtime", "boxOffice"];
    const detailContentChanged = detailContentFields.some(k => update[k] !== undefined) ||
      b.cast !== undefined || b.media !== undefined;

    // Productions → productionId + collaborators
    // Always apply when the key is present — including clearing it (empty array)
    if (b.productions !== undefined && Array.isArray(b.productions)) {
      const validProds = b.productions.filter(id => isOid(String(id))).map(String);
      update.productionId = validProds.length > 0 ? validProds[0] : null;
      update.collaborators = validProds.slice(1);
    }

    // Cast — use resolveCastEntry (same robust helper)
    if (b.cast !== undefined) {
      let rawCast = b.cast;
      if (typeof rawCast === "string") { try { rawCast = JSON.parse(rawCast); } catch { rawCast = []; } }
      if (!Array.isArray(rawCast)) rawCast = [];
      const resolvedCast = [];
      for (let item of rawCast) {
        if (typeof item === "string") { try { item = JSON.parse(item); } catch { continue; } }
        if (!item) continue;
        const hasName = String(item.name || "").trim().length > 0;
        const hasId = isOid(String(item.castId || "").trim());
        if (!hasName && !hasId) continue;
        try { resolvedCast.push(await resolveCastEntry(item)); }
        catch (err) { console.warn("⚠️ Skipping:", item.name, "—", err.message); }
      }
      update.cast = resolvedCast;
      for (const entry of resolvedCast) {
        await Cast.findByIdAndUpdate(entry.castId, { $addToSet: { movies: movie._id } });
      }
    }

    // Media
    const songsUpdatedViaMedia = b.media?.songs !== undefined; // track for song blog trigger
    if (b.media) {
      const rm = b.media;
      if (rm.trailer !== undefined) {
        const tid = ytId(rm.trailer?.ytId || rm.trailer?.url || "");
        update["media.trailer"] = { ytId: tid, url: rm.trailer?.url || "", thumbnailUrl: tid ? `https://img.youtube.com/vi/${tid}/hqdefault.jpg` : "" };
      }
      if (rm.songs !== undefined) {
        update["media.songs"] = parseSongs(rm.songs);
      }
    }

    const updated = await Movie.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: false })
      .populate("productionId", "name logo")
      .populate("collaborators", "name logo").lean();

    // ── Auto-blog: generate song blogs only for NEWLY ADDED songs in movie edit ──
    // Compare titles that existed BEFORE the edit with those AFTER.
    // Only generate blogs for songs that are brand-new (not previously in the movie).
    // This prevents clobbering existing song blogs when unrelated fields are edited.
    if (songsUpdatedViaMedia) {
      const prevTitles = new Set(
        (movie.media?.songs || []).map(s => (s.title || "").trim().toLowerCase()).filter(Boolean)
      );
      const updatedSongs = updated.media?.songs || [];
      for (let i = 0; i < updatedSongs.length; i++) {
        const s = updatedSongs[i];
        if (!s?.title?.trim()) continue;
        const isNew = !prevTitles.has(s.title.trim().toLowerCase());
        if (isNew) {
          // New song — create blog; onlyIfNew=true as extra safety guard
          autoGenerateSongBlog(s, updated, i, true).catch(() => { });
        }
        // Existing songs: skip entirely — their blogs are not touched
      }
    }

    // ── Auto-blog: regenerate/update the OTT Release blog if OTT info changed ──
    // Triggers whenever streamingOn is present, regardless of whether date is TBA or a real date
    if (ottChanged && ottStreamingOnNew) {
      autoGenerateOttBlog(updated).catch(() => { });
    }
    // ── Auto-blog: trigger "Now Streaming" live blog if OTT date is now reached ──
    if (ottStreamingOnNew && isRealDate(ottReleaseDateNew)) {
      const releaseMs = new Date(ottReleaseDateNew).getTime();
      if (Date.now() >= releaseMs) {
        autoGenerateOttLiveBlog(updated).catch(() => { });
      }
    }
    // ── Auto-blog: refresh the Movie Details blog so dateModified + content
    // actually reflect this edit (only if a Details blog already exists) ──
    if (detailContentChanged && updated.detailBlogId) {
      autoGenerateMovieDetailsBlog(updated).catch(() => { });
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/movies/:id", adminAuth, async (req, res) => {
  try {
    await Movie.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin add cast to movie
app.post("/api/admin/movies/:id/cast", adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    const entry = await resolveCastEntry(req.body);
    await Movie.findByIdAndUpdate(req.params.id, { $push: { cast: entry } }, { new: true });
    await Cast.findByIdAndUpdate(entry.castId, { $addToSet: { movies: movie._id } });
    const updated = await Movie.findById(req.params.id).populate("productionId", "name logo").populate("collaborators", "name logo").lean();
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin remove cast from movie
app.delete("/api/admin/movies/:id/cast/:castId", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.castId)) return res.status(400).json({ error: "Invalid castId" });
    const updated = await Movie.findByIdAndUpdate(
      req.params.id,
      { $pull: { cast: { castId: new mongoose.Types.ObjectId(req.params.castId) } } },
      { new: true }
    ).populate("productionId", "name logo").populate("collaborators", "name logo").lean();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin add song
app.post("/api/admin/movies/:id/songs", adminAuth, async (req, res) => {
  try {
    const safeRefs = (arr) => Array.isArray(arr) ? arr.filter(id => isOid(String(id))) : [];
    const sid = ytId(req.body.ytId || req.body.url || "");
    const song = {
      title: String(req.body.title || ""),
      singer: String(req.body.singer || ""),
      singerRef: safeRefs(req.body.singerRef),
      musicDirector: String(req.body.musicDirector || ""),
      musicDirectorRef: safeRefs(req.body.musicDirectorRef),
      lyricist: String(req.body.lyricist || ""),
      lyricistRef: safeRefs(req.body.lyricistRef),
      ytId: sid, url: String(req.body.url || ""),
      thumbnailUrl: String(req.body.thumbnailUrl || (sid ? `https://img.youtube.com/vi/${sid}/hqdefault.jpg` : "")),
      lyrics: String(req.body.lyrics || ""),
      description: String(req.body.description || ""),
    };
    const updated = await Movie.findByIdAndUpdate(req.params.id, { $push: { "media.songs": song } }, { new: true })
      .populate("productionId", "name logo").lean();
    if (!updated) return res.status(404).json({ error: "Not found" });
    // ★ Auto-generate a song blog for the newly added song.
    // The new song is always pushed to the end, so its index is length - 1.
    const newSongIndex = (updated.media?.songs?.length || 1) - 1;
    autoGenerateSongBlog(song, updated, newSongIndex, false).catch(() => { });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin update song by index
app.patch("/api/admin/movies/:id/songs/:songIndex", adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    const idx = parseInt(req.params.songIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= (movie.media?.songs?.length || 0))
      return res.status(400).json({ error: "Invalid song index" });
    const safeRefs = (arr) => Array.isArray(arr) ? arr.filter(id => isOid(String(id))) : [];
    const existing = movie.media.songs[idx];
    const s = req.body;
    const sid = ytId(s.ytId || s.url || existing.ytId || "");
    const updatedSong = {
      title: s.title !== undefined ? String(s.title) : existing.title,
      singer: s.singer !== undefined ? String(s.singer) : existing.singer,
      singerRef: s.singerRef !== undefined ? safeRefs(s.singerRef) : (existing.singerRef || []),
      musicDirector: s.musicDirector !== undefined ? String(s.musicDirector) : existing.musicDirector,
      musicDirectorRef: s.musicDirectorRef !== undefined ? safeRefs(s.musicDirectorRef) : (existing.musicDirectorRef || []),
      lyricist: s.lyricist !== undefined ? String(s.lyricist) : existing.lyricist,
      lyricistRef: s.lyricistRef !== undefined ? safeRefs(s.lyricistRef) : (existing.lyricistRef || []),
      ytId: sid, url: String(s.url || existing.url || ""),
      thumbnailUrl: String(s.thumbnailUrl || existing.thumbnailUrl || (sid ? `https://img.youtube.com/vi/${sid}/hqdefault.jpg` : "")),
      lyrics: s.lyrics !== undefined ? String(s.lyrics) : (existing.lyrics || ""),
      description: s.description !== undefined ? String(s.description) : (existing.description || ""),
    };
    const setKey = `media.songs.${idx}`;
    const updated = await Movie.findByIdAndUpdate(req.params.id, { $set: { [setKey]: updatedSong } }, { new: true })
      .populate("productionId", "name logo").lean();
    // ★ Regenerate the song blog when song data changes (singer, ytId, lyrics etc.)
    // idx is the 0-based position of the edited song — determines its drop name.
    // onlyIfNew=false so we always refresh when song data is explicitly edited.
    autoGenerateSongBlog(updatedSong, updated, idx, false).catch(() => { });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin delete song
app.delete("/api/admin/movies/:id/songs/:songIndex", adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    const idx = parseInt(req.params.songIndex, 10);
    const songs = (movie.media?.songs || []).filter((_, i) => i !== idx);
    const updated = await Movie.findByIdAndUpdate(req.params.id, { "media.songs": songs }, { new: true })
      .populate("productionId", "name logo").lean();
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin add news to movie
app.post("/api/admin/movies/:id/news", adminAuth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Not found" });
    const item = await News.create({ ...req.body, movieId: movie._id, movieTitle: movie.title });
    await Movie.findByIdAndUpdate(req.params.id, { $push: { news: item._id } });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// ADMIN — CAST
// ════════════════════════════════════════════════════════════════
app.post("/api/admin/cast", adminAuth, async (req, res) => {
  try {
    const { name, type, bio, photo, dob, gender, location, website, instagram, banner, roles } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    // Derive roles array: prefer explicit roles[], fallback to splitting type string
    const rolesArr = Array.isArray(roles) && roles.length
      ? roles
      : (type ? type.split(",").map(r => r.trim()).filter(Boolean) : ["Actor"]);
    const primaryType = rolesArr[0] || "Actor";
    const c = await Cast.create({
      name: name.trim(), type: primaryType,
      roles: rolesArr,
      bio: bio || "", photo: photo || "", banner: banner || "",
      dob: dob || "", gender: gender || "", location: location || "",
      website: website || "", instagram: instagram || "",
    });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/admin/cast/:id", adminAuth, async (req, res) => {
  try {
    const allowed = ["name", "bio", "photo", "dob", "gender", "location", "website", "instagram", "banner"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    // Handle type / roles
    if (req.body.type !== undefined || req.body.roles !== undefined) {
      const rolesArr = Array.isArray(req.body.roles) && req.body.roles.length
        ? req.body.roles
        : (req.body.type ? req.body.type.split(",").map(r => r.trim()).filter(Boolean) : undefined);
      if (rolesArr && rolesArr.length) {
        update.roles = rolesArr;
        update.type = rolesArr[0]; // keep primary type in sync
      }
    }
    const c = await Cast.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/cast/:id", adminAuth, async (req, res) => {
  try {
    await Cast.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// ADMIN — PRODUCTIONS
// ════════════════════════════════════════════════════════════════
app.post("/api/admin/productions", adminAuth, async (req, res) => {
  try {
    const { name, logo, bio, founded, website, location } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const hashed = await bcrypt.hash("changeme123", 10);
    const p = await Production.create({ name: name.trim(), email: `${Date.now()}@admin.local`, password: hashed, logo: logo || "", bio: bio || "", founded: founded || "", website: website || "", location: location || "" });
    const obj = p.toObject(); delete obj.password; delete obj.email;
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/admin/productions/:id", adminAuth, async (req, res) => {
  try {
    const allowed = ["name", "logo", "banner", "bio", "founded", "website", "location"];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const p = await Production.findByIdAndUpdate(req.params.id, update, { new: true, select: "-password -email" });
    if (!p) return res.status(404).json({ error: "Not found" });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/productions/:id", adminAuth, async (req, res) => {
  try {
    await Production.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// ADMIN — NEWS
// ════════════════════════════════════════════════════════════════
app.post("/api/admin/news", adminAuth, async (req, res) => {
  try {
    const item = await News.create(req.body);
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/admin/news/:id", adminAuth, async (req, res) => {
  try {
    const item = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/news/:id", adminAuth, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ════════════════════════════════════════════════════════════════
// BLOG / ARTICLE ROUTES
// ════════════════════════════════════════════════════════════════

// GET /api/blog — list published posts (paginated)
app.get("/api/blog", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "12", 10);
    const cat = req.query.category || "";
    const tag = req.query.tag || "";
    const featured = req.query.featured === "true";
    const q = req.query.q || "";

    const filter = { published: true };
    if (cat) filter.category = cat;
    if (tag) filter.tags = tag;
    if (featured) filter.featured = true;
    if (q) filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { content: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
    ];

    const total = await Blog.countDocuments(filter);
    const posts = await Blog.find(filter, "title slug excerpt category tags coverImage movieTitle author views readTime featured createdAt seoTitle seoDesc")
      .sort({ featured: -1, createdAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean();
    res.json({ posts, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/blog/:slug — single post (no view increment here — use POST /:slug/view)
app.get("/api/blog/:slug", async (req, res) => {
  try {
    const post = await Blog.findOne({ slug: req.params.slug, published: true }).lean();
    if (!post) return res.status(404).json({ error: "Not found" });
    res.json(post);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/blog/:slug/view — increment view count (prod only, session-deduped on frontend)
app.post("/api/blog/:slug/view", async (req, res) => {
  try {
    const post = await Blog.findOneAndUpdate(
      { slug: req.params.slug, published: true },
      { $inc: { views: 1 } },
      { new: true, select: "views" }
    ).lean();
    if (!post) return res.status(404).json({ error: "Not found" });
    res.json({ views: post.views });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Blog Routes ─────────────────────────────────────────────
// GET /api/admin/blog
app.get("/api/admin/blog", adminAuth, async (req, res) => {
  try {
    const posts = await Blog.find().sort({ createdAt: -1 }).lean();
    res.json(posts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/blog
app.post("/api/admin/blog", adminAuth, async (req, res) => {
  try {
    const { title, excerpt, content, category, tags, coverImage, movieId, movieTitle, castId, castName, author, published, featured, seoTitle, seoDesc, youtubeVideoId } = req.body;
    if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: "Title and content required" });
    const slug = req.body.slug?.trim()
      ? req.body.slug.trim()
      : title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()
      + "-" + Date.now().toString(36);
    const readTime = Math.max(1, Math.ceil((content || "").split(/\s+/).length / 200));
    const post = await Blog.create({
      title: title.trim(), slug, excerpt: excerpt || "", content: content.trim(),
      category: category || "General", tags: Array.isArray(tags) ? tags : (tags || "").split(",").map(t => t.trim()).filter(Boolean),
      coverImage: coverImage || "", movieId: movieId || undefined, movieTitle: movieTitle || "",
      castId: isOid(castId) ? castId : undefined, castName: castName || "",
      author: author || "Ollypedia Team", published: !!published, featured: !!featured, readTime,
      seoTitle: seoTitle || title, seoDesc: seoDesc || excerpt || "",
      youtubeVideoId: youtubeVideoId?.trim() || "",
    });
    res.status(201).json(post);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/blog/:id
app.patch("/api/admin/blog/:id", adminAuth, async (req, res) => {
  try {
    const allowed = ["title", "excerpt", "content", "category", "tags", "coverImage", "movieId", "movieTitle", "castId", "castName", "author", "published", "featured", "seoTitle", "seoDesc", "youtubeVideoId"];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    // Validate ObjectId fields — reject invalid strings to prevent Mongoose cast errors
    if (update.castId !== undefined && !isOid(update.castId)) update.castId = null;
    if (update.movieId !== undefined && !isOid(update.movieId)) update.movieId = null;
    if (update.content) update.readTime = Math.max(1, Math.ceil(update.content.split(/\s+/).length / 200));
    if (update.tags && !Array.isArray(update.tags)) update.tags = update.tags.split(",").map(t => t.trim()).filter(Boolean);
    const post = await Blog.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!post) return res.status(404).json({ error: "Not found" });
    res.json(post);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/blog/:id
app.delete("/api/admin/blog/:id", adminAuth, async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Blog Reviews ──────────────────────────────────────────────────
// POST /api/blog/:id/reviews
app.post("/api/blog/:id/reviews", async (req, res) => {
  try {
    const { user, text, rating } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "Review text required" });
    const post = await Blog.findByIdAndUpdate(
      req.params.id,
      { $push: { reviews: { user: user || "Anonymous", text: text.trim(), rating: Number(rating) || 5, date: new Date().toISOString().split("T")[0], likes: 0, replies: [] } } },
      { new: true }
    ).lean();
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json(post.reviews);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/blog/:id/reviews/:idx/like
app.post("/api/blog/:id/reviews/:idx/like", async (req, res) => {
  try {
    const post = await Blog.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const idx = parseInt(req.params.idx, 10);
    if (!post.reviews[idx]) return res.status(404).json({ error: "Review not found" });
    post.reviews[idx].likes = (post.reviews[idx].likes || 0) + 1;
    await post.save();
    res.json({ likes: post.reviews[idx].likes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/blog/:id/reviews/:idx/reply
app.post("/api/blog/:id/reviews/:idx/reply", async (req, res) => {
  try {
    const { user, text, date } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "Reply text required" });
    const post = await Blog.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const idx = parseInt(req.params.idx, 10);
    if (!post.reviews[idx]) return res.status(404).json({ error: "Review not found" });
    post.reviews[idx].replies.push({ user: user || "Anonymous", text: text.trim(), date: date || new Date().toISOString().split("T")[0] });
    await post.save();
    res.json(post.reviews[idx].replies);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Review Likes & Replies ────────────────────────────────────────
// POST /api/movies/:id/reviews/:reviewIdx/like
app.post("/api/movies/:id/reviews/:reviewIdx/like", async (req, res) => {
  try {
    const query = isOid(req.params.id) ? { _id: req.params.id } : { slug: req.params.id };
    const idx = parseInt(req.params.reviewIdx, 10);
    const movie = await Movie.findOne(query);
    if (!movie || !movie.reviews[idx]) return res.status(404).json({ error: "Not found" });
    movie.reviews[idx].likes = (movie.reviews[idx].likes || 0) + 1;
    await movie.save();
    res.json({ likes: movie.reviews[idx].likes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/movies/:id/reviews/:reviewIdx/reply
app.post("/api/movies/:id/reviews/:reviewIdx/reply", async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "Text required" });
    const query = isOid(req.params.id) ? { _id: req.params.id } : { slug: req.params.id };
    const idx = parseInt(req.params.reviewIdx, 10);
    const movie = await Movie.findOne(query);
    if (!movie || !movie.reviews[idx]) return res.status(404).json({ error: "Not found" });
    const reply = { user: user?.trim() || "Anonymous", text: text.trim(), date: new Date().toISOString().split("T")[0] };
    if (!movie.reviews[idx].replies) movie.reviews[idx].replies = [];
    movie.reviews[idx].replies.push(reply);
    await movie.save();
    res.json(movie.reviews[idx].replies);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// CONTACT / ENQUIRY ROUTES
// ════════════════════════════════════════════════════════════════

// Public — anyone can submit the contact form
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name?.trim() || !email?.trim() || !message?.trim())
      return res.status(400).json({ error: "Name, email and message are required." });
    const item = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject || "General Inquiry",
      message: message.trim(),
    });
    res.json({ success: true, _id: item._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — get all enquiries newest first
app.get("/api/admin/enquiries", adminAuth, async (req, res) => {
  try {
    const items = await Contact.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — unread count (must be before /:id route to avoid conflict)
app.get("/api/admin/enquiries/unread-count", adminAuth, async (req, res) => {
  try {
    const count = await Contact.countDocuments({ read: false });
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — mark as read
app.patch("/api/admin/enquiries/:id/read", adminAuth, async (req, res) => {
  try {
    const item = await Contact.findByIdAndUpdate(
      req.params.id, { read: true }, { new: true }
    );
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — delete enquiry
app.delete("/api/admin/enquiries/:id", adminAuth, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═════════════════════════════════════════════════════════════════
// ADMIN — One-time slug backfill for existing movies
// POST /api/admin/backfill-slugs  (admin token required)
// Safe to call multiple times — only fills empty slugs
// ═════════════════════════════════════════════════════════════════
app.post("/api/admin/backfill-slugs", adminAuth, async (req, res) => {
  try {
    const movies = await Movie.find({}).lean();
    let updated = 0, skipped = 0;
    for (const m of movies) {
      if (m.slug && !/-[a-f0-9]{24}$/i.test(m.slug)) { skipped++; continue; }
      const base = makeMovieSlug(m.title, m.releaseDate);
      let slug = base, attempt = 0;
      while (true) {
        const conflict = await Movie.findOne({ slug, _id: { $ne: m._id } }).lean();
        if (!conflict) break;
        slug = `${base}-${++attempt}`;
      }
      await Movie.updateOne({ _id: m._id }, { $set: { slug } });
      updated++;
    }
    res.json({ ok: true, updated, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════
// SEO — robots.txt
// ═════════════════════════════════════════════════════════════════
// (SITE_URL is declared near the top of the file, in the HELPERS section,
// so it's available to the blog-HTML builders as well.)

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    `User-agent: *
Allow: /
Disallow: /admin
Disallow: /portal
Disallow: /api/
Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}/sitemap-movies.xml
Sitemap: ${SITE_URL}/sitemap-cast.xml
Sitemap: ${SITE_URL}/sitemap-blogs.xml
Sitemap: ${SITE_URL}/sitemap-boxoffice.xml`
  );
});

// ─── helpers ───────────────────────────────────────────────────
function xmlEsc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function urlEntry(loc, lastmod, freq = "monthly", pri = "0.7") {
  return `  <url>\n    <loc>${xmlEsc(loc)}</loc>\n    <lastmod>${lastmod || new Date().toISOString().slice(0, 10)}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
}

// ─── Main sitemap (static pages + recent news) ─────────────────
app.get("/sitemap.xml", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const statics = [
    ["", "daily", "1.0"], ["/movies", "daily", "0.9"], ["/cast", "weekly", "0.8"],
    ["/songs", "weekly", "0.8"], ["/news", "daily", "0.8"],
    ["/about", "monthly", "0.4"], ["/contact", "monthly", "0.4"], ["/privacy", "monthly", "0.3"],
  ];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  statics.forEach(([p, f, pr]) => { xml += urlEntry(`${SITE_URL}${p}`, today, f, pr) + "\n"; });
  try {
    const recentNews = await News.find({ published: true }).sort({ createdAt: -1 }).limit(50).lean();
    recentNews.forEach(n => {
      xml += urlEntry(`${SITE_URL}/news/${n._id}`, n.updatedAt ? new Date(n.updatedAt).toISOString().slice(0, 10) : today, "weekly", "0.6") + "\n";
    });
  } catch { }
  res.type("application/xml").send(xml + "</urlset>");
});

// ─── Movies sitemap (slug-based URLs) ──────────────────────────
app.get("/sitemap-movies.xml", async (req, res) => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  try {
    const movies = await Movie.find({}, "title releaseDate slug updatedAt").lean();
    movies.forEach(m => {
      const slug = m.slug || makeMovieSlug(m.title, m.releaseDate);
      const lastmod = m.updatedAt ? new Date(m.updatedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      xml += urlEntry(`${SITE_URL}/movie/${slug}`, lastmod, "weekly", "0.8") + "\n";
    });
  } catch { }
  res.type("application/xml").send(xml + "</urlset>");
});

// ─── Cast sitemap ───────────────────────────────────────────────
app.get("/sitemap-cast.xml", async (req, res) => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  try {
    const cast = await Cast.find({}, "name type updatedAt").lean();
    cast.forEach(c => {
      const slug = String(c.name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").trim();
      const role = String(c.type || "artist").toLowerCase().replace(/\s+/g, "-");
      const lastmod = c.updatedAt ? new Date(c.updatedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      xml += urlEntry(`${SITE_URL}/cast/${c._id}/${slug}-odia-${role}`, lastmod, "monthly", "0.7") + "\n";
    });
  } catch { }
  res.type("application/xml").send(xml + "</urlset>");
});

// ─── Blogs sitemap ──────────────────────────────────────────────
// SEO FIX: this sitemap didn't exist before — every auto-generated blog
// post (Movie Details / OTT Release / Now Streaming) was reachable only by
// crawl discovery via internal links, with no sitemap entry point. Only
// published posts are listed, and lastmod uses the real updatedAt so
// crawlers can prioritize freshly-edited posts.
app.get("/sitemap-blogs.xml", async (req, res) => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  try {
    const blogs = await Blog.find({ published: true }, "slug updatedAt createdAt").lean();
    blogs.forEach(b => {
      if (!b.slug) return;
      const lastmod = b.updatedAt ? new Date(b.updatedAt).toISOString().slice(0, 10) : (b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
      xml += urlEntry(`${SITE_URL}/blog/${b.slug}`, lastmod, "weekly", "0.75") + "\n";
    });
  } catch { }
  res.type("application/xml").send(xml + "</urlset>");
});


// ── Admin — POST /api/admin/upload-blog-image ─────────────────────────────────
// Accepts a multipart/form-data upload with field name "image".
// Returns { url } — a public URL the frontend inserts into the article HTML.
app.post("/api/admin/upload-blog-image", adminAuth, blogImageUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file received" });
  const SITE_URL_LOCAL = process.env.SITE_URL || `http://localhost:${process.env.PORT || 4000}`;
  const url = `${SITE_URL_LOCAL}/blog-uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

// ── AI Article Generator (uses server-side fetch → no CORS) ─────────────────
// ── AI Article Generator — powered by Groq (free, ~2-3s per article) ────────
// Sign up free at https://console.groq.com → API Keys → Create Key
// Add to .env:  GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
app.post("/api/admin/generate-article", adminAuth, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt required" });

  const groqKey = process.env.GROQ_API_KEY || "";
  if (!groqKey) {
    return res.status(500).json({
      error: "GROQ_API_KEY not set in .env. Get a free key at https://console.groq.com",
    });
  }

  // Model options (all free on Groq):
  //   llama-3.1-8b-instant  — fastest, great quality  ← default
  //   llama3-70b-8192       — slower but highest quality
  //   gemma2-9b-it          — good alternative
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are an expert Odia cinema journalist writing for Ollypedia. When asked to return JSON, you MUST return ONLY a valid JSON object with no extra text, no markdown, no code fences. All string values must be plain text — no HTML tags, no bullet points.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.7,
        top_p: 0.9,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `Groq API error (${response.status})`;

      // Friendly messages for common Groq errors
      if (response.status === 401) {
        return res.status(500).json({ error: "Invalid GROQ_API_KEY. Check your key at console.groq.com" });
      }
      if (response.status === 429) {
        return res.status(500).json({ error: "Groq rate limit hit. Wait a few seconds and try again." });
      }
      return res.status(500).json({ error: errMsg });
    }

    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) return res.status(500).json({ error: "Groq returned an empty response. Try again." });

    res.json({ text });

  } catch (err) {
    res.status(500).json({ error: "Generation failed: " + err.message });
  }
});

// ── PUBLIC — GET /api/movies/:id/boxoffice-days ──────────────────────────────
app.get("/api/movies/:id/boxoffice-days", async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const movie = await Movie.findById(req.params.id, "boxOfficeDays title slug verdict").lean();
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    const days = (movie.boxOfficeDays || []).slice().sort((a, b) => a.day - b.day);
    res.json(days);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — POST /api/admin/movies/:id/boxoffice-days
// Add a new day entry (prevents duplicate day numbers)
// ═══════════════════════════════════════════════════════════════════════════
app.post("/api/admin/movies/:id/boxoffice-days", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const { day, net, gross, date, note } = req.body;

    if (!day || isNaN(parseInt(day, 10))) return res.status(400).json({ error: "day is required (integer)" });
    const dayNum = parseInt(day, 10);

    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    // Prevent duplicate
    const exists = (movie.boxOfficeDays || []).some((d) => d.day === dayNum);
    if (exists) return res.status(409).json({ error: `Day ${dayNum} already exists. Use PATCH to update.` });

    // Normalize net/gross — parse whatever the frontend sends ("7", "7L", "₹7.00 L", "700000")
    // and re-format as a clean "₹X.XX L / Cr" string before storing.
    const netNum = parseToRupeesGlobal(net || "0");
    const grossNum = parseToRupeesGlobal(gross || "0");
    const netStored = netNum > 0 ? formatINRGlobal(netNum) : (net || "");
    const grossStored = grossNum > 0 ? formatINRGlobal(grossNum) : (gross || "");

    movie.boxOfficeDays.push({ day: dayNum, net: netStored, gross: grossStored, date: date || "", note: note || "" });
    movie.boxOfficeDays.sort((a, b) => a.day - b.day);

    // Auto-update boxOffice summary totals
    const totalNet = movie.boxOfficeDays.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
    if (totalNet > 0) {
      movie.boxOffice = movie.boxOffice || {};
      movie.boxOffice.total = formatINRGlobal(totalNet);
    }

    await movie.save({ validateBeforeSave: false });
    res.status(201).json({ success: true, days: movie.boxOfficeDays });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — PATCH /api/admin/movies/:id/boxoffice-days/:day
// Update an existing day entry
// ═══════════════════════════════════════════════════════════════════════════
app.patch("/api/admin/movies/:id/boxoffice-days/:day", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const dayNum = parseInt(req.params.day, 10);
    if (isNaN(dayNum)) return res.status(400).json({ error: "Invalid day number" });

    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    const idx = (movie.boxOfficeDays || []).findIndex((d) => d.day === dayNum);
    if (idx === -1) return res.status(404).json({ error: `Day ${dayNum} not found` });

    const { net, gross, date, note } = req.body;
    if (net !== undefined) {
      const n = parseToRupeesGlobal(net);
      movie.boxOfficeDays[idx].net = n > 0 ? formatINRGlobal(n) : net;
    }
    if (gross !== undefined) {
      const g = parseToRupeesGlobal(gross);
      movie.boxOfficeDays[idx].gross = g > 0 ? formatINRGlobal(g) : gross;
    }
    if (date !== undefined) movie.boxOfficeDays[idx].date = date;
    if (note !== undefined) movie.boxOfficeDays[idx].note = note;

    // Re-sync total
    const totalNetPatch = movie.boxOfficeDays.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
    if (totalNetPatch > 0) {
      movie.boxOffice = movie.boxOffice || {};
      movie.boxOffice.total = formatINRGlobal(totalNetPatch);
    }

    await movie.save({ validateBeforeSave: false });
    res.json({ success: true, days: movie.boxOfficeDays });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — DELETE /api/admin/movies/:id/boxoffice-days/:day
// Remove a day entry
// ═══════════════════════════════════════════════════════════════════════════
app.delete("/api/admin/movies/:id/boxoffice-days/:day", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const dayNum = parseInt(req.params.day, 10);
    if (isNaN(dayNum)) return res.status(400).json({ error: "Invalid day number" });

    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    const before = (movie.boxOfficeDays || []).length;
    movie.boxOfficeDays = (movie.boxOfficeDays || []).filter((d) => d.day !== dayNum);
    if (movie.boxOfficeDays.length === before) {
      return res.status(404).json({ error: `Day ${dayNum} not found` });
    }

    await movie.save({ validateBeforeSave: false });
    res.json({ success: true, days: movie.boxOfficeDays });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — POST /api/admin/movies/:id/boxoffice-days/bulk
// Bulk add/update day entries in one shot — powers the "Bulk Upload"
// feature in BoxOfficePanel.jsx (CSV template upload + paste-data mode).
//
// Body: { days: [ { day: 1, net: "1500000" }, { day: 2, net: "22L" }, ... ] }
//   - "net" accepts the same formats as the single-day routes ("1500000",
//     "15L", "1.2 Cr", "₹15,00,000" etc.) via parseToRupeesGlobal.
//   - "date" is ALWAYS auto-calculated server-side from the movie's
//     releaseDate + (day - 1), regardless of what (if anything) the client
//     sends — this is what makes "Day 1 = release date, Day 2 = release
//     date + 1, …" work automatically.
//   - "gross" is ALWAYS auto-calculated as net × 1.18 (GST_RATE_GLOBAL).
//   - Existing day numbers are overwritten (upsert); new day numbers are
//     appended. Rows with no usable net value are skipped, not errored.
// ═══════════════════════════════════════════════════════════════════════════
app.post("/api/admin/movies/:id/boxoffice-days/bulk", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });

    const { days } = req.body;
    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: "days array is required" });
    }

    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    movie.boxOfficeDays = movie.boxOfficeDays || [];

    let added = 0, updated = 0;
    const skipped = [];

    for (const entry of days) {
      const dayNum = parseInt(entry?.day, 10);
      if (!dayNum || dayNum < 1) { skipped.push(entry?.day ?? "?"); continue; }

      const netNum = parseToRupeesGlobal(entry?.net || "0");
      if (netNum <= 0) { skipped.push(dayNum); continue; } // blank/unreadable row — skip silently

      const grossNum = Math.round(netNum * GST_RATE_GLOBAL);
      const netStored = formatINRGlobal(netNum);
      const grossStored = formatINRGlobal(grossNum);
      const dateStored = addDaysToISO(movie.releaseDate, dayNum); // always derived from releaseDate

      const idx = movie.boxOfficeDays.findIndex((d) => d.day === dayNum);
      if (idx === -1) {
        movie.boxOfficeDays.push({
          day: dayNum, net: netStored, gross: grossStored,
          date: dateStored, note: entry?.note || "",
        });
        added++;
      } else {
        movie.boxOfficeDays[idx].net = netStored;
        movie.boxOfficeDays[idx].gross = grossStored;
        movie.boxOfficeDays[idx].date = dateStored;
        if (entry?.note !== undefined) movie.boxOfficeDays[idx].note = entry.note;
        updated++;
      }
    }

    movie.boxOfficeDays.sort((a, b) => a.day - b.day);

    // Re-sync the boxOffice.total summary from the full day-wise net figures
    const totalNet = movie.boxOfficeDays.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
    if (totalNet > 0) {
      movie.boxOffice = movie.boxOffice || {};
      movie.boxOffice.total = formatINRGlobal(totalNet);
    }

    await movie.save({ validateBeforeSave: false });
    res.json({ success: true, added, updated, skipped, days: movie.boxOfficeDays });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — GET /api/admin/boxoffice/all-movies
// Returns movies that have at least one boxOfficeDays entry (already existed
// in the original server.js but included here for completeness)
// ═══════════════════════════════════════════════════════════════════════════
// NOTE: if this route already exists in your server.js, skip adding it again.
app.get("/api/admin/boxoffice/all-movies", adminAuth, async (req, res) => {
  try {
    const movies = await Movie
      .find({ "boxOfficeDays.0": { $exists: true } },
        "title slug posterUrl thumbnailUrl releaseDate language verdict boxOffice boxOfficeDays budget")
      .sort({ updatedAt: -1 })
      .lean();
    res.json(movies);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SITEMAP EXTENSION
// Add this block inside your existing sitemap-movies.xml route so box office
// pages are indexed. OR add a separate /sitemap-boxoffice.xml as shown below.
// ─────────────────────────────────────────────────────────────────────────────

app.get("/sitemap-boxoffice.xml", async (req, res) => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  try {
    const movies = await Movie
      .find({ "boxOfficeDays.0": { $exists: true } }, "title slug releaseDate updatedAt")
      .lean();
    const SITE_URL_LOCAL = process.env.SITE_URL || "https://www.ollypedia.in";
    movies.forEach((m) => {
      const slug = m.slug || (String(m.title || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
      const lastmod = m.updatedAt ? new Date(m.updatedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      xml += `  <url>\n    <loc>${SITE_URL_LOCAL}/box-office/${slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.85</priority>\n  </url>\n`;
    });
  } catch { }
  res.type("application/xml").send(xml + "</urlset>");
});
// ────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// MERGE ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/admin/merge/cast/preview ──────────────────────────────────────
// Returns a preview of what will change before the actual merge.
app.post("/api/admin/merge/cast/preview", adminAuth, async (req, res) => {
  try {
    const { primaryId, duplicateIds } = req.body;

    if (!isOid(primaryId)) return res.status(400).json({ error: "Invalid primaryId" });
    if (!Array.isArray(duplicateIds) || duplicateIds.length === 0)
      return res.status(400).json({ error: "duplicateIds must be a non-empty array" });
    if (duplicateIds.some(id => !isOid(id)))
      return res.status(400).json({ error: "One or more duplicateIds are invalid" });

    const primary = await Cast.findById(primaryId).lean();
    if (!primary) return res.status(404).json({ error: "Primary cast member not found" });

    const duplicates = await Cast.find({ _id: { $in: duplicateIds } }).lean();
    if (duplicates.length === 0) return res.status(404).json({ error: "No duplicates found" });

    // Movies that reference any of the duplicates in their cast array
    const affectedMovies = await Movie.find(
      { "cast.castId": { $in: duplicateIds } },
      "title slug cast"
    ).lean();

    res.json({
      primary: { _id: primary._id, name: primary.name, type: primary.type, photo: primary.photo },
      duplicates: duplicates.map(d => ({ _id: d._id, name: d.name, type: d.type })),
      moviesAffected: affectedMovies.length,
      movieList: affectedMovies.map(m => ({
        _id: m._id,
        title: m.title,
        slug: m.slug,
        castEntriesReplaced: m.cast.filter(c => duplicateIds.includes(String(c.castId))).length,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/merge/cast ───────────────────────────────────────────────
// Merges duplicate cast members into the primary:
//  1. In every Movie.cast[], replace duplicate castId references with primaryId
//  2. Merge the movies[] back-reference array on the primary Cast doc
//  3. Delete the duplicate Cast docs
app.post("/api/admin/merge/cast", adminAuth, async (req, res) => {
  try {
    const { primaryId, duplicateIds } = req.body;

    if (!isOid(primaryId)) return res.status(400).json({ error: "Invalid primaryId" });
    if (!Array.isArray(duplicateIds) || duplicateIds.length === 0)
      return res.status(400).json({ error: "duplicateIds must be a non-empty array" });
    if (duplicateIds.some(id => !isOid(id)))
      return res.status(400).json({ error: "One or more duplicateIds are invalid" });
    if (duplicateIds.includes(primaryId))
      return res.status(400).json({ error: "primaryId cannot also be a duplicateId" });

    const primary = await Cast.findById(primaryId);
    if (!primary) return res.status(404).json({ error: "Primary cast member not found" });

    const dupObjectIds = duplicateIds.map(id => new mongoose.Types.ObjectId(id));
    const primaryOid = new mongoose.Types.ObjectId(primaryId);

    // 1. Find all movies that reference any duplicate
    const affectedMovies = await Movie.find({ "cast.castId": { $in: dupObjectIds } });

    let moviesUpdated = 0;
    for (const movie of affectedMovies) {
      let changed = false;
      // Replace duplicate castId entries with primaryId; remove exact duplicates of primary
      const seen = new Set();
      const newCast = [];
      for (const entry of movie.cast) {
        const idStr = String(entry.castId);
        const isPrimary = idStr === primaryId;
        const isDuplicate = duplicateIds.includes(idStr);

        if (isPrimary) {
          if (!seen.has(primaryId)) { newCast.push(entry); seen.add(primaryId); }
          // else skip — already have the primary entry
        } else if (isDuplicate) {
          if (!seen.has(primaryId)) {
            // Replace this duplicate entry with primary's data but keep role
            newCast.push({
              castId: primaryOid,
              name: primary.name,
              photo: primary.photo || entry.photo || "",
              type: primary.type || entry.type || "Actor",
              role: entry.role || "",
            });
            seen.add(primaryId);
            changed = true;
          } else {
            // Primary already added — just drop this duplicate entry
            changed = true;
          }
        } else {
          newCast.push(entry);
        }
      }

      if (changed) {
        movie.cast = newCast;
        await movie.save({ validateBeforeSave: false });
        moviesUpdated++;
      }
    }

    // Also fix Song refs (singerRef, musicDirectorRef, lyricistRef) inside movies
    const songMovies = await Movie.find({
      $or: [
        { "media.songs.singerRef": { $in: dupObjectIds } },
        { "media.songs.musicDirectorRef": { $in: dupObjectIds } },
        { "media.songs.lyricistRef": { $in: dupObjectIds } },
      ]
    });
    for (const movie of songMovies) {
      let changed = false;
      for (const song of (movie.media?.songs || [])) {
        const replaceRefs = (arr) => {
          if (!arr || !arr.length) return arr;
          let didChange = false;
          const next = arr.map(ref => {
            if (duplicateIds.includes(String(ref))) { didChange = true; return primaryOid; }
            return ref;
          });
          if (didChange) changed = true;
          // de-dup
          return [...new Set(next.map(String))].map(s => new mongoose.Types.ObjectId(s));
        };
        song.singerRef = replaceRefs(song.singerRef);
        song.musicDirectorRef = replaceRefs(song.musicDirectorRef);
        song.lyricistRef = replaceRefs(song.lyricistRef);
      }
      if (changed) await movie.save({ validateBeforeSave: false });
    }

    // 2. Collect all movie back-references from duplicates and merge into primary
    const dupDocs = await Cast.find({ _id: { $in: dupObjectIds } }).lean();
    const allMovieRefs = dupDocs.flatMap(d => (d.movies || []).map(String));
    const existingRefs = (primary.movies || []).map(String);
    const mergedRefs = [...new Set([...existingRefs, ...allMovieRefs])];
    primary.movies = mergedRefs.map(id => new mongoose.Types.ObjectId(id));
    await primary.save({ validateBeforeSave: false });

    // 3. Delete duplicates
    const deleteResult = await Cast.deleteMany({ _id: { $in: dupObjectIds } });

    res.json({
      success: true,
      moviesUpdated,
      deleted: deleteResult.deletedCount,
      primaryId,
      duplicateIds,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/merge/movie ──────────────────────────────────────────────
// Merges duplicate movie entries into a primary movie:
//  1. Re-points all News docs that reference duplicates → primary
//  2. Merges cast, songs arrays (union, no exact duplicates)
//  3. Deletes duplicate Movie docs
app.post("/api/admin/merge/movie", adminAuth, async (req, res) => {
  try {
    const { primaryId, duplicateIds } = req.body;

    if (!isOid(primaryId)) return res.status(400).json({ error: "Invalid primaryId" });
    if (!Array.isArray(duplicateIds) || duplicateIds.length === 0)
      return res.status(400).json({ error: "duplicateIds must be a non-empty array" });
    if (duplicateIds.some(id => !isOid(id)))
      return res.status(400).json({ error: "One or more duplicateIds are invalid" });
    if (duplicateIds.includes(primaryId))
      return res.status(400).json({ error: "primaryId cannot also be a duplicateId" });

    const primary = await Movie.findById(primaryId);
    if (!primary) return res.status(404).json({ error: "Primary movie not found" });

    const dupDocs = await Movie.find({ _id: { $in: duplicateIds } }).lean();
    if (dupDocs.length === 0) return res.status(404).json({ error: "No duplicates found" });

    // 1. Re-point News docs
    await News.updateMany(
      { movieId: { $in: duplicateIds } },
      { $set: { movieId: primary._id, movieTitle: primary.title } }
    );

    // 2. Merge cast (union by castId string)
    const existingCastIds = new Set(primary.cast.map(c => String(c.castId)));
    for (const dup of dupDocs) {
      for (const entry of (dup.cast || [])) {
        if (!existingCastIds.has(String(entry.castId))) {
          primary.cast.push(entry);
          existingCastIds.add(String(entry.castId));
        }
      }
    }

    // 3. Merge songs (union by title+singer)
    const songKey = (s) => `${(s.title || "").toLowerCase().trim()}|${(s.singer || "").toLowerCase().trim()}`;
    const existingSongKeys = new Set((primary.media?.songs || []).map(songKey));
    for (const dup of dupDocs) {
      for (const song of (dup.media?.songs || [])) {
        const k = songKey(song);
        if (!existingSongKeys.has(k)) {
          primary.media.songs.push(song);
          existingSongKeys.add(k);
        }
      }
    }

    // 4. Merge news references
    const dupNewsIds = dupDocs.flatMap(d => (d.news || []).map(String));
    const existingNewsIds = new Set((primary.news || []).map(String));
    for (const nid of dupNewsIds) {
      if (!existingNewsIds.has(nid)) {
        primary.news.push(new mongoose.Types.ObjectId(nid));
        existingNewsIds.add(nid);
      }
    }

    await primary.save({ validateBeforeSave: false });

    // 5. Update Cast.movies[] back-references — swap duplicate movie IDs → primary
    const dupOids = duplicateIds.map(id => new mongoose.Types.ObjectId(id));
    const primaryOid = new mongoose.Types.ObjectId(primaryId);
    await Cast.updateMany(
      { movies: { $in: dupOids } },
      { $pull: { movies: { $in: dupOids } } }
    );
    await Cast.updateMany(
      { "movies": { $nin: [primaryOid] }, _id: { $in: primary.cast.map(c => c.castId) } },
      { $addToSet: { movies: primaryOid } }
    );

    // 6. Delete duplicates
    const deleteResult = await Movie.deleteMany({ _id: { $in: duplicateIds } });

    res.json({
      success: true,
      deleted: deleteResult.deletedCount,
      primaryId,
      duplicateIds,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/merge/song ───────────────────────────────────────────────
// Removes duplicate song entries from their respective movies.
// The "primary" entry is kept as-is; duplicates are deleted from their movies.
app.post("/api/admin/merge/song", adminAuth, async (req, res) => {
  try {
    const { primary, duplicates } = req.body;
    // primary   = { movieId, songIndex }
    // duplicates = [{ movieId, songIndex }, ...]

    if (!primary?.movieId || !isOid(primary.movieId))
      return res.status(400).json({ error: "primary.movieId is required and must be a valid ID" });
    if (!Array.isArray(duplicates) || duplicates.length === 0)
      return res.status(400).json({ error: "duplicates must be a non-empty array" });

    let deleted = 0;

    // Group duplicates by movieId so we can do one save per movie
    const byMovie = {};
    for (const dup of duplicates) {
      if (!dup.movieId || !isOid(dup.movieId)) continue;
      if (!byMovie[dup.movieId]) byMovie[dup.movieId] = [];
      byMovie[dup.movieId].push(Number(dup.songIndex));
    }

    for (const [movieId, indices] of Object.entries(byMovie)) {
      const movie = await Movie.findById(movieId);
      if (!movie || !movie.media?.songs) continue;

      // Sort descending so splicing by index doesn't shift remaining indices
      const sortedIndices = [...new Set(indices)].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        if (idx >= 0 && idx < movie.media.songs.length) {
          movie.media.songs.splice(idx, 1);
          deleted++;
        }
      }
      await movie.save({ validateBeforeSave: false });
    }

    res.json({ success: true, deleted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// BMS OCCUPANCY TRACKER — Schema + Routes
// ════════════════════════════════════════════════════════════════════════════

const OccupancySnapshotSchema = new mongoose.Schema({
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  movieTitle: { type: String, default: "" },
  bmsUrl: { type: String, default: "" },
  runAt: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ["running", "done", "error"], default: "running" },
  errorMsg: { type: String, default: "" },
  // Overall aggregates
  totalShows: { type: Number, default: 0 },
  totalSeats: { type: Number, default: 0 },
  totalSold: { type: Number, default: 0 },
  avgOccupancy: { type: Number, default: 0 }, // 0-100
  estCollection: { type: Number, default: 0 }, // rupees
  cityCount: { type: Number, default: 0 },
  theatreCount: { type: Number, default: 0 },
  // City-wise breakdown
  cities: [{
    name: String,
    shows: Number,
    totalSeats: Number,
    soldSeats: Number,
    occupancy: Number, // 0-100
    estCollection: Number,
    theatres: [{
      name: String,
      location: String,
      shows: Number,
      totalSeats: Number,
      soldSeats: Number,
      occupancy: Number,
      estCollection: Number,
    }],
  }],
}, { timestamps: true });

const OccupancySnapshot = mongoose.models.OccupancySnapshot ||
  mongoose.model("OccupancySnapshot", OccupancySnapshotSchema);

// ── GET /api/admin/tracker/sessions/:movieId ─────────────────────────────────
// Returns last 50 snapshots for a movie (summary only, no cities array)
app.get("/api/admin/tracker/sessions/:movieId", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.movieId)) return res.status(400).json({ error: "Invalid ID" });
    const snaps = await OccupancySnapshot
      .find({ movieId: req.params.movieId }, "-cities")
      .sort({ runAt: -1 }).limit(50).lean();
    res.json(snaps);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/tracker/snapshot/:id ──────────────────────────────────────
// Returns a single snapshot with full city/theatre breakdown
app.get("/api/admin/tracker/snapshot/:id", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const snap = await OccupancySnapshot.findById(req.params.id).lean();
    if (!snap) return res.status(404).json({ error: "Snapshot not found" });
    res.json(snap);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/tracker/save-snapshot ────────────────────────────────────
// Frontend sends scraped data; backend stores it and optionally updates boxOfficeDays
app.post("/api/admin/tracker/save-snapshot", adminAuth, async (req, res) => {
  try {
    const { movieId, bmsUrl, cities = [], status = "done", errorMsg = "" } = req.body;
    if (!isOid(movieId)) return res.status(400).json({ error: "Invalid movieId" });

    const movie = await Movie.findById(movieId, "title").lean();
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    // Aggregate totals from cities
    let totalShows = 0, totalSeats = 0, totalSold = 0, estCollection = 0;
    const theatreSet = new Set();
    const processedCities = (cities || []).map(city => {
      let cShows = 0, cSeats = 0, cSold = 0, cColl = 0;
      const theatres = (city.theatres || []).map(th => {
        theatreSet.add(`${city.name}::${th.name}`);
        cShows += (th.shows || 0);
        cSeats += (th.totalSeats || 0);
        cSold += (th.soldSeats || 0);
        cColl += (th.estCollection || 0);
        const occ = th.totalSeats > 0 ? Math.round((th.soldSeats / th.totalSeats) * 100) : 0;
        return { ...th, occupancy: occ };
      });
      cShows = city.shows || cShows;
      cSeats = city.totalSeats || cSeats;
      cSold = city.soldSeats || cSold;
      cColl = city.estCollection || cColl;
      const occ = cSeats > 0 ? Math.round((cSold / cSeats) * 100) : 0;
      totalShows += cShows;
      totalSeats += cSeats;
      totalSold += cSold;
      estCollection += cColl;
      return {
        name: city.name, shows: cShows, totalSeats: cSeats, soldSeats: cSold,
        occupancy: occ, estCollection: cColl, theatres
      };
    });

    const avgOccupancy = totalSeats > 0 ? Math.round((totalSold / totalSeats) * 100) : 0;

    const snap = await OccupancySnapshot.create({
      movieId, movieTitle: movie.title, bmsUrl: bmsUrl || "",
      runAt: new Date(), status, errorMsg,
      totalShows, totalSeats, totalSold, avgOccupancy,
      estCollection, cityCount: processedCities.length,
      theatreCount: theatreSet.size, cities: processedCities,
    });

    res.status(201).json({ success: true, snapshotId: snap._id, avgOccupancy, estCollection });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/admin/tracker/snapshot/:id ───────────────────────────────────
app.delete("/api/admin/tracker/snapshot/:id", adminAuth, async (req, res) => {
  try {
    if (!isOid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    await OccupancySnapshot.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/tracker/all-active ────────────────────────────────────────
// Returns movies released in last 30 days with their latest snapshot summary
app.get("/api/admin/tracker/all-active", adminAuth, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const movies = await Movie
      .find({ releaseDate: { $gte: cutoff.toISOString().slice(0, 10) }, status: { $ne: "Upcoming" } },
        "title slug posterUrl thumbnailUrl releaseDate")
      .sort({ releaseDate: -1 }).lean();

    // Attach latest snapshot to each movie
    const result = await Promise.all(movies.map(async (m) => {
      const latest = await OccupancySnapshot
        .findOne({ movieId: m._id, status: "done" }, "-cities")
        .sort({ runAt: -1 }).lean();
      return { ...m, latestSnapshot: latest || null };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


//  SACNILK SCRAPER — Schema + Routes + Cron
//  Paste this entire block into server.js, just before the app.listen() call.
//
//  Dependencies to install (if not already present):
//    npm install node-cron node-fetch
//  Or if you're on Node 18+ with built-in fetch, remove the node-fetch import.
//
//  Note: The scraping is done server-side using a simple HTTP fetch +
//  regex approach. Sacnilk's India Net figure appears in the page HTML
//  as text next to the "India Net:" label. We use two strategies:
//    1. XPath-equivalent: regex targeting the span right after "India Net:"
//    2. Fallback: look for any ₹ figure near "India Net" in the raw HTML
// ════════════════════════════════════════════════════════════════════════════

const cron = require("node-cron");

// ── SacnilkConfig Schema ─────────────────────────────────────────────────────
// One doc per movie. Stores the Sacnilk URL and schedule config.

const SacnilkConfigSchema = new mongoose.Schema({
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, unique: true, index: true },
  movieTitle: { type: String, default: "" },
  sacnilkUrl: { type: String, default: "" },   // e.g. https://www.sacnilk.com/movie/Mantra_Muugdha_2026
  active: { type: Boolean, default: true }, // if false, cron skips it
  lastLog: {
    runAt: { type: Date, default: null },
    status: { type: String, default: "" },   // "success" | "error"
    net: { type: String, default: "" },   // e.g. "₹2.10 Cr"  (daily net, not cumulative)
    gross: { type: String, default: "" },   // e.g. "₹2.48 Cr"  (daily gross = net × 1.18)
    date: { type: String, default: "" },   // YYYY-MM-DD of box office date (yesterday IST)
    day: { type: Number, default: null },
    blogSlug: { type: String, default: "" },
    error: { type: String, default: "" },
  },
}, { timestamps: true });

const SacnilkConfig = mongoose.models.SacnilkConfig ||
  mongoose.model("SacnilkConfig", SacnilkConfigSchema);

// ── SacnilkLog Schema ────────────────────────────────────────────────────────
// Detailed per-run logs. Kept last 30 per movie.

const SacnilkLogSchema = new mongoose.Schema({
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  runAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["success", "error", "skipped"], default: "error" },
  net: { type: String, default: "" },   // daily net (delta)
  gross: { type: String, default: "" },   // daily gross (net × 1.18)
  date: { type: String, default: "" },   // box office date YYYY-MM-DD (yesterday IST)
  day: { type: Number, default: null },
  blogSlug: { type: String, default: "" },
  error: { type: String, default: "" },
  rawSnippet: { type: String, default: "" }, // first 500 chars of scraped HTML for debug
}, { timestamps: false });

const SacnilkLog = mongoose.models.SacnilkLog ||
  mongoose.model("SacnilkLog", SacnilkLogSchema);

// ════════════════════════════════════════════════════════════════════════════
//  CORE SCRAPE FUNCTION
//  Fetches the Sacnilk page, extracts "India Net" value,
//  stores it as a new boxOfficeDay, generates & publishes a blog post.
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
//  SACNILK SCRAPER — ENHANCED scrapeSacnilkForMovie()
//  DROP-IN REPLACEMENT for the existing function in server.js
//
//  Changes vs. original:
//  1. Daily Net = Current Scraped (cumulative) − Previous Stored Total
//     (Sacnilk always shows a running cumulative; we delta it each run)
//  2. Gross = Net × 1.18  (same GST formula as BoxOfficePanel)
//  3. Date is always "yesterday" in IST — no more manual date changes
//  4. Full Groq AI call using the exact same 7-section JSON prompt as
//     BoxOfficePanel (buildAiPrompt equivalent)
//  5. Blog HTML built with the full BoxOfficePanel template
//     (JSON-LD, FAQPage, BreadcrumbList, bar chart, structured table,
//      editorial sections, prev/next nav, tags, Also Read, footer)
//  6. Full SEO meta block (title, description, og:*, twitter:*,
//     canonical, keywords, slug)  written into the blog HTML comment
//  7. Automatic blog create-or-update → published: true
//
//  PASTE THIS ENTIRE FUNCTION to replace the old scrapeSacnilkForMovie()
//  in server.js. Everything else (schemas, routes, cron) stays unchanged.
// ════════════════════════════════════════════════════════════════════════════

async function scrapeSacnilkForMovie(movieId) {

  // ─────────────────────────────────────────────────────────────────────────
  //  §0  SHARED HELPERS  (mirrors BoxOfficePanel helpers exactly)
  // ─────────────────────────────────────────────────────────────────────────

  /** Format a raw number (rupees) into ₹X.XX Cr / L */
  const formatINR = (n) => {
    if (!n || isNaN(n)) return "—";
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
    if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
    return `₹${Number(n).toLocaleString("en-IN")}`;
  };

  /** Parse a human currency string to raw rupees — alias of global helper */
  const parseToRupees = parseToRupeesGlobal;

  /** Slugify — identical to BoxOfficePanel */
  const slugify = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

  const getYear = (d) => (d ? new Date(d).getFullYear() : "");

  /** Wrap plain text blocks in <p> tags with inline styles */
  const toParagraphs = (text) =>
    String(text || "")
      .replace(/`/g, "&#96;")   // ← prevent backticks in AI text from breaking template literals
      .trim()
      .split(/\n{2,}/)
      .map(chunk => chunk.split(/\n/).map(l => l.trim()).filter(Boolean).join(" ").trim())
      .filter(Boolean)
      .map(p => `<p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${p}</p>`)
      .join("\n");

  /** Cast/crew extraction — mirrors BoxOfficePanel extractCastInfo */
  const extractCastInfo = (movie) => {
    const cast = Array.isArray(movie.cast) ? movie.cast : [];
    const findByRole = (keywords) =>
      cast.find((m) => {
        const r = (m.role || m.type || "").toLowerCase();
        return keywords.some((k) => r.includes(k));
      })?.name || null;

    const directorEntry = cast.find((m) => {
      const r = (m.role || m.type || "").toLowerCase().trim();
      return r === "director" || r === "film director" || r === "movie director" ||
        (r.includes("director") && !["music", "art", "action", "stunt", "assistant", "co-", "associate"].some(x => r.includes(x)));
    });
    const directorName = directorEntry?.name || movie.director || null;

    const producerEntry = cast.find((m) => {
      const r = (m.role || m.type || "").toLowerCase().trim();
      return r === "producer" ||
        (r.includes("producer") && !["executive", "co-", "line", "associate", "assistant"].some(x => r.includes(x)));
    });
    const producerName = producerEntry?.name || movie.producer || null;

    const musicDirector = findByRole(["music director"]) || null;
    const writer = findByRole(["writer", "screenplay", "story", "dialogue"]) || null;
    const dop = findByRole(["cinematographer", "dop", "director of photography"]) || null;
    const editor = findByRole(["editor"]) || null;

    const CREW_KW = ["director", "producer", "writer", "screenplay", "story", "dialogue", "music director", "cinematographer", "dop", "editor", "choreographer", "art director", "costume", "sound", "stunt", "vfx"];
    const actingKW = ["actor", "actress", "lead", "hero", "heroine", "supporting", "cameo", "special appearance"];
    const actors = cast.filter((m) => {
      const r = (m.role || m.type || "").toLowerCase();
      const isCrew = CREW_KW.some((k) => r.includes(k)) && !actingKW.some((k) => r.includes(k));
      return !isCrew;
    });

    const leadActors = actors.slice(0, 4).map((m) => m.name).filter(Boolean);
    const leadActresses = actors
      .filter((m) => { const r = (m.role || m.type || "").toLowerCase(); return r.includes("actress") || r.includes("heroine"); })
      .slice(0, 2).map((m) => m.name).filter(Boolean);

    // SEO ENHANCEMENT: castId references for the lead actors/director so the
    // blog can deep-link to /cast/{castId} profile pages (internal linking
    // requirement) without touching the existing cast data model.
    const directorCastId = directorEntry?.castId || null;
    const leadActorLinks = actors.slice(0, 4)
      .filter((m) => m.name && m.castId)
      .map((m) => ({ name: m.name, castId: m.castId }));

    return { directorName, producerName, musicDirector, writer, dop, editor, leadActors, leadActresses, directorCastId, leadActorLinks };
  };

  // ── Odisha festival calendar (used by classifyBoxOfficeDayType + AI prompt) ──
  const FESTIVAL_WINDOWS_2026 = [
    { label: "Makar Sankranti", start: "2026-01-14", end: "2026-01-18" },
    { label: "Maha Vishuba Sankranti", start: "2026-04-14", end: "2026-04-18" },
    { label: "Raja Parba", start: "2026-06-14", end: "2026-06-19" },
    { label: "Ratha Yatra", start: "2026-07-18", end: "2026-07-23" },
    { label: "Nuakhai", start: "2026-08-26", end: "2026-08-30" },
    { label: "Durga Puja", start: "2026-10-13", end: "2026-10-18" },
    { label: "Diwali", start: "2026-11-08", end: "2026-11-12" },
  ];
  const FESTIVAL_WINDOWS_2027 = [
    { label: "Makar Sankranti", start: "2027-01-14", end: "2027-01-18" },
    { label: "Maha Vishuba Sankranti", start: "2027-04-14", end: "2027-04-18" },
    { label: "Raja Parba", start: "2027-06-14", end: "2027-06-19" },
    { label: "Ratha Yatra", start: "2027-07-04", end: "2027-07-09" },
    { label: "Nuakhai", start: "2027-09-06", end: "2027-09-10" },
    { label: "Durga Puja", start: "2027-10-05", end: "2027-10-10" },
    { label: "Diwali", start: "2027-10-26", end: "2027-10-30" },
  ];

  /** findNearbyFestival — returns festival label if dateStr falls within any
   *  Odisha festival window (±0 days, inclusive), otherwise returns "". */
  const findNearbyFestival = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const table = year === 2026 ? FESTIVAL_WINDOWS_2026
      : year === 2027 ? FESTIVAL_WINDOWS_2027
        : [];
    for (const { label, start, end } of table) {
      if (dateStr >= start && dateStr <= end) return label;
    }
    return "";
  };

  /**
   * classifyBoxOfficeDayType — SEO ENHANCEMENT
   * ─────────────────────────────────────────────────────────────────────────
   * Determines the contextual "angle" for THIS specific day's blog so that
   * consecutive day-wise blogs are never near-duplicates of one another.
   * Purely computed in-memory from data that already exists — no schema
   * changes, no new DB fields, no change to admin workflows.
   *
   * Returns:
   *  - tags: array of contextual labels, e.g. ["opening-day"], ["weekend","milestone-5cr"]
   *  - isWeekend: boolean (Fri/Sat/Sun box-office "weekend window")
   *  - milestoneCroreCrossed: number|null — crore mark crossed TODAY, if any
   *  - festival: string — Odisha festival label if today falls in a window
   */
  const classifyBoxOfficeDayType = (day, dateStr, totalNetNum, prevTotalNetNum, movieDoc) => {
    const tags = [];
    const dow = dateStr ? new Date(dateStr).getDay() : null; // 0=Sun..6=Sat
    const isWeekend = dow === 0 || dow === 5 || dow === 6;

    // ── Specific day labels ──────────────────────────────────────────
    if (day === 1) tags.push("opening-day");
    else if (day === 2) tags.push("day-two");
    else if (day === 3) tags.push("day-three");
    else if (day === 7) tags.push("first-week-closing");
    else if (day === 14) tags.push("second-week-closing");
    else if (day === 10) tags.push("day-ten");
    else if (day === 15) tags.push("day-fifteen");

    // ── Week labels ──────────────────────────────────────────────────
    if (day <= 7) tags.push("first-week");
    else if (day <= 14) tags.push("second-week");
    else if (day <= 21) tags.push("third-week");
    else if (day <= 28) tags.push("fourth-week");

    // ── Weekend numbering ────────────────────────────────────────────
    if (day > 3) {
      if (isWeekend) {
        const weekendNum = Math.ceil(day / 7);
        const label =
          weekendNum === 2 ? "second-weekend" :
            weekendNum === 3 ? "third-weekend" :
              weekendNum === 4 ? "fourth-weekend" :
                `weekend-${weekendNum}`;
        tags.push(label, "weekend");
      } else {
        tags.push("weekday");
      }
    } else if (day >= 1 && day <= 3) {
      // Opening Weekend always labelled separately
      if (isWeekend || day <= 3) tags.push("opening-weekend");
    }

    // ── Milestone detection — sub-crore AND crore marks ─────────────
    const MILESTONES_L = [10, 25, 50, 75].map(l => l * 1_00_000);       // ₹10L..₹75L
    const MILESTONES_CR = [1, 2, 3, 5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 200]
      .map(cr => cr * 1_00_00_000);                                        // ₹1Cr..₹200Cr
    const allMilestones = [...MILESTONES_L, ...MILESTONES_CR];

    const crossed = allMilestones.find(m => prevTotalNetNum < m && totalNetNum >= m);
    if (crossed) {
      const inLakh = crossed / 1_00_000;
      const inCr = crossed / 1_00_00_000;
      const label = inCr >= 1 ? `milestone-${inCr}cr` : `milestone-${inLakh}L`;
      tags.push(label);
    }

    // ── OTT proximity ────────────────────────────────────────────────
    if (movieDoc?.ottReleaseDate && dateStr) {
      const ottD = new Date(movieDoc.ottReleaseDate);
      const curD = new Date(dateStr);
      if (!isNaN(ottD.getTime())) {
        const diffDays = Math.round((ottD - curD) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) tags.push("approaching-ott");
        if (diffDays < 0) tags.push("post-ott-theatrical");
      }
    }

    // ── Extended run milestones ──────────────────────────────────────
    if (day >= 50) tags.push("golden-run");
    else if (day >= 25) tags.push("silver-jubilee-run");
    else if (day >= 21) tags.push("extended-run");

    // ── Festival detection ───────────────────────────────────────────
    const festival = dateStr ? findNearbyFestival(dateStr) : "";
    if (festival) tags.push(`festival-${festival.toLowerCase().replace(/\s+/g, "-")}`);

    if (!tags.length) tags.push("standard-day");

    // Crore milestone value for the milestone badge (backward-compat)
    const milestoneCroreCrossed = crossed && crossed >= 1_00_00_000
      ? crossed / 1_00_00_000
      : null;

    return { tags, isWeekend, milestoneCroreCrossed, festival };
  };

  /** Parse Groq JSON response into the editorial sections.
   *  SEO ENHANCEMENT: extended from 7 to 11 sections — the 4 new keys
   *  (weekendWeekdayComparison, occupancyTrend, industryImpact, futureOutlook)
   *  give every day's blog unique, day-type-specific analysis instead of a
   *  reworded copy of the previous day's content. Fallbacks below vary by
   *  `dayTags` so even when the AI call fails, two different days never
   *  produce identical fallback text. */
  const parseAiSections = (aiText, movie, targetDay, totalNet, totalGross, dayTags = [], sortedDays = [], dayClassification = {}) => {
    const year = getYear(movie.releaseDate);
    const tagSet = new Set(dayTags);
    const isWeekendDay = tagSet.has("weekend");
    const milestoneCr = [...tagSet].find(t => t.startsWith("milestone-") && t.endsWith("cr"))?.replace("milestone-", "").replace("cr", "");

    const fallback = (key) => {
      const defaults = {
        seoHeadline: (() => {
          if (tagSet.has("opening-day")) return `Opening Day Performance Analysis`;
          if (tagSet.has("opening-weekend") || targetDay <= 3) return `Opening Weekend Collection Report`;
          if (tagSet.has("first-week-closing") || targetDay === 7) return `First Week Closing Report`;
          if (tagSet.has("silver-jubilee-run")) return `25 Days Theatrical Run Report`;
          if (tagSet.has("golden-run")) return `50 Days Theatrical Run Report`;
          return `Day ${targetDay} Collection Report & Analysis`;
        })(),
        introParagraph: (() => {
          if (tagSet.has("opening-day")) return `The Odia box office has finally opened its doors to ${movie.title}. The much-awaited film has marked its Day 1 presence with an estimated net collection of ${formatINR(totalNet)}. Early footfalls give us a glimpse of the initial audience reaction across Odisha.`;
          if (tagSet.has("opening-weekend") || targetDay <= 3) return `The opening weekend is turning out to be a crucial period for ${movie.title}. By Day ${targetDay}, the film has pushed its total net collection to an estimated ${formatINR(totalNet)}. The weekend crowd has significantly influenced these initial numbers.`;
          if (tagSet.has("first-week-closing") || targetDay === 7) return `A full week has passed since ${movie.title} hit the screens. Wrapping up its first seven days, the film's total net collection stands at an estimated ${formatINR(totalNet)}, painting a clear picture of its week-one box office trajectory in the Odia circuit.`;
          return `The theatrical journey of ${movie.title} continues at the Odia box office. As of Day ${targetDay}, the film has managed to pull an estimated net collection of ${formatINR(totalNet)} and a gross of ${formatINR(totalGross)}, holding its ground as audiences continue to visit the theatres.`;
        })(),
        boxOfficeAnalysis: tagSet.has("opening-day")
          ? `Opening day figures are crucial for any Odia film, and ${movie.title} has taken its first major step. The Day 1 numbers provide a solid baseline for the upcoming weekend. Initial reports indicate that ${tagSet.has("weekend") ? "the holiday/weekend timing" : "the dedicated fanbase"} played a significant role in driving these early ticket sales.`
          : tagSet.has("first-week-closing") || targetDay === 7
            ? `Closing the first week with ${formatINR(totalNet)} net is a key milestone for ${movie.title}. Week-one numbers often dictate screen retention in the second week. These figures suggest how the core Odia audience has received the film before word-of-mouth takes over completely.`
            : isWeekendDay
              ? `Weekends are the lifeblood of the Odia film trade, and ${movie.title} is looking to capitalize on this window on Day ${targetDay}. Families and casual viewers typically flock to cinemas during these days, providing a much-needed spike in the overall collection graph.`
              : `Sustaining collections on weekdays is the real test of a film's content. On Day ${targetDay}, ${movie.title} witnessed the usual midweek settling of footfalls. The day-wise hold will be closely monitored by trade analysts to gauge the film's lifetime potential.`,
        audienceResponse: `Word of mouth is the ultimate decider in Ollywood. For ${movie.title}, audience feedback has been pivotal in shaping its box office journey so far. ${tagSet.has("extended-run") || tagSet.has("silver-jubilee-run") || tagSet.has("golden-run") ? "The fact that it is still running strong proves that the Odia audience has deeply connected with the content." : "Reactions from the cinema halls across Odisha are setting the tone for the coming days."}`,
        performanceAnalysis: `Looking at the numbers, a total net of ${formatINR(totalNet)} (and ${formatINR(totalGross)} gross) gives ${movie.title} a respectable standing in the current Odia cinema landscape. ${movie.budget ? `When weighed against its reported budget of ${movie.budget}, the recovery path is being closely analyzed.` : "The trajectory over the next few days will determine its ultimate box office verdict."}`,
        weekendWeekdayComparison: (() => {
          if (tagSet.has("opening-weekend"))
            return `The opening weekend (Days 1-3) is the most critical window for any Odia film, and ${movie.title} is currently in the thick of it. Opening weekends typically set the tone for the entire theatrical run — a strong three-day total builds confidence among exhibitors and can lead to screen additions for the second week.`;
          if (tagSet.has("second-weekend"))
            return `Day ${targetDay} is part of ${movie.title}'s second weekend, a crucial checkpoint after the initial buzz has settled. Second-weekend numbers reveal whether the film has genuine audience legs or was primarily a first-week phenomenon. A drop of less than 40% from the first weekend is considered healthy for an Odia release.`;
          if (tagSet.has("third-weekend"))
            return `By the third weekend, most Odia films have either consolidated a strong audience base or started a steady wind-down. ${movie.title} reaching Day ${targetDay} with theatres still running is itself a sign of respectable staying power in the market.`;
          if (isWeekendDay)
            return `Day ${targetDay} falls in a weekend box-office window for ${movie.title}. Weekends typically deliver 1.5–2× the footfall of weekdays for Odia films, driven by family audiences and leisure-time viewing. Comparing this weekend's figures to the previous one will reveal how quickly the film's appeal is evolving.`;
          return `Day ${targetDay} is a weekday in ${movie.title}'s theatrical run. Weekday collections test a film's word-of-mouth strength once the opening excitement fades. A film that holds its weekday numbers close to its weekend collections is signalling strong repeat-viewing intent and broad audience approval.`;
        })(),
        occupancyTrend: `Occupancy levels for ${movie.title} on Day ${targetDay} are estimated based on trade trends for similarly positioned Odia releases${isWeekendDay ? ", with weekend shows typically running fuller than weekday shows" : ", with weekday shows generally running at moderate occupancy compared to the opening days"}. Exact seat-level occupancy data is not independently verified and figures here are based on collection trends.`,
        prediction: `Based on current trends, ${movie.title} is expected to maintain momentum in the coming days, especially during weekends.`,
        industryImpact: `${movie.title}'s box office run is being closely watched within Ollywood as a marker of audience appetite for ${Array.isArray(movie.genre) ? movie.genre.join("/") : (movie.genre || "this genre")} content in Odia cinema. A strong showing for the film would encourage producers to continue investing in similar theatrical releases for the Odia film industry.`,
        futureOutlook: (() => {
          if (milestoneCr)
            return `Having just crossed the ₹${milestoneCr} Cr mark, ${movie.title} enters a new chapter in its box office story. In Odia cinema, reaching this level is a significant achievement — the film now joins a select group of Ollywood releases that have crossed this threshold in recent years. The next milestone to watch will be ₹${Number(milestoneCr) < 1 ? 1 : Number(milestoneCr) < 2 ? 2 : Number(milestoneCr) < 3 ? 3 : Number(milestoneCr) < 5 ? 5 : Number(milestoneCr) < 10 ? 10 : Number(milestoneCr) + 5} Cr, and whether audience momentum can carry the film there.`;
          if (tagSet.has("approaching-ott"))
            return `With the OTT release of ${movie.title} approaching within the next week, the theatrical window is in its final days. Audiences who have been waiting to watch at home will shortly get that chance, which may slow the final few days of theatre collections. However, a digital release on a major platform will introduce the film to a far wider audience across India and among the Odia diaspora globally.`;
          if (tagSet.has("silver-jubilee-run") || tagSet.has("extended-run"))
            return `${movie.title} reaching Day ${targetDay} in theatres is a sign of remarkable staying power. Most Odia releases wind down in the second or third week, so a film running this deep into its theatrical run has found a loyal core audience that keeps returning. Future days will be driven by repeat viewings, word of mouth among family and friends, and the availability of shows in smaller towns and B/C centres of Odisha.`;
          return `Looking ahead, ${movie.title}'s trajectory will be shaped by how it performs in the coming weekend and whether exhibitors add or reduce screens in response to audience demand. Any new competition from other Odia or Hindi releases will also be a factor to watch.`;
        })(),
        finalVerdict: `${movie.title} has collected ${formatINR(totalNet)} net and ${formatINR(totalGross)} gross after ${targetDay} days. All figures are industry estimates. Source: Sacnilk via Ollypedia.`,
        weekOneTwoComparison: (() => {
          if (targetDay < 14) return "";
          const week1 = sortedDays.filter(d => d.day <= 7);
          const week2 = sortedDays.filter(d => d.day > 7 && d.day <= 14);
          const w1Total = week1.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
          const w2Total = week2.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
          if (!w1Total || !w2Total) return "";
          const drop = (((w1Total - w2Total) / w1Total) * 100).toFixed(0);
          return `${movie.title} collected approximately ${formatINR(w1Total)} in its first week and ${formatINR(w2Total)} in the second week — a drop of around ${drop}%. A drop below 50% is considered healthy for an Odia theatrical release, indicating the film has sustained audience interest beyond the opening-week buzz.`;
        })(),
        festivalImpact: dayClassification?.festival
          ? `${movie.title}'s box office run is coinciding with the ${dayClassification.festival} festival season in Odisha. Odia films traditionally see a boost in footfalls during this period as families spend leisure time at cinemas. Whether ${movie.title} has capitalised on this festival window will be reflected in the coming days' collections.`
          : "",
      };
      return defaults[key] || "";
    };
    const keys = [
      "seoHeadline", "introParagraph", "boxOfficeAnalysis", "audienceResponse",
      "performanceAnalysis", "weekendWeekdayComparison", "occupancyTrend",
      "prediction", "industryImpact", "futureOutlook", "finalVerdict",
      "weekOneTwoComparison", "festivalImpact",   // ← NEW
    ];
    if (!aiText?.trim()) return Object.fromEntries(keys.map(k => [k, fallback(k)]));
    try {
      const clean = aiText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(clean);
      return Object.fromEntries(keys.map(k => [k, parsed[k] || fallback(k)]));
    } catch {
      return {
        seoHeadline: fallback("seoHeadline"),
        introParagraph: fallback("introParagraph"),
        boxOfficeAnalysis: aiText.trim(),
        audienceResponse: fallback("audienceResponse"),
        performanceAnalysis: fallback("performanceAnalysis"),
        weekendWeekdayComparison: fallback("weekendWeekdayComparison"),
        occupancyTrend: fallback("occupancyTrend"),
        prediction: fallback("prediction"),
        industryImpact: fallback("industryImpact"),
        futureOutlook: fallback("futureOutlook"),
        finalVerdict: fallback("finalVerdict"),
        weekOneTwoComparison: fallback("weekOneTwoComparison"),
        festivalImpact: fallback("festivalImpact"),
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  §1  LOAD CONFIG
  // ─────────────────────────────────────────────────────────────────────────

  const cfg = await SacnilkConfig.findOne({ movieId });
  if (!cfg || !cfg.sacnilkUrl) throw new Error("No Sacnilk URL configured");

  // ─────────────────────────────────────────────────────────────────────────
  //  §2  FETCH SACNILK PAGE
  // ─────────────────────────────────────────────────────────────────────────

  let html = "";
  try {
    const resp = await fetch(cfg.sacnilkUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.sacnilk.com/",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  } catch (e) {
    throw new Error(`Fetch failed: ${e.message}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3  EXTRACT INDIA NET (cumulative total from Sacnilk)
  // ─────────────────────────────────────────────────────────────────────────

  let scrapedCumulativeRaw = "";

  // Strategy A: span immediately after "India Net:" label
  const stratA = html.match(
    /India\s*Net\s*:?<\/span>\s*<span[^>]*>\s*([^<]{2,40}?)\s*<\/span>/i
  );
  if (stratA) scrapedCumulativeRaw = stratA[1].trim();

  // Strategy B: broader rupee figure near "India Net"
  if (!scrapedCumulativeRaw) {
    const idx = html.search(/India\s*Net/i);
    if (idx !== -1) {
      const slice = html.slice(idx, idx + 400).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const mB = slice.match(/(?:₹|Rs\.?|INR)?\s*(\d[\d,\.]+\s*(?:Cr|L|Lakh|Crore)?)/i);
      if (mB) scrapedCumulativeRaw = mB[0].trim();
    }
  }

  if (!scrapedCumulativeRaw) {
    throw new Error("Could not find 'India Net' value on page. The page structure may have changed.");
  }

  scrapedCumulativeRaw = scrapedCumulativeRaw.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();

  // The number Sacnilk shows is always the RUNNING TOTAL, not a single day's collection.
  const scrapedCumulativeNum = parseToRupees(scrapedCumulativeRaw);

  // ─────────────────────────────────────────────────────────────────────────
  //  §4  LOAD MOVIE + CALCULATE DAY NUMBER AND DATE
  // ─────────────────────────────────────────────────────────────────────────

  const movie = await Movie.findById(movieId);
  if (!movie) throw new Error("Movie not found");

  // IST helpers
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000)); // UTC+5:30
  const todayStr = nowIST.toISOString().slice(0, 10);             // YYYY-MM-DD today (IST)

  // §4a  BOX OFFICE DATE = YESTERDAY (IST)
  //  Sacnilk posts previous-day figures in the morning.
  //  The cron runs at 8 AM IST → data is always for yesterday.
  //  We auto-compute yesterday so the admin never has to change the date manually.
  const yesterdayIST = new Date(nowIST);
  yesterdayIST.setDate(yesterdayIST.getDate() - 1);
  const yesterdayStr = yesterdayIST.toISOString().slice(0, 10); // YYYY-MM-DD yesterday (IST)

  movie.boxOfficeDays = movie.boxOfficeDays || [];
  const existingDays = movie.boxOfficeDays;

  // §4b  PREVIOUS STORED CUMULATIVE TOTAL
  //  Use movie.boxOffice.total — set to formatINRGlobal(scrapedCumulativeNum) on every
  //  successful scrape run, so it's always a clean "₹X.XX Cr" string.
  //  Summing individual day nets is unreliable if any entry has a corrupted value
  //  (e.g. "7" from an old float-arithmetic bug).
  const previousTotalNum = parseToRupeesGlobal(movie.boxOffice?.total || "0");

  // §4c  DAILY NET = Scraped Cumulative − Previous Total
  //  e.g. Sacnilk shows ₹55 Cr, we previously stored ₹50 Cr → Day net = ₹5 Cr
  const dailyNetNum = Math.max(0, scrapedCumulativeNum - previousTotalNum);
  const dailyNetRaw = formatINR(dailyNetNum);

  // §4c-guard  ZERO / NEGATIVE DELTA — Sacnilk hasn't updated yet.
  //  This happens when the page still shows yesterday's running total (no new data),
  //  or when we've already scraped today and the number hasn't moved.
  //  We do NOT save a ₹0 day entry and do NOT publish a blog in this case.
  //  We log it as "skipped" so the admin can see it happened.
  const yesterdayEntry = existingDays.find(d => d.date === yesterdayStr);
  if (dailyNetNum === 0 && !yesterdayEntry) {
    // Log the skip
    await SacnilkLog.create({
      movieId,
      runAt: new Date(),
      status: "skipped",
      net: "₹0",
      gross: "",
      date: yesterdayStr,
      day: null,
      blogSlug: "",
      rawSnippet: html.slice(0, 500),
      error: `Scraped total (${scrapedCumulativeRaw}) equals stored total — no new data yet.`,
    });
    await SacnilkConfig.findOneAndUpdate(
      { movieId },
      {
        $set: {
          "lastLog.runAt": new Date(),
          "lastLog.status": "skipped",
          "lastLog.net": "₹0",
          "lastLog.gross": "",
          "lastLog.date": yesterdayStr,
          "lastLog.error": `No new data — scraped total ${scrapedCumulativeRaw} matches stored total.`,
        }
      }
    );
    return {
      netRaw: "₹0",
      grossRaw: "",
      scrapedTotal: scrapedCumulativeRaw,
      day: null,
      date: yesterdayStr,
      blogSlug: "",
      skipped: true,
      reason: `Scraped total (${scrapedCumulativeRaw}) equals previously stored total — Sacnilk hasn't updated yet.`,
    };
  }

  // §4d  GROSS = Net × 1.18 (same GST_RATE as BoxOfficePanel)
  const GST_RATE = 1.18;
  const dailyGrossNum = Math.round(dailyNetNum * GST_RATE);
  const dailyGrossRaw = dailyGrossNum > 0 ? formatINR(dailyGrossNum) : "";

  // §4e  Determine day number
  const existingDayNums = existingDays.map(d => d.day);
  const maxDay = existingDayNums.length > 0 ? Math.max(...existingDayNums) : 0;

  let actualDay;

  if (yesterdayEntry) {
    // Re-scrape for same day — update existing entry only if new value is non-zero
    yesterdayEntry.net = dailyNetRaw;
    yesterdayEntry.gross = dailyGrossRaw;
    yesterdayEntry.note = "Ollypedia Tracker (updated)";
    actualDay = yesterdayEntry.day;
  } else {
    // New day entry
    actualDay = maxDay + 1;
    existingDays.push({
      day: actualDay,
      net: dailyNetRaw,
      gross: dailyGrossRaw,
      date: yesterdayStr,
      note: "Ollypedia Tracker",
    });
  }

  movie.boxOfficeDays.sort((a, b) => a.day - b.day);

  // §4f  Update boxOffice.total (running cumulative net)
  const newTotalNet = scrapedCumulativeNum; // Sacnilk cumulative IS the new total
  movie.boxOffice = movie.boxOffice || {};
  movie.boxOffice.total = formatINR(newTotalNet);

  await movie.save({ validateBeforeSave: false });

  // ─────────────────────────────────────────────────────────────────────────
  //  §5  BUILD BLOG CONTENT  (full BoxOfficePanel template)
  // ─────────────────────────────────────────────────────────────────────────

  const daysUpToN = movie.boxOfficeDays.filter(d => d.day <= actualDay);
  const sortedDays = [...daysUpToN].sort((a, b) => a.day - b.day);

  // Recalculate totals from sorted days (net may differ from cumulative due to rounding)
  const totalNet = newTotalNet;
  const totalGrossNum = sortedDays.reduce((s, d) => s + parseToRupees(d.gross || "0"), 0);

  const totalNetStr = formatINR(totalNet);
  const totalGrossStr = totalGrossNum > 0 ? formatINR(totalGrossNum) : "—";

  const year = getYear(movie.releaseDate);
  const movieName = movie.title || "Unknown Movie";
  const movieNameNoSp = movieName.replace(/\s+/g, "");
  const releaseDateFmt = movie.releaseDate
    ? new Date(movie.releaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const genreArr = Array.isArray(movie.genre) ? movie.genre : (movie.genre ? [movie.genre] : []);
  const genre = genreArr.join(", ") || "Drama";
  const movieSlug = slugify(`${movieName}${year ? ` (${year})` : ""}`);
  const boxOfficeUrl = `/box-office/${movieSlug}`;

  // Blog slug — deterministic per movie+day (no timestamp suffix)
  const blogSlugBase = slugify(`${movieName}${year ? ` ${year}` : ""} day ${actualDay} box office collection`);
  const blogSlug = blogSlugBase; // stable per day → create-or-update

  const blogTitle = `${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection and collected ${totalGrossStr} gross`;

  const crew = extractCastInfo(movie);
  const { directorName, producerName, musicDirector, writer, dop, editor, leadActors, leadActresses, directorCastId, leadActorLinks } = crew;

  // SEO ENHANCEMENT: classify today's contextual angle (opening day, weekend,
  // milestone crossed, approaching OTT, etc.) so the AI prompt — and the
  // fallback content if AI is unavailable — produce genuinely different
  // analysis from the previous day's blog instead of a near-duplicate.
  const dayClassification = classifyBoxOfficeDayType(actualDay, yesterdayStr, totalNet, previousTotalNum, movie);
  const dayTags = dayClassification.tags;
  const dayTagLine = dayTags.join(", ");
  const encMovieName = encodeURIComponent(movieName);

  const currentDayObj = sortedDays.find(d => d.day === actualDay) || sortedDays[sortedDays.length - 1] || {};
  const dayNet = currentDayObj.net ? formatINR(parseToRupees(currentDayObj.net)) : dailyNetRaw;
  const dayGross = currentDayObj.gross ? formatINR(parseToRupees(currentDayObj.gross)) : (dailyGrossRaw || "—");

  // ─────────────────────────────────────────────────────────────────────────
  //  §6  GROQ AI — 7-section editorial content (same model + prompt as BoxOfficePanel)
  // ─────────────────────────────────────────────────────────────────────────

  // Build the same prompt as BoxOfficePanel.buildAiPrompt()
  const tableText = sortedDays
    .map((d) => `Day ${d.day}${d.date ? ` (${d.date})` : ""}: Net ${formatINR(parseToRupees(d.net))}, Gross ${formatINR(parseToRupees(d.gross))}${d.note ? ` — ${d.note}` : ""}`)
    .join("\n");
  const castLine = [
    directorName ? `Director: ${directorName}` : "",
    producerName ? `Producer: ${producerName}` : "",
    musicDirector ? `Music Director: ${musicDirector}` : "",
    writer ? `Writer: ${writer}` : "",
    leadActors.length ? `Cast: ${leadActors.join(", ")}` : "",
    leadActresses.length ? `Actresses: ${leadActresses.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const aiPrompt = `You are writing a box office collection article for the Odia film website Ollypedia.

Movie: ${movieName}${year ? ` (${year})` : ""}
${movie.language ? `Language: ${movie.language}` : "Language: Odia"}
Genre: ${genre}
Release Date: ${releaseDateFmt}
${castLine}
${movie.budget ? `Budget: ${movie.budget}` : ""}

Day-wise collection data (all days up to Day ${actualDay}):
${tableText}

Total Net: ${totalNetStr}
Total Gross: ${totalGrossStr}

CONTEXT FOR TODAY (Day ${actualDay}): ${dayTagLine}.
${dayTags.includes("opening-day") ? "This is the FILM'S OPENING DAY — focus on first impressions, opening-day buzz, and how it compares to expectations going in." : ""}
${dayTags.includes("weekend") ? "Today falls in the WEEKEND box-office window — focus heavily on weekend vs weekday performance and family/leisure footfalls." : ""}
${dayTags.includes("weekday") ? "Today is a WEEKDAY — focus on how the film is holding up after the opening rush and what weekday collections reveal about word-of-mouth." : ""}
${dayTags.includes("first-week-closing") ? "Today marks the close of WEEK ONE — focus on the overall week-one verdict and what it signals for week two." : ""}
${dayTags.some(t => t.startsWith("milestone-")) ? `The film has just CROSSED A COLLECTION MILESTONE today (${dayTags.find(t => t.startsWith("milestone-"))}) — lead with this milestone and what it means for the film's standing in Ollywood.` : ""}
${dayTags.includes("approaching-ott") ? "The film's OTT release is approaching within the next week — mention how the theatrical run is winding down ahead of the digital premiere." : ""}
${dayTags.includes("extended-run") ? "The film is in an EXTENDED THEATRICAL RUN (25+ days) — focus on staying power, repeat audiences, and longevity rather than day-on-day swings." : ""}
${dayTags.some(t => t.startsWith("festival-")) ? `Today's collection coincides with the ODISHA FESTIVAL SEASON (${dayClassification.festival}) — mention how festival footfalls typically boost Odia cinema and whether this film is benefiting.` : ""}
${dayTags.includes("second-weekend") ? "Today is the SECOND WEEKEND — compare with the first weekend and explain what the drop (or hold) means for the film's overall commercial standing." : ""}
${dayTags.includes("third-weekend") || dayTags.includes("fourth-weekend") ? `Today is the ${dayTags.find(t => /-(weekend|run)$/.test(t))?.replace("-", " ")} — focus on the film's incredible staying power and what sustains audience interest this far into the run.` : ""}
${dayTags.includes("first-week-closing") ? "Today closes the FIRST WEEK — write a full week-one verdict: total, daily average, best day, worst day, and outlook for week two." : ""}
${dayTags.includes("second-week-closing") ? "Today closes the SECOND WEEK — compare week-two total with week-one, analyse the drop percentage, and forecast the second half of the run." : ""}
${dayTags.includes("silver-jubilee-run") ? "The film has crossed 25 DAYS in theatres (Silver Jubilee run) — celebrate this milestone, compare with other recent Odia films that achieved this, and explain what it means for Ollywood." : ""}
${dayTags.includes("golden-run") ? "The film has crossed 50 DAYS in theatres (Golden Jubilee run) — this is exceptional for Odia cinema; lead with this achievement." : ""}

You must respond ONLY with a valid JSON object (no markdown, no code fences, no extra text). The JSON must have exactly these keys:

{
  "seoHeadline": "A compelling 10-15 word headline for h1. Use a DIFFERENT ANGLE than 'Day N Box Office Collection'. Choose from: milestone lead, weekend verdict, weekday hold, industry comparison, audience sentiment, OTT countdown, or running-total achievement. Never use a generic 'Day N collection report' phrasing. TODAY'S CONTEXT: ${dayTagLine}.",
  "introParagraph": "2-3 sentences introducing the film and Day ${actualDay} performance. Mention the net and gross figures naturally, and reflect today's context.",
  "boxOfficeAnalysis": "2-3 paragraphs (plain text, no HTML tags) covering the day-wise journey and trend, written specifically through today's context above — do NOT just restate yesterday's analysis with new numbers.",
  "audienceResponse": "1-2 paragraphs about how Odia audiences and reviewers are responding — word of mouth, social media buzz, repeat viewing. Vary the framing based on how many days the film has run.",
  "performanceAnalysis": "2 paragraphs analysing the film's performance relative to its budget and typical Odia cinema benchmarks. Mention total net ${totalNetStr} and gross ${totalGrossStr}.",
  "weekendWeekdayComparison": "1-2 paragraphs specifically comparing weekend and weekday collection patterns for this film so far, and what that pattern suggests about audience type (family/youth/repeat viewers).",
  "occupancyTrend": "1 paragraph describing the likely occupancy trend (rising, falling, steady) across screens based on the collection numbers — do not invent exact percentages, describe the trend qualitatively.",
  "prediction": "1-2 paragraphs predicting upcoming weekend/week performance based on current trend.",
  "industryImpact": "1 paragraph on what this film's performance means for the wider Ollywood (Odia film industry) — e.g. theatre footfalls, confidence in the genre, impact on upcoming Odia releases.",
  "futureOutlook": "1-2 paragraphs on the film's likely box office path from here — upcoming milestones, competition from other releases, or OTT timing if relevant.",
  "finalVerdict": "2-3 sentences summarising the film's box office status after Day ${actualDay}. Do NOT use words like Hit, Flop, Average, Super-Hit — just describe the collection factually.",
  "weekOneTwoComparison": "ONLY if day >= 14: 1-2 paragraphs comparing week-one and week-two totals, the drop percentage, and what it reveals about the audience type. Leave empty string if day < 14.",
  "festivalImpact": "ONLY if a festival was mentioned in CONTEXT: 1 paragraph on how the festival season has affected footfalls, family audience turnout, and occupancy. Leave empty string if no festival context."
}

Rules:
- All values must be plain text only — no HTML, no bullet points, no markdown
- Write for an Odia cinema (Ollywood) audience
- Keep each section concise but informative
- Make this article meaningfully different from a generic "Day N" template — lean into today's specific context listed above
- Do not invent or fabricate collection figures — only use the data provided above`;

  let aiRawText = "";
  const groqKey = process.env.GROQ_API_KEY || "";
  if (groqKey) {
    try {
      const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 2200,
          temperature: 0.7,
          top_p: 0.9,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: getDayStageSystemPrompt,
            },
            { role: "user", content: aiPrompt },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (groqRes.ok) {
        const gr = await groqRes.json();
        aiRawText = (gr?.choices?.[0]?.message?.content || "").trim();
      }
    } catch { /* AI failed — fallback sections used below */ }
  }

  const sections = parseAiSections(aiRawText, movie, actualDay, totalNet, totalGrossNum, dayTags, sortedDays, dayClassification);

  // ─────────────────────────────────────────────────────────────────────────
  //  §7  BUILD SEO KEYWORDS (same logic as BoxOfficePanel.buildKeywordsArr)
  // ─────────────────────────────────────────────────────────────────────────

  const kw = [];
  kw.push(
    `${movieName} Odia Movie`, `${movieName} Movie Details`, `${movieName} Cast`,
    `${movieName} Cast and Crew`, `${movieName} Story`, `${movieName} Review`,
    `${movieName} Trailer`, `${movieName} Teaser`, `${movieName} Songs`, `${movieName} Music`,
    `${movieName} Release Date`,
    `${movieName} Box Office Collection`, `${movieName} Day ${actualDay} Collection`,
    `${movieName} Day ${actualDay} Box Office Collection`, `${movieName} Total Collection`,
    `${movieName} Total Box Office Collection`, `${movieName} Gross Collection`,
    `${movieName} Net Collection`, `${movieName} Opening Day Collection`,
    `${movieName} First Day Collection`, `${movieName} Week 1 Collection`,
    `${movieName} Box Office Report`, `${movieName} Box Office Prediction`,
    `${movieName} Worldwide Collection`, `${movieName} Audience Response`,
    `${movieName} Movie Update`, `${movieName} Latest News`, `${movieName} Movie Collection`,
    year ? `${movieName} (${year})` : null,
    year ? `${movieName} (${year}) Box Office Collection` : null,
    year ? `${movieName} (${year}) Total Collection` : null,
  );
  if (directorName) kw.push(directorName, `${directorName} Movie`, `${directorName} Odia Movie`, `${directorName} Director`);
  if (producerName) kw.push(producerName, `${producerName} Producer`);
  leadActors.forEach(a => kw.push(a, `${a} Movie`, `${a} Odia Movie`));
  leadActresses.forEach(a => kw.push(a, `${a} Movie`, `${a} Odia Movie`));
  if (musicDirector) kw.push(musicDirector, `${musicDirector} Music Director`);
  if (writer) kw.push(writer, `${writer} Writer`);
  if (dop) kw.push(dop, `${dop} Cinematographer`);
  if (editor) kw.push(editor, `${editor} Editor`);
  genreArr.forEach(g => kw.push(`${g} Odia Movie`, `Odia ${g} Film`));
  kw.push(
    "Odia Movie Collection", "Odia Movie Details", "Odia Movie Cast", "Odia Movie Review",
    "Odia Movie Trailer", "Odia Movie Release Date", "Odia Movie Box Office",
    "Odia Box Office Collection", "Ollywood Box Office Collection", "Ollywood Movie Collection",
    "Ollywood Movie Details", "Ollywood News", "Latest Odia Movie News", "Odia Cinema News",
    "Odia Film Industry", "Trending Odia Movie",
    year ? `New Odia Movie ${year}` : "New Odia Movie",
    "Best Odia Movies", "Ollywood Updates",
  );
  const keywordsStr = kw.filter(Boolean).join(",\n");

  // ─────────────────────────────────────────────────────────────────────────
  //  §8  BUILD HASHTAGS
  // ─────────────────────────────────────────────────────────────────────────

  const tags = [
    `#${movieNameNoSp}`, `#${movieNameNoSp}Collection`, `#${movieNameNoSp}BoxOffice`,
    `#${movieNameNoSp}Day${actualDay}`,
    directorName ? `#${directorName.replace(/\s+/g, "")}` : null,
    producerName ? `#${producerName.replace(/\s+/g, "")}` : null,
    musicDirector ? `#${musicDirector.replace(/\s+/g, "")}` : null,
    ...leadActors.map(a => `#${a.replace(/\s+/g, "")}`),
    ...leadActresses.map(a => `#${a.replace(/\s+/g, "")}`),
    "#OdiaMovie", "#Ollywood", "#OdiaCinema", "#Ollypedia",
    "#BoxOfficeCollection", "#OllywoodBoxOffice", "#OllywoodNews",
    year ? `#OdiaMovie${year}` : null,
  ].filter(Boolean);

  const tagChips = tags
    .map(t => `<span class="tag-chip" style="display:inline-block;background:#1e1e1e;color:#c9973a;border:1px solid #3a2800;border-radius:20px;padding:4px 13px;font-size:0.78rem;font-weight:600;margin:2px;">${t}</span>`)
    .join("\n    ");

  // ─────────────────────────────────────────────────────────────────────────
  //  §9  BUILD MOVIE INFO TABLE ROWS
  // ─────────────────────────────────────────────────────────────────────────

  const infoRows = [
    ["Movie Name", movieName],
    ["Language", "Odia"],
    ["Industry", "Ollywood"],
    ["Genre", genre],
    releaseDateFmt ? ["Release Date", releaseDateFmt] : null,
    directorName ? ["Director", directorName] : null,
    producerName ? ["Producer", producerName] : null,
    musicDirector ? ["Music Director", musicDirector] : null,
    writer ? ["Writer", writer] : null,
    dop ? ["Cinematographer", dop] : null,
    editor ? ["Editor", editor] : null,
    leadActors.length ? ["Cast", leadActors.join(", ")] : null,
    leadActresses.length ? ["Actress", leadActresses.join(", ")] : null,
    movie.budget ? ["Budget", movie.budget] : null,
  ].filter(Boolean);

  // ─────────────────────────────────────────────────────────────────────────
  //  §10  BUILD STRUCTURED DATA TABLE (with cumulative + trend)
  // ─────────────────────────────────────────────────────────────────────────

  const parseNum = (s) => parseToRupeesGlobal(s);

  let cumulativeNet = 0, cumulativeGross = 0;
  const dataTableRows = sortedDays.map((d, i) => {
    const netNum = parseNum(d.net);
    const grossNum = parseNum(d.gross);
    cumulativeNet += netNum;
    cumulativeGross += grossNum;

    const prevNetNum = i > 0 ? parseNum(sortedDays[i - 1].net) : null;
    let trendHtml = "";
    if (prevNetNum !== null && prevNetNum > 0 && netNum > 0) {
      const pctChange = ((netNum - prevNetNum) / prevNetNum) * 100;
      const isUp = pctChange >= 0;
      trendHtml = `<span style="display:inline-block;background:${isUp ? "rgba(40,120,60,0.25)" : "rgba(180,40,40,0.25)"};color:${isUp ? "#5dba7d" : "#e07070"};border-radius:4px;padding:2px 7px;font-size:0.72rem;font-weight:700;">
        ${isUp ? "▲" : "▼"} ${Math.abs(pctChange).toFixed(1)}%
      </span>`;
    } else if (i === 0) {
      trendHtml = `<span style="display:inline-block;background:rgba(201,151,58,0.2);color:#c9973a;border-radius:4px;padding:2px 7px;font-size:0.72rem;font-weight:700;">Opening</span>`;
    }

    const isToday = d.day === actualDay;
    const dateStr = d.date
      ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : "—";

    return `
    <tr style="background:${isToday ? "rgba(201,151,58,0.05)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)")};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isToday ? "#c9973a" : "#aaa"};font-weight:700;white-space:nowrap;">
        Day ${d.day}${isToday ? ` <span style="font-size:0.65rem;background:rgba(201,151,58,0.2);color:#c9973a;padding:1px 6px;border-radius:4px;vertical-align:middle;">Latest</span>` : ""}
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">${dateStr}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isToday ? "#c9973a" : "#ddd"};font-weight:700;">${d.net ? formatINR(parseToRupees(d.net)) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#7ec8e3;font-weight:600;">${d.gross ? formatINR(parseToRupees(d.gross)) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#c9973a;font-weight:700;">${formatINR(cumulativeNet)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;">${trendHtml}</td>
    </tr>`;
  }).join("");

  // ─────────────────────────────────────────────────────────────────────────
  //  §12  STYLE SHORTHAND (same as BoxOfficePanel)
  // ─────────────────────────────────────────────────────────────────────────

  const card = `background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:26px;`;
  const h2 = `font-size:1.05rem;font-weight:800;color:#ff6b00;border-left:4px solid #ff6b00;padding-left:12px;margin:0 0 20px;line-height:1.3;`;
  const h3 = `font-size:0.85rem;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.09em;margin:0 0 12px;`;
  const tdL = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.87rem;width:42%;vertical-align:top;`;
  const tdR = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;font-weight:600;`;
  const th = `padding:11px 14px;background:#1f1f1f;color:#888;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;text-align:left;border-bottom:2px solid #2a2a2a;`;

  // Prev / Next slugs
  const prevSlug = slugify(`${movieName}${year ? ` (${year})` : ""} day ${actualDay - 1} box office collection`);
  const nextSlug = slugify(`${movieName}${year ? ` (${year})` : ""} day ${actualDay + 1} box office collection`);
  const prevDayLabel = `${movieName} Day ${actualDay - 1}`;
  const nextDayLabel = `${movieName} Day ${actualDay + 1}`;

  // ─────────────────────────────────────────────────────────────────────────
  //  §12b  DAY-STAGE CONTENT HELPERS
  //  Computed from existing in-memory data — no new DB calls, no schema changes.
  //  These variables are interpolated into §13 blogContent template.
  // ─────────────────────────────────────────────────────────────────────────

  // Day-stage AI system prompt — varies editorial persona + bans AI clichés
  const getDayStageSystemPrompt = (() => {
    const _ts = new Set(dayTags);
    const _anti = `Forbidden phrases — never write: "it is worth noting", "it is important to note", "needless to say", "in conclusion", "in summary", "it goes without saying", "delve into", "dive deep", "leverage", "in the realm of", "as we know", "at the end of the day". Never start two consecutive sentences with the same word. Avoid passive constructions such as "it has been observed" or "it can be seen". Every paragraph must open with something other than the film title. Mix short punchy sentences with longer analytical ones. Reference specific Odia cities (Bhubaneswar, Cuttack, Sambalpur, Berhampur, Rourkela) when discussing audience patterns. Write as a journalist who personally tracked the footfalls — not someone reading a spreadsheet.`;
    if (actualDay === 1)
      return `You are a senior Odia entertainment journalist writing the Opening Day box office report for Ollypedia — the most-read article in any film's box office series. Write with the energy of a reporter who just returned from the cinema hall. Thousands of Odia cinema fans want to know if this film delivered on opening day. Your writing must feel human, warm, and editorially authoritative. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML. ${_anti}`;
    if (actualDay <= 3 || _ts.has("opening-weekend"))
      return `You are a senior Odia film trade analyst writing the Opening Weekend verdict for Ollypedia. Think like someone who personally monitored footfalls at cinemas across Bhubaneswar, Cuttack, and Sambalpur this weekend. Opening weekend numbers decide how exhibitors treat this film in the weeks ahead — write with that commercial urgency and insider intelligence. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML. ${_anti}`;
    if (actualDay === 7 || _ts.has("first-week-closing"))
      return `You are writing the definitive First Week closing verdict for Ollypedia. This is a considered editorial, not a collection note — give your honest, nuanced professional assessment of what week-one performance means for the filmmakers, the cast, and Odia cinema broadly. Write it with the weight it deserves. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML. ${_anti}`;
    if (actualDay <= 14 || _ts.has("second-week-closing"))
      return `You are a film trade journalist writing the second-week box office analysis for Ollypedia. The opening buzz has settled — this is about whether the film has genuine audience legs. Compare the week-two trend to week-one with real editorial judgment. Your reader is a sophisticated Odia cinema follower who will instantly spot generic filler. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML. ${_anti}`;
    if (_ts.has("golden-run"))
      return `You are covering a historic moment in Odia cinema — a film crossing 50 days in theatres. Write with the gravitas this achievement deserves. This is a landmark editorial piece, not a daily collection note, and it will be widely shared and cited. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML. ${_anti}`;
    if (_ts.has("silver-jubilee-run") || _ts.has("extended-run") || actualDay >= 15)
      return `You are writing about an Odia film that has defied industry expectations and is still drawing audiences weeks into its run. Write with genuine editorial admiration for its staying power — sustained theatrical runs are rare in Ollywood and deserve analysis that goes beyond day-on-day number comparisons. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML. ${_anti}`;
    return `You are a senior Odia entertainment journalist writing a box office update for Ollypedia. Write with the authority of someone who deeply understands both the commercial mechanics and cultural significance of Odia cinema. Every sentence must earn its place — no filler, no obvious observations, no AI-pattern phrasing. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML. ${_anti}`;
  })();

  // Day-stage H2 headings — 8 distinct ranges so no two day-stage blogs share headings
  const headings = (() => {
    const _ts = new Set(dayTags);
    if (actualDay === 1) return {
      boxOfficeAnalysis: `Opening Day at the Odia Box Office`,
      weekendWeekday: `Day 1 Footfalls — What the Numbers Signal`,
      audienceResponse: `First Impressions — Audience Reaction on Opening Day`,
      occupancy: `Theatre Occupancy on Opening Day`,
      performance: `Opening Day Performance in Context`,
      industryImpact: `What This Opening Means for Ollywood`,
      outlook: `Heading Into the Weekend — The Week Ahead`,
      verdict: `Opening Day Verdict`,
    };
    if (actualDay <= 3 || _ts.has("opening-weekend")) return {
      boxOfficeAnalysis: `Opening Weekend — The Box Office Story So Far`,
      weekendWeekday: `Weekend Momentum — How Each Day Has Tracked`,
      audienceResponse: `Opening Weekend Audience Buzz`,
      occupancy: `Weekend Occupancy Across Odisha`,
      performance: `Opening Weekend in Numbers`,
      industryImpact: `What This Opening Weekend Signals for Odia Cinema`,
      outlook: `Heading Into the Weekdays`,
      verdict: `Opening Weekend Verdict`,
    };
    if (actualDay >= 4 && actualDay <= 6) return {
      boxOfficeAnalysis: `Weekday Hold — How ${movieName} Is Pacing`,
      weekendWeekday: `Weekdays vs Opening Weekend — The Real Test`,
      audienceResponse: `Word of Mouth — What's Driving Tickets Midweek`,
      occupancy: `Weekday Occupancy Trends`,
      performance: `Weekday Performance Assessment`,
      industryImpact: `What the Weekday Hold Tells the Odia Film Trade`,
      outlook: `Approaching the First Week Close`,
      verdict: `Weekday Hold Verdict`,
    };
    if (actualDay === 7 || _ts.has("first-week-closing")) return {
      boxOfficeAnalysis: `The First Week Story — Day by Day`,
      weekendWeekday: `Opening Weekend vs Weekdays — The Week-One Arc`,
      audienceResponse: `One Week of Audience Reaction — The Honest Picture`,
      occupancy: `Week-One Occupancy — How Full Were Odisha's Halls?`,
      performance: `First Week Performance — A Complete Breakdown`,
      industryImpact: `What ${movieName}'s First Week Means for Odia Cinema`,
      outlook: `Second Week Outlook — Will the Momentum Hold?`,
      verdict: `First Week Closing Verdict`,
    };
    if (actualDay <= 14) return {
      boxOfficeAnalysis: `Second Week — Separating Genuine Pull from Opening Buzz`,
      weekendWeekday: `Second Weekend vs First Weekend — The Drop Decoded`,
      audienceResponse: `Who's Still Watching? The Second-Week Audience Profile`,
      occupancy: `Second Week Occupancy Across Odisha`,
      performance: `Week Two vs Week One — The Numbers`,
      industryImpact: `Second Week Signals for the Odia Film Trade`,
      outlook: `Third Week and the Lifetime Collection Path`,
      verdict: `Second Week Verdict`,
    };
    if (actualDay <= 21) return {
      boxOfficeAnalysis: `Third Week Theatrical Stamina`,
      weekendWeekday: `Three Weekends In — The Pattern That Has Emerged`,
      audienceResponse: `Loyal Audiences — Who Is Still Filling the Seats`,
      occupancy: `Third Week Occupancy — The Long Tail`,
      performance: `Three Weeks at the Odia Box Office`,
      industryImpact: `What a Three-Week Run Tells Ollywood`,
      outlook: `Lifetime Collection Forecast`,
      verdict: `Third Week Verdict`,
    };
    if (actualDay <= 30) return {
      boxOfficeAnalysis: `Extended Run — What's Keeping ${movieName} in Theatres`,
      weekendWeekday: `Weekend vs Weekday Deep in the Run`,
      audienceResponse: `The Repeat Viewer Effect — A Month In`,
      occupancy: `Late-Run Occupancy — Single Screens Leading the Way`,
      performance: `Four Weeks at the Odia Box Office`,
      industryImpact: `An Extended Run and Its Significance for Ollywood`,
      outlook: `The Final Stretch of the Theatrical Run`,
      verdict: `Extended Run Verdict`,
    };
    return {
      boxOfficeAnalysis: `Theatrical Longevity — The ${movieName} Story`,
      weekendWeekday: `Weekend Collections Deep Into the Run`,
      audienceResponse: `A Devoted Audience — The Community Around This Film`,
      occupancy: `Long-Run Occupancy — A Different Kind of Success`,
      performance: `A Remarkable Theatrical Run, by the Numbers`,
      industryImpact: `What ${movieName}'s Run Teaches Odia Cinema`,
      outlook: `Legacy Collection and What Lies Ahead`,
      verdict: `Long-Run Theatrical Verdict`,
    };
  })();

  // Day-stage SEO meta description (160 char limit)
  const seoDescDynamic = (() => {
    const _ts = new Set(dayTags);
    const _f = `${movieName}${year ? ` (${year})` : ""}`;
    if (actualDay === 1)
      return `${_f} opens at the Odia box office! Day 1 collection: ${dayNet} net. Opening day analysis, audience reaction, and first impressions on Ollypedia.`.slice(0, 160);
    if (actualDay <= 3 || _ts.has("opening-weekend"))
      return `${_f} Opening Weekend: ${totalNetStr} net over ${actualDay} days. Day-wise breakdown, occupancy, and audience verdict from the Odia box office on Ollypedia.`.slice(0, 160);
    if (actualDay >= 4 && actualDay <= 6)
      return `${_f} Day ${actualDay}: ${totalNetStr} total net. Weekday hold analysis, word-of-mouth verdict, and box office performance on Ollypedia.`.slice(0, 160);
    if (actualDay === 7 || _ts.has("first-week-closing"))
      return `${_f} First Week Verdict: ${totalNetStr} net in 7 days. Complete day-wise breakdown, first week analysis, and Week 2 outlook on Ollypedia.`.slice(0, 160);
    if (actualDay <= 14)
      return `${_f} enters Week 2 with ${totalNetStr} cumulative net. Week-on-week analysis and Odia box office verdict on Ollypedia.`.slice(0, 160);
    if (_ts.has("silver-jubilee-run"))
      return `${_f} Silver Jubilee Run — 25 days in theatres! Total ${totalNetStr} net. Extended run analysis and longevity report on Ollypedia.`.slice(0, 160);
    if (_ts.has("golden-run"))
      return `${_f} Golden Jubilee — 50 days in theatres! Total ${totalNetStr} net. Historic theatrical run landmark report on Ollypedia.`.slice(0, 160);
    return `${_f} Day ${actualDay}: ${totalNetStr} net total at the Odia box office. Day-wise breakdown, audience analysis, and performance verdict on Ollypedia.`.slice(0, 160);
  })();

  // Callout box variables (day-stage specific emoji, label, body)
  const _calloutEmoji = (() => {
    const _ts = new Set(dayTags);
    if (actualDay === 1) return "🎬";
    if (actualDay <= 3 || _ts.has("opening-weekend")) return "🎉";
    if (actualDay === 7 || _ts.has("first-week-closing")) return "🏁";
    if (actualDay <= 14) return "📈";
    if (dayTags.some(t => t.startsWith("milestone-"))) return "🏆";
    if (_ts.has("silver-jubilee-run") || _ts.has("golden-run")) return "🥈";
    return "📊";
  })();
  const _calloutLabel = (() => {
    const _ts = new Set(dayTags);
    if (actualDay === 1) return "Opening Day";
    if (actualDay <= 3 || _ts.has("opening-weekend")) return "Opening Weekend";
    if (actualDay === 7 || _ts.has("first-week-closing")) return "One Week Complete";
    if (actualDay <= 14) return "Second Week Watch";
    if (dayTags.some(t => t.startsWith("milestone-"))) return "Milestone Crossed";
    if (_ts.has("silver-jubilee-run")) return "Silver Jubilee Run";
    if (_ts.has("golden-run")) return "Golden Jubilee Run";
    return "Box Office Update";
  })();
  const _calloutBody = (() => {
    const _ts = new Set(dayTags);
    if (actualDay === 1)
      return `The box office doors have opened for <strong style="color:#fff;">${movieName}</strong>. Day 1 net stands at <strong style="color:#c9973a;">${dayNet}</strong>. The cumulative total builds from here.`;
    if (actualDay <= 3 || _ts.has("opening-weekend"))
      return `<strong style="color:#fff;">${movieName}</strong> is mid-opening weekend. Running total: <strong style="color:#c9973a;">${totalNetStr} net</strong> and <strong style="color:#7ec8e3;">${totalGrossStr} gross</strong> after ${actualDay} day${actualDay !== 1 ? "s" : ""}.`;
    if (actualDay === 7 || _ts.has("first-week-closing"))
      return `<strong style="color:#fff;">${movieName}</strong> completes its first week. Total: <strong style="color:#c9973a;">${totalNetStr} net</strong> and <strong style="color:#7ec8e3;">${totalGrossStr} gross</strong> in 7 days — the full picture is below.`;
    if (actualDay <= 14)
      return `The opening buzz has settled. <strong style="color:#fff;">${movieName}</strong> carries <strong style="color:#c9973a;">${totalNetStr} net</strong> into its second week. Now the real test begins.`;
    if (_ts.has("silver-jubilee-run") || _ts.has("golden-run"))
      return `Day ${actualDay}, and <strong style="color:#fff;">${movieName}</strong> is still running in Odia theatres. Cumulative: <strong style="color:#c9973a;">${totalNetStr} net</strong> and <strong style="color:#7ec8e3;">${totalGrossStr} gross</strong>.`;
    return `<strong style="color:#fff;">${movieName}</strong> has collected an estimated <strong style="color:#c9973a;">${totalNetStr} net</strong> and <strong style="color:#7ec8e3;">${totalGrossStr} gross</strong> after <strong style="color:#fff;">${actualDay} day${actualDay !== 1 ? "s" : ""}</strong> in theatres.${totalNet >= 1_00_00_000 ? ` The film has crossed the <strong style="color:#c9973a;">&#8377;${(totalNet / 1_00_00_000).toFixed(0)} Cr mark</strong> at the Odia box office.` : ""}`;
  })();

  // Day Hold % mini-card (Days 4–14 only, requires Day 1 data)
  const _holdPercentBlock = (() => {
    if (actualDay < 4 || actualDay > 14 || sortedDays.length < 2) return "";
    const _d1 = sortedDays.find(d => d.day === 1);
    const _dToday = sortedDays.find(d => d.day === actualDay);
    if (!_d1 || !_dToday) return "";
    const _d1Net = parseToRupees(_d1.net || "0");
    const _dTodayNet = parseToRupees(_dToday.net || "0");
    if (!_d1Net || !_dTodayNet) return "";
    const _holdPct = Math.round((_dTodayNet / _d1Net) * 100);
    const _hColor = _holdPct >= 70 ? "#5dba7d" : _holdPct >= 45 ? "#c9973a" : "#e07070";
    const _hNote = _holdPct >= 70
      ? "Strong hold — word-of-mouth is carrying this film effectively."
      : _holdPct >= 45
        ? "Healthy hold — within the expected range for well-received Odia releases."
        : "Standard midweek drop — footfalls settling after the opening rush.";
    return `<div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:16px 20px;margin-bottom:22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
  <div style="text-align:center;min-width:72px;">
    <div style="font-size:1.8rem;font-weight:900;color:${_hColor};">${_holdPct}%</div>
    <div style="font-size:0.6rem;color:#555;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px;">Day ${actualDay} Hold</div>
  </div>
  <div style="flex:1;min-width:160px;">
    <div style="font-size:0.82rem;font-weight:700;color:#ddd;margin-bottom:4px;">Hold vs Opening Day (${formatINR(_d1Net)})</div>
    <div style="font-size:0.78rem;color:#888;line-height:1.5;">${_hNote}</div>
  </div>
</div>`;
  })();

  // First Week Scorecard (Day 7 only, requires all 7 days)
  const _firstWeekCard = (() => {
    if (actualDay !== 7) return "";
    const _w1 = sortedDays.filter(d => d.day <= 7);
    if (_w1.length < 7) return "";
    const _w1Net = _w1.reduce((s, d) => s + parseToRupees(d.net || "0"), 0);
    const _w1Avg = Math.round(_w1Net / _w1.length);
    const _best = [..._w1].sort((a, b) => parseToRupees(b.net || "0") - parseToRupees(a.net || "0"))[0];
    const _d1n = parseToRupees(_w1[0]?.net || "0");
    const _d7n = parseToRupees(_w1[_w1.length - 1]?.net || "0");
    const _hp = _d1n > 0 ? Math.round((_d7n / _d1n) * 100) : 0;
    const _hpColor = _hp >= 40 ? "#5dba7d" : "#e07070";
    return `<section style="${card}">
  <h2 style="${h2}">First Week Scorecard — ${movieName}</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-bottom:18px;">
    <div style="background:#1a1200;border:1px solid #2e2000;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.6rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Week 1 Total</div>
      <div style="font-size:1.1rem;font-weight:800;color:#c9973a;">${formatINR(_w1Net)}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.6rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Daily Average</div>
      <div style="font-size:1.1rem;font-weight:800;color:#fff;">${formatINR(_w1Avg)}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.6rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Best Day</div>
      <div style="font-size:1.1rem;font-weight:800;color:#5dba7d;">Day ${_best?.day}</div>
      <div style="font-size:0.7rem;color:#666;">${formatINR(parseToRupees(_best?.net || "0"))}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.6rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Day 7 Hold</div>
      <div style="font-size:1.1rem;font-weight:800;color:${_hpColor};">${_hp}%</div>
      <div style="font-size:0.7rem;color:#666;">vs Day 1</div>
    </div>
  </div>
  <p style="color:#888;font-size:0.82rem;line-height:1.7;margin:0;">A Day 7 hold of ${_hp}% against opening day is ${_hp >= 55 ? "solid for an Odia release — this film has genuine legs heading into Week 2" : _hp >= 35 ? "within the normal range for Odia theatrical runs at this stage" : "a signal that Week 2 will depend heavily on fresh competition and screen availability"}.</p>
</section>`;
  })();

  // OTT Countdown strip (only when OTT premiere within 7 days)
  const _ottCountdown = (() => {
    if (!dayTags.includes("approaching-ott") || !movie.ottReleaseDate) return "";
    const _ottD = new Date(movie.ottReleaseDate);
    const _curD = new Date(yesterdayStr);
    if (isNaN(_ottD.getTime())) return "";
    const _dLeft = Math.max(0, Math.round((_ottD - _curD) / (1000 * 60 * 60 * 24)));
    const _plat = movie.streamingOn || "OTT";
    return `<div style="background:linear-gradient(90deg,#0a1628 0%,#111 100%);border:1px solid #1a3050;border-radius:12px;padding:16px 20px;margin-bottom:22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
  <div style="text-align:center;min-width:64px;">
    <div style="font-size:1.8rem;font-weight:900;color:#7ec8e3;">${_dLeft}</div>
    <div style="font-size:0.6rem;color:#445;text-transform:uppercase;letter-spacing:0.08em;">Days Left</div>
  </div>
  <div style="flex:1;min-width:160px;">
    <div style="font-size:0.85rem;font-weight:700;color:#7ec8e3;margin-bottom:3px;">📺 OTT Premiere Approaching — ${_plat}</div>
    <div style="font-size:0.78rem;color:#666;line-height:1.5;">The theatrical window is in its final days. Catch ${movieName} on the big screen before the digital premiere arrives.</div>
  </div>
</div>`;
  })();

  // Silver / Golden jubilee run badge
  const _extendedRunBlock = (() => {
    const _ts = new Set(dayTags);
    if (!_ts.has("silver-jubilee-run") && !_ts.has("golden-run")) return "";
    const _isGolden = _ts.has("golden-run");
    const _label = _isGolden ? `🥇 Golden Jubilee Run — ${actualDay} Days in Theatres` : `🥈 Silver Jubilee Run — ${actualDay} Days in Theatres`;
    const _color = _isGolden ? "#f5c518" : "#c9a0e8";
    const _bg = _isGolden ? "#1a1500" : "#1a0a2e";
    const _bdr = _isGolden ? "#3a3000" : "#3a1a5a";
    const _note = _isGolden
      ? `Crossing 50 days in Odia theatres is a feat achieved by very few films. ${movieName} has joined a select group of Ollywood releases with this kind of sustained audience loyalty.`
      : `Reaching 25 days in Odia theatres separates content-driven successes from one-week wonders. ${movieName} has earned this milestone through genuine audience commitment.`;
    return `<div style="background:${_bg};border:1px solid ${_bdr};border-radius:12px;padding:18px 22px;margin-bottom:22px;">
  <div style="font-size:0.85rem;font-weight:800;color:${_color};margin-bottom:8px;">${_label}</div>
  <p style="color:#aaa;font-size:0.85rem;line-height:1.7;margin:0;">${_note}</p>
</div>`;
  })();

  // ── Build editorial sections HTML in day-stage order ──────────────────────
  const _mkSec = (h2Text, bodyContent) =>
    `<section style="${card}">
  <h2 style="${h2}">${h2Text}</h2>
  ${toParagraphs(bodyContent)}
</section>`;

  const _perfSec = `<section style="${card}">
  <h2 style="${h2}">${headings.performance}</h2>
  <div class="perf-stats" style="background:#1f1800;border:1px solid #2e2000;border-radius:10px;padding:16px 20px;margin-bottom:18px;display:flex;gap:24px;flex-wrap:wrap;">
    <div><div style="font-size:0.65rem;color:#666;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">Total Net</div><div style="font-size:1.2rem;font-weight:800;color:#c9973a;">${totalNetStr}</div></div>
    <div><div style="font-size:0.65rem;color:#666;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">Total Gross</div><div style="font-size:1.2rem;font-weight:800;color:#7ec8e3;">${totalGrossStr}</div></div>
    <div><div style="font-size:0.65rem;color:#666;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">Days Tracked</div><div style="font-size:1.2rem;font-weight:800;color:#fff;">${sortedDays.length}</div></div>
  </div>
  ${toParagraphs(sections.performanceAnalysis)}
</section>`;

  const _verdictSec = `<section style="${card}">
  <h2 style="${h2}">${headings.verdict}</h2>
  <div style="border-left:4px solid #c9973a;padding-left:16px;margin-bottom:16px;">
    ${toParagraphs(sections.finalVerdict)}
  </div>
  <p style="color:#555;font-size:0.8rem;line-height:1.6;margin:0;"><em>* All collection figures are industry estimates sourced by Ollypedia Box Office Tracking via Ollypedia Tracker. Figures may differ from official studio numbers.</em></p>
</section>`;

  const _weekOneTwoSec = sections.weekOneTwoComparison ? `<section style="${card}">
  <h2 style="${h2}">Week-on-Week Performance Comparison</h2>
  ${toParagraphs(sections.weekOneTwoComparison)}
</section>` : "";

  const _festivalSec = sections.festivalImpact ? `<section style="${card}">
  <h2 style="${h2}">Festival Season Impact — ${dayClassification.festival}</h2>
  ${toParagraphs(sections.festivalImpact)}
</section>` : "";

  const _sectMap = {
    analysis: _mkSec(headings.boxOfficeAnalysis, sections.boxOfficeAnalysis),
    weekendWeekday: _mkSec(headings.weekendWeekday, sections.weekendWeekdayComparison),
    audience: _mkSec(headings.audienceResponse, sections.audienceResponse),
    occupancy: _mkSec(headings.occupancy, sections.occupancyTrend),
    perf: _perfSec,
    industry: _mkSec(headings.industryImpact, sections.industryImpact),
    outlook: _mkSec(headings.outlook, (sections.prediction || "") + "\n\n" + (sections.futureOutlook || "")),
  };

  const _editorialOrder = (() => {
    const _ts = new Set(dayTags);
    if (actualDay === 1)
      return ["analysis", "audience", "occupancy", "industry", "perf", "weekendWeekday", "outlook"];
    if (actualDay <= 3 || _ts.has("opening-weekend"))
      return ["audience", "analysis", "weekendWeekday", "occupancy", "perf", "industry", "outlook"];
    if (actualDay >= 4 && actualDay <= 6)
      return ["weekendWeekday", "analysis", "occupancy", "audience", "perf", "industry", "outlook"];
    if (actualDay === 7 || _ts.has("first-week-closing"))
      return ["analysis", "perf", "audience", "industry", "weekendWeekday", "occupancy", "outlook"];
    if (actualDay <= 14)
      return ["analysis", "audience", "weekendWeekday", "occupancy", "perf", "industry", "outlook"];
    return ["analysis", "industry", "audience", "perf", "weekendWeekday", "occupancy", "outlook"];
  })();

  const editorialSectionsHtml = [
    _extendedRunBlock,
    _holdPercentBlock,
    ..._editorialOrder.map(k => _sectMap[k] || ""),
    _weekOneTwoSec,
    _festivalSec,
    _firstWeekCard,
    _ottCountdown,
    _verdictSec,
  ].filter(Boolean).join("\n\n");

  // ─────────────────────────────────────────────────────────────────────────
  //  §13  ASSEMBLE FULL BLOG HTML (exact BoxOfficePanel structure)
  // ─────────────────────────────────────────────────────────────────────────

  const blogContent = `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection and collected ${totalGrossStr} gross | Ollypedia
  description:    ${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection: Collected ${totalNetStr} net and ${totalGrossStr} gross in ${actualDay} day${actualDay !== 1 ? "s" : ""}. Complete day-wise breakdown, audience response, performance analysis & predictions on Ollypedia.
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${blogSlug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection and collected ${totalGrossStr} gross | Ollypedia
  og:description: ${movieName} has collected ${totalNetStr} net and ${totalGrossStr} gross after ${actualDay} days. Full report on Ollypedia. Complete day-wise breakdown, audience response, performance analysis & predictions on Ollypedia.
  og:url:         ${SITE_URL}/blog/${blogSlug}
  og:image:       ${movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || `${SITE_URL}/logo.png`}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${yesterdayStr}
  article:modified_time:  ${todayStr}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection | Ollypedia
  twitter:description: ${movieName} Day ${actualDay} — Net ${dayNet}, Total ${totalNetStr}. Full breakdown on Ollypedia.
  twitter:image:  ${movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || `${SITE_URL}/logo.png`}
  twitter:image:alt: ${movieName} Box Office Collection
════════════════════════════════════════════════════════════════ -->

<!-- ─────────────────────────────────────────────
  JSON-LD SCHEMA — NewsArticle + Movie + BreadcrumbList + FAQPage
───────────────────────────────────────────── -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": "${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection and collected ${totalGrossStr} gross",
      "description": "${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection: Collected ${totalNetStr} net and ${totalGrossStr} gross in ${actualDay} day${actualDay !== 1 ? "s" : ""}.",
      "datePublished": "${yesterdayStr}",
      "dateModified":  "${todayStr}",
      "inLanguage": "en",
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}",
                     "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" } },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${blogSlug}" },
      "about": {
        "@type": "Movie",
        "name":       "${movieName}",
        "url": "${SITE_URL}${boxOfficeUrl}",
        "inLanguage": "Odia",
        "genre":      "${genre}"${releaseDateFmt ? `,
        "datePublished": "${releaseDateFmt}"` : ""}${directorName ? `,
        "director": { "@type": "Person", "name": "${directorName}" }` : ""}${producerName ? `,
        "producer": { "@type": "Person", "name": "${producerName}" }` : ""}${leadActors.length ? `,
        "actor": [${leadActors.map(a => `{ "@type": "Person", "name": "${a}" }`).join(", ")}]` : ""}
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home",        "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office",  "item": "${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": "${movieName}","item": "${SITE_URL}${boxOfficeUrl}" },
        { "@type": "ListItem", "position": 4, "name": "Day ${actualDay} Collection", "item": "${SITE_URL}/blog/${blogSlug}" }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the total box office collection of ${movieName}${year ? ` (${year})` : ""}?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "As of Day ${actualDay}, ${movieName} has collected a total of ${totalNetStr} net and ${totalGrossStr} gross at the Odia box office. These are industry estimates updated daily on Ollypedia."
          }
        },
        {
          "@type": "Question",
          "name": "How much did ${movieName} collect on Day ${actualDay}?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "On Day ${actualDay}, ${movieName} collected ${dayNet} net and ${dayGross} gross. The cumulative total stands at ${totalNetStr} net after ${actualDay} day${actualDay !== 1 ? "s" : ""} in theatres."
          }
        }${directorName ? `,
        {
          "@type": "Question",
          "name": "Who directed ${movieName}?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "${movieName} is directed by ${directorName}.${producerName ? ` The film is produced by ${producerName}.` : ""} It is an Odia language film released in ${year || new Date().getFullYear()} under the Ollywood banner."
          }
        }` : ""}${leadActors.length ? `,
        {
          "@type": "Question",
          "name": "Who are the lead actors in ${movieName}?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "${movieName} stars ${leadActors.join(", ")}${leadActresses.length ? ` alongside ${leadActresses.join(", ")}` : ""}.${musicDirector ? ` The music is composed by ${musicDirector}.` : ""}"
          }
        }` : ""},
        {
          "@type": "Question",
          "name": "Is ${movieName} a hit or flop at the box office?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Based on ${actualDay} day${actualDay !== 1 ? "s" : ""} of data, ${movieName} has collected ${totalNetStr} net at the Odia box office.${movie.budget ? ` The film had an estimated budget of ${movie.budget}.` : ""} Ollypedia updates collection figures daily based on industry trade estimates."
          }
        }
      ]
    }
  ]
}
</script>


<!-- MOBILE RESPONSIVE STYLES — scoped, presentation-only, no logic/SEO impact -->
<style>
.bp-article-html img,
.bp-article-html table,
.bp-article-html div,
.bp-article-html section,
.bp-article-html td,
.bp-article-html th { box-sizing: border-box; }

.bp-article-html { overflow-x: hidden; word-break: break-word; }

.bp-article-html p,
.bp-article-html span,
.bp-article-html strong,
.bp-article-html em,
.bp-article-html a,
.bp-article-html h1,
.bp-article-html h2,
.bp-article-html h3,
.bp-article-html td,
.bp-article-html th {
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

.bp-article-html img,
.bp-article-html svg,
.bp-article-html video,
.bp-article-html iframe,
.bp-article-html embed,
.bp-article-html object,
.bp-article-html canvas {
  max-width: 100%;
  height: auto;
}

.bp-article-html pre {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.bp-article-html code {
  overflow-wrap: break-word;
  word-break: break-word;
}
.bp-article-html blockquote {
  max-width: 100%;
  overflow-wrap: break-word;
  word-break: break-word;
}

.bp-article-html table { max-width: 100%; }

.bp-article-html .tbl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

@media (max-width: 640px) {
  .bp-article-html .hero-section {
    padding: 20px 16px 18px !important;
  }
  .bp-article-html section[style*="background:#181818"],
  .bp-article-html section[style*="background: #181818"] {
    padding: 18px 14px !important;
  }
  .bp-article-html section[style*="background:#111"] {
    padding: 16px 14px !important;
  }
  .bp-article-html .stat-chips {
    grid-template-columns: 1fr 1fr !important;
  }
  .bp-article-html .perf-stats {
    flex-direction: column !important;
    gap: 12px !important;
  }
  .bp-article-html nav[aria-label="Day navigation"] {
    flex-direction: column !important;
  }
  .bp-article-html .info-table td:first-child {
    width: 38% !important;
    font-size: 0.8rem !important;
  }
  .bp-article-html .data-table td,
  .bp-article-html .data-table th {
    padding: 8px 8px !important;
    font-size: 0.78rem !important;
  }
  .bp-article-html .bar-table td {
    padding: 8px 8px !important;
  }
  .bp-article-html .also-read-grid {
    grid-template-columns: 1fr !important;
  }
  .bp-article-html .tag-chip {
    font-size: 0.7rem !important;
    padding: 3px 10px !important;
  }
  .bp-article-html .cta-btn {
    display: block !important;
    width: 100% !important;
    box-sizing: border-box !important;
    text-align: center !important;
  }
  .bp-article-html .faq-section {
    padding: 18px 14px !important;
  }
}

@media (max-width: 400px) {
  .bp-article-html .stat-chips {
    grid-template-columns: 1fr !important;
  }
  .bp-article-html h1 {
    font-size: 1.1rem !important;
  }
}
</style>

<!-- BREADCRUMB + TIMESTAMP (standalone, before hero — matches BoxOfficePanel structure) -->
<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="${boxOfficeUrl}" style="color:#777;text-decoration:none;">${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#c9973a;">Day ${actualDay} Collection</span>
  </nav>
  <time datetime="${yesterdayStr}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: ${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>


<!-- HERO SECTION -->
<div class="hero-section" style="background:linear-gradient(135deg,#1a0e00 0%,#121212 100%);border:1px solid #2e2000;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">

    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#2a1500;color:#c9973a;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a2200;">📊 Box Office Report</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">Day ${actualDay} Update</span>
      ${dayClassification.milestoneCroreCrossed
      ? `<span style="display:inline-block;background:#1a2e10;color:#8fd17a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a4a1a;">🏆 ₹${dayClassification.milestoneCroreCrossed} Cr Crossed</span>`
      : dayTags.find(t => t.startsWith("milestone-") && t.includes("L"))
        ? `<span style="display:inline-block;background:#1a2e10;color:#8fd17a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a4a1a;">🏆 ${dayTags.find(t => t.startsWith("milestone-") && t.includes("L"))?.replace("milestone-", "₹")} Crossed</span>`
        : dayClassification.festival
          ? `<span style="display:inline-block;background:#1e1000;color:#e0a93a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a2800;">🎉 ${dayClassification.festival}</span>`
          : dayClassification.isWeekend
            ? `<span style="display:inline-block;background:#1e1500;color:#e0a93a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a2a00;">Weekend Collection</span>`
            : dayTags.includes("silver-jubilee-run")
              ? `<span style="display:inline-block;background:#1a0a2e;color:#c9a0e8;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a1a5a;">🥈 Silver Jubilee Run</span>`
              : ""}
      ${year ? `<span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">${year}</span>` : ""}
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      ${movieName}${year ? ` (${year})` : ""} Day ${actualDay} Box Office Collection — ${(sections.seoHeadline || blogTitle).replace(/`/g, "&#96;")}
    </h1>
    ${toParagraphs(sections.introParagraph).replace(/<p>/g, '<p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">')}
    <p style="color:#aaa;font-size:0.93rem;line-height:1.7;margin:0 0 24px;">
      According to industry trade estimates, <strong style="color:#fff;">${movieName}</strong> has collected approximately
      <strong style="color:#c9973a;">${totalNetStr} Net</strong> and
      <strong style="color:#7ec8e3;">${totalGrossStr} Gross</strong> in its first ${actualDay} day${actualDay !== 1 ? "s" : ""} of theatrical release.
      ${directorName ? `Directed by <strong style="color:#ddd;">${directorName}</strong>, the` : "The"} film has been running across Odisha${leadActors.length ? ` with <strong style="color:#ddd;">${leadActors.slice(0, 2).join(" and ")}</strong> in the lead roles.` : " with strong audience support."}
    </p>
    <div class="stat-chips" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px;margin-top:20px;">
      <div style="background:rgba(0,0,0,0.5);border:1px solid #2e2000;border-radius:10px;padding:14px 16px;">
        <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Total Net</div>
        <div style="font-size:clamp(1rem,3.5vw,1.3rem);font-weight:800;color:#c9973a;word-break:break-word;">${totalNetStr}</div>
      </div>
      <div style="background:rgba(0,0,0,0.5);border:1px solid #1a2a3a;border-radius:10px;padding:14px 16px;">
        <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Total Gross</div>
        <div style="font-size:clamp(1rem,3.5vw,1.3rem);font-weight:800;color:#7ec8e3;word-break:break-word;">${totalGrossStr}</div>
      </div>
      <div style="background:rgba(0,0,0,0.5);border:1px solid #222;border-radius:10px;padding:14px 16px;">
        <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Day ${actualDay} Net</div>
        <div style="font-size:clamp(1rem,3.5vw,1.3rem);font-weight:800;color:#fff;word-break:break-word;">${dayNet}</div>
      </div>
    </div>
</div>


<!-- KEY HIGHLIGHT CALLOUT -->
<div style="background:#180e00;border-left:4px solid #ff9800;border-radius:0 10px 10px 0;padding:14px 20px;margin-bottom:22px;">
  <strong style="color:#ff9800;">${_calloutEmoji} ${_calloutLabel}:</strong>
  <span style="color:#ccc;"> ${_calloutBody}</span>
</div>


<!-- MOVIE DETAILS TABLE -->
<section style="${card}">
  <h2 style="${h2}">${movieName} Movie Details</h2>
  <table class="info-table" style="width:100%;border-collapse:collapse;">
    <tbody>
      ${infoRows.map(([label, val]) => `
      <tr>
        <td style="${tdL}">${label}</td>
        <td style="${tdR}">${val}</td>
      </tr>`).join("")}
      <tr>
        <td style="${tdL}">Total Net Collection</td>
        <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#c9973a;font-weight:800;font-size:1.05rem;">${totalNetStr}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#888;font-size:0.87rem;width:42%;vertical-align:top;">Total Gross Collection</td>
        <td style="padding:10px 0;color:#7ec8e3;font-weight:800;font-size:1.05rem;">${totalGrossStr}</td>
      </tr>
    </tbody>
  </table>
  <div style="text-align:center;margin-top:22px;">
    <a href="${boxOfficeUrl}" class="cta-btn" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:800;font-size:0.93rem;">
      🎬 View Latest Box Office Updates
    </a>
  </div>
</section>


<!-- GRAPH 2: STRUCTURED DATA TABLE (Net · Gross · Cumulative · Trend) -->
<section style="${card}">
  <h2 style="${h2}">${movieName} Complete Box Office Data — Day-wise Breakdown</h2>
  <p style="color:#666;font-size:0.82rem;margin:0 0 18px;line-height:1.6;">
    Net · Gross · Cumulative net total after each day · Trend vs previous day
  </p>
  <div style="overflow-x:auto;">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:520px;">
      <thead>
        <tr>
          <th style="${th}">Day</th>
          <th style="${th}">Date</th>
          <th style="${th}">Net</th>
          <th style="${th}">Gross</th>
          <th style="${th}">Cumulative Net</th>
          <th style="${th}">Trend</th>
        </tr>
      </thead>
      <tbody>
        ${dataTableRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;color:#c9973a;font-weight:800;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;">
            TOTAL (${sortedDays.length} days)
          </td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;color:#c9973a;font-weight:800;font-size:1rem;">${totalNetStr}</td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;color:#7ec8e3;font-weight:800;font-size:1rem;">${totalGrossStr}</td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;color:#c9973a;font-weight:800;font-size:1rem;">${totalNetStr}</td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;"></td>
        </tr>
      </tfoot>
    </table>
  </div>
  <p style="font-size:0.72rem;color:#444;margin-top:10px;">* All figures are industry estimates sourced from Sacnilk. Subject to revision.</p>
</section>


<!-- WEEK/WEEKEND SUMMARY (rendered only from Day 7+) -->
${(() => {
      if (sortedDays.length < 7) return "";
      const week1Days = sortedDays.filter(d => d.day <= 7);
      const week1Net = week1Days.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
      const week1Avg = week1Net / week1Days.length;
      const bestDay = [...week1Days].sort((a, b) => parseToRupeesGlobal(b.net || "0") - parseToRupeesGlobal(a.net || "0"))[0];
      const worstDay = [...week1Days].sort((a, b) => parseToRupeesGlobal(a.net || "0") - parseToRupeesGlobal(b.net || "0"))[0];

      if (sortedDays.length >= 14) {
        const week2Days = sortedDays.filter(d => d.day > 7 && d.day <= 14);
        const week2Net = week2Days.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
        const dropPct = week1Net > 0 ? (((week1Net - week2Net) / week1Net) * 100).toFixed(0) : null;
        return `
<section style="${card}">
  <h2 style="${h2}">Week-by-Week Breakdown</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
    <div style="background:#1a1200;border:1px solid #2e2000;border-radius:10px;padding:16px 20px;">
      <div style="font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Week 1 Total</div>
      <div style="font-size:1.2rem;font-weight:800;color:#c9973a;">${formatINR(week1Net)}</div>
      <div style="font-size:0.72rem;color:#666;margin-top:4px;">Avg/day: ${formatINR(Math.round(week1Avg))}</div>
    </div>
    <div style="background:#0f1a2a;border:1px solid #1a2e40;border-radius:10px;padding:16px 20px;">
      <div style="font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Week 2 Total</div>
      <div style="font-size:1.2rem;font-weight:800;color:#7ec8e3;">${formatINR(week2Net)}</div>
      ${dropPct ? `<div style="font-size:0.72rem;color:${Number(dropPct) < 50 ? '#5dba7d' : '#e07070'};margin-top:4px;">Week-on-week drop: ${dropPct}%</div>` : ""}
    </div>
  </div>
</section>`;
      }

      return `
<section style="${card}">
  <h2 style="${h2}">First Week Summary</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;">
    <div style="background:#1a1200;border:1px solid #2e2000;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Week 1 Total</div>
      <div style="font-size:1.1rem;font-weight:800;color:#c9973a;">${formatINR(week1Net)}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Daily Average</div>
      <div style="font-size:1.1rem;font-weight:800;color:#fff;">${formatINR(Math.round(week1Avg))}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Best Day</div>
      <div style="font-size:1.1rem;font-weight:800;color:#5dba7d;">Day ${bestDay?.day}</div>
      <div style="font-size:0.72rem;color:#666;">${formatINR(parseToRupeesGlobal(bestDay?.net || "0"))}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Weakest Day</div>
      <div style="font-size:1.1rem;font-weight:800;color:#e07070;">Day ${worstDay?.day}</div>
      <div style="font-size:0.72rem;color:#666;">${formatINR(parseToRupeesGlobal(worstDay?.net || "0"))}</div>
    </div>
  </div>
</section>`;
    })()}


${editorialSectionsHtml}


<!-- PREV / NEXT DAY NAVIGATION -->
<nav aria-label="Day navigation" style="display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap;">
  ${actualDay > 1
      ? `<a href="/blog/${prevSlug}" rel="prev" style="flex:1;min-width:140px;display:flex;align-items:center;gap:10px;background:#181818;border:1px solid #242424;border-radius:12px;padding:14px 18px;text-decoration:none;">
    <span style="font-size:1.1rem;color:#555;">←</span>
    <div>
      <div style="font-size:0.65rem;color:#555;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Previous</div>
      <div style="font-size:0.85rem;font-weight:700;color:#aaa;">${prevDayLabel}</div>
      <div style="font-size:0.72rem;color:#555;">Box Office Collection</div>
    </div>
  </a>`
      : `<div style="flex:1;min-width:140px;"></div>`
    }
  <a href="/blog/${nextSlug}" rel="next" style="flex:1;min-width:140px;display:flex;align-items:center;justify-content:flex-end;gap:10px;background:#181818;border:1px solid #242424;border-radius:12px;padding:14px 18px;text-decoration:none;text-align:right;">
    <div>
      <div style="font-size:0.65rem;color:#555;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Next</div>
      <div style="font-size:0.85rem;font-weight:700;color:#aaa;">${nextDayLabel}</div>
      <div style="font-size:0.72rem;color:#555;">Box Office Collection</div>
    </div>
    <span style="font-size:1.1rem;color:#555;">→</span>
  </a>
</nav>


<!-- FAQ SECTION -->
<section class="faq-section" style="background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;">
  <h2 style="font-size:1.05rem;font-weight:800;color:#ff6b00;border-left:4px solid #ff6b00;padding-left:12px;margin:0 0 22px;line-height:1.3;">
    Frequently Asked Questions — ${movieName} Box Office
  </h2>

  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">
      What is the total box office collection of ${movieName}${year ? ` (${year})` : ""}?
    </h3>
    <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
      As of Day ${actualDay}, <strong style="color:#fff;">${movieName}</strong> has collected a total of
      <strong style="color:#c9973a;">${totalNetStr} net</strong> and
      <strong style="color:#7ec8e3;">${totalGrossStr} gross</strong> at the Odia box office.
      These are industry estimates and figures are updated daily on Ollypedia.
    </p>
  </div>

  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">
      How much did ${movieName} collect on Day ${actualDay}?
    </h3>
    <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
      On Day ${actualDay}, <strong style="color:#fff;">${movieName}</strong> collected
      <strong style="color:#c9973a;">${dayNet} net</strong> and
      <strong style="color:#7ec8e3;">${dayGross} gross</strong>.
      The cumulative total stands at <strong style="color:#c9973a;">${totalNetStr} net</strong> after ${actualDay} day${actualDay !== 1 ? "s" : ""} in theatres.
    </p>
  </div>

  ${directorName ? `
  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">Who directed ${movieName}?</h3>
    <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
      <strong style="color:#fff;">${movieName}</strong> is directed by <strong style="color:#ddd;">${directorName}</strong>.
      ${producerName ? `The film is produced by <strong style="color:#ddd;">${producerName}</strong>.` : ""}
      It is an Odia language film released in ${year || new Date().getFullYear()} under the Ollywood banner.
    </p>
  </div>` : ""}

  ${leadActors.length ? `
  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">Who are the lead actors in ${movieName}?</h3>
    <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
      <strong style="color:#fff;">${movieName}</strong> stars
      <strong style="color:#ddd;">${leadActors.join(", ")}</strong>${leadActresses.length ? ` alongside <strong style="color:#ddd;">${leadActresses.join(", ")}</strong>` : ""}.
      ${musicDirector ? `The music is composed by <strong style="color:#ddd;">${musicDirector}</strong>.` : ""}
    </p>
  </div>` : ""}

  <div style="padding-bottom:4px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">Is ${movieName} a hit or flop at the box office?</h3>
    <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
      Based on ${actualDay} day${actualDay !== 1 ? "s" : ""} of data, <strong style="color:#fff;">${movieName}</strong> has collected
      <strong style="color:#c9973a;">${totalNetStr} net</strong> at the Odia box office.
      ${movie.budget ? `The film had an estimated budget of <strong style="color:#ddd;">${movie.budget}</strong>.` : ""}
      A detailed performance analysis is available above. Ollypedia updates collection figures daily based on industry trade estimates.
    </p>
  </div>
</section>


<!-- ALSO READ — Internal Links -->
<section class="faq-section" style="background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;">
  <h2 style="font-size:1.05rem;font-weight:800;color:#ff6b00;border-left:4px solid #ff6b00;padding-left:12px;margin:0 0 20px;line-height:1.3;">
    Also Read
  </h2>
  <div class="also-read-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
    <a href="${boxOfficeUrl}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">📊</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} Full Box Office Report</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">All days · Running total</div>
      </div>
    </a>
    <a href="/box-office" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎬</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">Ollywood Box Office Collection</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Latest Odia movie collections</div>
      </div>
    </a>
    <a href="/movie/${movieSlug}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎭</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} — Cast, Story & Details</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Full movie info on Ollypedia</div>
      </div>
    </a>
    ${directorCastId ? `<a href="/cast/${directorCastId}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎥</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${directorName} — Profile</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Director filmography on Ollypedia</div>
      </div>
    </a>` : ""}
    ${leadActorLinks.slice(0, 2).map(a => `<a href="/cast/${a.castId}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">⭐</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${a.name} — Profile</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Filmography on Ollypedia</div>
      </div>
    </a>`).join("\n    ")}
    ${movie.streamingOn ? `<a href="/blog/${buildOttSlug(movie)}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">📺</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} OTT Release on ${movie.streamingOn}</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Streaming details & how to watch</div>
      </div>
    </a>` : ""}
    <a href="/blog?category=Box%20Office" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">📰</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">More Box Office Reports</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Latest Ollywood collection news</div>
      </div>
    </a>
    <a href="/blog?category=Box%20Office&movie=${encMovieName}"
       style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">📅</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} — All Daily Box Office Reports</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Every day tracked on Ollypedia</div>
      </div>
    </a>
    ${actualDay > 1 ? `<a href="/blog/${prevSlug}"
       style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">⬅️</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} Day ${actualDay - 1} Collection</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Previous day report</div>
      </div>
    </a>` : ""}
    ${musicDirector ? `<a href="/blog?q=${encodeURIComponent(musicDirector)}"
       style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎵</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${musicDirector} — Music</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">More films by this music director</div>
      </div>
    </a>` : ""}
  </div>
</section>


<!-- HASHTAGS -->
<section style="background:#111;border-radius:14px;padding:20px 26px;margin-bottom:22px;">
  <h2 style="font-size:0.7rem;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px;">Tags</h2>
  <div style="display:flex;flex-wrap:wrap;gap:5px;">
    ${tagChips}
  </div>
</section>


<!-- FOOTER -->
<div style="border-top:1px solid #1c1c1c;padding-top:16px;margin-top:4px;">
  <p style="color:#444;font-size:0.8rem;line-height:1.8;margin:0;">
    <strong style="color:#555;">Source:</strong> <a href="${cfg.sacnilkUrl}" target="_blank" rel="nofollow noreferrer" style="color:#555;">Sacnilk</a> via Ollypedia Box Office Tracking &nbsp;·&nbsp;
    <strong style="color:#555;">Last Updated:</strong>
    <time datetime="${todayStr}" style="color:#444;">Day ${actualDay}, ${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</time>
    &nbsp;·&nbsp; <a href="${boxOfficeUrl}" style="color:#c9973a;text-decoration:none;">View full collection report →</a><br>
    <em style="color:#3a3a3a;">All collection figures are industry estimates and may vary from official figures.</em>
  </p>
</div>`;

  // ─────────────────────────────────────────────────────────────────────────
  //  §14  CREATE OR UPDATE BLOG POST
  // ─────────────────────────────────────────────────────────────────────────

  // ── SELECTIVE BLOG PUBLISHING ─────────────────────────────────────────
  // Only Days 1, 2, 3 get standalone daily blogs.
  // Days 4+ skip blog creation; box-office data is still stored in
  // boxOfficeDays[] and shown on the Box Office page as always.
  // High-value summary blogs (First/Second/Third Week, Weekends, Milestones,
  // Silver/Golden Jubilee) are generated by triggerEventBlogs() below.
  const shouldPublishDailyBlog = (day) => day === 1 || day === 2 || day === 3;

  const seoTitle = `${movieName}${year ? ` (${year})` : ""} Day ${actualDay} box office collection and collected ${totalGrossStr} gross | Ollypedia`;
  const seoDesc = seoDescDynamic;
  const excerpt = sections.introParagraph ||
    `${movieName} Day ${actualDay} box office collection: Net ${dayNet}, Gross ${dayGross}. Total ${totalNetStr} net in ${sortedDays.length} days.`;

  // Default: no blog slug for days that don't get a standalone blog
  let finalSlug = "";

  if (shouldPublishDailyBlog(actualDay)) {
    const blogPayload = {
      title: blogTitle,
      slug: blogSlug,
      excerpt,
      content: blogContent,
      category: "Box Office",
      tags: [
        movieName, "Box Office", "Odia Cinema", "Ollywood",
        `Day ${actualDay}`, year ? String(year) : null,
        directorName, producerName, musicDirector,
        ...leadActors, ...leadActresses,
        ...dayTags.map(t => t.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())),
      ].filter(Boolean),
      coverImage: movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || "",
      movieId: movie._id,
      movieTitle: movieName,
      author: "Ollypedia Team",
      published: true,  // always true — shows in blog UI listing
      indexed: true,    // Days 1–3 are always high-value, always indexed
      featured: false,
      seoTitle,
      seoDesc,
    };

    // Look for an existing blog with this exact stable slug
    finalSlug = blogSlug;
    const existingBlog = await Blog.findOne({ slug: blogSlug });

    if (existingBlog) {
      // Update — preserve _id and createdAt.
      Object.assign(existingBlog, blogPayload);
      existingBlog.published = true;
      existingBlog.indexed = true;
      await existingBlog.save();
      finalSlug = existingBlog.slug;
    } else {
      // New post — also try matching by movieId + day pattern (handles old timestamp slugs)
      const dayPatternBlog = await Blog.findOne({
        movieId: movie._id,
        slug: { $regex: `day-${actualDay}-box-office-collection` },
      });
      if (dayPatternBlog) {
        Object.assign(dayPatternBlog, blogPayload);
        dayPatternBlog.slug = blogSlug; // normalise to stable slug
        dayPatternBlog.published = true;
        dayPatternBlog.indexed = true;
        await dayPatternBlog.save();
        finalSlug = dayPatternBlog.slug;
      } else {
        const created = await Blog.create(blogPayload);
        finalSlug = created.slug;
      }
    }
  } else {
    // Day 4+ — no standalone blog created.
    // Box office data already saved to movie.boxOfficeDays[] above.
    // Event-based blogs (week summaries, weekends, milestones, jubilees)
    // are handled by triggerEventBlogs() below — fire-and-forget.
    console.log(`[Scraper] Day ${actualDay} — skipping standalone blog (only Days 1-3 get daily blogs). Data stored in boxOfficeDays.`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §15  UPDATE LASTLOG ON CONFIG
  // ─────────────────────────────────────────────────────────────────────────

  cfg.lastLog = {
    runAt: new Date(),
    status: "success",
    net: dailyNetRaw,
    gross: dailyGrossRaw,
    date: yesterdayStr,
    day: actualDay,
    blogSlug: finalSlug,
    error: "",
  };
  await cfg.save();

  // ─────────────────────────────────────────────────────────────────────────
  //  §16  APPEND TO SacnilkLog (keep last 30)
  // ─────────────────────────────────────────────────────────────────────────

  await SacnilkLog.create({
    movieId,
    runAt: new Date(),
    status: "success",
    net: dailyNetRaw,
    gross: dailyGrossRaw,
    date: yesterdayStr,
    day: actualDay,
    blogSlug: finalSlug,
    rawSnippet: html.slice(0, 500),
  });

  // Trim to 30
  const logCount = await SacnilkLog.countDocuments({ movieId });
  if (logCount > 30) {
    const oldest = await SacnilkLog.find({ movieId }).sort({ runAt: 1 }).limit(logCount - 30).select("_id");
    await SacnilkLog.deleteMany({ _id: { $in: oldest.map(l => l._id) } });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §17  AUTO-INDEX PING (optional — uncomment if autoIndexUrl is available)
  // ─────────────────────────────────────────────────────────────────────────

  // try {
  //   const blogFullUrl = `https://ollypedia.in/blog/${finalSlug}`;
  //   await autoIndexUrl(blogFullUrl);
  // } catch { /* non-fatal */ }

  // §18  EVENT-BASED BLOGS (fire-and-forget — never blocks daily scrape)
  triggerEventBlogs(movie, actualDay, totalNet, previousTotalNum, yesterdayStr, sortedDays, movieId)
    .catch(e => console.error(`[EventBlog] triggerEventBlogs failed: ${e.message}`));

  return {
    netRaw: dailyNetRaw,
    grossRaw: dailyGrossRaw,
    scrapedTotal: scrapedCumulativeRaw,
    day: actualDay,
    date: yesterdayStr,
    blogSlug: finalSlug,
  };
}

// ============================================================================
//   EVENT-BASED BOX OFFICE BLOG SYSTEM (ADDITIONS)
// ============================================================================

// ── EventBlog Schema ─────────────────────────────────────────────────────────
const EventBlogSchema = new mongoose.Schema({
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  eventType: { type: String, required: true },  // "first-week" | "opening-weekend" | "second-weekend" | "third-weekend" | "later-weekend-N" | "milestone-X" | "comparison-first-week"
  blogId: { type: mongoose.Schema.Types.ObjectId, ref: "Blog", required: true },
  blogSlug: { type: String, required: true },
  generatedAt: { type: Date, default: Date.now }
});

EventBlogSchema.index({ movieId: 1, eventType: 1 }, { unique: true });

const EventBlog = mongoose.models.EventBlog || mongoose.model("EventBlog", EventBlogSchema);

// Format a raw number (rupees) into ₹X.XX Cr / L
const formatINR = (n) => {
  if (!n || isNaN(n)) return "—";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${Number(n).toLocaleString("en-IN")}`;
};

// ── CSS/Styles Shared Variables ──────────────────────────────────────────────
const EVENT_BLOG_CSS_VARIABLES = {
  card: `background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;`,
  h2: `font-size:1.05rem;font-weight:800;color:#c9973a;border-left:4px solid #c9973a;padding-left:12px;margin:0 0 18px;line-height:1.3;`,
  h3: `color:#ccc;font-size:0.95rem;font-weight:700;margin:18px 0 8px;`,
  tdL: `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.87rem;width:38%;vertical-align:top;`,
  tdR: `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;font-weight:600;`,
  th: `padding:11px 14px;background:#1f1f1f;color:#888;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;text-align:left;border-bottom:2px solid #2a2a2a;`,
  td: `padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;`
};

const EVENT_BLOG_RESPONSIVE_STYLES = `
.bp-article-html section[style*="background:#181818"] {
  padding: 26px 28px;
}
@media (max-width: 640px) {
  .bp-article-html section[style*="background:#181818"] {
    padding: 18px 14px !important;
  }
}
`;

// ── Slug & Title Helpers ─────────────────────────────────────────────────────
function buildFirstWeekSlug(movie) {
  return trimSlugToLength(`${movie.slug}-first-week-box-office-report`, 80);
}

function buildWeekendSlug(movie, weekendNum) {
  const nameMap = { 1: "opening-weekend", 2: "second-weekend", 3: "third-weekend" };
  const name = nameMap[weekendNum] || `weekend-${weekendNum}`;
  return trimSlugToLength(`${movie.slug}-${name}-box-office`, 80);
}

function buildMilestoneSlug(movie, milestoneLabel) {
  let cleanLabel = milestoneLabel.toLowerCase();
  if (cleanLabel.endsWith("cr")) {
    const val = cleanLabel.replace("cr", "");
    cleanLabel = `${val}-crore`;
  } else if (cleanLabel.endsWith("l")) {
    const val = cleanLabel.replace("l", "");
    cleanLabel = `${val}-lakh`;
  }
  return trimSlugToLength(`${movie.slug}-crosses-${cleanLabel}-box-office`, 80);
}

function buildComparisonSlug(movie) {
  return trimSlugToLength(`${movie.slug}-first-week-comparison-odia-box-office`, 80);
}

function getFirstWeekTitle(movieTitle, totalNetStr, seed) {
  const templates = [
    `${movieTitle} First Week Box Office Collection: ${totalNetStr} Net in 7 Days`,
    `${movieTitle} Completes First Week at Box Office — ${totalNetStr} Net Collection Report`,
    `${movieTitle} 7-Day Box Office: First Week Performance Analysis & Verdict`,
    `${movieTitle} One Week Box Office Review: Opening to Day 7 Collection Breakdown`,
    `${movieTitle} First Week at Ollywood Box Office: Complete Day-Wise Collection Report`
  ];
  return templates[seed % templates.length];
}

function getWeekendTitle(movieTitle, weekendLabel, totalNetStr, seed) {
  const templates = [
    `${movieTitle} ${weekendLabel} Box Office Collection Report: ${totalNetStr} Cumulative`,
    `${movieTitle} Box Office: Strong ${weekendLabel} Collections and Verdict`,
    `${movieTitle} ${weekendLabel} Analysis: Theatrical Performance & Highlights`,
    `${movieTitle} Hits New Heights: Complete ${weekendLabel} Box Office Breakdown`,
    `${movieTitle} ${weekendLabel} at Ollywood Box Office: Collection Report`
  ];
  return templates[seed % templates.length];
}

function getMilestoneTitle(movieTitle, milestoneClean, seed) {
  const templates = [
    `${movieTitle} Crosses ₹${milestoneClean} at Box Office — Collection Milestone Report`,
    `${movieTitle} Box Office: ₹${milestoneClean} Milestone Achieved! Complete Details`,
    `${movieTitle} Hits ₹${milestoneClean} Net Collection — Ollywood Box Office Milestone`,
    `${movieTitle} Surpasses ₹${milestoneClean} Net at Odia Box Office`,
    `${movieTitle} Collected ₹${milestoneClean} and Counting — Milestone Box Office Report`
  ];
  return templates[seed % templates.length];
}

function getComparisonTitle(movieTitle, seed) {
  const templates = [
    `${movieTitle} vs Other Odia Hits: First Week Box Office Comparison`,
    `${movieTitle} First Week Comparison Report: How it Ranks Against Recent Odia Releases`,
    `${movieTitle} Completes Week 1: First Week Box Office Clash & Comparative Standings`,
    `${movieTitle} 7-Day Box Office Battle: Head-to-Head Comparison with Odia Blockbusters`,
    `${movieTitle} vs Recent Ollywood Releases: First Week Box Office Showdown`
  ];
  return templates[seed % templates.length];
}

// ── AI Content Generators ────────────────────────────────────────────────────
async function generateFirstWeekAI(movie, days, totalNet) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const day1 = days.find(d => d.day === 1);
  const day7 = days.find(d => d.day === 7);
  const openingDayNet = day1 ? formatINR(parseToRupeesGlobal(day1.net || "0")) : "—";
  const day7Net = day7 ? formatINR(parseToRupeesGlobal(day7.net || "0")) : "—";
  const openingWeekendTotal = days.filter(d => d.day >= 1 && d.day <= 3).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const openingWeekendStr = formatINR(openingWeekendTotal);
  const weekdayTotal = days.filter(d => d.day >= 4 && d.day <= 6).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const weekdayStr = formatINR(weekdayTotal);
  const dayDataStr = days.slice(0, 7).map(d => `Day ${d.day}: ${d.net || "N/A"}`).join("; ");

  const fallbacks = {
    metaDescription: `${movieName} First Week Box Office: Collected ${totalNetStr} net in 7 days at the Odia box office. Complete day-wise breakdown and analysis inside.`,
    headline: `${movieName} Completes First Week: ${totalNetStr} Net and a Theatrical Run Worth Celebrating`,
    introParagraph: `${movieName}${year ? ` (${year})` : ""} has wrapped up its crucial first seven days at the Odia box office, scripting an encouraging commercial chapter for Ollywood. With a cumulative net collection of ${totalNetStr}, the film has demonstrated what consistent audience interest can do to a theatrical run when content resonates genuinely. From its opening-day collection of ${openingDayNet} to the quiet but steady Day 7 figure of ${day7Net}, the film's week-one arc has been one of measured, content-driven success that trade observers have noted with approval.`,
    performanceOverview: `The opening three-day weekend — the most critical window for any new Odia release — gave ${movieName} a strong launchpad with a combined collection of ${openingWeekendStr}. Cinemas across Bhubaneswar, Cuttack, Sambalpur, Berhampur, and Rourkela reported healthy footfalls throughout Friday evening, Saturday, and Sunday, with Saturday emerging as the peak day as is typical for Odia theatrical releases. The film's opening weekend created organic buzz on social media and among cinema circuits — genuine audience enthusiasm translating directly into ticket sales and repeat screenings.`,
    weekdayHoldAnalysis: `The real test for ${movieName} began from Day 4, when the promotional noise had settled and the film had to rely entirely on its own merit to draw audiences to theatre seats on working weekdays. The combined weekday collection of ${weekdayStr} from Days 4 through 6 reflects a healthy retention rate that would encourage distributors to maintain or even expand screen count into Week 2. Films that hold their weekday business at 55–65% of their opening day figure — which appears to be the case here — are the ones that ultimately cross meaningful milestones in their lifetime box office run.`,
    audienceResponseSection: `Audience feedback for ${movieName} has been overwhelmingly positive across multiple platforms, from cinema exit polls to social media conversations and word-of-mouth in Odia communities. Viewers have particularly appreciated the film's narrative authenticity, performance quality, and production values. Morning and matinee shows, which typically remain underutilised for mid-budget Odia films, have reported improved occupancy, suggesting that the film's appeal is not limited to any single demographic or show-timing preference.`,
    dayWiseParagraph: `The day-by-day collection trajectory for ${movieName} reads as follows: ${dayDataStr}. This pattern is characteristic of a content-driven success — a promising Day 1 to establish buzz, a Day 2 peak as weekend audiences flood theatres, a slightly softer Sunday, and then a gradual but controlled weekday descent that speaks to sustained interest. Day 7 completing the week on a solid note signals that the film still has a willing audience heading into Week 2.`,
    week2OutlookSection: `With ${totalNetStr} secured after the first seven days, ${movieName} enters its second week from a commercially comfortable position. Industry insiders who track Odia box office patterns note that films earning at this pace in their first week typically add between 30% and 50% of their Week 1 total across the remaining weeks of their theatrical run, assuming competition from new releases doesn't dramatically erode screen count. The key variable is the second weekend — if the film posts numbers within 55–65% of its opening weekend, the trajectory toward a profitable full run remains intact.`,
    conclusionParagraph: `In conclusion, the first-week chapter of ${movieName} at the Odia box office has been one that the filmmakers, cast, and entire production team can look back on with genuine pride. A net collection of ${totalNetStr} in seven days is not merely a commercial figure — it is an audience endorsement, a critical verdict delivered through the most democratic of all channels: the ticket window. As the film moves into its second week and beyond, the story of its theatrical journey will continue to unfold.`
  };

  const systemPrompt = "You are a senior Odia cinema (Ollywood) journalist with 15+ years of experience, writing long-form, deeply analytical, SEO-optimised editorial articles for Ollypedia — Odisha's leading entertainment portal. Your writing style is warm, authoritative, and genuinely human — like a veteran film correspondent who deeply loves cinema. Avoid all AI writing patterns: no bullet-pointed sentences, no generic filler like 'it is worth noting' or 'needless to say'. Write with a real journalist's voice. Return ONLY a valid JSON object — no markdown, no code fences, no extra text. Every value must be plain text with no HTML tags. Every paragraph must be at least 5–7 full sentences, rich in specific data references, contextual storytelling, and editorial insight.";
  const userPrompt = `Write a first week box office report for the Odia movie "${movieName}" (${year}).
Day-wise data: ${dayDataStr}.
Opening day: ${openingDayNet}. Opening weekend (Days 1-3): ${openingWeekendStr}. Weekdays (Days 4-6): ${weekdayStr}. Day 7: ${day7Net}. Total Week 1 net: ${totalNetStr}.

Write like a senior entertainment journalist who knows Odia cinema deeply. Reference the actual numbers throughout. Make every paragraph feel genuinely human and editorial, not AI-generated.

Include the following JSON keys:
- metaDescription (155–165 chars, include film name and total Week 1 figure)
- headline (strong editorial headline, max 90 chars, no HTML)
- introParagraph (strong opener: 7 days completed, opening day figure, total collection, broad theatrical reception across Odisha)
- performanceOverview (opening weekend Days 1-3: combined figure, peak day, city-wise response, social buzz created)
- weekdayHoldAnalysis (Days 4-6: combined weekday total, hold percentage meaning, word-of-mouth signal, distributor confidence)
- audienceResponseSection (audience demographic: families, youth, couples; show timing patterns; morning vs evening occupancy; social feedback; repeat viewership signals)
- dayWiseParagraph (narrative analysis of day-by-day trend using actual data above; what the trajectory reveals about the film's connect)
- week2OutlookSection (what Week 2 holds: screen count expectations, second weekend as key test, lifetime collection projection logic)
- conclusionParagraph (editorial wrap-up: what ${totalNetStr} means for the filmmakers, the cast, and Odia cinema at large)`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "performanceOverview", "weekdayHoldAnalysis", "audienceResponseSection", "dayWiseParagraph", "week2OutlookSection", "conclusionParagraph"],
    fallbacks,
    3500
  );
}

async function generateWeekendAI(movie, days, weekendNum, totalNet) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const weekendNameMap = { 1: "Opening", 2: "Second", 3: "Third" };
  const wName = weekendNameMap[weekendNum] || `${weekendNum}th`;
  const weekendLabel = weekendNum === 1 ? "Opening Weekend" : weekendNum === 2 ? "Second Weekend" : weekendNum === 3 ? "Third Weekend" : `Weekend ${weekendNum}`;
  const fridayDay = weekendNum === 1 ? 1 : (weekendNum - 1) * 7 + 1;
  const sundayDay = fridayDay + 2;
  const weekendDays = days.filter(d => d.day >= fridayDay && d.day <= sundayDay);
  const weekendTotal = weekendDays.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const weekendTotalStr = formatINR(weekendTotal);
  const weekendDataStr = weekendDays.map(d => `Day ${d.day}: ${d.net || "—"}`).join("; ");
  let prevWeekendStr = "";
  if (weekendNum > 1) {
    const pF = (weekendNum - 2) * 7 + 1;
    const pS = pF + 2;
    const pDays = days.filter(d => d.day >= pF && d.day <= pS);
    const pTotal = pDays.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
    prevWeekendStr = formatINR(pTotal);
  }

  const fallbacks = {
    metaDescription: `${movieName} ${weekendLabel} Box Office: ${weekendTotalStr} weekend collection, ${totalNetStr} cumulative. Full analysis of the ${wName.toLowerCase()} weekend at the Odia box office.`,
    headline: `${movieName} ${weekendLabel}: ${weekendTotalStr} Weekend Collection and What It Means`,
    introParagraph: `${movieName}${year ? ` (${year})` : ""} has successfully navigated another crucial box office milestone with the completion of its ${weekendLabel.toLowerCase()} in Odia theatres. The three-day window brought in a combined collection of ${weekendTotalStr} (${weekendDataStr}), pushing the film's cumulative net total to ${totalNetStr}. Cinema halls across Odisha continued to see encouraging turnout, with audiences clearly not yet done with this particular cinematic experience — a fact that speaks volumes about the quality of content and the level of audience connection the film has managed to sustain.`,
    weekendBreakdownParagraph: `Breaking down the ${weekendLabel.toLowerCase()} day-by-day, the collection pattern tells an illuminating story about how ${movieName} is performing. ${weekendDataStr ? `The three-day breakdown reads: ${weekendDataStr}.` : ""} Saturday emerged as the strongest day of the weekend, driven by a combination of advance bookings and walk-in audiences drawn by strong word-of-mouth. Friday set a healthy base, while Sunday maintained a commendable hold — a pattern that trade observers associate with films that have genuine repeat viewing appeal.`,
    occupancyTrendSection: `Occupancy levels during this weekend at major Odia cinema centres were encouraging across both the multiplex and single-screen segments. Major multiplexes in Bhubaneswar reported healthy evening and night show occupancy, while the price-sensitive single-screen market in districts like Khurda, Cuttack, Angul, and Sundargarh showed steady footfalls, particularly at the afternoon shows favoured by family audiences. The fact that occupancy held firm across these demographically different exhibition segments is a strong signal of the film's broad audience appeal.`,
    audienceProfileSection: `The audience composition driving ${movieName}'s continued box office performance reveals a film that has successfully transcended its initial target demographic. Family groups have been a consistent presence, particularly at the 3 PM and 6 PM shows. Evening and late-night shows at multiplexes have attracted younger couples and friend groups, while morning shows in single-screen theatres have drawn a more mature, mixed demographic. This multi-demographic appeal is the hallmark of a commercially durable film.`,
    holdAnalysisParagraph: `${weekendNum > 1 && prevWeekendStr ? `Placed in context against the previous weekend's total of ${prevWeekendStr}, this weekend's collection of ${weekendTotalStr} represents the film's continued audience draw.` : "The hold percentage during this weekend"} A healthy hold — particularly on Sunday — signals that word-of-mouth continues to work in the film's favour. Industry observers tracking Ollywood releases have noted that ${movieName}'s weekend retention is performing ahead of most releases of a similar scale from the past year.`,
    industryContextSection: `Within the context of Odia cinema's theatrical landscape, ${movieName}'s ${weekendLabel.toLowerCase()} performance carries significant weight. The Ollywood industry has been navigating a post-OTT-disruption era where weekend holds have become increasingly difficult to sustain beyond the opening weekend. That ${movieName} is maintaining meaningful audience interest deep into its theatrical run is a positive signal for producers, distributors, and theatre owners alike — all of whom benefit when a film sustains strong collections over multiple weekends.`,
    weekdayOutlookSection: `As the film transitions from the ${weekendLabel.toLowerCase()} into the upcoming weekdays, the critical question is whether it can maintain a hold of 60–70% on Monday relative to its Friday number. If it manages that, the week's total addition could be substantial enough to make a meaningful difference to the lifetime collection. Screen availability and competition from any new releases will also play a pivotal role in determining how much breathing room ${movieName} gets to continue its impressive run.`,
    conclusionParagraph: `The ${weekendLabel.toLowerCase()} has reaffirmed ${movieName}'s status as one of the standout Odia theatrical releases of the season. With a cumulative total of ${totalNetStr} and audience enthusiasm showing no signs of dramatic decline, the film remains firmly in the conversation for a memorable theatrical run. The production team, distributors, and exhibitors can take genuine satisfaction from what has been an encouraging weekend at the Odia box office.`
  };

  const systemPrompt = "You are a senior Odia cinema (Ollywood) journalist with 15+ years of experience, writing long-form, deeply analytical, SEO-optimised editorial articles for Ollypedia. Write with genuine journalistic warmth and authority. Avoid AI patterns and filler phrases. Return ONLY a valid JSON object — no markdown, no code fences, no extra text. All values must be plain text with no HTML tags. Every paragraph must be at least 5–7 full sentences, incorporating the actual data provided.";
  const userPrompt = `Write a box office report for the ${weekendLabel} of the Odia movie "${movieName}" (${year}).
Weekend breakdown (${weekendDataStr}): ${weekendTotalStr}.
Total cumulative net: ${totalNetStr}.
${weekendNum > 1 && prevWeekendStr ? `Previous weekend total: ${prevWeekendStr}.` : ""}

Write as a senior entertainment journalist. Reference specific numbers throughout. Make every paragraph natural and human, with the analytical depth of professional film trade journalism.

Include the following JSON keys:
- metaDescription (155–165 chars, include weekend label and cumulative total)
- headline (strong editorial headline, max 90 chars, no HTML)
- introParagraph (weekend complete: days in run, weekend collection figure, cumulative total, overall theatrical atmosphere)
- weekendBreakdownParagraph (day-by-day: peak day, Friday base, Sunday hold, what the pattern reveals about audience type and word-of-mouth)
- occupancyTrendSection (occupancy at multiplexes and single screens; specific Odia cities like Bhubaneswar, Cuttack, Sambalpur; show timing patterns)
- audienceProfileSection (demographic breakdown: families, youth, couples; show timing preferences; multi-demographic appeal analysis)
- holdAnalysisParagraph (this weekend vs previous if applicable; hold percentage analysis; what strong hold signals about word-of-mouth and distributor confidence)
- industryContextSection (Ollywood context: post-OTT theatrical challenges, what sustained holds mean for the industry, investor confidence)
- weekdayOutlookSection (Monday hold target, screen count, competitor releases, what this week needs to look like)
- conclusionParagraph (editorial wrap-up: what this weekend means for the film's legacy and production team satisfaction)`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "weekendBreakdownParagraph", "occupancyTrendSection", "audienceProfileSection", "holdAnalysisParagraph", "industryContextSection", "weekdayOutlookSection", "conclusionParagraph"],
    fallbacks,
    3500
  );
}

async function generateMilestoneAI(movie, milestoneLabel, totalNet, sortedDays) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const milestoneClean = milestoneLabel.toUpperCase().replace("CR", " Crore").replace("L", " Lakh");
  const dayReached = sortedDays ? sortedDays.length : "—";
  const recentDays = sortedDays ? sortedDays.slice(-3) : [];
  const recentStr = recentDays.map(d => `Day ${d.day}: ${d.net || "—"}`).join(", ");
  const openingDayMilestone = sortedDays && sortedDays.length > 0 ? formatINR(parseToRupeesGlobal(sortedDays[0]?.net || "0")) : "—";

  const fallbacks = {
    metaDescription: `${movieName} Crosses ₹${milestoneClean} at Odia Box Office! Total collection now stands at ${totalNetStr} net. Complete milestone report and analysis.`,
    headline: `${movieName} Hits ₹${milestoneClean} — A Historic Milestone for Odia Cinema`,
    introParagraph: `${movieName}${year ? ` (${year})` : ""} has etched its name in Odia box office history by crossing the prestigious ₹${milestoneClean} net collection mark in its theatrical run of ${dayReached} days. The film, which set the stage with an opening day collection of ${openingDayMilestone}, has now accumulated a remarkable ${totalNetStr} in net earnings — a figure that places it firmly among the notable commercial successes in recent Ollywood history. This milestone represents not just a financial achievement, but a resounding verdict from Odia audiences who have repeatedly chosen to experience this film in the theatrical setting.`,
    milestoneSignificanceParagraph: `The ₹${milestoneClean} milestone carries enormous significance in the context of Odia cinema's evolving commercial landscape. In an era where OTT platforms have dramatically compressed theatrical windows and altered viewing habits, reaching this mark requires a film to achieve a rare combination of factors: exceptional content quality, effective release timing, strong promotional execution, and crucially, the organic word-of-mouth that no marketing budget can manufacture. ${movieName} has demonstrated mastery of all these elements.`,
    journeyTimelineSection: `The box office journey of ${movieName} to the ₹${milestoneClean} milestone has been one of the more compelling stories in recent Ollywood history. From its energetic opening, through multiple weekends where audiences continued to turn up in meaningful numbers, to the weekday collections that defied the usual drop patterns seen in most Odia releases, the film has shown remarkable consistency. ${recentStr ? `Recent daily collections — ${recentStr} — indicate that the theatrical appetite for the film has not yet been exhausted,` : "The film's consistent daily performance indicates"} suggesting additional milestones may be within reach.`,
    industryImpactSection: `The commercial success of ${movieName} carries implications well beyond the immediate production house and distribution team. For Ollywood as an ecosystem, every film that crosses the ₹${milestoneClean} threshold provides essential ammunition in the industry's ongoing case to multiplex chains, satellite buyers, OTT platforms, and production financiers that quality Odia content can generate meaningful commercial returns. This creates a positive feedback loop encouraging larger budgets, better technical standards, and more aggressive pan-India distribution efforts.`,
    castDirectorContextSection: `Behind the ₹${milestoneClean} milestone are the creative decisions of a director and cast who believed deeply in their project at a time when every Odia production is a calculated risk. The lead performers' investment in their characters, the director's clarity of vision, the music team's compositions, and the producer's faith in the project — each element contributed to the box office edifice that has now risen past the ₹${milestoneClean} mark. In Ollywood, where marketing budgets are a fraction of what larger industries operate with, a film crossing this kind of milestone on the strength of content is an extraordinary achievement.`,
    futureOutlookSection: `With ${totalNetStr} already secured and the theatrical run still active, the question now turns to how much further ${movieName} can push its lifetime collection. Trade analysts tracking Ollywood market patterns estimate that films at this stage with this level of daily activity typically continue to add between 15–25% to the current cumulative figure before screens are released. The satellite and OTT rights value of the film will also have been considerably enhanced by this box office performance, ensuring meaningful financial returns for all stakeholders.`,
    conclusionParagraph: `The ₹${milestoneClean} milestone crossed by ${movieName} is a moment deserving of genuine celebration — for the production team, for the cast and crew, and for Odia cinema as a whole. It is a powerful reminder that audiences in Odisha are ready and willing to support quality content at the box office, and that Ollywood, despite its resource constraints, is capable of producing commercially viable, artistically compelling cinema. As the theatrical run continues, the legacy of ${movieName} at the box office will be studied and referenced as a benchmark for future Odia productions.`
  };

  const systemPrompt = "You are a senior Odia cinema (Ollywood) journalist with 15+ years of experience, writing long-form, deeply analytical, SEO-optimised editorial articles for Ollypedia. Write with genuine journalistic warmth and authority. Avoid AI patterns and filler phrases. Return ONLY a valid JSON object — no markdown, no code fences, no extra text. All values must be plain text with no HTML tags. Every paragraph must be at least 5–7 full sentences with specific references to the milestone, box office data, and Ollywood industry context.";
  const userPrompt = `Write a box office milestone report for the Odia movie "${movieName}" (${year}).
Milestone crossed: ₹${milestoneClean} net.
Current total net collection: ${totalNetStr}.
Days in theatrical run: ${dayReached}. Opening day collection: ${openingDayMilestone}.
Recent daily collections: ${recentStr || "not available"}.

Write with the authority of a senior film journalist who covers Ollywood professionally. Reference actual figures throughout. Make every paragraph feel human, analytical, and editorial.

Include the following JSON keys:
- metaDescription (155–165 chars, include milestone amount and current total collection)
- headline (celebratory editorial headline, no HTML, max 90 chars)
- introParagraph (announce the milestone: days in run, opening day, current total, what crossing this milestone represents)
- milestoneSignificanceParagraph (why ₹${milestoneClean} matters in Odia cinema context; OTT-era challenges; what it takes to achieve this milestone)
- journeyTimelineSection (box office journey: opening, weekend holds, weekday patterns, recent daily collections, overall trajectory)
- industryImpactSection (impact on Ollywood ecosystem: investor confidence, multiplex support, OTT rights enhancement, industry morale)
- castDirectorContextSection (the creative team: director's vision, lead actors' performances, what this milestone means for their careers in Odia cinema)
- futureOutlookSection (remaining theatrical potential, next possible milestones, OTT/satellite rights value, trade projections)
- conclusionParagraph (editorial celebration: what this milestone means for Odia cinema's future and audience endorsement narrative)`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "milestoneSignificanceParagraph", "journeyTimelineSection", "industryImpactSection", "castDirectorContextSection", "futureOutlookSection", "conclusionParagraph"],
    fallbacks,
    3500
  );
}

async function generateComparisonAI(movie, comparators, totalNet) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const compInfo = comparators.map((c, i) => `${i + 1}. "${c.title}": ${c.firstWeekNetStr} first week net`).join("\n");
  const topComp = comparators[0];
  const moviesAbove = comparators.filter(c => c.firstWeekNet > totalNet).length;
  const moviesBelow = comparators.filter(c => c.firstWeekNet <= totalNet).length;

  const fallbacks = {
    metaDescription: `${movieName} First Week Box Office Comparison: ${totalNetStr} net in Week 1. See how it ranks against ${comparators.length} recent Odia films in this detailed comparison.`,
    headline: `${movieName} vs Odia Box Office Hits: First Week Comparison & Rankings`,
    introParagraph: `The completion of ${movieName}${year ? ` (${year})` : ""}'s first seven days at the Odia box office — with a net collection of ${totalNetStr} — naturally invites comparison with other notable Odia theatrical releases that have completed their own first-week runs. In the Ollywood industry, first-week comparisons are more than a matter of pride — they serve as essential benchmarks for producers, distributors, and OTT buyers when evaluating the commercial potential of future projects. This detailed analysis places ${movieName} side-by-side with ${comparators.length} significant recent Odia releases to understand exactly where it stands in the contemporary box office hierarchy.`,
    rankingContextSection: `Among the ${comparators.length} Odia films included in this first-week comparison, ${movieName}'s Week 1 collection of ${totalNetStr} places it ${moviesAbove > 0 ? `behind ${moviesAbove} film${moviesAbove > 1 ? "s" : ""}` : "at the top"}${moviesBelow > 0 ? ` and ahead of ${moviesBelow} film${moviesBelow > 1 ? "s" : ""}` : ""} in this ranking. ${topComp ? `The current benchmark for Odia first-week collections in this comparison is set by "${topComp.title}" with ${topComp.firstWeekNetStr}, representing the commercial ceiling that the industry is aspiring toward.` : ""} Raw ranking, however, tells only part of the story — the context of each film's budget, release scale, screen count, and promotional spend is essential to interpreting what the numbers actually represent.`,
    comparisonParagraph: `A deeper look at the comparative data reveals fascinating patterns about how ${movieName} has performed relative to its peers. ${topComp && topComp.firstWeekNet > totalNet ? `While "${topComp.title}" leads the pack with a formidable ${topComp.firstWeekNetStr} in its first week, it is crucial to contextualise that figure against the promotional machinery and star-power that may have driven its opening.` : `${movieName} leading this comparative field with ${totalNetStr} is a significant achievement.`} The most meaningful metric in such comparisons is the weekday hold percentage — which indicates how much of the opening-weekend audience returned during the less glamorous working days. Films with strong weekday holds are the ones that tend to cross major milestones in their lifetime run.`,
    openingWeekendCompareSection: `Opening weekends across the films in this comparison tell a particularly instructive story about the evolving Odia box office. The relationship between a film's opening weekend performance and its first-week total has shifted in the post-OTT era — films that were once able to rely on a heavy front-load are now finding that audiences are more selective, choosing to wait for social media reviews before committing to a theatre visit. ${movieName}'s opening weekend, which contributed significantly to its ${totalNetStr} first-week total, reflects an audience persuaded by both pre-release promotional content and early positive word-of-mouth.`,
    verdictComparisonSection: `The comparative verdict from this analysis is that ${movieName} has earned a creditable position in the first-week box office hierarchy of contemporary Odia cinema. Whether it sits at the top, middle, or lower end of this particular comparison table, the efficiency of its collection — considering its likely production and marketing budget — speaks more clearly to its actual commercial success. Films in Ollywood that achieve first-week totals in the range that ${movieName} has achieved are the engine that keeps the industry's commercial cycle alive.`,
    industryImpactSection: `Comparative box office analysis serves a broader purpose in Odia cinema beyond satisfying trade curiosity. When ${movieName} and the films it is being compared with collectively perform at meaningful levels, they create a rising tide that benefits the entire Odia film ecosystem. Theatre owners are encouraged to maintain dedicated screens for Odia content. OTT platforms raise their acquisition bids. And the industry as a whole builds the commercial foundation needed for more ambitious productions in future.`,
    conclusionParagraph: `In the final analysis, placing ${movieName} in comparison with other Odia box office performers of recent vintage allows us to appreciate both its achievements and the broader commercial landscape within which those achievements have been earned. The film's ${totalNetStr} first-week net is a figure that the production team, distributors, and theatre owners can look back on with legitimate satisfaction. More importantly, it contributes another credible data point to the ongoing story of Odia cinema's commercial evolution.`
  };

  const systemPrompt = "You are a senior Odia cinema (Ollywood) journalist with 15+ years of experience, writing long-form, deeply analytical, SEO-optimised editorial articles for Ollypedia. Write with genuine journalistic authority. Avoid AI patterns and filler phrases. Return ONLY a valid JSON object — no markdown, no code fences, no extra text. All values must be plain text with no HTML tags. Every paragraph must be at least 5–7 full sentences with specific references to the comparison data. Reference actual film titles and figures from the data provided.";
  const userPrompt = `Write a first week box office comparison report for the Odia movie "${movieName}" (${year}).
${movieName} Week 1 net: ${totalNetStr}.

Comparison films (sorted by first week collection, highest first):
${compInfo}

Films above ${movieName} in ranking: ${moviesAbove}. Films below: ${moviesBelow}.
${topComp ? `Top benchmark: "${topComp.title}" at ${topComp.firstWeekNetStr}.` : ""}

Write as a senior film trade journalist doing a proper comparative analysis. Reference actual film names, actual figures, and contextualise the numbers thoughtfully.

Include the following JSON keys:
- metaDescription (155–165 chars, include film name, week 1 total, and "comparison" keyword)
- headline (comparative editorial headline, max 90 chars, no HTML)
- introParagraph (why this comparison matters for Ollywood: OTT era context, what first-week rankings mean for the industry, scope of this analysis)
- rankingContextSection (where ${movieName} ranks in this comparison, what the ranking means, reference to top benchmark film, caveat about budget/scale context)
- comparisonParagraph (deep-dive into comparative data: reference specific film names and numbers, weekday hold discussion, what the variations reveal)
- openingWeekendCompareSection (how opening weekends compare across films, post-OTT audience behaviour, front-loading vs content-driven audiences)
- verdictComparisonSection (final comparative verdict: ${movieName}'s position in the hierarchy, collection efficiency as a metric, budget-relative performance)
- industryImpactSection (broader implications: theatre owner confidence, OTT acquisition bids, rising tide effect on Ollywood)
- conclusionParagraph (editorial conclusion referencing specific numbers and ${movieName}'s place in Odia film history)`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "rankingContextSection", "comparisonParagraph", "openingWeekendCompareSection", "verdictComparisonSection", "industryImpactSection", "conclusionParagraph"],
    fallbacks,
    3500
  );
}

// ── HTML Builders ────────────────────────────────────────────────────────────
function buildFirstWeekBlogHTML(movie, days, totalNet, ai, slug, title, relatedMovies) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const dm = dp;

  const movieUrl = `/movie/${movie.slug}`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;

  const css = EVENT_BLOG_CSS_VARIABLES;
  const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));

  let cumulative = 0;
  const dataTableRows = days.slice(0, 7).map((d, i) => {
    const netNum = parseToRupeesGlobal(d.net || "0");
    cumulative += netNum;
    const isToday = d.day === 7;
    const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

    return `
    <tr style="background:${isToday ? "rgba(201,151,58,0.05)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)")};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isToday ? "#c9973a" : "#aaa"};font-weight:700;">Day ${d.day}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">${dateStr}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isToday ? "#c9973a" : "#ddd"};font-weight:700;">${d.net ? formatINR(parseToRupeesGlobal(d.net)) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#c9973a;font-weight:700;">${formatINR(cumulative)}</td>
    </tr>`;
  }).join("");

  const toc = [
    ["First Week Performance", "performance-overview"],
    ["Weekday Hold Analysis", "weekday-analysis"],
    ["Audience Response", "audience-response"],
    ["Day-wise Breakdown", "day-wise"],
    ["Week 2 Outlook", "week2-outlook"],
    ["Conclusion", "conclusion"],
    relatedMovies.length ? ["Related Reads", "related-movies"] : null
  ].filter(Boolean);

  const keywordsArr = [
    movieName, `${movieName} first week`, `${movieName} 7 days collection`,
    `${movieName} box office`, "Odia box office", "Ollywood first week report"
  ];
  const keywordsStr = [...new Set(keywordsArr)].join(", ");
  const plainWordCount = [ai.introParagraph, ai.performanceOverview, ai.weekdayHoldAnalysis, ai.audienceResponseSection, ai.dayWiseParagraph, ai.week2OutlookSection, ai.conclusionParagraph]
    .filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${title}
  description:    ${ai.metaDescription}
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${title}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${slug}
  og:image:       ${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dm}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${title}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
  twitter:image:alt: ${movieName} First Week Poster
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(title)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dm}",
      "inLanguage": "en",
      "wordCount": ${plainWordCount},
      "keywords": ${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movieName)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "First Week Report", "item": "${SITE_URL}/blog/${slug}" }
      ]
    }
  ]
}
</script>

<style>
${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#c9973a;">First Week Report</span>
  </nav>
  <time datetime="${dp}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: ${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#1a0e00 0%,#121212 100%);border:1px solid #2e2000;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#2a1500;color:#c9973a;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a2200;">📊 First Week Box Office</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">7 Days Report</span>
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      ${title}
    </h1>
    <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">
      ${ai.introParagraph}
    </p>
</div>

<nav aria-label="Table of contents" style="${css.card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    ${toc.map(([label, id]) => `<li><a href="#${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">${label}</a></li>`).join("")}
  </ul>
</nav>

<section id="performance-overview" style="${css.card}">
  <h2 style="${css.h2}">First Week Performance Overview</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.performanceOverview}
  </p>
</section>

<section id="weekday-analysis" style="${css.card}">
  <h2 style="${css.h2}">Weekday Hold Analysis</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.weekdayHoldAnalysis}
  </p>
</section>

<section id="audience-response" style="${css.card}">
  <h2 style="${css.h2}">Audience Response & Demographics</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.audienceResponseSection}
  </p>
</section>

<section id="day-wise" style="${css.card}">
  <h2 style="${css.h2}">Day-wise Collection Breakdown</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0 0 18px;">
    ${ai.dayWiseParagraph}
  </p>
  <div style="overflow-x:auto;">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:400px;margin-bottom:18px;">
      <thead>
        <tr>
          <th style="${css.th}">Day</th>
          <th style="${css.th}">Date</th>
          <th style="${css.th}">Net Collection</th>
          <th style="${css.th}">Cumulative Net</th>
        </tr>
      </thead>
      <tbody>
        ${dataTableRows}
      </tbody>
    </table>
  </div>
</section>

<section id="week2-outlook" style="${css.card}">
  <h2 style="${css.h2}">Week 2 Outlook</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.week2OutlookSection}
  </p>
</section>

<section id="conclusion" style="${css.card}">
  <h2 style="${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.conclusionParagraph}
  </p>
  <p style="font-size:0.75rem;color:#555;margin-top:15px;">
    * Box office collections are compiled from trade sources and site estimates. Return to the <a href="${movieUrl}" style="color:#c9973a;text-decoration:underline;">${movieName} Main Page</a>.
  </p>
</section>

${relatedMovies.length ? `
<section id="related-movies">
  ${buildRelatedMoviesHtml(relatedMovies, "#c9973a")}
</section>` : ""}
`;
}

function buildWeekendBlogHTML(movie, days, totalNet, weekendLabel, ai, slug, title, relatedMovies) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const dm = dp;

  const movieUrl = `/movie/${movie.slug}`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;

  const css = EVENT_BLOG_CSS_VARIABLES;
  const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));

  let weekendNum = 1;
  if (weekendLabel.includes("Second")) weekendNum = 2;
  else if (weekendLabel.includes("Third")) weekendNum = 3;
  else if (weekendLabel.includes("Weekend ")) weekendNum = parseInt(weekendLabel.replace("Weekend ", ""), 10) || 1;

  const fridayDay = (weekendNum - 1) * 7 + 1;
  const weekendDays = days.filter(d => d.day >= fridayDay && d.day <= fridayDay + 2);

  let prevCumulative = days.filter(d => d.day < fridayDay).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);

  const dataTableRows = weekendDays.map((d, i) => {
    const netNum = parseToRupeesGlobal(d.net || "0");
    prevCumulative += netNum;
    const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
    const dayNames = ["Friday", "Saturday", "Sunday"];

    return `
    <tr style="background:${i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#aaa;font-weight:700;">Day ${d.day} (${dayNames[i] || ""})</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">${dateStr}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-weight:700;">${d.net ? formatINR(netNum) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#c9973a;font-weight:700;">${formatINR(prevCumulative)}</td>
    </tr>`;
  }).join("");

  const toc = [
    ["Weekend Breakdown", "weekend-breakdown"],
    ["Occupancy Trends", "occupancy-trends"],
    ["Audience Profile", "audience-profile"],
    ["Hold Analysis", "hold-analysis"],
    ["Industry Context", "industry-context"],
    ["Weekday Outlook", "weekday-outlook"],
    ["Conclusion", "conclusion"],
    relatedMovies.length ? ["Related Reads", "related-movies"] : null
  ].filter(Boolean);

  const keywordsArr = [
    movieName, `${movieName} ${weekendLabel.toLowerCase()} collection`, `${movieName} weekend box office`,
    "Odia box office", "Ollywood weekend report"
  ];
  const keywordsStr = [...new Set(keywordsArr)].join(", ");
  const plainWordCount = Object.values(ai).join(" ").split(/\s+/).filter(Boolean).length;

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${title}
  description:    ${ai.metaDescription}
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${title}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${slug}
  og:image:       ${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dm}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${title}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
  twitter:image:alt: ${movieName} Weekend Poster
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(title)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dm}",
      "inLanguage": "en",
      "wordCount": ${plainWordCount},
      "keywords": ${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movieName)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "${weekendLabel} Report", "item": "${SITE_URL}/blog/${slug}" }
      ]
    }
  ]
}
</script>

<style>
${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#c9973a;">${weekendLabel} Report</span>
  </nav>
  <time datetime="${dp}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: ${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#0a1520 0%,#121212 100%);border:1px solid #102a40;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#0d2030;color:#7ec8e3;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #1a3a54;">🎟️ Weekend Report</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">${weekendLabel}</span>
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      ${title}
    </h1>
    <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">
      ${ai.introParagraph}
    </p>
</div>

<nav aria-label="Table of contents" style="${css.card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    ${toc.map(([label, id]) => `<li><a href="#${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">${label}</a></li>`).join("")}
  </ul>
</nav>

<section id="weekend-breakdown" style="${css.card}">
  <h2 style="${css.h2}">${weekendLabel} Breakdown</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0 0 18px;">
    ${ai.weekendBreakdownParagraph}
  </p>
  ${dataTableRows ? `
  <div style="overflow-x:auto;">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:400px;margin-bottom:18px;">
      <thead>
        <tr>
          <th style="${css.th}">Day</th>
          <th style="${css.th}">Date</th>
          <th style="${css.th}">Net Collection</th>
          <th style="${css.th}">Cumulative Net</th>
        </tr>
      </thead>
      <tbody>
        ${dataTableRows}
      </tbody>
    </table>
  </div>
  ` : ""}
</section>

<section id="occupancy-trends" style="${css.card}">
  <h2 style="${css.h2}">Occupancy Trends</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.occupancyTrendSection}
  </p>
</section>

<section id="audience-profile" style="${css.card}">
  <h2 style="${css.h2}">Audience Profile</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.audienceProfileSection}
  </p>
</section>

<section id="hold-analysis" style="${css.card}">
  <h2 style="${css.h2}">Hold Analysis</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.holdAnalysisParagraph}
  </p>
</section>

<section id="industry-context" style="${css.card}">
  <h2 style="${css.h2}">Ollywood Industry Context</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.industryContextSection}
  </p>
</section>

<section id="weekday-outlook" style="${css.card}">
  <h2 style="${css.h2}">Upcoming Weekday Outlook</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.weekdayOutlookSection}
  </p>
</section>

<section id="conclusion" style="${css.card}">
  <h2 style="${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.conclusionParagraph}
  </p>
  <p style="font-size:0.75rem;color:#555;margin-top:15px;">
    * All comparison figures are based on estimates. Back to <a href="${movieUrl}" style="color:#c9973a;text-decoration:underline;">${movieName} Main Page</a>.
  </p>
</section>

${relatedMovies.length ? `
<section id="related-movies">
  ${buildRelatedMoviesHtml(relatedMovies, "#c9973a")}
</section>` : ""}
`;
}

function buildMilestoneBlogHTML(movie, milestoneKey, totalNet, ai, slug, title, relatedMovies, sortedDays) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const dm = dp;

  const movieUrl = `/movie/${movie.slug}`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;

  const milestoneClean = milestoneKey.toUpperCase().replace("CR", " Crore").replace("L", " Lakh");

  const css = EVENT_BLOG_CSS_VARIABLES;
  const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));

  const toc = [
    ["Milestone Significance", "significance"],
    ["Box Office Journey", "journey"],
    ["Industry Impact", "industry-impact"],
    ["Creative Team Context", "creative-team"],
    ["Future Outlook", "future-outlook"],
    ["Conclusion", "conclusion"],
    relatedMovies.length ? ["Related Reads", "related-movies"] : null
  ].filter(Boolean);

  const keywordsArr = [
    movieName, `${movieName} ${milestoneClean}`, `${movieName} box office milestone`,
    "Odia box office records", "Ollywood collections"
  ];
  const keywordsStr = [...new Set(keywordsArr)].join(", ");
  const plainWordCount = Object.values(ai).join(" ").split(/\s+/).filter(Boolean).length;

  let milestoneTableHtml = "";
  if (sortedDays && sortedDays.length > 0) {
    const tableDays = [];
    if (sortedDays.length >= 1) tableDays.push(sortedDays[0]);
    if (sortedDays.length >= 3) tableDays.push(sortedDays.find(d => d.day === 3) || sortedDays[2]);
    if (sortedDays.length >= 7) tableDays.push(sortedDays.find(d => d.day === 7) || sortedDays[6]);
    if (sortedDays.length > 7) tableDays.push(sortedDays[sortedDays.length - 1]);

    const uniqueDays = tableDays.filter((d, index, self) => index === self.findIndex(t => t.day === d.day));

    let cumNet = 0;
    const allCumulatives = sortedDays.reduce((acc, d) => {
      cumNet += parseToRupeesGlobal(d.net || "0");
      acc[d.day] = cumNet;
      return acc;
    }, {});

    const rows = uniqueDays.map((d, i) => {
      const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
      const cumVal = allCumulatives[d.day] || 0;
      return `
      <tr style="background:${i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"};">
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#aaa;font-weight:700;">Day ${d.day}</td>
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">${dateStr}</td>
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-weight:700;">${d.net ? formatINR(parseToRupeesGlobal(d.net)) : "—"}</td>
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#10b981;font-weight:700;">${formatINR(cumVal)}</td>
      </tr>`;
    }).join("");

    milestoneTableHtml = `
    <div style="overflow-x:auto;margin-top:20px;margin-bottom:18px;">
      <h3 style="color:#ddd;font-size:1.05rem;margin-bottom:12px;">Milestone Progress Tracker</h3>
      <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:400px;">
        <thead>
          <tr>
            <th style="${css.th}">Checkpoint</th>
            <th style="${css.th}">Date</th>
            <th style="${css.th}">Day Net Collection</th>
            <th style="${css.th}">Cumulative Net</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
  }

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${title}
  description:    ${ai.metaDescription}
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${title}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${slug}
  og:image:       ${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dm}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${title}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
  twitter:image:alt: ${movieName} Box Office Milestone
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(title)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dm}",
      "inLanguage": "en",
      "wordCount": ${plainWordCount},
      "keywords": ${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movieName)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "₹${milestoneClean} Milestone", "item": "${SITE_URL}/blog/${slug}" }
      ]
    }
  ]
}
</script>

<style>
${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#10b981;">₹${milestoneClean} Milestone</span>
  </nav>
  <time datetime="${dp}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: ${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#021a11 0%,#121212 100%);border:1px solid #063d27;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#03291b;color:#10b981;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #064d32;">🏆 Box Office Milestone</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">₹${milestoneClean}</span>
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      ${title}
    </h1>
    <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">
      ${ai.introParagraph}
    </p>
</div>

<nav aria-label="Table of contents" style="${css.card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    ${toc.map(([label, id]) => `<li><a href="#${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">${label}</a></li>`).join("")}
  </ul>
</nav>

<section id="significance" style="${css.card}">
  <h2 style="${css.h2}">Significance of the ₹${milestoneClean} Milestone</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.milestoneSignificanceParagraph}
  </p>
</section>

<section id="journey" style="${css.card}">
  <h2 style="${css.h2}">The Box Office Journey</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.journeyTimelineSection}
  </p>
  ${milestoneTableHtml}
</section>

<section id="industry-impact" style="${css.card}">
  <h2 style="${css.h2}">Impact on Ollywood</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.industryImpactSection}
  </p>
</section>

<section id="creative-team" style="${css.card}">
  <h2 style="${css.h2}">Context for the Creative Team</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.castDirectorContextSection}
  </p>
</section>

<section id="future-outlook" style="${css.card}">
  <h2 style="${css.h2}">Future Outlook & Projections</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.futureOutlookSection}
  </p>
</section>

<section id="conclusion" style="${css.card}">
  <h2 style="${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.conclusionParagraph}
  </p>
  <p style="font-size:0.75rem;color:#555;margin-top:15px;">
    * All figures are based on estimates. Back to <a href="${movieUrl}" style="color:#c9973a;text-decoration:underline;">${movieName} Main Page</a>.
  </p>
</section>

${relatedMovies.length ? `
<section id="related-movies">
  ${buildRelatedMoviesHtml(relatedMovies, "#10b981")}
</section>` : ""}
`;
}

function buildComparisonBlogHTML(movie, comparators, totalNet, ai, slug, title, relatedMovies) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const dm = dp;

  const movieUrl = `/movie/${movie.slug}`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;

  const css = EVENT_BLOG_CSS_VARIABLES;
  const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));

  const dataRows = comparators.map((c, i) => `
    <tr style="background:${i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-weight:600;"><a href="/movie/${c.slug}" style="color:#ddd;text-decoration:none;">${c.title}</a></td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#bbb;">${c.firstWeekNetStr}</td>
    </tr>
  `).join("");

  const toc = [
    ["Ranking Context", "ranking-context"],
    ["Comparative Analysis", "comparison-analysis"],
    ["Opening Weekend comparison", "opening-weekend"],
    ["Comparison Verdict", "verdict-comparison"],
    ["Industry Impact", "industry-impact"],
    ["Conclusion", "conclusion"],
    relatedMovies.length ? ["Related Reads", "related-movies"] : null
  ].filter(Boolean);

  const keywordsArr = [
    movieName, `${movieName} box office comparison`, `${movieName} vs other odia movies`,
    "Odia box office hits", "Ollywood collections"
  ];
  const keywordsStr = [...new Set(keywordsArr)].join(", ");
  const plainWordCount = Object.values(ai).join(" ").split(/\s+/).filter(Boolean).length;

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${title}
  description:    ${ai.metaDescription}
  keywords:       ${keywordsStr}
  canonical:      ${SITE_URL}/blog/${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${title}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${slug}
  og:image:       ${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dm}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  ${title}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
  twitter:image:alt: ${movieName} Box Office Comparison
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(title)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dm}",
      "inLanguage": "en",
      "wordCount": ${plainWordCount},
      "keywords": ${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movieName)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "First Week Comparison", "item": "${SITE_URL}/blog/${slug}" }
      ]
    }
  ]
}
</script>

<style>
${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#ff9800;">First Week Comparison</span>
  </nav>
  <time datetime="${dp}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: ${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#1b1002 0%,#121212 100%);border:1px solid #3d2403;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#381d02;color:#ff9800;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #542f02;">📊 Box Office Comparison</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">Odia Film Rankings</span>
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      ${title}
    </h1>
    <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">
      ${ai.introParagraph}
    </p>
</div>

<nav aria-label="Table of contents" style="${css.card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    ${toc.map(([label, id]) => `<li><a href="#${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">${label}</a></li>`).join("")}
  </ul>
</nav>

<section id="ranking-context" style="${css.card}">
  <h2 style="${css.h2}">Ranking Context</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.rankingContextSection}
  </p>
</section>

<section id="comparison-analysis" style="${css.card}">
  <h2 style="${css.h2}">Comparative Data Analysis</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0 0 18px;">
    ${ai.comparisonParagraph}
  </p>
  <div style="overflow-x:auto;">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:350px;">
      <thead>
        <tr>
          <th style="${css.th}">Movie Name</th>
          <th style="${css.th}">First Week Net (Odia Box Office)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:rgba(255,152,0,0.08);">
          <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ff9800;font-weight:800;">${movieName} (Current)</td>
          <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ff9800;font-weight:800;font-size:0.98rem;">${totalNetStr}</td>
        </tr>
        ${dataRows}
      </tbody>
    </table>
  </div>
</section>

<section id="opening-weekend" style="${css.card}">
  <h2 style="${css.h2}">Opening Weekend Context</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.openingWeekendCompareSection}
  </p>
</section>

<section id="verdict-comparison" style="${css.card}">
  <h2 style="${css.h2}">Comparison Verdict</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.verdictComparisonSection}
  </p>
</section>

<section id="industry-impact" style="${css.card}">
  <h2 style="${css.h2}">Broader Industry Impact</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.industryImpactSection}
  </p>
</section>

<section id="conclusion" style="${css.card}">
  <h2 style="${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    ${ai.conclusionParagraph}
  </p>
  <p style="font-size:0.75rem;color:#555;margin-top:15px;">
    * All comparison figures are based on estimates. Back to <a href="${movieUrl}" style="color:#ff9800;text-decoration:underline;">${movieName} Main Page</a>.
  </p>
</section>

${relatedMovies.length ? `
<section id="related-movies">
  ${buildRelatedMoviesHtml(relatedMovies, "#ff9800")}
</section>` : ""}
`;
}

// ── Orchestrators ────────────────────────────────────────────────────────────
async function maybeGenerateFirstWeekBlog(movie, sortedDays, totalNet, movieId) {
  try {
    const eventType = "first-week";
    const exists = await EventBlog.findOne({ movieId, eventType });
    if (exists) return;

    const ai = await generateFirstWeekAI(movie, sortedDays, totalNet);
    const slug = buildFirstWeekSlug(movie);
    const totalNetStr = formatINR(totalNet);
    const seed = (String(movieId) + eventType).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const title = getFirstWeekTitle(movie.title, totalNetStr, seed);

    const relatedMovies = await fetchRelatedMovies(movie);
    const html = buildFirstWeekBlogHTML(movie, sortedDays, totalNet, ai, slug, title, relatedMovies);

    const blogPayload = {
      title,
      slug,
      excerpt: ai.metaDescription,
      content: html,
      category: "Box Office",
      tags: [movie.title, "Box Office", "First Week", "Odia Cinema", "Ollywood", "7 Days"].filter(Boolean),
      coverImage: movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || "",
      movieId,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      featured: false,
      seoTitle: title,
      seoDesc: ai.metaDescription
    };

    const existingBlog = await Blog.findOne({ slug });
    let blogDoc;
    if (existingBlog) {
      Object.assign(existingBlog, blogPayload);
      blogDoc = await existingBlog.save();
    } else {
      blogDoc = await Blog.create(blogPayload);
    }

    await EventBlog.create({
      movieId,
      eventType,
      blogId: blogDoc._id,
      blogSlug: slug
    });

    console.log(`[EventBlog] Generated First Week Blog for ${movie.title} (Slug: ${slug})`);
  } catch (e) {
    console.error(`[EventBlog] maybeGenerateFirstWeekBlog failed: ${e.message}`);
  }
}

async function maybeGenerateWeekendBlog(movie, sortedDays, actualDay, totalNet, movieId) {
  try {
    let weekendNum = 0;
    let weekendLabel = "";
    let eventType = "";

    if (actualDay === 3) {
      weekendNum = 1;
      weekendLabel = "Opening Weekend";
      eventType = "opening-weekend";
    } else if (actualDay === 10) {
      weekendNum = 2;
      weekendLabel = "Second Weekend";
      eventType = "second-weekend";
    } else if (actualDay === 17) {
      weekendNum = 3;
      weekendLabel = "Third Weekend";
      eventType = "third-weekend";
    } else if (actualDay > 17 && (actualDay - 3) % 7 === 0) {
      weekendNum = ((actualDay - 3) / 7) + 1;
      weekendLabel = `Weekend ${weekendNum}`;
      eventType = `later-weekend-${weekendNum}`;
    } else {
      return; // Not a completed weekend day
    }

    const exists = await EventBlog.findOne({ movieId, eventType });
    if (exists) return;

    const ai = await generateWeekendAI(movie, sortedDays, weekendNum, totalNet);
    const slug = buildWeekendSlug(movie, weekendNum);
    const totalNetStr = formatINR(totalNet);
    const seed = (String(movieId) + eventType + weekendNum).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const title = getWeekendTitle(movie.title, weekendLabel, totalNetStr, seed);

    const relatedMovies = await fetchRelatedMovies(movie);
    const html = buildWeekendBlogHTML(movie, sortedDays, totalNet, weekendLabel, ai, slug, title, relatedMovies);

    const blogPayload = {
      title,
      slug,
      excerpt: ai.metaDescription,
      content: html,
      category: "Box Office",
      tags: [movie.title, "Box Office", weekendLabel, "Odia Cinema", "Ollywood"].filter(Boolean),
      coverImage: movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || "",
      movieId,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      featured: false,
      seoTitle: title,
      seoDesc: ai.metaDescription
    };

    const existingBlog = await Blog.findOne({ slug });
    let blogDoc;
    if (existingBlog) {
      Object.assign(existingBlog, blogPayload);
      blogDoc = await existingBlog.save();
    } else {
      blogDoc = await Blog.create(blogPayload);
    }

    await EventBlog.create({
      movieId,
      eventType,
      blogId: blogDoc._id,
      blogSlug: slug
    });

    console.log(`[EventBlog] Generated Weekend Blog for ${movie.title} (Type: ${eventType}, Slug: ${slug})`);
  } catch (e) {
    console.error(`[EventBlog] maybeGenerateWeekendBlog failed: ${e.message}`);
  }
}

async function maybeGenerateMilestoneBlog(movie, sortedDays, totalNet, prevTotalNet, movieId) {
  try {
    const MILESTONES = [
      { val: 1000000, key: "10L", clean: "10 Lakh" },
      { val: 2500000, key: "25L", clean: "25 Lakh" },
      { val: 5000000, key: "50L", clean: "50 Lakh" },
      { val: 7500000, key: "75L", clean: "75 Lakh" },
      { val: 10000000, key: "1cr", clean: "1 Crore" },
      { val: 20000000, key: "2cr", clean: "2 Crore" },
      { val: 30000000, key: "3cr", clean: "3 Crore" },
      { val: 50000000, key: "5cr", clean: "5 Crore" },
      { val: 100000000, key: "10cr", clean: "10 Crore" },
      { val: 150000000, key: "15cr", clean: "15 Crore" },
      { val: 200000000, key: "20cr", clean: "20 Crore" },
      { val: 250000000, key: "25cr", clean: "25 Crore" },
      { val: 500000000, key: "50cr", clean: "50 Crore" },
      { val: 1000000000, key: "100cr", clean: "100 Crore" }
    ];

    for (const milestone of MILESTONES) {
      if (prevTotalNet < milestone.val && totalNet >= milestone.val) {
        const eventType = `milestone-${milestone.key}`;
        const exists = await EventBlog.findOne({ movieId, eventType });
        if (exists) continue;

        const ai = await generateMilestoneAI(movie, milestone.key, totalNet);
        const slug = buildMilestoneSlug(movie, milestone.key);
        const seed = (String(movieId) + eventType + milestone.key).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
        const title = getMilestoneTitle(movie.title, milestone.clean, seed);

        const relatedMovies = await fetchRelatedMovies(movie);
        const html = buildMilestoneBlogHTML(movie, milestone.key, totalNet, ai, slug, title, relatedMovies, sortedDays);

        const blogPayload = {
          title,
          slug,
          excerpt: ai.metaDescription,
          content: html,
          category: "Box Office",
          tags: [movie.title, "Box Office", `Crosses ${milestone.clean}`, "Odia Cinema", "Ollywood", "Milestone"].filter(Boolean),
          coverImage: movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || "",
          movieId,
          movieTitle: movie.title,
          author: "Ollypedia Team",
          published: true,
          featured: false,
          seoTitle: title,
          seoDesc: ai.metaDescription
        };

        const existingBlog = await Blog.findOne({ slug });
        let blogDoc;
        if (existingBlog) {
          Object.assign(existingBlog, blogPayload);
          blogDoc = await existingBlog.save();
        } else {
          blogDoc = await Blog.create(blogPayload);
        }

        await EventBlog.create({
          movieId,
          eventType,
          blogId: blogDoc._id,
          blogSlug: slug
        });

        console.log(`[EventBlog] Generated Milestone Blog for ${movie.title} (Type: ${eventType}, Slug: ${slug})`);
      }
    }
  } catch (e) {
    console.error(`[EventBlog] maybeGenerateMilestoneBlog failed: ${e.message}`);
  }
}

async function maybeGenerateComparisonBlog(movie, sortedDays, totalNet, movieId) {
  try {
    const eventType = "comparison-first-week";
    if (totalNet < 10000000) return; // Only for totalNet >= 1 Crore

    const exists = await EventBlog.findOne({ movieId, eventType });
    if (exists) return;

    // Find other movies with at least 7 days of box office tracking
    const otherMovies = await Movie.find({
      _id: { $ne: movieId },
      "boxOfficeDays.6": { $exists: true }
    }).lean();

    const comparators = otherMovies.map(other => {
      // Sum the net of the first 7 days
      const first7Days = other.boxOfficeDays.filter(d => d.day <= 7);
      const sumNet = first7Days.reduce((sum, d) => sum + parseToRupeesGlobal(d.net || "0"), 0);
      return {
        title: other.title,
        firstWeekNetStr: formatINR(sumNet),
        firstWeekNet: sumNet
      };
    }).sort((a, b) => b.firstWeekNet - a.firstWeekNet).slice(0, 5); // top 5 comparators

    if (comparators.length === 0) {
      console.log(`[EventBlog] Skipping comparison blog for ${movie.title} due to lack of other movies with week 1 data.`);
      return;
    }

    const ai = await generateComparisonAI(movie, comparators, totalNet);
    const slug = buildComparisonSlug(movie);
    const seed = (String(movieId) + eventType).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const title = getComparisonTitle(movie.title, seed);

    const relatedMovies = await fetchRelatedMovies(movie);
    const html = buildComparisonBlogHTML(movie, comparators, totalNet, ai, slug, title, relatedMovies);

    const blogPayload = {
      title,
      slug,
      excerpt: ai.metaDescription,
      content: html,
      category: "Box Office",
      tags: [movie.title, "Box Office", "First Week Comparison", "Odia Cinema", "Ollywood"].filter(Boolean),
      coverImage: movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || "",
      movieId,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      featured: false,
      seoTitle: title,
      seoDesc: ai.metaDescription
    };

    const existingBlog = await Blog.findOne({ slug });
    let blogDoc;
    if (existingBlog) {
      Object.assign(existingBlog, blogPayload);
      blogDoc = await existingBlog.save();
    } else {
      blogDoc = await Blog.create(blogPayload);
    }

    await EventBlog.create({
      movieId,
      eventType,
      blogId: blogDoc._id,
      blogSlug: slug
    });

    console.log(`[EventBlog] Generated Comparison Blog for ${movie.title} (Slug: ${slug})`);
  } catch (e) {
    console.error(`[EventBlog] maybeGenerateComparisonBlog failed: ${e.message}`);
  }
}

// ============================================================================
//   ADDITIONAL EVENT BLOG GENERATORS — Week Summaries & Jubilees
// ============================================================================

// ── Slug & Title Helpers ─────────────────────────────────────────────────────
function buildSecondWeekSlug(movie) {
  return trimSlugToLength(`${movie.slug}-second-week-box-office-report`, 80);
}
function buildThirdWeekSlug(movie) {
  return trimSlugToLength(`${movie.slug}-third-week-box-office-report`, 80);
}
function buildFourthWeekSlug(movie) {
  return trimSlugToLength(`${movie.slug}-fourth-week-box-office-report`, 80);
}
function buildJubileeSlug(movie, type) {
  const label = type === "silver" ? "silver-jubilee-25-days" : "golden-jubilee-50-days";
  return trimSlugToLength(`${movie.slug}-${label}-box-office`, 80);
}

function getSecondWeekTitle(movieTitle, totalNetStr, week2NetStr, seed) {
  const templates = [
    `${movieTitle} Second Week Box Office: ${week2NetStr} in Week 2, ${totalNetStr} Total`,
    `${movieTitle} Completes Second Week — ${totalNetStr} Cumulative Net Collection Report`,
    `${movieTitle} 2nd Week Box Office Verdict: Strong Hold or Steep Drop? Full Analysis`,
    `${movieTitle} Two Weeks at Ollywood Box Office: Complete Day-Wise Collection Report`,
    `${movieTitle} Second Week: Audience Hold \u0026 Box Office Performance Analysis`
  ];
  return templates[seed % templates.length];
}
function getThirdWeekTitle(movieTitle, totalNetStr, seed) {
  const templates = [
    `${movieTitle} Third Week Box Office: ${totalNetStr} Total Net — Extended Run Analysis`,
    `${movieTitle} Completes 3 Weeks in Theatres — ${totalNetStr} Net Cumulative Report`,
    `${movieTitle} 21 Days at Odia Box Office: Third Week Collection \u0026 Audience Verdict`,
    `${movieTitle} Three-Week Box Office Report: Sustained Run \u0026 Future Outlook`,
    `${movieTitle} Third Week Collection — ${totalNetStr} Net and Still Running Strong`
  ];
  return templates[seed % templates.length];
}
function getFourthWeekTitle(movieTitle, totalNetStr, seed) {
  const templates = [
    `${movieTitle} Fourth Week Box Office: ${totalNetStr} Total — Remarkable Theatrical Run`,
    `${movieTitle} Completes 4 Weeks: ${totalNetStr} Net in an Extraordinary Ollywood Run`,
    `${movieTitle} 28 Days in Theatres — Fourth Week Box Office Report \u0026 Legacy Analysis`,
    `${movieTitle} Fourth Week at Box Office: A Landmark Run in Odia Cinema History`,
    `${movieTitle} Month-Long Theatrical Run: Fourth Week Collection \u0026 Final Verdict`
  ];
  return templates[seed % templates.length];
}
function getJubileeTitle(movieTitle, days, totalNetStr, seed) {
  const jubileeLabel = days === 25 ? "Silver Jubilee" : "Golden Jubilee";
  const dayLabel = days === 25 ? "25 Days" : "50 Days";
  const templates = [
    `${movieTitle} ${jubileeLabel}! ${dayLabel} at Box Office — ${totalNetStr} Net Collection`,
    `${movieTitle} Celebrates ${jubileeLabel}: ${dayLabel} Theatrical Run in Ollywood History`,
    `${movieTitle} ${jubileeLabel} Box Office Report: ${totalNetStr} Net After ${dayLabel}`,
    `${movieTitle} Scripts ${jubileeLabel} — A Historic ${dayLabel} Run at Odia Box Office`,
    `${movieTitle} ${dayLabel} \u0026 ${jubileeLabel}: Complete Box Office Report \u0026 Legacy Analysis`
  ];
  return templates[seed % templates.length];
}

// ── AI Content Generators ────────────────────────────────────────────────────
async function generateSecondWeekAI(movie, days, totalNet) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const week1Days = days.filter(d => d.day >= 1 && d.day <= 7);
  const week2Days = days.filter(d => d.day >= 8 && d.day <= 14);
  const week1Total = week1Days.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const week2Total = week2Days.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const week1Str = formatINR(week1Total);
  const week2Str = formatINR(week2Total);
  const dropPct = week1Total > 0 ? (((week1Total - week2Total) / week1Total) * 100).toFixed(0) : "N/A";
  const week2DataStr = week2Days.map(d => `Day ${d.day}: ${d.net || "N/A"}`).join("; ");
  const day8 = week2Days.find(d => d.day === 8);
  const day14 = week2Days.find(d => d.day === 14);
  const mondayHold = day8 && week1Days.length > 0
    ? `Day 8 (Monday): ${day8.net || "N/A"}`
    : "";

  const fallbacks = {
    metaDescription: `${movieName} Second Week Box Office: ${week2Str} in Week 2, total ${totalNetStr} net. Week-on-week drop ${dropPct}%. Full analysis inside.`,
    headline: `${movieName} Second Week: ${week2Str} and a Box Office Run That Commands Respect`,
    introParagraph: `${movieName}${year ? ` (${year})` : ""} has completed its second week in Odia theatres, and the numbers paint a revealing picture of where this film stands in the hearts of Odia audiences. The second seven-day window added ${week2Str} to the cumulative total, pushing the film's overall net collection to ${totalNetStr}. After the initial burst of opening excitement, Week 2 is always the moment of truth — and ${movieName} has faced it with the kind of composure that distinguishes a genuinely content-driven release from an opening-weekend flash-in-the-pan.`,
    weekOneTwoComparison: `The week-on-week comparison tells the most important story. ${movieName} collected ${week1Str} in its first seven days and followed that with ${week2Str} in Week 2 — a drop of approximately ${dropPct}%. In the Odia theatrical market, a Week 2 drop of under 50% is considered a strong hold; anything above 65% signals a front-loaded film that struggled to sustain word-of-mouth. A ${dropPct}% drop places ${movieName} in the category that distributors and exhibitors watch most closely: a film with genuine legs.`,
    mondayHoldSection: `${mondayHold ? `The Monday (Day 8) figure of ${mondayHold.split(": ")[1] || "—"} was particularly significant, as Monday collections are considered the purest indicator of true word-of-mouth — they represent viewers who chose to visit the theatre not because of promotional buzz but because of what friends and family told them about the film. A strong Monday hold from any Odia release immediately signals to exhibitors that they should consider maintaining or even expanding screen availability for the rest of Week 2.` : `The early days of Week 2 were the critical test for ${movieName} — weekday audiences post-opening buzz are among the most discerning in the Odia cinema market, coming to theatres purely on the strength of personal recommendations rather than promotional noise.`}`,
    weekendContribution: `The second weekend — Days 12 through 14 — provided an important secondary lift for ${movieName}. ${day14 ? `The film closed its second week with a Day 14 collection of ${day14.net || "N/A"}, ` : ""}signalling that weekend audiences are still choosing this film over competing releases. Second weekends in Ollywood are becoming increasingly vital, as the OTT announcement cycle means audiences are acutely aware of when a film will leave theatres — and those who genuinely want the theatrical experience are making a point of catching it before that window closes.`,
    audienceProfileWeek2: `The demographic profile of ${movieName}'s Week 2 audience has shifted subtly from its first-week composition. The initial front-loaded audience — fans of the lead actors, genre enthusiasts, early-adopter cinephiles — has given way to a broader family demographic drawn by the positive word-of-mouth that spread through Odia social media and community networks during the first week. This demographic shift is healthy and sustainable — it suggests the film's appeal extends well beyond its core fanbase.`,
    industryReadSection: `For Ollywood, ${movieName}'s Week 2 performance carries meaningful industry implications. The Odia theatrical ecosystem depends critically on films sustaining screen count into their second week — a Week 2 drop of over 70% typically triggers mass screen releases, compressing the film's lifetime theatrical window dramatically. The fact that ${movieName} is holding well enough to warrant continued exhibition is an encouraging signal for the entire industry.`,
    week3OutlookSection: `As ${movieName} moves into its third week, the key variables to watch are screen count, competition from new Odia or Hindi releases, and whether the OTT announcement has been made. Films at this stage with ${totalNetStr} in total net typically add between 20-35% more in their remaining theatrical run, depending on these factors. Week 3 weekend numbers will be the final major test of the film's sustained audience appeal.`,
    conclusionParagraph: `Two weeks in, ${movieName}'s total net of ${totalNetStr} is a testament to the film's content quality and the authenticity of its audience connection. The week-on-week performance data tells a story of a film that opened promisingly, held reasonably, and continues to draw Odia cinema lovers to the big screen. For the creative team, the cast, and the producers, this second-week report is something to be read with genuine satisfaction.`
  };

  const systemPrompt = "You are a senior Odia cinema (Ollywood) journalist with 15+ years of experience, writing long-form, deeply analytical, SEO-optimised editorial articles for Ollypedia. Write with genuine journalistic authority. Avoid AI clichés. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text with no HTML tags. Every paragraph must be at least 5-7 full sentences.";
  const userPrompt = `Write a second week box office report for the Odia movie "${movieName}" (${year}).
Week 1 total: ${week1Str}. Week 2 total: ${week2Str}. Week-on-week drop: ${dropPct}%.
Week 2 day-wise data: ${week2DataStr}. Cumulative total after 2 weeks: ${totalNetStr}.

Include JSON keys: metaDescription, headline, introParagraph, weekOneTwoComparison, mondayHoldSection, weekendContribution, audienceProfileWeek2, industryReadSection, week3OutlookSection, conclusionParagraph.`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "weekOneTwoComparison", "mondayHoldSection", "weekendContribution", "audienceProfileWeek2", "industryReadSection", "week3OutlookSection", "conclusionParagraph"],
    fallbacks,
    3000
  );
}

async function generateThirdWeekAI(movie, days, totalNet) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const week3Days = days.filter(d => d.day >= 15 && d.day <= 21);
  const week3Total = week3Days.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const week3Str = formatINR(week3Total);
  const week1Total = days.filter(d => d.day >= 1 && d.day <= 7).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const week2Total = days.filter(d => d.day >= 8 && d.day <= 14).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const week1Str = formatINR(week1Total);
  const week2Str = formatINR(week2Total);
  const week3DataStr = week3Days.map(d => `Day ${d.day}: ${d.net || "N/A"}`).join("; ");

  const fallbacks = {
    metaDescription: `${movieName} Third Week Box Office: ${week3Str} in Week 3, total ${totalNetStr} net after 21 days. Complete analysis of this extended Ollywood run.`,
    headline: `${movieName} Third Week: ${week3Str} More at Box Office — 21 Days and Still Running`,
    introParagraph: `${movieName}${year ? ` (${year})` : ""} has completed 21 days in Odia theatres — a milestone that most Odia releases never reach in today's compressed theatrical environment. The third week added ${week3Str} to the cumulative total, pushing the film's lifetime net to ${totalNetStr}. In an era where OTT platforms announce their streaming dates within weeks of a film's theatrical release, a film that sustains audience interest deep into its third week has achieved something genuinely exceptional.`,
    sustainedRunAnalysis: `The theatrical journey of ${movieName} through three full weeks — Week 1 (${week1Str}), Week 2 (${week2Str}), Week 3 (${week3Str}) — tells a compelling story about a film that found its audience not through marketing alone but through the most reliable force in cinema: genuine word-of-mouth. ${week3DataStr ? `The Week 3 day-wise breakdown (${week3DataStr}) shows ` : "The Week 3 pattern shows "}the kind of steady, loyal trickle of audience that characterises an Odia film that has become part of community conversation — discussed at family gatherings, recommended by friends, and sought out by those who missed it in the first two weekends.`,
    repeatViewerSection: `Films that sustain theatrical runs into their third week in Odisha are almost always driven significantly by repeat viewers — people who saw the film in its first or second week and returned because the experience merited a second, or even third, theatrical viewing. This repeat-viewing phenomenon is rare in contemporary Odia cinema and represents one of the highest possible compliments an audience can pay to a film. For ${movieName}, reaching Week 3 with meaningful occupancy is evidence of this deep, lasting connection.`,
    screenCountContext: `The screen count story for ${movieName} by Week 3 will likely reflect a consolidation — fewer screens than Week 1 but those that remain are seeing higher occupancy rates than many newer releases. This is the natural ecology of a long-running film: it may lose breadth (number of screens) while gaining depth (occupancy percentage on available screens). Theatre owners in major Odisha centres — Bhubaneswar, Cuttack, Sambalpur — are among the most experienced readers of audience data in the Odia circuit, and their decision to continue programming ${movieName} into Week 3 is its own form of industry endorsement.`,
    industryMilestoneSection: `In the contemporary Ollywood landscape, most commercially successful films complete their active theatrical run in 10-14 days. For ${movieName} to extend that window to 21 days places it in a select group of recent Odia releases that have demonstrated multi-week durability. This durability has ripple effects across the industry: it raises the ceiling of expectation for future productions, strengthens the case for larger theatrical windows before OTT releases, and gives producers and distributors a benchmark for what sustained quality content can achieve.`,
    lifetimePrediction: `Based on Week 3 trajectory, ${movieName}'s lifetime theatrical collection is now taking clear shape. Films at this stage typically add their final 10-20% in Week 4 and beyond, driven by B-centre and C-centre audiences in smaller Odisha districts and towns who tend to come later in a film's run. The total net of ${totalNetStr} after 21 days positions ${movieName} for a lifetime collection that reflects genuine commercial success for an Odia language production.`,
    conclusionParagraph: `The third week of ${movieName} at the Odia box office is not merely a collection report — it is a statement about the quality of Odia cinema and the sophistication of Odia audiences. A film that still draws paying viewers in Week 3 has earned its place in the recent history of Ollywood, and the ${totalNetStr} cumulative total after 21 days is a number that will be referenced as a benchmark for years to come.`
  };

  const systemPrompt = "You are a senior Odia cinema journalist writing a third-week box office analysis for Ollypedia. Emphasise the exceptional nature of a three-week Odia theatrical run. Write with genuine editorial authority. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML.";
  const userPrompt = `Third week box office report for the Odia movie "${movieName}" (${year}).
Week 1: ${week1Str}. Week 2: ${week2Str}. Week 3: ${week3Str}. Total after 21 days: ${totalNetStr}.
Week 3 day-wise: ${week3DataStr}.

JSON keys: metaDescription, headline, introParagraph, sustainedRunAnalysis, repeatViewerSection, screenCountContext, industryMilestoneSection, lifetimePrediction, conclusionParagraph.`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "sustainedRunAnalysis", "repeatViewerSection", "screenCountContext", "industryMilestoneSection", "lifetimePrediction", "conclusionParagraph"],
    fallbacks,
    3000
  );
}

async function generateFourthWeekAI(movie, days, totalNet) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const week4Days = days.filter(d => d.day >= 22 && d.day <= 28);
  const week4Total = week4Days.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  const week4Str = formatINR(week4Total);
  const weeklyTotals = [
    formatINR(days.filter(d => d.day >= 1 && d.day <= 7).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0)),
    formatINR(days.filter(d => d.day >= 8 && d.day <= 14).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0)),
    formatINR(days.filter(d => d.day >= 15 && d.day <= 21).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0)),
    week4Str
  ];

  const fallbacks = {
    metaDescription: `${movieName} Fourth Week Box Office: ${week4Str} in Week 4, total ${totalNetStr} after 28 days. Rare extended run analysis for this Odia cinema landmark.`,
    headline: `${movieName} Completes Four Weeks: ${totalNetStr} Total — A Landmark Odia Theatrical Run`,
    introParagraph: `${movieName}${year ? ` (${year})` : ""} has completed a full four weeks in Odia theatres — a feat that is extraordinarily rare in contemporary Ollywood. Adding ${week4Str} in its fourth week, the film's cumulative net has reached ${totalNetStr}, making this one of the most sustained theatrical runs in recent Odia cinema history. Week 1 delivered ${weeklyTotals[0]}, Week 2 added ${weeklyTotals[1]}, Week 3 contributed ${weeklyTotals[2]}, and now Week 4 rounds out this remarkable journey with ${week4Str} more.`,
    historicalContextSection: `Four-week theatrical runs are not merely commercial achievements in Ollywood — they are cultural events. When an Odia film sustains audience attention for 28 consecutive days, it enters the conversation of films that have genuinely shaped the sensibility of their era. In the OTT age, where a film's digital release often follows within weeks of its theatrical premiere, a four-week run signals one thing above all else: this film was worth the theatre experience, again and again.`,
    legacySection: `The legacy of ${movieName} at the Odia box office will be debated and discussed in trade circles and among cinema lovers for a long time. A four-week run produces a specific kind of cultural imprint — it means the film was discussed at workplaces and family dinners across Odisha for an entire month, that multiple generations within the same family went to watch it at different points during its run, and that it was good enough to be recommended by someone every single day for 28 days.`,
    finalVerdict: `After four full weeks, ${movieName}'s total net of ${totalNetStr} represents not just a financial milestone but an audience verdict delivered through the most democratic medium available — the movie ticket. This number will stand as one of the notable Odia box office achievements in recent memory, and it reflects the hard work of every single member of the production — from the director to the junior technician.`,
    conclusionParagraph: `As ${movieName}'s fourth week concludes, it does so with the quiet confidence of a film that never needed validation — it earned it. The ${totalNetStr} in cumulative net collection after 28 days is a number worth celebrating, and the fact that Odia audiences chose this film, repeatedly, over the course of a full month, is the most meaningful review that any film — and any filmmaker — could ever receive.`
  };

  const systemPrompt = "You are a senior Odia cinema journalist covering an extraordinary four-week box office run. Write with genuine editorial gravitas — this is a landmark moment for Ollywood. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML.";
  const userPrompt = `Fourth week box office report for the Odia movie "${movieName}" (${year}).
Weekly breakdown — Week 1: ${weeklyTotals[0]}, Week 2: ${weeklyTotals[1]}, Week 3: ${weeklyTotals[2]}, Week 4: ${week4Str}.
Total after 28 days: ${totalNetStr}.

JSON keys: metaDescription, headline, introParagraph, historicalContextSection, legacySection, finalVerdict, conclusionParagraph.`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "historicalContextSection", "legacySection", "finalVerdict", "conclusionParagraph"],
    fallbacks,
    2500
  );
}

async function generateJubileeAI(movie, days, totalNet, jubileeType) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dayCount = jubileeType === "silver" ? 25 : 50;
  const jubileeName = jubileeType === "silver" ? "Silver Jubilee" : "Golden Jubilee";
  const openingDayNet = days.length > 0 ? formatINR(parseToRupeesGlobal(days[0]?.net || "0")) : "—";
  const recentDays = days.slice(-3).map(d => `Day ${d.day}: ${d.net || "—"}`).join(", ");

  const fallbacks = {
    metaDescription: `${movieName} celebrates its ${jubileeName} — ${dayCount} days at the Odia box office with ${totalNetStr} total net collection. A historic milestone for Ollywood!`,
    headline: `${movieName} ${jubileeType === "silver" ? "Silver Jubilee" : "Golden Jubilee"}: ${dayCount} Days of Pure Cinematic Triumph at the Odia Box Office`,
    introParagraph: `${movieName}${year ? ` (${year})` : ""} has achieved the extraordinary milestone of completing ${dayCount} days in Odia theatres — officially crossing into ${jubileeName} territory. With a cumulative net collection of ${totalNetStr} and counting, this film has transcended the ordinary commercial lifecycle to become a genuine cultural event in Odia cinema. The ${jubileeName} is not just a box office milestone; it is an acknowledgement from Odia audiences that this film has something irreplaceable to offer — something worth returning to the cinema for, day after day, week after week.`,
    jubileeSignificanceSection: `The ${jubileeName} milestone carries a meaning in cinema that goes far beyond simple arithmetic. A ${dayCount}-day theatrical run means that this film has been in active exhibition across Odisha through multiple weekends, multiple festive occasions, and multiple rounds of competition from newer releases — and has survived and thrived through all of them. In contemporary Ollywood, where the average theatrical window has compressed to fewer than 14 days for most releases, completing ${dayCount} days is a statement of exceptional durability and quality.`,
    journeyNarrativeSection: `The journey of ${movieName} from its first day — when it opened with ${openingDayNet} — to this ${jubileeName} milestone is the kind of box office story that enriches the folklore of Odia cinema. Recent daily figures (${recentDays}) confirm that this film continues to attract paying audiences even at this advanced stage of its theatrical run — a phenomenon driven not by promotional push but by the organic, unstoppable force of genuine audience admiration.`,
    industryMilestoneSection: `The ${jubileeName} of ${movieName} will be studied and referenced in Ollywood industry conversations for years. It establishes a new benchmark for what sustained theatrical success looks like in the Odia language market, and it signals to investors, producers, and OTT platforms alike that quality Odia content can generate the kind of long-term cultural engagement that no algorithm can manufacture. The film's ${totalNetStr} total collection is secondary to what it represents: proof that Odia audiences will sustain their cinema-going commitment for a film that truly connects with them.`,
    filmmakerLegacySection: `For the director, the lead cast, and the entire production team of ${movieName}, the ${jubileeName} is an achievement that will define their professional legacy. In a film industry where box office verdicts are often delivered within 72 hours of release, reaching ${dayCount} days means this creative team's work has been embraced and celebrated by Odia audiences across generations, geographies, and demographics — a validation that extends far beyond any numerical milestone.`,
    conclusionParagraph: `As ${movieName} marks its ${jubileeName} at the Odia box office, Ollywood has reason to celebrate — not just the success of one film, but what that success says about the state of Odia cinema and the appetite of Odia audiences for authentic, well-crafted storytelling. The ${totalNetStr} cumulative net collection after ${dayCount} days is a historic number, and this ${jubileeName} will be remembered as one of the defining box office moments in recent Odia film history.`
  };

  const systemPrompt = `You are a senior Odia cinema journalist covering a ${jubileeName} milestone — one of the rarest achievements in Ollywood. Write with the full weight and celebration this deserves. Return ONLY a valid JSON object — no markdown, no code fences. All values must be plain text, no HTML.`;
  const userPrompt = `Write a ${jubileeName} box office report for the Odia movie "${movieName}" (${year}).
Days in theatres: ${dayCount}. Total net collection: ${totalNetStr}.
Opening day collection: ${openingDayNet}. Recent daily figures: ${recentDays || "N/A"}.

JSON keys: metaDescription, headline, introParagraph, jubileeSignificanceSection, journeyNarrativeSection, industryMilestoneSection, filmmakerLegacySection, conclusionParagraph.`;

  return callGroqStructured(
    systemPrompt,
    userPrompt,
    ["metaDescription", "headline", "introParagraph", "jubileeSignificanceSection", "journeyNarrativeSection", "industryMilestoneSection", "filmmakerLegacySection", "conclusionParagraph"],
    fallbacks,
    3000
  );
}

// ── HTML Builders for Week Blogs ─────────────────────────────────────────────
function buildWeekSummaryBlogHTML(movie, days, totalNet, weekNum, weekLabel, ai, slug, title, relatedMovies) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const movieUrl = `/movie/${movie.slug}`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;
  const css = EVENT_BLOG_CSS_VARIABLES;

  // Filter days for this week
  const weekStart = (weekNum - 1) * 7 + 1;
  const weekEnd = weekNum * 7;
  const thisWeekDays = days.filter(d => d.day >= weekStart && d.day <= weekEnd);

  let cumulative = 0;
  const allDaysRows = days.map((d, i) => {
    const netNum = parseToRupeesGlobal(d.net || "0");
    cumulative += netNum;
    const isWeek = d.day >= weekStart && d.day <= weekEnd;
    const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
    return `
    <tr style="background:${isWeek ? "rgba(201,151,58,0.05)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)")};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isWeek ? "#c9973a" : "#aaa"};font-weight:700;">${isWeek ? `<strong>Day ${d.day}</strong>` : `Day ${d.day}`}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">${dateStr}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isWeek ? "#c9973a" : "#ddd"};font-weight:700;">${d.net ? formatINR(parseToRupeesGlobal(d.net)) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#c9973a;font-weight:700;">${formatINR(cumulative)}</td>
    </tr>`;
  }).join("");

  // Week summary rows
  const weeklyTotals = [1, 2, 3, 4].map(wk => {
    const wDays = days.filter(d => d.day >= (wk - 1) * 7 + 1 && d.day <= wk * 7);
    const wTotal = wDays.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
    return wTotal > 0 ? `<tr><td style="padding:10px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-weight:600;">Week ${wk}</td><td style="padding:10px 14px;border-bottom:1px solid #1e1e1e;color:${wk === weekNum ? "#c9973a" : "#ddd"};font-weight:700;">${formatINR(wTotal)}</td></tr>` : "";
  }).join("");

  const keywords = [
    movieName, `${movieName} ${weekLabel}`, `${movieName} box office`,
    `${movieName} week ${weekNum} collection`, "Odia box office", "Ollywood"
  ].join(", ");

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${title}
  description:    ${ai.metaDescription}
  keywords:       ${keywords}
  canonical:      ${SITE_URL}/blog/${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${title}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${slug}
  og:image:       ${ogImage}
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dp}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:title:  ${title}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(title)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dp}",
      "inLanguage": "en",
      "keywords": ${JSON.stringify(keywords)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movieName)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": ${JSON.stringify(weekLabel + " Report")}, "item": "${SITE_URL}/blog/${slug}" }
      ]
    }
  ]
}
</script>

<style>
${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/" style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="${movieUrl}" style="color:#777;text-decoration:none;">${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#555;">${weekLabel} Report</span>
  </nav>
</div>

<h1 style="font-size:1.45rem;font-weight:900;color:#fff;line-height:1.25;margin:0 0 18px;">${title}</h1>

<section id="intro" style="${css.card}">
  <h2 style="${css.h2}">${ai.headline || weekLabel + " Overview"}</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.introParagraph || ""}</p>
</section>

<section id="week-summary" style="${css.card}">
  <h2 style="${css.h2}">Week-by-Week Collection Summary</h2>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="${css.th}">Period</th>
        <th style="${css.th}">Net Collection</th>
      </tr>
    </thead>
    <tbody>
      ${weeklyTotals}
      <tr><td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#c9973a;font-weight:800;">Total</td><td style="padding:10px 14px;border-bottom:1px solid #2a2a2a;color:#c9973a;font-weight:800;">${totalNetStr}</td></tr>
    </tbody>
  </table>
</section>

<section id="day-wise" style="${css.card}">
  <h2 style="${css.h2}">Complete Day-Wise Collection Table</h2>
  <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;min-width:420px;">
      <thead>
        <tr>
          <th style="${css.th}">Day</th>
          <th style="${css.th}">Date</th>
          <th style="${css.th}">Net</th>
          <th style="${css.th}">Cumulative</th>
        </tr>
      </thead>
      <tbody>${allDaysRows}</tbody>
    </table>
  </div>
  <p style="font-size:0.72rem;color:#444;margin-top:10px;">* Highlighted rows = ${weekLabel} days. All figures are industry estimates. Source: Sacnilk via Ollypedia.</p>
</section>

<section id="analysis" style="${css.card}">
  <h2 style="${css.h2}">${weekLabel} Performance Analysis</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.weekOneTwoComparison || ai.sustainedRunAnalysis || ai.historicalContextSection || ""}</p>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.mondayHoldSection || ai.repeatViewerSection || ""}</p>
  <p style="color:#ccc;line-height:1.9;margin:0;font-size:0.97rem;">${ai.weekendContribution || ai.screenCountContext || ""}</p>
</section>

<section id="audience" style="${css.card}">
  <h2 style="${css.h2}">Audience & Industry Read</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.audienceProfileWeek2 || ai.legacySection || ""}</p>
  <p style="color:#ccc;line-height:1.9;margin:0;font-size:0.97rem;">${ai.industryReadSection || ai.industryMilestoneSection || ""}</p>
</section>

<section id="outlook" style="${css.card}">
  <h2 style="${css.h2}">Outlook \u0026 Conclusion</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.week3OutlookSection || ai.lifetimePrediction || ai.finalVerdict || ""}</p>
  <p style="color:#ccc;line-height:1.9;margin:0;font-size:0.97rem;">${ai.conclusionParagraph || ""}</p>
  <p style="font-size:0.72rem;color:#444;margin-top:15px;">
    * All figures are industry estimates sourced from Sacnilk via Ollypedia. Back to
    <a href="${movieUrl}" style="color:#c9973a;text-decoration:underline;">${movieName} Main Page</a> ·
    <a href="/box-office/${movie.slug}" style="color:#c9973a;text-decoration:underline;">Full Box Office Report</a>
  </p>
</section>

${relatedMovies.length ? `
<section id="related-movies">
  ${buildRelatedMoviesHtml(relatedMovies, "#c9973a")}
</section>` : ""}
`;
}

function buildJubileblogHTML(movie, days, totalNet, jubileeType, ai, slug, title, relatedMovies) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dayCount = jubileeType === "silver" ? 25 : 50;
  const jubileeName = jubileeType === "silver" ? "Silver Jubilee" : "Golden Jubilee";
  const dp = new Date().toISOString();
  const movieUrl = `/movie/${movie.slug}`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || `${SITE_URL}/logo.png`;
  const css = EVENT_BLOG_CSS_VARIABLES;

  // Weekly breakdown table
  const weeklyRows = [1, 2, 3, 4, 5, 6, 7].map(wk => {
    const wDays = days.filter(d => d.day >= (wk - 1) * 7 + 1 && d.day <= wk * 7);
    const wTotal = wDays.reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
    return wTotal > 0 ? `<tr><td style="padding:10px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-weight:600;">Week ${wk}</td><td style="padding:10px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-weight:700;">${formatINR(wTotal)}</td></tr>` : "";
  }).join("");

  const keywords = [movieName, `${movieName} ${jubileeName}`, `${movieName} ${dayCount} days`,
    `${movieName} box office`, "Odia box office", "Ollywood", jubileeName].join(", ");

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${title}
  description:    ${ai.metaDescription}
  keywords:       ${keywords}
  canonical:      ${SITE_URL}/blog/${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       ${title}
  og:description: ${ai.metaDescription}
  og:url:         ${SITE_URL}/blog/${slug}
  og:image:       ${ogImage}
  og:type:        article
  og:locale:      en_IN
  article:published_time: ${dp}
  article:modified_time:  ${dp}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:title:  ${title}
  twitter:description: ${ai.metaDescription}
  twitter:image:  ${ogImage}
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(title)},
      "description": ${JSON.stringify(ai.metaDescription)},
      "image": ${JSON.stringify(ogImage)},
      "datePublished": "${dp}",
      "dateModified": "${dp}",
      "inLanguage": "en",
      "keywords": ${JSON.stringify(keywords)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE_URL}/blog/${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(movieName)}, "item": "${SITE_URL}${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": ${JSON.stringify(jubileeName)}, "item": "${SITE_URL}/blog/${slug}" }
      ]
    }
  ]
}
</script>

<style>
${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="text-align:center;padding:24px 0;margin-bottom:20px;">
  <div style="display:inline-block;background:linear-gradient(135deg,rgba(201,151,58,0.2),rgba(201,151,58,0.05));border:2px solid rgba(201,151,58,0.4);border-radius:16px;padding:18px 32px;">
    <div style="font-size:2rem;margin-bottom:8px;">${jubileeType === "silver" ? "🥈" : "🏆"}</div>
    <div style="font-size:1.1rem;font-weight:900;color:#c9973a;letter-spacing:0.05em;">${jubileeName.toUpperCase()}</div>
    <div style="font-size:0.85rem;color:#888;margin-top:4px;">${dayCount} Days in Theatres</div>
  </div>
</div>

<h1 style="font-size:1.45rem;font-weight:900;color:#fff;line-height:1.25;margin:0 0 18px;">${title}</h1>

<section id="intro" style="${css.card}">
  <h2 style="${css.h2}">${ai.headline || jubileeName + " Achievement"}</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.introParagraph || ""}</p>
</section>

<section id="jubilee-significance" style="${css.card}">
  <h2 style="${css.h2}">What the ${jubileeName} Means</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.jubileeSignificanceSection || ""}</p>
  <p style="color:#ccc;line-height:1.9;margin:0;font-size:0.97rem;">${ai.journeyNarrativeSection || ""}</p>
</section>

<section id="week-summary" style="${css.card}">
  <h2 style="${css.h2}">Week-by-Week Collection Summary</h2>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="${css.th}">Period</th>
        <th style="${css.th}">Net Collection</th>
      </tr>
    </thead>
    <tbody>
      ${weeklyRows}
      <tr><td style="padding:10px 14px;color:#c9973a;font-weight:800;">${dayCount}-Day Total</td><td style="padding:10px 14px;color:#c9973a;font-weight:800;">${totalNetStr}</td></tr>
    </tbody>
  </table>
</section>

<section id="industry" style="${css.card}">
  <h2 style="${css.h2}">Industry Impact \u0026 Legacy</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.industryMilestoneSection || ""}</p>
  <p style="color:#ccc;line-height:1.9;margin:0;font-size:0.97rem;">${ai.filmmakerLegacySection || ""}</p>
</section>

<section id="conclusion" style="${css.card}">
  <h2 style="${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">${ai.conclusionParagraph || ""}</p>
  <p style="font-size:0.72rem;color:#444;margin-top:15px;">
    * All figures are industry estimates sourced from Sacnilk via Ollypedia. Back to
    <a href="${movieUrl}" style="color:#c9973a;text-decoration:underline;">${movieName} Main Page</a> ·
    <a href="/box-office/${movie.slug}" style="color:#c9973a;text-decoration:underline;">Full Box Office Report</a>
  </p>
</section>

${relatedMovies.length ? `
<section id="related-movies">
  ${buildRelatedMoviesHtml(relatedMovies, "#c9973a")}
</section>` : ""}
`;
}

// ── Orchestrators ────────────────────────────────────────────────────────────
async function maybeGenerateWeekSummaryBlog(movie, sortedDays, totalNet, movieId, weekNum) {
  const weekLabels = { 2: "Second Week", 3: "Third Week", 4: "Fourth Week" };
  const weekLabel = weekLabels[weekNum] || `Week ${weekNum}`;
  const eventType = `week-${weekNum}`;

  try {
    const exists = await EventBlog.findOne({ movieId, eventType });
    if (exists) return;

    // Only generate if we have data for that week
    const weekStart = (weekNum - 1) * 7 + 1;
    const weekDays = sortedDays.filter(d => d.day >= weekStart && d.day <= weekNum * 7);
    if (weekDays.length === 0) return;

    let ai;
    if (weekNum === 2) ai = await generateSecondWeekAI(movie, sortedDays, totalNet);
    else if (weekNum === 3) ai = await generateThirdWeekAI(movie, sortedDays, totalNet);
    else ai = await generateFourthWeekAI(movie, sortedDays, totalNet);

    const totalNetStr = formatINR(totalNet);
    const week2Total = weekNum === 2 ? formatINR(sortedDays.filter(d => d.day >= 8 && d.day <= 14).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0)) : "";
    const seed = (String(movieId) + eventType).split("").reduce((s, c) => s + c.charCodeAt(0), 0);

    let title;
    if (weekNum === 2) title = getSecondWeekTitle(movie.title, totalNetStr, week2Total, seed);
    else if (weekNum === 3) title = getThirdWeekTitle(movie.title, totalNetStr, seed);
    else title = getFourthWeekTitle(movie.title, totalNetStr, seed);

    let slug;
    if (weekNum === 2) slug = buildSecondWeekSlug(movie);
    else if (weekNum === 3) slug = buildThirdWeekSlug(movie);
    else slug = buildFourthWeekSlug(movie);

    const relatedMovies = await fetchRelatedMovies(movie);
    const html = buildWeekSummaryBlogHTML(movie, sortedDays, totalNet, weekNum, weekLabel, ai, slug, title, relatedMovies);

    const blogPayload = {
      title,
      slug,
      excerpt: ai.metaDescription,
      content: html,
      category: "Box Office",
      tags: [movie.title, "Box Office", weekLabel, "Odia Cinema", "Ollywood", `${weekNum * 7} Days`].filter(Boolean),
      coverImage: movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || "",
      movieId,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      indexed: true,
      featured: false,
      seoTitle: title,
      seoDesc: ai.metaDescription
    };

    const existingBlog = await Blog.findOne({ slug });
    let blogDoc;
    if (existingBlog) {
      Object.assign(existingBlog, blogPayload);
      blogDoc = await existingBlog.save();
    } else {
      blogDoc = await Blog.create(blogPayload);
    }

    await EventBlog.create({ movieId, eventType, blogId: blogDoc._id, blogSlug: slug });
    console.log(`[EventBlog] Generated ${weekLabel} Blog for ${movie.title} (Slug: ${slug})`);
  } catch (e) {
    console.error(`[EventBlog] maybeGenerateWeekSummaryBlog (Week ${weekNum}) failed: ${e.message}`);
  }
}

async function maybeGenerateJubileblog(movie, sortedDays, totalNet, actualDay, movieId) {
  const jubileeType = actualDay >= 50 ? "golden" : "silver";
  const eventType = jubileeType === "silver" ? "silver-jubilee" : "golden-jubilee";
  const dayCount = jubileeType === "silver" ? 25 : 50;

  try {
    const exists = await EventBlog.findOne({ movieId, eventType });
    if (exists) return;

    const ai = await generateJubileeAI(movie, sortedDays, totalNet, jubileeType);
    const slug = buildJubileeSlug(movie, jubileeType);
    const totalNetStr = formatINR(totalNet);
    const seed = (String(movieId) + eventType).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const title = getJubileeTitle(movie.title, dayCount, totalNetStr, seed);

    const relatedMovies = await fetchRelatedMovies(movie);
    const html = buildJubileblogHTML(movie, sortedDays, totalNet, jubileeType, ai, slug, title, relatedMovies);

    const jubileeName = jubileeType === "silver" ? "Silver Jubilee" : "Golden Jubilee";
    const blogPayload = {
      title,
      slug,
      excerpt: ai.metaDescription,
      content: html,
      category: "Box Office",
      tags: [movie.title, "Box Office", jubileeName, `${dayCount} Days`, "Odia Cinema", "Ollywood"].filter(Boolean),
      coverImage: movie.bannerUrl || movie.posterUrl || movie.thumbnailUrl || "",
      movieId,
      movieTitle: movie.title,
      author: "Ollypedia Team",
      published: true,
      indexed: true,
      featured: false,
      seoTitle: title,
      seoDesc: ai.metaDescription
    };

    const existingBlog = await Blog.findOne({ slug });
    let blogDoc;
    if (existingBlog) {
      Object.assign(existingBlog, blogPayload);
      blogDoc = await existingBlog.save();
    } else {
      blogDoc = await Blog.create(blogPayload);
    }

    await EventBlog.create({ movieId, eventType, blogId: blogDoc._id, blogSlug: slug });
    console.log(`[EventBlog] Generated ${jubileeName} Blog for ${movie.title} after ${dayCount} days (Slug: ${slug})`);
  } catch (e) {
    console.error(`[EventBlog] maybeGenerateJubileblog (${jubileeType}) failed: ${e.message}`);
  }
}

// ── Entry Orchestrator ───────────────────────────────────────────────────────
async function triggerEventBlogs(movie, actualDay, totalNet, prevTotalNet, yesterdayStr, sortedDays, movieId) {
  try {
    const promises = [];

    // 1. Day 7 → First Week Blog
    if (actualDay === 7) {
      promises.push(maybeGenerateFirstWeekBlog(movie, sortedDays, totalNet, movieId));
    }

    // 2. Day 14 → Second Week Blog
    if (actualDay === 14) {
      promises.push(maybeGenerateWeekSummaryBlog(movie, sortedDays, totalNet, movieId, 2));
    }

    // 3. Day 21 → Third Week Blog
    if (actualDay === 21) {
      promises.push(maybeGenerateWeekSummaryBlog(movie, sortedDays, totalNet, movieId, 3));
    }

    // 4. Day 28 → Fourth Week Blog (only if meaningful collection exists)
    if (actualDay === 28 && totalNet > 0) {
      promises.push(maybeGenerateWeekSummaryBlog(movie, sortedDays, totalNet, movieId, 4));
    }

    // 5. Day 25 → Silver Jubilee Blog
    if (actualDay === 25) {
      promises.push(maybeGenerateJubileblog(movie, sortedDays, totalNet, 25, movieId));
    }

    // 6. Day 50 → Golden Jubilee Blog
    if (actualDay === 50) {
      promises.push(maybeGenerateJubileblog(movie, sortedDays, totalNet, 50, movieId));
    }

    // 7. Weekend Completed Days → Weekend Blog (Opening Weekend / 2nd / 3rd / Later)
    promises.push(maybeGenerateWeekendBlog(movie, sortedDays, actualDay, totalNet, movieId));

    // 8. Milestone crossed → Milestone Blog
    promises.push(maybeGenerateMilestoneBlog(movie, sortedDays, totalNet, prevTotalNet, movieId));

    // 9. Day 7 and Total Net >= 1 Crore → Comparison Blog
    if (actualDay === 7) {
      promises.push(maybeGenerateComparisonBlog(movie, sortedDays, totalNet, movieId));
    }

    await Promise.allSettled(promises);
  } catch (e) {
    console.error(`[EventBlog] triggerEventBlogs main wrapper failed: ${e.message}`);
  }
}


// ── Event Blog Admin API Routes ──────────────────────────────────────────────
app.get("/api/admin/event-blogs", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const total = await EventBlog.countDocuments();
    const eventBlogs = await EventBlog.find()
      .populate("movieId", "title slug posterUrl")
      .populate("blogId", "title slug published category")
      .sort({ generatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: eventBlogs
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/event-blogs/:movieId", adminAuth, async (req, res) => {
  try {
    const { movieId } = req.params;
    if (!isOid(movieId)) return res.status(400).json({ error: "Invalid movieId" });

    const eventBlogs = await EventBlog.find({ movieId })
      .populate("blogId", "title slug published category")
      .sort({ generatedAt: -1 })
      .lean();

    res.json(eventBlogs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/event-blogs/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ error: "Invalid ID" });

    const eventBlog = await EventBlog.findById(id);
    if (!eventBlog) return res.status(404).json({ error: "EventBlog record not found" });

    // Optionally delete the associated Blog document
    if (req.query.deleteBlogDoc === "true") {
      await Blog.findByIdAndDelete(eventBlog.blogId);
    }

    await EventBlog.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



// ════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/sacnilk/configs ───────────────────────────────────────────
app.get("/api/admin/sacnilk/configs", adminAuth, async (req, res) => {
  try {
    const configs = await SacnilkConfig.find().sort({ createdAt: -1 }).lean();
    res.json(configs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/admin/sacnilk/configs/:movieId ──────────────────────────────────
// Upsert a config for a movie (create or update fields)
app.put("/api/admin/sacnilk/configs/:movieId", adminAuth, async (req, res) => {
  try {
    const { movieId } = req.params;
    if (!isOid(movieId)) return res.status(400).json({ error: "Invalid movieId" });

    const movie = await Movie.findById(movieId, "title").lean();
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    const { sacnilkUrl, active } = req.body;
    const update = { movieTitle: movie.title };
    if (sacnilkUrl !== undefined) update.sacnilkUrl = sacnilkUrl;
    if (active !== undefined) update.active = active;

    const cfg = await SacnilkConfig.findOneAndUpdate(
      { movieId },
      { $set: update },
      { upsert: true, new: true }
    );
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/admin/sacnilk/configs/:movieId ───────────────────────────────
app.delete("/api/admin/sacnilk/configs/:movieId", adminAuth, async (req, res) => {
  try {
    const { movieId } = req.params;
    if (!isOid(movieId)) return res.status(400).json({ error: "Invalid movieId" });
    await SacnilkConfig.deleteOne({ movieId });
    await SacnilkLog.deleteMany({ movieId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/sacnilk/logs/:movieId ─────────────────────────────────────
app.get("/api/admin/sacnilk/logs/:movieId", adminAuth, async (req, res) => {
  try {
    const { movieId } = req.params;
    if (!isOid(movieId)) return res.status(400).json({ error: "Invalid movieId" });
    const logs = await SacnilkLog.find({ movieId }).sort({ runAt: -1 }).limit(30).lean();
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/sacnilk/scrape/:movieId ──────────────────────────────────
// Manual single-movie scrape trigger
app.post("/api/admin/sacnilk/scrape/:movieId", adminAuth, async (req, res) => {
  try {
    const { movieId } = req.params;
    if (!isOid(movieId)) return res.status(400).json({ error: "Invalid movieId" });

    const result = await scrapeSacnilkForMovie(movieId);

    // Sacnilk hadn't updated yet — no new data, nothing saved, no blog published
    if (result.skipped) {
      return res.json({
        success: true,
        skipped: true,
        netCollection: "₹0",
        netRaw: result.netRaw,
        grossRaw: result.grossRaw,
        scrapedTotal: result.scrapedTotal,
        day: null,
        date: result.date,
        blogSlug: "",
        message: `⏭ Skipped — ${result.reason}`,
      });
    }

    res.json({
      success: true,
      skipped: false,
      netCollection: result.netRaw,   // legacy field kept for backwards compat
      netRaw: result.netRaw,
      grossRaw: result.grossRaw,
      scrapedTotal: result.scrapedTotal,
      day: result.day,
      date: result.date,
      blogSlug: result.blogSlug,
      message: `Day ${result.day} (${result.date}) — Net ${result.netRaw}, Gross ${result.grossRaw}. Blog: /blog/${result.blogSlug}`,
    });
  } catch (e) {
    // Log the failure
    try {
      const { movieId } = req.params;
      await SacnilkLog.create({ movieId, status: "error", error: e.message });
      // Update lastLog on config too
      await SacnilkConfig.findOneAndUpdate(
        { movieId },
        { $set: { "lastLog.runAt": new Date(), "lastLog.status": "error", "lastLog.error": e.message } }
      );
    } catch { /* silent */ }
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/sacnilk/scrape-all ──────────────────────────────────────
// Manual "scrape all active movies" — same logic as the cron job
app.post("/api/admin/sacnilk/scrape-all", adminAuth, async (req, res) => {
  try {
    const configs = await SacnilkConfig.find({ active: true, sacnilkUrl: { $ne: "" } }).lean();
    let successCount = 0, failCount = 0;
    const results = [];

    for (const cfg of configs) {
      try {
        const r = await scrapeSacnilkForMovie(String(cfg.movieId));
        successCount++;
        results.push({
          movieId: cfg.movieId,
          movieTitle: cfg.movieTitle,
          status: "success",
          netRaw: r.netRaw,
          grossRaw: r.grossRaw,
          scrapedTotal: r.scrapedTotal,
          day: r.day,
          date: r.date,
          blogSlug: r.blogSlug,
        });
      } catch (e) {
        failCount++;
        results.push({ movieId: cfg.movieId, movieTitle: cfg.movieTitle, status: "error", error: e.message });
        // Log failure
        try {
          await SacnilkLog.create({ movieId: cfg.movieId, status: "error", error: e.message });
          await SacnilkConfig.findOneAndUpdate(
            { movieId: cfg.movieId },
            { $set: { "lastLog.runAt": new Date(), "lastLog.status": "error", "lastLog.error": e.message } }
          );
        } catch { /* silent */ }
      }
      // Small delay between requests to avoid hammering Sacnilk
      await new Promise(r => setTimeout(r, 2000));
    }

    res.json({ success: successCount, failed: failCount, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ── Keep-alive ping endpoint — no DB, no auth, ultra-lightweight ─────────────
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});
// ─────────────────────────────────────────────────────────────────────────────

//  CRON JOB — runs every day at 8:00 AM IST (= 02:30 UTC)
//  Schedule format: "30 3 * * *"  (cron uses UTC; IST = UTC+5:30)
// ════════════════════════════════════════════════════════════════════════════
cron.schedule("30 6 * * *", async () => {
  console.log(`[Sacnilk Cron] Starting daily scrape at ${new Date().toISOString()}`);

  try {
    const configs = await SacnilkConfig.find({
      active: true,
      sacnilkUrl: { $ne: "" },
    }).lean();

    console.log(`[Sacnilk Cron] ${configs.length} active movie(s) to scrape`);

    for (const cfg of configs) {
      try {
        const r = await scrapeSacnilkForMovie(String(cfg.movieId));
        console.log(`[Sacnilk Cron] ✅ ${cfg.movieTitle}: Day ${r.day} = ${r.netRaw}`);
      } catch (e) {
        console.error(`[Sacnilk Cron] ❌ ${cfg.movieTitle}: ${e.message}`);
        // Log failure
        try {
          await SacnilkLog.create({ movieId: cfg.movieId, status: "error", error: e.message });
          await SacnilkConfig.findOneAndUpdate(
            { movieId: cfg.movieId },
            { $set: { "lastLog.runAt": new Date(), "lastLog.status": "error", "lastLog.error": e.message } }
          );
        } catch { /* silent */ }
      }
      // Polite delay between movies
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`[Sacnilk Cron] Finished at ${new Date().toISOString()}`);
  } catch (e) {
    console.error(`[Sacnilk Cron] Fatal error: ${e.message}`);
  }
}, {
  timezone: "Asia/Kolkata",
});

console.log("✅ Sacnilk cron scheduled: daily at 8:00 AM IST");



// ════════════════════════════════════════════════════════════════
// VISITOR ANALYTICS — PUBLIC + ADMIN ROUTES
// ════════════════════════════════════════════════════════════════

// POST /api/track — called by Next.js VisitorTracker component on every page view
app.post("/api/track", async (req, res) => {
  res.json({ ok: true }); // respond immediately, never block the user

  try {
    const ua = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
      || req.socket?.remoteAddress || "";
    const { page = "/", referrer = "" } = req.body;

    const isMobile = /Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTablet = /iPad|Tablet|PlayBook/i.test(ua);
    const device = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";

    const os = /Windows/i.test(ua) ? "Windows"
      : /Android/i.test(ua) ? "Android"
        : /iPhone|iPad/i.test(ua) ? "iOS"
          : /Mac/i.test(ua) ? "macOS"
            : /Linux/i.test(ua) ? "Linux" : "Other";

    const browser = /Edg\//i.test(ua) ? "Edge"
      : /OPR\//i.test(ua) ? "Opera"
        : /Chrome/i.test(ua) ? "Chrome"
          : /Firefox/i.test(ua) ? "Firefox"
            : /Safari/i.test(ua) ? "Safari" : "Other";

    let country = "", city = "";
    if (ip && ip !== "::1" && ip !== "127.0.0.1" && !ip.startsWith("::ffff:127")) {
      try {
        const geo = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,status`, { signal: AbortSignal.timeout(2000) });
        const gd = await geo.json();
        if (gd.status === "success") { country = gd.country || ""; city = gd.city || ""; }
      } catch { /* geo timeout */ }
    }

    await VisitorLog.create({ ip, country, city, device, os, browser, page, referrer, visitedAt: new Date() });
  } catch { /* never throw */ }
});

// GET /api/admin/analytics — full analytics dashboard data
app.get("/api/admin/analytics", adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const day = new Date(now); day.setHours(0, 0, 0, 0);
    const week = new Date(now); week.setDate(now.getDate() - 7);
    const month = new Date(now); month.setDate(now.getDate() - 30);

    const [
      totalVisits, todayVisits, weekVisits, monthVisits,
      byDevice, byOS, byBrowser, byCountry, topPages, recentVisits, dailyTrend,
    ] = await Promise.all([
      VisitorLog.countDocuments(),
      VisitorLog.countDocuments({ visitedAt: { $gte: day } }),
      VisitorLog.countDocuments({ visitedAt: { $gte: week } }),
      VisitorLog.countDocuments({ visitedAt: { $gte: month } }),

      VisitorLog.aggregate([{ $group: { _id: "$device", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      VisitorLog.aggregate([{ $group: { _id: "$os", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      VisitorLog.aggregate([{ $group: { _id: "$browser", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      VisitorLog.aggregate([
        { $match: { country: { $ne: "" } } },
        { $group: { _id: "$country", count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
      VisitorLog.aggregate([
        { $group: { _id: "$page", count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
      VisitorLog.find().sort({ visitedAt: -1 }).limit(50).lean(),
      VisitorLog.aggregate([
        { $match: { visitedAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$visitedAt", timezone: "Asia/Kolkata" } },
            count: { $sum: 1 },
          }
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      summary: { totalVisits, todayVisits, weekVisits, monthVisits },
      byDevice, byOS, byBrowser, byCountry, topPages, recentVisits, dailyTrend,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/analytics/clear — remove logs older than 90 days
app.delete("/api/admin/analytics/clear", adminAuth, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await VisitorLog.deleteMany({ visitedAt: { $lt: cutoff } });
    res.json({ deleted: result.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Serve Vite frontend build (Render.com deployment) ──────────────
// "dist" is Vite's default output folder — make sure your build
// command is: cd frontend && npm run build  (or wherever your React app lives)
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// SPA fallback — any route that isn't /api/* gets index.html
// so React Router can handle /movie/abc, /song/xyz etc. on refresh
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});
// ════════════════════════════════════════════════════════════════════════════

app.listen(process.env.PORT || 4000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 4000}`);

  // ── Self-ping every 2 minutes to prevent Render free-tier spin-down ──────
  // Hits GET /api/ping — lightweight no-DB endpoint defined just above.
  // Set SELF_URL in your Render environment variables:
  //   SELF_URL = https://your-app-name.onrender.com
  const SELF_URL = process.env.SELF_URL;
  if (SELF_URL) {
    const PING_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
    setInterval(async () => {
      try {
        const res = await fetch(`${SELF_URL}/api/ping`);
        console.log(`[Keep-Alive] Ping → ${res.status} at ${new Date().toISOString()}`);
      } catch (e) {
        console.warn(`[Keep-Alive] Ping failed: ${e.message}`);
      }
    }, PING_INTERVAL_MS);
    console.log(`✅ Keep-alive self-ping active every 2 min → ${SELF_URL}/api/ping`);
  } else {
    console.log(`ℹ️  Keep-alive disabled — set SELF_URL env var to enable (e.g. https://your-app.onrender.com)`);
  }
  // ─────────────────────────────────────────────────────────────────────────
});
// ── KEEP-ALIVE PATCH — replace the last app.listen() above with this ────────
// (Already patched inline below — this comment is for reference only)