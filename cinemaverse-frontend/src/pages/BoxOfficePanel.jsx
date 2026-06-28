// src/components/admin/BoxOfficePanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  Complete rewrite — User-friendly Box Office Panel
//
//  Changes vs original:
//  1. Fixed data not showing — loadDays now properly resets state before fetch
//  2. Better UI — grid layout for inputs, cleaner spacing, summary card
//  3. Verdict REMOVED from table, summary card, and all blog content
//  4. Per-day AI blog generation using Groq (/api/admin/generate-article)
//     - Toggle inside the Add/Edit day modal
//     - Prompt auto-fills with movie + all days data, fully editable
//     - Generates content via Groq, user can edit before saving
//  5. Each day submission creates a SEPARATE blog:
//     Day 1 blog  → Day 1 data only
//     Day 2 blog  → Day 1 + Day 2 (cumulative)
//     Day N blog  → all days 1..N (cumulative)
//  6. Blog title format: "{Movie} ({Year}) Day {N} Box Office Collection"
//  7. Blog slug:  {movie-slug}-day-{n}-box-office-collection
//     New slug per day → new blog post per day (not overwriting the same post)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import { API, getAdminToken } from "../api/api";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * parseToRupees — converts any currency string to raw rupees (integer).
 * Mirrors parseToRupeesGlobal on the server exactly.
 *   "₹7.00 L"   → 700000
 *   "7L"        → 700000
 *   "0.1 Cr"    → 1000000
 *   "3.36Cr"    → 33600000
 *   "700000"    → 700000  (bare integer ≥ 1000 trusted as rupees)
 *   "7"         → 0       (bare tiny number with no unit = discard)
 */
const parseToRupees = (str) => {
  if (!str && str !== 0) return 0;
  const s = String(str).replace(/[₹,\s]/g, "").toLowerCase();
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  if (s.includes("cr") || s.includes("crore")) return Math.round(n * 1_00_00_000);
  if (s.includes("l") || s.includes("lakh"))   return Math.round(n * 1_00_000);
  if (n >= 1000) return Math.round(n);
  return 0;
};

/** Format raw rupees → "₹X.XX Cr" / "₹X.XX L" */
const fmtINR = (val) => {
  if (val === undefined || val === null || val === "") return "—";
  const n = typeof val === "number" ? val : parseToRupees(val);
  if (!n || isNaN(n)) return val || "—";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
};

/** parseNum — alias of parseToRupees for use in chart/table calculations */
const parseNum = parseToRupees;

// ─── Bulk Upload helpers ───────────────────────────────────────────────────

/** GST_RATE — Gross = Net × 1.18 (18% entertainment tax/GST). Shared by the
 *  Bulk Upload feature; mirrors the same constant inside DayModal and on
 *  the server (GST_RATE_GLOBAL) so previews always match what gets saved. */
const GST_RATE = 1.18;

/** addDaysToISO — Day 1 == releaseDate itself, Day N == releaseDate + (N-1).
 *  Mirrors addDaysToISO() on the server exactly, so the bulk-upload preview
 *  always matches the date that actually gets stored. */
const addDaysToISO = (releaseDate, dayNum) => {
  if (!releaseDate) return "";
  const d = new Date(releaseDate);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + (Number(dayNum) - 1));
  return d.toISOString().slice(0, 10);
};

/** buildBoxOfficeTemplateCSV — generates the downloadable CSV template.
 *  The Date column is pre-filled purely as a reference for the person
 *  filling it in — the server always recalculates the real date from the
 *  movie's releaseDate when the file is uploaded back, so whatever ends up
 *  in this column on save (even if Excel reformats it) is ignored. */
const buildBoxOfficeTemplateCSV = (movie, startDay, count) => {
  const rows = [["Day", "Date (reference only — recalculated on upload)", "Net Collection"]];
  for (let i = 0; i < count; i++) {
    const day  = startDay + i;
    const date = addDaysToISO(movie?.releaseDate, day);
    rows.push([`Day ${day}`, date || "TBA", ""]);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
};

/** downloadCSV — triggers a browser file download for a CSV string. */
const downloadCSV = (csvText, filename) => {
  const blob = new Blob(["\uFEFF" + csvText], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** parseCSVText — tiny quoted-field-aware CSV parser (no external deps
 *  needed). Good enough for the simple 3-column template this feature
 *  generates and expects back. */
const parseCSVText = (text) => {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow    = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") pushField();
      else if (c === "\r") { /* skip, \n below ends the row */ }
      else if (c === "\n") pushRow();
      else field += c;
    }
  }
  if (field.length || row.length) pushRow();
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
};

/** extractDayNumber — pulls an integer day number out of strings like
 *  "Day 12", "12", "day12", "Day-12". Returns null if nothing usable. */
const extractDayNumber = (s) => {
  const m = String(s ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

/** parseBulkCSVRows — turns parsed CSV rows (incl. header row) into
 *  { day, netRaw } entries, matching columns by header keyword ("day" /
 *  "net") so it tolerates Excel re-saving or re-ordering the columns. */
const parseBulkCSVRows = (rows) => {
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h).toLowerCase());
  let dayIdx = header.findIndex((h) => h.includes("day"));
  let netIdx = header.findIndex((h) => h.includes("net"));
  if (dayIdx === -1) dayIdx = 0;
  if (netIdx === -1) netIdx = header.length - 1;

  return rows.slice(1)
    .map((r) => ({ day: extractDayNumber(r[dayIdx]), netRaw: String(r[netIdx] ?? "").trim() }))
    .filter((r) => r.day && r.netRaw);
};

/** parseBulkPasteText — accepts free-typed/pasted lines like:
 *    "Day 1 - 1500000"   "Day1: 15L"   "1,1500000"   "1\t1.2 Cr"
 *  one entry per line, and returns { day, netRaw } entries. */
const parseBulkPasteText = (text) => {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const day = extractDayNumber(line);
      if (!day) return null;
      const netRaw = line
        .replace(/^\s*day\s*-?\s*\d+\s*/i, "")
        .replace(/^\d+\s*/, "")
        .replace(/^[\s,:\-\t]+/, "")
        .trim();
      return netRaw ? { day, netRaw } : null;
    })
    .filter(Boolean);
};

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

const getYear = (releaseDate) =>
  releaseDate ? new Date(releaseDate).getFullYear() : "";

// ─── Cast/Crew extractor (mirrors page.tsx logic) ─────────────────────────────
const extractCastInfo = (movie) => {
  const cast = Array.isArray(movie.cast) ? movie.cast : [];

  const findByRole = (keywords) =>
    cast.find((m) => {
      const r = (m.role || m.type || "").toLowerCase();
      return keywords.some((k) => r.includes(k));
    })?.name || null;

  // Director — pure "director" only, not music/art/action/assistant director
  const directorEntry = cast.find((m) => {
    const r = (m.role || m.type || "").toLowerCase().trim();
    return r === "director" || r === "film director" || r === "movie director" ||
      (r.includes("director") && !["music","art","action","stunt","assistant","co-","associate"].some(x => r.includes(x)));
  });
  const directorName = directorEntry?.name || movie.director || null;

  // Producer — pure "producer" only
  const producerEntry = cast.find((m) => {
    const r = (m.role || m.type || "").toLowerCase().trim();
    return r === "producer" ||
      (r.includes("producer") && !["executive","co-","line","associate","assistant"].some(x => r.includes(x)));
  });
  const producerName = producerEntry?.name || movie.producer || null;

  const musicDirector = findByRole(["music director"]) || null;
  const writer        = findByRole(["writer","screenplay","story","dialogue"]) || null;
  const dop           = findByRole(["cinematographer","dop","director of photography"]) || null;
  const editor        = findByRole(["editor"]) || null;

  // All on-screen cast (not pure crew)
  const CREW_KW = ["director","producer","writer","screenplay","story","dialogue","music director","cinematographer","dop","editor","choreographer","art director","costume","sound","stunt","vfx"];
  const actingKW = ["actor","actress","lead","hero","heroine","supporting","cameo","special appearance"];
  const actors = cast.filter((m) => {
    const r = (m.role || m.type || "").toLowerCase();
    const isCrew = CREW_KW.some((k) => r.includes(k)) && !actingKW.some((k) => r.includes(k));
    return !isCrew;
  });

  const leadActors    = actors.slice(0, 4).map((m) => m.name).filter(Boolean);
  const leadActresses = actors
    .filter((m) => { const r = (m.role || m.type || "").toLowerCase(); return r.includes("actress") || r.includes("heroine"); })
    .slice(0, 2).map((m) => m.name).filter(Boolean);

  return { directorName, producerName, musicDirector, writer, dop, editor, leadActors, leadActresses };
};

/**
 * classifyBoxOfficeDayType — SEO ENHANCEMENT (mirrors server.js)
 * Computes a contextual "angle" for targetDay purely from data already
 * passed into buildAiPrompt/parseAiSections — no new props, no signature
 * changes at call sites, no schema changes.
 */
const classifyBoxOfficeDayType = (targetDay, daysUpToN, totalNet, movie) => {
  const sorted = [...(daysUpToN || [])].sort((a, b) => a.day - b.day);
  const todayEntry = sorted.find((d) => d.day === targetDay);
  const dateStr = todayEntry?.date || "";
  const prevTotalNetNum = sorted
    .filter((d) => d.day < targetDay)
    .reduce((s, d) => s + (parseNum(d.net) || 0), 0);

  const tags = [];
  const dow = dateStr ? new Date(dateStr).getDay() : null;
  const isWeekend = dow === 0 || dow === 5 || dow === 6;

  if (targetDay === 1) tags.push("opening-day");
  else if (targetDay === 2) tags.push("day-two");
  else if (targetDay === 3) tags.push("day-three");
  else if (targetDay === 7) tags.push("first-week-closing");
  else if (targetDay === 10) tags.push("day-ten");
  else if (targetDay === 15) tags.push("day-fifteen");

  if (targetDay > 3) tags.push(isWeekend ? "weekend" : "weekday");

  const MILESTONES_CR = [1, 2, 3, 5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 200];
  const crossed = MILESTONES_CR.find((cr) => {
    const r = cr * 1_00_00_000;
    return prevTotalNetNum < r && (totalNet || 0) >= r;
  }) || null;
  if (crossed) tags.push(`milestone-${crossed}cr`);

  if (movie?.ottReleaseDate && dateStr) {
    const ottD = new Date(movie.ottReleaseDate);
    const curD = new Date(dateStr);
    if (!isNaN(ottD.getTime())) {
      const diffDays = Math.round((ottD - curD) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 7) tags.push("approaching-ott");
      if (diffDays < 0) tags.push("post-ott-theatrical");
    }
  }

  if (targetDay >= 25) tags.push("extended-run");
  if (!tags.length) tags.push("standard-day");

  return { tags, isWeekend, milestoneCroreCrossed: crossed };
};

