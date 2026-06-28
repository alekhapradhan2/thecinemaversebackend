import SEO, { staticSEO } from "../components/SEO";
import { moviePath } from "../utils/slugs";
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";
import { Cache } from "../api/cache";

const GENRES   = ["Action","Drama","Romance","Comedy","Thriller","Family","Historical","Musical","Biographical","Devotional","Horror"];
const VERDICTS = ["Upcoming","Blockbuster","Super Hit","Hit","Average","Flop","Disaster"];
const VS = { "Blockbuster":"#95e5b8","Super Hit":"#95e5b8","Hit":"#a3e8a0","Average":"#e8c87a","Flop":"#e59595","Disaster":"#e59595","Upcoming":"#7aaae8" };

// How many movies shown per year section before "View all" click
const YEAR_PREVIEW = 16;
// How many years shown at once before "Load more years"
const YEARS_INIT   = 3;   // last 3 years on first load
const YEARS_STEP   = 3;   // load 3 more years per click
const FILTER_PAGE  = 24;  // paginated grid page size

// Shared lazy IO
const _io = typeof window !== "undefined" ? (() => {
  const cbs = new WeakMap();
  const io  = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { cbs.get(e.target)?.(); cbs.delete(e.target); io.unobserve(e.target); } });
  }, { rootMargin: "350px" });
  io._cbs = cbs; return io;
})() : null;
const obsImg = (el, cb) => { if (!_io || !el) return; _io._cbs.set(el, cb); _io.observe(el); return () => { _io.unobserve(el); _io._cbs.delete(el); }; };

