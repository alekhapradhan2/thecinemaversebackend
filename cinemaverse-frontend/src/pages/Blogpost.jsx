import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// Uses the same env var as api.js — VITE_API_URL already includes /api
// e.g. "https://ollipedia-backend.onrender.com/api"
// So we must NOT append /api again here.
const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');

@keyframes bp-up     { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
@keyframes bp-shimmer{ 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes bp-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
@keyframes bp-glow   { 0%,100%{opacity:.6} 50%{opacity:1} }
@keyframes bp-pulse  { 0%,100%{opacity:1} 50%{opacity:.3} }

:root {
  --gold:#c9973a; --gold2:#e0b86a; --gold3:#7a5018;
  --bg:#080808; --bg2:#0f0f0f; --bg3:#161616; --bg4:#1d1d1d; --bg5:#252525;
  --border:rgba(255,255,255,.07); --border2:rgba(255,255,255,.13);
  --muted:rgba(255,255,255,.38); --text:#ede9df;
  --accent1:#c9973a; --accent2:#a78be8; --accent3:#4acf82;
  --accent4:#e85a8a; --accent5:#5aaae8;
}
*{box-sizing:border-box;}

.bp-root{min-height:100vh;background:var(--bg);padding-top:58px;color:var(--text);font-family:'DM Sans',system-ui,sans-serif;}

/* ══ CINEMATIC BANNER ════════════════════════════════════════════════ */
.bp-banner{position:relative;width:100%;overflow:hidden;min-height:380px;display:flex;align-items:flex-end;}
@media(min-width:768px){.bp-banner{min-height:520px;}}
.bp-banner-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.5) saturate(1.2);transform:scale(1.04);}
.bp-banner-grad{
  position:absolute;inset:0;
  background:
    linear-gradient(0deg, rgba(8,8,8,1) 0%, rgba(8,8,8,.8) 25%, rgba(8,8,8,.2) 60%, transparent 100%),
    linear-gradient(90deg, rgba(8,8,8,.5) 0%, transparent 50%);
}
.bp-banner-particles{position:absolute;inset:0;pointer-events:none;}
.bp-banner-content{position:relative;z-index:2;width:100%;max-width:900px;padding:28px 20px 36px;}
@media(min-width:768px){.bp-banner-content{padding:32px 40px 44px;}}

/* No image fallback */
.bp-nobanner{
  position:relative;overflow:hidden;
  background:linear-gradient(135deg,rgba(201,151,58,.08) 0%,rgba(167,139,232,.04) 50%,transparent 100%);
  border-bottom:1px solid var(--border);
  padding:44px 20px 36px;
}
@media(min-width:768px){.bp-nobanner{padding:56px 40px 44px;}}
.bp-nobanner-inner{max-width:900px;}
.bp-nobanner::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:60px 60px;}

/* Back btn */
.bp-back{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid var(--border2);color:rgba(255,255,255,.6);font-family:inherit;font-size:.72rem;font-weight:600;cursor:pointer;padding:5px 12px;border-radius:2px;transition:all .15s;margin-bottom:18px;}
.bp-back:hover{background:rgba(255,255,255,.14);color:#fff;}

/* Category badge */
.bp-catbadge{display:inline-flex;align-items:center;gap:6px;width:fit-content;font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:4px 11px;border-radius:2px;margin-bottom:14px;cursor:pointer;transition:opacity .15s;}
.bp-catbadge:hover{opacity:.8;}

/* Title */
.bp-title{
  font-family:'Playfair Display',serif;
  font-size:clamp(1.6rem,4vw,3rem);
  font-weight:900;color:#fff;line-height:1.18;margin:0 0 16px;
  text-shadow:0 2px 20px rgba(0,0,0,.6);
}

/* Meta strip */
.bp-meta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:.72rem;color:rgba(255,255,255,.42);}
.bp-meta-sep{opacity:.25;}
.bp-meta-gold{color:var(--gold);font-weight:600;}
.bp-meta-rating{display:inline-flex;align-items:center;gap:5px;background:rgba(201,151,58,.14);border:1px solid rgba(201,151,58,.3);border-radius:12px;padding:2px 9px;color:var(--gold);font-weight:700;}

/* ══ LAYOUT ══════════════════════════════════════════════════════════ */
.bp-layout{
  max-width:1200px;margin:0 auto;
  display:grid;grid-template-columns:1fr;
  gap:40px;padding:36px 20px 80px;
}
@media(min-width:768px){.bp-layout{padding:44px 32px 80px;}}
@media(min-width:1060px){.bp-layout{grid-template-columns:1fr 320px;gap:52px;padding:48px 40px 80px;}}