// Builds the AI prompt — returns structured JSON sections for the sample HTML template
const buildAiPrompt = (movie, daysUpToN, totalNet, totalGross, targetDay) => {
  const year   = getYear(movie.releaseDate);
  const sorted = [...daysUpToN].sort((a, b) => a.day - b.day);
  const tableText = sorted
    .map((d) => `Day ${d.day}${d.date ? ` (${d.date})` : ""}: Net ${fmtINR(d.net)}, Gross ${fmtINR(d.gross)}${d.note ? ` — ${d.note}` : ""}`)
    .join("\n");

  const ci = extractCastInfo(movie);
  const castLine = [
    ci.directorName ? `Director: ${ci.directorName}` : "",
    ci.producerName ? `Producer: ${ci.producerName}` : "",
    ci.musicDirector ? `Music Director: ${ci.musicDirector}` : "",
    ci.writer ? `Writer: ${ci.writer}` : "",
    ci.leadActors.length ? `Cast: ${ci.leadActors.join(", ")}` : "",
    ci.leadActresses.length ? `Actresses: ${ci.leadActresses.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const dayClass = classifyBoxOfficeDayType(targetDay, daysUpToN, totalNet, movie);
  const dayTags = dayClass.tags;
  const dayTagLine = dayTags.join(", ");

  return `You are writing a box office collection article for the Odia film website Ollypedia.

Movie: ${movie.title}${year ? ` (${year})` : ""}
${movie.language ? `Language: ${movie.language}` : "Language: Odia"}
Genre: ${Array.isArray(movie.genre) ? movie.genre.join(", ") : (movie.genre || "Drama")}
Release Date: ${movie.releaseDate ? new Date(movie.releaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""}
${castLine}
${movie.budget ? `Budget: ${movie.budget}` : ""}

Day-wise collection data (all days up to Day ${targetDay}):
${tableText}

Total Net: ${fmtINR(totalNet)}
Total Gross: ${fmtINR(totalGross)}

CONTEXT FOR TODAY (Day ${targetDay}): ${dayTagLine}.
${dayTags.includes("opening-day") ? "This is the FILM'S OPENING DAY — focus on first impressions, opening-day buzz, and how it compares to expectations going in." : ""}
${dayTags.includes("weekend") ? "Today falls in the WEEKEND box-office window — focus heavily on weekend vs weekday performance and family/leisure footfalls." : ""}
${dayTags.includes("weekday") ? "Today is a WEEKDAY — focus on how the film is holding up after the opening rush and what weekday collections reveal about word-of-mouth." : ""}
${dayTags.includes("first-week-closing") ? "Today marks the close of WEEK ONE — focus on the overall week-one verdict and what it signals for week two." : ""}
${dayTags.some(t => t.startsWith("milestone-")) ? `The film has just CROSSED A COLLECTION MILESTONE today (${dayTags.find(t => t.startsWith("milestone-"))}) — lead with this milestone and what it means for the film's standing in Ollywood.` : ""}
${dayTags.includes("approaching-ott") ? "The film's OTT release is approaching within the next week — mention how the theatrical run is winding down ahead of the digital premiere." : ""}
${dayTags.includes("extended-run") ? "The film is in an EXTENDED THEATRICAL RUN (25+ days) — focus on staying power, repeat audiences, and longevity rather than day-on-day swings." : ""}

You must respond ONLY with a valid JSON object (no markdown, no code fences, no extra text). The JSON must have exactly these keys:

{
  "seoHeadline": "A compelling 10-15 word headline for the h1 tag, reflecting today's specific context above (not a generic 'Day N collection' phrase)",
  "introParagraph": "2-3 sentences introducing the film and Day ${targetDay} performance. Mention the net and gross figures naturally, and reflect today's context.",
  "boxOfficeAnalysis": "2-3 paragraphs (plain text, no HTML tags) covering the day-wise journey and trend, written specifically through today's context above — do NOT just restate yesterday's analysis with new numbers.",
  "audienceResponse": "1-2 paragraphs about how Odia audiences and reviewers are responding — word of mouth, social media buzz, repeat viewing. Vary the framing based on how many days the film has run.",
  "performanceAnalysis": "2 paragraphs analysing the film's performance relative to its budget and typical Odia cinema benchmarks. Mention total net ${fmtINR(totalNet)} and gross ${fmtINR(totalGross)}.",
  "weekendWeekdayComparison": "1-2 paragraphs specifically comparing weekend and weekday collection patterns for this film so far, and what that pattern suggests about audience type (family/youth/repeat viewers).",
  "occupancyTrend": "1 paragraph describing the likely occupancy trend (rising, falling, steady) across screens based on the collection numbers — do not invent exact percentages, describe the trend qualitatively.",
  "prediction": "1-2 paragraphs predicting upcoming weekend/week performance based on current trend.",
  "industryImpact": "1 paragraph on what this film's performance means for the wider Ollywood (Odia film industry) — e.g. theatre footfalls, confidence in the genre, impact on upcoming Odia releases.",
  "futureOutlook": "1-2 paragraphs on the film's likely box office path from here — upcoming milestones, competition from other releases, or OTT timing if relevant.",
  "finalVerdict": "2-3 sentences summarising the film's box office status after Day ${targetDay}. Do NOT use words like Hit, Flop, Average, Super-Hit — just describe the collection factually."
}

Rules:
- All values must be plain text only — no HTML, no bullet points, no markdown
- Write for an Odia cinema (Ollywood) audience
- Keep each section concise but informative
- Make this article meaningfully different from a generic "Day N" template — lean into today's specific context listed above
- Do not invent or fabricate collection figures — only use the data provided above`;
};

// Parse AI JSON response into sections (with safe fallbacks)
// SEO ENHANCEMENT: extended from 7 to 11 sections so every day's blog gets
// genuinely different analysis instead of a reworded copy of the previous
// day. Fallbacks vary by the day's contextual tags (opening day, weekend,
// milestone crossed, etc.) even when the AI call is skipped/unavailable.
const parseAiSections = (aiText, movie, targetDay, totalNet, totalGross, daysUpToN = []) => {
  const year = getYear(movie.releaseDate);
  const dayClass = classifyBoxOfficeDayType(targetDay, daysUpToN, totalNet, movie);
  const tagSet = new Set(dayClass.tags);
  const isWeekendDay = tagSet.has("weekend");
  const milestoneCr = [...tagSet].find(t => t.startsWith("milestone-"))?.replace("milestone-", "").replace("cr", "");

  const fallback = (key) => {
    const defaults = {
      seoHeadline:       `${movie.title}${year ? ` (${year})` : ""} Day ${targetDay} Box Office Collection Report`,
      introParagraph:    `${movie.title}${year ? ` (${year})` : ""} continues its theatrical run. On Day ${targetDay}, the film has collected a total net of ${fmtINR(totalNet)} and gross of ${fmtINR(totalGross)} at the Odia box office.`,
      boxOfficeAnalysis: tagSet.has("opening-day")
        ? `${movie.title} opened in theatres across Odisha with this Day 1 collection setting the baseline for the film's theatrical run.`
        : tagSet.has("first-week-closing")
          ? `${movie.title} has now completed its first full week in theatres, with a week-one tally of ${fmtINR(totalNet)} net.`
          : isWeekendDay
            ? `${movie.title} is riding the weekend box office window on Day ${targetDay}, typically a period of higher footfalls than weekdays.`
            : `${movie.title} has shown a steady run at the box office on Day ${targetDay}, a regular weekday in its theatrical journey.`,
      audienceResponse:  `Audiences across Odisha have given ${movie.title} a warm response. The film continues to attract viewers with positive word of mouth${tagSet.has("extended-run") ? ", helping it sustain a long theatrical run" : ""}.`,
      performanceAnalysis:`With a total net collection of ${fmtINR(totalNet)} and gross of ${fmtINR(totalGross)}, ${movie.title} has delivered a notable performance for Odia cinema.`,
      weekendWeekdayComparison: isWeekendDay
        ? `Day ${targetDay} falls within the weekend box office window, when Odia films typically see higher occupancy than weekdays.`
        : `Day ${targetDay} is a weekday for ${movie.title}, and weekday collections are usually lower than the opening weekend.`,
      occupancyTrend: `Occupancy levels for ${movie.title} on Day ${targetDay} are estimated based on trade trends for similarly positioned Odia releases${isWeekendDay ? ", with weekend shows typically running fuller" : ", with weekday shows generally running at moderate occupancy"}.`,
      prediction:        `Based on current trends, ${movie.title} is expected to maintain momentum in the coming days, especially during weekends.`,
      industryImpact: `${movie.title}'s box office run is being closely watched within Ollywood as a marker of audience appetite for this genre of Odia cinema.`,
      futureOutlook: milestoneCr
        ? `Having just crossed the ₹${milestoneCr} Cr mark, ${movie.title} enters its next phase of theatrical run with a fresh milestone to build on.`
        : `Looking ahead, ${movie.title}'s box office trajectory will depend on how it performs through the next weekend.`,
      finalVerdict:      `${movie.title} has collected ${fmtINR(totalNet)} net and ${fmtINR(totalGross)} gross after ${targetDay} days. All figures are industry estimates. Source: Ollypedia.`,
    };
    return defaults[key] || "";
  };

  const keys = [
    "seoHeadline", "introParagraph", "boxOfficeAnalysis", "audienceResponse",
    "performanceAnalysis", "weekendWeekdayComparison", "occupancyTrend",
    "prediction", "industryImpact", "futureOutlook", "finalVerdict",
  ];

  if (!aiText?.trim()) {
    return Object.fromEntries(keys.map(k => [k, fallback(k)]));
  }

  try {
    // Strip markdown code fences if present
    const clean = aiText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(clean);
    return Object.fromEntries(keys.map(k => [k, parsed[k] || fallback(k)]));
  } catch {
    // AI returned prose instead of JSON — use it as the analysis section, rest as fallbacks
    return {
      seoHeadline:        fallback("seoHeadline"),
      introParagraph:     fallback("introParagraph"),
      boxOfficeAnalysis:  aiText.trim(),
      audienceResponse:   fallback("audienceResponse"),
      performanceAnalysis: fallback("performanceAnalysis"),
      weekendWeekdayComparison: fallback("weekendWeekdayComparison"),
      occupancyTrend:     fallback("occupancyTrend"),
      prediction:         fallback("prediction"),
      industryImpact:     fallback("industryImpact"),
      futureOutlook:       fallback("futureOutlook"),
      finalVerdict:       fallback("finalVerdict"),
    };
  }
};

