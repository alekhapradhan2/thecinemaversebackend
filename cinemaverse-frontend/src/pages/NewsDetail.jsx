import SEO, { newsItemSEO } from "../components/SEO";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { API } from "../api/api";
import { Cache } from "../api/cache";

// ── helpers ─────────────────────────────────────────────────────
function SafeImg({ src, alt, style, className }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return <img src={src} alt={alt} style={style} className={className}
    loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

const CAT_META = {
  Interview:    { color:"#e07b39", bg:"rgba(224,123,57,.13)",  icon:"🎙️" },
  Trailer:      { color:"#3a86ff", bg:"rgba(58,134,255,.13)",  icon:"🎬" },
  Release:      { color:"#2ec4b6", bg:"rgba(46,196,182,.13)",  icon:"🎉" },
  Song:         { color:"#9b5de5", bg:"rgba(155,93,229,.13)",  icon:"🎵" },
  Award:        { color:"#f7b731", bg:"rgba(247,183,49,.13)",  icon:"🏆" },
  Update:       { color:"#c9973a", bg:"rgba(201,151,58,.13)",  icon:"📢" },
  Announcement: { color:"#c9973a", bg:"rgba(201,151,58,.13)",  icon:"📣" },
  Review:       { color:"#4caf82", bg:"rgba(76,175,130,.13)",  icon:"⭐" },
  Event:        { color:"#ff6b6b", bg:"rgba(255,107,107,.13)", icon:"📅" },
  Other:        { color:"#888",    bg:"rgba(136,136,136,.1)",  icon:"📰" },
};
const catMeta  = (c) => CAT_META[c] || CAT_META.Other;
const fmtDate  = (d) => new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short",  year:"numeric" });
const fmtDateL = (d) => new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"long",   year:"numeric" });

const verdictColor = (v) => {
  if (!v) return "var(--gold)";
  const l = v.toLowerCase();
  if (["hit","super hit","blockbuster"].includes(l)) return "#4caf82";
  if (["flop","disaster"].includes(l)) return "var(--red)";
  return "var(--gold)";
};

