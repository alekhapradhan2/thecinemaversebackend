import SEO, { staticSEO } from "../components/SEO";
import { moviePath, slugify } from "../utils/slugs";
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";
import { Cache } from "../api/cache";

// ── Helpers ───────────────────────────────────────────────────────
const extractYtId = i => { if(!i)return null; const s=String(i).trim(); const m=s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/); return m?m[1]:(/^[A-Za-z0-9_-]{11}$/.test(s)?s:null); };
const ytThumb    = id => { const v=extractYtId(id); return v?`https://img.youtube.com/vi/${v}/mqdefault.jpg`:null; };
const now        = new Date();
const PER_PAGE   = 20;

// ── Shared IO for lazy images ─────────────────────────────────────
const _io = typeof window !== "undefined" ? (() => {
  const cbs = new WeakMap();
  const io  = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { cbs.get(e.target)?.(); cbs.delete(e.target); io.unobserve(e.target); } });
  }, { rootMargin: "300px" });
  io._cbs = cbs; return io;
})() : null;
const obsImg = (el, cb) => { if (!_io || !el) return; _io._cbs.set(el, cb); _io.observe(el); return () => { _io.unobserve(el); _io._cbs.delete(el); }; };

// ─────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────
const CSS = `
@keyframes yt-pulse { 0%,100%{opacity:1} 50%{opacity:.28} }

/* ── Root
   padding-top = navbar height (58px).
   The sticky header sits BELOW the navbar so we DON'T add extra padding here —
   content starts right after the sticky bar. ── */
.yt-root {
  min-height: 100vh;
  background: #0f0f0f;
  padding-top: 58px;   /* clear fixed Navbar only */
  color: #f1f1f1;
  font-family: inherit;
}

/* ── Sticky header — glues just below the Navbar ── */
.yt-header {
  position: sticky;
  top: 58px;            /* sits flush under the 58px Navbar */
  z-index: 99;
  background: #0f0f0f;  /* solid, no transparency — avoids bleed-through */
  border-bottom: 1px solid rgba(255,255,255,.09);
}

/* ── Search row ── */
.yt-srow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
}
@media(min-width:600px){ .yt-srow { padding: 10px 24px; } }
@media(min-width:960px){ .yt-srow { padding: 10px 32px; } }

/* Search pill */
.yt-sbox {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 580px;
  background: #272727;
  border: 1.5px solid rgba(255,255,255,.1);
  border-radius: 24px;
  padding: 0 16px;
  gap: 8px;
  transition: border-color .18s;
}
.yt-sbox:focus-within {
  border-color: rgba(201,151,58,.7);
  background: #303030;
}
.yt-sbox input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #f1f1f1;
  font-size: .86rem;
  padding: 9px 0;
  min-width: 0;
}
.yt-sbox input::placeholder { color: rgba(255,255,255,.3); }
.yt-sico  { color: rgba(255,255,255,.3); font-size: .9rem; flex-shrink: 0; }
.yt-sx    { background: none; border: none; color: rgba(255,255,255,.4); cursor: pointer; font-size: .86rem; padding: 2px; flex-shrink:0; }
.yt-sx:hover { color: #fff; }

/* Song count badge — right of search */
.yt-sinfo {
  font-size: .73rem;
  color: rgba(255,255,255,.38);
  white-space: nowrap;
  flex-shrink: 0;
  display: none;
}
@media(min-width:520px){ .yt-sinfo { display: block; } }

/* ── Chips / filter row ── */
.yt-chips {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 16px 10px;
  overflow-x: auto;
  scrollbar-width: none;
  white-space: nowrap;
}
.yt-chips::-webkit-scrollbar { display: none; }
@media(min-width:600px){ .yt-chips { padding: 0 24px 10px; } }
@media(min-width:960px){ .yt-chips { padding: 0 32px 10px; } }

/* Single chip */
.yt-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #272727;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: 20px;
  padding: 6px 14px;
  font-size: .75rem;
  font-weight: 600;
  color: #f1f1f1;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  transition: background .15s, border-color .15s;
  user-select: none;
}
.yt-chip:hover { background: #3a3a3a; }
/* Active filter chip — white filled (YouTube style) */
.yt-chip.on {
  background: #f1f1f1;
  color: #0f0f0f;
  border-color: #f1f1f1;
  font-weight: 700;
}
.yt-chip.on:hover { background: #ddd; }
/* Active tab chip — gold tint */
.yt-chip.tab.on {
  background: rgba(201,151,58,.16);
  color: #c9973a;
  border-color: rgba(201,151,58,.5);
}
/* Invisible <select> overlay on Year chip */
.yt-chip select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  font-size: 1rem; /* prevents iOS zoom */
}
/* × button inside chip */
.yt-cx {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: .68rem;
  padding: 0;
  line-height: 1;
  opacity: .7;
  flex-shrink: 0;
}
.yt-cx:hover { opacity: 1; }
/* Thin vertical divider between filter chips and tab chips */
.yt-chip-div {
  width: 1px;
  height: 22px;
  background: rgba(255,255,255,.12);
  flex-shrink: 0;
  margin: 0 2px;
}

/* ── Content area ── */
.yt-content {
  padding: 16px 16px 80px;
}
@media(min-width:600px){ .yt-content { padding: 18px 24px 80px; } }
@media(min-width:960px){ .yt-content { padding: 20px 32px 80px; } }

/* Result info text */
.yt-rinfo {
  font-size: .75rem;
  color: rgba(255,255,255,.38);
  margin-bottom: 16px;
}

/* ── Section header ── */
.yt-sec { margin-bottom: 36px; }
.yt-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.yt-sec-title {
  font-size: .94rem;
  font-weight: 700;
  color: #f1f1f1;
  margin: 0;
}
@media(min-width:600px){ .yt-sec-title { font-size: 1.02rem; } }
.yt-sec-cnt {
  font-size: .7rem;
  color: rgba(255,255,255,.35);
  margin-left: 6px;
  font-weight: 400;
}
.yt-va {
  font-size: .75rem;
  font-weight: 700;
  color: #3ea6ff;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 2px;
  white-space: nowrap;
  flex-shrink: 0;
}
.yt-va:hover { color: #71bcff; text-decoration: underline; }

/* ── Video grid ── */
.yt-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 10px;
  /* align-items: start ensures each cell is independently sized —
     no cell stretches to match its neighbour's height */
  align-items: start;
}
@media(min-width:480px)  { .yt-grid { grid-template-columns: repeat(3, 1fr); gap: 18px 12px; } }
@media(min-width:768px)  { .yt-grid { grid-template-columns: repeat(4, 1fr); gap: 20px 14px; } }
@media(min-width:1100px) { .yt-grid { grid-template-columns: repeat(5, 1fr); gap: 20px 14px; } }
@media(min-width:1440px) { .yt-grid { grid-template-columns: repeat(6, 1fr); gap: 22px 16px; } }

/* ── Video card
   width:100% + display:block so it never escapes its grid cell ── */
.yt-card {
  cursor: pointer;
  display: block;
  width: 100%;
  /* prevent ANY content inside from overflowing the card */
  overflow: hidden;
}
.yt-card:hover .yt-tw { opacity: .85; }
.yt-card:hover .yt-po { opacity: 1; }
.yt-card:hover .yt-ct { color: #3ea6ff; }

/* ── Thumbnail container
   KEY FIXES:
   1. width:100%  — fills its grid column exactly
   2. aspect-ratio:16/9  — locks height relative to width
   3. overflow:hidden  — clips anything that escapes
   4. display:block  — no inline gap below
   The img inside is ALWAYS forced to fill this container via object-fit:cover,
   regardless of the YouTube thumbnail's actual pixel dimensions (320×180,
   480×360, 1280×720 etc.) ── */
.yt-tw {
  position: relative;
  display: block;
  width: 100%;
  /* Enforce strict 16:9 — YouTube mqdefault is 320×180 which is exactly 16:9,
     but hqdefault/maxres can vary. aspect-ratio + overflow:hidden locks it. */
  aspect-ratio: 16 / 9;
  background: #272727;
  border-radius: 10px;
  overflow: hidden;
  transition: opacity .16s;
  /* contain prevents the img from influencing parent layout */
  contain: layout paint;
}
.yt-tw img {
  /* Absolutely fill the container — image size is irrelevant */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  /* Don't let the image affect layout flow */
  pointer-events: none;
}
/* Play overlay */
.yt-po {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.3);
  opacity: 0;
  transition: opacity .16s;
}
.yt-pc {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(0,0,0,.7);
  border: 2px solid rgba(255,255,255,.7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
}
/* YouTube badge */
.yt-badge {
  position: absolute;
  bottom: 6px;
  right: 7px;
  background: rgba(0,0,0,.82);
  color: #f1f1f1;
  font-size: .58rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: .02em;
}
.yt-novid {
  position: absolute;
  bottom: 6px;
  left: 7px;
  background: rgba(160,0,0,.85);
  color: #fff;
  font-size: .56rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
}

/* ── Card metadata row
   Fixed height so ALL cards in the same row are identical height.
   Text clamps strictly — never pushes the card taller. ── */
.yt-cm {
  display: flex;
  gap: 8px;
  padding: 8px 2px 0;
  /* Fixed height: avatar (32px) + padding = metadata never grows */
  min-height: 72px;
  align-items: flex-start;
}
/* Channel avatar — fixed square, never resizes */
.yt-av {
  width: 32px;
  height: 32px;
  min-width: 32px;   /* prevent flex-shrink collapsing it */
  border-radius: 50%;
  background: #1c3040;
  border: 1.5px solid rgba(62,166,255,.28);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .74rem;
  font-weight: 700;
  color: #3ea6ff;
  flex-shrink: 0;
  overflow: hidden;
}
.yt-av img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.yt-ci {
  flex: 1;
  min-width: 0;   /* allow text to truncate inside flex */
  overflow: hidden;
}
/* Title — hard 2-line clamp, never wraps to 3+ lines */
.yt-ct {
  margin: 0;
  font-size: .78rem;
  font-weight: 600;
  color: #f1f1f1;
  line-height: 1.36;
  /* Clamp strictly to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Fixed 2-line height so all title areas are same size */
  max-height: calc(1.36em * 2);
  transition: color .15s;
  word-break: break-word;
}
@media(min-width:600px){ .yt-ct { font-size: .81rem; } }
/* Singer line — single line, truncates */
.yt-ch {
  margin: 3px 0 0;
  font-size: .69rem;
  color: rgba(255,255,255,.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
/* Movie + year — single line, truncates */
.yt-cs {
  margin: 1px 0 0;
  font-size: .65rem;
  color: rgba(255,255,255,.28);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* ── Skeleton ── */
.sk-tw {
  aspect-ratio: 16 / 9;
  background: #272727;
  border-radius: 10px;
  animation: yt-pulse 1.4s ease-in-out infinite;
}
.sk-ln {
  height: 10px;
  background: #272727;
  border-radius: 4px;
  animation: yt-pulse 1.4s ease-in-out infinite;
}

/* ── Load more ── */
.yt-more { display: flex; justify-content: center; padding: 24px 0; }
.yt-more-btn {
  padding: 10px 30px;
  background: #272727;
  border: 1px solid rgba(255,255,255,.15);
  color: #f1f1f1;
  border-radius: 20px;
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background .16s;
}
.yt-more-btn:hover { background: #3a3a3a; }

/* ── Empty ── */
.yt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 20px;
  color: rgba(255,255,255,.32);
  gap: 10px;
  text-align: center;
}
.yt-empty span { font-size: 3rem; }
.yt-empty p    { font-size: .85rem; margin: 0; }
`;

