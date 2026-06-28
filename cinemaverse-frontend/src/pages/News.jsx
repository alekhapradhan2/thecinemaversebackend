import SEO, { staticSEO } from "../components/SEO";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

// ── constants ─────────────────────────────────────────────────────
const CATS = ["All","Update","Release","Trailer","Song","Award","Interview","Review","Event","Announcement","Other"];
const PER_PAGE = 24;

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
const cm = (c) => CAT_META[c] || CAT_META.Other;
const fmtShort = (d) => new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
const fmtLong  = (d) => new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"long", year:"numeric"});

// ── CSS ───────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700;800&display=swap');

.np { --gold:#c9973a; --border:rgba(255,255,255,.08); --muted:#888; font-family:'DM Sans',sans-serif; padding:0 0 80px; }

/* ── masthead ── */
.np-mast {
  position:relative; overflow:hidden;
  padding:52px 28px 40px; margin-bottom:0;
  background:linear-gradient(135deg,rgba(20,14,2,.0) 0%,rgba(201,151,58,.06) 100%);
  border-bottom:1px solid rgba(201,151,58,.12);
}
.np-mast::before {
  content:""; position:absolute; top:-60px; right:-80px;
  width:360px; height:360px; border-radius:50%;
  background:radial-gradient(circle,rgba(201,151,58,.08) 0%,transparent 70%);
  pointer-events:none;
}
.np-mast-inner { max-width:1400px; margin:0 auto; position:relative; z-index:1; }
.np-mast-row { display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:20px; }
.np-eyebrow { font-size:.6rem; font-weight:800; letter-spacing:.2em; text-transform:uppercase; color:var(--gold); margin-bottom:8px; display:flex; align-items:center; gap:8px; }
.np-eyebrow::after { content:""; flex:1; max-width:60px; height:1px; background:rgba(201,151,58,.35); }
.np-mast h1 { font-family:'Playfair Display',serif; font-size:clamp(2rem,5vw,3.2rem); font-weight:900; margin:0; line-height:1.08; letter-spacing:-.02em; }
.np-mast-sub { font-size:.84rem; color:var(--muted); margin-top:8px; line-height:1.5; }
.np-mast-stats { display:flex; gap:16px; flex-wrap:wrap; }
.np-stat-pill { display:flex; flex-direction:column; align-items:center; background:rgba(201,151,58,.08); border:1px solid rgba(201,151,58,.18); border-radius:12px; padding:12px 20px; min-width:90px; }
.np-stat-num { font-size:1.4rem; font-weight:900; color:var(--gold); line-height:1; }
.np-stat-label { font-size:.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); margin-top:4px; }