const CSS = `
/* ══════════════════════════════════════
   NEWS DETAIL PAGE
══════════════════════════════════════ */
.nd-root { padding: 58px 0 72px; }

/* ── Back bar ── */
.nd-back-bar {
  max-width: 860px; margin: 0 auto;
  padding: 20px 24px 0;
}
.nd-back { display:inline-flex; align-items:center; gap:6px; background:none; border:none; color:var(--muted); font-size:.8rem; font-weight:600; cursor:pointer; padding:0; transition:color .15s; font-family:inherit; }
.nd-back:hover { color:var(--gold); }

/* ── Hero image ── */
.nd-hero-wrap {
  max-width: 860px; margin: 20px auto 0;
  padding: 0 24px;
}
.nd-hero-img {
  width: 100%; aspect-ratio: 16/9; border-radius: 16px; overflow: hidden;
  background: var(--bg2); box-shadow: 0 16px 48px rgba(0,0,0,.55);
  position: relative;
}
.nd-hero-img img { width:100%; height:100%; object-fit:cover; display:block; }

/* ── Article wrapper ── */
.nd-article {
  max-width: 860px; margin: 0 auto;
  padding: 28px 24px 0;
}

/* ── Meta row ── */
.nd-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:18px; }
.nd-cat-badge { display:inline-flex; align-items:center; gap:5px; font-size:.62rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; padding:4px 11px; border-radius:12px; border:1px solid transparent; }
.nd-movie-link { display:inline-flex; align-items:center; gap:5px; font-size:.78rem; color:var(--gold); font-weight:700; text-decoration:none; background:rgba(201,151,58,.09); border:1px solid rgba(201,151,58,.2); padding:4px 11px; border-radius:20px; transition:background .15s; }
.nd-movie-link:hover { background:rgba(201,151,58,.18); }
.nd-date { font-size:.74rem; color:var(--muted); margin-left:auto; }

/* ── Headline ── */
.nd-headline {
  font-family:'Playfair Display',serif;
  font-size: clamp(1.5rem, 4.5vw, 2.4rem);
  font-weight: 900; line-height: 1.18; margin: 0 0 20px; color:var(--text);
}

/* ── Divider ── */
.nd-divider { height:1px; background:rgba(255,255,255,.07); margin:0 0 28px; }

/* ── Body text ── */
.nd-body { font-size:.96rem; line-height:1.85; color:rgba(255,255,255,.82); }
.nd-body p { margin:0 0 20px; }
.nd-body p:last-child { margin-bottom:0; }

/* ── Source link ── */
.nd-source-row { margin-top:28px; padding:14px 18px; background:var(--bg2); border:1px solid rgba(255,255,255,.07); border-radius:10px; display:flex; align-items:center; gap:12px; }
.nd-source-row .label { font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); }
.nd-source-row a { font-size:.82rem; color:var(--gold); text-decoration:none; font-weight:600; }
.nd-source-row a:hover { text-decoration:underline; }

/* ── Share row ── */
.nd-share-row { margin-top:24px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.nd-share-label { font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); }
.nd-share-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:20px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:var(--text); font-size:.75rem; font-weight:600; cursor:pointer; transition:all .15s; font-family:inherit; text-decoration:none; }
.nd-share-btn:hover { border-color:rgba(201,151,58,.4); background:rgba(201,151,58,.07); color:var(--gold); }
.nd-share-btn.copied { background:rgba(76,175,130,.12); border-color:rgba(76,175,130,.35); color:#4caf82; }

/* ── Sections below article ── */
.nd-sections { max-width:860px; margin:0 auto; padding:0 24px; }
.nd-sec { margin-top:48px; }
.nd-sec-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,.07); }
.nd-sec-title { font-size:.96rem; font-weight:800; margin:0; }

/* ── Related movie card ── */
.nd-movie-card {
  display:flex; gap:16px; align-items:center;
  background:var(--bg2); border:1px solid rgba(255,255,255,.08);
  border-radius:14px; padding:16px; cursor:pointer;
  transition:border-color .18s, transform .18s;
}
.nd-movie-card:hover { border-color:rgba(201,151,58,.4); transform:translateX(4px); }
.nd-movie-poster { width:72px; height:100px; border-radius:8px; overflow:hidden; background:var(--bg3); flex-shrink:0; position:relative; }
.nd-movie-poster img { width:100%; height:100%; object-fit:cover; display:block; }
.nd-movie-poster .ph { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:1.8rem; }
.nd-movie-info { flex:1; min-width:0; }
.nd-movie-title { font-weight:800; font-size:1rem; margin-bottom:6px; }
.nd-movie-prod { font-size:.74rem; color:var(--muted); margin-bottom:8px; }
.nd-movie-badges { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
.nd-movie-badge { font-size:.62rem; font-weight:700; padding:2px 8px; border-radius:8px; background:rgba(255,255,255,.07); color:var(--muted); }
.nd-movie-release { font-size:.74rem; color:var(--muted); }
.nd-movie-arrow { font-size:1.2rem; color:var(--muted); flex-shrink:0; }

/* ── Related news grid ── */
.nd-related-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:16px; }
.nd-rel-card { background:var(--bg2); border:1px solid rgba(255,255,255,.07); border-radius:12px; overflow:hidden; cursor:pointer; transition:transform .18s,border-color .18s; display:flex; flex-direction:column; }
.nd-rel-card:hover { transform:translateY(-3px); border-color:rgba(201,151,58,.35); }
.nd-rel-img { aspect-ratio:16/9; overflow:hidden; background:var(--bg3); position:relative; }
.nd-rel-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
.nd-rel-card:hover .nd-rel-img img { transform:scale(1.04); }
.nd-rel-img .ph { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:1.4rem; color:var(--muted); }
.nd-rel-body { padding:12px 14px 14px; flex:1; display:flex; flex-direction:column; gap:6px; }
.nd-rel-title { font-weight:700; font-size:.84rem; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.nd-rel-foot { display:flex; align-items:center; justify-content:space-between; margin-top:auto; padding-top:8px; border-top:1px solid rgba(255,255,255,.05); }
.nd-rel-movie { font-size:.65rem; color:var(--gold); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60%; }
.nd-rel-date { font-size:.63rem; color:var(--muted); flex-shrink:0; }

/* ── Loading skeleton ── */
.nd-skeleton-hero { height:420px; border-radius:16px; margin:20px 0 28px; }
`;