// ─────────────────────────────────────────────────────────────────
// LazyImg — absolutely fills its container; never breaks layout
// ─────────────────────────────────────────────────────────────────
function LazyImg({ src, alt }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!src || !ref.current) return;
    return obsImg(ref.current, () => { if (ref.current) ref.current.src = src; });
  }, [src]);
  if (!src) return null;
  return (
    <img
      ref={ref}
      alt={alt || ""}
      decoding="async"
      loading="lazy"
      width="320"
      height="180"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "center",
        display: "block",
        opacity: 0,
        transition: "opacity .22s",
      }}
      onLoad={e  => { e.target.style.opacity = "1"; }}
      onError={e => { e.target.style.opacity = ".08"; }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// VideoCard — strict 16:9 thumbnail + fixed-height metadata
// ─────────────────────────────────────────────────────────────────
const VideoCard = React.memo(function VideoCard({ song, onClick }) {
  const thumb   = song.thumbnailUrl || ytThumb(song.ytId) || song.moviePoster || "";
  const initial = (song.singer || song.movieTitle || "?")[0]?.toUpperCase();
  return (
    <div className="yt-card" onClick={onClick}>
      {/* Thumbnail — aspect-ratio:16/9 container, image fills via object-fit:cover */}
      <div className="yt-tw">
        <LazyImg src={thumb} alt={song.title} />
        <div className="yt-po"><div className="yt-pc">▶</div></div>
        {song.ytId  && <span className="yt-badge">YouTube</span>}
        {!song.ytId && <span className="yt-novid">No video</span>}
      </div>
      {/* Metadata — fixed min-height so all cards are same total height */}
      <div className="yt-cm">
        <div className="yt-av">
          {song.moviePoster
            ? <img
                src={song.moviePoster}
                alt={song.movieTitle || ""}
                width="32"
                height="32"
                style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
              />
            : <span style={{ fontSize:".74rem", fontWeight:700 }}>{initial}</span>}
        </div>
        <div className="yt-ci">
          <p className="yt-ct">{song.title || "Untitled"}</p>
          {song.singer     && <p className="yt-ch">🎤 {song.singer}</p>}
          {song.movieTitle && <p className="yt-cs">{song.movieTitle}{song.movieYear ? ` · ${song.movieYear}` : ""}</p>}
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────
// SkeletonGrid
// ─────────────────────────────────────────────────────────────────
function SkGrid({ n = 10 }) {
  return (
    <div className="yt-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i}>
          <div className="sk-tw" style={{ animationDelay:`${i*.06}s` }} />
          <div style={{ display:"flex", gap:8, padding:"7px 1px 2px" }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:"#272727", flexShrink:0, animation:"yt-pulse 1.4s ease-in-out infinite" }} />
            <div style={{ flex:1 }}>
              <div className="sk-ln" style={{ width:"88%", marginBottom:5, animationDelay:`${i*.06+.08}s` }} />
              <div className="sk-ln" style={{ width:"55%", animationDelay:`${i*.06+.16}s` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Section — lazy-renders its grid only when scrolled into view
// ─────────────────────────────────────────────────────────────────
function Section({ icon, title, songs, total, onSongClick, onViewAll }) {
  const sentRef = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = sentRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); io.disconnect(); }
    }, { rootMargin: "120px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  if (!songs.length) return null;
  const shown = songs.slice(0, PER_PAGE);
  return (
    <div className="yt-sec" ref={sentRef}>
      <div className="yt-sec-head">
        <h2 className="yt-sec-title">
          {icon} {title}
          <span className="yt-sec-cnt">
            {total > PER_PAGE ? `${PER_PAGE} of ${total}` : total}
          </span>
        </h2>
        {total > PER_PAGE && onViewAll && (
          <button className="yt-va" onClick={onViewAll}>View all →</button>
        )}
      </div>
      {vis ? (
        <div className="yt-grid">
          {shown.map((s, i) => (
            <VideoCard key={i} song={s} onClick={() => s.ytId && onSongClick(s)} />
          ))}
        </div>
      ) : (
        <SkGrid n={8} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
export default function AllSongs() {
  const navigate = useNavigate();
  const [movies,  setMovies]  = useState(() => Cache.peek("movies") || []);
  const [loading, setLoading] = useState(() => Cache.peek("movies") === null);

  // Filters
  const [search,  setSearch]  = useState("");
  const [fYear,   setFYear]   = useState("");

  // Pagination (filter mode)
  const [page, setPage] = useState(1);

  // Browse tab
  const [tab, setTab] = useState("recent");

  const isFiltering = !!(search.trim() || fYear);

  useEffect(() => {
    if (Cache.peek("movies") !== null) return;
    Cache.getMovies().catch(() => []).then(m => { setMovies(m); setLoading(false); });
  }, []);

  useEffect(() => { setPage(1); }, [search, fYear, tab]);

  // Build flat song list once
  const allSongs = useMemo(() => {
    const list = [];
    movies.forEach(m => {
      const year = m.releaseDate ? new Date(m.releaseDate).getFullYear() : null;
      (m.media?.songs || []).forEach((s, idx) => {
        list.push({
          ...s,
          songIndex:   idx,
          movieId:     String(m._id),
          movieTitle:  m.title,
          movieYear:   year ? String(year) : "",
          moviePoster: m.posterUrl || m.thumbnailUrl || "",
          releaseDate: m.releaseDate || "",
          verdict:     m.verdict || "",
          _slug:       moviePath(m),
        });
      });
    });
    return list;
  }, [movies]);

  // Option lists — Year only
  const years = useMemo(() => [...new Set(allSongs.map(s => s.movieYear).filter(Boolean))].sort((a, b) => b - a), [allSongs]);

  // Filtered list
  const filtered = useMemo(() => {
    let base = allSongs;
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.singer?.toLowerCase().includes(q) ||
        s.musicDirector?.toLowerCase().includes(q) ||
        s.lyricist?.toLowerCase().includes(q) ||
        s.movieTitle?.toLowerCase().includes(q)
      );
    }
    if (fYear) base = base.filter(s => s.movieYear === fYear);
    return base;
  }, [allSongs, search, fYear]);

  // Browse sections
  const recent   = useMemo(() => allSongs.filter(s => { if(!s.releaseDate)return false; const d=new Date(s.releaseDate); return d<=now&&d>=new Date(now.getFullYear()-2,now.getMonth(),now.getDate()); }).sort((a,b)=>new Date(b.releaseDate)-new Date(a.releaseDate)), [allSongs]);
  const upcoming = useMemo(() => allSongs.filter(s => { const v=s.verdict; return !v||v==="Upcoming"||(s.releaseDate&&new Date(s.releaseDate)>now); }).sort((a,b)=>new Date(a.releaseDate||"2099")-new Date(b.releaseDate||"2099")), [allSongs]);
  const old      = useMemo(() => allSongs.filter(s => { if(!s.releaseDate)return false; const yr=new Date(s.releaseDate).getFullYear(); return yr>=now.getFullYear()-10&&yr<now.getFullYear()-2; }).sort((a,b)=>new Date(b.releaseDate)-new Date(a.releaseDate)), [allSongs]);
  const classic  = useMemo(() => allSongs.filter(s => s.releaseDate&&new Date(s.releaseDate).getFullYear()<now.getFullYear()-10).sort((a,b)=>new Date(b.releaseDate)-new Date(a.releaseDate)), [allSongs]);

  const recentYrs  = useMemo(() => [...new Set(recent.map(s=>s.movieYear).filter(Boolean))].slice(0,4),  [recent]);
  const oldYrs     = useMemo(() => [...new Set(old.map(s=>s.movieYear).filter(Boolean))].slice(0,6),     [old]);
  const classicYrs = useMemo(() => [...new Set(classic.map(s=>s.movieYear).filter(Boolean))].slice(0,8), [classic]);

  const handleClick = useCallback(s => {
    const idx = typeof s.songIndex === "number" && !isNaN(s.songIndex) ? s.songIndex : 0;
    // Build movie slug from _slug (/movie/bindusagar-2026 → bindusagar-2026)
    const movieSlug = s._slug ? s._slug.replace(/^\/movie\//, "") : s.movieId;
    navigate(`/song/${movieSlug}/${idx}/${slugify(s.title || "")}-odia-song`);
  }, [navigate]);

  const shownF  = filtered.slice(0, page * PER_PAGE);
  const hasMore = shownF.length < filtered.length;

  const TABS = [
    { key:"recent",   label:"Recent",      count:recent.length },
    { key:"upcoming", label:"Upcoming",    count:upcoming.length },
    { key:"old",      label:"Old",         count:old.length },
    { key:"classic",  label:"Old is Gold", count:classic.length },
  ].filter(t => t.count > 0);

  const clearAll = () => { setSearch(""); setFYear(""); };

  return (
    <div className="yt-root">
      <SEO {...staticSEO.songs} />
      <style>{CSS}</style>

      {/* ══ STICKY HEADER ══ */}
      <div className="yt-header">

        {/* Search row */}
        <div className="yt-srow">
          <div className="yt-sbox">
            <span className="yt-sico">🔍</span>
            <input
              placeholder="Search songs, singers, movies…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search && <button className="yt-sx" onClick={() => setSearch("")}>✕</button>}
          </div>
          <span className="yt-sinfo">🎵 {allSongs.length.toLocaleString()} songs · {movies.length} movies</span>
        </div>

        {/* Chips row: Year filter + tab chips */}
        <div className="yt-chips">

          {/* ── Year chip ── */}
          <div className={`yt-chip${fYear ? " on" : ""}`}>
            {fYear ? (
              <>{fYear} <button className="yt-cx" onClick={() => setFYear("")}>✕</button></>
            ) : (
              <>📅 Year
                <select value={fYear} onChange={e => setFYear(e.target.value)} title="Filter by year">
                  <option value="">All Years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            )}
          </div>

          {/* Clear all chip — only when year is active */}
          {fYear && (
            <div className="yt-chip" onClick={clearAll}
              style={{ color:"#ff6b6b", borderColor:"rgba(255,107,107,.3)", background:"rgba(255,107,107,.07)" }}>
              ✕ Clear
            </div>
          )}

          {/* Divider + tab chips (hidden when filtering) */}
          {!isFiltering && TABS.length > 0 && (
            <>
              <div className="yt-chip-div" />
              {TABS.map(t => (
                <div key={t.key} className={`yt-chip tab${tab === t.key ? " on" : ""}`}
                  onClick={() => setTab(t.key)}>
                  {t.label}
                  <span style={{ fontSize:".62rem", opacity:.5, marginLeft:3 }}>{t.count}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {/* ══ END HEADER ══ */}

      {/* ══ CONTENT ══ */}
      <div className="yt-content">

        {/* Loading */}
        {loading && <SkGrid n={12} />}

        {/* ── Filter / search results ── */}
        {!loading && isFiltering && (
          <>
            <p className="yt-rinfo">
              {filtered.length === 0 ? "No results" : `${filtered.length.toLocaleString()} result${filtered.length!==1?"s":""}`}
              {fYear && <> · Year: <strong style={{color:"#f1f1f1"}}>{fYear}</strong></>}
            </p>

            {filtered.length === 0 ? (
              <div className="yt-empty">
                <span>🎵</span>
                <p>No songs match your filters.</p>
                <button className="yt-more-btn" style={{marginTop:8}} onClick={clearAll}>Clear filters</button>
              </div>
            ) : (
              <>
                <div className="yt-grid">
                  {shownF.map((s, i) => (
                    <VideoCard key={i} song={s} onClick={() => s.ytId && handleClick(s)} />
                  ))}
                </div>
                {hasMore && (
                  <div className="yt-more">
                    <button className="yt-more-btn" onClick={() => setPage(p => p + 1)}>
                      Load more · {filtered.length - shownF.length} remaining
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Browse mode ── */}
        {!loading && !isFiltering && (
          <>
            {tab === "recent" && (
              <>
                <Section icon="🆕" title="Recent Songs"   songs={recent}   total={recent.length}   onSongClick={handleClick} onViewAll={() => setFYear(String(now.getFullYear()))} />
                {recentYrs.map(yr => { const ys=recent.filter(s=>s.movieYear===yr); return ys.length ? <Section key={yr} icon="📅" title={`${yr} Songs`} songs={ys} total={ys.length} onSongClick={handleClick} onViewAll={()=>setFYear(yr)} /> : null; })}
              </>
            )}
            {tab === "upcoming" && (
              <Section icon="🚀" title="Upcoming Songs" songs={upcoming} total={upcoming.length} onSongClick={handleClick} />
            )}
            {tab === "old" && (
              <>
                <Section icon="📀" title="Old Songs" songs={old} total={old.length} onSongClick={handleClick} />
                {oldYrs.map(yr => { const ys=old.filter(s=>s.movieYear===yr); return ys.length ? <Section key={yr} icon="📅" title={`${yr} Songs`} songs={ys} total={ys.length} onSongClick={handleClick} onViewAll={()=>setFYear(yr)} /> : null; })}
              </>
            )}
            {tab === "classic" && (
              <>
                <Section icon="🏆" title="Old is Gold" songs={classic} total={classic.length} onSongClick={handleClick} />
                {classicYrs.map(yr => { const ys=classic.filter(s=>s.movieYear===yr); return ys.length ? <Section key={yr} icon="🎵" title={`${yr} Songs`} songs={ys} total={ys.length} onSongClick={handleClick} onViewAll={()=>setFYear(yr)} /> : null; })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}