/* ── sticky toolbar ── */
.np-toolbar-wrap {
  position:sticky; top:58px; z-index:100;
  background:rgba(10,8,2,.92); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  border-bottom:1px solid rgba(255,255,255,.06);
  padding:12px 28px;
}
.np-toolbar { max-width:1400px; margin:0 auto; display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.np-search-wrap { position:relative; flex:1; min-width:200px; max-width:320px; }
.np-search-ico { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:.82rem; color:var(--muted); pointer-events:none; }
.np-search {
  width:100%; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
  border-radius:10px; padding:9px 14px 9px 34px; color:#fff; font-size:.84rem;
  font-family:inherit; outline:none; transition:border .2s,background .2s; box-sizing:border-box;
}
.np-search:focus { border-color:rgba(201,151,58,.5); background:rgba(255,255,255,.09); }
.np-search::placeholder { color:rgba(255,255,255,.3); }
.np-cats { display:flex; gap:6px; flex-wrap:wrap; flex:1; }
.np-cat { display:flex; align-items:center; gap:4px; padding:6px 13px; border-radius:20px; border:1px solid rgba(255,255,255,.1); background:transparent; color:rgba(255,255,255,.55); font-size:.73rem; font-weight:700; cursor:pointer; transition:all .15s; font-family:inherit; white-space:nowrap; }
.np-cat:hover { border-color:rgba(201,151,58,.4); color:#fff; background:rgba(255,255,255,.05); }
.np-cat.on { background:var(--gold); color:#000; border-color:var(--gold); }
.np-result-info { font-size:.74rem; color:var(--muted); white-space:nowrap; margin-left:auto; }

/* ── main content ── */
.np-content { max-width:1400px; margin:0 auto; padding:32px 28px 0; }

/* ── hero story ── */
.np-hero {
  display:grid; grid-template-columns:1fr;
  border-radius:20px; overflow:hidden; cursor:pointer;
  margin-bottom:40px; position:relative;
  box-shadow:0 24px 60px rgba(0,0,0,.5);
  transition:transform .25s,box-shadow .25s;
  border:1px solid rgba(255,255,255,.07);
}
@media(min-width:720px){ .np-hero { grid-template-columns:3fr 2fr; } }
.np-hero:hover { transform:translateY(-4px); box-shadow:0 32px 72px rgba(0,0,0,.6); }
.np-hero-visual { position:relative; min-height:280px; overflow:hidden; background:#111; }
@media(min-width:720px){ .np-hero-visual { min-height:400px; } }
.np-hero-visual img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .5s; }
.np-hero:hover .np-hero-visual img { transform:scale(1.04); }
.np-hero-visual-ph { width:100%; height:100%; min-height:280px; display:flex; align-items:center; justify-content:center; font-size:5rem; background:linear-gradient(135deg,#1a1200,#0f0a00); }
.np-hero-overlay { position:absolute; inset:0; background:linear-gradient(to right,transparent 40%,rgba(12,8,0,.97)); }
@media(max-width:719px){ .np-hero-overlay { background:linear-gradient(to top,rgba(12,8,0,.96) 0%,transparent 55%); } }
.np-hero-body {
  padding:36px 32px; display:flex; flex-direction:column; justify-content:center; gap:14px;
  background:linear-gradient(135deg,#0f0a00,#1a1200);
}
@media(max-width:719px){ .np-hero-body { padding:20px 20px 28px; } }
.np-hero-eyebrow { font-size:.58rem; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:rgba(201,151,58,.7); }
.np-hero-title { font-family:'Playfair Display',serif; font-size:clamp(1.1rem,2.5vw,1.7rem); font-weight:900; line-height:1.25; margin:0; color:#fff; }
.np-hero-excerpt { font-size:.82rem; color:rgba(255,255,255,.58); line-height:1.68; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
.np-hero-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.np-hero-cta { margin-top:4px; font-size:.78rem; font-weight:700; color:var(--gold); display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(201,151,58,.3); border-radius:20px; padding:7px 16px; width:fit-content; transition:background .15s; }
.np-hero-cta:hover { background:rgba(201,151,58,.1); }

/* ── section divider ── */
.np-sec-div { display:flex; align-items:center; gap:14px; margin:0 0 24px; }
.np-sec-div::before,.np-sec-div::after { content:""; flex:1; height:1px; background:rgba(255,255,255,.07); }
.np-sec-div-label { font-size:.62rem; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); white-space:nowrap; padding:0 4px; }

/* ── masonry-style grid ── */
.np-grid { columns:1; gap:20px; }
@media(min-width:580px){ .np-grid { columns:2; } }
@media(min-width:900px){ .np-grid { columns:3; } }
@media(min-width:1200px){ .np-grid { columns:4; } }
.np-grid .np-card { break-inside:avoid; margin-bottom:20px; }

/* ── news card ── */
.np-card {
  background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07);
  border-radius:14px; overflow:hidden; cursor:pointer;
  transition:transform .2s,border-color .2s,box-shadow .2s;
  display:flex; flex-direction:column;
}
.np-card:hover { transform:translateY(-5px); border-color:rgba(201,151,58,.4); box-shadow:0 16px 40px rgba(0,0,0,.45); }
.np-card-img { position:relative; overflow:hidden; background:#111; }
.np-card-img.ratio169 { aspect-ratio:16/9; }
.np-card-img img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .35s; }
.np-card:hover .np-card-img img { transform:scale(1.06); }
.np-card-img-ph { width:100%; aspect-ratio:16/9; display:flex; align-items:center; justify-content:center; font-size:2rem; color:rgba(255,255,255,.2); background:linear-gradient(135deg,#111,#1a1200); }
.np-card-badge { position:absolute; top:10px; left:10px; font-size:.58rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:3px 9px; border-radius:10px; border:1px solid transparent; backdrop-filter:blur(4px); }
.np-card-body { padding:14px 16px 16px; flex:1; display:flex; flex-direction:column; gap:8px; }
.np-card-title { font-weight:800; font-size:.9rem; line-height:1.42; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; color:#fff; }
.np-card-excerpt { font-size:.75rem; color:rgba(255,255,255,.5); line-height:1.6; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; flex:1; }
.np-card-foot { display:flex; align-items:center; gap:6px; padding-top:10px; border-top:1px solid rgba(255,255,255,.06); margin-top:auto; }
.np-card-movie { font-size:.67rem; color:var(--gold); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%; flex:1; }
.np-card-date { font-size:.64rem; color:var(--muted); white-space:nowrap; flex-shrink:0; }
.np-card-src { font-size:.6rem; color:var(--muted); text-decoration:none; border:1px solid rgba(255,255,255,.1); border-radius:4px; padding:1px 6px; transition:color .12s,border-color .12s; flex-shrink:0; }
.np-card-src:hover { color:var(--gold); border-color:rgba(201,151,58,.4); }

/* ── pagination ── */
.np-pagination { display:flex; align-items:center; justify-content:center; gap:6px; padding:44px 0 8px; flex-wrap:wrap; }
.np-pg-btn { min-width:38px; height:38px; padding:0 10px; border-radius:9px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.05); color:rgba(255,255,255,.7); font-size:.82rem; font-weight:700; cursor:pointer; transition:all .15s; font-family:inherit; display:flex; align-items:center; justify-content:center; }
.np-pg-btn:hover:not(:disabled) { border-color:rgba(201,151,58,.5); background:rgba(201,151,58,.1); color:var(--gold); }
.np-pg-btn.active { background:var(--gold); color:#000; border-color:var(--gold); }
.np-pg-btn:disabled { opacity:.3; cursor:default; }
.np-pg-dots { color:rgba(255,255,255,.3); font-size:.9rem; padding:0 4px; }
.np-pg-info { font-size:.72rem; color:var(--muted); margin-left:8px; }

/* ── empty ── */
.np-empty { text-align:center; padding:80px 20px; }
.np-empty-icon { font-size:3.5rem; margin-bottom:18px; }
.np-empty h3 { font-size:1.1rem; margin:0 0 8px; font-weight:800; }
.np-empty p { font-size:.84rem; color:var(--muted); }

/* ── skeleton ── */
.np-skel-grid { columns:1; gap:20px; }
@media(min-width:580px){ .np-skel-grid { columns:2; } }
@media(min-width:900px){ .np-skel-grid { columns:3; } }
@media(min-width:1200px){ .np-skel-grid { columns:4; } }
.np-skel-card { break-inside:avoid; border-radius:14px; overflow:hidden; margin-bottom:20px; }

/* ── load-more btn ── */
.np-load-more { display:flex; justify-content:center; padding:32px 0 0; }
.np-load-more button { padding:12px 32px; border-radius:10px; border:1px solid rgba(201,151,58,.35); background:rgba(201,151,58,.08); color:var(--gold); font-size:.86rem; font-weight:700; cursor:pointer; transition:all .18s; font-family:inherit; }
.np-load-more button:hover { background:rgba(201,151,58,.18); border-color:var(--gold); }
.np-load-more button:disabled { opacity:.5; cursor:not-allowed; }
`;

// ── Badge component ───────────────────────────────────────────────
function CatBadge({ cat, style={} }) {
  const m = cm(cat);
  return (
    <span style={{ fontSize:".58rem", fontWeight:800, letterSpacing:".06em", textTransform:"uppercase",
      padding:"3px 9px", borderRadius:10, background:m.bg, color:m.color, border:`1px solid ${m.color}33`, ...style }}>
      {m.icon} {cat||"Update"}
    </span>
  );
}

// ── Hero card ─────────────────────────────────────────────────────
function HeroCard({ n, onClick }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="np-hero" onClick={() => onClick(n._id)}>
      <div className="np-hero-visual">
        {n.imageUrl && !broken
          ? <img src={n.imageUrl} alt={n.title} loading="eager" onError={() => setBroken(true)} />
          : <div className="np-hero-visual-ph">📰</div>}
        <div className="np-hero-overlay" />
      </div>
      <div className="np-hero-body">
        <span className="np-hero-eyebrow">Featured Story</span>
        <CatBadge cat={n.category} />
        <h2 className="np-hero-title">{n.title}</h2>
        {n.content && <p className="np-hero-excerpt">{n.content}</p>}
        <div className="np-hero-meta">
          {n.movieTitle && <span style={{fontSize:".72rem",color:"var(--gold)",fontWeight:600}}>🎬 {n.movieTitle}</span>}
          <span style={{fontSize:".7rem",color:"rgba(255,255,255,.4)",marginLeft:"auto"}}>{fmtLong(n.createdAt)}</span>
        </div>
        <span className="np-hero-cta">Read Full Article →</span>
      </div>
    </div>
  );
}

// ── News card ─────────────────────────────────────────────────────
function NewsCard({ n, onClick }) {
  const [broken, setBroken] = useState(false);
  const m = cm(n.category);
  return (
    <div className="np-card" onClick={() => onClick(n._id)}>
      <div className={`np-card-img ratio169`}>
        {n.imageUrl && !broken
          ? <img src={n.imageUrl} alt={n.title} loading="lazy" decoding="async" onError={() => setBroken(true)} />
          : <div className="np-card-img-ph">📰</div>}
        <span className="np-card-badge" style={{background:m.bg,color:m.color,borderColor:`${m.color}33`}}>
          {m.icon} {n.category||"Update"}
        </span>
      </div>
      <div className="np-card-body">
        <div className="np-card-title">{n.title}</div>
        {n.content && <div className="np-card-excerpt">{n.content}</div>}
        <div className="np-card-foot">
          <span className="np-card-movie">{n.movieTitle ? `🎬 ${n.movieTitle}` : ""}</span>
          {n.sourceUrl && (
            <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="np-card-src" onClick={e => e.stopPropagation()}>Source ↗</a>
          )}
          <span className="np-card-date">{fmtShort(n.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────
function Pagination({ page, total, perPage, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  const scrollUp = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const go = (p) => { onChange(p); scrollUp(); };

  let lo = Math.max(1, page - 2), hi = Math.min(totalPages, page + 2);
  if (hi - lo < 4) { lo = Math.max(1, hi - 4); hi = Math.min(totalPages, lo + 4); }
  const pages = [];
  for (let i = lo; i <= hi; i++) pages.push(i);

  return (
    <div className="np-pagination">
      <button className="np-pg-btn" disabled={page === 1} onClick={() => go(page - 1)}>‹</button>
      {lo > 1 && <><button className="np-pg-btn" onClick={() => go(1)}>1</button>{lo > 2 && <span className="np-pg-dots">…</span>}</>}
      {pages.map(p => <button key={p} className={`np-pg-btn${p === page ? " active" : ""}`} onClick={() => go(p)}>{p}</button>)}
      {hi < totalPages && <>{hi < totalPages - 1 && <span className="np-pg-dots">…</span>}<button className="np-pg-btn" onClick={() => go(totalPages)}>{totalPages}</button></>}
      <button className="np-pg-btn" disabled={page === totalPages} onClick={() => go(page + 1)}>›</button>
      <span className="np-pg-info">{((page-1)*perPage)+1}–{Math.min(page*perPage,total)} of {total}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export default function News() {
  const navigate = useNavigate();

  // Always fetch directly from API — never use stale cache for news
  const [allNews, setAllNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("All");
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);

  useEffect(() => {
    setLoading(true);
    API.getNews()
      .then(data => { setAllNews(Array.isArray(data) ? data : []); })
      .catch(e => console.error("Failed to load news:", e))
      .finally(() => setLoading(false));
  }, []);

  // Reset page when filter/search changes
  useEffect(() => { setPage(1); }, [filter, search]);

  const filtered = allNews.filter(n => {
    const matchCat    = filter === "All" || n.category === filter;
    const matchSearch = !search
      || n.title?.toLowerCase().includes(search.toLowerCase())
      || n.movieTitle?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const showHero = filter === "All" && !search && sorted.length > 0;
  const heroItem = showHero ? sorted[0] : null;
  const gridItems = showHero ? sorted.slice(1) : sorted;

  const totalGrid = gridItems.length;
  const paged = gridItems.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Category counts
  const catCounts = {};
  allNews.forEach(n => { catCounts[n.category] = (catCounts[n.category] || 0) + 1; });

  const goTo = (id) => navigate(`/news/${id}`);

  return (
    <>
      <style>{CSS}</style>
      <div className="np">
        <SEO {...staticSEO.news} />

        {/* ── Masthead ── */}
        <div className="np-mast">
          <div className="np-mast-inner">
            <div className="np-mast-row">
              <div>
                <div className="np-eyebrow">Ollipedia Film News</div>
                <h1>Odia Cinema<br/>News &amp; Updates</h1>
                <div className="np-mast-sub">Stories, releases, trailers and exclusives from Ollywood</div>
              </div>
              {!loading && allNews.length > 0 && (
                <div className="np-mast-stats">
                  <div className="np-stat-pill">
                    <span className="np-stat-num">{allNews.length}</span>
                    <span className="np-stat-label">Articles</span>
                  </div>
                  <div className="np-stat-pill">
                    <span className="np-stat-num">{Object.keys(catCounts).length}</span>
                    <span className="np-stat-label">Categories</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sticky Toolbar ── */}
        <div className="np-toolbar-wrap">
          <div className="np-toolbar">
            <div className="np-search-wrap">
              <span className="np-search-ico">🔍</span>
              <input className="np-search" placeholder="Search articles, movies…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="np-cats">
              {CATS.filter(c => c === "All" || catCounts[c] > 0).map(c => (
                <button key={c} className={`np-cat${filter === c ? " on" : ""}`}
                  onClick={() => setFilter(c)}>
                  {c !== "All" && <span>{cm(c).icon}</span>}
                  {c}
                  {c !== "All" && catCounts[c] && (
                    <span style={{opacity:.6,fontWeight:500,fontSize:".68rem"}}>{catCounts[c]}</span>
                  )}
                </button>
              ))}
            </div>
            {(search || filter !== "All") && (
              <span className="np-result-info">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="np-content">
          {loading ? (
            <div className="np-skel-grid">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="np-skel-card skeleton" style={{ height: [280,240,300,260,220,280,240,300,260,240,280,260][i] }} />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="np-empty">
              <div className="np-empty-icon">📭</div>
              <h3>{search ? "No results found" : "No articles yet"}</h3>
              <p>{search ? `No articles match "${search}". Try different keywords.` : "Check back soon for the latest news."}</p>
              {(search || filter !== "All") && (
                <button className="btn btn-outline" style={{marginTop:16}}
                  onClick={() => { setSearch(""); setFilter("All"); }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Hero */}
              {heroItem && <HeroCard n={heroItem} onClick={goTo} />}

              {/* Section label */}
              {paged.length > 0 && (
                <div className="np-sec-div">
                  <span className="np-sec-div-label">
                    {filter !== "All" || search
                      ? `${filtered.length} article${filtered.length !== 1 ? "s" : ""}`
                      : "Latest Stories"}
                  </span>
                </div>
              )}

              {/* Grid */}
              <div className="np-grid">
                {paged.map(n => <NewsCard key={n._id} n={n} onClick={goTo} />)}
              </div>

              {/* Pagination */}
              <Pagination page={page} total={totalGrid} perPage={PER_PAGE} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </>
  );
}