// ── Related News Card ────────────────────────────────────────────
function RelCard({ n, onClick }) {
  const [broken, setBroken] = useState(false);
  const m = catMeta(n.category);
  return (
    <div className="nd-rel-card" onClick={() => onClick(n._id)}>
      <div className="nd-rel-img">
        {n.imageUrl && !broken
          ? <img src={n.imageUrl} alt={n.title} onError={() => setBroken(true)} />
          : <div className="ph">📰</div>}
        <span style={{ position:"absolute", top:8, left:8, fontSize:".56rem", fontWeight:800, letterSpacing:".06em", textTransform:"uppercase", padding:"2px 7px", borderRadius:9, background:m.bg, color:m.color, border:`1px solid ${m.color}33` }}>
          {m.icon} {n.category || "Update"}
        </span>
      </div>
      <div className="nd-rel-body">
        <div className="nd-rel-title">{n.title}</div>
        <div className="nd-rel-foot">
          <span className="nd-rel-movie">{n.movieTitle ? `🎬 ${n.movieTitle}` : ""}</span>
          <span className="nd-rel-date">{fmtDate(n.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function NewsDetail() {
  // Route: /news/:id  (id is a MongoDB ObjectId string)
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [copied,  setCopied]  = useState(false);
  const [allNews, setAllNews] = useState(() => Cache.peek("news") || []);

  useEffect(() => {
    if (!id) { setError("Invalid article ID"); setLoading(false); return; }
    setLoading(true); setData(null); setError(null);
    API.getNewsItem(id)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Article not found"); setLoading(false); });
    window.scrollTo(0, 0);
  }, [id]);

  // Load all news for related section (from cache or fetch)
  useEffect(() => {
    if (Cache.peek("news")) { setAllNews(Cache.peek("news")); return; }
    Cache.getNews().then(setAllNews).catch(() => {});
  }, []);

  // Share handler
  const handleCopy = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: data?.title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  // ── Loading ──
  if (loading) return (
    <div className="nd-root">
      <style>{CSS}</style>
      <div className="nd-back-bar"><button className="nd-back" onClick={() => navigate("/news")}>← All News</button></div>
      <div className="nd-hero-wrap">
        <div className="skeleton nd-skeleton-hero" />
      </div>
      <div className="nd-article">
        <div className="skeleton" style={{ height:22, width:"40%", borderRadius:6, marginBottom:18 }} />
        <div className="skeleton" style={{ height:44, width:"85%", borderRadius:6, marginBottom:14 }} />
        <div className="skeleton" style={{ height:44, width:"65%", borderRadius:6, marginBottom:28 }} />
        {[...Array(5)].map((_,i) => <div key={i} className="skeleton" style={{ height:16, width:`${[100,95,88,100,72][i]}%`, borderRadius:4, marginBottom:10 }} />)}
      </div>
    </div>
  );

  // ── Error ──
  if (error || !data) return (
    <div className="nd-root">
      <style>{CSS}</style>
      <div style={{ textAlign:"center", padding:"80px 24px" }}>
        <div style={{ fontSize:"3rem", marginBottom:16 }}>📭</div>
        <h2 style={{ marginBottom:8 }}>Article not found</h2>
        <p style={{ color:"var(--muted)", marginBottom:24 }}>This article may have been removed or the link is incorrect.</p>
        <button className="btn btn-outline" onClick={() => navigate("/news")}>← Back to News</button>
      </div>
    </div>
  );

  // ── Build related news (same movie or same category, exclude self) ──
  const related = allNews
    .filter(n => String(n._id) !== String(id))
    .filter(n =>
      (data.movieId && n.movieId && String(n.movieId) === String(data.movieId)) ||
      n.category === data.category
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);

  const movie    = data.movie || null;
  const m        = catMeta(data.category);
  const paragraphs = (data.content || "").split("\n").filter(Boolean);

  return (
    <>
      <style>{CSS}</style>
      <div className="nd-root">
        {data && <SEO {...newsItemSEO(data)} />}

        {/* Back */}
        <div className="nd-back-bar">
          <button className="nd-back" onClick={() => navigate(-1)}>← Back</button>
        </div>

        {/* Hero Image */}
        {data.imageUrl && (
          <div className="nd-hero-wrap">
            <div className="nd-hero-img">
              <SafeImg src={data.imageUrl} alt={data.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            </div>
          </div>
        )}

        {/* Article */}
        <div className="nd-article">

          {/* Meta */}
          <div className="nd-meta">
            <span className="nd-cat-badge" style={{ background:m.bg, color:m.color, borderColor:`${m.color}33` }}>
              {m.icon} {data.category || "Update"}
            </span>
            {data.movieTitle && data.movieId && (
              <Link to={`/movie/${data.movieId}`} className="nd-movie-link" onClick={e => e.stopPropagation()}>
                🎬 {data.movieTitle}
              </Link>
            )}
            <span className="nd-date">{fmtDateL(data.createdAt)}</span>
          </div>

          {/* Headline */}
          <h1 className="nd-headline">{data.title}</h1>

          <div className="nd-divider" />

          {/* Body */}
          <div className="nd-body">
            {paragraphs.length > 0
              ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
              : <p style={{ color:"var(--muted)", fontStyle:"italic" }}>No content available for this article.</p>}
          </div>

          {/* Source */}
          {data.sourceUrl && (
            <div className="nd-source-row">
              <span className="label">Source</span>
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">
                {(() => { try { return new URL(data.sourceUrl).hostname.replace("www.",""); } catch { return "View Source"; } })()} ↗
              </a>
            </div>
          )}

          {/* Share */}
          <div className="nd-share-row">
            <span className="nd-share-label">Share</span>
            <button className={`nd-share-btn${copied ? " copied" : ""}`} onClick={handleCopy}>
              {copied ? "✅ Copied!" : "🔗 Copy Link"}
            </button>
            <a className="nd-share-btn"
              href={`https://wa.me/?text=${encodeURIComponent(`${data.title} — ${window.location.href}`)}`}
              target="_blank" rel="noopener noreferrer">
              📱 WhatsApp
            </a>
            <a className="nd-share-btn"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(data.title)}&url=${encodeURIComponent(window.location.href)}`}
              target="_blank" rel="noopener noreferrer">
              🐦 Tweet
            </a>
          </div>
        </div>

        {/* ── Sections below ── */}
        <div className="nd-sections">

          {/* Related Movie */}
          {movie && (
            <div className="nd-sec">
              <div className="nd-sec-head">
                <h2 className="nd-sec-title">🎬 About the Film</h2>
                <Link to={`/movie/${movie._id}`} className="btn btn-ghost btn-sm" style={{ fontSize:".74rem" }}>
                  View Full Page →
                </Link>
              </div>
              <div className="nd-movie-card" onClick={() => navigate(`/movie/${movie._id}`)}>
                <div className="nd-movie-poster">
                  {movie.posterUrl || movie.thumbnailUrl
                    ? <img src={movie.posterUrl || movie.thumbnailUrl} alt={movie.title} />
                    : <div className="ph">🎬</div>}
                </div>
                <div className="nd-movie-info">
                  <div className="nd-movie-title">{movie.title}</div>
                  {movie.productionId?.name && <div className="nd-movie-prod">{movie.productionId.name}</div>}
                  <div className="nd-movie-badges">
                    {movie.genre?.slice(0,3).map(g => <span key={g} className="nd-movie-badge">{g}</span>)}
                    {movie.verdict && (
                      <span className="nd-movie-badge" style={{ color:verdictColor(movie.verdict), background:`${verdictColor(movie.verdict)}18` }}>
                        {movie.verdict}
                      </span>
                    )}
                  </div>
                  {movie.releaseDate && <div className="nd-movie-release">📅 {fmtDate(movie.releaseDate)}</div>}
                </div>
                <div className="nd-movie-arrow">›</div>
              </div>
            </div>
          )}

          {/* Related News */}
          {related.length > 0 && (
            <div className="nd-sec">
              <div className="nd-sec-head">
                <h2 className="nd-sec-title">📰 Related News</h2>
                <Link to="/news" className="btn btn-ghost btn-sm" style={{ fontSize:".74rem" }}>All News →</Link>
              </div>
              <div className="nd-related-grid">
                {related.map(n => (
                  <RelCard key={n._id} n={n} onClick={(nid) => navigate(`/news/${nid}`)} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}