// Converts plain text with paragraphs into <p> tags
const toParagraphs = (text) =>
  String(text || "")
    .replace(/`/g, "&#96;")   // ← prevent backticks in AI text from breaking template literals
    .trim()
    .split(/\n{2,}/)
    .map(chunk => chunk.split(/\n/).map(l => l.trim()).filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .map(p => `<p>${p}</p>`)
    .join("\n");

// Builds the full HTML blog matching the sample_html.txt template exactly
// ─── DROP-IN REPLACEMENT for buildBlogContent() ──────────────────────────────
// Paste this entire function in place of the existing buildBlogContent in BoxOfficePanel.jsx
// All helpers (fmtINR, slugify, getYear, extractCastInfo, toParagraphs, parseAiSections) remain unchanged.

// ═══════════════════════════════════════════════════════════════════════════════
//  DROP-IN REPLACEMENT  →  buildBlogContent()
//  Paste inside BoxOfficePanel.jsx in place of the existing function.
//  All other helpers stay unchanged:
//    fmtINR · parseNum · slugify · getYear · extractCastInfo
//    toParagraphs · parseAiSections
// ═══════════════════════════════════════════════════════════════════════════════

const buildBlogContent = (movie, daysUpToN, totalNet, totalGross, targetDay, sectionsOrRaw, blogSlug) => {

  // ── Core data ───────────────────────────────────────────────────────────────
  const year          = getYear(movie.releaseDate);
  const sorted        = [...daysUpToN].sort((a, b) => a.day - b.day);
  const sections      = (sectionsOrRaw && typeof sectionsOrRaw === "object" && "seoHeadline" in sectionsOrRaw)
    ? sectionsOrRaw
    : parseAiSections(sectionsOrRaw, movie, targetDay, totalNet, totalGross, daysUpToN);

  const movieName        = movie.title || "Unknown Movie";
  const movieNameNoSpace = movieName.replace(/\s+/g, "");
  const releaseDate      = movie.releaseDate
    ? new Date(movie.releaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const genreArr    = Array.isArray(movie.genre) ? movie.genre : (movie.genre ? [movie.genre] : []);
  const genre       = genreArr.join(", ") || "Drama";
  const movieSlug   = slugify(`${movieName}${year ? ` (${year})` : ""}`);
  const boxOfficeUrl = `/box-office/${movieSlug}`;

  const crew = extractCastInfo(movie);
  const { directorName, producerName, musicDirector, writer, dop, editor, leadActors, leadActresses } = crew;

  const currentDay    = sorted.find(d => d.day === targetDay) || sorted[sorted.length - 1] || {};
  const dayNet        = currentDay.net   ? fmtINR(currentDay.net)   : "—";
  const dayGross      = currentDay.gross ? fmtINR(currentDay.gross) : "—";
  const totalNetStr   = fmtINR(totalNet);
  const totalGrossStr = fmtINR(totalGross);

  // ── Paragraph helper ────────────────────────────────────────────────────────
  const pWrap = (text) =>
    toParagraphs(text)
      .replace(/<p>/g, `<p style="color:#ccc;line-height:1.9;margin:0 0 16px;font-size:0.97rem;">`);

  // ── SEO Keywords  (exact structure you requested) ───────────────────────────
  // ORDER: Movie variants → Cast/Crew → General Ollywood
  const buildKeywordsArr = () => {
    const kw = [];

    // 1. Movie name — info variants
    kw.push(
      `${movieName} Odia Movie`,
      `${movieName} Movie Details`,
      `${movieName} Cast`,
      `${movieName} Cast and Crew`,
      `${movieName} Story`,
      `${movieName} Review`,
      `${movieName} Trailer`,
      `${movieName} Teaser`,
      `${movieName} Songs`,
      `${movieName} Music`,
      `${movieName} Release Date`,
    );

    // 2. Movie name — box office variants
    kw.push(
      `${movieName} Box Office Collection`,
      `${movieName} Day ${targetDay} Collection`,
      `${movieName} Day ${targetDay} Box Office Collection`,
      `${movieName} Total Collection`,
      `${movieName} Total Box Office Collection`,
      `${movieName} Gross Collection`,
      `${movieName} Net Collection`,
      `${movieName} Opening Day Collection`,
      `${movieName} First Day Collection`,
      `${movieName} Week 1 Collection`,
      `${movieName} Box Office Report`,
      `${movieName} Box Office Prediction`,
      `${movieName} Worldwide Collection`,
      `${movieName} Audience Response`,
      `${movieName} Movie Update`,
      `${movieName} Latest News`,
      `${movieName} Movie Collection`,
      year ? `${movieName} (${year})` : null,
      year ? `${movieName} (${year}) Box Office Collection` : null,
      year ? `${movieName} (${year}) Total Collection` : null,
    );

    // 3. Director
    if (directorName) {
      kw.push(
        directorName,
        `${directorName} Movie`,
        `${directorName} Odia Movie`,
        `${directorName} Director`,
      );
    }

    // 4. Producer
    if (producerName) {
      kw.push(
        producerName,
        `${producerName} Producer`,
      );
    }

    // 5. Lead Actors (each with 3 variants)
    leadActors.forEach(a => kw.push(
      a,
      `${a} Movie`,
      `${a} Odia Movie`,
    ));

    // 6. Lead Actresses (each with 3 variants)
    leadActresses.forEach(a => kw.push(
      a,
      `${a} Movie`,
      `${a} Odia Movie`,
    ));

    // 7. Music Director
    if (musicDirector) {
      kw.push(
        musicDirector,
        `${musicDirector} Music Director`,
      );
    }

    // 8. Writer
    if (writer) {
      kw.push(
        writer,
        `${writer} Writer`,
      );
    }

    // 9. DOP / Cinematographer
    if (dop) {
      kw.push(
        dop,
        `${dop} Cinematographer`,
      );
    }

    // 10. Editor
    if (editor) {
      kw.push(
        editor,
        `${editor} Editor`,
      );
    }

    // 11. Genre variants
    genreArr.forEach(g => kw.push(
      `${g} Odia Movie`,
      `Odia ${g} Film`,
    ));

    // 12. General Ollywood / industry keywords
    kw.push(
      "Odia Movie Collection",
      "Odia Movie Details",
      "Odia Movie Cast",
      "Odia Movie Review",
      "Odia Movie Trailer",
      "Odia Movie Release Date",
      "Odia Movie Box Office",
      "Odia Box Office Collection",
      "Ollywood Box Office Collection",
      "Ollywood Movie Collection",
      "Ollywood Movie Details",
      "Ollywood News",
      "Latest Odia Movie News",
      "Odia Cinema News",
      "Odia Film Industry",
      "Trending Odia Movie",
      year ? `New Odia Movie ${year}` : "New Odia Movie",
      "Best Odia Movies",
      "Ollywood Updates",
    );

    return kw.filter(Boolean);
  };

  const keywordsArr = buildKeywordsArr();
  const keywordsStr = keywordsArr.join(",\n");

  // ── Hashtags ────────────────────────────────────────────────────────────────
  const tags = [
    `#${movieNameNoSpace}`,
    `#${movieNameNoSpace}Collection`,
    `#${movieNameNoSpace}BoxOffice`,
    `#${movieNameNoSpace}Day${targetDay}`,
    directorName  ? `#${directorName.replace(/\s+/g,"")}` : null,
    producerName  ? `#${producerName.replace(/\s+/g,"")}` : null,
    musicDirector ? `#${musicDirector.replace(/\s+/g,"")}` : null,
    ...leadActors.map(a => `#${a.replace(/\s+/g,"")}`),
    ...leadActresses.map(a => `#${a.replace(/\s+/g,"")}`),
    "#OdiaMovie", "#Ollywood", "#OdiaCinema", "#Ollypedia",
    "#BoxOfficeCollection", "#OllywoodBoxOffice", "#OllywoodNews",
    year ? `#OdiaMovie${year}` : null,
  ].filter(Boolean);

  // ── Movie info rows ─────────────────────────────────────────────────────────
  const infoRows = [
    ["Movie Name",       movieName],
    ["Language",         "Odia"],
    ["Industry",         "Ollywood"],
    ["Genre",            genre],
    releaseDate          ? ["Release Date",     releaseDate]               : null,
    directorName         ? ["Director",         directorName]              : null,
    producerName         ? ["Producer",         producerName]              : null,
    musicDirector        ? ["Music Director",   musicDirector]             : null,
    writer               ? ["Writer",           writer]                    : null,
    dop                  ? ["Cinematographer",  dop]                       : null,
    editor               ? ["Editor",           editor]                    : null,
    leadActors.length    ? ["Cast",             leadActors.join(", ")]     : null,
    leadActresses.length ? ["Actress",          leadActresses.join(", ")]  : null,
    movie.budget         ? ["Budget",           movie.budget]              : null,
  ].filter(Boolean);

  // ── GRAPH 1: Horizontal bar chart (net collection per day) ──────────────────
  const maxNet = Math.max(
    ...sorted.map(d => parseNum(d.net)),
    1
  );

  const barRows = sorted.map((d, i) => {
    const netNum    = parseNum(d.net);
    const grossNum  = parseNum(d.gross);
    const pct       = Math.round((netNum / maxNet) * 100);
    const grossPct  = grossNum > 0 ? Math.round((grossNum / maxNet) * 100) : 0;
    const isToday   = d.day === targetDay;
    const dateStr   = d.date
      ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : "";
    const dayLabel  = `Day ${d.day}${d.day === 1 ? " (Opening)" : ""}`;
    const netColor  = isToday ? "#c9973a" : (i % 2 === 0 ? "#8a6fc4" : "#4a9fd4");
    const bgRow     = isToday ? "rgba(201,151,58,0.06)" : "transparent";

    return `
    <tr style="background:${bgRow};">
      <td style="padding:10px 12px;border-bottom:1px solid #1e1e1e;min-width:72px;vertical-align:middle;">
        <div style="font-size:0.8rem;font-weight:700;color:${isToday ? "#c9973a" : "#aaa"};">${dayLabel}</div>
        ${dateStr ? `<div style="font-size:0.7rem;color:#555;">${dateStr}</div>` : ""}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e1e1e;width:55%;">
        <div style="margin-bottom:5px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <div style="font-size:0.65rem;color:#666;width:36px;flex-shrink:0;">Net</div>
            <div style="flex:1;background:#1a1a1a;border-radius:999px;height:7px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${netColor};border-radius:999px;transition:width 0.3s;"></div>
            </div>
            <div style="font-size:0.78rem;font-weight:700;color:${isToday ? "#c9973a" : "#ccc"};min-width:56px;text-align:right;word-break:break-word;">${d.net ? fmtINR(d.net) : "—"}</div>
          </div>
          ${grossNum > 0 ? `
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="font-size:0.65rem;color:#666;width:36px;flex-shrink:0;">Gross</div>
            <div style="flex:1;background:#1a1a1a;border-radius:999px;height:5px;overflow:hidden;">
              <div style="width:${grossPct}%;height:100%;background:#3a6a8a;border-radius:999px;"></div>
            </div>
            <div style="font-size:0.72rem;color:#7ec8e3;min-width:56px;text-align:right;word-break:break-word;">${fmtINR(d.gross)}</div>
          </div>` : ""}
        </div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e1e1e;vertical-align:middle;text-align:right;">
        ${d.note ? `<span style="display:inline-block;background:#1e1e1e;color:#777;border:1px solid #2a2a2a;border-radius:4px;padding:2px 8px;font-size:0.7rem;">${d.note}</span>` : ""}
      </td>
    </tr>`;
  }).join("");

  // ── GRAPH 2: Structured data table with cumulative + trend ──────────────────
  let cumulativeNet   = 0;
  let cumulativeGross = 0;

  const dataTableRows = sorted.map((d, i) => {
    const netNum    = parseNum(d.net);
    const grossNum  = parseNum(d.gross);
    cumulativeNet   += netNum;
    cumulativeGross += grossNum;

    const prevNetNum = i > 0 ? parseNum(sorted[i - 1].net) : null;
    let trendHtml = "";
    if (prevNetNum !== null && prevNetNum > 0 && netNum > 0) {
      const pctChange = ((netNum - prevNetNum) / prevNetNum) * 100;
      const isUp      = pctChange >= 0;
      trendHtml = `<span style="display:inline-block;background:${isUp ? "rgba(40,120,60,0.25)" : "rgba(180,40,40,0.25)"};color:${isUp ? "#5dba7d" : "#e07070"};border-radius:4px;padding:2px 7px;font-size:0.72rem;font-weight:700;">
        ${isUp ? "▲" : "▼"} ${Math.abs(pctChange).toFixed(1)}%
      </span>`;
    } else if (i === 0) {
      trendHtml = `<span style="display:inline-block;background:rgba(201,151,58,0.2);color:#c9973a;border-radius:4px;padding:2px 7px;font-size:0.72rem;font-weight:700;">Opening</span>`;
    }

    const isToday = d.day === targetDay;
    const dateStr = d.date
      ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : "—";

    return `
    <tr style="background:${isToday ? "rgba(201,151,58,0.05)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)")};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isToday ? "#c9973a" : "#aaa"};font-weight:700;white-space:nowrap;">
        Day ${d.day}${isToday ? ` <span style="font-size:0.65rem;background:rgba(201,151,58,0.2);color:#c9973a;padding:1px 6px;border-radius:4px;vertical-align:middle;">Latest</span>` : ""}
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">${dateStr}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:${isToday ? "#c9973a" : "#ddd"};font-weight:700;">${d.net ? fmtINR(d.net) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#7ec8e3;font-weight:600;">${d.gross ? fmtINR(d.gross) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#c9973a;font-weight:700;">${fmtINR(cumulativeNet)}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;">${trendHtml}</td>
    </tr>`;
  }).join("");

  // ── Tag chips ───────────────────────────────────────────────────────────────
  const tagChips = tags
    .map(t => `<span class="tag-chip" style="display:inline-block;background:#1e1e1e;color:#c9973a;border:1px solid #3a2800;border-radius:20px;padding:4px 13px;font-size:0.78rem;font-weight:600;margin:2px;">${t}</span>`)
    .join("\n    ");

  // ── Section card style shorthand ────────────────────────────────────────────
  const card  = `background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:26px;`;
  const h2    = `font-size:1.05rem;font-weight:800;color:#ff6b00;border-left:4px solid #ff6b00;padding-left:12px;margin:0 0 20px;line-height:1.3;`;
  const h3    = `font-size:0.85rem;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.09em;margin:0 0 12px;`;
  const tdL   = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.87rem;width:42%;vertical-align:top;`;
  const tdR   = `padding:10px 0;border-bottom:1px solid #1e1e1e;color:#ddd;font-size:0.87rem;font-weight:600;`;
  const th    = `padding:11px 14px;background:#1f1f1f;color:#888;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;text-align:left;border-bottom:2px solid #2a2a2a;`;

  // ── Prev / Next slugs (pre-computed to avoid nested template literals) ───────
  const prevSlug     = slugify(`${movieName}${year ? ` (${year})` : ""} day ${targetDay - 1} box office collection`);
  const nextSlug     = slugify(`${movieName}${year ? ` (${year})` : ""} day ${targetDay + 1} box office collection`);
  const prevDayLabel = `${movieName} Day ${targetDay - 1}`;
  const nextDayLabel = `${movieName} Day ${targetDay + 1}`;

  // ════════════════════════════════════════════════════════════════════════════
  //  FULL BLOG HTML OUTPUT
  // ════════════════════════════════════════════════════════════════════════════

  return `<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          ${movieName}${year ? ` (${year})` : ""} Day ${targetDay} box office collection and collected ${totalGrossStr} gross | Ollypedia
  description:    ${movieName}${year ? ` (${year})` : ""} Day ${targetDay} box office collection: Collected ${totalNetStr} net and ${totalGrossStr} gross in ${targetDay} day${targetDay !== 1 ? "s" : ""}. Complete day-wise breakdown, audience response, performance analysis & predictions on Ollypedia.
  og:title:       ${movieName}${year ? ` (${year})` : ""} Day ${targetDay} box office collection and collected ${totalGrossStr} gross | Ollypedia
  og:description: ${movieName} has collected ${totalNetStr} net and ${totalGrossStr} gross after ${targetDay} days. Full report on Ollypedia.
════════════════════════════════════════════════════════════════ -->

<!-- ─────────────────────────────────────────────
  JSON-LD SCHEMA — NewsArticle + Movie + BreadcrumbList
  Injected into <head> by CMS. Enables Google rich results:
  - NewsArticle → headline in search + Google News
  - Movie       → movie knowledge panel association
  - BreadcrumbList → breadcrumb path shown in search results
───────────────────────────────────────────── -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": "${movieName}${year ? ` (${year})` : ""} Day ${targetDay} box office collection and collected ${totalGrossStr} gross",
      "description": "${movieName}${year ? ` (${year})` : ""} Day ${targetDay} box office collection: Collected ${totalNetStr} net and ${totalGrossStr} gross in ${targetDay} day${targetDay !== 1 ? "s" : ""}.",
      "datePublished": "${new Date().toISOString().slice(0,10)}",
      "dateModified": "${new Date().toISOString().slice(0,10)}",
      "author": { "@type": "Organization", "name": "Ollypedia", "url": "https://ollypedia.in" },
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "https://ollypedia.in",
        "logo": { "@type": "ImageObject", "url": "https://ollypedia.in/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "https://ollypedia.in/blog/${blogSlug}" },
      "about": {
        "@type": "Movie",
        "name": "${movieName}",
        "inLanguage": "Odia",
        "genre": "${genre}"${releaseDate ? `,
        "datePublished": "${releaseDate}"` : ""}${directorName ? `,
        "director": { "@type": "Person", "name": "${directorName}" }` : ""}${producerName ? `,
        "producer": { "@type": "Person", "name": "${producerName}" }` : ""}${leadActors.length ? `,
        "actor": [${leadActors.map(a => `{ "@type": "Person", "name": "${a}" }`).join(", ")}]` : ""}
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home",        "item": "https://ollypedia.in" },
        { "@type": "ListItem", "position": 2, "name": "Box Office",  "item": "https://ollypedia.in/box-office" },
        { "@type": "ListItem", "position": 3, "name": "${movieName}", "item": "https://ollypedia.in${boxOfficeUrl}" },
        { "@type": "ListItem", "position": 4, "name": "Day ${targetDay} Collection", "item": "https://ollypedia.in/blog/${blogSlug}" }
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
            "text": "As of Day ${targetDay}, ${movieName} has collected a total of ${totalNetStr} net and ${totalGrossStr} gross at the Odia box office. These are industry estimates updated daily on Ollypedia."
          }
        },
        {
          "@type": "Question",
          "name": "How much did ${movieName} collect on Day ${targetDay}?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "On Day ${targetDay}, ${movieName} collected ${dayNet} net and ${dayGross} gross. The cumulative total stands at ${totalNetStr} net after ${targetDay} day${targetDay !== 1 ? "s" : ""} in theatres."
          }
        }${directorName ? `,
        {
          "@type": "Question",
          "name": "Who directed ${movieName}?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "${movieName} is directed by ${directorName}.${producerName ? ` The film is produced by ${producerName}.` : ""} It is an Odia language film released in ${year || "2026"} under the Ollywood banner."
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
            "text": "Based on ${targetDay} day${targetDay !== 1 ? "s" : ""} of data, ${movieName} has collected ${totalNetStr} net at the Odia box office.${movie.budget ? ` The film had an estimated budget of ${movie.budget}.` : ""} Ollypedia updates collection figures daily based on industry trade estimates."
          }
        }
      ]
    }
  ]
}
</script>


