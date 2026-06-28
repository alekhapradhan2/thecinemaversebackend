import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API } from "../api/api";
import { moviePath, castPath, songPath } from "../utils/slugs";

// ── Module-level search cache ─────────────────────────────────────
const _cache = { movies: null, cast: null, songs: null };

// ── Fuzzy match — handles typos, partial matches, different spellings
// e.g. "charikandha" matches "Chharikandha", "badbadhu" matches "Bara Badhu"
function fuzzyMatch(text, query) {
  if (!text || !query) return false;
  const t = text.toLowerCase().replace(/\s+/g, "");
  const q = query.toLowerCase().replace(/\s+/g, "");

  // 1. Direct includes (fastest)
  if (text.toLowerCase().includes(query.toLowerCase())) return true;

  // 2. Collapsed includes (removes spaces: "bara badhu" → "barabadhu")
  if (t.includes(q)) return true;

  // 3. Every query word must appear somewhere in text
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every(w => text.toLowerCase().includes(w))) return true;

  // 4. Subsequence check — all chars of query appear in order in text
  // e.g. "chrikndha" matches "Chharikandha"
  let ti = 0, qi = 0;
  const tl = t, ql = q;
  while (ti < tl.length && qi < ql.length) {
    if (tl[ti] === ql[qi]) qi++;
    ti++;
  }
  if (qi === ql.length && ql.length >= 3) return true;

  // 5. Transliteration tolerance — double consonants
  // "chharikandha" ↔ "charikandha", "bbadhu" ↔ "badhu"
  const dedup = s => s.replace(/(.)\1+/g, "$1"); // collapse repeated chars
  if (dedup(t).includes(dedup(q)) && q.length >= 3) return true;

  return false;
}

// ── Score result — higher = more relevant, for sorting ───────────
function matchScore(text, query) {
  if (!text) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q)                    return 100; // exact
  if (t.startsWith(q))            return 90;  // starts with
  if (t.includes(q))              return 80;  // contains
  if (t.replace(/\s/g,"").includes(q.replace(/\s/g,""))) return 70; // no-space contains
  return 50; // fuzzy
}