/* ══ ARTICLE BODY ════════════════════════════════════════════════════ */
.bp-article{
  font-family:'DM Sans',system-ui,sans-serif;
  font-size:1.02rem;line-height:1.9;
  color:rgba(255,255,255,.78);
  word-break:break-word;
}
/* Style each paragraph with the colorful drop-cap approach */
.bp-article p{margin:0 0 1.4em;position:relative;}
/* Every first paragraph gets a drop cap */
.bp-article p:first-of-type::first-letter{
  font-family:'Playfair Display',serif;
  font-size:4.2rem;font-weight:900;line-height:.72;
  float:left;margin-right:.12em;margin-top:.08em;
  background:linear-gradient(135deg,var(--gold2),var(--gold),var(--gold3));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
/* Colorful highlighted words — we inject spans via JS */
.bp-highlight-gold   {color:var(--gold);  font-weight:600;}
.bp-highlight-purple {color:var(--accent2);font-weight:600;}
.bp-highlight-green  {color:var(--accent3);font-weight:600;}
.bp-highlight-pink   {color:var(--accent4);font-weight:600;}
.bp-highlight-blue   {color:var(--accent5);font-weight:600;}

/* Pull quote */
.bp-pullquote{
  margin:2em 0;padding:20px 24px;
  border-left:3px solid var(--gold);
  background:linear-gradient(135deg,rgba(201,151,58,.06),transparent);
  border-radius:0 6px 6px 0;
  font-family:'DM Serif Display',serif;
  font-style:italic;font-size:1.08rem;
  color:rgba(255,255,255,.7);line-height:1.7;
}

/* Divider */
.bp-divider{border:none;margin:36px 0;display:flex;align-items:center;gap:12px;}
.bp-divider::before,.bp-divider::after{content:'';flex:1;height:1px;background:var(--border);}
.bp-divider-icon{font-size:.9rem;color:rgba(255,255,255,.2);}

/* Tags */
.bp-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px;}
.bp-tag{padding:5px 13px;border-radius:2px;font-size:.7rem;font-weight:600;background:var(--bg3);border:1px solid var(--border2);color:var(--muted);cursor:pointer;transition:all .15s;letter-spacing:.03em;}
.bp-tag:hover{border-color:rgba(201,151,58,.4);color:var(--gold);background:rgba(201,151,58,.07);}

/* ══ RELATED MOVIES ══════════════════════════════════════════════════ */
.bp-related-title{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);display:flex;align-items:center;gap:11px;margin-bottom:18px;padding-bottom:11px;border-bottom:1px solid var(--border);}
.bp-related-title::before{content:'';display:block;width:20px;height:2.5px;background:var(--gold);border-radius:2px;flex-shrink:0;}

