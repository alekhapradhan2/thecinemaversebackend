import React, { useState, useEffect, useRef, useCallback } from "react";
import { getAdminToken } from "../api/api";

const _API_ROOT = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const API_BASE = _API_ROOT.endsWith("/api") ? _API_ROOT : _API_ROOT + "/api";

// ─── Article type variants ──────────────────────────────────────────────────
const ARTICLE_TYPES = [
  { id: "review",   label: "🎬 Movie Review",  color: "#c9973a" },
  { id: "story",    label: "📖 Story & Plot",   color: "#7aaae8" },
  { id: "cast",     label: "👥 Cast Spotlight", color: "#a78be8" },
  { id: "music",    label: "🎵 Music & Songs",  color: "#4caf82" },
  { id: "analysis", label: "🔍 Deep Dive",      color: "#e8c87a" },
  { id: "trivia",   label: "💡 Trivia & Facts", color: "#e5799a" },
  { id: "custom",   label: "✏️ Custom Prompt",  color: "#a0c4a0" }, // free-form
];

const BLOG_CATEGORIES = [
  "Movie Review","Actor Spotlight","Top 10","General",
  "Behind the Scenes","Music","Industry News","Opinion",
  "Movie Update","OTT Release",
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function slugify(str) {
  return String(str || "").toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}
function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}
function wordCount(txt) { return txt.split(/\s+/).filter(Boolean).length; }
function readTime(txt)   { return Math.max(1, Math.ceil(wordCount(txt) / 200)); }

// ─── Prompt builders ────────────────────────────────────────────────────────
function buildMoviePrompt(movie, type) {
  const cast  = (movie.cast  || []).slice(0,5).map(c => `${c.name}${c.role ? ` as ${c.role}` : ""}`).join(", ");
  const songs = (movie.media?.songs || []).slice(0,3).map(s => s.title).filter(Boolean).join(", ");
  const year  = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "upcoming";
  const genre = (movie.genre || []).join(", ") || "Odia";
  const ctx   = `Movie: "${movie.title}" (${year}) | Genre: ${genre} | Director: ${movie.director||"N/A"} | Cast: ${cast||"N/A"} | Songs: ${songs||"N/A"} | Synopsis: ${movie.synopsis||"N/A"} | Verdict: ${movie.verdict||"Upcoming"}`;

  const htmlRules = `
OUTPUT RULES — STRICTLY FOLLOW:
- Output ONLY clean HTML. No markdown. No plain text. No code blocks.
- Wrap everything in <article>
- Use <h2> for section headings (NOT <h1> — the page already has a title)
- Use <h3> for sub-headings
- Use <p> for paragraphs (2–3 sentences each, short and readable)
- Use <ul><li> for bullet point lists
- Use <ol><li> for numbered lists
- Use <strong> for emphasis on key terms
- Use <table> for any data/comparison (with <thead><tbody><tfoot>)
- End with a <section class="faq-section"><h2>Frequently Asked Questions</h2> block with 4–5 <details><summary> FAQ items
- 800–1200 words total
- SEO-friendly: include the movie name naturally in the first 100 words
- Short paragraphs, subheading every 150–200 words
- Do NOT use inline styles
- Do NOT output any text outside the <article> tag`;

  const map = {
    review: `You are an expert SEO content writer for Ollypedia, an Odia cinema website. Write a fully structured, AdSense-friendly HTML movie review for the Odia film "${movie.title}" (${year}).

Sections to include:
1. Engaging introduction (mention "${movie.title}" in first sentence)
2. Story & Plot Overview
3. Performances & Cast
4. Direction & Screenplay
5. Music & Soundtrack
6. Verdict & Final Thoughts
7. Key Highlights (as <ul>)
8. FAQ section

${ctx}
${htmlRules}`,

    story: `You are an expert SEO content writer for Ollypedia, an Odia cinema website. Write a fully structured HTML story and plot breakdown article for "${movie.title}" (${year}).

Sections to include:
1. Introduction — what the film is about
2. Story Overview
3. Key Plot Points & Narrative Arc
4. Emotional Beats & Themes
5. What Makes the Story Stand Out (as <ul>)
6. Comparison Table — "${movie.title}" vs similar Odia films (themes, tone, style)
7. FAQ section

${ctx}
${htmlRules}`,

    cast: `You are an expert SEO content writer for Ollypedia. Write a fully structured HTML cast spotlight article for "${movie.title}" (${year}).

Sections to include:
1. Introduction
2. Lead Cast — profile each major actor/actress (use <h3> per person)
3. Supporting Cast Highlights
4. Director & Key Crew
5. Cast Performance Table (Name | Role | Highlights) using <table>
6. FAQ section

${ctx}
${htmlRules}`,

    music: `You are an expert SEO content writer for Ollypedia. Write a fully structured HTML music review for "${movie.title}" (${year}).

Sections to include:
1. Introduction — overall feel of the soundtrack
2. Music Director's Style
3. Song-by-Song Breakdown (use <h3> per song, short paragraph each)
4. Songs Table (Song Title | Singer | Mood | Rating) using <table>
5. Background Score
6. Verdict on Soundtrack
7. FAQ section

${ctx}
${htmlRules}`,

    analysis: `You are an expert SEO content writer for Ollypedia. Write a fully structured HTML deep-dive analysis for "${movie.title}" (${year}).

Sections to include:
1. Introduction
2. Themes & Symbolism
3. Cinematography & Visual Style
4. Direction & Screenplay Analysis
5. Cultural & Social Significance
6. Key Strengths & Weaknesses (as two <ul> lists)
7. Comparison Table — "${movie.title}" vs recent Odia films
8. FAQ section

${ctx}
${htmlRules}`,

    trivia: `You are an expert SEO content writer for Ollypedia. Write a fully structured HTML trivia & facts article for "${movie.title}" (${year}).

Sections to include:
1. Introduction
2. Behind the Scenes Facts (as <ul>)
3. Casting & Production Challenges
4. Interesting On-Set Stories
5. Box Office & Reception
6. Fun Facts Table (Fact | Detail) using <table>
7. FAQ section

${ctx}
${htmlRules}`,
  };
  return (map[type] || map.review);
}

function autoTitle(movie, type) {
  const year  = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const genre = (movie.genre || []).join(", ") || "Odia Film";
  return {
    review:   `${movie.title}${year ? ` (${year})` : ""} – ${genre} Odia Movie Review & Story`,
    story:    `${movie.title} – Full Story, Plot & Narrative Breakdown`,
    cast:     `${movie.title} – Cast Spotlight: Meet the Actors & Characters`,
    music:    `${movie.title} – Music Review: Songs, Score & Soundtrack`,
    analysis: `${movie.title} – Deep Dive Analysis & Themes`,
    trivia:   `${movie.title} – Interesting Trivia, Facts & Behind the Scenes`,
    custom:   `${movie.title} – Article`,
  }[type] || `${movie.title} – Article`;
}

function autoCategory(type) {
  return { review:"Movie Review", story:"Movie Review", cast:"Actor Spotlight", music:"General", analysis:"Top 10", trivia:"General" }[type] || "General";
}

// ─── Cast/Crew prompt builder ────────────────────────────────────────────────
function buildCastPrompt(castMember, type) {
  const movies = (castMember.movies || []).slice(0,5).map(m => typeof m==="string" ? m : m.title||"").filter(Boolean).join(", ");
  const ctx = `Name: ${castMember.name} | Type: ${castMember.type||"Actor"} | Known for: ${movies||"Ollywood films"} | Bio: ${castMember.bio||"N/A"}`;

  const htmlRules = `
OUTPUT RULES — STRICTLY FOLLOW:
- Output ONLY clean HTML wrapped in <article>. No markdown. No plain text.
- Use <h2> for section headings (NOT <h1>)
- Use <h3> for sub-headings
- Use <p> for paragraphs (2–3 sentences each)
- Use <ul><li> for bullet lists
- Use <strong> for emphasis
- Use <table> for any data (with <thead><tbody>)
- End with <section class="faq-section"><h2>Frequently Asked Questions</h2> with 4–5 <details><summary> FAQ items
- 800–1200 words total. SEO-friendly.
- Do NOT use inline styles. Do NOT output anything outside <article>.`;

  const map = {
    profile: `You are an expert SEO content writer for Ollypedia, an Odia cinema website. Write a fully structured HTML profile/biography article for ${castMember.type||"actor"} "${castMember.name}".

Sections:
1. Introduction — who they are and why they matter in Ollywood
2. Early Life & Background
3. Career Journey & Breakthrough
4. Notable Works (as <ul>)
5. Awards & Recognition
6. Personal Life
7. Legacy & Impact
8. FAQ section

${ctx}
${htmlRules}`,

    interview: `You are an expert SEO content writer for Ollypedia. Write a creative HTML Q&A-style interview feature with ${castMember.name} (${castMember.type||"actor"}) about their career in Odia cinema.

Sections:
1. Introduction
2. 6–8 interview Q&A pairs (use <h3> for each question, <p> for the answer)
3. Career Highlights Table (Film | Year | Role/Contribution) using <table>
4. FAQ section

${ctx}
${htmlRules}`,

    spotlight: `You are an expert SEO content writer for Ollypedia. Write a fully structured HTML spotlight/feature article on ${castMember.name} (${castMember.type||"actor"}) for fans of Odia cinema.

Sections:
1. Introduction
2. Career Milestones (as <ul>)
3. Why Fans Love Them
4. Best Performances / Works
5. What Sets Them Apart
6. Quick Facts Table using <table>
7. FAQ section

${ctx}
${htmlRules}`,
  };
  return map[type] || map.profile;
}

function autoCastTitle(castMember, type) {
  return {
    profile:   `${castMember.name} – Biography, Career & Films | Odia Cinema`,
    interview: `${castMember.name} – Exclusive Interview | Ollywood`,
    spotlight: `${castMember.name} – Actor Spotlight | Odia Cinema`,
    custom:    `${castMember.name} – Article`,
  }[type] || `${castMember.name} – Article`;
}

const CAST_ARTICLE_TYPES = [
  { id: "profile",   label: "👤 Biography",      color: "#a78be8" },
  { id: "interview", label: "🎤 Interview",       color: "#7aaae8" },
  { id: "spotlight", label: "⭐ Spotlight",       color: "#e8c87a" },
  { id: "custom",    label: "✏️ Custom Prompt",   color: "#a0c4a0" },
];

// ─── API calls ───────────────────────────────────────────────────────────────

// ★ FIX 1: module-level blog cache — ONE fetch for all 1168 rows, filter locally
let _blogCache     = null;
let _blogCacheProm = null;

