import SEO, { songDetailSEO } from "../components/SEO";
import { extractId, moviePath, songPath, castPath } from "../utils/slugs";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { API } from "../api/api";
import { Cache } from "../api/cache";

const extractYtId = (input) => {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
};
const ytThumb = (id) => id ? `https://img.youtube.com/vi/${extractYtId(id)||id}/mqdefault.jpg` : null;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";
const firstToken = (str) => (str||"").split(/[,&\/]/)[0].trim().toLowerCase();

const CSS = `
/* ─ Song detail page ─ */
.sd-root { min-height:100vh; background:var(--bg); padding-top:58px; }
.sd-hero {
  position:relative; background:#0a0a0a; overflow:hidden;
  padding: 16px 0 0;
}
.sd-hero-bg {
  position:absolute; inset:0; background-size:cover; background-position:center;
  filter:blur(22px) brightness(.16); transform:scale(1.06);
}
.sd-hero-overlay {
  position:absolute; inset:0;
  background:linear-gradient(to bottom, rgba(0,0,0,.5) 0%, rgba(10,10,10,.98) 100%);
}
.sd-back {
  position:relative; z-index:3; padding:0 16px 8px;
}
@media(min-width:480px){ .sd-back { padding:0 24px 10px; } }
@media(min-width:768px){ .sd-back { padding:0 40px 10px; } }
.sd-back button {
  background:none; border:none; color:rgba(255,255,255,.55); cursor:pointer;
  font-size:.8rem; font-weight:600; padding:6px 0; display:flex; align-items:center; gap:5px;
  transition:color .18s;
}
.sd-back button:hover { color:var(--gold); }
/* Main grid: single col mobile, 2-col desktop */
.sd-grid {
  position:relative; z-index:3;
  display:grid;
  grid-template-columns:1fr;
  gap:16px;
  padding:0 16px 32px;
  max-width:1380px;
}
@media(min-width:480px){ .sd-grid { padding:0 20px 36px; gap:18px; } }
@media(min-width:900px){
  .sd-grid {
    grid-template-columns:1fr 290px;
    gap:24px;
    padding:0 32px 48px;
  }
}
@media(min-width:1100px){
  .sd-grid { grid-template-columns:1fr 310px; padding:0 44px 52px; }
}
/* Player */
.sd-player {
  border-radius:10px; overflow:hidden;
  box-shadow:0 16px 50px rgba(0,0,0,.7);
  background:#000; aspect-ratio:16/9; margin-bottom:16px;
}
.sd-player iframe { width:100%; height:100%; border:none; display:block; }
/* Info card */
.sd-info-card {
  background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
  border-radius:12px; padding:16px; margin-bottom:16px;
}
@media(min-width:480px){ .sd-info-card { padding:18px 20px; } }
.sd-badges { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
.sd-song-title {
  font-family:'Playfair Display',serif;
  font-size:clamp(1.2rem,4vw,1.9rem); font-weight:900; margin:0 0 12px; line-height:1.15;
}
.sd-meta-row {
  display:flex; gap:8px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.05);
  align-items:center;
}
.sd-meta-label {
  font-size:.64rem; font-weight:700; color:var(--muted); text-transform:uppercase;
  letter-spacing:.08em; width:82px; flex-shrink:0;
}
.sd-meta-val { font-size:.84rem; flex:1; min-width:0; }
/* Playlist box */
.sd-playlist-box {
  background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
  border-radius:10px; overflow:hidden;
}
.sd-playlist-header {
  padding:10px 14px; border-bottom:1px solid rgba(255,255,255,.07);
  font-size:.62rem; font-weight:800; letter-spacing:.11em; text-transform:uppercase; color:var(--muted);
}
/* Sidebar — sticky on desktop */
.sd-sidebar {
  background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.07);
  border-radius:12px; overflow:hidden;
  /* On mobile: not sticky */
}
@media(min-width:900px){
  .sd-sidebar {
    position:sticky; top:70px; align-self:start;
    max-height:calc(100vh - 90px);
    display:flex; flex-direction:column;
  }
}
.sd-sidebar-head {
  padding:12px 14px 10px; border-bottom:1px solid rgba(255,255,255,.07); flex-shrink:0;
}
.sd-sidebar-list { overflow-y:auto; flex:1; padding:6px; }
.sd-sidebar-footer { padding:10px 14px; border-top:1px solid rgba(255,255,255,.07); flex-shrink:0; }
/* Song item */
.sd-song-item {
  display:flex; gap:8px; align-items:center; padding:8px 10px;
  border-radius:7px; cursor:pointer; border:1px solid transparent;
  transition:background .14s;
}
.sd-song-item.active { background:rgba(201,151,58,.1); border-color:rgba(201,151,58,.28); }
.sd-song-item:not(.active):hover { background:rgba(255,255,255,.05); }
.sd-song-thumb {
  flex-shrink:0; width:50px; height:34px; border-radius:4px;
  overflow:hidden; background:var(--bg3); position:relative;
}
.sd-song-thumb img { width:100%; height:100%; object-fit:cover; }
.sd-song-icon {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:.75rem; font-weight:700;
}
.sd-song-name { font-weight:600; font-size:.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sd-song-singer { font-size:.66rem; color:var(--muted); margin-top:1px; }
/* Sections below */
.sd-sections { padding:28px 0 60px; background:var(--bg); }
.sd-section { margin-bottom:8px; }
.sd-sec-head { display:flex; align-items:center; justify-content:space-between; padding:0 16px; margin-bottom:10px; }
@media(min-width:480px){ .sd-sec-head { padding:0 20px; } }
@media(min-width:768px){ .sd-sec-head { padding:0 28px; } }
.sd-sec-title { margin:0; font-size:.88rem; font-weight:800; }
@media(min-width:480px){ .sd-sec-title { font-size:.96rem; } }
.sd-hrow { display:flex; gap:10px; overflow-x:auto; padding:4px 16px 10px; scrollbar-width:none; }
@media(min-width:480px){ .sd-hrow { gap:12px; padding:4px 20px 12px; } }
@media(min-width:768px){ .sd-hrow { gap:14px; padding:4px 28px 14px; } }
.sd-hrow::-webkit-scrollbar { display:none; }
.sd-sc { flex-shrink:0; width:128px; cursor:pointer; transition:transform .22s; }
@media(min-width:480px){ .sd-sc { width:142px; } }
.sd-sc:hover { transform:translateY(-4px); }
.sd-sc:hover .sd-sc-img { box-shadow:0 12px 30px rgba(0,0,0,.6); border-color:rgba(201,151,58,.4); }
.sd-sc:hover .sd-sc-title { color:var(--gold); }
.sd-sc-img { position:relative; border-radius:9px; overflow:hidden; aspect-ratio:1/1; background:var(--bg3); box-shadow:0 3px 10px rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.06); transition:box-shadow .22s; }
.sd-sc-img img { width:100%; height:100%; object-fit:cover; display:block; }
.sd-sc-title { margin:0; font-weight:700; font-size:.72rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); transition:color .2s; margin-top:6px; }
.sd-sc-sub { margin:2px 0 0; font-size:.6rem; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sd-arr { width:26px; height:26px; border-radius:50%; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05); color:var(--text); cursor:pointer; font-size:.95rem; display:flex; align-items:center; justify-content:center; transition:all .2s; flex-shrink:0; }
.sd-arr:hover { border-color:rgba(201,151,58,.4); color:var(--gold); }
@media(max-width:400px){ .sd-arr { display:none; } }
/* Movie cards in sd */
.sd-mc { flex-shrink:0; width:120px; cursor:pointer; transition:transform .22s; }
@media(min-width:480px){ .sd-mc { width:134px; } }
.sd-mc:hover { transform:translateY(-5px); }
.sd-mc-box { position:relative; border-radius:9px; overflow:hidden; aspect-ratio:2/3; background:var(--bg3); box-shadow:0 3px 12px rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.06); }
.sd-mc-box img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
.sd-mc-title { margin:6px 0 0; font-weight:700; font-size:.7rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); }
/* Lyrics */
.sd-tabs { display:flex; border-bottom:1px solid rgba(255,255,255,.08); flex-shrink:0; }
.sd-tab { flex:1; padding:9px 0; text-align:center; font-size:.7rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; background:none; border:none; cursor:pointer; color:var(--muted); border-bottom:2px solid transparent; transition:all .15s; }
.sd-tab.active { color:var(--gold); border-bottom-color:var(--gold); }
.sd-lyrics-wrap { overflow-y:auto; flex:1; padding:12px 14px 20px; scroll-behavior:smooth; }
.sd-lyric-line { padding:5px 8px; border-radius:5px; font-size:.82rem; line-height:1.7; color:rgba(255,255,255,.45); transition:all .3s; cursor:default; white-space:pre-wrap; }
.sd-lyric-line.active { color:#fff; font-weight:700; font-size:.9rem; background:rgba(201,151,58,.12); border-left:3px solid var(--gold); padding-left:10px; }
.sd-lyric-line.passed { color:rgba(255,255,255,.3); }
.sd-no-lyrics { padding:32px 16px; text-align:center; color:var(--muted); font-size:.8rem; line-height:1.8; }
/* Repeat / Queue */
.sd-ctrl-btn { background:none; border:none; cursor:pointer; color:var(--muted); font-size:.8rem; padding:5px 9px; border-radius:7px; transition:all .15s; display:inline-flex; align-items:center; gap:4px; font-family:inherit; }
.sd-ctrl-btn:hover { color:var(--text); background:rgba(255,255,255,.06); }
.sd-ctrl-btn.on { color:var(--gold); background:rgba(201,151,58,.12); }
/* Know this song */
.sd-know-btn { display:inline-flex; align-items:center; gap:7px; padding:8px 18px; border-radius:20px; border:1px solid rgba(255,120,50,.3); background:rgba(255,120,50,.07); color:rgba(255,150,80,.85); font-size:.8rem; font-weight:700; cursor:pointer; transition:all .2s; font-family:inherit; }
.sd-know-btn:hover,.sd-know-btn.voted { background:rgba(255,120,50,.18); border-color:rgba(255,120,50,.5); color:#ff9450; transform:scale(1.03); }
/* Breadcrumb */
.sd-breadcrumb { display:flex; align-items:center; gap:5px; flex-wrap:wrap; font-size:.71rem; color:var(--muted); padding:6px 0 2px; }
.sd-breadcrumb span { cursor:pointer; transition:color .15s; }
.sd-breadcrumb span:hover { color:var(--gold); }
.sd-breadcrumb .sep { opacity:.35; cursor:default; }
.sd-breadcrumb .cur { color:var(--text); font-weight:600; cursor:default; }
/* Queue panel */
.sd-queue-wrap { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); border-radius:10px; overflow:hidden; margin-top:12px; }
.sd-queue-head { display:flex; align-items:center; justify-content:space-between; padding:9px 13px; border-bottom:1px solid rgba(255,255,255,.06); font-size:.62rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
/* ── Now Playing Bar ── */
.sd-now-playing {
  position:fixed; bottom:0; left:0; right:0; z-index:200;
  background:linear-gradient(to right, rgba(10,10,10,.97), rgba(20,16,8,.97));
  border-top:1px solid rgba(201,151,58,.25);
  backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  display:flex; align-items:center; gap:12px;
  padding:10px 16px; transform:translateY(100%);
  transition:transform .35s cubic-bezier(.34,1.56,.64,1);
}
@media(min-width:480px){ .sd-now-playing { padding:10px 24px; gap:16px; } }
.sd-now-playing.visible { transform:translateY(0); }
.sd-np-thumb { width:40px; height:40px; border-radius:6px; overflow:hidden; flex-shrink:0; background:var(--bg3); border:1px solid rgba(201,151,58,.3); }
.sd-np-thumb img { width:100%; height:100%; object-fit:cover; }
.sd-np-info { flex:1; min-width:0; }
.sd-np-title { font-weight:700; font-size:.82rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fff; }
.sd-np-singer { font-size:.68rem; color:var(--gold); margin-top:1px; }
.sd-np-btn { width:36px; height:36px; border-radius:50%; background:var(--gold); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:.9rem; color:#000; flex-shrink:0; transition:transform .15s; }
.sd-np-btn:hover { transform:scale(1.1); }
.sd-np-skip { background:rgba(255,255,255,.1); color:#fff; }
.sd-np-skip:hover { background:rgba(255,255,255,.2); }
.sd-rating { display:flex; align-items:center; gap:6px; padding:10px 0 4px; }
.sd-star { font-size:1.3rem; cursor:pointer; transition:transform .15s; filter:grayscale(1) opacity(.35); user-select:none; }
.sd-star:hover,.sd-star.lit { filter:none; }
.sd-star:hover { transform:scale(1.2); }
.sd-rating-info { font-size:.74rem; color:var(--muted); margin-left:4px; }
.sd-share-overlay { position:fixed; inset:0; z-index:300; background:rgba(0,0,0,.85); display:flex; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(8px); }
.sd-share-card { background:linear-gradient(145deg,#1a1200,#0f0a00,#0a0a0a); border:1px solid rgba(201,151,58,.45); border-radius:20px; width:100%; max-width:360px; overflow:hidden; }
.sd-share-card-img { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; }
.sd-share-card-body { padding:18px 20px 20px; }
.sd-share-card-eyebrow { font-size:.58rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); margin-bottom:6px; }
.sd-share-card-title { font-family:"Playfair Display",serif; font-size:1.4rem; font-weight:900; line-height:1.2; margin:0 0 5px; }
.sd-share-card-meta { font-size:.76rem; color:rgba(255,255,255,.55); margin-bottom:14px; }
.sd-share-card-footer { display:flex; align-items:center; gap:10px; border-top:1px solid rgba(255,255,255,.08); padding-top:12px; }
.sd-share-card-watermark { margin-left:auto; font-size:.62rem; font-weight:800; letter-spacing:.08em; color:rgba(201,151,58,.6); }
.sd-autoplay-row { display:flex; align-items:center; gap:8px; padding:8px 0; font-size:.74rem; color:var(--muted); cursor:pointer; user-select:none; }
.sd-autoplay-row.on { color:var(--gold); }
.sd-autoplay-pill { width:30px; height:17px; border-radius:9px; background:rgba(255,255,255,.15); position:relative; transition:background .2s; flex-shrink:0; }
.sd-autoplay-row.on .sd-autoplay-pill { background:var(--gold); }
.sd-autoplay-pill::after { content:""; position:absolute; top:2.5px; left:3px; width:12px; height:12px; border-radius:50%; background:#fff; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.3); }
.sd-autoplay-row.on .sd-autoplay-pill::after { transform:translateX(13px); }
.sd-spotify-card { flex-shrink:0; width:156px; cursor:pointer; transition:transform .2s; }
@media(min-width:480px){ .sd-spotify-card { width:168px; } }
.sd-spotify-card:hover { transform:translateY(-4px); }
.sd-spotify-img { width:100%; aspect-ratio:1/1; border-radius:10px; overflow:hidden; background:var(--bg3); box-shadow:0 4px 14px rgba(0,0,0,.4); position:relative; margin-bottom:8px; transition:box-shadow .2s; }
.sd-spotify-card:hover .sd-spotify-img { box-shadow:0 12px 32px rgba(0,0,0,.7); }
.sd-spotify-img img { width:100%; height:100%; object-fit:cover; display:block; }
.sd-spotify-play-btn { position:absolute; bottom:8px; right:8px; width:36px; height:36px; border-radius:50%; background:var(--gold); display:flex; align-items:center; justify-content:center; font-size:.85rem; color:#000; box-shadow:0 4px 14px rgba(0,0,0,.5); opacity:0; transform:translateY(6px); transition:all .2s; }
.sd-spotify-card:hover .sd-spotify-play-btn { opacity:1; transform:translateY(0); }
.sd-spotify-title { font-weight:700; font-size:.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); }
.sd-spotify-sub { font-size:.64rem; color:var(--muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;

// ── LRC parser: "[mm:ss.xx] line" → [{time, text}] ──────────────
function parseLRC(raw = "") {
  if (!raw.trim()) return [];
  const lines = raw.split("\n");
  const parsed = [];
  const timeRe = /\[(\d{1,2}):(\d{2})(?:[.:]\d+)?\]/g;
  lines.forEach(line => {
    const text = line.replace(/\[\d{1,2}:\d{2}(?:[.:]\d+)?\]/g, "").trim();
    let m;
    timeRe.lastIndex = 0;
    while ((m = timeRe.exec(line)) !== null) {
      const secs = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      if (text) parsed.push({ time: secs, text });
    }
  });
  // If no timestamps found, treat as plain text
  if (parsed.length === 0 && raw.trim()) {
    return raw.split("\n").map((text, i) => ({ time: null, text }));
  }
  return parsed.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

// ── Lyrics panel with auto-scroll sync ───────────────────────────
function LyricsPanel({ lyrics, currentTime }) {
  const lines   = React.useMemo(() => parseLRC(lyrics || ""), [lyrics]);
  const wrapRef = useRef(null);
  const isLRC   = lines.some(l => l.time !== null);

  // Find active line index
  const activeIdx = React.useMemo(() => {
    if (!isLRC || currentTime == null) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lines, currentTime, isLRC]);

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeIdx < 0 || !wrapRef.current) return;
    const el = wrapRef.current.children[activeIdx];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  if (!lyrics?.trim()) return (
    <div className="sd-no-lyrics">
      <div style={{ fontSize:"1.8rem", marginBottom:8 }}>🎵</div>
      <div>No lyrics available for this song.</div>
      <div style={{ fontSize:".72rem", marginTop:8, opacity:.6 }}>
        Lyrics can be added by the admin.
      </div>
    </div>
  );

  return (
    <div className="sd-lyrics-wrap" ref={wrapRef}>
      {lines.map((line, i) => (
        <div key={i}
          className={
            "sd-lyric-line" +
            (isLRC && i === activeIdx ? " active" : "") +
            (isLRC && i < activeIdx  ? " passed"  : "")
          }
        >
          {line.text || "\u00a0"}
        </div>
      ))}
    </div>
  );
}

// ── Spotify-style song card ──────────────────────────────────────
// ── localStorage helpers ─────────────────────────────────────────
const RECENT_KEY = "op_recent_songs";
function saveRecent(song, movie, idx) {
  if (!song?.title) return;
  try {
    const item = {
      title:song.title, singer:song.singer||"", ytId:song.ytId||"",
      movieTitle:movie?.title||"", movieId:String(movie?._id||""),
      movieSlug:movie?.slug||"", songIdx:idx,
      thumb:song.thumbnailUrl||(song.ytId?`https://img.youtube.com/vi/${song.ytId}/mqdefault.jpg`:""),
      ts:Date.now(),
    };
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY)||"[]")
      .filter(r=>!(r.title===item.title&&r.movieId===item.movieId));
    localStorage.setItem(RECENT_KEY, JSON.stringify([item,...prev].slice(0,20)));
  } catch {}
}
export function getRecentPlayed() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)||"[]"); } catch { return []; }
}
function getKnowData(key) {
  try { return JSON.parse(localStorage.getItem(key)||"{}"); } catch { return {}; }
}