// ─── CSS ──────────────────────────────────────────────────────────
const CSS = `
@keyframes mv-pulse { 0%,100%{opacity:1} 50%{opacity:.28} }

.mv-root { min-height:100vh; background:#0f0f0f; padding-top:58px; color:#f1f1f1; }

/* ── Sticky header ── */
.mv-hdr { position:sticky; top:58px; z-index:99; background:#0f0f0f; border-bottom:1px solid rgba(255,255,255,.09); }

/* Search row */
.mv-srow { display:flex; align-items:center; gap:10px; padding:10px 16px; }
@media(min-width:600px){ .mv-srow { padding:10px 24px; } }
@media(min-width:960px){ .mv-srow { padding:10px 32px; } }

.mv-sbox {
  display:flex; align-items:center; flex:1; max-width:560px;
  background:#272727; border:1.5px solid rgba(255,255,255,.1);
  border-radius:24px; padding:0 16px; gap:8px; transition:border-color .18s;
}
.mv-sbox:focus-within { border-color:rgba(201,151,58,.7); background:#303030; }
.mv-sbox input { flex:1; background:none; border:none; outline:none; color:#f1f1f1; font-size:.86rem; padding:9px 0; min-width:0; }
.mv-sbox input::placeholder { color:rgba(255,255,255,.3); }
.mv-sico { color:rgba(255,255,255,.3); font-size:.9rem; flex-shrink:0; }
.mv-sx   { background:none; border:none; color:rgba(255,255,255,.4); cursor:pointer; font-size:.86rem; padding:2px; flex-shrink:0; }
.mv-sx:hover { color:#fff; }
.mv-count { font-size:.73rem; color:rgba(255,255,255,.38); white-space:nowrap; flex-shrink:0; display:none; }
@media(min-width:520px){ .mv-count { display:block; } }

/* Chips */
.mv-chips { display:flex; align-items:center; gap:7px; padding:0 16px 10px; overflow-x:auto; scrollbar-width:none; }
.mv-chips::-webkit-scrollbar { display:none; }
@media(min-width:600px){ .mv-chips { padding:0 24px 10px; } }
@media(min-width:960px){ .mv-chips { padding:0 32px 10px; } }
.mv-chip {
  position:relative; display:inline-flex; align-items:center; gap:5px;
  background:#272727; border:1px solid rgba(255,255,255,.13);
  border-radius:20px; padding:6px 14px; font-size:.75rem; font-weight:600;
  color:#f1f1f1; cursor:pointer; flex-shrink:0; white-space:nowrap;
  transition:background .15s; user-select:none;
}
.mv-chip:hover { background:#3a3a3a; }
.mv-chip.on { background:#f1f1f1; color:#0f0f0f; border-color:#f1f1f1; font-weight:700; }
.mv-chip.on:hover { background:#e0e0e0; }
.mv-chip.tab.on { background:rgba(201,151,58,.16); color:#c9973a; border-color:rgba(201,151,58,.5); }
.mv-chip select { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; font-size:1rem; }
.mv-cx { background:none; border:none; color:inherit; cursor:pointer; font-size:.68rem; padding:0; line-height:1; opacity:.65; flex-shrink:0; }
.mv-cx:hover { opacity:1; }
.mv-cdiv { width:1px; height:22px; background:rgba(255,255,255,.12); flex-shrink:0; margin:0 2px; }

/* Content */
.mv-content { padding:16px 16px 80px; }
@media(min-width:600px){ .mv-content { padding:18px 24px 80px; } }
@media(min-width:960px){ .mv-content { padding:20px 32px 80px; } }

.mv-rinfo { font-size:.75rem; color:rgba(255,255,255,.38); margin-bottom:16px; }

/* ── Year section ── */
.mv-ysec { margin-bottom:40px; }
.mv-ysec-head {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:14px;
}
.mv-ysec-title { font-size:1rem; font-weight:700; color:#f1f1f1; margin:0; }
@media(min-width:600px){ .mv-ysec-title { font-size:1.08rem; } }
.mv-ysec-cnt { font-size:.7rem; color:rgba(255,255,255,.35); margin-left:6px; font-weight:400; }
.mv-va { font-size:.75rem; font-weight:700; color:#3ea6ff; background:none; border:none; cursor:pointer; padding:4px 2px; white-space:nowrap; flex-shrink:0; }
.mv-va:hover { color:#71bcff; text-decoration:underline; }

/* ── Poster grid — 2:3 ── */
.mv-grid {
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:10px 8px;
  align-items:start;
}
@media(min-width:480px)  { .mv-grid { grid-template-columns:repeat(4,1fr);  gap:12px 10px; } }
@media(min-width:720px)  { .mv-grid { grid-template-columns:repeat(5,1fr);  gap:14px 12px; } }
@media(min-width:960px)  { .mv-grid { grid-template-columns:repeat(6,1fr);  gap:16px 12px; } }
@media(min-width:1200px) { .mv-grid { grid-template-columns:repeat(7,1fr);  gap:16px 14px; } }
@media(min-width:1500px) { .mv-grid { grid-template-columns:repeat(8,1fr);  gap:18px 14px; } }

/* ── Poster card ── */
.mv-card { cursor:pointer; display:block; width:100%; overflow:hidden; }
.mv-card:hover .mv-poster { transform:scale(1.03); box-shadow:0 12px 36px rgba(0,0,0,.7); }
.mv-card:hover .mv-po     { opacity:1; }
.mv-card:hover .mv-ctitle { color:#3ea6ff; }

.mv-poster {
  position:relative; display:block; width:100%;
  aspect-ratio:2/3; background:#272727;
  border-radius:8px; overflow:hidden; contain:layout paint;
  transition:transform .22s, box-shadow .22s;
  box-shadow:0 2px 8px rgba(0,0,0,.5);
}
.mv-poster img {
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:top; display:block;
}
.mv-poster-grad {
  position:absolute; bottom:0; left:0; right:0; height:55%;
  background:linear-gradient(to top,rgba(0,0,0,.88) 0%,transparent 100%);
  pointer-events:none;
}
.mv-po {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.32); opacity:0; transition:opacity .18s;
}
.mv-pc {
  width:36px; height:36px; border-radius:50%;
  background:rgba(0,0,0,.7); border:2px solid rgba(255,255,255,.65);
  display:flex; align-items:center; justify-content:center; font-size:.9rem;
}
.mv-verdict {
  position:absolute; top:6px; left:6px;
  font-size:.52rem; font-weight:800;
  padding:2px 6px; border-radius:3px;
  letter-spacing:.06em; text-transform:uppercase;
}
.mv-genre { position:absolute; bottom:6px; left:6px; font-size:.56rem; color:rgba(255,255,255,.7); font-weight:600; }

.mv-cmeta { padding:6px 1px 0; min-height:44px; }
.mv-ctitle {
  margin:0; font-size:.74rem; font-weight:600; color:#f1f1f1;
  line-height:1.35; transition:color .15s;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; max-height:calc(1.35em * 2); word-break:break-word;
}
@media(min-width:600px){ .mv-ctitle { font-size:.78rem; } }
.mv-cyear { margin:2px 0 0; font-size:.66rem; color:rgba(255,255,255,.3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Skeleton */
.mv-sk-post { aspect-ratio:2/3; background:#272727; border-radius:8px; animation:mv-pulse 1.4s ease-in-out infinite; }
.mv-sk-ln   { height:10px; background:#272727; border-radius:4px; animation:mv-pulse 1.4s ease-in-out infinite; }

/* Buttons */
.mv-more { display:flex; justify-content:center; padding:20px 0; }
.mv-more-btn {
  padding:10px 30px; background:#272727; border:1px solid rgba(255,255,255,.15);
  color:#f1f1f1; border-radius:20px; font-size:.82rem; font-weight:600; cursor:pointer; transition:background .16s;
}
.mv-more-btn:hover { background:#3a3a3a; }

.mv-load-years {
  display:flex; justify-content:center; padding:8px 0 24px;
}
.mv-load-years-btn {
  padding:10px 28px; background:rgba(201,151,58,.08);
  border:1px solid rgba(201,151,58,.3); color:#c9973a;
  border-radius:20px; font-size:.82rem; font-weight:600; cursor:pointer; transition:all .18s;
}
.mv-load-years-btn:hover { background:rgba(201,151,58,.15); }

/* Trending row */
.mv-trend-row { display:flex; gap:10px; overflow-x:auto; padding:4px 0 12px; scrollbar-width:none; }
.mv-trend-row::-webkit-scrollbar { display:none; }
.mv-trend-card { flex-shrink:0; width:120px; }
@media(min-width:480px){ .mv-trend-card { width:136px; } }
@media(min-width:768px){ .mv-trend-card { width:148px; } }

/* Empty */
.mv-empty { display:flex; flex-direction:column; align-items:center; padding:80px 20px; color:rgba(255,255,255,.32); gap:10px; text-align:center; }
.mv-empty span { font-size:3rem; }
.mv-empty p { font-size:.85rem; margin:0; }
`;