.bp-movies-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}
.bp-movies-row::-webkit-scrollbar{display:none;}
.bp-movie-card{flex-shrink:0;width:130px;cursor:pointer;animation:bp-up .4s ease both;}
.bp-movie-card:hover .bp-movie-poster{transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,0,0,.7);border-color:rgba(201,151,58,.5);}
.bp-movie-card:hover .bp-movie-name{color:var(--gold);}
.bp-movie-poster{width:130px;aspect-ratio:2/3;object-fit:cover;border-radius:5px;display:block;border:1px solid var(--border);background:var(--bg4);transition:transform .3s,box-shadow .3s,border-color .3s;}
.bp-movie-poster-ph{width:130px;aspect-ratio:2/3;border-radius:5px;border:1px solid var(--border);background:linear-gradient(135deg,#1a1200,#080808);display:flex;align-items:center;justify-content:center;font-size:2.2rem;transition:transform .3s;}
.bp-movie-card:hover .bp-movie-poster-ph{transform:translateY(-4px);}
.bp-movie-name{font-size:.74rem;font-weight:700;color:var(--text);margin-top:8px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .15s;}
.bp-movie-year{font-size:.62rem;color:var(--muted);margin-top:2px;}
.bp-movie-verdict{font-size:.58rem;font-weight:700;padding:2px 6px;border-radius:2px;margin-top:3px;display:inline-block;}

/* ══ RELATED SONGS ═══════════════════════════════════════════════════ */
.bp-songs-list{display:flex;flex-direction:column;gap:2px;}
.bp-song-item{display:flex;gap:11px;align-items:center;padding:10px 12px;background:var(--bg3);border-radius:3px;cursor:pointer;transition:background .15s;}
.bp-song-item:hover{background:var(--bg4);}
.bp-song-item:hover .bp-song-title{color:var(--gold);}
.bp-song-thumb{width:52px;height:36px;object-fit:cover;border-radius:2px;background:var(--bg4);flex-shrink:0;}
.bp-song-thumb-ph{width:52px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--bg4);border-radius:2px;font-size:1.1rem;}
.bp-song-info{flex:1;min-width:0;}
.bp-song-title{font-size:.8rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s;}
.bp-song-meta{font-size:.65rem;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bp-song-play{width:28px;height:28px;background:rgba(201,151,58,.15);border:1px solid rgba(201,151,58,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:var(--gold);flex-shrink:0;transition:background .15s;}
.bp-song-item:hover .bp-song-play{background:rgba(201,151,58,.3);}

/* ══ REVIEWS ═════════════════════════════════════════════════════════ */
.bp-reviews-wrap{margin-top:8px;}
.bp-reviews-hd{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);display:flex;align-items:center;gap:11px;margin-bottom:18px;padding-bottom:11px;border-bottom:1px solid var(--border);}
.bp-reviews-hd::before{content:'';display:block;width:20px;height:2.5px;background:var(--gold);border-radius:2px;flex-shrink:0;}

.bp-overall{display:inline-flex;align-items:center;gap:14px;background:rgba(201,151,58,.08);border:1px solid rgba(201,151,58,.2);border-radius:6px;padding:14px 20px;margin-bottom:20px;}
.bp-overall-num{font-family:'Playfair Display',serif;font-size:2.4rem;font-weight:900;color:var(--gold);line-height:1;}
.bp-overall-stars{color:var(--gold);font-size:1rem;letter-spacing:2px;}
.bp-overall-label{font-size:.7rem;color:var(--muted);margin-top:2px;}

.bp-rv-card{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:16px;margin-bottom:12px;transition:border-color .15s;}
.bp-rv-card:hover{border-color:rgba(255,255,255,.14);}
.bp-rv-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:6px;}
.bp-rv-name{font-weight:700;font-size:.86rem;color:var(--text);}
.bp-rv-stars{color:var(--gold);font-size:.82rem;letter-spacing:1px;}
.bp-rv-date{font-size:.68rem;color:rgba(255,255,255,.28);}
.bp-rv-text{font-size:.82rem;color:rgba(255,255,255,.6);line-height:1.65;}
.bp-rv-actions{display:flex;gap:14px;margin-top:10px;}
.bp-rv-act-btn{background:none;border:none;color:rgba(255,255,255,.35);font-family:inherit;font-size:.72rem;cursor:pointer;padding:0;transition:color .15s;display:flex;align-items:center;gap:4px;}
.bp-rv-act-btn:hover{color:var(--gold);}

.bp-replies{margin-top:10px;padding:10px 14px;background:rgba(255,255,255,.02);border-left:2px solid rgba(255,255,255,.07);border-radius:0 3px 3px 0;}
.bp-reply{padding:5px 0;font-size:.76rem;color:rgba(255,255,255,.5);line-height:1.55;}
.bp-reply-name{font-weight:700;color:rgba(255,255,255,.7);margin-right:6px;}
.bp-reply-form{display:flex;gap:7px;margin-top:10px;}
.bp-reply-inp{flex:1;padding:7px 11px;background:var(--bg4);border:1px solid var(--border2);border-radius:2px;color:var(--text);font-size:.76rem;outline:none;font-family:inherit;}
.bp-reply-inp:focus{border-color:rgba(201,151,58,.4);}
.bp-reply-sub{padding:7px 13px;background:rgba(201,151,58,.18);border:1px solid rgba(201,151,58,.3);border-radius:2px;color:var(--gold);font-family:inherit;font-size:.73rem;font-weight:700;cursor:pointer;transition:background .15s;white-space:nowrap;}
.bp-reply-sub:hover{background:rgba(201,151,58,.32);}

/* Review form */
.bp-form-wrap{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:20px;}
.bp-form-title{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin-bottom:16px;}
.bp-stars-row{display:flex;align-items:center;gap:10px;margin-bottom:16px;}
.bp-star-btn{font-size:1.7rem;cursor:pointer;transition:transform .12s;line-height:1;user-select:none;background:none;border:none;padding:0;}
.bp-star-btn:hover{transform:scale(1.2);}
.bp-star-label{font-size:.8rem;color:rgba(255,255,255,.4);}
.bp-inp{width:100%;padding:10px 13px;background:var(--bg4);border:1.5px solid var(--border2);border-radius:3px;color:var(--text);font-family:inherit;font-size:.84rem;outline:none;transition:border-color .18s;margin-bottom:10px;}
.bp-inp:focus{border-color:rgba(201,151,58,.45);}
.bp-inp::placeholder{color:rgba(255,255,255,.22);}
.bp-textarea{resize:vertical;min-height:90px;}
.bp-sub-btn{padding:10px 24px;background:var(--gold);border:none;border-radius:2px;color:#000;font-family:inherit;font-weight:700;font-size:.82rem;letter-spacing:.04em;cursor:pointer;transition:background .15s;}
.bp-sub-btn:hover{background:var(--gold2);}
.bp-sub-btn:disabled{background:var(--bg5);color:var(--muted);cursor:not-allowed;}
.bp-success{padding:14px 16px;background:rgba(74,207,130,.08);border:1px solid rgba(74,207,130,.25);border-radius:3px;color:#4acf82;font-size:.82rem;}

/* ══ SIDEBAR ═════════════════════════════════════════════════════════ */
.bp-sidebar{display:flex;flex-direction:column;gap:24px;}
.bp-sidebar-box{background:var(--bg3);border:1px solid var(--border);border-radius:5px;overflow:hidden;}
.bp-sidebar-hd{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);padding:13px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;}
.bp-sidebar-hd::before{content:'';display:block;width:16px;height:2px;background:var(--gold);border-radius:2px;flex-shrink:0;}
.bp-sidebar-body{padding:14px 16px;}

/* Article info */
.bp-info-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:.76rem;}
.bp-info-row:last-child{border-bottom:none;}
.bp-info-key{color:rgba(255,255,255,.35);}
.bp-info-val{color:var(--text);font-weight:600;}

/* Share buttons */
.bp-share-btns{display:flex;gap:8px;flex-wrap:wrap;padding:14px 16px;}
.bp-share-btn{flex:1;min-width:80px;padding:8px 10px;background:var(--bg4);border:1px solid var(--border2);border-radius:2px;color:rgba(255,255,255,.65);font-family:inherit;font-size:.7rem;font-weight:600;cursor:pointer;transition:all .15s;text-align:center;}
.bp-share-btn:hover{background:var(--bg5);border-color:var(--border2);color:#fff;}
.bp-share-twitter:hover{border-color:rgba(29,161,242,.4);color:#1da1f2;}
.bp-share-fb:hover{border-color:rgba(66,103,178,.4);color:#4267b2;}
.bp-share-copy:hover{border-color:rgba(201,151,58,.4);color:var(--gold);}

/* Related articles in sidebar */
.bp-rel-item{display:flex;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;}
.bp-rel-item:last-child{border-bottom:none;}
.bp-rel-item:hover{background:var(--bg4);}
.bp-rel-item:hover .bp-rel-title{color:var(--gold);}
.bp-rel-thumb{width:58px;height:38px;object-fit:cover;border-radius:2px;background:var(--bg4);flex-shrink:0;}
.bp-rel-ph{width:58px;height:38px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--bg4);border-radius:2px;font-size:1.1rem;}
.bp-rel-info{flex:1;min-width:0;}
.bp-rel-title{font-size:.76rem;font-weight:700;color:var(--text);line-height:1.35;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .15s;}
.bp-rel-meta{font-size:.62rem;color:rgba(255,255,255,.28);margin-top:3px;}

/* ══ SKELETON ════════════════════════════════════════════════════════ */
.bp-sk{background:linear-gradient(90deg,var(--bg4) 25%,var(--bg5) 50%,var(--bg4) 75%);background-size:600px 100%;animation:bp-shimmer 1.5s infinite;border-radius:2px;}

/* ══ 404 ═════════════════════════════════════════════════════════════ */
.bp-404{min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:40px;}
.bp-404-ico{font-size:4rem;opacity:.35;animation:bp-float 3s ease infinite;}
.bp-404-t{font-family:'Playfair Display',serif;font-size:1.5rem;color:rgba(255,255,255,.4);}
.bp-404-btn{padding:10px 24px;background:var(--gold);border:none;border-radius:2px;color:#000;font-family:inherit;font-weight:700;font-size:.82rem;cursor:pointer;transition:background .15s;}
.bp-404-btn:hover{background:var(--gold2);}
`;

// ── Colorful article renderer ─────────────────────────────────────────────────
// Highlights movie/Odia keywords with accent colors and adds pull quotes
const ACCENT_COLORS = ["bp-highlight-gold","bp-highlight-purple","bp-highlight-green","bp-highlight-pink","bp-highlight-blue"];
const ODIA_KEYWORDS = ["Ollywood","Odia","Odisha","Bhubaneswar","Cuttack","blockbuster","superhit","director","producer","cinematography","soundtrack","music director","choreography","debut","award","release","theatre","cast","crew","action","drama","romance","comedy","thriller","family","historical","devotional","biography","sequel"];

function ColorfulArticle({ content }) {
  // Split into paragraphs
  const paras = (content || "").split(/\n\n+/).filter(p => p.trim());

  const highlight = (text, paraIdx) => {
    // For every paragraph, find keywords and wrap them
    let result = text;
    const used = new Set();
    ODIA_KEYWORDS.forEach((kw, ki) => {
      const colorClass = ACCENT_COLORS[ki % ACCENT_COLORS.length];
      const regex = new RegExp(`\\b(${kw})\\b`, "gi");
      if (regex.test(result) && !used.has(kw.toLowerCase())) {
        used.add(kw.toLowerCase());
        result = result.replace(regex, `<span class="${colorClass}">$1</span>`);
      }
    });
    return result;
  };

  // Every 3rd para, inject a pull quote (first sentence of that para)
  return (
    <div className="bp-article">
      {paras.map((para, i) => {
        const isPullQuote = i > 0 && i % 4 === 3 && para.length > 80;
        const firstSentence = para.split(/[.!?]/)[0];
        return (
          <React.Fragment key={i}>
            {isPullQuote && firstSentence.length > 40 && (
              <blockquote className="bp-pullquote">"{firstSentence}."</blockquote>
            )}
            <p dangerouslySetInnerHTML={{ __html: highlight(para, i) }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="bp-stars-row">
      {[1,2,3,4,5].map(s => (
        <button
          key={s}
          className="bp-star-btn"
          style={{ color: s <= (hover || value) ? "var(--gold)" : "rgba(255,255,255,.18)" }}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(s)}
        >★</button>
      ))}
      <span className="bp-star-label">{["","Poor","Fair","Good","Great","Excellent"][hover||value]}</span>
    </div>
  );
}

const fmtDate  = iso => iso ? new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}) : "";
const fmtShort = iso => iso ? new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";
const avgRating = reviews => {
  const v = (reviews||[]).filter(r=>r.rating>0);
  return v.length ? (v.reduce((s,r)=>s+r.rating,0)/v.length).toFixed(1) : 0;
};

const VERDICT_COLORS = {
  "Blockbuster":"#4acf82","Super Hit":"#4acf82","Hit":"#a3e8a0",
  "Average":"#e8c87a","Flop":"#e59595","Disaster":"#e85555","Upcoming":"#5aaae8"
};

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [post,      setPost]      = useState(null);
  const [related,   setRelated]   = useState([]);
  const [relMovies, setRelMovies] = useState([]);
  const [relSongs,  setRelSongs]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);

  const [rvName,   setRvName]   = useState("");
  const [rvText,   setRvText]   = useState("");
  const [rvRating, setRvRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [replies, setReplies] = useState({});

  // ── Fetch post ─────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true); setPost(null); setNotFound(false);
      try {
        const r = await fetch(`${API_BASE}/blog/${slug}`);
        if (!r.ok) { setNotFound(true); setLoading(false); return; }
        const d = await r.json();
        if (!dead) setPost(d);
      } catch { if (!dead) setNotFound(true); }
      finally   { if (!dead) setLoading(false); }
    })();
    return () => { dead = true; };
  }, [slug]);

  // ── Fetch related content (articles + movie + songs) ───────────
  useEffect(() => {
    if (!post) return;
    // Related articles
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/blog?limit=6${post.category ? `&category=${encodeURIComponent(post.category)}` : ""}`);
        const d = await r.json();
        setRelated((d.posts||d||[]).filter(p=>p.slug!==slug).slice(0,4));
      } catch {}
    })();

    // Related movie (if movieTitle set) + its songs
    if (post.movieTitle) {
      (async () => {
        try {
          const r = await fetch(`${API_BASE}/movies?q=${encodeURIComponent(post.movieTitle)}&limit=4`);
          const d = await r.json();
          const movies = d.movies || d || [];
          setRelMovies(movies.slice(0,4));
          // Grab songs from the first matching movie
          if (movies[0]?.media?.songs?.length) {
            setRelSongs(movies[0].media.songs.slice(0,5).map((s,idx)=>({...s,movieId:movies[0]._id,movieSlug:movies[0].slug||movies[0]._id,songIndex:idx})));
          }
        } catch {}
      })();
    }
  }, [post]);

  // ── Submit review ───────────────────────────────────────────────
  const submitReview = async () => {
    if (!rvName.trim() || !rvText.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/blog/${post._id}/reviews`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({user:rvName.trim(),text:rvText.trim(),rating:rvRating}),
      });
      if (r.ok) {
        setSubmitted(true);
        const updated = await fetch(`${API_BASE}/blog/${slug}`);
        if (updated.ok) setPost(await updated.json());
      }
    } catch {}
    setSubmitting(false);
  };

  const likeReview = async idx => {
    try {
      const r = await fetch(`${API_BASE}/blog/${post._id}/reviews/${idx}/like`,{method:"POST"});
      if (r.ok) {
        const {likes} = await r.json();
        setPost(p => { const rv=[...(p.reviews||[])]; rv[idx]={...rv[idx],likes}; return {...p,reviews:rv}; });
      }
    } catch {}
  };

  const submitReply = async idx => {
    const rep = replies[idx]||{};
    if (!rep.text?.trim()||!rep.name?.trim()) return;
    try {
      const r = await fetch(`${API_BASE}/blog/${post._id}/reviews/${idx}/reply`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({user:rep.name.trim(),text:rep.text.trim(),date:new Date().toISOString().split("T")[0]}),
      });
      if (r.ok) {
        const list = await r.json();
        setPost(p => { const rv=[...(p.reviews||[])]; rv[idx]={...rv[idx],replies:list}; return {...p,reviews:rv}; });
        setReplies(p=>({...p,[idx]:{...p[idx],text:"",open:false}}));
      }
    } catch {}
  };

  const toggleReply = idx => setReplies(p=>({...p,[idx]:{...(p[idx]||{}),open:!(p[idx]?.open)}}));

  const avg = avgRating(post?.reviews);
  const rvCount = (post?.reviews||[]).length;

  // ── CAT style ──────────────────────────────────────────────────
  const CAT_STYLE = {
    "Movie Review":    {bg:"rgba(201,151,58,.9)",  c:"#000"},
    "Actor Spotlight": {bg:"rgba(167,139,232,.9)", c:"#fff"},
    "Top 10":          {bg:"rgba(232,200,122,.9)", c:"#000"},
    "News":            {bg:"rgba(74,207,130,.9)",  c:"#000"},
    "Upcoming":        {bg:"rgba(90,170,232,.9)",  c:"#000"},
    "General":         {bg:"rgba(229,121,154,.9)", c:"#fff"},
  };
  const cst = cat => { const s=CAT_STYLE[cat]||CAT_STYLE["Movie Review"]; return {background:s.bg,color:s.c}; };

  // ── Loading / 404 ──────────────────────────────────────────────
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="bp-root">
        <div className="bp-sk" style={{width:"100%",height:400}} />
        <div style={{maxWidth:900,margin:"40px auto",padding:"0 24px",display:"flex",flexDirection:"column",gap:14}}>
          {[85,65,100,55,80,42,70,30].map((w,i)=>(
            <div key={i} className="bp-sk" style={{height:i===0?24:14,width:`${w}%`}} />
          ))}
        </div>
      </div>
    </>
  );

  if (notFound) return (
    <>
      <style>{CSS}</style>
      <div className="bp-root">
        <div className="bp-404">
          <div className="bp-404-ico">📭</div>
          <div className="bp-404-t">Article not found</div>
          <button className="bp-404-btn" onClick={()=>navigate("/blog")}>← Back to Blog</button>
        </div>
      </div>
    </>
  );

  const Header = () => (
    <>
      <button className="bp-back" onClick={()=>navigate("/blog")}>← Back to Blog</button>
      <span className="bp-catbadge" style={cst(post.category)} onClick={()=>navigate(`/blog?cat=${encodeURIComponent(post.category||"")}`)}>
        {post.category||"Article"}
      </span>
      <h1 className="bp-title">{post.title}</h1>
      <div className="bp-meta">
        {post.author&&<span>✍️ {post.author}</span>}
        <span className="bp-meta-sep">·</span>
        <span>📅 {fmtDate(post.createdAt)}</span>
        {post.readTime&&<><span className="bp-meta-sep">·</span><span>⏱ {post.readTime} min read</span></>}
        {post.views>0&&<><span className="bp-meta-sep">·</span><span>👁 {post.views.toLocaleString()} views</span></>}
        {avg>0&&<><span className="bp-meta-sep">·</span><span className="bp-meta-rating">★ {avg} ({rvCount})</span></>}
        {post.movieTitle&&<><span className="bp-meta-sep">·</span><span className="bp-meta-gold">🎬 {post.movieTitle}</span></>}
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <Helmet>
        <title>{post.seoTitle||post.title} | OllyPedia Blog</title>
        <meta name="description" content={post.seoDesc||post.excerpt} />
        <meta property="og:title"       content={post.seoTitle||post.title} />
        <meta property="og:description" content={post.seoDesc||post.excerpt} />
        {post.coverImage&&<meta property="og:image" content={post.coverImage}/>}
      </Helmet>

      <div className="bp-root">
        {/* Banner */}
        {post.coverImage ? (
          <div className="bp-banner">
            <img src={post.coverImage} alt={post.title} className="bp-banner-img" onError={e=>e.target.style.display="none"}/>
            <div className="bp-banner-grad"/>
            <div className="bp-banner-content"><Header /></div>
          </div>
        ) : (
          <div className="bp-nobanner">
            <div className="bp-nobanner-inner"><Header /></div>
          </div>
        )}

        {/* Layout */}
        <div className="bp-layout">

          {/* ── Main column ── */}
          <div>
            {/* Colorful article body */}
            <ColorfulArticle content={post.content} />

            {/* Tags */}
            {post.tags?.length>0&&(
              <div className="bp-tags" style={{marginTop:28}}>
                {post.tags.map(t=>(
                  <span key={t} className="bp-tag" onClick={()=>navigate(`/blog?q=${encodeURIComponent(t)}`)}>#{t}</span>
                ))}
              </div>
            )}

            {/* ── Related Movies ── */}
            {relMovies.length>0&&(
              <div style={{marginTop:40}}>
                <div className="bp-related-title">🎬 Related Movies</div>
                <div className="bp-movies-row">
                  {relMovies.map((m,i)=>(
                    <div key={m._id} className="bp-movie-card" style={{animationDelay:`${i*60}ms`}} onClick={()=>navigate(`/movie/${m.slug||m._id}`)}>
                      {m.posterUrl||m.thumbnailUrl
                        ?<img src={m.posterUrl||m.thumbnailUrl} alt={m.title} className="bp-movie-poster" loading="lazy" onError={e=>e.target.style.display="none"}/>
                        :<div className="bp-movie-poster-ph">🎬</div>
                      }
                      <div className="bp-movie-name">{m.title}</div>
                      {m.releaseDate&&<div className="bp-movie-year">{new Date(m.releaseDate).getFullYear()}</div>}
                      {m.verdict&&m.verdict!=="Upcoming"&&(
                        <div className="bp-movie-verdict" style={{background:`${VERDICT_COLORS[m.verdict]||"#888"}22`,color:VERDICT_COLORS[m.verdict]||"#888",border:`1px solid ${VERDICT_COLORS[m.verdict]||"#888"}44`}}>
                          {m.verdict}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Related Songs ── */}
            {relSongs.length>0&&(
              <div style={{marginTop:36}}>
                <div className="bp-related-title">🎵 Songs from this Movie</div>
                <div className="bp-songs-list">
                  {relSongs.map((s,i)=>{
                    const thumb=s.ytId?`https://img.youtube.com/vi/${s.ytId}/mqdefault.jpg`:s.thumbnailUrl||null;
                    return(
                      <div key={i} className="bp-song-item" style={{animationDelay:`${i*50}ms`}}
                        onClick={()=>navigate(`/song/${s.movieSlug}/${s.songIndex}`)}>
                        {thumb
                          ?<img src={thumb} alt={s.title} className="bp-song-thumb" loading="lazy" onError={e=>e.target.style.display="none"}/>
                          :<div className="bp-song-thumb-ph">🎵</div>
                        }
                        <div className="bp-song-info">
                          <div className="bp-song-title">{s.title||"Untitled"}</div>
                          <div className="bp-song-meta">
                            {s.singer&&`🎤 ${s.singer}`}
                            {s.singer&&s.musicDirector&&" · "}
                            {s.musicDirector&&`🎼 ${s.musicDirector}`}
                          </div>
                        </div>
                        <div className="bp-song-play">▶</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Divider ── */}
            <div className="bp-divider"><span className="bp-divider-icon">✦</span></div>

            {/* ── Reviews ── */}
            <div className="bp-reviews-wrap">
              <div className="bp-reviews-hd">
                ⭐ Reviews & Ratings
                {rvCount>0&&<span style={{fontWeight:400,color:"rgba(255,255,255,.3)",letterSpacing:".04em"}}>({rvCount} reviews)</span>}
              </div>

              {avg>0&&(
                <div className="bp-overall">
                  <div className="bp-overall-num">{avg}</div>
                  <div>
                    <div className="bp-overall-stars">{"★".repeat(Math.round(avg))}{"☆".repeat(5-Math.round(avg))}</div>
                    <div className="bp-overall-label">avg · {rvCount} review{rvCount!==1?"s":""}</div>
                  </div>
                </div>
              )}

              {(post.reviews||[]).map((rv,idx)=>(
                <div key={idx} className="bp-rv-card">
                  <div className="bp-rv-head">
                    <div>
                      <div className="bp-rv-name">👤 {rv.user||"Anonymous"}</div>
                      {rv.rating>0&&<div className="bp-rv-stars">{"★".repeat(rv.rating)}{"☆".repeat(5-rv.rating)} <span style={{fontSize:".68rem",color:"rgba(255,255,255,.3)",marginLeft:4}}>({rv.rating}/5)</span></div>}
                    </div>
                    <div className="bp-rv-date">{rv.date}</div>
                  </div>
                  <div className="bp-rv-text">{rv.text}</div>
                  <div className="bp-rv-actions">
                    <button className="bp-rv-act-btn" onClick={()=>likeReview(idx)}>👍 {rv.likes>0?rv.likes:"Like"}</button>
                    <button className="bp-rv-act-btn" onClick={()=>toggleReply(idx)}>💬 Reply</button>
                  </div>
                  {rv.replies?.length>0&&(
                    <div className="bp-replies">
                      {rv.replies.map((r,ri)=>(
                        <div key={ri} className="bp-reply"><span className="bp-reply-name">{r.user||"Anonymous"}:</span>{r.text}</div>
                      ))}
                    </div>
                  )}
                  {replies[idx]?.open&&(
                    <div className="bp-reply-form" style={{marginTop:10}}>
                      <input className="bp-reply-inp" placeholder="Name" style={{maxWidth:100}} value={replies[idx]?.name||""} onChange={e=>setReplies(p=>({...p,[idx]:{...p[idx],name:e.target.value}}))}/>
                      <input className="bp-reply-inp" placeholder="Write a reply…" value={replies[idx]?.text||""} onChange={e=>setReplies(p=>({...p,[idx]:{...p[idx],text:e.target.value}}))} onKeyDown={e=>e.key==="Enter"&&submitReply(idx)}/>
                      <button className="bp-reply-sub" onClick={()=>submitReply(idx)}>Send</button>
                    </div>
                  )}
                </div>
              ))}

              <div className="bp-divider"><span className="bp-divider-icon">✦</span></div>
              <div className="bp-form-wrap">
                <div className="bp-form-title">✏️ Write a Review</div>
                {submitted?(
                  <div className="bp-success">✅ Thanks for your review! It's been submitted.</div>
                ):(
                  <>
                    <StarPicker value={rvRating} onChange={setRvRating}/>
                    <input className="bp-inp" placeholder="Your name" value={rvName} onChange={e=>setRvName(e.target.value)}/>
                    <textarea className="bp-inp bp-textarea" placeholder="Share your thoughts about this movie…" value={rvText} onChange={e=>setRvText(e.target.value)}/>
                    <button className="bp-sub-btn" onClick={submitReview} disabled={submitting||!rvName.trim()||!rvText.trim()}>
                      {submitting?"Submitting…":"Submit Review"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <aside className="bp-sidebar">
            {/* Share */}
            <div className="bp-sidebar-box">
              <div className="bp-sidebar-hd">Share Article</div>
              <div className="bp-share-btns">
                <button className="bp-share-btn bp-share-twitter" onClick={()=>window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(window.location.href)}`)}>🐦 Twitter</button>
                <button className="bp-share-btn bp-share-fb" onClick={()=>window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`)}>📘 Facebook</button>
                <button className="bp-share-btn bp-share-copy" onClick={()=>navigator.clipboard.writeText(window.location.href)}>🔗 Copy</button>
              </div>
            </div>

            {/* Article info */}
            <div className="bp-sidebar-box">
              <div className="bp-sidebar-hd">Article Info</div>
              <div className="bp-sidebar-body">
                {[
                  ["Published",    fmtDate(post.createdAt)],
                  ["Author",       post.author||"OllyPedia Editorial"],
                  ["Category",     post.category||"General"],
                  ["Read Time",    `${post.readTime||3} min`],
                  ["Views",        (post.views||0).toLocaleString()],
                  avg>0?["Rating",`${avg} / 5 ⭐`]:null,
                  rvCount>0?["Reviews",`${rvCount} review${rvCount!==1?"s":""}`]:null,
                ].filter(Boolean).map(([k,v])=>(
                  <div key={k} className="bp-info-row">
                    <span className="bp-info-key">{k}</span>
                    <span className="bp-info-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Related articles */}
            {related.length>0&&(
              <div className="bp-sidebar-box">
                <div className="bp-sidebar-hd">Related Articles</div>
                {related.map(r=>(
                  <div key={r._id} className="bp-rel-item" onClick={()=>navigate(`/blog/${r.slug}`)}>
                    {r.coverImage
                      ?<img src={r.coverImage} alt={r.title} className="bp-rel-thumb" loading="lazy" onError={e=>e.target.style.display="none"}/>
                      :<div className="bp-rel-ph">✍️</div>
                    }
                    <div className="bp-rel-info">
                      <div className="bp-rel-title">{r.title}</div>
                      <div className="bp-rel-meta">{fmtShort(r.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Related movies in sidebar too */}
            {relMovies.length>0&&(
              <div className="bp-sidebar-box">
                <div className="bp-sidebar-hd">🎬 Related Movies</div>
                {relMovies.map(m=>(
                  <div key={m._id} className="bp-rel-item" onClick={()=>navigate(`/movie/${m.slug||m._id}`)}>
                    {(m.posterUrl||m.thumbnailUrl)
                      ?<img src={m.posterUrl||m.thumbnailUrl} alt={m.title} className="bp-rel-thumb" loading="lazy" onError={e=>e.target.style.display="none"}/>
                      :<div className="bp-rel-ph">🎬</div>
                    }
                    <div className="bp-rel-info">
                      <div className="bp-rel-title">{m.title}</div>
                      <div className="bp-rel-meta">{m.releaseDate?new Date(m.releaseDate).getFullYear():""}{m.verdict?` · ${m.verdict}`:""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}