function SpotifyCard({ song, onClick }) {
  const thumb = song.thumbnailUrl || (song.ytId ? ytThumb(song.ytId) : null) || song.moviePoster;
  return (
    <div className="sd-spotify-card" onClick={onClick}>
      <div className="sd-spotify-img">
        {thumb && <img src={thumb} alt={song.title} onError={e=>e.target.style.opacity=".2"}/>}
        {!thumb && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem",color:"var(--muted)"}}>🎵</div>}
        <div className="sd-spotify-play-btn">▶</div>
      </div>
      <div className="sd-spotify-title">{song.title}</div>
      {song.singer && <div className="sd-spotify-sub">🎤 {song.singer}</div>}
      {song.movieTitle && <div className="sd-spotify-sub" style={{color:"rgba(201,151,58,.7)"}}>{song.movieTitle}</div>}
    </div>
  );
}

// ── Share Card modal ──────────────────────────────────────────────
function ShareCardModal({ song, movie, onClose }) {
  const thumb = song.thumbnailUrl || (song.ytId ? `https://img.youtube.com/vi/${song.ytId}/hqdefault.jpg` : null) || movie?.posterUrl;
  const url   = typeof window !== "undefined" ? window.location.href : "";

  const handleCopy = () => {
    navigator.clipboard?.writeText(url).then(() => {
      alert("Link copied!");
    }).catch(() => {
      prompt("Copy this link:", url);
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: song.title, text: `🎵 ${song.title}${song.singer?" — "+song.singer:""}${movie?" | "+movie.title:""}`, url });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="sd-share-overlay" onClick={onClose}>
      <div className="sd-share-card" onClick={e=>e.stopPropagation()}>
        {/* Card image */}
        {thumb
          ? <img src={thumb} alt={song.title} className="sd-share-card-img"/>
          : <div style={{width:"100%",aspectRatio:"16/9",background:"linear-gradient(135deg,#1a1200,#0a0a0a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"3rem"}}>🎵</div>
        }
        <div className="sd-share-card-body">
          <div className="sd-share-card-eyebrow">🎵 Now Playing</div>
          <div className="sd-share-card-title">{song.title}</div>
          <div className="sd-share-card-meta">
            {song.singer && <span>🎤 {song.singer}</span>}
            {song.singer && song.musicDirector && <span style={{margin:"0 6px",opacity:.4}}>·</span>}
            {song.musicDirector && <span>🎼 {song.musicDirector}</span>}
          </div>
          {movie && (
            <div className="sd-share-card-footer">
              {movie.posterUrl && <img src={movie.posterUrl} alt={movie.title} style={{width:32,height:44,objectFit:"cover",borderRadius:4,border:"1px solid rgba(255,255,255,.1)"}} onError={e=>e.target.style.display="none"}/>}
              <div>
                <div style={{fontSize:".68rem",color:"var(--muted)"}}>From the film</div>
                <div style={{fontSize:".82rem",fontWeight:700,color:"var(--gold)"}}>{movie.title}</div>
              </div>
              <div className="sd-share-card-watermark">Ollypedia</div>
            </div>
          )}
          {/* Actions */}
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button onClick={handleShare} className="btn btn-gold btn-sm" style={{flex:1,justifyContent:"center"}}>
              {navigator.share ? "📤 Share" : "🔗 Copy Link"}
            </button>
            {song.ytId && (
              <a href={`https://www.youtube.com/watch?v=${song.ytId}`} target="_blank" rel="noreferrer"
                className="btn btn-outline btn-sm" style={{flex:1,textAlign:"center",textDecoration:"none"}}>
                ▶ YouTube
              </a>
            )}
            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{flexShrink:0}}>✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SongItem({ song, active, onClick }) {
  const thumb = song.ytId ? ytThumb(song.ytId) : null;
  return (
    <div className={`sd-song-item${active?" active":""}`} onClick={onClick}>
      <div className="sd-song-thumb">
        {thumb && <img src={thumb} alt={song.title} onError={e=>e.target.style.opacity="0.2"}/>}
        <div className="sd-song-icon" style={{ background:active?"rgba(201,151,58,.45)":"rgba(0,0,0,.4)", color:active?"var(--gold)":"rgba(255,255,255,.7)" }}>
          {active?"▶":"♪"}
        </div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div className="sd-song-name" style={{color:active?"var(--gold)":"var(--text)"}}>{song.title}</div>
        {song.singer && <div className="sd-song-singer">🎤 {song.singer}</div>}
      </div>
      {song.ytId && (
        <a href={`https://www.youtube.com/watch?v=${song.ytId}`} target="_blank" rel="noreferrer"
          onClick={e=>e.stopPropagation()}
          style={{flexShrink:0,color:"var(--gold)",fontSize:".6rem",fontWeight:700,opacity:.65,padding:"3px 5px"}}>
          YT↗
        </a>
      )}
    </div>
  );
}

function SongScrollRow({ title, songs, onSongClick }) {
  const ref = useRef(null);
  const slide = n => ref.current?.scrollBy({left:n,behavior:"smooth"});
  if (!songs.length) return null;
  return (
    <section className="sd-section">
      <div className="sd-sec-head">
        <h2 className="sd-sec-title">{title}</h2>
        <div style={{display:"flex",gap:5}}>
          <button className="sd-arr" onClick={()=>slide(-400)}>‹</button>
          <button className="sd-arr" onClick={()=>slide(400)}>›</button>
        </div>
      </div>
      <div className="sd-hrow" ref={ref}>
        {songs.map((s,i)=>{
          const thumb=s.thumbnailUrl||(s.ytId?ytThumb(s.ytId):null)||s.moviePoster;
          return (
            <div key={i} className="sd-sc" onClick={()=>onSongClick(s)}>
              <div className="sd-sc-img">
                {thumb&&<img src={thumb} alt={s.title} onError={e=>e.target.style.opacity="0.2"}/>}
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.25)"}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:"rgba(201,151,58,.85)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".75rem"}}>▶</div>
                </div>
              </div>
              <p className="sd-sc-title">{s.title}</p>
              {s.singer&&<p className="sd-sc-sub">🎤 {s.singer}</p>}
              {s.movieTitle&&<p className="sd-sc-sub" style={{color:"var(--gold)"}}>{s.movieTitle}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function SongDetail() {
  // ── URL params ────────────────────────────────────────────────
  // Route: /song/:movieSlug/:songIndex  OR  /song/:movieSlug/:songIndex/:songSlug
  const { movieSlug: _rawSlug, songIndex: _rawIdx } = useParams();

  // movieParam: slug ("bindusagar-2026") or ObjectId — server accepts both
  const movieParam = extractId(_rawSlug) || _rawSlug;
  // songIdx: parse safely, default to 0
  const songIdx    = (() => { const n = parseInt(_rawIdx, 10); return isNaN(n) ? 0 : n; })();

  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────────
  const [allMovies,       setAllMovies]       = useState(() => Cache.peek("movies") || []);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [activeSongIdx,   setActiveSongIdx]   = useState(songIdx);
  const [activeMovieParam,setActiveMovieParam]= useState(movieParam);
  const [sidebarTab,      setSidebarTab]      = useState("playlist"); // "playlist" | "lyrics"
  const [currentTime,     setCurrentTime]     = useState(0);
  const [autoplay,        setAutoplay]        = useState(true);
  const [showBar,         setShowBar]         = useState(false);
  const [isPlaying,       setIsPlaying]       = useState(true);
  const [userRating,      setUserRating]      = useState(0);
  const [hoverRating,     setHoverRating]     = useState(0);
  const [showShare,       setShowShare]       = useState(false);
  const [ratingMsg,       setRatingMsg]       = useState("");
  const [repeatMode,  setRepeatMode]  = useState("none");  // "none"|"one"|"all"
  const [queue,        setQueue]        = useState([]);       // [{idx, title, singer, ytId}]
  const [showQueue,    setShowQueue]    = useState(false);
  const [knowCount,    setKnowCount]    = useState(0);
  const [knowVoted,    setKnowVoted]    = useState(false);
  const playerRef  = useRef(null);
  const playerWrap = useRef(null);

  // ── Derive movie from state ───────────────────────────────────
  const movie = allMovies.find(m =>
    String(m._id) === activeMovieParam || m.slug === activeMovieParam
  ) || null;

  // ── Derived song data — ABOVE all useEffects (React rules) ─────
  const songs      = movie?.media?.songs || [];
  const activeSong = songs[activeSongIdx] || songs[0] || null;
  const activeIdx  = activeSong ? songs.indexOf(activeSong) : 0;
  const ytId       = activeSong?.ytId ? extractYtId(activeSong.ytId) : null;

  // ── URL upgrade ref ───────────────────────────────────────────
  const upgradedRef = useRef("");

  // ── Load movie ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Check cache first
    const cached = Cache.peek("movies");
    if (cached) {
      const found = cached.find(m => String(m._id) === movieParam || m.slug === movieParam);
      if (found) {
        if (!cancelled) { setAllMovies(cached); setLoading(false); }
        return;
      }
    }

    // Fetch individual movie
    API.getMovie(movieParam)
      .then(m => {
        if (cancelled) return;
        setAllMovies(prev => [m, ...prev.filter(x => String(x._id) !== String(m._id))]);
        setLoading(false);
        // Background: load all movies for related sections
        const tid = typeof requestIdleCallback !== "undefined"
          ? requestIdleCallback(() => Cache.getMovies().catch(() => []).then(all => { if (!cancelled) setAllMovies(all); }))
          : setTimeout(() => Cache.getMovies().catch(() => []).then(all => { if (!cancelled) setAllMovies(all); }), 300);
        return () => typeof requestIdleCallback !== "undefined" ? cancelIdleCallback(tid) : clearTimeout(tid);
      })
      .catch(e => { if (!cancelled) { setError(e?.message || "Failed to load"); setLoading(false); } });

    return () => { cancelled = true; };
  }, [movieParam]);

  // ── Sync state when URL params change ──────────────────────────
  useEffect(() => {
    setActiveMovieParam(movieParam);
    setActiveSongIdx(songIdx);
  }, [movieParam, songIdx]);


  // Auto-switch to lyrics tab when song changes
  useEffect(() => {
    if (activeSong?.lyrics?.trim()) setSidebarTab("lyrics");
    else setSidebarTab("playlist");
    setCurrentTime(0);
    if (!activeSong || !movie) return;
    const trackData = {
      title: activeSong.title, singer: activeSong.singer||"",
      ytId: activeSong.ytId ? extractYtId(activeSong.ytId) : "",
      movieTitle: movie.title, movieId: String(movie._id),
      movieSlug: movie.slug||"", songIdx: activeIdx,
      thumb: activeSong.ytId ? `https://img.youtube.com/vi/${extractYtId(activeSong.ytId)}/mqdefault.jpg` : (movie.posterUrl||""),
    };  }, [activeSong?.title, activeIdx]);

  // ── Save to recently played + load know count ────────────────
  useEffect(() => {
    if (!activeSong || !movie) return;
    saveRecent(activeSong, movie, activeIdx);
    // Load know count
    const kd = getKnowData(`know_${movie._id}_${activeIdx}`);
    setKnowCount(kd.count || 0);
    setKnowVoted(kd.voted || false);
  }, [activeSong?.title, activeIdx]);

  // ── Show/hide Now Playing bar on scroll ──────────────────────
  useEffect(() => {
    const onScroll = () => {
      if (!playerWrap.current) return;
      const rect = playerWrap.current.getBoundingClientRect();
      setShowBar(rect.bottom < 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Autoplay: detect song end via YouTube postMessage ─────────
  // ── Also track play/pause state ──────────────────────────────

  // ── Load saved rating for this song ──────────────────────────
  useEffect(() => {
    if (!activeSong?.title) return;
    const key = `rating_${movie?._id}_${activeIdx}`;
    const saved = parseInt(localStorage.getItem(key) || "0", 10);
    setUserRating(saved);
    setRatingMsg("");
  }, [activeSong?.title, activeIdx]);

  // ── Poll YouTube player time for lyrics sync ─────────────────
  useEffect(() => {
    if (!ytId) return;
    let interval = null;
    const onMsg = (e) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.event === "infoDelivery" && d?.info?.currentTime != null) {
          setCurrentTime(d.info.currentTime);
          // Detect play/pause state
          if (d.info.playerState === 1) setIsPlaying(true);
          if (d.info.playerState === 2) setIsPlaying(false);
          // Detect song end (playerState === 0)
          if (d.info.playerState === 0) {
            if (repeatMode === "one") {
              // Seek back to start
              setTimeout(() => {
                playerRef.current?.contentWindow?.postMessage(
                  JSON.stringify({event:"command",func:"seekTo",args:[0,true]}), "*"
                );
              }, 300);
            } else if (queue.length > 0) {
              // Play from queue
              const [next, ...rest] = queue;
              setQueue(rest);
              setTimeout(() => changeActiveSong(next.idx), 800);
            } else if (autoplay || repeatMode === "all") {
              const nextIdx = repeatMode === "all" && activeIdx === songs.length - 1
                ? 0 : activeIdx + 1;
              if (nextIdx < songs.length) {
                setTimeout(() => changeActiveSong(nextIdx), 800);
              }
            }
          }
        }
      } catch {}
    };
    window.addEventListener("message", onMsg);
    // Ask YouTube iframe to send time every second
    const askTime = () => {
      try {
        playerRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "listening" }), "*"
        );
        playerRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "getVideoData" }), "*"
        );
      } catch {}
    };
    interval = setInterval(askTime, 1000);
    return () => { window.removeEventListener("message", onMsg); clearInterval(interval); };
  }, [ytId]);
  useEffect(() => {
    if (!movie || !activeSong) return;
    const target = songPath(movie, activeIdx, activeSong);
    // Avoid infinite loop: only navigate if URL is genuinely different
    if (target !== upgradedRef.current && window.location.pathname !== target) {
      upgradedRef.current = target;
      navigate(target, { replace: true });
    }
  }, [movie?._id, activeIdx, activeSong?.title]);

  // ── Navigation handlers ───────────────────────────────────────
  const changeActiveSong = (idx) => {
    const s = songs[idx];
    if (!s) return;
    setActiveSongIdx(idx);
    navigate(songPath(movie, idx, s), { replace: true });  };

  const handleRelatedSongClick = (s) => {
    const relM = allMovies.find(x => String(x._id) === s.movieId);
    const idx  = (typeof s.songIdx === "number" && !isNaN(s.songIdx)) ? s.songIdx : 0;
    setActiveMovieParam(relM?.slug || s.movieId);
    setActiveSongIdx(idx);
    navigate(
      relM ? songPath(relM, idx, s) : `/song/${s.movieId}/${idx}`,
      { replace: false }
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Rating handler ───────────────────────────────────────────
  const handleRate = (stars) => {
    setUserRating(stars);
    const key = `rating_${movie?._id}_${activeIdx}`;
    localStorage.setItem(key, String(stars));
    setRatingMsg(["😕","😐","🙂","😊","🤩"][stars-1] + " Thanks for rating!");
    setTimeout(() => setRatingMsg(""), 2500);
  };

  // ── Know this song ───────────────────────────────────────────
  const handleKnow = () => {
    if (knowVoted) return;
    const key = `know_${movie?._id}_${activeIdx}`;
    const kd = getKnowData(key);
    const newCount = (kd.count || 0) + 1;
    try { localStorage.setItem(key, JSON.stringify({count:newCount, voted:true})); } catch {}
    setKnowCount(newCount);
    setKnowVoted(true);
  };

  const addToQueue = (idx) => {
    const s = songs[idx];
    if (!s || idx === activeIdx) return;
    setQueue(q => {
      if (q.some(x => x.idx === idx)) return q; // already in queue
      return [...q, {idx, title:s.title, singer:s.singer||"", ytId:s.ytId||""}];
    });
    setShowQueue(true);
  };

  const cycleRepeat = () => {
    setRepeatMode(m => m==="none"?"one":m==="one"?"all":"none");
  };

  // ── Now Playing bar controls ──────────────────────────────────
  const togglePlay = () => {
    try {
      const cmd = isPlaying ? "pauseVideo" : "playVideo";
      playerRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event:"command", func:cmd, args:[] }), "*"
      );
      setIsPlaying(p => !p);
    } catch {}
  };

  // ── Early returns ─────────────────────────────────────────────
  if (loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,color:"var(--muted)"}}>
      <div style={{fontSize:"2rem"}}>🎵</div>
      <p style={{fontSize:".8rem"}}>Loading…</p>
    </div>
  );
  if (error) return (
    <div className="page empty-state">
      <h3>Song not found</h3><p>{error}</p>
      <button className="btn btn-outline" style={{marginTop:16}} onClick={()=>navigate(-1)}>← Go Back</button>
    </div>
  );
  if (!movie) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted)"}}>
      <p>Loading movie…</p>
    </div>
  );
  if (!activeSong) return (
    <div className="page empty-state">
      <h3>No songs for this movie</h3>
      <button className="btn btn-outline" style={{marginTop:16}} onClick={()=>navigate(moviePath(movie))}>← Back to Movie</button>
    </div>
  );

  const bannerImg= movie.thumbnailUrl||ytThumb(movie.media?.trailer?.ytId)||movie.posterUrl;

  const allSongs=[];
  allMovies.forEach(m=>(m.media?.songs||[]).forEach((s,i)=>allSongs.push({...s,movieId:String(m._id),movieTitle:m.title,moviePoster:m.posterUrl,songIdx:i,isCurrent:String(m._id)===String(movie._id)&&i===activeIdx})));

  const bySinger        = activeSong.singer?allSongs.filter(s=>!s.isCurrent&&s.ytId&&s.singer&&firstToken(s.singer)===firstToken(activeSong.singer)):[];
  const byMusicDirector = activeSong.musicDirector?allSongs.filter(s=>!s.isCurrent&&s.ytId&&s.musicDirector&&firstToken(s.musicDirector)===firstToken(activeSong.musicDirector)):[];
  const byLyricist      = activeSong.lyricist?allSongs.filter(s=>!s.isCurrent&&s.ytId&&s.lyricist&&firstToken(s.lyricist)===firstToken(activeSong.lyricist)):[];

  return (
    <div className="sd-root">
      <style>{CSS}</style>
      <SEO {...songDetailSEO({...activeSong,songIndex:activeIdx},movie)}/>

      <div className="sd-hero">
        {bannerImg && <div className="sd-hero-bg" style={{backgroundImage:`url(${bannerImg})`}}/>}
        <div className="sd-hero-overlay"/>

        <div className="sd-back">
          <button onClick={()=>navigate(movie?moviePath(movie):`/movie/${movie?._id}`)}>
            ← {movie.title}
          </button>
          {/* Breadcrumb */}
          <div className="sd-breadcrumb">
            <span onClick={()=>navigate("/")}>Home</span>
            <span className="sep">›</span>
            <span onClick={()=>navigate("/songs")}>Songs</span>
            <span className="sep">›</span>
            <span onClick={()=>navigate(moviePath(movie))}>{movie.title}</span>
            <span className="sep">›</span>
            <span className="cur">{activeSong.title}</span>
          </div>
        </div>

        <div className="sd-grid">
          {/* ── Left: Player + Info + Playlist ── */}
          <div style={{minWidth:0}}>
            <div ref={playerWrap}>
            <div className="sd-player">
              {ytId
                ? <iframe key={ytId} ref={playerRef}
                    src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&enablejsapi=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen title={activeSong.title}/>
                : <div style={{width:"100%",height:"100%",minHeight:220,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,background:"var(--bg3)"}}>
                    <div style={{fontSize:"2.5rem"}}>🎵</div>
                    <p style={{color:"var(--muted)",fontSize:".82rem"}}>No YouTube link available</p>
                  </div>
              }
            </div>
            </div>{/* /playerWrap */}

            <div className="sd-info-card">
              <div className="sd-badges">
                <span className="home-tag">🎵 Song</span>
                {activeSong.singer        && <span className="home-tag-outline">🎤 {activeSong.singer}</span>}
                {activeSong.musicDirector && <span className="home-tag-outline">🎼 {activeSong.musicDirector}</span>}
                {activeSong.lyricist      && <span className="home-tag-outline">✍️ {activeSong.lyricist}</span>}
              </div>
              <h1 className="sd-song-title">{activeSong.title}</h1>

              {[
                activeSong.singer        && ["Singer",     "🎤", activeSong.singer,       "var(--gold)"],
                activeSong.musicDirector && ["Music Dir.", "🎼", activeSong.musicDirector, "var(--text)"],
                activeSong.lyricist      && ["Lyricist",   "✍️", activeSong.lyricist,      "var(--text)"],
              ].filter(Boolean).map(([label,icon,val,color])=>(
                <div key={label} className="sd-meta-row">
                  <span className="sd-meta-label">{label}</span>
                  <span className="sd-meta-val" style={{color,fontWeight:label==="Singer"?600:400}}>{icon} {val}</span>
                </div>
              ))}
              <div className="sd-meta-row">
                <span className="sd-meta-label">From Film</span>
                <span className="sd-meta-val" style={{color:"var(--gold)",fontWeight:600,cursor:"pointer",textDecoration:"underline"}}
                  onClick={()=>navigate(movie?moviePath(movie):`/movie/${movie?._id}`)}>🎬 {movie.title}</span>
              </div>
              {movie.director&&<div className="sd-meta-row"><span className="sd-meta-label">Director</span><span className="sd-meta-val">{movie.director}</span></div>}
              {movie.releaseDate&&<div className="sd-meta-row"><span className="sd-meta-label">Release</span><span className="sd-meta-val">{fmtDate(movie.releaseDate)}</span></div>}

              {/* ── Single action row: YT + Autoplay + Share + Rating ── */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:16,flexWrap:"wrap",borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:14}}>
                {/* Open on YouTube */}
                {ytId && (
                  <a href={`https://www.youtube.com/watch?v=${ytId}`} target="_blank" rel="noreferrer"
                    className="btn-hero-play" style={{fontSize:".76rem",padding:"7px 14px",whiteSpace:"nowrap"}}>
                    ▶ YouTube
                  </a>
                )}

                {/* Autoplay toggle — pill style */}
                <button className={`sd-ctrl-btn${autoplay?" on":""}`} onClick={()=>setAutoplay(a=>!a)}
                  style={{padding:"6px 12px",border:`1px solid ${autoplay?"rgba(201,151,58,.4)":"rgba(255,255,255,.12)"}`,borderRadius:20}}>
                  {autoplay?"⏭ Auto: On":"⏭ Auto: Off"}
                </button>

                {/* Share */}
                <button onClick={()=>setShowShare(true)}
                  className="sd-ctrl-btn"
                  style={{padding:"6px 12px",border:"1px solid rgba(255,255,255,.12)",borderRadius:20}}>
                  📤 Share
                </button>

                {/* I Know This Song */}
                <button className={`sd-know-btn${knowVoted?" voted":""}`} onClick={handleKnow}
                  style={{padding:"6px 14px",fontSize:".76rem"}}>
                  🔥 {knowVoted?"Known!":"I know this!"}
                  {knowCount>0&&<span style={{fontWeight:900,marginLeft:3}}>{knowCount>=1000?(knowCount/1000).toFixed(1)+"K":knowCount}</span>}
                </button>

                {/* Star rating inline */}
                <div style={{display:"flex",alignItems:"center",gap:3,marginLeft:"auto"}}>
                  {[1,2,3,4,5].map(star=>(
                    <span key={star}
                      className={`sd-star${(hoverRating||userRating)>=star?" lit":""}`}
                      onMouseEnter={()=>setHoverRating(star)}
                      onMouseLeave={()=>setHoverRating(0)}
                      onClick={()=>handleRate(star)}
                      style={{fontSize:"1.1rem"}}>
                      ⭐
                    </span>
                  ))}
                  {ratingMsg && <span style={{fontSize:".7rem",color:"var(--gold)",marginLeft:4}}>{ratingMsg}</span>}
                </div>
              </div>


            </div>

            {/* ── Song Description ── */}
            {activeSong.description && (
              <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:12,padding:"16px 18px",marginBottom:0}}>
                <div style={{fontSize:".62rem",fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:8}}>🎵 About This Song</div>
                <p style={{fontSize:".86rem",lineHeight:1.8,color:"rgba(255,255,255,.75)",margin:0}}>{activeSong.description}</p>
              </div>
            )}

            {/* ── Queue Panel ── */}
            {showQueue && (
              <div className="sd-queue-wrap">
                <div className="sd-queue-head">
                  <span>📋 Queue ({queue.length})</span>
                  <button onClick={()=>setQueue([])} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:".68rem",fontFamily:"inherit"}}>Clear</button>
                </div>
                {queue.length===0
                  ? <div style={{padding:"14px 16px",color:"var(--muted)",fontSize:".78rem",textAlign:"center"}}>
                      Queue is empty. Right-click a song below to add it!
                    </div>
                  : queue.map((q,i)=>{
                      const qs=songs[q.idx];
                      const thumb=q.ytId?ytThumb(q.ytId):null;
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer"}}
                          onClick={()=>{setQueue(prev=>prev.filter((_,pi)=>pi!==i));changeActiveSong(q.idx);}}>
                          <div style={{width:44,height:30,borderRadius:4,overflow:"hidden",background:"var(--bg3)",flexShrink:0}}>
                            {thumb&&<img src={thumb} alt={q.title} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:".78rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.title}</div>
                            {q.singer&&<div style={{fontSize:".64rem",color:"var(--muted)"}}>🎤 {q.singer}</div>}
                          </div>
                          <button onClick={e=>{e.stopPropagation();setQueue(prev=>prev.filter((_,pi)=>pi!==i));}}
                            style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:".8rem",padding:"2px 6px"}}>✕</button>
                        </div>
                      );
                    })
                }
                <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,.05)",fontSize:".66rem",color:"var(--muted)"}}>
                  💡 Right-click any song in the playlist to add to queue
                </div>
              </div>
            )}

            {/* ── About This Song ── */}
            <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:12,padding:"18px 20px",marginBottom:0}}>
              <div style={{fontSize:".62rem",fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:12}}>About This Movie</div>

              {/* Song number in album */}
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                <span style={{fontSize:".68rem",color:"var(--muted)",width:80,flexShrink:0}}>Track</span>
                <span style={{fontSize:".84rem",fontWeight:600}}>#{activeIdx+1} of {songs.length} in {movie.title}</span>
              </div>

              {/* Language */}
              {movie.language && (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                  <span style={{fontSize:".68rem",color:"var(--muted)",width:80,flexShrink:0}}>Language</span>
                  <span style={{fontSize:".84rem"}}>🌐 {movie.language}</span>
                </div>
              )}

              {/* Genre */}
              {movie.genre?.length>0 && (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                  <span style={{fontSize:".68rem",color:"var(--muted)",width:80,flexShrink:0}}>Genre</span>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {movie.genre.map(g=>(
                      <span key={g} style={{fontSize:".7rem",background:"rgba(201,151,58,.1)",color:"var(--gold)",padding:"2px 9px",borderRadius:20,border:"1px solid rgba(201,151,58,.2)"}}>{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Verdict */}
              {movie.verdict && (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                  <span style={{fontSize:".68rem",color:"var(--muted)",width:80,flexShrink:0}}>Verdict</span>
                  <span style={{fontSize:".84rem",fontWeight:700,color:["Hit","Super Hit","Blockbuster"].includes(movie.verdict)?"#4caf82":movie.verdict==="Upcoming"?"var(--gold)":"var(--red)"}}>{movie.verdict}</span>
                </div>
              )}

              {/* IMDB Rating */}
              {movie.imdbRating && (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                  <span style={{fontSize:".68rem",color:"var(--muted)",width:80,flexShrink:0}}>IMDb</span>
                  <span style={{fontSize:".84rem",fontWeight:700,color:"#f5c518"}}>⭐ {movie.imdbRating}/10</span>
                </div>
              )}

            </div>
          </div>

          {/* ── Right sidebar: Playlist + Lyrics tabs ── */}
          <div className="sd-sidebar">
            {/* Movie info header */}
            <div className="sd-sidebar-head">
              <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                {movie.posterUrl&&(
                  <img src={movie.posterUrl} alt={movie.title}
                    style={{width:42,height:58,objectFit:"cover",borderRadius:4,border:"1px solid var(--border)",flexShrink:0,cursor:"pointer"}}
                    onClick={()=>navigate(movie?moviePath(movie):`/movie/${movie?._id}`)}
                    onError={e=>e.target.style.display="none"}/>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:".82rem",lineHeight:1.3,cursor:"pointer",color:"var(--gold)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    onClick={()=>navigate(movie?moviePath(movie):`/movie/${movie?._id}`)}>{movie.title}</div>
                  {movie.releaseDate&&<div style={{fontSize:".64rem",color:"var(--muted)",marginTop:2}}>{fmtDate(movie.releaseDate)}</div>}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="sd-tabs">
              <button className={`sd-tab${sidebarTab==="playlist"?" active":""}`}
                onClick={()=>setSidebarTab("playlist")}>
                🎵 Playlist <span style={{opacity:.6}}>({songs.length})</span>
              </button>
              <button className={`sd-tab${sidebarTab==="lyrics"?" active":""}`}
                onClick={()=>setSidebarTab("lyrics")}>
                ✍️ Lyrics
                {activeSong?.lyrics && <span style={{marginLeft:4,width:6,height:6,borderRadius:"50%",background:"var(--gold)",display:"inline-block",verticalAlign:"middle"}}/>}
              </button>
            </div>

            {/* Playlist tab */}
            {sidebarTab==="playlist" && (
              <div className="sd-sidebar-list">
                {songs.length===0
                  ? <div style={{padding:"16px",color:"var(--muted)",fontSize:".8rem",textAlign:"center"}}>No songs</div>
                  : songs.map((s,i)=><div key={i} onContextMenu={e=>{e.preventDefault();addToQueue(i);}}><SongItem song={s} active={i===activeIdx} onClick={()=>changeActiveSong(i)}/></div>)
                }
              </div>
            )}

            {/* Lyrics tab */}
            {sidebarTab==="lyrics" && (
              <LyricsPanel lyrics={activeSong?.lyrics} currentTime={currentTime} />
            )}

            <div className="sd-sidebar-footer">
              <button className="btn btn-outline btn-sm" style={{width:"100%",justifyContent:"center",fontSize:".74rem"}}
                onClick={()=>navigate(movie?moviePath(movie):`/movie/${movie?._id}`)}>
                🎬 View Full Movie Page
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Below: related rows */}
      <div className="sd-sections">

        {/* Spotify-style "You May Also Like" — songs by same singer */}
        {bySinger.length>0&&(
          <section className="sd-section">
            <div className="sd-sec-head">
              <div>
                <h2 className="sd-sec-title">🎤 More by {activeSong.singer?.split(/[,&]/)[0]?.trim()}</h2>
                <div style={{fontSize:".66rem",color:"var(--muted)",marginTop:2}}>Songs you may also like</div>
              </div>
            </div>
            <div className="sd-hrow" style={{paddingBottom:16}}>
              {bySinger.slice(0,12).map((s,i)=>(
                <SpotifyCard key={i} song={s} onClick={()=>handleRelatedSongClick(s)}/>
              ))}
            </div>
          </section>
        )}

        {byMusicDirector.length>0&&<SongScrollRow title={`🎼 More by ${activeSong.musicDirector?.split(/[,&]/)[0]?.trim()}`} songs={byMusicDirector.slice(0,15)} onSongClick={handleRelatedSongClick}/>}
        {byLyricist.length>0&&<SongScrollRow title={`✍️ More by ${activeSong.lyricist?.split(/[,&]/)[0]?.trim()}`} songs={byLyricist.slice(0,15)} onSongClick={handleRelatedSongClick}/>}

        {/* ── Similar movies featuring same singer ── */}
        {activeSong.singer&&(()=>{
          const singerName=firstToken(activeSong.singer);
          const singerMovies=allMovies.filter(m=>
            String(m._id)!==String(movie._id)&&
            m.media?.songs?.some(s=>s.singer&&firstToken(s.singer)===singerName)
          ).sort((a,b)=>new Date(b.releaseDate||0)-new Date(a.releaseDate||0)).slice(0,14);
          if(!singerMovies.length)return null;
          return(
            <section className="sd-section">
              <div className="sd-sec-head">
                <div>
                  <h2 className="sd-sec-title">🎬 More films with {activeSong.singer?.split(/[,&]/)[0]?.trim()}</h2>
                  <div style={{fontSize:".64rem",color:"var(--muted)",marginTop:2}}>Movies where this singer has songs</div>
                </div>
              </div>
              <div className="sd-hrow">
                {singerMovies.map(m=>(
                  <div key={m._id} className="sd-mc" onClick={()=>navigate(moviePath(m))}>
                    <div className="sd-mc-box">
                      {(m.posterUrl||m.thumbnailUrl)&&<img src={m.posterUrl||m.thumbnailUrl} alt={m.title} loading="lazy" onError={e=>e.target.style.display="none"}/>}
                      {!m.posterUrl&&!m.thumbnailUrl&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem"}}>🎬</div>}
                      <div style={{position:"absolute",top:6,right:6,fontSize:".55rem",fontWeight:800,padding:"2px 6px",borderRadius:8,background:"rgba(0,0,0,.75)",color:"rgba(201,151,58,.9)"}}>
                        {m.media?.songs?.filter(s=>s.singer&&firstToken(s.singer)===singerName).length} songs
                      </div>
                    </div>
                    <p className="sd-mc-title">{m.title}</p>
                    <p style={{margin:"2px 0 0",fontSize:".6rem",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.releaseDate?new Date(m.releaseDate).getFullYear():""}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {movie.cast?.length>0&&(
          <section className="sd-section">
            <div className="sd-sec-head"><h2 className="sd-sec-title">🎭 Cast of {movie.title}</h2></div>
            <div className="sd-hrow">
              {movie.cast.map((c,i)=>{
                const castId=c.castId?._id||c.castId;
                return (
                  <div key={i} style={{flexShrink:0,width:120,cursor:castId?"pointer":"default"}} onClick={()=>castId&&navigate(`/cast/${castId}`)}>
                    <div style={{position:"relative",borderRadius:9,overflow:"hidden",aspectRatio:"2/3",background:"var(--bg3)"}}>
                      {c.photo?<img src={c.photo} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
                        :<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem"}}>👤</div>}
                      <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"3px 6px",background:"linear-gradient(to top,rgba(0,0,0,.75),transparent)"}}>
                        <span style={{fontSize:".55rem",color:"rgba(255,255,255,.7)",fontWeight:600}}>{c.type||"Actor"}</span>
                      </div>
                    </div>
                    <p style={{margin:"5px 0 0",fontWeight:700,fontSize:".7rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text)"}}>{c.name}</p>
                    {c.role&&<p style={{margin:"1px 0 0",fontSize:".62rem",color:"var(--gold)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.role}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(()=>{
          const related=allMovies.filter(m=>String(m._id)!==String(movie._id)&&movie.genre?.length&&m.genre?.some(g=>movie.genre.includes(g))).sort((a,b)=>new Date(b.releaseDate||0)-new Date(a.releaseDate||0)).slice(0,15);
          if(!related.length)return null;
          return(
            <section className="sd-section">
              <div className="sd-sec-head"><h2 className="sd-sec-title">🎬 Related Films</h2></div>
              <div className="sd-hrow">
                {related.map(m=>(
                  <div key={m._id} className="sd-mc" onClick={()=>navigate(moviePath(m))}>
                    <div className="sd-mc-box">
                      {(m.posterUrl||m.thumbnailUrl)&&<img src={m.posterUrl||m.thumbnailUrl} alt={m.title} loading="lazy" onError={e=>e.target.style.display="none"}/>}
                      {!m.posterUrl&&!m.thumbnailUrl&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem"}}>🎬</div>}
                    </div>
                    <p className="sd-mc-title">{m.title}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}
      </div>{/* /sd-sections */}

      {/* ── Share Card Modal ── */}
      {showShare && <ShareCardModal song={activeSong} movie={movie} onClose={()=>setShowShare(false)}/>}

      {/* ── Now Playing floating bar ── */}
      <div className={`sd-now-playing${showBar?" visible":""}`}>
        <div className="sd-np-thumb">
          {(activeSong.thumbnailUrl||(ytId?ytThumb(ytId):null))
            ? <img src={activeSong.thumbnailUrl||ytThumb(ytId)} alt={activeSong.title} onError={e=>e.target.style.display="none"}/>
            : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>🎵</div>
          }
        </div>
        <div className="sd-np-info">
          <div className="sd-np-title">{activeSong.title}</div>
          {activeSong.singer && <div className="sd-np-singer">🎤 {activeSong.singer}</div>}
        </div>
        <button className="sd-np-btn sd-np-skip" title="Previous"
          onClick={()=>activeIdx>0&&changeActiveSong(activeIdx-1)}
          style={{opacity:activeIdx>0?1:.4}}>‹</button>
        <button className="sd-np-btn" title={isPlaying?"Pause":"Play"} onClick={togglePlay}>
          {isPlaying?"⏸":"▶"}
        </button>
        <button className="sd-np-btn sd-np-skip" title="Next"
          onClick={()=>activeIdx<songs.length-1&&changeActiveSong(activeIdx+1)}
          style={{opacity:activeIdx<songs.length-1?1:.4}}>›</button>
        <button className="sd-np-btn sd-np-skip" title="Share" onClick={()=>setShowShare(true)} style={{fontSize:".75rem"}}>📤</button>
      </div>
    </div>
  );
}