// ─── LazyImg ──────────────────────────────────────────────────────
function LazyImg({ src, alt, eager }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!src || eager || !ref.current) return;
    return obsImg(ref.current, () => { if (ref.current) ref.current.src = src; });
  }, [src, eager]);
  if (!src) return null;
  return (
    <img ref={ref} src={eager ? src : undefined} alt={alt||""} decoding="async"
      width="200" height="300"
      style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"top", display:"block", opacity:0, transition:"opacity .22s" }}
      onLoad={e  => { e.target.style.opacity = "1"; }}
      onError={e => { e.target.style.opacity = ".08"; }}
    />
  );
}

// ─── PosterCard ───────────────────────────────────────────────────
const PosterCard = React.memo(function PosterCard({ movie, onClick }) {
  const v   = movie.verdict || "Upcoming";
  const c   = VS[v] || "#7aaae8";
  const img = movie.posterUrl || movie.thumbnailUrl;
  return (
    <div className="mv-card" onClick={onClick}>
      <div className="mv-poster">
        {img
          ? <LazyImg src={img} alt={movie.title} />
          : <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem" }}>🎬</div>}
        <div className="mv-poster-grad" />
        <div className="mv-po"><div className="mv-pc">▶</div></div>
        <div className="mv-verdict" style={{ background:`${c}22`, border:`1px solid ${c}88`, color:c }}>{v}</div>
        {movie.genre?.[0] && <div className="mv-genre">{movie.genre[0]}</div>}
      </div>
      <div className="mv-cmeta">
        <p className="mv-ctitle">{movie.title}</p>
        <p className="mv-cyear">{movie.releaseDate?.slice(0,4) || "TBA"}</p>
      </div>
    </div>
  );
});

// ─── SkGrid ───────────────────────────────────────────────────────
function SkGrid({ n = 16 }) {
  return (
    <div className="mv-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i}>
          <div className="mv-sk-post" style={{ animationDelay:`${i*.04}s` }} />
          <div className="mv-sk-ln" style={{ width:"80%", marginTop:6, animationDelay:`${i*.04+.07}s` }} />
          <div className="mv-sk-ln" style={{ width:"50%", marginTop:4, animationDelay:`${i*.04+.12}s` }} />
        </div>
      ))}
    </div>
  );
}