<!-- ─────────────────────────────────────────────
  MOBILE RESPONSIVE STYLES
  Scoped to .ollypedia-blog-content — safe to inject inline.
  No layout or functionality changes, purely presentation fixes.
───────────────────────────────────────────── -->
<style>
/* ── Base resets for blog content ── */
.ollypedia-blog-content img,
.ollypedia-blog-content table,
.ollypedia-blog-content div,
.ollypedia-blog-content section,
.ollypedia-blog-content td,
.ollypedia-blog-content th { box-sizing: border-box; }

/* ── Prevent any element from causing horizontal scroll ── */
.ollypedia-blog-content { overflow-x: hidden; word-break: break-word; }

/* ── Long text, headings, links and data cells wrap instead of overflowing
     (most of this already inherits word-break from the rule above; these
     are explicit so it holds even if an inline style or sanitizer strips
     inheritance) ── */
.ollypedia-blog-content p,
.ollypedia-blog-content span,
.ollypedia-blog-content strong,
.ollypedia-blog-content em,
.ollypedia-blog-content a,
.ollypedia-blog-content h1,
.ollypedia-blog-content h2,
.ollypedia-blog-content h3,
.ollypedia-blog-content td,
.ollypedia-blog-content th {
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

/* ── Images, charts, video and other embeds never exceed the viewport.
     (No <img>/<iframe> currently ships in this template, but this keeps
     any future poster/embed additions safe automatically.) ── */
.ollypedia-blog-content img,
.ollypedia-blog-content svg,
.ollypedia-blog-content video,
.ollypedia-blog-content iframe,
.ollypedia-blog-content embed,
.ollypedia-blog-content object,
.ollypedia-blog-content canvas {
  max-width: 100%;
  height: auto;
}

/* ── Code blocks and quotes wrap or scroll within themselves instead of
     widening the page ── */
.ollypedia-blog-content pre {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.ollypedia-blog-content code {
  overflow-wrap: break-word;
  word-break: break-word;
}
.ollypedia-blog-content blockquote {
  max-width: 100%;
  overflow-wrap: break-word;
  word-break: break-word;
}

/* ── A table is only allowed to exceed 100% width when it explicitly opts
     in via min-width (e.g. the day-wise data table, which scrolls inside
     its own .tbl-scroll/overflow-x:auto wrapper) — min-width still wins
     over this for that table, so its intended horizontal scroll is
     untouched; every other table is capped to the viewport. ── */
.ollypedia-blog-content table { max-width: 100%; }

/* ── Scrollable table wrapper already present; ensure -webkit too ── */
.ollypedia-blog-content .tbl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

@media (max-width: 640px) {

  /* Hero section — tighter padding on small screens */
  .ollypedia-blog-content .hero-section {
    padding: 20px 16px 18px !important;
  }

  /* Section cards — reduce horizontal padding */
  .ollypedia-blog-content section[style*="background:#181818"],
  .ollypedia-blog-content section[style*="background: #181818"] {
    padding: 18px 14px !important;
  }

  /* Tags section — reduce horizontal padding to match other cards */
  .ollypedia-blog-content section[style*="background:#111"] {
    padding: 16px 14px !important;
  }

  /* Stat chips grid — force single column on very small screens */
  .ollypedia-blog-content .stat-chips {
    grid-template-columns: 1fr 1fr !important;
  }

  /* Performance analysis stat block — stack vertically */
  .ollypedia-blog-content .perf-stats {
    flex-direction: column !important;
    gap: 12px !important;
  }

  /* Day nav prev/next — stack vertically */
  .ollypedia-blog-content nav[aria-label="Day navigation"] {
    flex-direction: column !important;
  }

  /* Movie details table — label column narrower */
  .ollypedia-blog-content .info-table td:first-child {
    width: 38% !important;
    font-size: 0.8rem !important;
  }

  /* Box office data table cells — reduce padding and font size */
  .ollypedia-blog-content .data-table td,
  .ollypedia-blog-content .data-table th {
    padding: 8px 8px !important;
    font-size: 0.78rem !important;
  }

  /* Bar chart table cells */
  .ollypedia-blog-content .bar-table td {
    padding: 8px 8px !important;
  }

  /* Also Read grid — 1 column */
  .ollypedia-blog-content .also-read-grid {
    grid-template-columns: 1fr !important;
  }

  /* Tag chips — smaller */
  .ollypedia-blog-content .tag-chip {
    font-size: 0.7rem !important;
    padding: 3px 10px !important;
  }

  /* CTA button — full width */
  .ollypedia-blog-content .cta-btn {
    display: block !important;
    width: 100% !important;
    box-sizing: border-box !important;
    text-align: center !important;
  }

  /* FAQ sections — tighter padding */
  .ollypedia-blog-content .faq-section {
    padding: 18px 14px !important;
  }
}

@media (max-width: 400px) {
  /* Stat chips — single column on very narrow screens */
  .ollypedia-blog-content .stat-chips {
    grid-template-columns: 1fr !important;
  }

  /* Hero h1 font size floor */
  .ollypedia-blog-content h1 {
    font-size: 1.1rem !important;
  }
}
</style>

<!-- ─────────────────────────────────────────────
  BREADCRUMB + TIMESTAMP
  Breadcrumb: visual trail matches BreadcrumbList schema above.
  <time>: machine-readable freshness signal for Google.
───────────────────────────────────────────── -->
<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/" style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="${boxOfficeUrl}" style="color:#777;text-decoration:none;">${movieName}${year ? ` (${year})` : ""}</a>
    <span style="color:#333;">›</span>
    <span style="color:#c9973a;">Day ${targetDay} Collection</span>
  </nav>
  <time datetime="${new Date().toISOString().slice(0,10)}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>


<!-- ─────────────────────────────────────────────
  HERO BANNER
───────────────────────────────────────────── -->
<div class="hero-section" style="background:linear-gradient(135deg,#1a0e00 0%,#121212 100%);border:1px solid #2e2000;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">

  <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    <span style="display:inline-block;background:#2a1500;color:#c9973a;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a2200;">📊 Box Office Report</span>
    <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">Day ${targetDay} Update</span>
    ${year ? `<span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">${year}</span>` : ""}
  </div>

  <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
    ${movieName}${year ? ` (${year})` : ""} Day ${targetDay} Box Office Collection — ${(sections.seoHeadline || "").replace(/`/g, "&#96;")}
  </h1>

  <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 24px;">${(sections.introParagraph || "").replace(/`/g, "&#96;")}</p>

  <p style="color:#aaa;font-size:0.93rem;line-height:1.7;margin:0 0 24px;">
    According to industry trade estimates, <strong style="color:#fff;">${movieName}</strong> has collected approximately
    <strong style="color:#c9973a;">${totalNetStr} Net</strong> and
    <strong style="color:#7ec8e3;">${totalGrossStr} Gross</strong> in its first ${targetDay} day${targetDay !== 1 ? "s" : ""} of theatrical release.
    ${directorName ? `Directed by <strong style="color:#ddd;">${directorName}</strong>, the` : "The"} film has been running across Odisha with
    ${leadActors.length ? `<strong style="color:#ddd;">${leadActors.slice(0,2).join(" and ")}</strong> in the lead roles.` : "strong audience support."}
  </p>

  <!-- Stat chips -->
  <div class="stat-chips" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px;">
    <div style="background:rgba(0,0,0,0.5);border:1px solid #2e2000;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Total Net</div>
      <div style="font-size:clamp(1rem,3.5vw,1.3rem);font-weight:800;color:#c9973a;word-break:break-word;">${totalNetStr}</div>
    </div>
    <div style="background:rgba(0,0,0,0.5);border:1px solid #1a2a3a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Total Gross</div>
      <div style="font-size:clamp(1rem,3.5vw,1.3rem);font-weight:800;color:#7ec8e3;word-break:break-word;">${totalGrossStr}</div>
    </div>
    <div style="background:rgba(0,0,0,0.5);border:1px solid #222;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Day ${targetDay} Net</div>
      <div style="font-size:clamp(1rem,3.5vw,1.3rem);font-weight:800;color:#fff;word-break:break-word;">${dayNet}</div>
    </div>
  </div>
</div>


<!-- ─────────────────────────────────────────────
  KEY HIGHLIGHT CALLOUT
───────────────────────────────────────────── -->
<div style="background:#180e00;border-left:4px solid #ff9800;border-radius:0 10px 10px 0;padding:14px 20px;margin-bottom:22px;">
  <strong style="color:#ff9800;">📊 Box Office Update:</strong>
  <span style="color:#ccc;"> <strong style="color:#fff;">${movieName}</strong> has collected an estimated
  <strong style="color:#c9973a;">${totalNetStr} net</strong> and
  <strong style="color:#7ec8e3;">${totalGrossStr} gross</strong> after
  <strong style="color:#fff;">${targetDay} day${targetDay !== 1 ? "s" : ""}</strong> in theatres.
  ${totalNet >= 1_00_00_000 ? `The film has crossed the <strong style="color:#c9973a;">₹${(totalNet / 1_00_00_000).toFixed(0)} Cr mark</strong> at the Odia box office.` : ""}</span>
</div>


<!-- ─────────────────────────────────────────────
  MOVIE DETAILS TABLE
───────────────────────────────────────────── -->
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



<!-- ─────────────────────────────────────────────
  GRAPH 2: STRUCTURED DATA TABLE  (Net · Gross · Cumulative · Trend)
  Best for: exact figures + running total + day-on-day trend
───────────────────────────────────────────── -->
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
            TOTAL (${sorted.length} days)
          </td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;color:#c9973a;font-weight:800;font-size:1rem;">${totalNetStr}</td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;color:#7ec8e3;font-weight:800;font-size:1rem;">${totalGrossStr}</td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;color:#c9973a;font-weight:800;font-size:1rem;">${totalNetStr}</td>
          <td style="padding:12px 14px;background:#1f1800;border-top:2px solid #2e2000;"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</section>


<!-- ─────────────────────────────────────────────
  EDITORIAL SECTIONS (AI-written)
───────────────────────────────────────────── -->
<section style="${card}">
  <h2 style="${h2}">Box Office Journey — ${movieName}</h2>
  ${pWrap(sections.boxOfficeAnalysis)}
</section>

<section style="${card}">
  <h2 style="${h2}">Weekend vs Weekday Performance</h2>
  ${pWrap(sections.weekendWeekdayComparison)}
</section>

<section style="${card}">
  <h2 style="${h2}">Audience Response</h2>
  ${pWrap(sections.audienceResponse)}
</section>

<section style="${card}">
  <h2 style="${h2}">Occupancy Trends</h2>
  ${pWrap(sections.occupancyTrend)}
</section>

<section style="${card}">
  <h2 style="${h2}">Performance Analysis</h2>
  <div class="perf-stats" style="background:#1f1800;border:1px solid #2e2000;border-radius:10px;padding:16px 20px;margin-bottom:18px;display:flex;gap:24px;flex-wrap:wrap;">
    <div>
      <div style="font-size:0.65rem;color:#666;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">Total Net</div>
      <div style="font-size:1.2rem;font-weight:800;color:#c9973a;">${totalNetStr}</div>
    </div>
    <div>
      <div style="font-size:0.65rem;color:#666;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">Total Gross</div>
      <div style="font-size:1.2rem;font-weight:800;color:#7ec8e3;">${totalGrossStr}</div>
    </div>
    <div>
      <div style="font-size:0.65rem;color:#666;text-transform:uppercase;letter-spacing:0.09em;margin-bottom:4px;">Days Tracked</div>
      <div style="font-size:1.2rem;font-weight:800;color:#fff;">${sorted.length}</div>
    </div>
  </div>
  ${pWrap(sections.performanceAnalysis)}
</section>

<section style="${card}">
  <h2 style="${h2}">Impact on the Ollywood Industry</h2>
  ${pWrap(sections.industryImpact)}
</section>

<section style="${card}">
  <h2 style="${h2}">Future Box Office Outlook</h2>
  ${pWrap(sections.prediction)}
  ${pWrap(sections.futureOutlook)}
</section>

<section style="${card}">
  <h2 style="${h2}">Final Verdict</h2>
  <div style="border-left:4px solid #c9973a;padding-left:16px;margin-bottom:16px;">
    ${pWrap(sections.finalVerdict)}
  </div>
  <p style="color:#555;font-size:0.8rem;line-height:1.6;margin:0;">
    <em>* All collection figures are industry estimates sourced by Ollypedia Box Office Tracking. Figures may differ from official studio numbers.</em>
  </p>
</section>


<!-- ─────────────────────────────────────────────
  PREV / NEXT DAY NAVIGATION
  Signals article series to Google. Passes PageRank
  through the day chain. Helps crawlers find all posts.
───────────────────────────────────────────── -->
<nav aria-label="Day navigation" style="display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap;">
  ${targetDay > 1
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


<!-- ─────────────────────────────────────────────
  FAQ SECTION — Structured Q&A for SEO
  Uses FAQ schema-friendly markup. Google often
  pulls these into rich results / People Also Ask.
───────────────────────────────────────────── -->
<section class="faq-section" style="background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;">
  <h2 style="font-size:1.05rem;font-weight:800;color:#ff6b00;border-left:4px solid #ff6b00;padding-left:12px;margin:0 0 22px;line-height:1.3;">
    Frequently Asked Questions — ${movieName} Box Office
  </h2>

  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">
      What is the total box office collection of ${movieName}${year ? ` (${year})` : ""}?
    </h3>
    <div>
      <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
        As of Day ${targetDay}, <strong style="color:#fff;">${movieName}</strong> has collected a total of
        <strong style="color:#c9973a;">${totalNetStr} net</strong> and
        <strong style="color:#7ec8e3;">${totalGrossStr} gross</strong> at the Odia box office.
        These are industry estimates and figures are updated daily on Ollypedia.
      </p>
    </div>
  </div>

  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">
      How much did ${movieName} collect on Day ${targetDay}?
    </h3>
    <div>
      <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
        On Day ${targetDay}, <strong style="color:#fff;">${movieName}</strong> collected
        <strong style="color:#c9973a;">${dayNet} net</strong> and
        <strong style="color:#7ec8e3;">${dayGross} gross</strong>.
        The cumulative total stands at <strong style="color:#c9973a;">${totalNetStr} net</strong> after ${targetDay} day${targetDay !== 1 ? "s" : ""} in theatres.
      </p>
    </div>
  </div>

  ${directorName ? `
  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">
      Who directed ${movieName}?
    </h3>
    <div>
      <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
        <strong style="color:#fff;">${movieName}</strong> is directed by
        <strong style="color:#ddd;">${directorName}</strong>.
        ${producerName ? `The film is produced by <strong style="color:#ddd;">${producerName}</strong>.` : ""}
        It is an Odia language film released in ${year || "2026"} under the Ollywood banner.
      </p>
    </div>
  </div>` : ""}

  ${leadActors.length ? `
  <div style="border-bottom:1px solid #242424;padding-bottom:18px;margin-bottom:18px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">
      Who are the lead actors in ${movieName}?
    </h3>
    <div>
      <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
        <strong style="color:#fff;">${movieName}</strong> stars
        <strong style="color:#ddd;">${leadActors.join(", ")}</strong>${leadActresses.length ? ` alongside <strong style="color:#ddd;">${leadActresses.join(", ")}</strong>` : ""}.
        ${musicDirector ? `The music is composed by <strong style="color:#ddd;">${musicDirector}</strong>.` : ""}
      </p>
    </div>
  </div>` : ""}

  <div style="padding-bottom:4px;">
    <h3 style="font-size:0.93rem;font-weight:700;color:#ddd;margin:0 0 8px;">
      Is ${movieName} a hit or flop at the box office?
    </h3>
    <div>
      <p style="color:#aaa;font-size:0.9rem;line-height:1.8;margin:0;">
        Based on ${targetDay} day${targetDay !== 1 ? "s" : ""} of data, <strong style="color:#fff;">${movieName}</strong> has collected
        <strong style="color:#c9973a;">${totalNetStr} net</strong> at the Odia box office.
        ${movie.budget ? `The film had an estimated budget of <strong style="color:#ddd;">${movie.budget}</strong>.` : ""}
        A detailed performance analysis is available above. Ollypedia updates collection figures daily based on industry trade estimates.
      </p>
    </div>
  </div>
</section>


<!-- ─────────────────────────────────────────────
  ALSO READ — Internal links section
  Signals site structure to Google, passes
  PageRank to related pages, reduces bounce rate.
───────────────────────────────────────────── -->
<section class="faq-section" style="background:#181818;border:1px solid #242424;border-radius:14px;padding:26px 28px;margin-bottom:22px;">
  <h2 style="font-size:1.05rem;font-weight:800;color:#ff6b00;border-left:4px solid #ff6b00;padding-left:12px;margin:0 0 20px;line-height:1.3;">
    Also Read
  </h2>
  <div class="also-read-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
    <a href="${boxOfficeUrl}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;transition:border-color 0.2s;">
      <span style="font-size:1.3rem;flex-shrink:0;">📊</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} Full Box Office Report</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">All days · Running total</div>
      </div>
    </a>
    <a href="/box-office" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;transition:border-color 0.2s;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎬</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">Ollywood Box Office Collection</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Latest Odia movie collections</div>
      </div>
    </a>
    <a href="/movie/${movieSlug}" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;transition:border-color 0.2s;">
      <span style="font-size:1.3rem;flex-shrink:0;">🎭</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} — Cast, Story & Details</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Full movie info on Ollypedia</div>
      </div>
    </a>
    <a href="/blog?category=Box%20Office" style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;transition:border-color 0.2s;">
      <span style="font-size:1.3rem;flex-shrink:0;">📰</span>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">More Box Office Reports</div>
        <div style="font-size:0.72rem;color:#666;margin-top:2px;">Latest Ollywood collection news</div>
      </div>
    </a>
  </div>
</section>


<!-- ─────────────────────────────────────────────
  HASHTAGS / SOCIAL TAGS
───────────────────────────────────────────── -->
<section style="background:#111;border-radius:14px;padding:20px 26px;margin-bottom:22px;">
  <h2 style="font-size:0.7rem;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px;">Tags</h2>
  <div style="display:flex;flex-wrap:wrap;gap:5px;">
    ${tagChips}
  </div>
</section>


<!-- ─────────────────────────────────────────────
  FOOTER
───────────────────────────────────────────── -->
<div style="border-top:1px solid #1c1c1c;padding-top:16px;margin-top:4px;">
  <p style="color:#444;font-size:0.8rem;line-height:1.8;margin:0;">
    <strong style="color:#555;">Source:</strong> Ollypedia Box Office Tracking &nbsp;·&nbsp;
    <strong style="color:#555;">Last Updated:</strong> <time datetime="${new Date().toISOString().slice(0,10)}" style="color:#444;">Day ${targetDay}, ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</time> &nbsp;·&nbsp;
    <a href="${boxOfficeUrl}" style="color:#c9973a;text-decoration:none;">View full collection report →</a><br>
    <em style="color:#3a3a3a;">All collection figures are industry estimates and may vary from official figures.</em>
  </p>
</div>`;

};

// ─── Shared label style ────────────────────────────────────────────────────────
const lbl = {
  display: "block", fontSize: "0.72rem", color: "var(--muted)",
  fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em",
};

// ─── DayModal ─────────────────────────────────────────────────────────────────

function DayModal({ movie, isEdit, dayData, allDays, onClose, onSaved, onToast }) {
  const year    = getYear(movie.releaseDate);
  const nextDay = allDays.length ? Math.max(...allDays.map((d) => d.day)) + 1 : 1;

  const [form, setForm] = useState({
    day:   String(dayData?.day ?? nextDay),
    net:   String(dayData?.net   ?? ""),
    gross: String(dayData?.gross ?? ""),
    date:  String(dayData?.date  ?? new Date().toISOString().slice(0, 10)),
    note:  String(dayData?.note  ?? ""),
  });

  const [showAi,     setShowAi]    = useState(false);
  const [aiPrompt,   setAiPrompt]  = useState("");
  const [aiText,     setAiText]    = useState("");
  const [aiSections, setAiSections] = useState(null); // parsed object, avoids re-parsing JSON
  const [aiStatus,   setAiStatus]  = useState(""); // ""|"loading"|"done"|"error"
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState("");
  const [grossManual,  setGrossManual]  = useState(!!dayData?.gross); // true = user typed gross manually

  const GST_RATE = 1.18; // Gross = Net × 1.18  (18% entertainment tax / GST)

  const set = (k) => (e) => {
    const val = e.target.value;
    if (k === "net") {
      // Auto-calculate gross unless the user has manually overridden it
      setForm((p) => {
        const netNum = parseToRupees(val);
        const autoGross = netNum > 0
          ? fmtINR(Math.round(netNum * GST_RATE))
          : p.gross;
        return { ...p, net: val, gross: grossManual ? p.gross : autoGross };
      });
    } else if (k === "gross") {
      setGrossManual(val.trim() !== ""); // if user clears gross, allow auto again
      setForm((p) => ({ ...p, gross: val }));
    } else {
      setForm((p) => ({ ...p, [k]: val }));
    }
  };

  // All days including the current one being entered (cumulative)
  const getDaysUpToN = useCallback(() => {
    const current = {
      day: parseInt(form.day, 10), net: form.net.trim(),
      gross: form.gross.trim(), date: form.date, note: form.note.trim(),
    };
    const others = (allDays || []).filter((d) => d.day !== current.day);
    return [...others, current].sort((a, b) => a.day - b.day);
  }, [form, allDays]);

  // Auto-populate prompt when AI section opens
  useEffect(() => {
    if (!showAi) return;
    const targetDay  = parseInt(form.day, 10);
    const daysUpToN  = getDaysUpToN();
    const totalNet   = daysUpToN.reduce((s, d) => s + parseNum(d.net),   0);
    const totalGross = daysUpToN.reduce((s, d) => s + parseNum(d.gross), 0);
    setAiPrompt(buildAiPrompt(movie, daysUpToN, totalNet, totalGross, targetDay));
  }, [showAi]);

  const generateAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiStatus("loading");
    setAiText("");
    setAiSections(null);
    try {
      const token = getAdminToken();
      const res   = await fetch(`${BASE}/admin/generate-article`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const rawText = data.text || "";
      setAiText(rawText);
      // Parse ONCE right now — store clean object so textarea edits never touch JSON again
      const _days = getDaysUpToN();
      const _tN   = _days.reduce((s,d)=>s+parseNum(d.net),0);
      const _tG   = _days.reduce((s,d)=>s+parseNum(d.gross),0);
      setAiSections(parseAiSections(rawText, movie, parseInt(form.day,10), _tN, _tG, _days));
      setAiStatus("done");
    } catch (e) {
      setAiStatus("error");
      onToast("❌ AI generation failed: " + e.message, "error");
    }
  };

  const handleSave = async () => {
    if (!form.net.trim() && !form.gross.trim()) {
      setErr("Enter at least Net or Gross collection.");
      return;
    }
    setSaving(true);
    setErr("");
    const payload = {
      day:   parseInt(form.day, 10),
      net:   form.net.trim(),
      gross: form.gross.trim(),
      date:  form.date,
      note:  form.note.trim(),
    };

    try {
      // 1. Save day to DB
      if (isEdit) {
        await API.adminUpdateBoxOfficeDay(movie._id, payload.day, payload);
      } else {
        await API.adminAddBoxOfficeDay(movie._id, payload);
      }
      onToast(`Day ${payload.day} ${isEdit ? "updated" : "added"}!`, "success");

      // 2. Publish per-day blog if AI toggle is ON
      if (showAi) {
        const daysUpToN  = getDaysUpToN();
        const totalNet   = daysUpToN.reduce((s, d) => s + parseNum(d.net),   0);
        const totalGross = daysUpToN.reduce((s, d) => s + parseNum(d.gross), 0);
        const targetDay  = payload.day;
        const blogTitle  = `${movie.title}${year ? ` (${year})` : ""} Day ${targetDay} box office collection and collected ${fmtINR(totalGross)} gross`;
        const blogSlugBase = `${movie.title}${year ? ` (${year})` : ""} day ${targetDay} box office collection`;
        const blogSlug   = slugify(blogSlugBase);
        const parsedSecs = aiSections || parseAiSections(aiText, movie, targetDay, totalNet, totalGross, daysUpToN);
        const content    = buildBlogContent(movie, daysUpToN, totalNet, totalGross, targetDay, parsedSecs, blogSlug);
        const excerpt    = parsedSecs.introParagraph ||
          `${blogTitle}: Net ${fmtINR(payload.net || 0)}, Gross ${fmtINR(payload.gross || 0)}. Total ${fmtINR(totalNet)} net in ${daysUpToN.length} days.`;
        const seoTitle   = `${movie.title}${year ? ` (${year})` : ""} Day ${targetDay} box office collection and collected ${fmtINR(totalGross)} gross | Ollypedia`;
        const seoDesc    = `${movie.title}${year ? ` (${year})` : ""} Day ${targetDay} box office collection: The film has collected ${fmtINR(totalNet)} net and ${fmtINR(totalGross)} gross in ${targetDay} day${targetDay !== 1 ? "s" : ""}. Check complete day-wise breakdown, audience response, and performance analysis on Ollypedia.`;

        const blogPayload = {
          title: blogTitle, slug: blogSlug, excerpt, content,
          category:   "Box Office",
          tags: [
            movie.title, "Box Office", "Odia Cinema", "Ollywood",
            `Day ${targetDay}`, year ? String(year) : null,
            ...parsedSecs && movie.cast
              ? (() => {
                  const ci = extractCastInfo(movie);
                  return [
                    ci.directorName, ci.producerName, ci.musicDirector,
                    ...ci.leadActors, ...ci.leadActresses,
                  ].filter(Boolean);
                })()
              : [],
          ].filter(Boolean),
          coverImage: movie.bannerUrl || movie.posterUrl || "",
          movieId:    movie._id, movieTitle: movie.title,
          published:  true, featured: false,
          seoTitle,
          seoDesc,
        };

        // Look for existing blog with this exact slug (per-day, not per-movie)
        let existingId = null;
        try {
          const allBlogs = await API.adminGetBlogPosts();
          const match = allBlogs.find((b) => b.slug === blogSlug);
          if (match) existingId = match._id;
        } catch {}

        if (existingId) {
          await API.adminUpdateBlog(existingId, blogPayload);
          onToast(`✅ Day ${targetDay} blog updated at /blog/${blogSlug}`, "success");
        } else {
          await API.adminCreateBlog(blogPayload);
          onToast(`✅ Day ${targetDay} blog published at /blog/${blogSlug}`, "success");
        }
      }

      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const targetDay = parseInt(form.day, 10);
  const blogSlugPreview = slugify(`${movie.title}${year ? ` (${year})` : ""} day ${targetDay} box office collection`);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <span className="modal-title">
            {isEdit ? `✏️ Edit Day ${dayData.day}` : `➕ Add Day ${form.day}`} — {movie.title}{year ? ` (${year})` : ""}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: "22px 24px" }}>
          {err && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(220,50,50,0.1)", border: "1px solid rgba(220,50,50,0.4)", borderRadius: 8, color: "#e87a6a", fontSize: "0.82rem" }}>
              ⚠️ {err}
            </div>
          )}

          {/* Row 1: Day + Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Day Number</label>
              <input className="form-input" style={{ width: "100%", boxSizing: "border-box" }}
                type="number" min="1" value={form.day} onChange={set("day")} disabled={isEdit} />
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input className="form-input" style={{ width: "100%", boxSizing: "border-box" }}
                type="date" value={form.date} onChange={set("date")} />
            </div>
          </div>

          {/* Row 2: Net + Gross */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Net Collection (₹)</label>
              <input className="form-input" style={{ width: "100%", boxSizing: "border-box" }}
                type="text" placeholder="e.g. 45,00,000" value={form.net} onChange={set("net")} autoFocus={!isEdit} />
              <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: 4 }}>
                Gross auto-calculates at Net × 1.18 (18% GST)
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Gross Collection (₹)</label>
                {grossManual && (
                  <button
                    type="button"
                    onClick={() => {
                      setGrossManual(false);
                      const netNum = parseFloat(form.net.replace(/[^0-9.]/g, ""));
                      const autoGross = !isNaN(netNum) && netNum > 0 ? String(Math.round(netNum * GST_RATE)) : "";
                      setForm((p) => ({ ...p, gross: autoGross }));
                    }}
                    style={{ fontSize: "0.6rem", color: "var(--gold)", background: "rgba(201,151,58,0.12)", border: "1px solid rgba(201,151,58,0.3)", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontWeight: 700 }}
                  >
                    ↺ Auto
                  </button>
                )}
              </div>
              <input className="form-input" style={{ width: "100%", boxSizing: "border-box", borderColor: grossManual ? "rgba(201,151,58,0.5)" : undefined }}
                type="text" placeholder="Auto-filled from Net"
                value={form.gross} onChange={set("gross")} />
              <div style={{ fontSize: "0.65rem", marginTop: 4, color: grossManual ? "var(--gold)" : "var(--muted)" }}>
                {grossManual ? "✏️ Manual override — click ↺ Auto to recalculate" : "✅ Auto-calculated from Net"}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Notes (optional)</label>
            <input className="form-input" style={{ width: "100%", boxSizing: "border-box" }}
              type="text" placeholder="e.g. 2nd Saturday, Holiday boost" value={form.note} onChange={set("note")} />
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid var(--border)", margin: "0 0 20px" }} />

          {/* AI Blog Toggle */}
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: showAi ? 16 : 0, cursor: "pointer", userSelect: "none" }}
            onClick={() => setShowAi((p) => !p)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>🤖 Generate AI Blog for Day {targetDay}</div>
              <div style={{ fontSize: "0.71rem", color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                Will publish at{" "}
                <code style={{ background: "var(--bg3)", padding: "1px 6px", borderRadius: 4, color: "var(--gold)", fontSize: "0.68rem" }}>
                  /blog/{blogSlugPreview}
                </code>
                {" "}with Day 1–{targetDay} cumulative data
              </div>
            </div>
            {/* Toggle switch */}
            <div style={{ width: 42, height: 24, borderRadius: 12, background: showAi ? "var(--gold)" : "var(--bg3)", border: "1px solid var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: showAi ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
            </div>
          </div>

          {/* AI section */}
          {showAi && (
            <div style={{ background: "rgba(201,151,58,0.04)", border: "1px solid rgba(201,151,58,0.18)", borderRadius: 10, padding: "16px 18px", marginBottom: 18 }}>
              <label style={{ ...lbl, color: "#c9973a" }}>AI Prompt (edit before generating)</label>
              <textarea
                className="form-input"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={7}
                style={{ width: "100%", boxSizing: "border-box", fontSize: "0.76rem", lineHeight: 1.65, resize: "vertical", fontFamily: "monospace", marginBottom: 10 }}
                placeholder="Prompt will auto-fill when you open this section…"
              />
              <button className="btn btn-sm"
                style={{ width: "100%", background: "rgba(201,151,58,0.14)", color: "var(--gold)", border: "1px solid rgba(201,151,58,0.4)", fontWeight: 700 }}
                onClick={generateAi}
                disabled={aiStatus === "loading" || !aiPrompt.trim()}
              >
                {aiStatus === "loading" ? "⏳ Generating with Groq AI…" : aiStatus === "done" ? "✅ Regenerate" : "🤖 Generate Blog Content"}
              </button>

              {aiStatus === "error" && (
                <div style={{ marginTop: 10, fontSize: "0.78rem", color: "#e87a6a" }}>
                  ❌ Generation failed — check GROQ_API_KEY in .env, then retry.
                </div>
              )}

              {aiStatus === "done" && aiSections && (() => {
                const SECTION_META = [
                  { label: "SEO Headline",         key: "seoHeadline",         rows: 1 },
                  { label: "Intro Paragraph",      key: "introParagraph",      rows: 3 },
                  { label: "Box Office Journey",   key: "boxOfficeAnalysis",   rows: 5 },
                  { label: "Audience Response",    key: "audienceResponse",    rows: 4 },
                  { label: "Performance Analysis", key: "performanceAnalysis", rows: 4 },
                  { label: "Future Prediction",    key: "prediction",          rows: 3 },
                  { label: "Final Verdict",        key: "finalVerdict",        rows: 3 },
                ];
                return (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--gold)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                      ✅ Generated — Edit any section below before saving
                    </div>
                    {SECTION_META.map(({ label, key, rows }) => (
                      <div key={key} style={{ marginBottom: 14 }}>
                        <label style={{ display: "block", fontSize: "0.68rem", color: "var(--muted)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
                        <textarea
                          className="form-input"
                          value={aiSections[key] || ""}
                          onChange={(e) => setAiSections((prev) => ({ ...prev, [key]: e.target.value }))}
                          rows={rows}
                          style={{ width: "100%", boxSizing: "border-box", fontSize: "0.77rem", lineHeight: 1.7, resize: "vertical" }}
                        />
                      </div>
                    ))}
                    <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 4, lineHeight: 1.6 }}>
                      ✏️ Edit any section above. Blog publishes with full SEO, schema, hero, day-wise table &amp; all sections.
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-gold" style={{ flex: 2, fontWeight: 800 }} onClick={handleSave}
              disabled={saving || (showAi && aiStatus === "loading")}>
              {saving
                ? "Saving…"
                : showAi
                ? `💾 Save Day ${targetDay} + Publish Blog`
                : `💾 Save Day ${targetDay}`}
            </button>
          </div>

          {showAi && (
            <p style={{ marginTop: 10, fontSize: "0.7rem", color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
              Day {targetDay} blog will include <strong style={{ color: "var(--text)" }}>all days 1–{targetDay}</strong> in the table.
              Day 1 blog has 1 row, Day 2 has 2 rows, and so on.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BulkUploadModal ────────────────────────────────────────────────────────
// Lets the admin add many days of collection in one go, two ways:
//   1) Download a CSV template (Day + auto reference Date pre-filled),
//      fill in the Net Collection column only, upload it back.
//   2) Paste lines like "Day 1 - 1500000" directly.
// Either way, Date is always recalculated from movie.releaseDate + (day-1)
// and Gross is always recalculated as Net × 1.18 — the person only ever
// has to type the net collection number.

function BulkUploadModal({ movie, allDays, onClose, onSaved, onToast }) {
  const year = getYear(movie.releaseDate);
  const nextDay = allDays.length ? Math.max(...allDays.map((d) => d.day)) + 1 : 1;
  const existingDaySet = new Set(allDays.map((d) => d.day));

  const [tab,        setTab]        = useState("file"); // "file" | "paste"
  const [startDay,   setStartDay]   = useState(nextDay);
  const [numRows,    setNumRows]    = useState(30);
  const [pasteText,  setPasteText]  = useState("");
  const [rows,       setRows]       = useState([]); // priced preview rows
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState("");
  const fileInputRef = useRef(null);

  const priceRows = (entries) => {
    const byDay = new Map();
    entries.forEach(({ day, netRaw }) => byDay.set(day, { day, netRaw })); // last one wins on dup
    return Array.from(byDay.values())
      .sort((a, b) => a.day - b.day)
      .map((r) => {
        const netNum = parseToRupees(r.netRaw);
        return {
          ...r,
          netNum,
          valid:     netNum > 0,
          grossNum:  netNum > 0 ? Math.round(netNum * GST_RATE) : 0,
          date:      addDaysToISO(movie.releaseDate, r.day),
          isUpdate:  existingDaySet.has(r.day),
        };
      });
  };

  const handleDownloadTemplate = () => {
    const csv      = buildBoxOfficeTemplateCSV(movie, startDay, numRows);
    const safeName = slugify(movie.title || "movie");
    downloadCSV(csv, `${safeName}-boxoffice-template-day${startDay}-to-${startDay + numRows - 1}.csv`);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    try {
      const text    = await file.text();
      const csvRows = parseCSVText(text);
      const entries = parseBulkCSVRows(csvRows);
      if (!entries.length) {
        setErr("No usable rows found — make sure the Net Collection column is filled in.");
        setRows([]);
      } else {
        setRows(priceRows(entries));
      }
    } catch (e2) {
      setErr("Could not read that file: " + e2.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleParsePaste = () => {
    setErr("");
    const entries = parseBulkPasteText(pasteText);
    if (!entries.length) {
      setErr('Could not find any day lines. Try one entry per line, e.g. "Day 1 - 1500000".');
      setRows([]);
    } else {
      setRows(priceRows(entries));
    }
  };

  const validRows   = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);
  const newCount    = validRows.filter((r) => !r.isUpdate).length;
  const updateCount = validRows.filter((r) => r.isUpdate).length;

  const handleConfirm = async () => {
    if (!validRows.length) return;
    setSaving(true);
    setErr("");
    try {
      const payload = { days: validRows.map((r) => ({ day: r.day, net: String(r.netNum) })) };
      const res = await API.adminBulkBoxOfficeDays(movie._id, payload);
      onToast(`✅ Saved ${res.added || 0} new + ${res.updated || 0} updated day(s) for ${movie.title}.`, "success");
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message || "Bulk save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <span className="modal-title">📤 Bulk Box Office Upload — {movie.title}{year ? ` (${year})` : ""}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: "22px 24px" }}>
          {!movie.releaseDate && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(220,160,40,0.08)", border: "1px solid rgba(220,160,40,0.3)", borderRadius: 8, color: "#d9a73a", fontSize: "0.8rem" }}>
              ⚠️ This movie has no release date set, so per-day dates can't be auto-calculated. Set a release date first so Day 1 = release date works correctly.
            </div>
          )}

          {err && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(220,50,50,0.1)", border: "1px solid rgba(220,50,50,0.4)", borderRadius: 8, color: "#e87a6a", fontSize: "0.82rem" }}>
              ⚠️ {err}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {[["file", "📄 Template File"], ["paste", "✏️ Paste Data"]].map(([key, label]) => (
              <button key={key}
                onClick={() => { setTab(key); setRows([]); setErr(""); }}
                className={tab === key ? "btn btn-gold btn-sm" : "btn btn-ghost btn-sm"}
                style={{ fontWeight: 700 }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "file" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Start Day</label>
                  <input className="form-input" style={{ width: "100%", boxSizing: "border-box" }}
                    type="number" min="1" value={startDay}
                    onChange={(e) => setStartDay(parseInt(e.target.value, 10) || 1)} />
                </div>
                <div>
                  <label style={lbl}>Number of Days</label>
                  <input className="form-input" style={{ width: "100%", boxSizing: "border-box" }}
                    type="number" min="1" max="200" value={numRows}
                    onChange={(e) => setNumRows(parseInt(e.target.value, 10) || 1)} />
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginBottom: 14, fontWeight: 700 }} onClick={handleDownloadTemplate}>
                ⬇️ Download Template (Day {startDay}–{startDay + numRows - 1})
              </button>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                Open it in Excel/Sheets, fill in the <strong style={{ color: "var(--text)" }}>Net Collection</strong> column only — leave a day blank to skip it — then save as <strong style={{ color: "var(--text)" }}>.csv</strong> and upload it below. Dates and Gross are always calculated automatically; whatever ends up in the Date column is ignored.
              </div>
              <label style={lbl}>Upload Filled Template (.csv)</label>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange}
                className="form-input" style={{ width: "100%", boxSizing: "border-box" }} />
            </>
          )}

          {tab === "paste" && (
            <>
              <label style={lbl}>Paste day-wise data (one entry per line)</label>
              <textarea
                className="form-input"
                style={{ width: "100%", boxSizing: "border-box", minHeight: 140, fontFamily: "monospace", fontSize: "0.82rem", resize: "vertical" }}
                placeholder={"Day 1 - 1500000\nDay 2 - 2200000\nDay 3 - 1.8 Cr\n…"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "8px 0 14px", lineHeight: 1.6 }}>
                Accepts formats like "Day 1 - 1500000", "1,15L", "1 1.2 Cr" — one entry per line. Dates and Gross are calculated automatically from Day 1 = {movie.releaseDate ? new Date(movie.releaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "the release date"}.
              </div>
              <button className="btn btn-gold btn-sm" style={{ fontWeight: 800 }} onClick={handleParsePaste} disabled={!pasteText.trim()}>
                🔍 Parse &amp; Preview
              </button>
            </>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid var(--border)", margin: "20px 0 16px" }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: "0.72rem", background: "rgba(80,200,120,0.12)", color: "#6fd08c", border: "1px solid rgba(80,200,120,0.3)", padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>
                  {newCount} new
                </span>
                {updateCount > 0 && (
                  <span style={{ fontSize: "0.72rem", background: "rgba(201,151,58,0.12)", color: "var(--gold)", border: "1px solid rgba(201,151,58,0.3)", padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>
                    {updateCount} will be overwritten
                  </span>
                )}
                {invalidRows.length > 0 && (
                  <span style={{ fontSize: "0.72rem", background: "rgba(220,50,50,0.1)", color: "#e87a6a", border: "1px solid rgba(220,50,50,0.3)", padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>
                    {invalidRows.length} skipped (no readable amount)
                  </span>
                )}
              </div>

              <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg2)" }}>
                      {["Day", "Date", "Net", "Gross", "Status"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "0.62rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "2px solid var(--border)", position: "sticky", top: 0, background: "var(--bg2)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.day} style={{ borderBottom: "1px solid var(--border)", opacity: r.valid ? 1 : 0.5 }}>
                        <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--gold)" }}>Day {r.day}</td>
                        <td style={{ padding: "7px 12px", color: "var(--muted)" }}>
                          {r.date ? new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                        </td>
                        <td style={{ padding: "7px 12px", fontWeight: 600 }}>{r.valid ? fmtINR(r.netNum) : (r.netRaw || "—")}</td>
                        <td style={{ padding: "7px 12px", color: "#7ec8e3" }}>{r.valid ? fmtINR(r.grossNum) : "—"}</td>
                        <td style={{ padding: "7px 12px", fontSize: "0.72rem" }}>
                          {!r.valid
                            ? <span style={{ color: "#e87a6a" }}>⚠️ unreadable amount</span>
                            : r.isUpdate
                            ? <span style={{ color: "var(--gold)" }}>↻ update</span>
                            : <span style={{ color: "#6fd08c" }}>+ new</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-gold" style={{ flex: 2, fontWeight: 800 }}
              onClick={handleConfirm} disabled={saving || validRows.length === 0}>
              {saving ? "Saving…" : `💾 Save ${validRows.length} Day${validRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main BoxOfficePanel ───────────────────────────────────────────────────────

export default function BoxOfficePanel({ movies, onToast }) {
  const [query,       setQuery]       = useState("");
  const [dropResults, setDropResults] = useState([]);
  const [showDrop,    setShowDrop]    = useState(false);
  const [selMovie,    setSelMovie]    = useState(null);
  const [days,        setDays]        = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);
  const [modal,       setModal]       = useState(null); // { isEdit, dayData } | null
  const [bulkModal,   setBulkModal]   = useState(false);
  const dropRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Movie search dropdown
  useEffect(() => {
    if (!query.trim() || selMovie) { setDropResults([]); setShowDrop(false); return; }
    const q        = query.toLowerCase();
    const filtered = (Array.isArray(movies) ? movies : [])
      .filter((m) => (m.title || "").toLowerCase().includes(q))
      .slice(0, 8);
    setDropResults(filtered);
    setShowDrop(filtered.length > 0);
  }, [query, movies, selMovie]);

  // FIX: explicitly reset days + set loading before fetch so UI updates
  const loadDays = useCallback(async (movie) => {
    if (!movie?._id) return;
    setDays([]);
    setLoadingDays(true);
    try {
      const data   = await API.getMovieBoxOfficeDays(movie._id);
      const sorted = Array.isArray(data) ? [...data].sort((a, b) => a.day - b.day) : [];
      setDays(sorted);
    } catch (e) {
      onToast?.("Failed to load data: " + e.message, "error");
      setDays([]);
    } finally {
      setLoadingDays(false);
    }
  }, [onToast]);

  const selectMovie = (m) => {
    setSelMovie(m);
    setQuery(m.title);
    setShowDrop(false);
    loadDays(m);
  };

  const clearMovie = () => { setSelMovie(null); setQuery(""); setDays([]); };

  // Derived
  const totalNet   = days.reduce((s, d) => s + parseNum(d.net),   0);
  const totalGross = days.reduce((s, d) => s + parseNum(d.gross), 0);
  const nextDay    = days.length ? Math.max(...days.map((d) => d.day)) + 1 : 1;
  const year       = selMovie ? getYear(selMovie.releaseDate) : "";

  return (
    <div style={{ padding: "0 28px 60px" }}>

      {/* ── Sticky Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--bg1)", padding: "13px 28px", margin: "0 -28px 28px",
        boxShadow: "0 2px 20px rgba(0,0,0,0.5)", borderBottom: "1px solid var(--border)",
      }}>
        <h2 style={{ fontSize: "1.3rem", margin: 0, fontWeight: 800 }}>
          📊 Box Office
        </h2>
        {selMovie && (
          <span style={{ fontSize: "0.74rem", color: "var(--gold)", background: "rgba(201,151,58,0.1)", border: "1px solid rgba(201,151,58,0.25)", padding: "3px 10px", borderRadius: 12, fontWeight: 600 }}>
            {selMovie.title}{year ? ` (${year})` : ""}
          </span>
        )}
        {selMovie && days.length > 0 && (
          <span style={{ fontSize: "0.68rem", color: "var(--muted)", background: "var(--bg3)", padding: "3px 9px", borderRadius: 10, fontWeight: 600 }}>
            {days.length} day{days.length !== 1 ? "s" : ""} recorded
          </span>
        )}
        <div style={{ flex: 1 }} />
        {selMovie && (
          <button className="btn btn-ghost btn-sm" style={{ fontWeight: 800 }}
            onClick={() => setBulkModal(true)}>
            📤 Bulk Upload
          </button>
        )}
        {selMovie && (
          <button className="btn btn-gold btn-sm" style={{ fontWeight: 800 }}
            onClick={() => setModal({ isEdit: false, dayData: null })}>
            + Add Day {nextDay}
          </button>
        )}
      </div>

      {/* ── Movie Search ── */}
      <div style={{ maxWidth: 500, marginBottom: 32 }}>
        <label style={{ ...lbl, marginBottom: 8, fontSize: "0.78rem" }}>Search Movie</label>
        <div ref={dropRef} style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none", zIndex: 1 }}>🔍</span>
          <input
            className="form-input"
            style={{ paddingLeft: 38, paddingRight: selMovie ? 36 : 14, width: "100%", boxSizing: "border-box" }}
            placeholder="Type movie name to search…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (selMovie) { setSelMovie(null); setDays([]); } }}
            onFocus={() => dropResults.length > 0 && setShowDrop(true)}
          />
          {selMovie && (
            <button onClick={clearMovie} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "1.2rem", padding: 0 }}>×</button>
          )}
          {showDrop && dropResults.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 200, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.65)" }}>
              {dropResults.map((m) => (
                <button key={m._id} onClick={() => selectMovie(m)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(201,151,58,0.09)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                >
                  {(m.posterUrl || m.thumbnailUrl) && (
                    <img src={m.posterUrl || m.thumbnailUrl} alt={m.title} style={{ width: 28, height: 38, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} onError={(e) => e.target.style.display = "none"} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{m.title}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                      {m.releaseDate ? new Date(m.releaseDate).getFullYear() : "TBA"}
                      {m.language ? ` · ${m.language}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {showDrop && dropResults.length === 0 && query.trim() && !selMovie && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 200, padding: 16, color: "var(--muted)", fontSize: "0.83rem" }}>
              No movies found for "{query}"
            </div>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {!selMovie && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--muted)" }}>
          <div style={{ fontSize: "4rem", marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 8, color: "var(--text)" }}>Box Office Tracker</div>
          <div style={{ fontSize: "0.84rem", maxWidth: 380, margin: "0 auto", lineHeight: 1.8 }}>
            Search a movie above to record day-wise collection and publish AI-powered box office blogs per day.
          </div>
        </div>
      )}

      {/* ── Movie selected ── */}
      {selMovie && (
        <>
          {/* Summary card */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 24px", marginBottom: 28, overflow: "hidden", position: "relative" }}>
            {selMovie.bannerUrl && (
              <img src={selMovie.bannerUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.06, pointerEvents: "none" }} onError={(e) => e.target.style.display = "none"} />
            )}
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", position: "relative", zIndex: 1 }}>
              {(selMovie.posterUrl || selMovie.thumbnailUrl) && (
                <img src={selMovie.posterUrl || selMovie.thumbnailUrl} alt={selMovie.title}
                  style={{ width: 68, height: 94, objectFit: "cover", borderRadius: 10, flexShrink: 0, boxShadow: "0 4px 20px rgba(0,0,0,0.7)" }}
                  onError={(e) => e.target.style.display = "none"} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: "1.25rem", lineHeight: 1.2, marginBottom: 4 }}>
                  {selMovie.title}{year ? ` (${year})` : ""}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 16 }}>
                  {selMovie.releaseDate ? new Date(selMovie.releaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Release TBA"}
                  {selMovie.language ? ` · ${selMovie.language}` : ""}
                  {selMovie.budget ? ` · Budget: ${selMovie.budget}` : ""}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {[
                    { label: "Total Net",   value: fmtINR(totalNet),   color: "var(--gold)" },
                    { label: "Total Gross", value: fmtINR(totalGross), color: "#7ec8e3"      },
                    { label: "Days",        value: loadingDays ? "…" : (days.length || "—"), color: "var(--text)" },
                  ].map(({ label: l, value, color }) => (
                    <div key={l} style={{ background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "9px 16px", border: "1px solid rgba(255,255,255,0.06)", minWidth: 110 }}>
                      <div style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: "1.05rem", fontWeight: 800, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Loading */}
          {loadingDays && (
            <div style={{ textAlign: "center", padding: 52, color: "var(--muted)" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>⏳</div>
              <div style={{ fontSize: "0.88rem" }}>Loading collection data…</div>
            </div>
          )}

          {/* Empty days */}
          {!loadingDays && days.length === 0 && (
            <div style={{ textAlign: "center", padding: "52px 0", color: "var(--muted)" }}>
              <div style={{ fontSize: "2.8rem", marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text)", fontSize: "1rem" }}>No collection data yet</div>
              <div style={{ fontSize: "0.8rem", marginBottom: 20 }}>Click the button below to record the opening day collection.</div>
              <button className="btn btn-gold btn-sm" style={{ fontWeight: 800 }}
                onClick={() => setModal({ isEdit: false, dayData: null })}>
                + Add Day 1 Collection
              </button>
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setBulkModal(true)}>
                  📤 Bulk Upload Multiple Days Instead
                </button>
              </div>
            </div>
          )}

          {/* Collection table */}
          {!loadingDays && days.length > 0 && (
            <>
              <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg2)" }}>
                      {["Day", "Date", "Net Collection", "Gross Collection", "Notes", ""].map((h, i) => (
                        <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.64rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "2px solid var(--border)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d, i) => (
                      <tr key={d.day}
                        style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)", transition: "background 0.1s" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(201,151,58,0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"}
                      >
                        <td style={{ padding: "12px 16px", fontWeight: 800, color: "var(--gold)", whiteSpace: "nowrap" }}>
                          Day {d.day}
                          {d.day === 1 && <span style={{ marginLeft: 6, fontSize: "0.6rem", background: "rgba(201,151,58,0.14)", color: "var(--gold)", padding: "1px 6px", borderRadius: 8 }}>Opening</span>}
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: "0.8rem" }}>
                          {d.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 700 }}>{fmtINR(d.net)}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#7ec8e3" }}>{fmtINR(d.gross)}</td>
                        <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: "0.78rem", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.note || "—"}
                        </td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem", padding: "4px 12px" }}
                            onClick={() => setModal({ isEdit: true, dayData: d })}>
                            ✏️ Edit
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            style={{ fontSize: "0.72rem", padding: "4px 12px", color: "#e87a6a", border: "1px solid rgba(220,50,50,0.35)" }}
                            onClick={async () => {
                              if (!window.confirm(`Delete Day ${d.day} collection data? This cannot be undone.`)) return;
                              try {
                                await API.adminDeleteBoxOfficeDay(selMovie._id, d.day);
                                onToast(`Day ${d.day} deleted.`, "success");
                                loadDays(selMovie);
                              } catch (e) {
                                onToast("❌ Delete failed: " + e.message, "error");
                              }
                            }}>
                            🗑️ Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "rgba(201,151,58,0.07)", borderTop: "2px solid var(--border)" }}>
                      <td colSpan={2} style={{ padding: "12px 16px", fontWeight: 800, fontSize: "0.78rem", color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        TOTAL ({days.length} day{days.length !== 1 ? "s" : ""})
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 800, color: "var(--gold)", fontSize: "1rem" }}>{fmtINR(totalNet)}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 800, color: "#7ec8e3", fontSize: "1rem" }}>{fmtINR(totalGross)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Tip bar */}
              <div style={{ marginTop: 14, padding: "11px 16px", background: "rgba(201,151,58,0.04)", border: "1px solid rgba(201,151,58,0.14)", borderRadius: 10, fontSize: "0.77rem", color: "var(--muted)", lineHeight: 1.7 }}>
                💡 <strong style={{ color: "var(--text)" }}>Tip:</strong> Use <strong style={{ color: "var(--gold)" }}>+ Add Day {nextDay}</strong> to record new data.
                Toggle <strong style={{ color: "var(--gold)" }}>🤖 AI Blog</strong> inside the form to publish a Day {nextDay} article
                (with all days 1–{nextDay} in the table) as a separate blog post.
              </div>
            </>
          )}
        </>
      )}

      {/* Day Modal */}
      {modal && selMovie && (
        <DayModal
          movie={selMovie}
          isEdit={modal.isEdit}
          dayData={modal.isEdit ? modal.dayData : null}
          allDays={days}
          onClose={() => setModal(null)}
          onSaved={() => loadDays(selMovie)}
          onToast={onToast}
        />
      )}

      {/* Bulk Upload Modal */}
      {bulkModal && selMovie && (
        <BulkUploadModal
          movie={selMovie}
          allDays={days}
          onClose={() => setBulkModal(false)}
          onSaved={() => loadDays(selMovie)}
          onToast={onToast}
        />
      )}
    </div>
  );
}