// ── Global Search ─────────────────────────────────────────────────
function NavSearch({ onClose }) {
  const navigate  = useNavigate();
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState({ movies:[], cast:[], songs:[] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const wrapRef  = useRef(null);
  const timer    = useRef(null);

  useEffect(() => {
    const h = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults({ movies:[], cast:[], songs:[] }); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (!_cache.movies) {
          const [movies, cast] = await Promise.all([API.getMovies(), API.getCast()]);
          _cache.movies = movies;
          _cache.cast   = cast;
          _cache.songs  = [];
          // Store songIndex and full movie object for navigation
          movies.forEach(m => (m.media?.songs||[]).forEach((s, idx) => {
            _cache.songs.push({
              ...s,
              songIndex:  idx,
              movieTitle: m.title,
              movieId:    String(m._id),
              _movie:     m,           // full movie object for songPath()
            });
          }));
        }
        const q = query.trim();

        // Filter + sort by relevance score
        const sortByScore = (arr, getText) =>
          arr
            .filter(x => fuzzyMatch(getText(x), q))
            .map(x => ({ x, score: matchScore(getText(x), q) }))
            .sort((a, b) => b.score - a.score)
            .map(({ x }) => x);

        setResults({
          movies: sortByScore(_cache.movies, m => m.title || "").slice(0, 5),
          cast:   sortByScore(_cache.cast,   c => c.name  || "").slice(0, 4),
          songs:  sortByScore(_cache.songs,  s => s.title || "").slice(0, 5),
        });
      } catch { setResults({ movies:[], cast:[], songs:[] }); }
      finally  { setLoading(false); }
    }, 280);
  }, [query]);

  const total = results.movies.length + results.cast.length + results.songs.length;
  const go = path => { navigate(path); setOpen(false); setQuery(""); onClose?.(); };

  return (
    <div className="ns-wrap" ref={wrapRef}>
      {open ? (
        <div className="ns-box">
          <span className="ns-ico">🔍</span>
          <input ref={inputRef} className="ns-input"
            placeholder="Search movies, cast, songs…"
            value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          {query && <button className="ns-btn" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>✕</button>}
          <button className="ns-btn" onClick={() => setOpen(false)}>✕</button>
        </div>
      ) : (
        <button className="ns-trigger" aria-label="Search" onClick={() => setOpen(true)}>🔍</button>
      )}

      {open && query.trim() && (
        <div className="ns-drop">
          {loading && <div className="ns-msg">Searching…</div>}
          {!loading && total === 0 && <div className="ns-msg">No results for "{query}"</div>}

          {results.movies.length > 0 && (
            <div className="ns-group">
              <div className="ns-glabel">🎬 Movies</div>
              {results.movies.map(m => (
                <div key={m._id} className="ns-item" onClick={() => go(moviePath(m))}>
                  {m.posterUrl && <img src={m.posterUrl} alt={m.title} className="ns-thumb" />}
                  <div className="ns-info">
                    <span className="ns-ititle">{m.title}</span>
                    <span className="ns-isub">{m.category} · {m.language}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.cast.length > 0 && (
            <div className="ns-group">
              <div className="ns-glabel">👤 Cast & Crew</div>
              {results.cast.map(c => (
                <div key={c._id} className="ns-item" onClick={() => go(castPath(c))}>
                  {c.photo && <img src={c.photo} alt={c.name} className="ns-thumb ns-round" />}
                  <div className="ns-info">
                    <span className="ns-ititle">{c.name}</span>
                    <span className="ns-isub">{c.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.songs.length > 0 && (
            <div className="ns-group">
              <div className="ns-glabel">🎵 Songs</div>
              {results.songs.map((s, i) => {
                // Navigate to song detail page instead of YouTube
                const path = s._movie
                  ? songPath(s._movie, s.songIndex)
                  : `/song/${s.movieId}/${s.songIndex}`;
                const thumb = s.thumbnailUrl ||
                  (s.ytId ? `https://img.youtube.com/vi/${s.ytId}/mqdefault.jpg` : null);
                return (
                  <div key={i} className="ns-item" onClick={() => go(path)}>
                    {thumb && <img src={thumb} alt={s.title} className="ns-thumb" />}
                    <div className="ns-info">
                      <span className="ns-ititle">{s.title}</span>
                      <span className="ns-isub">
                        {s.singer && `🎤 ${s.singer} · `}{s.movieTitle}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Navbar CSS
// Key layout: brand LEFT via flex, spacer pushes everything else RIGHT
// ─────────────────────────────────────────────────────────────────
const CSS = `
/* ── Shell ── */
.navbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
  height: 58px;
  background: rgba(10,10,10,.96);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255,255,255,.07);
  display: flex;
  align-items: center;
  padding: 0 16px;
}
@media(min-width:768px){ .navbar { padding: 0 24px; } }

/* Brand — LEFT edge */
.nb-brand {
  font-family: 'Playfair Display', serif;
  font-size: 1.18rem; font-weight: 900; letter-spacing: -.01em;
  color: var(--gold, #c9973a); text-decoration: none; flex-shrink: 0;
}
.nb-brand span { color: var(--text, #f1f1f1); }

/* Flex spacer — pushes all remaining items to the RIGHT */
.nb-space { flex: 1; }

/* Nav links — desktop, RIGHT side */
.nb-links { display: none; align-items: center; gap: 2px; margin-right: 6px; }
@media(min-width:768px){ .nb-links { display: flex; } }
.nb-link {
  padding: 6px 11px; border-radius: 6px;
  font-weight: 600; font-size: .79rem;
  color: rgba(255,255,255,.58); text-decoration: none;
  white-space: nowrap; transition: color .16s, background .16s;
}
.nb-link:hover  { color: var(--text, #f1f1f1); background: rgba(255,255,255,.07); }
.nb-link.active { color: var(--gold, #c9973a); background: rgba(201,151,58,.1); }

/* ── Search ── */
.ns-wrap { position: relative; flex-shrink: 0; margin-right: 6px; }
.ns-box {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.13);
  border-radius: 22px; padding: 5px 12px; width: 220px;
}
@media(min-width:480px){ .ns-box { width: 260px; } }
@media(min-width:768px){ .ns-box { width: 300px; } }
.ns-ico   { font-size: .82rem; color: rgba(255,255,255,.32); flex-shrink: 0; }
.ns-input { flex: 1; background: none; border: none; outline: none; color: var(--text,#f1f1f1); font-size: .8rem; min-width: 0; }
.ns-input::placeholder { color: rgba(255,255,255,.28); }
.ns-btn { background: none; border: none; color: rgba(255,255,255,.38); cursor: pointer; font-size: .8rem; padding: 1px 2px; }
.ns-btn:hover { color: #fff; }
.ns-trigger {
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
  border-radius: 50%; width: 34px; height: 34px; font-size: .9rem; cursor: pointer;
  color: var(--text,#f1f1f1); display: flex; align-items: center; justify-content: center;
  transition: background .18s; flex-shrink: 0;
}
.ns-trigger:hover { background: rgba(255,255,255,.13); }
.ns-drop {
  position: absolute; top: calc(100% + 8px); right: 0;
  background: #1c1c1c; border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; width: 320px; max-height: 420px; overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0,0,0,.75); z-index: 999;
}
@media(max-width:420px){ .ns-drop { width: calc(100vw - 20px); right: -6px; } }
.ns-msg   { padding: 14px 16px; font-size: .8rem; color: rgba(255,255,255,.4); text-align: center; }
.ns-group { padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
.ns-group:last-child { border-bottom: none; }
.ns-glabel { padding: 6px 14px 3px; font-size: .62rem; font-weight: 800; text-transform: uppercase; letter-spacing: .09em; color: rgba(255,255,255,.36); }
.ns-item  { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; transition: background .14s; }
.ns-item:hover { background: rgba(255,255,255,.06); }
.ns-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 5px; flex-shrink: 0; }
.ns-round { border-radius: 50%; }
.ns-info  { flex: 1; min-width: 0; }
.ns-ititle { display: block; font-size: .8rem; font-weight: 600; color: var(--text,#f1f1f1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ns-isub  { display: block; font-size: .68rem; color: rgba(255,255,255,.38); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Admin actions ── */
.nb-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.nb-pname { font-size: .73rem; font-weight: 700; color: var(--gold,#c9973a); display: none; }
@media(min-width:640px){ .nb-pname { display: block; } }

/* ── Hamburger (mobile only) ── */
.nb-ham {
  display: flex; flex-direction: column; justify-content: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  padding: 6px; margin-left: 4px; flex-shrink: 0;
}
@media(min-width:768px){ .nb-ham { display: none; } }
.nb-ham span { display: block; width: 20px; height: 2px; background: var(--text,#f1f1f1); border-radius: 2px; transition: all .2s; }
.nb-ham.open span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.nb-ham.open span:nth-child(2) { opacity: 0; }
.nb-ham.open span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

/* ── Mobile drawer ── */
.nb-drawer {
  position: fixed; top: 58px; left: 0; right: 0; bottom: 0; z-index: 999;
  background: rgba(8,8,8,.98); backdrop-filter: blur(12px);
  display: flex; flex-direction: column;
  padding: 16px 20px 40px;
  transform: translateX(-100%);
  transition: transform .24s cubic-bezier(.4,0,.2,1);
  overflow-y: auto;
}
.nb-drawer.open { transform: translateX(0); }
@media(min-width:768px){ .nb-drawer { display: none !important; } }
.nb-dl {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 4px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  font-size: .94rem; font-weight: 700;
  color: rgba(255,255,255,.72); text-decoration: none;
  transition: color .16s;
  background: none; border-left: none; border-right: none; border-top: none;
  cursor: pointer; width: 100%; text-align: left;
}
.nb-dl:hover, .nb-dl.active { color: var(--gold,#c9973a); }
.nb-dl .ico { font-size: 1.1rem; width: 28px; flex-shrink: 0; }
.nb-div { border: none; border-top: 1px solid rgba(255,255,255,.08); margin: 8px 0; }
`;

const LINKS = [
  { to:"/",       label:"Home",   icon:"🏠" },
  { to:"/movies", label:"Movies", icon:"🎬" },
  { to:"/cast",   label:"Cast",   icon:"👥" },
  { to:"/news",   label:"News",   icon:"📰" },
  { to:"/songs",  label:"Songs",  icon:"🎵" },
  { to:"/blog",   label:"Blog",   icon:"✍️" },
];

export default function Navbar({ admin, onAdminLogout }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const lnk  = p => location.pathname === p ? "nb-link active" : "nb-link";
  const dlnk = p => location.pathname === p ? "nb-dl active"   : "nb-dl";

  return (
    <>
      <style>{CSS}</style>

      <nav className="navbar">
        {/* Brand — LEFT */}
        <Link to="/" className="nb-brand">OLLY<span>PEDIA</span></Link>

        {/* Spacer — pushes everything after to the RIGHT */}
        <div className="nb-space" />

        {/* Nav links — RIGHT (desktop only) */}
        <div className="nb-links">
          {LINKS.map(l => <Link key={l.to} to={l.to} className={lnk(l.to)}>{l.label}</Link>)}
        </div>

        {/* Search */}
        <NavSearch onClose={() => setOpen(false)} />

        {/* Admin actions */}
        {/* <div className="nb-actions">
          {admin ? (
            <>
              <Link to="/admin" style={{ display:"flex", alignItems:"center", gap:5, textDecoration:"none" }}>
                <span style={{ fontSize:"1rem" }}>🛡</span>
                <span className="nb-pname">{admin.username}</span>
              </Link>
              <span style={{ fontSize:".61rem", color:"var(--gold)", background:"rgba(201,151,58,.12)", padding:"2px 7px", borderRadius:8, fontWeight:800 }}>ADMIN</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize:".71rem" }}
                onClick={() => { onAdminLogout(); navigate("/"); }}>Logout</button>
            </>
          ) : (
            <Link to="/admin/login" className="btn btn-ghost btn-sm"
              style={{ color:"rgba(255,255,255,.42)", fontSize:".71rem" }}>Admin</Link>
          )}
        </div> */}

        {/* Hamburger (mobile) */}
        <button className={`nb-ham${open ? " open" : ""}`} aria-label="Menu"
          onClick={() => setOpen(o => !o)}>
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile drawer */}
      <div className={`nb-drawer${open ? " open" : ""}`}
        onClick={e => e.target === e.currentTarget && setOpen(false)}>
        {LINKS.map(l => (
          <Link key={l.to} to={l.to} className={dlnk(l.to)}>
            <span className="ico">{l.icon}</span>{l.label}
          </Link>
        ))}
        {/* <hr className="nb-div" /> */}
        {/* {admin ? (
          <>
            <Link to="/admin" className="nb-dl">
              <span className="ico">🛡</span>{admin.username}
              <span style={{ fontSize:".62rem", color:"var(--gold)", marginLeft:6 }}>ADMIN</span>
            </Link>
            <button className="nb-dl"
              onClick={() => { onAdminLogout(); navigate("/"); setOpen(false); }}>
              <span className="ico">🚪</span>Logout
            </button>
          </>
        ) : (
          <Link to="/admin/login" className="nb-dl">
            <span className="ico">🔐</span>Admin Login
          </Link>
        )} */}
        <hr className="nb-div" />
        <Link to="/about"          className="nb-dl"><span className="ico">ℹ️</span>About Us</Link>
        <Link to="/privacy-policy" className="nb-dl"><span className="ico">📋</span>Privacy Policy</Link>
        <Link to="/contact"        className="nb-dl"><span className="ico">✉️</span>Contact Us</Link>
      </div>
    </>
  );
}