// ─── YearSection — shows YEAR_PREVIEW cards, expands on "View all" ─
function YearSection({ year, movies, onMovie, isExpanded, onExpand, onCollapse }) {
  const sentRef = useRef(null);
  const [vis, setVis] = useState(false);
  const [filterPage, setFilterPage] = useState(1);

  useEffect(() => {
    const el = sentRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); io.disconnect(); }
    }, { rootMargin: "100px" });
    io.observe(el); return () => io.disconnect();
  }, []);

  const total   = movies.length;
  const shown   = isExpanded ? movies.slice(0, filterPage * FILTER_PAGE) : movies.slice(0, YEAR_PREVIEW);
  const canMore = isExpanded && shown.length < total;

  return (
    <div className="mv-ysec" ref={sentRef}>
      <div className="mv-ysec-head">
        <div style={{ display:"flex", alignItems:"center", gap:0, minWidth:0 }}>
          <h2 className="mv-ysec-title">
            📅 {year}
            <span className="mv-ysec-cnt">
              {isExpanded ? `${shown.length} of ${total}` : `${Math.min(YEAR_PREVIEW, total)} of ${total}`}
            </span>
          </h2>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
          {!isExpanded && total > YEAR_PREVIEW && (
            <button className="mv-va" onClick={onExpand}>View all {total} →</button>
          )}
          {isExpanded && (
            <button className="mv-va" onClick={onCollapse} style={{ color:"rgba(255,255,255,.4)" }}>↑ Collapse</button>
          )}
        </div>
      </div>

      {vis ? (
        <>
          <div className="mv-grid">
            {shown.map(m => <PosterCard key={m._id} movie={m} onClick={() => onMovie(m)} />)}
          </div>
          {/* Load more within expanded year */}
          {canMore && (
            <div className="mv-more" style={{ paddingTop:14 }}>
              <button className="mv-more-btn" onClick={() => setFilterPage(p => p + 1)}>
                Load more · {total - shown.length} remaining
              </button>
            </div>
          )}
        </>
      ) : (
        <SkGrid n={Math.min(YEAR_PREVIEW, 8)} />
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────
export default function Movies() {
  const navigate = useNavigate();
  // Initialise from cache → instant render on back-navigation
  const [movies,  setMovies]  = useState(() => Cache.peek("movies") || []);
  const [loading, setLoading] = useState(() => Cache.peek("movies") === null);

  // Filters
  const [search,   setSearch]   = useState("");
  const [fYear,    setFYear]    = useState("");
  const [fGenre,   setFGenre]   = useState("");
  const [fVerdict, setFVerdict] = useState("");

  // How many years visible in browse mode
  const [yearsVisible, setYearsVisible] = useState(YEARS_INIT);
  // Which year sections are fully expanded
  const [expandedYears, setExpandedYears] = useState({});

  // Filter mode pagination
  const [page, setPage] = useState(1);

  // Browse tab
  const [tab, setTab] = useState("browse");

  const isFiltering = !!(search.trim() || fYear || fGenre || fVerdict);

  useEffect(() => {
    if (Cache.peek("movies") !== null) return; // already cached
    Cache.getMovies()
      .then(d => setMovies([...d].sort((a, b) => (b.releaseDate||"0").localeCompare(a.releaseDate||"0"))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(1); }, [search, fYear, fGenre, fVerdict]);

  const go  = useCallback(m => navigate(moviePath(m)), [navigate]);
  const srt = useCallback(arr => [...arr].sort((a,b) => (b.releaseDate||"0").localeCompare(a.releaseDate||"0")), []);

  // All distinct years, newest first
  const allYears = useMemo(
    () => [...new Set(movies.map(m => m.releaseDate?.slice(0,4)).filter(Boolean))].sort((a,b) => b-a),
    [movies]
  );

  // Movies by year (memoised map)
  const moviesByYear = useMemo(() => {
    const map = {};
    allYears.forEach(yr => { map[yr] = srt(movies.filter(m => (m.releaseDate||"").startsWith(yr))); });
    return map;
  }, [movies, allYears, srt]);

  // Years shown in browse mode (last YEARS_INIT first, then more on demand)
  const visibleYears = useMemo(() => allYears.slice(0, yearsVisible), [allYears, yearsVisible]);
  const hasMoreYears = yearsVisible < allYears.length;

  // Trending = top-rated recent movies
  const trending = useMemo(() =>
    movies.filter(m => m.reviews?.length >= 1)
      .map(m => ({ ...m, avg: m.reviews.reduce((s,r) => s+(r.rating||0), 0) / m.reviews.length }))
      .filter(m => m.avg >= 3.5)
      .sort((a,b) => b.avg - a.avg)
      .slice(0, 20),
    [movies]
  );

  // Upcoming movies
  const upcoming = useMemo(() => srt(movies.filter(m => !m.verdict || m.verdict==="Upcoming")).slice(0, 20), [movies, srt]);

  // Filtered
  const filtered = useMemo(() => {
    let base = movies;
    if (search.trim()) { const q = search.toLowerCase(); base = base.filter(m => m.title?.toLowerCase().includes(q) || m.director?.toLowerCase().includes(q)); }
    if (fYear)    base = base.filter(m => (m.releaseDate||"").startsWith(fYear));
    if (fGenre)   base = base.filter(m => m.genre?.includes(fGenre));
    if (fVerdict) base = base.filter(m => (m.verdict||"Upcoming") === fVerdict);
    return base;
  }, [movies, search, fYear, fGenre, fVerdict]);

  const shownF  = filtered.slice(0, page * FILTER_PAGE);
  const hasMore = shownF.length < filtered.length;

  const clearAll = () => { setSearch(""); setFYear(""); setFGenre(""); setFVerdict(""); };

  const TABS = [
    { key:"browse",   label:"🎬 Browse" },
    { key:"upcoming", label:"🚀 Upcoming", count: upcoming.length },
    { key:"trending", label:"⭐ Top Rated", count: trending.length },
  ];

  return (
    <div className="mv-root">
      <SEO {...staticSEO.movies} />
      <style>{CSS}</style>

      {/* ══ STICKY HEADER ══ */}
      <div className="mv-hdr">
        <div className="mv-srow">
          <div className="mv-sbox">
            <span className="mv-sico">🔍</span>
            <input placeholder="Search movies, directors…" value={search}
              onChange={e => setSearch(e.target.value)} autoComplete="off" />
            {search && <button className="mv-sx" onClick={() => setSearch("")}>✕</button>}
          </div>
          <span className="mv-count">🎬 {movies.length.toLocaleString()} films</span>
        </div>

        <div className="mv-chips">
          {/* Year chip */}
          <div className={`mv-chip${fYear?" on":""}`}>
            {fYear
              ? <>{fYear} <button className="mv-cx" onClick={() => setFYear("")}>✕</button></>
              : <>📅 Year<select value={fYear} onChange={e => setFYear(e.target.value)} title="Year">
                  <option value="">All Years</option>
                  {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select></>
            }
          </div>

          {/* Genre chip */}
          <div className={`mv-chip${fGenre?" on":""}`}>
            {fGenre
              ? <>{fGenre} <button className="mv-cx" onClick={() => setFGenre("")}>✕</button></>
              : <>🎭 Genre<select value={fGenre} onChange={e => setFGenre(e.target.value)} title="Genre">
                  <option value="">All Genres</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select></>
            }
          </div>

          {/* Verdict chip */}
          <div className={`mv-chip${fVerdict?" on":""}`}>
            {fVerdict
              ? <>{fVerdict} <button className="mv-cx" onClick={() => setFVerdict("")}>✕</button></>
              : <>🏆 Verdict<select value={fVerdict} onChange={e => setFVerdict(e.target.value)} title="Verdict">
                  <option value="">All Verdicts</option>
                  {VERDICTS.map(v => <option key={v} value={v}>{v}</option>)}
                </select></>
            }
          </div>

          {(fYear || fGenre || fVerdict) && (
            <div className="mv-chip" onClick={clearAll}
              style={{ color:"#ff6b6b", borderColor:"rgba(255,107,107,.3)", background:"rgba(255,107,107,.07)" }}>
              ✕ Clear
            </div>
          )}

          {!isFiltering && (
            <>
              <div className="mv-cdiv" />
              {TABS.map(t => (
                <div key={t.key} className={`mv-chip tab${tab===t.key?" on":""}`} onClick={() => setTab(t.key)}>
                  {t.label}
                  {t.count != null && <span style={{ fontSize:".62rem", opacity:.5, marginLeft:3 }}>{t.count}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ══ CONTENT ══ */}
      <div className="mv-content">
        {loading && <SkGrid n={16} />}

        {/* ── Filter / search mode ── */}
        {!loading && isFiltering && (
          <>
            <p className="mv-rinfo">
              {filtered.length === 0 ? "No results" : `${filtered.length.toLocaleString()} film${filtered.length!==1?"s":""}`}
              {fYear    && <> · <strong style={{color:"#f1f1f1"}}>{fYear}</strong></>}
              {fGenre   && <> · <strong style={{color:"#f1f1f1"}}>{fGenre}</strong></>}
              {fVerdict && <> · <strong style={{color:"#f1f1f1"}}>{fVerdict}</strong></>}
            </p>
            {filtered.length === 0 ? (
              <div className="mv-empty"><span>🎬</span><p>No films match your filters.</p>
                <button className="mv-more-btn" style={{marginTop:8}} onClick={clearAll}>Clear filters</button>
              </div>
            ) : (
              <>
                <div className="mv-grid">
                  {shownF.map(m => <PosterCard key={m._id} movie={m} onClick={() => go(m)} />)}
                </div>
                {hasMore && (
                  <div className="mv-more">
                    <button className="mv-more-btn" onClick={() => setPage(p => p+1)}>
                      Load more · {filtered.length - shownF.length} remaining
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Browse mode — year sections ── */}
        {!loading && !isFiltering && tab === "browse" && (
          <>
            {/* Trending strip at top */}
            {trending.length > 0 && (
              <div className="mv-ysec">
                <div className="mv-ysec-head">
                  <h2 className="mv-ysec-title">⭐ Trending Now
                    <span className="mv-ysec-cnt">{trending.length}</span>
                  </h2>
                </div>
                <div className="mv-trend-row">
                  {trending.map(m => (
                    <div key={m._id} className="mv-trend-card">
                      <PosterCard movie={m} onClick={() => go(m)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Year sections — last N years, lazy-loaded */}
            {visibleYears.map(yr => (
              <YearSection
                key={yr}
                year={yr}
                movies={moviesByYear[yr] || []}
                onMovie={go}
                isExpanded={!!expandedYears[yr]}
                onExpand={() => setExpandedYears(p => ({ ...p, [yr]: true }))}
                onCollapse={() => setExpandedYears(p => ({ ...p, [yr]: false }))}
              />
            ))}

            {/* Load more years button */}
            {hasMoreYears && (
              <div className="mv-load-years">
                <button className="mv-load-years-btn"
                  onClick={() => setYearsVisible(v => v + YEARS_STEP)}>
                  Load {Math.min(YEARS_STEP, allYears.length - yearsVisible)} more years
                  · {allYears.length - yearsVisible} remaining
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Upcoming tab ── */}
        {!loading && !isFiltering && tab === "upcoming" && (
          <div className="mv-ysec">
            <div className="mv-ysec-head">
              <h2 className="mv-ysec-title">🚀 Upcoming Films
                <span className="mv-ysec-cnt">{upcoming.length}</span>
              </h2>
            </div>
            <div className="mv-grid">
              {upcoming.map(m => <PosterCard key={m._id} movie={m} onClick={() => go(m)} />)}
            </div>
          </div>
        )}

        {/* ── Top Rated tab ── */}
        {!loading && !isFiltering && tab === "trending" && (
          <div className="mv-ysec">
            <div className="mv-ysec-head">
              <h2 className="mv-ysec-title">⭐ Top Rated Films
                <span className="mv-ysec-cnt">{trending.length}</span>
              </h2>
            </div>
            {trending.length === 0
              ? <div className="mv-empty"><span>⭐</span><p>No rated films yet.</p></div>
              : <div className="mv-grid">
                  {trending.map(m => <PosterCard key={m._id} movie={m} onClick={() => go(m)} />)}
                </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}