async function getAllBlogs() {
  if (_blogCache !== null) return _blogCache;
  if (_blogCacheProm)      return _blogCacheProm;
  _blogCacheProm = (async () => {
    const token = getAdminToken();
    const res   = await fetch(`${API_BASE}/admin/blog`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data     = res.ok ? await res.json() : [];
    _blogCache     = data;
    _blogCacheProm = null;
    return data;
  })();
  return _blogCacheProm;
}

function invalidateBlogCache() { _blogCache = null; _blogCacheProm = null; }

async function fetchMovieBlogs(movieTitle) {
  const all = await getAllBlogs();
  return all.filter(p => p.movieTitle === movieTitle);
}

async function fetchCastBlogs(castName) {
  const all = await getAllBlogs();
  return all.filter(p => p.castName === castName);
}

async function fetchUncategorizedBlogs() {
  const all = await getAllBlogs();
  return all.filter(p => !p.movieTitle && !p.castName);
}

// ★ FIX 2: 60-second AbortController timeout on every AI call
async function callGenerateAPI(prompt) {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in as admin.");
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`${API_BASE}/admin/generate-article`, {
      method:  "POST",
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
      body:    JSON.stringify({ prompt }),
      signal:  ctrl.signal,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Server error (${res.status})`);
    }
    const data = await res.json();
    const text = (data.text || "").trim();
    if (!text) throw new Error("AI returned an empty response. Please try again.");
    return text;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out after 60 s. Please retry.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function generateArticle(movie, type) {
  return callGenerateAPI(buildMoviePrompt(movie, type));
}

async function publishArticle(movie, article, type, youtubeVideoId = "") {
  const token   = getAdminToken();
  if (!token) throw new Error("Not logged in as admin.");
  const title   = autoTitle(movie, type);
  const slug    = slugify(`${movie.title}-${type}-${Date.now().toString(36)}`);
  const excerpt = article.slice(0, 200).trim() + "…";
  const res = await fetch(`${API_BASE}/admin/blog`, {
    method:  "POST",
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
    body: JSON.stringify({
      title, slug, content:article, excerpt,
      category: autoCategory(type),
      tags: [movie.title, "Ollywood", "Odia Movie", ...(movie.genre||[])],
      coverImage: movie.posterUrl || movie.thumbnailUrl || "",
      movieTitle: movie.title, movieId: movie._id,
      author: "OllyPedia Editorial",
      readTime: readTime(article), seoTitle:title, seoDesc:excerpt, published:true,
      ...(youtubeVideoId.trim() ? { youtubeVideoId: youtubeVideoId.trim() } : {}),
    }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||`Publish failed (${res.status})`); }
  const post = await res.json();
  invalidateBlogCache();
  return post;
}

async function publishBlogPost({ title, content, category, tags, coverImage, movie, castMember, published, youtubeVideoId }) {
  const token   = getAdminToken();
  if (!token) throw new Error("Not logged in as admin.");
  const slug    = slugify(`${title}-${Date.now().toString(36)}`);
  const excerpt = content.slice(0, 200).trim() + "…";
  const res = await fetch(`${API_BASE}/admin/blog`, {
    method:  "POST",
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
    body: JSON.stringify({
      title: title.trim(), slug, content: content.trim(), excerpt,
      category: category || "General",
      tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      coverImage: coverImage || (castMember ? castMember.photo||"" : movie ? movie.posterUrl||movie.thumbnailUrl||"" : ""),
      movieTitle: movie?.title || "", movieId: movie?._id || null,
      castName: castMember?.name || "", castId: castMember?._id || null,
      author: "OllyPedia Editorial",
      readTime: readTime(content),
      seoTitle: title.trim(), seoDesc: excerpt,
      published: published !== false,
      ...(youtubeVideoId?.trim() ? { youtubeVideoId: youtubeVideoId.trim() } : {}),
    }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||`Publish failed (${res.status})`); }
  const post = await res.json();
  invalidateBlogCache();
  return post;
}

async function deleteArticle(id) {
  const token = getAdminToken();
  await fetch(`${API_BASE}/admin/blog/${id}`, {
    method: "DELETE", headers:{ Authorization:`Bearer ${token}` },
  });
  invalidateBlogCache();
}

async function updateArticle(id, body) {
  const token = getAdminToken();
  const res = await fetch(`${API_BASE}/admin/blog/${id}`, {
    method: "PATCH",
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||"Update failed"); }
  invalidateBlogCache();
  return res.json();
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@keyframes spin { to { transform: rotate(360deg); } }
.bg-wrap { padding:24px 28px; }
.bg-header { display:flex; align-items:center; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
.bg-title  { font-size:1.1rem; font-weight:800; color:var(--gold); flex:1; min-width:160px; }
.bg-stats  { display:flex; gap:18px; font-size:.82rem; color:var(--muted); }
.bg-search { padding:7px 12px; border-radius:7px; border:1px solid var(--border); background:var(--bg2); color:var(--text); font-size:.85rem; width:190px; outline:none; }
.bg-new-btn  { padding:7px 15px; border-radius:7px; border:1.5px solid #90caf9; font-size:.82rem; font-weight:700; cursor:pointer; background:transparent; color:#90caf9; transition:all .15s; white-space:nowrap; }
.bg-new-btn:hover { background:rgba(144,202,249,.13); }
.bg-bulk-btn { padding:7px 15px; border-radius:7px; border:none; font-size:.82rem; font-weight:700; cursor:pointer; background:var(--gold); color:#000; white-space:nowrap; }
.bg-bulk-btn:disabled { opacity:.5; cursor:not-allowed; }
.bg-progress { margin-bottom:14px; padding:10px 14px; background:rgba(201,151,58,.1); border-radius:8px; border:1px solid rgba(201,151,58,.3); font-size:.84rem; color:var(--gold); font-weight:600; }
.bg-progress-bar  { margin-top:8px; height:6px; background:var(--bg3); border-radius:4px; overflow:hidden; }
.bg-progress-fill { height:100%; border-radius:4px; background:var(--gold); transition:width .4s; }
.bg-tip  { margin-bottom:14px; padding:8px 14px; border-radius:7px; background:rgba(255,255,255,.03); border:1px solid var(--border); font-size:.74rem; color:var(--muted); line-height:1.7; }
.bg-list { background:var(--bg2); border-radius:10px; border:1px solid var(--border); overflow:hidden; }
.bg-empty{ padding:40px; text-align:center; color:var(--muted); font-size:.9rem; }

.bg-movie-row { border-bottom:1px solid var(--border); }
.bg-movie-row:last-child { border-bottom:none; }
.bg-movie-header { display:flex; align-items:flex-start; gap:14px; padding:14px 18px; cursor:pointer; transition:background .15s; user-select:none; }
.bg-movie-header:hover { background:rgba(255,255,255,.03); }
.bg-poster    { width:38px; height:54px; object-fit:cover; border-radius:4px; flex-shrink:0; border:1px solid var(--border); background:var(--bg3); }
.bg-poster-ph { width:38px; height:54px; border-radius:4px; flex-shrink:0; border:1px solid var(--border); background:var(--bg3); display:flex; align-items:center; justify-content:center; font-size:1.2rem; }
.bg-minfo  { flex:1; min-width:0; }
.bg-mtitle { font-weight:700; font-size:.93rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bg-msub   { font-size:.75rem; color:var(--muted); margin-top:2px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.bg-mcount { font-size:.68rem; font-weight:700; padding:1px 7px; border-radius:10px; background:rgba(201,151,58,.15); color:#c9973a; border:1px solid rgba(201,151,58,.3); }
.bg-chevron{ font-size:.8rem; color:var(--muted); margin-top:3px; transition:transform .2s; }

.bg-panel { padding:0 18px 18px 70px; }
.bg-section-label { font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.09em; color:var(--muted); margin-bottom:8px; }

.bg-articles  { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
.bg-art-item  { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; }
.bg-art-dot   { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:5px; }
.bg-art-body  { flex:1; min-width:0; }
.bg-art-title { font-size:.8rem; font-weight:700; color:var(--text); line-height:1.35; margin-bottom:3px; }
.bg-art-meta  { font-size:.67rem; color:var(--muted); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.bg-art-actions { display:flex; gap:5px; flex-shrink:0; }
.bg-art-btn   { padding:3px 9px; border-radius:5px; border:1px solid var(--border); background:var(--bg2); color:var(--text); font-size:.67rem; cursor:pointer; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; transition:all .15s; }
.bg-art-btn:hover     { border-color:var(--gold); color:var(--gold); }
.bg-art-btn.del:hover { border-color:#e57373; color:#e57373; }

.bg-types    { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:12px; }
.bg-type-chip{ padding:4px 12px; border-radius:18px; border:1.5px solid; font-size:.73rem; font-weight:700; cursor:pointer; transition:all .15s; background:transparent; }
.bg-type-chip.active { filter:brightness(1.1); }

.bg-gen-box   { padding:10px 12px; background:rgba(201,151,58,.05); border:1px dashed rgba(201,151,58,.25); border-radius:8px; }
.bg-gen-row   { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.bg-gen-label { font-size:.75rem; font-weight:700; flex:1; }
.bg-gen-preview { margin-top:10px; padding:10px 12px; background:var(--bg3); border-radius:6px; font-size:.76rem; color:var(--text); line-height:1.75; white-space:pre-wrap; max-height:200px; overflow-y:auto; border:1px solid var(--border); }

.bg-btn          { padding:5px 12px; border-radius:6px; border:none; cursor:pointer; font-size:.75rem; font-weight:600; transition:opacity .15s; display:inline-flex; align-items:center; gap:6px; }
.bg-btn:disabled { opacity:.45; cursor:not-allowed; }
.bg-btn-gold  { background:var(--gold); color:#000; }
.bg-btn-green { background:#28a050; color:#fff; }
.bg-btn-red   { background:#a02828; color:#fff; }
.bg-btn-ghost { background:var(--bg3); color:var(--text); border:1px solid var(--border); }
.bg-btn-blue  { background:#1976d2; color:#fff; }

.bg-spinner { width:12px; height:12px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }

/* Modals */
.bg-overlay { position:fixed; inset:0; background:rgba(0,0,0,.78); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
.bg-modal   { background:var(--bg2); border:1px solid var(--border); border-radius:14px; width:100%; max-width:720px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; }
.bg-modal-head  { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--border); flex-shrink:0; }
.bg-modal-title { font-size:.95rem; font-weight:800; color:var(--gold); }
.bg-modal-close { background:none; border:none; color:var(--muted); font-size:1.3rem; cursor:pointer; line-height:1; }
.bg-modal-body  { flex:1; overflow-y:auto; padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
.bg-modal-foot  { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; }

.bg-field-label    { font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:5px; display:flex; align-items:center; justify-content:space-between; }
.bg-field-input    { padding:9px 12px; border-radius:7px; border:1px solid var(--border); background:var(--bg3); color:var(--text); font-size:.84rem; outline:none; font-family:inherit; width:100%; box-sizing:border-box; }
.bg-field-input:focus  { border-color:rgba(201,151,58,.5); }
.bg-field-textarea { min-height:120px; resize:vertical; }
.bg-field-textarea.tall { min-height:220px; }

/* Mode toggle */
.nb-mode-row    { display:flex; border:1px solid var(--border); border-radius:9px; overflow:hidden; }
.nb-mode-btn    { flex:1; padding:10px 0; border:none; cursor:pointer; font-size:.84rem; font-weight:700; background:transparent; color:var(--muted); transition:all .15s; }
.nb-mode-btn.active { background:rgba(201,151,58,.14); color:var(--gold); }

/* Movie search dropdown */
.bg-movie-dd      { position:absolute; top:100%; left:0; right:0; background:var(--bg2); border:1px solid var(--border); border-radius:6px; z-index:60; max-height:180px; overflow-y:auto; margin-top:2px; box-shadow:0 4px 16px rgba(0,0,0,.35); }
.bg-movie-dd-item { padding:8px 12px; cursor:pointer; font-size:.84rem; }
.bg-movie-dd-item:hover { background:var(--bg3); }

/* Prompt preview box */
.bg-prompt-box { background:rgba(144,202,249,.06); border:1px solid rgba(144,202,249,.2); border-radius:8px; padding:10px 12px; font-size:.73rem; color:#aad4f5; line-height:1.7; font-family:monospace; white-space:pre-wrap; max-height:110px; overflow-y:auto; }

/* Error / timeout banner */
.nb-err { font-size:.76rem; color:#f88; background:rgba(220,50,50,.1); border:1px solid rgba(220,50,50,.3); border-radius:7px; padding:8px 12px; }

.nb-divider { border:none; border-top:1px solid var(--border); margin:2px 0; }

/* Cast & Crew rows */
.bg-cast-row { border-bottom:1px solid var(--border); }
.bg-cast-row:last-child { border-bottom:none; }
.bg-cast-header { display:flex; align-items:center; gap:14px; padding:12px 18px; cursor:pointer; transition:background .15s; user-select:none; }
.bg-cast-header:hover { background:rgba(255,255,255,.03); }
.bg-cast-photo { width:38px; height:38px; border-radius:50%; object-fit:cover; border:1px solid var(--border); background:var(--bg3); flex-shrink:0; }
.bg-cast-photo-ph { width:38px; height:38px; border-radius:50%; flex-shrink:0; border:1px solid var(--border); background:var(--bg3); display:flex; align-items:center; justify-content:center; font-size:1rem; }

/* Main tabs inside BlogGenerator */
.bg-main-tabs { display:flex; gap:0; border-bottom:1px solid var(--border); margin-bottom:0; }
.bg-main-tab  { padding:9px 20px; border:none; cursor:pointer; font-size:.82rem; font-weight:600; background:transparent; color:var(--muted); border-bottom:2px solid transparent; transition:all .15s; }
.bg-main-tab.active { color:var(--gold); border-bottom-color:var(--gold); }
.bg-main-tab:hover:not(.active) { color:var(--text); }

/* Uncategorized blogs list */
.bg-uncat-list { display:flex; flex-direction:column; gap:6px; padding:14px 18px; }
`;

// ─── Spinner element ─────────────────────────────────────────────────────────
const Spin = () => <span className="bg-spinner" />;

// ─── Inline Image Uploader ───────────────────────────────────────────────────
// Uploads a photo file → inserts a centered <figure> tag at the textarea cursor.
function InlineImageUploader({ textareaRef, content, onChange, onToast }) {
  const fileRef   = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const token = getAdminToken();
      const fd    = new FormData();
      fd.append("image", file);
      const res = await fetch(`${API_BASE}/admin/upload-blog-image`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const { url } = await res.json();
      const caption  = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      const imgHtml  = `\n<figure class="article-inline-img">\n  <img src="${url}" alt="${caption}" />\n  <figcaption>${caption}</figcaption>\n</figure>\n`;
      const ta = textareaRef?.current;
      let newContent;
      if (ta) {
        const start = ta.selectionStart ?? content.length;
        const end   = ta.selectionEnd   ?? content.length;
        newContent  = content.slice(0, start) + imgHtml + content.slice(end);
      } else {
        newContent = content + imgHtml;
      }
      onChange(newContent);
      onToast("📷 Photo inserted into article!", "success");
    } catch (err) {
      onToast("❌ " + err.message, "error");
    }
    setUploading(false);
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*"
        style={{ display:"none" }} onChange={handleFile} />
      <button
        className="bg-btn bg-btn-ghost"
        style={{ fontSize:".72rem", padding:"4px 10px", borderColor:"rgba(144,202,249,.35)", color:"#90caf9" }}
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        title="Upload a photo and insert it inline into the article"
      >
        {uploading ? <><Spin /> Uploading…</> : "📷 Insert Photo"}
      </button>
    </>
  );
}

// ─── Shared YouTube picker with live thumbnail preview ───────────────────────
// Accepts full URLs (youtube.com/watch?v=X, youtu.be/X) or bare 11-char IDs.
function parseYtId(input) {
  const s = String(input || "").trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return "";
}

function YoutubePicker({ value, onChange }) {
  const cleanId = parseYtId(value);
  const valid   = cleanId.length === 11;
  return (
    <div>
      <label className="bg-field-label">
        🎬 YouTube Video
        <span style={{ fontWeight:400, textTransform:"none", fontSize:".65rem", color:"var(--muted)" }}>
          optional — full URL or video ID
        </span>
      </label>
      <input
        className="bg-field-input"
        placeholder="https://youtube.com/watch?v=… or just the ID"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && valid && (
        <div style={{ marginTop:8, display:"flex", alignItems:"flex-start", gap:10 }}>
          <img
            src={`https://img.youtube.com/vi/${cleanId}/mqdefault.jpg`}
            alt="YouTube thumbnail"
            style={{ width:160, height:90, objectFit:"cover", borderRadius:6, border:"1px solid var(--border)", flexShrink:0 }}
            onError={e => e.target.style.display="none"}
          />
          <div style={{ fontSize:".69rem", lineHeight:1.7 }}>
            <span style={{ color:"#4acf82" }}>✅ Video ID: <b style={{ color:"var(--text)" }}>{cleanId}</b></span><br />
            <span style={{ color:"var(--muted)" }}>This video will be embedded on the blog post.</span>
          </div>
        </div>
      )}
      {value && !valid && (
        <div style={{ marginTop:5, fontSize:".69rem", color:"#f88" }}>
          ⚠️ Could not detect a valid YouTube ID — paste the full URL or the 11-character ID.
        </div>
      )}
    </div>
  );
}


function EditModal({ article, movies=[], cast=[], onClose, onSaved, onToast }) {
  const [title,          setTitle]          = useState(article.title          || "");
  const [content,        setContent]        = useState(article.content        || "");
  const [excerpt,        setExcerpt]        = useState(article.excerpt        || "");
  const [pub,            setPub]            = useState(article.published !== false);
  const [youtubeVideoId, setYoutubeVideoId] = useState(article.youtubeVideoId || "");
  const [saving,         setSaving]         = useState(false);
  const contentRef = useRef(null);

  // ── Link type: "none" | "movie" | "cast"
  const initLinkType = article.castId || article.castName ? "cast" : article.movieId || article.movieTitle ? "movie" : "none";
  const [linkType, setLinkType] = useState(initLinkType);

  // ── Movie link state
  const [linkedMovie,  setLinkedMovie]  = useState(
    article.movieId || article.movieTitle
      ? { _id: article.movieId, title: article.movieTitle, posterUrl: article.coverImage }
      : null
  );
  const [movieQuery,   setMovieQuery]   = useState("");
  const [movieResults, setMovieResults] = useState([]);
  const movieTimer = useRef(null);

  // ── Cast link state
  const [linkedCast,   setLinkedCast]   = useState(
    article.castId || article.castName
      ? { _id: article.castId, name: article.castName, type: "", photo: "" }
      : null
  );
  const [castQuery,    setCastQuery]    = useState("");
  const [castResults,  setCastResults]  = useState([]);
  const castTimer = useRef(null);

  // Client-side movie search
  useEffect(() => {
    const q = movieQuery.trim().toLowerCase();
    if (!q) { setMovieResults([]); return; }
    clearTimeout(movieTimer.current);
    movieTimer.current = setTimeout(() => {
      setMovieResults(movies.filter(m => m.title.toLowerCase().includes(q)).slice(0, 6));
    }, 150);
    return () => clearTimeout(movieTimer.current);
  }, [movieQuery, movies]);

  // Client-side cast search
  useEffect(() => {
    const q = castQuery.trim().toLowerCase();
    if (!q) { setCastResults([]); return; }
    clearTimeout(castTimer.current);
    castTimer.current = setTimeout(() => {
      setCastResults(cast.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6));
    }, 150);
    return () => clearTimeout(castTimer.current);
  }, [castQuery, cast]);

  const selectMovie = (m) => { setLinkedMovie(m); setMovieQuery(""); setMovieResults([]); };
  const clearMovie  = () => { setLinkedMovie(null); setMovieQuery(""); setMovieResults([]); };
  const selectCast  = (c) => { setLinkedCast(c);  setCastQuery("");  setCastResults([]); };
  const clearCast   = () => { setLinkedCast(null); setCastQuery("");  setCastResults([]); };

  const save = async () => {
    setSaving(true);
    try {
      const cleanId = parseYtId(youtubeVideoId);
      const updated = await updateArticle(article._id, {
        title:   title.trim(),
        content: content.trim(),
        excerpt: excerpt.trim() || content.slice(0, 200).trim() + "…",
        published: pub,
        youtubeVideoId: cleanId,
        // Cast link
        castId:   linkType === "cast" && linkedCast?._id  ? linkedCast._id  : null,
        castName: linkType === "cast" && linkedCast?.name ? linkedCast.name  : "",
        // Movie link
        movieId:    linkType === "movie" && linkedMovie?._id   ? linkedMovie._id   : null,
        movieTitle: linkType === "movie" && linkedMovie?.title ? linkedMovie.title : "",
      });
      onSaved(updated);
      onToast("✅ Article updated!", "success");
      onClose();
    } catch (err) { onToast("❌ " + err.message, "error"); }
    setSaving(false);
  };

  return (
    <div className="bg-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-modal">
        <div className="bg-modal-head">
          <span className="bg-modal-title">✏️ Edit Article</span>
          <button className="bg-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="bg-modal-body">
          <div><label className="bg-field-label">Title</label>
            <input className="bg-field-input" value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><label className="bg-field-label">Excerpt</label>
            <input className="bg-field-input" value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Short teaser shown on blog cards…" /></div>
          <div>
            <label className="bg-field-label" style={{ marginBottom: 5 }}>
              Content
              <InlineImageUploader
                textareaRef={contentRef}
                content={content}
                onChange={setContent}
                onToast={onToast}
              />
            </label>
            <textarea ref={contentRef} className="bg-field-input bg-field-textarea tall" value={content} onChange={e => setContent(e.target.value)} />
          </div>
          <YoutubePicker value={youtubeVideoId} onChange={setYoutubeVideoId} />

          {/* ── Link to Cast / Movie ── */}
          <div>
            <label className="bg-field-label" style={{ marginBottom: 8 }}>
              Link to
              <span style={{ fontWeight: 400, textTransform: "none", fontSize: ".65rem", color: "var(--muted)" }}> optional</span>
            </label>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[["none", "📝 Standalone"], ["movie", "🎬 Movie"], ["cast", "🎭 Cast / Crew"]].map(([v, label]) => (
                <button key={v}
                  className="bg-btn bg-btn-ghost"
                  style={{
                    flex: 1, justifyContent: "center", fontSize: ".78rem",
                    background: linkType === v ? "rgba(201,151,58,.15)" : "var(--bg3)",
                    borderColor: linkType === v ? "var(--gold)" : "var(--border)",
                    color: linkType === v ? "var(--gold)" : "var(--muted)",
                    fontWeight: linkType === v ? 700 : 500,
                  }}
                  onClick={() => {
                    setLinkType(v);
                    if (v !== "movie") clearMovie();
                    if (v !== "cast")  clearCast();
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Movie picker */}
            {linkType === "movie" && (
              linkedMovie ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(201,151,58,.08)", border: "1px solid rgba(201,151,58,.3)", borderRadius: 8 }}>
                  {linkedMovie.posterUrl && (
                    <img src={linkedMovie.posterUrl} alt={linkedMovie.title}
                      style={{ width: 26, height: 38, objectFit: "cover", borderRadius: 3, border: "1px solid var(--border)" }}
                      onError={e => e.target.style.display = "none"} />
                  )}
                  <span style={{ flex: 1, fontWeight: 700, fontSize: ".84rem", color: "var(--gold)" }}>🎬 {linkedMovie.title}</span>
                  <button className="bg-btn bg-btn-ghost" style={{ fontSize: ".68rem", padding: "3px 8px" }} onClick={clearMovie}>✕ Remove</button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input className="bg-field-input"
                    placeholder="Search movie to link…"
                    value={movieQuery} onChange={e => setMovieQuery(e.target.value)} />
                  {movieResults.length > 0 && (
                    <div className="bg-movie-dd">
                      {movieResults.map(m => (
                        <div key={m._id} className="bg-movie-dd-item" onClick={() => selectMovie(m)}>
                          🎬 {m.title}
                          <span style={{ fontSize: ".7rem", color: "var(--muted)", marginLeft: 8 }}>
                            {m.releaseDate ? new Date(m.releaseDate).getFullYear() : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {/* Cast picker */}
            {linkType === "cast" && (
              linkedCast ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(167,139,232,.08)", border: "1px solid rgba(167,139,232,.3)", borderRadius: 8 }}>
                  {linkedCast.photo && (
                    <img src={linkedCast.photo} alt={linkedCast.name}
                      style={{ width: 34, height: 34, objectFit: "cover", borderRadius: "50%", border: "1px solid var(--border)" }}
                      onError={e => e.target.style.display = "none"} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: ".84rem", color: "#a78be8" }}>🎭 {linkedCast.name}</div>
                    {linkedCast.type && <div style={{ fontSize: ".68rem", color: "var(--muted)" }}>{linkedCast.type}</div>}
                  </div>
                  <button className="bg-btn bg-btn-ghost" style={{ fontSize: ".68rem", padding: "3px 8px" }} onClick={clearCast}>✕ Remove</button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input className="bg-field-input"
                    placeholder="Search cast/crew member…"
                    value={castQuery} onChange={e => setCastQuery(e.target.value)} />
                  {castResults.length > 0 && (
                    <div className="bg-movie-dd">
                      {castResults.map(c => (
                        <div key={c._id} className="bg-movie-dd-item" onClick={() => selectCast(c)}
                          style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {c.photo
                            ? <img src={c.photo} alt={c.name} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
                            : <span style={{ fontSize: "1rem" }}>👤</span>
                          }
                          <span style={{ flex: 1 }}>{c.name}</span>
                          <span style={{ fontSize: ".7rem", color: "var(--muted)" }}>{c.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".84rem", color: "var(--text)" }}>
            <input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} />
            Published (visible on public blog)
          </label>
        </div>
        <div className="bg-modal-foot">
          <button className="bg-btn bg-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="bg-btn bg-btn-gold" onClick={save} disabled={saving || !title.trim() || !content.trim()}>
            {saving ? <><Spin /> Saving…</> : "💾 Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Blog Modal ───────────────────────────────────────────────────────────
function NewBlogModal({ movies=[], cast=[], onClose, onPublished, onToast }) {
  const [mode, setMode] = useState("ai");   // "ai" | "manual"
  const [step, setStep] = useState(1);      // AI only: 1=setup, 2=review

  // Movie link
  const [movieQuery,   setMovieQuery]   = useState("");
  const [movieResults, setMovieResults] = useState([]);
  const [linkedMovie,  setLinkedMovie]  = useState(null);
  const movieTimer = useRef(null);

  // Cast link
  const [castQuery,    setCastQuery]    = useState("");
  const [castResults,  setCastResults]  = useState([]);
  const [linkedCast,   setLinkedCast]   = useState(null);
  const castTimer = useRef(null);

  // "link type" toggle — movie or cast
  const [linkType, setLinkType] = useState("movie"); // "movie" | "cast" | "none"

  // AI
  const [articleType, setArticleType] = useState("review");
  const [castArticleType, setCastArticleType] = useState("profile");
  const [userPrompt,  setUserPrompt]  = useState("");

  // Shared blog fields
  const [blogTitle,    setBlogTitle]    = useState("");
  const [blogContent,  setBlogContent]  = useState("");
  const [blogCategory, setBlogCategory] = useState("General");
  const [blogTags,     setBlogTags]     = useState("");
  const [coverImage,   setCoverImage]   = useState("");
  const [publishNow,   setPublishNow]   = useState(true);
  const [youtubeVideoId, setYoutubeVideoId] = useState("");

  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errMsg,     setErrMsg]     = useState("");
  const contentRef = useRef(null);

  // Client-side movie search
  useEffect(() => {
    const q = movieQuery.trim().toLowerCase();
    if (!q) { setMovieResults([]); return; }
    clearTimeout(movieTimer.current);
    movieTimer.current = setTimeout(() => {
      setMovieResults(movies.filter(m => m.title.toLowerCase().includes(q)).slice(0,6));
    }, 150);
    return () => clearTimeout(movieTimer.current);
  }, [movieQuery, movies]);

  // Client-side cast search
  useEffect(() => {
    const q = castQuery.trim().toLowerCase();
    if (!q) { setCastResults([]); return; }
    clearTimeout(castTimer.current);
    castTimer.current = setTimeout(() => {
      setCastResults(cast.filter(c => c.name.toLowerCase().includes(q)).slice(0,6));
    }, 150);
    return () => clearTimeout(castTimer.current);
  }, [castQuery, cast]);

  const selectMovie = (m) => {
    setLinkedMovie(m); setLinkedCast(null);
    setMovieQuery(""); setMovieResults([]);
    if (!blogTitle) setBlogTitle(autoTitle(m, articleType));
    if (!coverImage && (m.posterUrl||m.thumbnailUrl)) setCoverImage(m.posterUrl||m.thumbnailUrl||"");
    setBlogCategory(autoCategory(articleType));
  };
  const clearMovie = () => { setLinkedMovie(null); setMovieQuery(""); setMovieResults([]); };

  const selectCast = (c) => {
    setLinkedCast(c); setLinkedMovie(null);
    setCastQuery(""); setCastResults([]);
    if (!blogTitle) setBlogTitle(autoCastTitle(c, castArticleType));
    if (!coverImage && c.photo) setCoverImage(c.photo||"");
    setBlogCategory("Actor Spotlight");
  };
  const clearCast = () => { setLinkedCast(null); setCastQuery(""); setCastResults([]); };

  // Auto-update title when type changes
  useEffect(() => {
    if (linkedMovie) { setBlogTitle(autoTitle(linkedMovie, articleType)); setBlogCategory(autoCategory(articleType)); }
  }, [articleType]); // eslint-disable-line

  useEffect(() => {
    if (linkedCast) { setBlogTitle(autoCastTitle(linkedCast, castArticleType)); setBlogCategory("Actor Spotlight"); }
  }, [castArticleType]); // eslint-disable-line

  const switchMode = (m) => { setMode(m); setStep(1); setErrMsg(""); setBlogContent(""); };

  const buildPrompt = useCallback(() => {
    const htmlRules = `\n\nOUTPUT RULES — STRICTLY FOLLOW:
- Output ONLY clean HTML wrapped in <article>. No markdown. No plain text outside tags.
- Use <h2> for section headings, <h3> for sub-headings
- Use <p> for paragraphs (2–3 sentences each)
- Use <ul><li> for bullet lists, <ol><li> for numbered lists
- Use <strong> for emphasis, <table> for data
- End with a FAQ section: <section class="faq-section"><h2>Frequently Asked Questions</h2> with 4 <details><summary> items
- Do NOT use inline styles. Do NOT output anything outside <article>.`;

    // Cast member prompt
    if (linkedCast && linkType === "cast") {
      const base = buildCastPrompt(linkedCast, castArticleType);
      return userPrompt.trim() ? `${base}\n\nEditor notes: ${userPrompt.trim()}` : base;
    }

    if (articleType === "custom") {
      const base = userPrompt.trim() || "Write an engaging 1000+ word blog article about Ollywood cinema.";
      if (linkedMovie) {
        const cast2  = (linkedMovie.cast||[]).slice(0,5).map(c => `${c.name}${c.role?` as ${c.role}`:""}`).join(", ");
        const year  = linkedMovie.releaseDate ? new Date(linkedMovie.releaseDate).getFullYear() : "upcoming";
        const ctx   = `\n\n[Movie context: "${linkedMovie.title}" (${year}), Director: ${linkedMovie.director||"N/A"}, Cast: ${cast2||"N/A"}, Synopsis: ${linkedMovie.synopsis||"N/A"}]`;
        return `${base}${ctx}${htmlRules}`;
      }
      return `${base}${htmlRules}`;
    }
    if (linkedMovie) {
      const base = buildMoviePrompt(linkedMovie, articleType);
      return userPrompt.trim() ? `${base}\n\nEditor notes: ${userPrompt.trim()}` : base;
    }
    const topic = userPrompt.trim() || "Write an engaging 1000+ word blog article about Ollywood cinema.";
    return `You are an expert SEO blog writer for Ollypedia, an Odia cinema website.\n\nInstructions: ${topic}\n\n${htmlRules}\n\nIMPORTANT: Respond ONLY with a valid JSON object (no markdown, no backticks, no extra text) in this exact format:\n{"title": "Your Blog Title Here", "content": "<article>...full HTML content here...</article>"}`;
  }, [linkedMovie, linkedCast, linkType, articleType, castArticleType, userPrompt]);

  const handleGenerate = async () => {
    if (articleType === "custom" && !linkedCast && !userPrompt.trim()) {
      setErrMsg("Please write your custom prompt before generating.");
      return;
    }
    setErrMsg(""); setGenerating(true); setBlogContent("");
    try {
      const text = await callGenerateAPI(buildPrompt());
      const isCastMode     = linkType === "cast" && linkedCast;
      const isMovieLinked  = !!linkedMovie && articleType !== "custom";

      if (isCastMode) {
        setBlogContent(text);
        if (!blogTitle) setBlogTitle(autoCastTitle(linkedCast, castArticleType));
      } else if (isMovieLinked) {
        setBlogContent(text);
        if (!blogTitle) setBlogTitle(autoTitle(linkedMovie, articleType));
      } else {
        let parsed = null;
        try {
          const clean = text.replace(/```json|```/g, "").trim();
          parsed = JSON.parse(clean);
        } catch {
          const lines = text.split("\n").filter(Boolean);
          parsed = { title: lines[0]?.slice(0,100) || "New Blog Post", content: lines.slice(1).join("\n").trim() || text };
        }
        setBlogTitle(parsed.title?.trim() || "New Blog Post");
        setBlogContent(parsed.content?.trim() || text);
      }
      setStep(2);
    } catch (err) {
      setErrMsg(err.message);
      onToast("❌ "+err.message, "error");
    }
    setGenerating(false);
  };

  const handlePublish = async () => {
    if (!blogTitle.trim() || !blogContent.trim()) return;
    setErrMsg(""); setPublishing(true);
    try {
      const post = await publishBlogPost({
        title:blogTitle, content:blogContent,
        category:blogCategory, tags:blogTags,
        coverImage,
        movie: linkType==="movie" ? linkedMovie : null,
        castMember: linkType==="cast" ? linkedCast : null,
        published:publishNow,
        youtubeVideoId: parseYtId(youtubeVideoId),
      });
      onPublished(post); onClose();
    } catch (err) {
      setErrMsg(err.message);
      onToast("❌ "+err.message, "error");
    }
    setPublishing(false);
  };

  // ── Shared: link type selector
  const LinkTypePicker = (
    <div>
      <label className="bg-field-label" style={{ marginBottom:8 }}>
        Link to
        <span style={{ fontWeight:400, textTransform:"none", fontSize:".65rem", color:"var(--muted)" }}>optional</span>
      </label>
      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
        {[["none","📝 Standalone"],["movie","🎬 Movie"],["cast","🎭 Cast / Crew"]].map(([v,label]) => (
          <button key={v}
            className="bg-btn bg-btn-ghost"
            style={{
              flex:1, justifyContent:"center", fontSize:".78rem",
              background: linkType===v ? "rgba(201,151,58,.15)" : "var(--bg3)",
              borderColor: linkType===v ? "var(--gold)" : "var(--border)",
              color: linkType===v ? "var(--gold)" : "var(--muted)",
              fontWeight: linkType===v ? 700 : 500,
            }}
            onClick={() => {
              setLinkType(v);
              if (v !== "movie") clearMovie();
              if (v !== "cast")  clearCast();
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Movie picker */}
      {linkType === "movie" && (
        linkedMovie ? (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"rgba(201,151,58,.08)", border:"1px solid rgba(201,151,58,.3)", borderRadius:8 }}>
            {(linkedMovie.posterUrl||linkedMovie.thumbnailUrl) && (
              <img src={linkedMovie.posterUrl||linkedMovie.thumbnailUrl} alt={linkedMovie.title}
                style={{ width:26, height:38, objectFit:"cover", borderRadius:3, border:"1px solid var(--border)" }}
                onError={e=>e.target.style.display="none"} />
            )}
            <span style={{ flex:1, fontWeight:700, fontSize:".84rem", color:"var(--gold)" }}>🎬 {linkedMovie.title}</span>
            <button className="bg-btn bg-btn-ghost" style={{ fontSize:".68rem", padding:"3px 8px" }} onClick={clearMovie}>✕ Remove</button>
          </div>
        ) : (
          <div style={{ position:"relative" }}>
            <input className="bg-field-input"
              placeholder="Search movie to link…"
              value={movieQuery} onChange={e=>setMovieQuery(e.target.value)} />
            {movieResults.length > 0 && (
              <div className="bg-movie-dd">
                {movieResults.map(m => (
                  <div key={m._id} className="bg-movie-dd-item" onClick={()=>selectMovie(m)}>
                    🎬 {m.title}
                    <span style={{ fontSize:".7rem", color:"var(--muted)", marginLeft:8 }}>
                      {m.releaseDate ? new Date(m.releaseDate).getFullYear() : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Cast picker */}
      {linkType === "cast" && (
        linkedCast ? (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"rgba(167,139,232,.08)", border:"1px solid rgba(167,139,232,.3)", borderRadius:8 }}>
            {linkedCast.photo && (
              <img src={linkedCast.photo} alt={linkedCast.name}
                style={{ width:34, height:34, objectFit:"cover", borderRadius:"50%", border:"1px solid var(--border)" }}
                onError={e=>e.target.style.display="none"} />
            )}
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:".84rem", color:"#a78be8" }}>🎭 {linkedCast.name}</div>
              <div style={{ fontSize:".68rem", color:"var(--muted)" }}>{linkedCast.type}</div>
            </div>
            <button className="bg-btn bg-btn-ghost" style={{ fontSize:".68rem", padding:"3px 8px" }} onClick={clearCast}>✕ Remove</button>
          </div>
        ) : (
          <div style={{ position:"relative" }}>
            <input className="bg-field-input"
              placeholder="Search cast/crew member…"
              value={castQuery} onChange={e=>setCastQuery(e.target.value)} />
            {castResults.length > 0 && (
              <div className="bg-movie-dd">
                {castResults.map(c => (
                  <div key={c._id} className="bg-movie-dd-item" onClick={()=>selectCast(c)}
                    style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {c.photo
                      ? <img src={c.photo} alt={c.name} style={{ width:24, height:24, borderRadius:"50%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />
                      : <span style={{ fontSize:"1rem" }}>👤</span>
                    }
                    <span style={{ flex:1 }}>{c.name}</span>
                    <span style={{ fontSize:".7rem", color:"var(--muted)" }}>{c.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );

  // ── Shared: meta fields (category, tags, cover, publish toggle)
  const MetaFields = (
    <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div>
          <label className="bg-field-label">Category</label>
          <select className="bg-field-input" value={blogCategory} onChange={e=>setBlogCategory(e.target.value)} style={{ appearance:"auto" }}>
            {BLOG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="bg-field-label">Tags <span style={{ fontWeight:400, textTransform:"none" }}>(comma-separated)</span></label>
          <input className="bg-field-input" placeholder="Ollywood, Drama, 2025…"
            value={blogTags} onChange={e=>setBlogTags(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="bg-field-label">Cover Image URL <span style={{ fontWeight:400, textTransform:"none" }}>(optional)</span></label>
        <input className="bg-field-input" placeholder="https://…"
          value={coverImage} onChange={e=>setCoverImage(e.target.value)} />
        {coverImage && (
          <img src={coverImage} alt="cover"
            style={{ marginTop:6, maxHeight:80, borderRadius:5, border:"1px solid var(--border)", display:"block" }}
            onError={e=>e.target.style.display="none"} />
        )}
      </div>
      <YoutubePicker value={youtubeVideoId} onChange={setYoutubeVideoId} />
      {linkedMovie && linkType==="movie" && (
        <div style={{ padding:"7px 12px", background:"rgba(201,151,58,.06)", border:"1px solid rgba(201,151,58,.22)", borderRadius:7, fontSize:".76rem", color:"var(--gold)" }}>
          🎬 Linked to movie: <b>{linkedMovie.title}</b>
        </div>
      )}
      {linkedCast && linkType==="cast" && (
        <div style={{ padding:"7px 12px", background:"rgba(167,139,232,.06)", border:"1px solid rgba(167,139,232,.22)", borderRadius:7, fontSize:".76rem", color:"#a78be8" }}>
          🎭 Linked to cast: <b>{linkedCast.name}</b> ({linkedCast.type})
        </div>
      )}
      <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:".84rem", color:"var(--text)" }}>
        <input type="checkbox" checked={publishNow} onChange={e=>setPublishNow(e.target.checked)} />
        Publish immediately (visible on public blog)
      </label>
    </>
  );

  return (
    <div className="bg-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="bg-modal">
        <div className="bg-modal-head">
          <span className="bg-modal-title">
            ✍️ New Blog Post
            {mode==="ai" && step===2 && <span style={{ fontSize:".7rem", fontWeight:500, color:"var(--muted)", marginLeft:10 }}>— Review & Publish</span>}
          </span>
          <button className="bg-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="bg-modal-body">

          {/* ─── Mode toggle (step 1 only) ─── */}
          {step === 1 && (
            <div>
              <label className="bg-field-label" style={{ marginBottom:8 }}>How do you want to write this blog?</label>
              <div className="nb-mode-row">
                <button className={`nb-mode-btn${mode==="ai"?" active":""}`} onClick={()=>switchMode("ai")}>
                  ✨ AI Generate
                </button>
                <button className={`nb-mode-btn${mode==="manual"?" active":""}`} onClick={()=>switchMode("manual")}>
                  ✏️ Write Manually
                </button>
              </div>
            </div>
          )}

          {/* ════════ AI MODE — Step 1 ════════ */}
          {mode==="ai" && step===1 && (
            <>
              {LinkTypePicker}

              {/* Cast article types — only when cast is linked */}
              {linkType === "cast" && linkedCast && (
                <div>
                  <label className="bg-field-label">Article Type</label>
                  <div className="bg-types" style={{ marginBottom:8 }}>
                    {CAST_ARTICLE_TYPES.map(t => (
                      <button key={t.id}
                        className={`bg-type-chip${castArticleType===t.id?" active":""}`}
                        style={{
                          borderColor: t.color,
                          color: castArticleType===t.id ? "#fff" : t.color,
                          background: castArticleType===t.id ? t.color : "transparent",
                          borderStyle: t.id==="custom" ? "dashed" : "solid",
                        }}
                        onClick={() => setCastArticleType(t.id)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Movie article types — only when movie is linked or standalone */}
              {linkType !== "cast" && (
                <div>
                  <label className="bg-field-label">Article Type</label>
                  <div className="bg-types" style={{ marginBottom: articleType==="custom" ? 8 : 0 }}>
                    {ARTICLE_TYPES.map(t => (
                      <button key={t.id}
                        className={`bg-type-chip${articleType===t.id?" active":""}`}
                        style={{
                          borderColor: t.color,
                          color: articleType===t.id ? (t.id==="review"?"#000":"#fff") : t.color,
                          background: articleType===t.id ? t.color : "transparent",
                          borderStyle: t.id==="custom" ? "dashed" : "solid",
                        }}
                        onClick={() => setArticleType(p => p===t.id ? (linkedMovie?"review":null) : t.id)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {articleType==="custom" && (
                    <div style={{ padding:"8px 12px", background:"rgba(160,196,160,.08)", border:"1px solid rgba(160,196,160,.2)", borderRadius:7, fontSize:".72rem", color:"#a0c4a0", lineHeight:1.65 }}>
                      ✏️ <strong>Custom mode</strong> — write any prompt you like below.
                      {linkedMovie && " Movie data is available as optional context."}
                    </div>
                  )}
                </div>
              )}

              <hr className="nb-divider" />

              <div>
                <label className="bg-field-label">
                  {(linkType==="cast" && castArticleType==="custom") || (linkType!=="cast" && articleType==="custom")
                    ? "Your Custom Prompt"
                    : linkedMovie||linkedCast ? "Extra Notes for AI" : "What should the blog be about?"}
                  <span style={{ fontWeight:400, textTransform:"none", fontSize:".65rem", color:"var(--muted)" }}>
                    {(linkType==="cast" && castArticleType==="custom") || (linkType!=="cast" && articleType==="custom")
                      ? "required"
                      : linkedMovie||linkedCast ? "optional" : "required"}
                  </span>
                </label>
                <textarea className="bg-field-input bg-field-textarea"
                  placeholder={
                    linkedCast && linkType==="cast"
                      ? `e.g. "Focus on their most emotional performances" or "Highlight their contribution to Odia cinema"`
                      : linkedMovie
                        ? `e.g. "Focus on the emotional climax" or "Highlight the music score"…`
                        : `Describe your blog topic, tone, key points and audience.`
                  }
                  value={userPrompt} onChange={e=>setUserPrompt(e.target.value)}
                  style={{ minHeight:100 }} />
              </div>

              <hr className="nb-divider" />

              <div>
                <label className="bg-field-label">
                  Blog Title
                  <span style={{ fontWeight:400, textTransform:"none", fontSize:".65rem", color:"var(--muted)" }}>
                    {linkedMovie||linkedCast ? "auto-filled" : "auto-generated by AI"}
                  </span>
                </label>
                {(linkedMovie||linkedCast) ? (
                  <input className="bg-field-input" placeholder="Leave blank to auto-fill…"
                    value={blogTitle} onChange={e=>setBlogTitle(e.target.value)} />
                ) : (
                  <div style={{ padding:"9px 12px", borderRadius:7, border:"1px dashed var(--border)", background:"rgba(255,255,255,.02)", fontSize:".82rem", color:"var(--muted)", fontStyle:"italic" }}>
                    ✨ AI will generate the title from your prompt
                  </div>
                )}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label className="bg-field-label">Category</label>
                  <select className="bg-field-input" value={blogCategory} onChange={e=>setBlogCategory(e.target.value)} style={{ appearance:"auto" }}>
                    {BLOG_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="bg-field-label">Tags</label>
                  <input className="bg-field-input" placeholder="Ollywood, Drama…"
                    value={blogTags} onChange={e=>setBlogTags(e.target.value)} />
                </div>
              </div>

              {errMsg && <div className="nb-err">⚠️ {errMsg}</div>}
            </>
          )}

          {/* ════════ AI MODE — Step 2: review ════════ */}
          {mode==="ai" && step===2 && (
            <>
              <div>
                <label className="bg-field-label">Blog Title</label>
                <input className="bg-field-input" value={blogTitle} onChange={e=>setBlogTitle(e.target.value)} />
              </div>

              <div>
                <label className="bg-field-label">
                  Generated Content — review & edit before publishing
                  <span style={{ fontWeight:400, textTransform:"none", color:"var(--muted)", display:"flex", alignItems:"center", gap:8 }}>
                    <span>{wordCount(blogContent)} words · ~{readTime(blogContent)} min</span>
                    <InlineImageUploader
                      textareaRef={contentRef}
                      content={blogContent}
                      onChange={setBlogContent}
                      onToast={onToast}
                    />
                  </span>
                </label>
                <textarea ref={contentRef} className="bg-field-input bg-field-textarea tall"
                  style={{ minHeight:240, resize:"vertical" }}
                  value={blogContent} onChange={e=>setBlogContent(e.target.value)} />
              </div>

              {MetaFields}
              {errMsg && <div className="nb-err">⚠️ {errMsg}</div>}
            </>
          )}

          {/* ════════ MANUAL MODE ════════ */}
          {mode==="manual" && (
            <>
              {LinkTypePicker}

              <div>
                <label className="bg-field-label">
                  Blog Title <span style={{ color:"#e57373" }}>*</span>
                </label>
                <input className="bg-field-input" placeholder="Enter your blog title…"
                  value={blogTitle} onChange={e=>setBlogTitle(e.target.value)} />
              </div>

              <div>
                <label className="bg-field-label">
                  Content <span style={{ color:"#e57373" }}>*</span>
                  <span style={{ fontWeight:400, textTransform:"none", color:"var(--muted)", display:"flex", alignItems:"center", gap:8 }}>
                    <span>{wordCount(blogContent)} words · ~{readTime(blogContent)} min</span>
                    <InlineImageUploader
                      textareaRef={contentRef}
                      content={blogContent}
                      onChange={setBlogContent}
                      onToast={onToast}
                    />
                  </span>
                </label>
                <textarea ref={contentRef} className="bg-field-input bg-field-textarea tall"
                  style={{ minHeight:260, resize:"vertical" }}
                  value={blogContent} onChange={e=>setBlogContent(e.target.value)}
                  placeholder="Write your full blog content here…" />
              </div>

              {MetaFields}
              {errMsg && <div className="nb-err">⚠️ {errMsg}</div>}
            </>
          )}

        </div>

        {/* ─── Footer ─── */}
        <div className="bg-modal-foot">
          {mode==="ai" && step===2 && (
            <button className="bg-btn bg-btn-ghost" onClick={()=>{ setStep(1); setErrMsg(""); }}>
              ← Back & Re-generate
            </button>
          )}
          <button className="bg-btn bg-btn-ghost" onClick={onClose}>Cancel</button>

          {mode==="ai" && step===1 && (
            <button className="bg-btn bg-btn-blue" onClick={handleGenerate}
              disabled={generating || (articleType === "custom" && !userPrompt.trim())}>
              {generating
                ? <><Spin /> Generating… (up to 60 s)</>
                : articleType === "custom" && !userPrompt.trim()
                  ? "✏️ Enter your prompt first"
                  : "✨ Generate Blog"}
            </button>
          )}

          {(mode==="manual" || (mode==="ai" && step===2)) && (
            <button className="bg-btn bg-btn-green" onClick={handlePublish}
              disabled={publishing || !blogTitle.trim() || !blogContent.trim()}>
              {publishing ? <><Spin /> Saving…</> : (publishNow ? "🚀 Publish Blog" : "💾 Save as Draft")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GenPanel ─────────────────────────────────────────────────────────────────
function GenPanel({ movie, type, onPublished, onToast }) {
  const [status,       setStatus]       = useState("idle");
  const [article,      setArticle]      = useState("");
  const [preview,      setPreview]      = useState(false);
  const [errMsg,       setErrMsg]       = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const busy     = status==="generating" || status==="publishing";
  const typeInfo = ARTICLE_TYPES.find(t=>t.id===type);

  const handleGenerate = async () => {
    if (type === "custom" && !customPrompt.trim()) {
      setErrMsg("Please enter your custom prompt first.");
      return;
    }
    setStatus("generating"); setArticle(""); setErrMsg(""); setPreview(false);
    try {
      let text;
      if (type === "custom") {
        // Build custom prompt with movie context
        const cast = (movie.cast||[]).slice(0,5).map(c=>`${c.name}${c.role?` as ${c.role}`:""}`).join(", ");
        const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "upcoming";
        const ctx  = `\n\n[Movie context: "${movie.title}" (${year}), Director: ${movie.director||"N/A"}, Cast: ${cast||"N/A"}, Synopsis: ${movie.synopsis||"N/A"}]`;
        const prompt = `${customPrompt.trim()}${ctx}\n\nIMPORTANT: Return ONLY the article text. No labels.`;
        text = await callGenerateAPI(prompt);
      } else {
        text = await generateArticle(movie, type);
      }
      setArticle(text); setStatus("ready");
    } catch (err) {
      setStatus("error"); setErrMsg(err.message);
      onToast("❌ "+err.message, "error");
    }
  };

  const handlePublish = async () => {
    if (!article.trim()) return;
    setStatus("publishing"); setErrMsg("");
    try {
      const post = await publishArticle(movie, article, type === "custom" ? "review" : type, youtubeVideoId);
      onPublished(post);
      onToast(`✅ Published: "${typeInfo?.label}" for ${movie.title}`, "success");
      setStatus("idle"); setArticle(""); setPreview(false);
    } catch (err) {
      setStatus("error"); setErrMsg(err.message);
      onToast("❌ "+err.message, "error");
    }
  };

  return (
    <div className="bg-gen-box">
      {/* Custom prompt input — shown only for custom type */}
      {type === "custom" && (
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:".68rem", fontWeight:700, color:"#a0c4a0", textTransform:"uppercase", letterSpacing:".07em", marginBottom:5 }}>
            ✏️ Your Custom Prompt
          </div>
          <textarea
            className="bg-field-input bg-field-textarea"
            style={{ minHeight:100, marginBottom:0 }}
            placeholder={`Write any prompt for this movie.\ne.g. "Write a 1000-word article about the visual storytelling in ${movie.title}"\ne.g. "Write a comparison between ${movie.title} and similar Bollywood films"`}
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
          />
          {errMsg && <div className="nb-err" style={{ marginTop:6 }}>⚠️ {errMsg}</div>}
        </div>
      )}

      <div className="bg-gen-row">
        <span className="bg-gen-label" style={{ color:typeInfo?.color }}>{typeInfo?.label}</span>
        {errMsg && type !== "custom" && <span style={{ fontSize:".69rem", color:"#f77" }}>⚠️ {errMsg}</span>}
        <button className="bg-btn bg-btn-gold" onClick={handleGenerate}
          disabled={busy || (type==="custom" && !customPrompt.trim())}>
          {status==="generating" ? <><Spin />Generating…</> : article ? "🔄 Regenerate" : "✨ Generate"}
        </button>
        {article && <>
          <button className="bg-btn bg-btn-ghost" onClick={()=>setPreview(p=>!p)} disabled={busy}>
            {preview ? "Hide" : "Preview"}
          </button>
          <button className="bg-btn bg-btn-green" onClick={handlePublish} disabled={busy}>
            {status==="publishing" ? <><Spin />Publishing…</> : "🚀 Publish"}
          </button>
        </>}
        {status==="error" && type !== "custom" && (
          <button className="bg-btn bg-btn-red" onClick={handleGenerate}>🔁 Retry</button>
        )}
      </div>
      {article && preview && <div className="bg-gen-preview">{article}</div>}

      {/* YouTube Video — shown once article is ready, before publishing */}
      {article && (
        <div style={{ marginTop:10 }}>
          <YoutubePicker value={youtubeVideoId} onChange={setYoutubeVideoId} />
        </div>
      )}
    </div>
  );
}

// ─── MoviePanel ───────────────────────────────────────────────────────────────
function MoviePanel({ movie, movies=[], cast=[], onToast }) {
  const [articles,   setArticles]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeType, setActiveType] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchMovieBlogs(movie.title)
      .then(posts => setArticles(posts))
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, [movie.title]);

  const handlePublished = (post) => { setArticles(prev=>[post,...prev]); setActiveType(null); };
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this article? This cannot be undone.")) return;
    try { await deleteArticle(id); setArticles(prev=>prev.filter(a=>a._id!==id)); onToast("🗑 Article deleted","success"); }
    catch { onToast("❌ Delete failed","error"); }
  };
  const handleSaved = (updated) => setArticles(prev=>prev.map(a=>a._id===updated._id?updated:a));

  return (
    <div className="bg-panel">
      {loading
        ? <div style={{ fontSize:".77rem", color:"var(--muted)", padding:"6px 0 10px" }}>Loading articles…</div>
        : articles.length>0 && (
          <div style={{ marginBottom:14 }}>
            <div className="bg-section-label">📄 Published Articles ({articles.length})</div>
            <div className="bg-articles">
              {articles.map(art => (
                <div key={art._id} className="bg-art-item">
                  <div className="bg-art-dot" style={{ background:art.published?"#4caf82":"#666" }} />
                  <div className="bg-art-body">
                    <div className="bg-art-title">{art.title}</div>
                    <div className="bg-art-meta">
                      <span style={{ color:art.published?"#4caf82":"#888", fontWeight:700 }}>
                        {art.published ? "● Live" : "○ Draft"}
                      </span>
                      <span>📅 {formatDate(art.createdAt)}</span>
                      {art.readTime && <span>⏱ {art.readTime} min</span>}
                      {art.views>0  && <span>👁 {art.views}</span>}
                      <span style={{ color:"rgba(255,255,255,.25)" }}>{art.category}</span>
                    </div>
                  </div>
                  <div className="bg-art-actions">
                    <a href={`/blog/${art.slug}`} target="_blank" rel="noreferrer" className="bg-art-btn">🔗 View</a>
                    <button className="bg-art-btn" onClick={()=>setEditTarget(art)}>✏️</button>
                    <button className="bg-art-btn del" onClick={()=>handleDelete(art._id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }

      <div className="bg-section-label">✨ Generate New Article — Choose Type</div>
      <div className="bg-types">
        {ARTICLE_TYPES.map(t => (
          <button key={t.id}
            className={`bg-type-chip${activeType===t.id?" active":""}`}
            style={{
              borderColor:t.color,
              color:activeType===t.id?(t.id==="review"?"#000":"#fff"):t.color,
              background:activeType===t.id?t.color:"transparent",
            }}
            onClick={()=>setActiveType(p=>p===t.id?null:t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeType && (
        <GenPanel key={activeType} movie={movie} type={activeType} onPublished={handlePublished} onToast={onToast} />
      )}
      {editTarget && (
        <EditModal article={editTarget} movies={movies} cast={cast} onClose={()=>setEditTarget(null)} onSaved={handleSaved} onToast={onToast} />
      )}
    </div>
  );
}

// ─── CastPanel ────────────────────────────────────────────────────────────────
function CastPanel({ castMember, movies=[], cast=[], onToast }) {
  const [articles,    setArticles]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeType,  setActiveType]  = useState(null);
  const [editTarget,  setEditTarget]  = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [genContent,  setGenContent]  = useState("");
  const [genErr,      setGenErr]      = useState("");
  const [ytId,        setYtId]        = useState("");

  useEffect(() => {
    setLoading(true);
    fetchCastBlogs(castMember.name)
      .then(setArticles).catch(()=>{}).finally(()=>setLoading(false));
  }, [castMember.name]);

  const handlePublish = async () => {
    if (!genContent.trim() || !activeType) return;
    try {
      const title   = autoCastTitle(castMember, activeType);
      const slug    = slugify(`${castMember.name}-${activeType}-${Date.now().toString(36)}`);
      const excerpt = genContent.slice(0,200).trim()+"…";
      const token   = getAdminToken();
      const res = await fetch(`${API_BASE}/admin/blog`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          title, slug, content:genContent, excerpt,
          category:"Actor Spotlight",
          tags:[castMember.name, castMember.type||"Actor", "Ollywood"],
          coverImage: castMember.photo||"",
          castName: castMember.name, castId: castMember._id,
          movieTitle:"", movieId:null,
          author:"OllyPedia Editorial",
          readTime: readTime(genContent), seoTitle:title, seoDesc:excerpt,
          published:true,
          ...(ytId.trim() ? { youtubeVideoId: parseYtId(ytId) } : {}),
        }),
      });
      if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error||"Publish failed"); }
      const post = await res.json();
      invalidateBlogCache();
      setArticles(prev=>[post,...prev]);
      setActiveType(null); setGenContent(""); setYtId("");
      onToast(`✅ Published: "${title}"`, "success");
    } catch(err) { onToast("❌ "+err.message, "error"); }
  };

  const handleGenerate = async (type) => {
    setGenerating(true); setGenContent(""); setGenErr("");
    try {
      const text = await callGenerateAPI(buildCastPrompt(castMember, type));
      setGenContent(text);
    } catch(err) { setGenErr(err.message); onToast("❌ "+err.message,"error"); }
    setGenerating(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this article?")) return;
    try { await deleteArticle(id); setArticles(prev=>prev.filter(a=>a._id!==id)); onToast("🗑 Deleted","success"); }
    catch { onToast("❌ Delete failed","error"); }
  };
  const handleSaved = (updated) => setArticles(prev=>prev.map(a=>a._id===updated._id?updated:a));

  return (
    <div className="bg-panel">
      {loading
        ? <div style={{ fontSize:".77rem", color:"var(--muted)", padding:"6px 0 10px" }}>Loading articles…</div>
        : articles.length>0 && (
          <div style={{ marginBottom:14 }}>
            <div className="bg-section-label">📄 Published Articles ({articles.length})</div>
            <div className="bg-articles">
              {articles.map(art => (
                <div key={art._id} className="bg-art-item">
                  <div className="bg-art-dot" style={{ background:art.published?"#4caf82":"#666" }} />
                  <div className="bg-art-body">
                    <div className="bg-art-title">{art.title}</div>
                    <div className="bg-art-meta">
                      <span style={{ color:art.published?"#4caf82":"#888", fontWeight:700 }}>{art.published?"● Live":"○ Draft"}</span>
                      <span>📅 {formatDate(art.createdAt)}</span>
                      {art.readTime && <span>⏱ {art.readTime} min</span>}
                      {art.views>0  && <span>👁 {art.views}</span>}
                    </div>
                  </div>
                  <div className="bg-art-actions">
                    <a href={`/blog/${art.slug}`} target="_blank" rel="noreferrer" className="bg-art-btn">🔗 View</a>
                    <button className="bg-art-btn" onClick={()=>setEditTarget(art)}>✏️</button>
                    <button className="bg-art-btn del" onClick={()=>handleDelete(art._id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }

      <div className="bg-section-label">✨ Generate New Article — Choose Type</div>
      <div className="bg-types">
        {CAST_ARTICLE_TYPES.map(t => (
          <button key={t.id}
            className={`bg-type-chip${activeType===t.id?" active":""}`}
            style={{
              borderColor:t.color,
              color:activeType===t.id?"#fff":t.color,
              background:activeType===t.id?t.color:"transparent",
            }}
            onClick={()=>{ setActiveType(p=>p===t.id?null:t.id); setGenContent(""); setGenErr(""); }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeType && (
        <div className="bg-gen-box">
          <div className="bg-gen-row">
            <span className="bg-gen-label" style={{ color: CAST_ARTICLE_TYPES.find(t=>t.id===activeType)?.color }}>
              {CAST_ARTICLE_TYPES.find(t=>t.id===activeType)?.label}
            </span>
            {genErr && <span style={{ fontSize:".69rem", color:"#f77" }}>⚠️ {genErr}</span>}
            <button className="bg-btn bg-btn-gold"
              onClick={()=>handleGenerate(activeType)} disabled={generating}>
              {generating ? <><Spin />Generating…</> : genContent ? "🔄 Regenerate" : "✨ Generate"}
            </button>
            {genContent && (
              <button className="bg-btn bg-btn-green" onClick={handlePublish} disabled={generating}>
                🚀 Publish
              </button>
            )}
          </div>
          {genContent && (
            <div style={{ marginTop:10 }}>
              <YoutubePicker value={ytId} onChange={setYtId} />
            </div>
          )}
        </div>
      )}

      {editTarget && (
        <EditModal article={editTarget} movies={movies} cast={cast} onClose={()=>setEditTarget(null)} onSaved={handleSaved} onToast={onToast} />
      )}
    </div>
  );
}

// ─── CastRow ──────────────────────────────────────────────────────────────────
function CastRow({ castMember, artCount, onToast, movies=[], cast=[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-cast-row">
      <div className="bg-cast-header" onClick={()=>setOpen(o=>!o)}>
        {castMember.photo
          ? <img src={castMember.photo} alt={castMember.name} className="bg-cast-photo" onError={e=>e.target.style.opacity="0"} />
          : <div className="bg-cast-photo-ph">👤</div>
        }
        <div className="bg-minfo">
          <div className="bg-mtitle">{castMember.name}</div>
          <div className="bg-msub">
            <span style={{ color:"#a78be8" }}>{castMember.type||"Cast"}</span>
            {artCount>0
              ? <span className="bg-mcount">{artCount} article{artCount!==1?"s":""}</span>
              : <span className="bg-mcount" style={{ background:"rgba(255,255,255,.06)", color:"var(--muted)", borderColor:"var(--border)" }}>No articles</span>
            }
          </div>
        </div>
        <div className="bg-chevron" style={{ transform:open?"rotate(90deg)":"none" }}>▶</div>
      </div>
      {open && <CastPanel castMember={castMember} movies={movies} cast={cast} onToast={onToast} />}
    </div>
  );
}

// ─── CastBlogSection ─────────────────────────────────────────────────────────
function CastBlogSection({ cast, movies=[], search, castCountMap, onToast, onCountChange }) {
  const filtered = cast.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  if (!cast.length) return <div className="bg-empty">No cast members found. Add cast first.</div>;
  if (!filtered.length) return <div className="bg-empty">No cast members match your search.</div>;
  return (
    <>
      {filtered.map(c => (
        <CastRow
          key={c._id}
          castMember={c}
          artCount={castCountMap[c.name] ?? 0}
          movies={movies}
          cast={cast}
          onToast={onToast}
        />
      ))}
    </>
  );
}

// ─── UncategorizedSection ─────────────────────────────────────────────────────
function UncategorizedSection({ onToast, count, onCountChange, movies=[], cast=[] }) {
  const [articles,   setArticles]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editTarget, setEditTarget] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchUncategorizedBlogs()
      .then(setArticles).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this article? This cannot be undone.")) return;
    try {
      await deleteArticle(id);
      setArticles(prev => prev.filter(a => a._id !== id));
      onCountChange(-1);
      onToast("🗑 Article deleted", "success");
    } catch { onToast("❌ Delete failed", "error"); }
  };
  const handleSaved = (updated) => setArticles(prev => prev.map(a => a._id===updated._id ? updated : a));

  if (loading) return <div className="bg-empty" style={{ padding:24 }}>Loading…</div>;
  if (!articles.length) return (
    <div className="bg-empty">
      <div style={{ fontSize:"1.5rem", marginBottom:8 }}>📝</div>
      No standalone blogs found.<br />
      <span style={{ fontSize:".76rem", color:"var(--muted)" }}>Blogs created without a movie or cast link will appear here.</span>
    </div>
  );

  return (
    <div className="bg-uncat-list">
      <div className="bg-section-label" style={{ marginBottom:10 }}>
        📝 Standalone Blogs — {articles.length} article{articles.length!==1?"s":""}
      </div>
      <div className="bg-articles">
        {articles.map(art => (
          <div key={art._id} className="bg-art-item">
            <div className="bg-art-dot" style={{ background:art.published?"#4caf82":"#666" }} />
            <div className="bg-art-body">
              <div className="bg-art-title">{art.title}</div>
              <div className="bg-art-meta">
                <span style={{ color:art.published?"#4caf82":"#888", fontWeight:700 }}>
                  {art.published?"● Live":"○ Draft"}
                </span>
                <span>📅 {formatDate(art.createdAt)}</span>
                {art.readTime && <span>⏱ {art.readTime} min</span>}
                {art.views>0  && <span>👁 {art.views}</span>}
                <span style={{ color:"rgba(255,255,255,.25)" }}>{art.category}</span>
              </div>
            </div>
            <div className="bg-art-actions">
              <a href={`/blog/${art.slug}`} target="_blank" rel="noreferrer" className="bg-art-btn">🔗 View</a>
              <button className="bg-art-btn" onClick={()=>setEditTarget(art)}>✏️</button>
              <button className="bg-art-btn del" onClick={()=>handleDelete(art._id)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
      {editTarget && (
        <EditModal article={editTarget} movies={movies} cast={cast} onClose={()=>setEditTarget(null)} onSaved={handleSaved} onToast={onToast} />
      )}
    </div>
  );
}

// ─── MovieRow — ★ FIX 3: artCount is a PROP, no per-row fetch ────────────────
function MovieRow({ movie, artCount, onToast, movies=[], cast=[] }) {
  const [open, setOpen] = useState(false);
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "TBA";

  return (
    <div className="bg-movie-row">
      <div className="bg-movie-header" onClick={()=>setOpen(o=>!o)}>
        {movie.posterUrl||movie.thumbnailUrl
          ? <img src={movie.posterUrl||movie.thumbnailUrl} alt={movie.title}
              className="bg-poster" onError={e=>e.target.style.opacity="0"} />
          : <div className="bg-poster-ph">🎬</div>
        }
        <div className="bg-minfo">
          <div className="bg-mtitle">{movie.title}</div>
          <div className="bg-msub">
            <span>{year}</span><span>·</span>
            <span>{(movie.genre||[]).join(", ")||"Odia"}</span><span>·</span>
            <span>{movie.verdict||"Upcoming"}</span>
            {artCount > 0 && (
              <span className="bg-mcount">{artCount} article{artCount!==1?"s":""}</span>
            )}
            {artCount === 0 && (
              <span className="bg-mcount" style={{ background:"rgba(255,255,255,.06)", color:"var(--muted)", borderColor:"var(--border)" }}>No articles</span>
            )}
          </div>
        </div>
        <div className="bg-chevron" style={{ transform:open?"rotate(90deg)":"none" }}>▶</div>
      </div>
      {open && <MoviePanel movie={movie} movies={movies} cast={cast} onToast={onToast} />}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BlogGenerator({ movies=[], cast=[], onToast }) {
  const [search,       setSearch]       = useState("");
  const [generating,   setGenerating]   = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [mainTab,      setMainTab]      = useState("movies"); // "movies" | "cast" | "uncat"

  // ★ FIX 4: ONE fetch at top level — derive counts for all rows from cached data
  const [artCountMap,  setArtCountMap]  = useState({});
  const [castCountMap, setCastCountMap] = useState({});
  const [uncatCount,   setUncatCount]   = useState(0);
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    getAllBlogs()
      .then(all => {
        const map = {};
        const castMap = {};
        let uncat = 0;
        all.forEach(p => {
          if (p.movieTitle) map[p.movieTitle] = (map[p.movieTitle]||0)+1;
          if (p.castName)   castMap[p.castName] = (castMap[p.castName]||0)+1;
          if (!p.movieTitle && !p.castName) uncat++;
        });
        setArtCountMap(map);
        setCastCountMap(castMap);
        setUncatCount(uncat);
      })
      .catch(()=>{})
      .finally(()=>setCountsLoaded(true));
  }, []);

  const filtered = movies.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  const bulkGenerate = async () => {
    if (!window.confirm(`Generate review articles for all ${movies.length} movies? This may take several minutes.`)) return;
    setGenerating(true); setBulkProgress({ done:0, total:movies.length });
    for (let i=0; i<movies.length; i++) {
      try {
        const text = await generateArticle(movies[i], "review");
        await publishArticle(movies[i], text, "review");
      } catch {}
      setBulkProgress({ done:i+1, total:movies.length });
      await new Promise(r=>setTimeout(r,1200));
    }
    setGenerating(false); setBulkProgress(null);
    onToast("✅ Bulk generation complete!", "success");
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="bg-wrap">
        <div className="bg-header">
          <div className="bg-title">
            ✨ AI Blog Generator
            <span style={{ fontSize:".63rem", fontWeight:500, marginLeft:10, color:"var(--muted)", fontFamily:"monospace" }}>
              {API_BASE}
            </span>
          </div>
          <div className="bg-stats">
            <span>🎬 <b style={{ color:"var(--text)" }}>{movies.length}</b> movies</span>
            <span>📝 <b style={{ color:"var(--gold)" }}>6</b> article types each</span>
          </div>
          <input className="bg-search" placeholder="Search movies…"
            value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="bg-new-btn" onClick={()=>setShowNewModal(true)}>✍️ New Blog</button>
          <button className="bg-bulk-btn" onClick={bulkGenerate} disabled={generating}>
            {generating ? <><Spin /> Generating…</> : "🚀 Bulk Generate Reviews"}
          </button>
        </div>

        {bulkProgress && (
          <div className="bg-progress">
            ⏳ {bulkProgress.done} / {bulkProgress.total} complete
            <div className="bg-progress-bar">
              <div className="bg-progress-fill" style={{ width:`${(bulkProgress.done/bulkProgress.total)*100}%` }} />
            </div>
          </div>
        )}

        <div className="bg-tip">
          💡 <b style={{ color:"var(--text)" }}>Two ways to create:</b>{" "}
          Click <b style={{ color:"#90caf9" }}>✍️ New Blog</b> then choose <b style={{ color:"#90caf9" }}>✨ AI Generate</b> or <b style={{ color:"#90caf9" }}>✏️ Write Manually</b> — with or without linking a movie.
          Or expand any movie below and pick an article type for quick AI generation.
        </div>

        <div className="bg-list">
          {/* ── Main Tabs ── */}
          <div className="bg-main-tabs">
            <button className={`bg-main-tab${mainTab==="movies"?" active":""}`} onClick={()=>setMainTab("movies")}>
              🎬 Movies {Object.keys(artCountMap).length>0 && <span style={{fontSize:".68rem",marginLeft:4,color:"var(--muted)"}}>({Object.values(artCountMap).reduce((a,b)=>a+b,0)})</span>}
            </button>
            <button className={`bg-main-tab${mainTab==="cast"?" active":""}`} onClick={()=>setMainTab("cast")}>
              🎭 Cast & Crew {Object.keys(castCountMap).length>0 && <span style={{fontSize:".68rem",marginLeft:4,color:"var(--muted)"}}>({Object.values(castCountMap).reduce((a,b)=>a+b,0)})</span>}
            </button>
            <button className={`bg-main-tab${mainTab==="uncat"?" active":""}`} onClick={()=>setMainTab("uncat")}>
              📝 Other Blogs {uncatCount>0 && <span style={{fontSize:".68rem",marginLeft:4,color:"var(--muted)"}}>({uncatCount})</span>}
            </button>
          </div>

          {!countsLoaded
            ? <div className="bg-empty" style={{ padding:20, fontSize:".85rem" }}>Loading blog counts…</div>
            : mainTab === "movies"
              ? filtered.length===0
                ? <div className="bg-empty">{search ? "No movies match your search." : "No movies found."}</div>
                : filtered.map(movie => (
                    <MovieRow
                      key={movie._id}
                      movie={movie}
                      artCount={artCountMap[movie.title] ?? 0}
                      movies={movies}
                      cast={cast}
                      onToast={onToast}
                    />
                  ))
              : mainTab === "cast"
              ? (
                  <CastBlogSection
                    cast={cast}
                    movies={movies}
                    search={search}
                    castCountMap={castCountMap}
                    onToast={onToast}
                    onCountChange={(name, delta) => setCastCountMap(prev => ({ ...prev, [name]: Math.max(0, (prev[name]||0)+delta) }))}
                  />
                )
              : (
                  <UncategorizedSection
                    onToast={onToast}
                    count={uncatCount}
                    movies={movies}
                    cast={cast}
                    onCountChange={(delta) => setUncatCount(p => Math.max(0, p+delta))}
                  />
                )
          }
        </div>
      </div>

      {showNewModal && (
        <NewBlogModal
          movies={movies}
          cast={cast}
          onClose={()=>setShowNewModal(false)}
          onPublished={(post) => {
            onToast(`✅ Blog published: "${post.title}"`, "success");
            setShowNewModal(false);
            if (post.movieTitle) {
              setArtCountMap(prev => ({ ...prev, [post.movieTitle]: (prev[post.movieTitle]||0)+1 }));
            } else if (post.castName) {
              setCastCountMap(prev => ({ ...prev, [post.castName]: (prev[post.castName]||0)+1 }));
            } else {
              setUncatCount(p => p+1);
            }
          }}
          onToast={onToast}
        />
      )}
    </>
  );
}