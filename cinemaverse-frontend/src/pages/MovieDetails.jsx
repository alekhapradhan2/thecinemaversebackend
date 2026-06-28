import SEO, { movieSEO } from "../components/SEO";
import { extractId, moviePath, castPath, songPath } from "../utils/slugs";
import { Helmet } from "react-helmet-async";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { API, getToken } from "../api/api";
import { Cache } from "../api/cache";

// ── Helpers ───────────────────────────────────────────────
function SafeImg({ src, alt, style }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) return null;
  return <img src={src} alt={alt} style={style} onError={() => setBroken(true)} />;
}
function SafeNewsImg({ src, alt }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) return null;
  return <div className="news-card-img"><img src={src} alt={alt} onError={() => setBroken(true)} /></div>;
}

const extractYtId = (input) => {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
};
const ytThumb = (id) => id ? `https://img.youtube.com/vi/${extractYtId(id)||id}/mqdefault.jpg` : null;

const VERDICT_COLOR = {
  "Blockbuster":"#95e5b8","Super Hit":"#95e5b8","Hit":"#95e5b8",
  "Average":"#e8c87a","Flop":"#e59595","Disaster":"#e59595","Upcoming":"#7aaae8",
};
const verdictClass = (v) => {
  if (!v) return "verdict-upcoming";
  const l = v.toLowerCase();
  if (["hit","super hit","blockbuster"].includes(l)) return "verdict-hit";
  if (["flop","disaster"].includes(l)) return "verdict-flop";
  if (l === "average") return "verdict-average";
  return "verdict-upcoming";
};
const stars = (n) => "★".repeat(Math.round(n||0)) + "☆".repeat(5-Math.round(n||0));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";

const GENRES = ["Action","Drama","Romance","Comedy","Thriller","Family","Historical","Devotional","Horror"];
const CATS   = ["Feature Film","Short Film","Web Series","Documentary"];
const VDICT  = ["Upcoming","Average","Hit","Super Hit","Blockbuster","Flop","Disaster"];
const NCATS  = ["Update","Release","Trailer","Song","Award","Interview","Other"];
const CTYPES = ["Actor","Actress","Director","Producer","Music Director","Cinematographer","Choreographer","Lyricist","Other"];

// ── Horizontal scroll row ─────────────────────────────────
// ── Interested widget (BookMyShow style) ─────────────────────
function InterestedWidget({ movieId }) {
  const voteKey = `interested_${movieId}`;

  const [vote,     setVote]     = React.useState(() => { try { return localStorage.getItem(voteKey)||null; } catch { return null; } });
  const [yesCount, setYesCount] = React.useState(0);
  const [noCount,  setNoCount]  = React.useState(0);
  const [loading,  setLoading]  = React.useState(true);
  const [voting,   setVoting]   = React.useState(false);

  // Load counts from DB on mount
  React.useEffect(() => {
    if (!movieId) return;
    API.getInterested(movieId)
      .then(d => { setYesCount(d.yes||0); setNoCount(d.no||0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [movieId]);

  const totalVotes = yesCount + noCount;
  const yesPercent = totalVotes ? Math.round((yesCount / totalVotes) * 100) : 0;

  const handleVote = async (v) => {
    if (vote || voting) return;
    setVoting(true);
    try {
      const d = await API.postInterested(movieId, v);
      setYesCount(d.yes||0);
      setNoCount(d.no||0);
      setVote(v);
      try { localStorage.setItem(voteKey, v); } catch {}
    } catch {
      // Optimistic fallback
      setVote(v);
      if (v === "yes") setYesCount(n => n+1);
      else setNoCount(n => n+1);
      try { localStorage.setItem(voteKey, v); } catch {}
    } finally { setVoting(false); }
  };

  return (
    <div>
      <div style={{ fontSize:".62rem", fontWeight:800, letterSpacing:".1em", textTransform:"uppercase", color:"rgba(255,255,255,.4)", marginBottom:8 }}>
        🎬 Interested?
      </div>

      {loading ? (
        <div style={{ height:36, background:"rgba(255,255,255,.04)", borderRadius:8, animation:"pulse 1.5s infinite" }}/>
      ) : !vote ? (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {/* Show total people interested before voting */}
          {yesCount > 0 && (
            <div style={{ fontSize:".68rem", color:"rgba(255,255,255,.4)", marginBottom:2 }}>
              🔥 <strong style={{ color:"rgba(255,255,255,.7)" }}>{yesCount.toLocaleString()}</strong> people are interested
            </div>
          )}
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={() => handleVote("yes")} disabled={voting}
              style={{ flex:1, padding:"9px 6px", borderRadius:8, border:"1px solid rgba(80,200,120,.4)", background:"rgba(80,200,120,.1)", color:"#80e8a8", fontWeight:700, fontSize:".78rem", cursor:"pointer", fontFamily:"inherit", transition:"all .15s", opacity:voting?.6:1 }}
              onMouseEnter={e=>{if(!voting)e.currentTarget.style.background="rgba(80,200,120,.22)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(80,200,120,.1)";}}>
              👍 Interested
            </button>
            <button onClick={() => handleVote("no")} disabled={voting}
              style={{ flex:1, padding:"9px 6px", borderRadius:8, border:"1px solid rgba(255,255,255,.15)", background:"rgba(255,255,255,.05)", color:"rgba(255,255,255,.55)", fontWeight:700, fontSize:".78rem", cursor:"pointer", fontFamily:"inherit", transition:"all .15s", opacity:voting?.6:1 }}
              onMouseEnter={e=>{if(!voting)e.currentTarget.style.background="rgba(255,255,255,.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.05)";}}>
              👎 Not sure
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize:".76rem", color:vote==="yes"?"#80e8a8":"rgba(255,255,255,.45)", fontWeight:700, marginBottom:8 }}>
            {vote === "yes" ? "✓ You're interested!" : "👎 Not interested"}
          </div>
          {/* People count prominently */}
          {yesCount > 0 && (
            <div style={{ fontSize:".8rem", color:"rgba(255,255,255,.65)", marginBottom:8 }}>
              🔥 <strong style={{ color:"#80e8a8", fontSize:"1rem" }}>{yesCount.toLocaleString()}</strong> people interested
            </div>
          )}
          {totalVotes > 0 && (
            <>
              <div style={{ height:5, background:"rgba(255,255,255,.08)", borderRadius:3, overflow:"hidden", marginBottom:5 }}>
                <div style={{ height:"100%", width:`${yesPercent}%`, background:"linear-gradient(to right,#80e8a8,#4caf82)", borderRadius:3, transition:"width .7s ease" }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:".6rem", color:"rgba(255,255,255,.35)" }}>
                <span>👍 {yesPercent}%</span>
                <span>{totalVotes.toLocaleString()} total votes</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live countdown timer component ───────────────────────────
function CountdownDisplay({ releaseDate }) {
  const calc = () => {
    const diff = new Date(releaseDate) - new Date();
    if (diff <= 0) return null;
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  };
  const [t, setT] = React.useState(calc);
  React.useEffect(() => {
    const iv = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(iv);
  }, [releaseDate]);
  if (!t) return null;
  return (
    <div style={{ display:"flex", gap:4, marginTop:6, width:"100%" }}>
      {[["d","Days"],["h","Hrs"],["m","Min"],["s","Sec"]].map(([k, lbl]) => (
        <div key={k} style={{ flex:1, textAlign:"center", background:"rgba(0,0,0,.5)", border:"1px solid rgba(201,151,58,.3)", borderRadius:7, padding:"5px 4px" }}>
          <div style={{ fontSize:"1.1rem", fontWeight:900, color:"#c9973a", lineHeight:1, fontVariantNumeric:"tabular-nums" }}>
            {String(t[k]).padStart(2,"0")}
          </div>
          <div style={{ fontSize:".5rem", textTransform:"uppercase", letterSpacing:".06em", color:"rgba(255,255,255,.35)", marginTop:2 }}>{lbl}</div>
        </div>
      ))}
    </div>
  );
}

function HomeRow({ title, tag, children }) {
  const ref = useRef(null);
  const slide = (n) => ref.current?.scrollBy({ left: n, behavior:"smooth" });
  return (
    <div className="home-section">
      <div className="home-section-header">
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <h2 className="home-section-title">{title}</h2>
          {tag && <span className="home-tag">{tag}</span>}
        </div>
        <div className="home-section-arrows">
          <button className="home-arrow" onClick={() => slide(-400)}>‹</button>
          <button className="home-arrow" onClick={() => slide(400)}>›</button>
        </div>
      </div>
      <div className="home-row" ref={ref}>{children}</div>
    </div>
  );
}

// ── Mini movie card ───────────────────────────────────────
function MiniMovieCard({ movie, onClick }) {
  const img = movie.posterUrl || movie.thumbnailUrl || ytThumb(movie.media?.trailer?.ytId);
  const verdict = movie.verdict || "Upcoming";
  const color = VERDICT_COLOR[verdict] || "#7aaae8";
  return (
    <div className="home-card" onClick={onClick}>
      <div className="home-card-img">
        {img ? <img src={img} alt={movie.title} loading="lazy" onError={e=>{e.target.style.display="none";}} /> : null}
        <div className="home-card-fallback" style={{display:img?"none":"flex"}}>🎬</div>
        <div className="home-card-play">▶</div>
        <div className="home-card-overlay">
          <span className="home-card-verdict" style={{color}}>{verdict}</span>
          {movie.genre?.[0] && <span className="home-card-genre">{movie.genre[0]}</span>}
        </div>
      </div>
      <div className="home-card-info">
        <p className="home-card-title">{movie.title}</p>
        <p className="home-card-date">{fmtDate(movie.releaseDate)}</p>
      </div>
    </div>
  );
}

// ── Mini cast card ────────────────────────────────────────
function MiniCastCard({ person, onClick }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="home-card" style={{width:150}} onClick={onClick}>
      <div className="home-card-img" style={{height:190}}>
        {person.photo && !broken
          ? <img src={person.photo} alt={person.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setBroken(true)} />
          : <div className="home-card-fallback">👤</div>}
        <div className="home-card-overlay">
          <span className="home-card-genre">{person.type||"Actor"}</span>
        </div>
      </div>
      <div className="home-card-info">
        <p className="home-card-title">{person.name}</p>
        {person.role && <p className="home-card-date" style={{color:"var(--gold)"}}>{person.role}</p>}
      </div>
    </div>
  );
}

// ── News Modal ────────────────────────────────────────────
function NewsModal({ movieId, existing, onSave, onClose }) {
  const [form, setForm] = useState({ title:existing?.title||"", content:existing?.content||"", category:existing?.category||"Update", imageUrl:existing?.imageUrl||"" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    if (!form.title.trim()||!form.content.trim()) return setErr("Title and content required.");
    setSaving(true); setErr("");
    try { const r = existing ? await API.editNews(existing._id,form) : await API.addNews(movieId,form); onSave(r,!!existing); onClose(); }
    catch(e) { setErr(typeof e==="string"?e:"Failed"); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:540}}>
        <div className="modal-header"><span className="modal-title">{existing?"Edit News":"Add News"}</span><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="form-group"><label className="form-label">Title *</label><input className="form-input" value={form.title} onChange={e=>set("title",e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Category</label><select className="form-select" value={form.category} onChange={e=>set("category",e.target.value)}>{NCATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Content *</label><textarea className="form-textarea" value={form.content} onChange={e=>set("content",e.target.value)} style={{minHeight:100}} /></div>
        <div className="form-group"><label className="form-label">Image URL</label><input className="form-input" value={form.imageUrl} onChange={e=>set("imageUrl",e.target.value)} placeholder="https://…" /></div>
        {err && <p style={{color:"var(--red)",fontSize:"0.82rem",marginBottom:8}}>{err}</p>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold btn-sm" onClick={save} disabled={saving}>{saving?"Saving…":existing?"Save Changes":"Publish"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Cast Modal ────────────────────────────────────────
function AddCastModal({ movieId, onAdded, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState("search");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newType, setNewType] = useState("Actor");
  const [newPhoto, setNewPhoto] = useState("");
  const [newBio, setNewBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await API.searchCast(query)); } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
  }, [query]);

  const addExisting = async (c) => {
    setSaving(true); setErr("");
    try { const up = await API.addCastToMovie(movieId,{castId:c._id,name:c.name,type:c.type,photo:c.photo||"",role:"",isNew:false}); onAdded(up); onClose(); }
    catch(e) { setErr(typeof e==="string"?e:"Failed"); setSaving(false); }
  };
  const addNew = async () => {
    if (!newName.trim()) return setErr("Name required.");
    setSaving(true); setErr("");
    try { const up = await API.addCastToMovie(movieId,{name:newName,type:newType,role:newRole,photo:newPhoto,bio:newBio,isNew:true}); onAdded(up); onClose(); }
    catch(e) { setErr(typeof e==="string"?e:"Failed"); setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:520}}>
        <div className="modal-header"><span className="modal-title">Add Cast / Crew</span><button className="modal-close" onClick={onClose}>×</button></div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button className={`btn btn-sm ${mode==="search"?"btn-gold":"btn-outline"}`} onClick={()=>setMode("search")}>Search Existing</button>
          <button className={`btn btn-sm ${mode==="new"?"btn-gold":"btn-outline"}`} onClick={()=>setMode("new")}>Add New Person</button>
        </div>
        {mode==="search" && (
          <>
            <input className="form-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Type name to search…" autoFocus />
            {(results.length>0||searching) && (
              <div className="search-dropdown">
                {searching && <div className="search-dropdown-item muted">Searching…</div>}
                {results.map(c=>(
                  <div key={c._id} className="search-dropdown-item" onClick={()=>!saving&&addExisting(c)}>
                    <span style={{fontWeight:600}}>{c.name}</span>
                    <span style={{color:"var(--gold)",fontSize:"0.75rem",marginLeft:8}}>{c.type}</span>
                    <span style={{color:"var(--muted)",fontSize:"0.75rem",marginLeft:8}}>{c.movies?.length||0} films</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {mode==="new" && (
          <>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={newName} onChange={e=>setNewName(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Role / Character</label><input className="form-input" value={newRole} onChange={e=>setNewRole(e.target.value)} /></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={newType} onChange={e=>setNewType(e.target.value)}>{CTYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Photo URL</label><input className="form-input" value={newPhoto} onChange={e=>setNewPhoto(e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">Bio (optional)</label><input className="form-input" value={newBio} onChange={e=>setNewBio(e.target.value)} /></div>
            {err && <p style={{color:"var(--red)",fontSize:"0.82rem",marginBottom:8}}>{err}</p>}
            <button className="btn btn-gold btn-sm" onClick={addNew} disabled={saving||!newName.trim()}>{saving?"Adding…":"+ Add to Movie"}</button>
          </>
        )}
        {mode==="search"&&err && <p style={{color:"var(--red)",fontSize:"0.82rem",marginTop:8}}>{err}</p>}
      </div>
    </div>
  );
}

// ── Add Song Modal ────────────────────────────────────────
function AddSongModal({ movieId, onAdded, onClose }) {
  const [title, setTitle] = useState("");
  const [singer, setSinger] = useState("");
  const [ytId, setYtId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!title.trim()) return setErr("Song title required.");
    setSaving(true); setErr("");
    try { const up = await API.addSong(movieId,{title:title.trim(),singer:singer.trim(),ytId:ytId.trim()}); onAdded(up); onClose(); }
    catch(e) { setErr(typeof e==="string"?e:"Failed"); setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:440}}>
        <div className="modal-header"><span className="modal-title">Add Song</span><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="form-group"><label className="form-label">Song Title *</label><input className="form-input" value={title} onChange={e=>setTitle(e.target.value)} autoFocus /></div>
        <div className="form-group"><label className="form-label">Singer(s)</label><input className="form-input" value={singer} onChange={e=>setSinger(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">YouTube ID</label><input className="form-input" value={ytId} onChange={e=>setYtId(e.target.value)} placeholder="e.g. dQw4w9WgXcQ" /></div>
        {ytId && <div className="trailer-embed" style={{maxWidth:380,marginBottom:12}}><iframe src={`https://www.youtube.com/embed/${ytId}`} allowFullScreen title="preview" /></div>}
        {err && <p style={{color:"var(--red)",fontSize:"0.82rem",marginBottom:8}}>{err}</p>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold btn-sm" onClick={save} disabled={saving||!title.trim()}>{saving?"Adding…":"+ Add Song"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  OVERVIEW BLOG SECTION — inline in overview tab
// ═══════════════════════════════════════════════════════════
const BLOG_API = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "") + "/api";

const OBS_CSS = `
@keyframes obs-fade { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
.obs-wrap { margin-bottom: 28px; }
.obs-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px; padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,.07);
}
.obs-label {
  font-size: .65rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: .14em; color: rgba(255,255,255,.4);
  display: flex; align-items: center; gap: 8px;
}
.obs-label::before {
  content: ''; width: 14px; height: 2px;
  background: var(--gold,#c9973a); border-radius: 2px; display: block;
}
.obs-view-all {
  font-size: .68rem; font-weight: 700; color: var(--gold,#c9973a);
  background: none; border: none; cursor: pointer; padding: 0;
  display: flex; align-items: center; gap: 4px; transition: opacity .15s;
}
.obs-view-all:hover { opacity: .75; }

/* Featured horizontal card */
.obs-feature {
  display: flex; border-radius: 12px; overflow: hidden;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  cursor: pointer; transition: border-color .2s, transform .2s, box-shadow .2s;
  margin-bottom: 10px; animation: obs-fade .35s ease both;
}
.obs-feature:hover {
  border-color: rgba(201,151,58,.42);
  transform: translateY(-2px);
  box-shadow: 0 12px 36px rgba(0,0,0,.4);
}
.obs-feature-img-wrap {
  flex-shrink: 0; width: 160px; position: relative; overflow: hidden;
}
@media (max-width: 560px) { .obs-feature-img-wrap { width: 110px; } }
.obs-feature-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform .35s;
}
.obs-feature:hover .obs-feature-img { transform: scale(1.05); }
.obs-feature-img-ph {
  width: 100%; height: 100%; min-height: 100px;
  background: linear-gradient(135deg,#1a1200,#0d0d0d);
  display: flex; align-items: center; justify-content: center; font-size: 2rem;
}
.obs-feature-body {
  flex: 1; padding: 14px 16px; display: flex; flex-direction: column;
  justify-content: center; gap: 6px; min-width: 0;
}
.obs-feature-badge {
  display: inline-block; font-size: .58rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: .08em;
  background: rgba(201,151,58,.9); color: #000;
  padding: 2px 7px; border-radius: 3px; width: fit-content;
}
.obs-feature-title {
  font-size: .92rem; font-weight: 700; color: #f1f1f1; line-height: 1.38;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.obs-feature-excerpt {
  font-size: .74rem; color: rgba(255,255,255,.46); line-height: 1.58;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.obs-feature-meta {
  font-size: .64rem; color: rgba(255,255,255,.28);
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
.obs-feature-cta {
  font-size: .68rem; font-weight: 700; color: var(--gold,#c9973a);
  display: flex; align-items: center; gap: 4px;
}

/* Small list items */
.obs-list { display: flex; flex-direction: column; gap: 8px; }
.obs-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border-radius: 9px; background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.06); cursor: pointer;
  transition: background .15s, border-color .15s, transform .15s;
  animation: obs-fade .32s ease both;
}
.obs-item:hover {
  background: rgba(255,255,255,.06);
  border-color: rgba(201,151,58,.25);
  transform: translateX(3px);
}
.obs-item-num {
  font-size: .68rem; font-weight: 900; color: rgba(201,151,58,.4);
  width: 18px; flex-shrink: 0; text-align: center; font-variant-numeric: tabular-nums;
}
.obs-item-img-wrap {
  flex-shrink: 0; width: 52px; height: 36px; border-radius: 5px;
  overflow: hidden; background: #1a1a1a;
}
.obs-item-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.obs-item-img-ph {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center; font-size: 1rem;
  background: linear-gradient(135deg,#1a1200,#0d0d0d);
}
.obs-item-body { flex: 1; min-width: 0; }
.obs-item-cat {
  font-size: .58rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: .08em; color: var(--gold,#c9973a); margin-bottom: 2px;
}
.obs-item-title {
  font-size: .78rem; font-weight: 600; color: #f1f1f1; line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.obs-item-meta { font-size: .62rem; color: rgba(255,255,255,.26); margin-top: 2px; }
.obs-item-arrow {
  font-size: .7rem; color: rgba(255,255,255,.15); flex-shrink: 0;
  transition: color .15s, transform .15s;
}
.obs-item:hover .obs-item-arrow { color: var(--gold,#c9973a); transform: translateX(2px); }

/* Empty / loading */
.obs-empty {
  padding: 24px 0; text-align: center; color: rgba(255,255,255,.22);
  font-size: .8rem;
}
`;

function OverviewBlogSection({ movieTitle, onNavigate }) {
  const [posts,   setPosts]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!movieTitle) return;
    fetch(`${BLOG_API}/blog?q=${encodeURIComponent(movieTitle)}&limit=6`)
      .then(r => r.json())
      .then(data => {
        const list = (data.posts || data || []).filter(p =>
          p.movieTitle === movieTitle || (p.title || "").includes(movieTitle)
        );
        setPosts(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [movieTitle]);

  if (loading || posts.length === 0) return null;

  const [feature, ...rest] = posts;
  const fmtD = d => d ? new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";

  return (
    <div className="obs-wrap">
      <style>{OBS_CSS}</style>

      <div className="obs-header">
        <div className="obs-label">✍️ Articles about this film</div>
        <button className="obs-view-all" onClick={() => onNavigate("/blog")}>
          All articles →
        </button>
      </div>

      {/* Featured article */}
      <div className="obs-feature" onClick={() => onNavigate(`/blog/${feature.slug}`)}>
        <div className="obs-feature-img-wrap">
          {feature.coverImage
            ? <img src={feature.coverImage} alt={feature.title} className="obs-feature-img" loading="lazy" onError={e => e.target.style.display="none"} />
            : <div className="obs-feature-img-ph">✍️</div>
          }
        </div>
        <div className="obs-feature-body">
          <span className="obs-feature-badge">{feature.category || "Article"}</span>
          <div className="obs-feature-title">{feature.title}</div>
          {feature.excerpt && <div className="obs-feature-excerpt">{feature.excerpt}</div>}
          <div className="obs-feature-meta">
            <span>📅 {fmtD(feature.createdAt)}</span>
            {feature.readTime && <span>⏱ {feature.readTime} min</span>}
            {feature.views > 0 && <span>👁 {feature.views.toLocaleString()}</span>}
          </div>
          <div className="obs-feature-cta">Read full article →</div>
        </div>
      </div>

      {/* Numbered list of the rest */}
      {rest.length > 0 && (
        <div className="obs-list">
          {rest.map((post, i) => (
            <div
              key={post._id}
              className="obs-item"
              style={{ animationDelay: `${(i + 1) * 55}ms` }}
              onClick={() => onNavigate(`/blog/${post.slug}`)}
            >
              <div className="obs-item-num">0{i + 2}</div>
              <div className="obs-item-img-wrap">
                {post.coverImage
                  ? <img src={post.coverImage} alt={post.title} className="obs-item-img" loading="lazy" onError={e => e.target.style.display="none"} />
                  : <div className="obs-item-img-ph">✍️</div>
                }
              </div>
              <div className="obs-item-body">
                <div className="obs-item-cat">{post.category || "Article"}</div>
                <div className="obs-item-title">{post.title}</div>
                <div className="obs-item-meta">
                  {fmtD(post.createdAt)}{post.readTime ? ` · ${post.readTime} min read` : ""}
                </div>
              </div>
              <div className="obs-item-arrow">›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════
export default function MovieDetails({ production, onToast, portalMode }) {
  const { slug }     = useParams();
  const id           = extractId(slug) || slug;  // support both ObjectId and slug URLs
  const navigate     = useNavigate();
  const location     = useLocation();
  const trailerRef   = useRef(null);

  const [movie,    setMovie]    = useState(null);
  // Pre-fill from cache so related sections appear instantly on fast connections
  const [allMovies, setAllMovies] = useState(() => Cache.peek("movies") || []);
  const [tab,      setTab]      = useState("overview");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const isOwner  = !!(getToken()&&production&&movie&&String(movie.productionId?._id||movie.productionId)===String(production._id));
  const isCollab = !!(getToken()&&production&&movie&&(movie.collaborators||[]).some(c=>String(c._id||c)===String(production._id)));
  const canNews  = isOwner||isCollab;

  const [editing,    setEditing]    = useState(false);
  const [editForm,   setEditForm]   = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editBO,     setEditBO]     = useState(false);
  const [boForm,     setBoForm]     = useState({});
  const [savingBO,   setSavingBO]   = useState(false);
  const [newsModal,    setNewsModal]    = useState(false);
  const [editingNews,  setEditingNews]  = useState(null);
  const [addCastModal, setAddCastModal] = useState(false);
  const [addSongModal, setAddSongModal] = useState(false);
  const [editTrailer,  setEditTrailer]  = useState(false);
  const [trailerInput, setTrailerInput] = useState("");
  const [savingTrailer, setSavingTrailer] = useState(false);
  const [rvUser,    setRvUser]    = useState("");
  const [rvRating,  setRvRating]  = useState(0);   // 0 = not chosen yet
  const [rvHover,   setRvHover]   = useState(0);
  const [rvText,    setRvText]    = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [rvSuccess,    setRvSuccess]    = useState(false);
  const [rvError,      setRvError]      = useState("");
  const [heroRating,   setHeroRating]   = useState(() => { try { return parseInt(localStorage.getItem(`hero_r_${id}`)||"0",10)||0; } catch { return 0; } });
  const [heroHover,    setHeroHover]    = useState(0);
  const [heroFeedback, setHeroFeedback] = useState("");
  // New features
  const [watchlisted,  setWatchlisted]  = useState(() => { try { return JSON.parse(localStorage.getItem("op_watchlist")||"[]").includes(String(id)); } catch { return false; } });
  const [seenPoll,     setSeenPoll]     = useState(() => { try { return localStorage.getItem(`seen_${id}`)||null; } catch { return null; } });
  const [viewCount,    setViewCount]    = useState(() => { try { const k=`views_${id}`; const n=(parseInt(localStorage.getItem(k)||"0",10))+1; localStorage.setItem(k,String(n)); return n; } catch { return 0; } });
  const [showShare,    setShowShare]    = useState(false);
  const [miniHeader,   setMiniHeader]   = useState(false);
  const heroRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    API.getMovie(id)
      .then(m => {
        setMovie(m);
        setEditForm({...m});
        setBoForm({...(m.boxOffice||{}), verdict: m.verdict});
        setTrailerInput(m.media?.trailer?.ytId||"");
        setLoading(false);
        // Defer allMovies via cache — instant if already loaded from another page
        const tid = typeof requestIdleCallback !== "undefined"
          ? requestIdleCallback(() => Cache.getMovies().catch(()=>[]).then(all => setAllMovies(all)))
          : setTimeout(() => Cache.getMovies().catch(()=>[]).then(all => setAllMovies(all)), 300);
        return () => typeof requestIdleCallback !== "undefined" ? cancelIdleCallback(tid) : clearTimeout(tid);
      })
      .catch(e => { setError(typeof e==="string"?e:"Failed to load"); setLoading(false); });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Sticky mini-header on scroll
  useEffect(() => {
    const onScroll = () => {
      if (!heroRef.current) return;
      setMiniHeader(heroRef.current.getBoundingClientRect().bottom < 60);
    };
    window.addEventListener("scroll", onScroll, { passive:true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Scroll to trailer if navigated here with scrollTo:"trailer" state ──
  useEffect(() => {
    if (location.state?.scrollTo === "trailer" && !loading && movie) {
      // Switch to overview tab (where the embedded trailer lives)
      setTab("overview");
      // Small delay so the tab content renders before we scroll
      setTimeout(() => {
        trailerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      // Clear the state so a manual tab-switch later doesn't re-trigger
      window.history.replaceState({}, "");
    }
  }, [location.state, loading, movie]);

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const up = await API.updateMovie(id,{
        title:editForm.title, category:editForm.category, genre:editForm.genre,
        releaseDate:editForm.releaseDate, releaseTBA:editForm.releaseTBA,
        director:editForm.director, producer:editForm.producer,
        budget:editForm.budget, language:editForm.language,
        synopsis:editForm.synopsis, posterUrl:editForm.posterUrl,
        thumbnailUrl:editForm.thumbnailUrl,
        runtime:editForm.runtime, imdbId:editForm.imdbId, imdbRating:editForm.imdbRating,
        verdict:editForm.verdict,
      });
      setMovie(m=>({...m,...up})); setEditing(false);
      onToast&&onToast("Movie updated!");
    } catch(e) { onToast&&onToast(typeof e==="string"?e:"Save failed","error"); }
    finally { setSavingEdit(false); }
  };

  const saveBO = async () => {
    setSavingBO(true);
    try { const up = await API.updateBoxOffice(id,boForm); setMovie(m=>({...m,...up})); setEditBO(false); onToast&&onToast("Box office updated!"); }
    catch(e) { onToast&&onToast(typeof e==="string"?e:"Save failed","error"); }
    finally { setSavingBO(false); }
  };

  const saveTrailer = async () => {
    setSavingTrailer(true);
    try { const up = await API.updateTrailer(id,{ytId:trailerInput.trim()}); setMovie(m=>({...m,media:{...m.media,trailer:{ytId:trailerInput.trim()}}})); setEditTrailer(false); onToast&&onToast("Trailer updated!"); }
    catch(e) { onToast&&onToast(typeof e==="string"?e:"Save failed","error"); }
    finally { setSavingTrailer(false); }
  };

  const removeCast = async (castId) => {
    if (!window.confirm("Remove this person?")) return;
    try { const up = await API.removeCastFromMovie(id,castId); setMovie(m=>({...m,cast:up.cast})); onToast&&onToast("Removed."); }
    catch(e) { onToast&&onToast(typeof e==="string"?e:"Failed","error"); }
  };

  const removeSong = async (index) => {
    if (!window.confirm("Remove this song?")) return;
    try { const up = await API.removeSong(id,index); setMovie(m=>({...m,media:up.media})); onToast&&onToast("Song removed."); }
    catch(e) { onToast&&onToast(typeof e==="string"?e:"Failed","error"); }
  };

  const handleNewsSaved = (item, isEdit) => {
    setMovie(m=>({...m, news:isEdit?(m.news||[]).map(n=>n._id===item._id?item:n):[...(m.news||[]),item]}));
    onToast&&onToast(isEdit?"News updated!":"News published!");
  };

  const handleDeleteNews = async (newsId) => {
    if (!window.confirm("Delete this article?")) return;
    try { await API.deleteNews(newsId); setMovie(m=>({...m,news:(m.news||[]).filter(n=>n._id!==newsId)})); onToast&&onToast("News deleted."); }
    catch(e) { onToast&&onToast(typeof e==="string"?e:"Failed","error"); }
  };

  // Watchlist
  const toggleWatchlist = () => {
    try {
      const list = JSON.parse(localStorage.getItem("op_watchlist")||"[]");
      const sid = String(id);
      const next = watchlisted ? list.filter(x=>x!==sid) : [...list, sid];
      localStorage.setItem("op_watchlist", JSON.stringify(next));
      setWatchlisted(!watchlisted);
    } catch {}
  };

  // "Have you seen this?" poll
  const voteSeen = (answer) => {
    try { localStorage.setItem(`seen_${id}`, answer); } catch {}
    setSeenPoll(answer);
  };

  // Share
  const handleShare = () => {
    const url = window.location.href;
    const text = `🎬 ${movie.title}${movie.releaseDate?" ("+new Date(movie.releaseDate).getFullYear()+")":""} — Check it out on Ollypedia!`;
    if (navigator.share) { navigator.share({ title:movie.title, text, url }); }
    else { navigator.clipboard?.writeText(url).then(()=>onToast&&onToast("Link copied!")); }
  };

  // Quick rate from hero — auto-navigate to review form
  const reviewFormRef = useRef(null);
  const handleHeroRate = (star) => {
    setHeroRating(star);
    try { localStorage.setItem(`hero_r_${id}`, String(star)); } catch {}
    const labels = ["","Terrible 😞","Poor 😕","Average 😐","Good 😊","Excellent 🤩"];
    setHeroFeedback(labels[star]);
    setRvRating(star);
    // Switch to reviews tab and scroll to form
    setTab("reviews");
    setTimeout(() => {
      reviewFormRef.current?.scrollIntoView({ behavior:"smooth", block:"center" });
    }, 250);
    setTimeout(() => setHeroFeedback(""), 3000);
  };

  const submitReview = async (e) => {
    e.preventDefault();
    setRvError("");
    if (!rvUser.trim()) return setRvError("Please enter your name.");
    if (!rvRating)      return setRvError("Please select a star rating.");
    if (!rvText.trim()) return setRvError("Please write your review.");
    setSubmitting(true);
    try {
      const reviews = await API.postReview(id, { user:rvUser.trim(), rating:rvRating, text:rvText.trim() });
      setMovie(m=>({...m,reviews}));
      setRvUser(""); setRvText(""); setRvRating(0); setRvSuccess(true);
      setTimeout(()=>setRvSuccess(false), 4000);
      onToast&&onToast("Review submitted! 🎉");
    }
    catch(err) { setRvError(typeof err==="string"?err:"Failed to submit. Please try again."); }
    finally { setSubmitting(false); }
  };

  // ── Loading/Error ─────────────────────────────────────
  if (loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted)"}}>
      <div style={{textAlign:"center"}}>
        <div className="skeleton" style={{width:300,height:450,borderRadius:12,margin:"0 auto 24px"}} />
        <div className="skeleton" style={{height:20,width:200,margin:"0 auto 12px"}} />
        <div className="skeleton" style={{height:40,width:320,margin:"0 auto"}} />
      </div>
    </div>
  );
  if (error||!movie) return (
    <div className="page empty-state"><h3>Movie not found</h3><p>{error}</p>
      <Link to="/movies" className="btn btn-outline" style={{marginTop:16}}>← Back to Movies</Link>
    </div>
  );

  const avgRating = movie.reviews?.length
    ? (movie.reviews.reduce((s,r)=>s+r.rating,0)/movie.reviews.length).toFixed(1) : null;

  const setE = (k,v) => setEditForm(f=>({...f,[k]:v}));
  const setBo = (k,v) => setBoForm(f=>({...f,[k]:v}));
  const toggleGenre = (g) => setE("genre",(editForm.genre||[]).includes(g)?(editForm.genre||[]).filter(x=>x!==g):[...(editForm.genre||[]),g]);

  const crew   = (movie.cast||[]).filter(c=>["Director","Producer","Music Director","Cinematographer","Choreographer","Lyricist"].includes(c.type));
  const actors = (movie.cast||[]).filter(c=>!["Director","Producer","Music Director","Cinematographer","Choreographer","Lyricist"].includes(c.type));

  // Banner = thumbnailUrl > posterUrl > ytThumb
  const bannerImg = movie.thumbnailUrl || ytThumb(movie.media?.trailer?.ytId) || movie.posterUrl;
  const verdictColor = VERDICT_COLOR[movie.verdict] || "#7aaae8";

  // Related movies — same genre or same director, exclude self
  const relatedMovies = allMovies
    .filter(m => m._id !== id && (
      (movie.genre?.length && m.genre?.some(g => movie.genre.includes(g))) ||
      (movie.director && m.director === movie.director)
    ))
    .sort((a,b) => new Date(b.releaseDate||0) - new Date(a.releaseDate||0))
    .slice(0, 15);

  const sameDirector = allMovies
    .filter(m => m._id !== id && movie.director && m.director === movie.director)
    .sort((a,b) => new Date(b.releaseDate||0) - new Date(a.releaseDate||0))
    .slice(0, 12);

  const genreClass = movie.genre?.includes("Action") ? "genre-action" : movie.genre?.includes("Romance") ? "genre-romance" : movie.genre?.includes("Horror") ? "genre-horror" : "";
  const isBlockbuster = ["Blockbuster","Super Hit"].includes(movie.verdict);

  return (
    <div style={{ minHeight:"100vh", background:"#0f0f0f", color:"#f1f1f1" }} className={genreClass}>
      <SEO {...movieSEO(movie)} />

      {/* ── Sticky Mini Header ── */}
      <div className={`md-mini-header${miniHeader?" visible":""}`}>
        {movie.posterUrl && <img src={movie.posterUrl} alt={movie.title} className="md-mini-poster" onError={e=>e.target.style.display="none"}/>}
        <span className="md-mini-title">{movie.title}</span>
        {movie.verdict && <span className="md-mini-verdict" style={{background:`${verdictColor}22`,border:`1px solid ${verdictColor}`,color:verdictColor}}>{movie.verdict}</span>}
        {movie.media?.trailer?.ytId && (
          <button className="md-btn-play" style={{padding:"6px 14px",fontSize:".75rem"}} onClick={()=>{setTab("overview");setTimeout(()=>trailerRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),200);}}>▶ Trailer</button>
        )}
        <button className={`md-wl-btn${watchlisted?" active":""}`} style={{padding:"6px 12px",fontSize:".75rem"}} onClick={toggleWatchlist}>{watchlisted?"✓ Saved":"+ Watchlist"}</button>
      </div>
      <Helmet>
        {movie && <script type="application/ld+json">{JSON.stringify({
          "@context":"https://schema.org","@type":"Movie",
          "name":movie.title,"description":movie.synopsis?.slice(0,300),
          "image":movie.posterUrl||movie.thumbnailUrl,
          "datePublished":movie.releaseDate,"duration":movie.runtime,
          "director":movie.director?{"@type":"Person","name":movie.director}:undefined,
          "contentRating":movie.contentRating,"genre":movie.genre,
          "inLanguage":movie.language||"or",
          "aggregateRating":movie.reviews?.length?{"@type":"AggregateRating","ratingValue":(movie.reviews.reduce((s,r)=>s+(r.rating||0),0)/movie.reviews.length).toFixed(1),"reviewCount":movie.reviews.length,"bestRating":"5","worstRating":"1"}:undefined,
          "trailer":movie.media?.trailer?.ytId?{"@type":"VideoObject","name":movie.title+" Trailer","embedUrl":"https://www.youtube.com/embed/"+movie.media.trailer.ytId}:undefined,
        })}</script>}
      </Helmet>

      <style>{`
        /* ── Movie Detail Page ── */
        .md-root { min-height:100vh; background:#0f0f0f; color:#f1f1f1; padding-top:58px; }

        /* ── Hero ── */
        .md-hero {
          position: relative;
          overflow: hidden;
          background: #0a0a0a;
          /* min-height so the hero feels tall even without long content */
          min-height: 420px;
        }
        @media(min-width:600px){ .md-hero { min-height: 480px; } }
        @media(min-width:900px){ .md-hero { min-height: 520px; } }

        /* Blurred backdrop — the key: fill the whole hero, not clipped too tight */
        .md-hero-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center 20%;
          /* brightness .35 = visible but dark, not pitch black */
          filter: blur(0px) brightness(.35) saturate(1.2);
          transform: scale(1.05); /* slight scale prevents blur edge bleeding */
        }

        /* Two-layer gradient:
           left-to-right: dark on left so poster/text are legible
           top-to-bottom: fades to solid #0a0a0a at bottom so page flows in */
        .md-hero-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to right,
              rgba(10,10,10,.88) 0%,
              rgba(10,10,10,.55) 50%,
              rgba(10,10,10,.25) 100%
            ),
            linear-gradient(to bottom,
              transparent 0%,
              transparent 55%,
              rgba(10,10,10,.85) 80%,
              #0a0a0a 100%
            );
        }

        .md-hero-inner {
          position: relative;
          z-index: 2;
          max-width: 1200px;
          margin: 0 auto;
          padding: 16px 14px 36px;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-end;
        }
        @media(min-width:480px){ .md-hero-inner { padding: 24px 20px 44px; gap: 20px; } }
        @media(min-width:600px){ .md-hero-inner { padding: 32px 24px 48px; gap: 28px; flex-wrap:nowrap; } }
        @media(min-width:900px){ .md-hero-inner { padding: 44px 40px 56px; gap: 40px; } }

        /* Poster — taller, more cinematic */
        .md-poster {
          flex-shrink: 0;
          width: clamp(90px, 22vw, 220px);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,.6), 0 24px 64px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.1);
          background: #1a1a1a;
        }
        @media(max-width:480px){ .md-poster { width: 80px; border-radius:8px; } }
        .md-poster img { width: 100%; display: block; }
        .md-poster-ph {
          aspect-ratio: 2/3;
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; color: rgba(255,255,255,.2);
        }

        /* Info column */
        .md-info { flex:1; min-width:0; padding-top:2px; }
        .md-tags { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
        .md-tag {
          font-size:.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
          padding:3px 9px; border-radius:20px;
          background:rgba(201,151,58,.14); border:1px solid rgba(201,151,58,.35); color:#c9973a;
        }
        .md-tag-outline {
          font-size:.62rem; font-weight:600;
          padding:3px 9px; border-radius:20px;
          background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.15); color:rgba(255,255,255,.7);
        }
        .md-title {
          font-family:'Playfair Display',serif;
          font-size:clamp(1.2rem,5vw,2.8rem);
          font-weight:900; line-height:1.08; margin:0 0 8px;
          color:#fff; text-shadow:0 2px 20px rgba(0,0,0,.5);
        }
        .md-score-row {
          display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-bottom:10px;
        }
        .md-rating { display:flex; align-items:center; gap:5px; }
        .md-rating-num { color:#c9973a; font-size:1.1rem; font-weight:800; }
        .md-rating-stars { color:#c9973a; font-size:.82rem; }
        .md-rating-cnt { color:rgba(255,255,255,.4); font-size:.72rem; }
        .md-verdict-badge {
          font-size:.64rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em;
          padding:4px 12px; border-radius:4px;
        }
        .md-meta-row {
          display:flex; flex-wrap:wrap; gap:4px 12px;
          font-size:clamp(.7rem,2.5vw,.78rem); color:rgba(255,255,255,.55);
          margin-bottom:10px; align-items:center;
        }
        .md-meta-row span { display:flex; align-items:center; gap:4px; }
        .md-synopsis {
          font-size:clamp(.8rem,2.5vw,.88rem); color:rgba(255,255,255,.68);
          line-height:1.65; margin:0 0 14px;
          max-width:620px;
          display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
        }
        @media(min-width:480px){ .md-synopsis { -webkit-line-clamp:4; } }
        @media(min-width:768px){ .md-synopsis { -webkit-line-clamp:5; } }
        .md-actions { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
        @media(max-width:480px){ .md-actions .md-btn-play { font-size:.78rem; padding:8px 14px; } .md-actions .md-btn-outline,.md-actions .md-wl-btn { font-size:.74rem; padding:7px 11px; } }
        .md-btn-play {
          display:inline-flex; align-items:center; gap:7px;
          background:#c9973a; color:#000; border:none;
          padding:10px 20px; border-radius:8px;
          font-size:.84rem; font-weight:800; cursor:pointer;
          transition:opacity .18s;
        }
        .md-btn-play:hover { opacity:.88; }
        .md-btn-outline {
          display:inline-flex; align-items:center; gap:6px;
          background:rgba(255,255,255,.09); color:#f1f1f1;
          border:1px solid rgba(255,255,255,.2);
          padding:10px 16px; border-radius:8px;
          font-size:.82rem; font-weight:600; cursor:pointer;
          transition:background .18s;
        }
        .md-btn-outline:hover { background:rgba(255,255,255,.15); }

        /* Box office chips row */
        .md-bo-row {
          display:flex; gap:10px; flex-wrap:wrap;
          padding:8px 12px;
          background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.08);
          border-radius:8px; width:fit-content; max-width:100%;
        }
        .md-bo-item { }
        .md-bo-label { font-size:.58rem; color:rgba(255,255,255,.38); text-transform:uppercase; letter-spacing:.07em; font-weight:700; margin-bottom:2px; }
        .md-bo-val   { font-size:.84rem; font-weight:800; color:#c9973a; }

        /* ── Sticky tabs ── */
        .md-tabs-bar {
          position:sticky; top:58px; z-index:20;
          background:rgba(15,15,15,.97);
          backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,.08);
          overflow-x:auto; scrollbar-width:none;
        }
        .md-tabs-bar::-webkit-scrollbar { display:none; }
        .md-tabs-inner {
          display:flex; padding:0 10px;
          min-width:max-content;
          -webkit-overflow-scrolling:touch;
        }
        @media(min-width:480px){ .md-tabs-inner { padding:0 14px; } }
        @media(min-width:600px){ .md-tabs-inner { padding:0 24px; } }
        @media(min-width:900px){ .md-tabs-inner { padding:0 40px; } }
        .md-tab {
          padding:11px 11px;
          background:none; border:none; cursor:pointer;
          font-weight:700; font-size:.78rem;
          color:rgba(255,255,255,.45);
          border-bottom:2px solid transparent;
          white-space:nowrap; transition:all .18s;
          flex-shrink:0;
        }
        @media(min-width:480px){ .md-tab { padding:12px 14px; font-size:.78rem; } }
        @media(min-width:600px){ .md-tab { padding:13px 18px; font-size:.8rem; } }
        .md-tab.on { color:#c9973a; border-bottom-color:#c9973a; }
        .md-tab:hover:not(.on) { color:#f1f1f1; }

        /* ── Tab body ── */
        .md-body {
          max-width:1200px; margin:0 auto;
          padding:24px 16px 60px;
          background:#0f0f0f;
        }
        @media(min-width:600px){ .md-body { padding:28px 24px 60px; } }
        @media(min-width:900px){ .md-body { padding:32px 40px 60px; } }

        /* Section heading inside tabs */
        .md-sec-label {
          font-size:.66rem; font-weight:800; text-transform:uppercase;
          letter-spacing:.1em; color:rgba(255,255,255,.38);
          margin:0 0 12px;
        }

        /* Crew pill */
        .md-crew-pill {
          display:inline-flex; align-items:center; gap:8px;
          background:#1a1a1a; border:1px solid rgba(255,255,255,.09);
          border-radius:8px; padding:7px 12px; cursor:pointer;
          transition:border-color .16s;
        }
        .md-crew-pill:hover { border-color:rgba(201,151,58,.45); }
        .md-crew-av {
          width:28px; height:28px; border-radius:50%; overflow:hidden;
          background:#272727; display:flex; align-items:center; justify-content:center;
          font-size:.8rem; flex-shrink:0;
        }
        .md-crew-av img { width:100%; height:100%; object-fit:cover; }
        .md-crew-name { font-size:.78rem; font-weight:700; line-height:1.2; color:#f1f1f1; }
        .md-crew-role { font-size:.6rem; color:#c9973a; font-weight:600; }

        /* Actor circle */
        .md-actor {
          flex-shrink:0; width:72px; text-align:center; cursor:pointer;
        }
        .md-actor-av {
          width:56px; height:56px; border-radius:50%; overflow:hidden;
          background:#272727; margin:0 auto 5px;
          border:2px solid rgba(255,255,255,.1);
          display:flex; align-items:center; justify-content:center;
          font-size:1.3rem; transition:border-color .16s;
        }
        @media(min-width:480px){ .md-actor-av { width:64px; height:64px; } }
        .md-actor-av img { width:100%; height:100%; object-fit:cover; }
        .md-actor-name { font-size:.66rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f1f1f1; }
        .md-actor-role { font-size:.58rem; color:#c9973a; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* Song card */
        .md-song {
          flex-shrink:0; width:160px; cursor:pointer;
          border-radius:10px; overflow:hidden;
          background:#1a1a1a; border:1px solid rgba(255,255,255,.08);
          transition:all .2s; box-shadow:0 2px 8px rgba(0,0,0,.3);
        }
        .md-song:hover { border-color:#c9973a; transform:translateY(-3px); box-shadow:0 8px 24px rgba(0,0,0,.5); }
        .md-song-thumb {
          width:100%; aspect-ratio:16/9; background:#272727;
          position:relative; overflow:hidden;
        }
        .md-song-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .2s; }
        .md-song:hover .md-song-thumb img { transform:scale(1.05); }
        .md-song-icon {
          position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(0,0,0,.3); font-size:1.5rem; transition:opacity .2s;
        }
        .md-song:hover .md-song-icon { background:rgba(0,0,0,.5); }
        .md-song-icon::after { content:"▶"; position:absolute; width:32px; height:32px; border-radius:50%; background:rgba(201,151,58,.9); display:flex; align-items:center; justify-content:center; font-size:.75rem; color:#000; opacity:0; transition:opacity .2s; }
        .md-song:hover .md-song-icon::after { opacity:1; }
        .md-song-info { padding:8px 10px; }
        .md-song-title { font-size:.76rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f1f1f1; }
        .md-song-singer { font-size:.65rem; color:#c9973a; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* Cast full grid */
        .md-cast-grid {
          display:grid;
          grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
          gap:10px;
        }
        @media(min-width:480px){ .md-cast-grid { grid-template-columns:repeat(auto-fill,minmax(155px,1fr)); gap:12px; } }
        .md-cast-card {
          background:#1a1a1a; border:1px solid rgba(255,255,255,.08);
          border-radius:10px; overflow:hidden; cursor:pointer;
          transition:border-color .16s;
        }
        .md-cast-card:hover { border-color:rgba(201,151,58,.4); }
        .md-cast-img {
          width:100%; aspect-ratio:3/4; background:#272727;
          display:flex; align-items:center; justify-content:center;
          font-size:2.5rem; overflow:hidden; position:relative;
        }
        .md-cast-img img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:top; }
        .md-cast-meta { padding:8px 10px; }
        .md-cast-cname { font-size:.78rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f1f1f1; }
        .md-cast-type  { font-size:.64rem; color:#c9973a; margin-top:2px; font-weight:600; }
        .md-cast-role  { font-size:.62rem; color:rgba(255,255,255,.4); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* Box office table */
        .md-bo-table { width:100%; border-collapse:collapse; }
        .md-bo-table td { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.06); font-size:.85rem; }
        .md-bo-table td:first-child { color:rgba(255,255,255,.45); font-size:.72rem; text-transform:uppercase; letter-spacing:.07em; font-weight:700; width:140px; }
        .md-bo-table td:last-child { color:#f1f1f1; font-weight:600; }

        /* Scroll rows */
        .md-hscroll { display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; }
        .md-hscroll::-webkit-scrollbar { display:none; }
        @media(min-width:480px){ .md-hscroll { gap:12px; } }

        /* Trailer embed */
        .md-trailer { width:100%; max-width:720px; aspect-ratio:16/9; border-radius:10px; overflow:hidden; background:#000; }
        .md-trailer iframe { width:100%; height:100%; border:none; display:block; }

        /* Divider */
        .md-divider { border:none; border-top:1px solid rgba(255,255,255,.07); margin:24px 0; }

        /* Production chip */
        .md-prod-chip {
          display:inline-flex; align-items:center; gap:6px;
          background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12);
          border-radius:20px; padding:5px 12px;
          font-size:.73rem; font-weight:600; color:rgba(255,255,255,.7);
          text-decoration:none; transition:border-color .16s;
        }
        .md-prod-chip:hover { border-color:rgba(201,151,58,.45); color:#c9973a; }

        /* Empty */
        .md-empty { text-align:center; padding:48px 20px; color:rgba(255,255,255,.3); }
        .md-empty p { font-size:.84rem; margin:8px 0 0; }

        /* Sticky mini-header */
        .md-mini-header {
          position:fixed; top:58px; left:0; right:0; z-index:50;
          background:rgba(10,10,10,.97); backdrop-filter:blur(16px);
          border-bottom:1px solid rgba(255,255,255,.08);
          display:flex; align-items:center; gap:8px; padding:7px 14px;
          transform:translateY(-100%); transition:transform .3s ease;
          overflow:hidden;
        }
        @media(min-width:480px){ .md-mini-header { gap:12px; padding:8px 20px; } }
        .md-mini-header.visible { transform:translateY(0); }
        .md-mini-poster { width:32px; height:44px; border-radius:4px; object-fit:cover; flex-shrink:0; }
        .md-mini-title { font-weight:700; font-size:.88rem; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .md-mini-verdict { font-size:.62rem; font-weight:800; padding:2px 8px; border-radius:4px; flex-shrink:0; }

        /* Watchlist / Share buttons */
        .md-wl-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:8px; border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.06); color:#f1f1f1; font-size:.82rem; font-weight:600; cursor:pointer; transition:all .18s; font-family:inherit; }
        .md-wl-btn:hover { background:rgba(255,255,255,.12); }
        .md-wl-btn.active { background:rgba(201,151,58,.15); border-color:rgba(201,151,58,.5); color:#c9973a; }

        /* Popularity badge */
        .md-pop-badge { display:inline-flex; align-items:center; gap:5px; font-size:.7rem; color:rgba(255,150,80,.85); background:rgba(255,120,50,.08); border:1px solid rgba(255,120,50,.2); padding:3px 9px; border-radius:20px; }

        /* Verdict pulse for blockbuster */
        @keyframes md-pulse { 0%,100%{box-shadow:0 0 0 0 currentColor} 50%{box-shadow:0 0 0 6px transparent} }
        .verdict-blockbuster-pulse { animation:md-pulse 2.2s infinite; }

        /* Seen poll */
        .md-poll { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
        .md-poll-btn { padding:7px 16px; border-radius:20px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.05); color:rgba(255,255,255,.7); font-size:.78rem; font-weight:600; cursor:pointer; transition:all .18s; font-family:inherit; }
        .md-poll-btn:hover { background:rgba(201,151,58,.12); border-color:rgba(201,151,58,.4); color:#c9973a; }
        .md-poll-btn.selected { background:rgba(201,151,58,.18); border-color:#c9973a; color:#c9973a; }

        /* Song preview cards in overview */
        .md-song-preview { display:flex; align-items:center; gap:10px; padding:10px 12px; background:#1a1a1a; border:1px solid rgba(255,255,255,.07); border-radius:8px; cursor:pointer; transition:border-color .15s; }
        .md-song-preview:hover { border-color:rgba(201,151,58,.4); }
        .md-song-thumb { width:54px; height:36px; border-radius:5px; overflow:hidden; background:#272727; position:relative; flex-shrink:0; }
        .md-song-thumb img { width:100%;height:100%;object-fit:cover; }
        .md-song-play-icon { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);font-size:.85rem; }

        /* Cast hover card */
        .md-cast-card { position:relative; }
        .md-cast-hover { display:none; position:absolute; bottom:calc(100%+8px); left:50%; transform:translateX(-50%); z-index:30; background:#1e1e1e; border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:12px 14px; width:200px; box-shadow:0 8px 30px rgba(0,0,0,.6); }
        .md-cast-card:hover .md-cast-hover { display:block; }

        /* ── Review System ── */
        .md-rv-avatar { width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1rem; flex-shrink:0; color:#000; box-shadow:0 2px 8px rgba(0,0,0,.4); }
        .md-rv-form { background:linear-gradient(135deg,rgba(30,25,10,.9),rgba(20,20,20,.9)); border:1px solid rgba(201,151,58,.2); border-radius:16px; padding:16px; margin-bottom:20px; }
        @media(min-width:480px){ .md-rv-form { padding:22px 24px; } }
        .md-rv-form-title { font-size:1rem; font-weight:800; margin:0 0 4px; }
        .md-rv-form-sub { font-size:.74rem; color:rgba(255,255,255,.4); margin:0 0 20px; }
        .md-rv-stars { display:flex; gap:6px; margin-bottom:16px; }
        .md-rv-star { font-size:2rem; cursor:pointer; transition:transform .15s; filter:grayscale(1) opacity(.3); user-select:none; line-height:1; }
        .md-rv-star.lit { filter:none; }
        .md-rv-star:hover { transform:scale(1.2); }
        .md-rv-star-label { font-size:.78rem; color:rgba(255,255,255,.5); margin-left:4px; align-self:center; }
        .md-rv-input { width:100%; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:10px; color:#f1f1f1; font-family:inherit; font-size:.86rem; padding:10px 14px; transition:border-color .2s; outline:none; box-sizing:border-box; }
        .md-rv-input:focus { border-color:rgba(201,151,58,.5); background:rgba(255,255,255,.08); }
        .md-rv-textarea { resize:vertical; min-height:100px; line-height:1.65; }
        .md-rv-char { font-size:.66rem; color:rgba(255,255,255,.3); text-align:right; margin-top:4px; }
        .md-rv-error { background:rgba(255,80,80,.1); border:1px solid rgba(255,80,80,.3); border-radius:8px; padding:8px 12px; font-size:.78rem; color:#ff9090; margin-bottom:12px; }
        .md-rv-success { background:rgba(80,200,120,.1); border:1px solid rgba(80,200,120,.3); border-radius:8px; padding:12px 16px; font-size:.84rem; color:#80e8a8; text-align:center; }
        .md-rv-submit { width:100%; padding:12px; border-radius:10px; background:linear-gradient(135deg,#c9973a,#a87830); border:none; color:#000; font-weight:800; font-size:.88rem; cursor:pointer; transition:opacity .18s; font-family:inherit; }
        .md-rv-submit:hover:not(:disabled) { opacity:.88; }
        .md-rv-submit:disabled { opacity:.5; cursor:default; }
        /* Summary bar */
        .md-rv-summary { display:flex; align-items:center; gap:20px; padding:18px 20px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:14px; margin-bottom:24px; flex-wrap:wrap; }
        .md-rv-big-score { font-size:3rem; font-weight:900; color:#c9973a; line-height:1; }
        .md-rv-bars { flex:1; min-width:180px; display:flex; flex-direction:column; gap:5px; }
        .md-rv-bar-row { display:flex; align-items:center; gap:8px; }
        .md-rv-bar-label { font-size:.66rem; color:rgba(255,255,255,.45); width:28px; text-align:right; flex-shrink:0; }
        .md-rv-bar-track { flex:1; height:6px; background:rgba(255,255,255,.1); border-radius:3px; overflow:hidden; }
        .md-rv-bar-fill { height:100%; background:linear-gradient(to right,#c9973a,#e8c87a); border-radius:3px; transition:width .6s ease; }
        .md-rv-bar-count { font-size:.64rem; color:rgba(255,255,255,.3); width:20px; flex-shrink:0; }
        /* Review cards */
        .md-rv-card { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:14px; padding:16px 18px; margin-bottom:12px; transition:border-color .15s; }
        .md-rv-card:hover { border-color:rgba(255,255,255,.12); }
        .md-rv-card-header { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        .md-rv-card-meta { flex:1; min-width:0; }
        .md-rv-card-name { font-weight:700; font-size:.88rem; }
        .md-rv-card-date { font-size:.66rem; color:rgba(255,255,255,.35); margin-top:2px; }
        .md-rv-card-stars { display:flex; gap:2px; margin-bottom:8px; }
        .md-rv-card-star { font-size:.88rem; }
        .md-rv-card-text { font-size:.84rem; line-height:1.72; color:rgba(255,255,255,.75); margin:0; }
        .md-rv-helpful { font-size:.7rem; color:rgba(255,255,255,.3); margin-top:10px; cursor:pointer; transition:color .15s; display:inline-flex; align-items:center; gap:4px; }
        .md-rv-helpful:hover { color:rgba(201,151,58,.8); }

        /* Genre color coding */
        .genre-action .md-hero-bg { filter:blur(0px) brightness(.32) saturate(1.6) hue-rotate(-10deg); }
        .genre-romance .md-hero-bg { filter:blur(0px) brightness(.32) saturate(1.4) hue-rotate(300deg); }
        .genre-horror .md-hero-bg { filter:blur(0px) brightness(.2) saturate(.8); }

        /* Skeleton shimmer */
        @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,#1a1a1a 25%,#252525 50%,#1a1a1a 75%); background-size:800px 100%; animation:shimmer 1.6s infinite; border-radius:8px; }

        /* Hero rating strip */
        .md-hero-rating-strip {
          display:flex; flex-direction:column; gap:10px;
          padding:12px 14px;
          background:rgba(0,0,0,.6); border:1px solid rgba(255,255,255,.1);
          border-radius:14px; backdrop-filter:blur(14px);
          width:200px;
          position:absolute; bottom:36px; right:14px; z-index:4;
        }
        @media(max-width:600px){
          .md-hero-rating-strip {
            position:static; width:100%;
            /* On mobile: full width row below poster+info */
            order:3; flex-basis:100%;
          }
        }
        .md-hero-avg { font-size:2rem; font-weight:900; color:#c9973a; line-height:1; flex-shrink:0; }
        .md-hero-bars { display:flex; flex-direction:column; gap:3px; flex-shrink:0; min-width:100px; }
        .md-hero-bar-row { display:flex; align-items:center; gap:5px; }
        .md-hero-bar-lbl { font-size:.56rem; color:rgba(255,255,255,.4); width:16px; text-align:right; flex-shrink:0; }
        .md-hero-bar-track { width:80px; height:4px; background:rgba(255,255,255,.1); border-radius:2px; overflow:hidden; }
        .md-hero-bar-fill { height:100%; background:#c9973a; border-radius:2px; transition:width .5s ease; }
        /* Quick rate widget in hero */
        .md-hero-quick-rate { }  /* stacked layout — no border needed */
        .md-hero-quick-lbl { font-size:.62rem; color:rgba(255,255,255,.4); text-transform:uppercase; letter-spacing:.07em; margin-bottom:5px; }
        .md-hero-stars { display:flex; gap:4px; }
        .md-hero-star { font-size:1.4rem; cursor:pointer; filter:grayscale(1) opacity(.35); transition:all .15s; user-select:none; }
        .md-hero-star.lit { filter:none; }
        .md-hero-star:hover { transform:scale(1.22); filter:none; }
        .md-hero-rate-feedback { font-size:.68rem; margin-top:4px; color:rgba(201,151,58,.85); min-height:16px; transition:opacity .3s; }

        /* Countdown in right panel */
        .md-cd-section { border-bottom:1px solid rgba(255,255,255,.08); padding-bottom:10px; margin-bottom:10px; }
        .md-cd-label { font-size:.58rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.35); margin-bottom:4px; display:flex; align-items:center; gap:5px; }

        /* Share overlay */
        .md-share-overlay { position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(8px); }
        .md-share-card { background:linear-gradient(145deg,#1a1200,#0f0a00,#0a0a0a);border:1px solid rgba(201,151,58,.4);border-radius:20px;width:100%;max-width:360px;overflow:hidden; }
      `}</style>

      {/* ══ HERO ══ */}
      <div className="md-hero" ref={heroRef}>
        {/* Blurred backdrop — visible, atmospheric */}
        {bannerImg && (
          <div className="md-hero-bg" style={{ backgroundImage:`url(${bannerImg})` }} />
        )}
        {/* Gradient overlay: left-dark + bottom-fade */}
        <div className="md-hero-overlay" />

        <div className="md-hero-inner">
          {/* ── Poster ── */}
          <div className="md-poster">
            {movie.posterUrl
              ? <img src={movie.posterUrl} alt={movie.title} loading="eager" decoding="async"
                  onError={e => e.target.style.display="none"} />
              : <div className="md-poster-ph">🎬</div>}
          </div>

          {/* ── Info ── */}
          <div className="md-info">
            {/* Back link */}
            <Link to="/movies" style={{ fontSize:".74rem", color:"rgba(255,255,255,.38)", textDecoration:"none", display:"inline-block", marginBottom:18, letterSpacing:".01em" }}>
              ← All Films
            </Link>

            {/* Genre / category tags */}
            <div className="md-tags">
              <span className="md-tag">{movie.category||"Feature Film"}</span>
              {movie.language && <span className="md-tag-outline">{movie.language}</span>}
              {movie.genre?.slice(0,3).map(g => <span key={g} className="md-tag-outline">{g}</span>)}
            </div>

            {/* Title */}
            <h1 className="md-title">{movie.title}</h1>

            {/* Verdict only — rating shown in the strip below */}
            <div className="md-score-row">
              <span className="md-verdict-badge" style={{
                background:`${verdictColor}25`,
                border:`1.5px solid ${verdictColor}`,
                color: verdictColor,
              }}>{movie.verdict||"Upcoming"}</span>
            </div>

            {/* Meta row */}
            <div className="md-meta-row">
              {movie.director  && <span>🎬 {movie.director}</span>}
              {(movie.releaseDate||movie.releaseTBA) && <span>🗓 {movie.releaseTBA?"TBA":fmtDate(movie.releaseDate)}</span>}
              {movie.runtime   && <span>⏱ {movie.runtime}</span>}
              {movie.budget    && <span>💰 {movie.budget}</span>}
              {movie.imdbRating && <span><span style={{color:"#f5c518",fontWeight:700,fontSize:".7rem"}}>IMDb</span> {movie.imdbRating}</span>}
            </div>

            {/* Synopsis */}
            {movie.synopsis && <p className="md-synopsis">{movie.synopsis}</p>}

            {/* CTA buttons */}
            <div className="md-actions">
              {movie.media?.trailer?.ytId && (
                <button className="md-btn-play" style={{...(isBlockbuster?{boxShadow:`0 0 0 0 ${verdictColor}`}:{})}} className={`md-btn-play${isBlockbuster?" verdict-blockbuster-pulse":""}`}
                  onClick={() => { setTab("overview"); setTimeout(() => trailerRef.current?.scrollIntoView({ behavior:"smooth", block:"center" }), 200); }}>▶ Watch Trailer</button>
              )}
              <button className="md-btn-outline" onClick={() => setTab("cast")}>👥 Cast</button>
              <button className="md-btn-outline" onClick={() => setTab("media")}>🎵 Songs</button>
              <button className={`md-wl-btn${watchlisted?" active":""}`} onClick={toggleWatchlist}>
                {watchlisted ? "✓ Watchlist" : "＋ Watchlist"}
              </button>
              <button className="md-wl-btn" onClick={handleShare}>📤 Share</button>
              {isOwner && (
                <button className="btn btn-gold btn-sm" onClick={() => { setEditing(true); setTab("overview"); }}>✏ Edit</button>
              )}
            </div>

            {/* Popularity + poll */}
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:12}}>
              <span className="md-pop-badge">🔥 {viewCount>=1000?(viewCount/1000).toFixed(1)+"K":viewCount} views</span>
              {!seenPoll
                ? <><span style={{fontSize:".74rem",color:"rgba(255,255,255,.4)"}}>Have you seen this?</span>
                    <button className="md-poll-btn" onClick={()=>voteSeen("yes")}>👍 Yes</button>
                    <button className="md-poll-btn" onClick={()=>voteSeen("no")}>👀 Not yet</button>
                    <button className="md-poll-btn" onClick={()=>voteSeen("watching")}>📺 Watching</button>
                  </>
                : <span style={{fontSize:".76rem",color:"rgba(201,151,58,.8)"}}>
                    {seenPoll==="yes"?"✓ You've seen this!":seenPoll==="watching"?"📺 Currently watching":"👀 Added to your list!"}
                  </span>
              }
            </div>

            {/* Production houses */}
            {(movie.productionId || (movie.collaborators||[]).length > 0) && (
              <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
                {movie.productionId && (
                  <Link to={`/production/${movie.productionId._id||movie.productionId}`} className="md-prod-chip">
                    {movie.productionId.logo && <SafeImg src={movie.productionId.logo} alt="" style={{width:15,height:15,borderRadius:3,objectFit:"cover"}} />}
                    {movie.productionId.name}
                  </Link>
                )}
                {(movie.collaborators||[]).map(c => (
                  <Link key={c._id||c} to={`/production/${c._id||c}`} className="md-prod-chip">
                    {c.logo && <SafeImg src={c.logo} alt="" style={{width:15,height:15,borderRadius:3,objectFit:"cover"}} />}
                    {c.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Box office mini-strip */}
            {(movie.boxOffice?.opening || movie.boxOffice?.firstWeek || movie.boxOffice?.total) && (
              <div className="md-bo-row">
                {movie.boxOffice.opening   && <div className="md-bo-item"><div className="md-bo-label">Opening</div><div className="md-bo-val">{movie.boxOffice.opening}</div></div>}
                {movie.boxOffice.firstWeek && <div className="md-bo-item"><div className="md-bo-label">First Week</div><div className="md-bo-val">{movie.boxOffice.firstWeek}</div></div>}
                {movie.boxOffice.total     && <div className="md-bo-item"><div className="md-bo-label">Total</div><div className="md-bo-val">{movie.boxOffice.total}</div></div>}
              </div>
            )}
          </div>

          {/* ── Rating strip: absolute top-right on desktop, below info on mobile ── */}
          {(() => {
            const reviews = movie.reviews || [];
            const total   = reviews.length;
            const avg     = total ? (reviews.reduce((s,r)=>s+(r.rating||0),0)/total).toFixed(1) : null;
            const dist    = [5,4,3,2,1].map(n=>({ n, count:reviews.filter(r=>r.rating===n).length }));
            return (
              <div className="md-hero-rating-strip">
                {/* Countdown for upcoming movies — at the top of the panel */}
                {movie.verdict === "Upcoming" && movie.releaseDate && (() => {
                  const diff = new Date(movie.releaseDate) - new Date();
                  return diff > 0 ? (
                    <div className="md-cd-section">
                      <div className="md-cd-label">🗓 Releasing in</div>
                      <CountdownDisplay releaseDate={movie.releaseDate} />
                    </div>
                  ) : null;
                })()}

                {avg && (
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{flexShrink:0,textAlign:"center"}}>
                      <div className="md-hero-avg">{avg}</div>
                      <div style={{display:"flex",gap:1,justifyContent:"center",marginTop:2}}>
                        {[1,2,3,4,5].map(s=>(
                          <span key={s} style={{fontSize:".6rem",filter:parseFloat(avg)>=s?"none":"grayscale(1) opacity(.25)"}}>⭐</span>
                        ))}
                      </div>
                      <div style={{fontSize:".56rem",color:"rgba(255,255,255,.35)",marginTop:2,whiteSpace:"nowrap"}}>{total} review{total!==1?"s":""}</div>
                    </div>
                    <div className="md-hero-bars" style={{flex:1}}>
                      {dist.map(({n,count})=>(
                        <div key={n} className="md-hero-bar-row">
                          <span className="md-hero-bar-lbl">{n}★</span>
                          <div className="md-hero-bar-track" style={{flex:1}}>
                            <div className="md-hero-bar-fill" style={{width:`${total?Math.round(count/total*100):0}%`}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {avg && <div style={{borderTop:"1px solid rgba(255,255,255,.08)"}}/>}

                {/* Interested widget — shows on ALL movies */}
                <InterestedWidget movieId={id} />

                {/* Star rating — only for released movies */}
                {movie.verdict !== "Upcoming" && (
                  <>
                    <div style={{borderTop:"1px solid rgba(255,255,255,.08)",margin:"8px 0"}}/>
                    <div>
                      <div className="md-hero-quick-lbl">{heroRating ? "Your rating" : "Rate this film"}</div>
                      <div className="md-hero-stars">
                        {[1,2,3,4,5].map(star=>(
                          <span key={star}
                            className={`md-hero-star${(heroHover||heroRating)>=star?" lit":""}`}
                            onMouseEnter={()=>setHeroHover(star)}
                            onMouseLeave={()=>setHeroHover(0)}
                            onClick={()=>handleHeroRate(star)}>⭐</span>
                        ))}
                      </div>
                      {(heroFeedback||(heroRating>0)) && (
                        <div className="md-hero-rate-feedback">
                          {heroFeedback || ["","Terrible 😞","Poor 😕","Average 😐","Good 😊","Excellent 🤩"][heroRating]}
                        </div>
                      )}
                      {heroRating > 0 && (
                        <button onClick={()=>setTab("reviews")}
                          style={{fontSize:".64rem",background:"none",border:"none",color:"rgba(201,151,58,.7)",cursor:"pointer",padding:0,marginTop:4,textDecoration:"underline",fontFamily:"inherit",display:"block"}}>
                          ✍️ Write a full review →
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          STICKY TABS
      ══════════════════════════════════════════ */}
      <div className="md-tabs-bar">
        <div className="md-tabs-inner">
          {["overview","cast","media","boxoffice","news","reviews"].map(t => (
            <button key={t} className={`md-tab${tab===t?" on":""}`}
              onClick={() => { setTab(t); setEditing(false); setEditBO(false); }}>
              {t==="boxoffice" ? "Box Office" : t.charAt(0).toUpperCase()+t.slice(1)}
              {t==="reviews" && movie.reviews?.length ? ` (${movie.reviews.length})` : ""}
              {t==="news"    && movie.news?.length    ? ` (${movie.news.length})`    : ""}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          TAB CONTENT
      ══════════════════════════════════════════ */}
      <div className="md-body">

        {/* ── OVERVIEW ── */}
        {tab==="overview" && !editing && (
          <div style={{ maxWidth:860 }}>
            {movie.synopsis
              ? <p style={{ color:"rgba(255,255,255,.7)", lineHeight:1.8, fontSize:"clamp(.86rem,2vw,.96rem)", marginBottom:28 }}>{movie.synopsis}</p>
              : <p style={{ color:"rgba(255,255,255,.35)" }}>No synopsis available.</p>}

            {/* Crew pills */}
            {crew.length > 0 && (
              <div style={{ marginBottom:24 }}>
                <p className="md-sec-label">Director & Crew</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {crew.slice(0,8).map((c,i) => (
                    <div key={c.castId||i} className="md-crew-pill"
                      onClick={() => c.castId && navigate(castPath({ _id:c.castId, name:c.name }))}>
                      <div className="md-crew-av">
                        {c.photo
                          ? <img src={c.photo} alt={c.name} loading="lazy" onError={e=>e.target.style.display="none"}/>
                          : "👤"}
                      </div>
                      <div>
                        <div className="md-crew-name">{c.name}</div>
                        <div className="md-crew-role">{c.type}{c.role?` · ${c.role}`:""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actor circles */}
            {actors.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <p className="md-sec-label" style={{ margin:0 }}>Cast</p>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize:".7rem" }} onClick={() => setTab("cast")}>See all →</button>
                </div>
                <div className="md-hscroll">
                  {actors.slice(0,14).map((c,i) => (
                    <div key={c.castId||i} className="md-actor"
                      onClick={() => c.castId && navigate(castPath({ _id:c.castId, name:c.name }))}
                      onMouseEnter={e => e.currentTarget.querySelector(".md-actor-av").style.borderColor="#c9973a"}
                      onMouseLeave={e => e.currentTarget.querySelector(".md-actor-av").style.borderColor="rgba(255,255,255,.1)"}>
                      <div className="md-actor-av">
                        {c.photo
                          ? <img src={c.photo} alt={c.name} loading="lazy" onError={e=>e.target.style.display="none"}/>
                          : "👤"}
                      </div>
                      <div className="md-actor-name">{c.name}</div>
                      {c.role && <div className="md-actor-role">{c.role}</div>}
                    </div>
                  ))}
                  {actors.length > 14 && (
                    <div className="md-actor" onClick={() => setTab("cast")} style={{ cursor:"pointer" }}>
                      <div className="md-actor-av" style={{ borderStyle:"dashed", borderColor:"#c9973a", background:"rgba(201,151,58,.08)", color:"#c9973a", fontSize:"1rem" }}>
                        +{actors.length-14}
                      </div>
                      <div className="md-actor-name" style={{ color:"#c9973a" }}>more</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Songs preview */}
            {(movie.media?.songs||[]).length > 0 && (
              <div style={{ marginBottom:28 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <p className="md-sec-label" style={{ margin:0 }}>Songs · {movie.media.songs.length}</p>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize:".7rem" }} onClick={() => setTab("media")}>See all →</button>
                </div>
                <div className="md-hscroll">
                  {movie.media.songs.slice(0,8).map((s,i) => (
                    <div key={i} className="md-song"
                      onClick={() => navigate(movie ? songPath(movie,i) : `/song/${id}/${i}`)}>
                      <div className="md-song-thumb">
                        {s.ytId && <img src={`https://img.youtube.com/vi/${s.ytId}/hqdefault.jpg`} alt={s.title} loading="lazy" onError={e=>{e.target.src=`https://img.youtube.com/vi/${s.ytId}/mqdefault.jpg`;}}/>}
                        <div className="md-song-icon">♪</div>
                      </div>
                      <div className="md-song-info">
                        <div className="md-song-title">{s.title}</div>
                        {s.singer && <div className="md-song-singer">{s.singer}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trailer */}
            {movie.media?.trailer?.ytId && (
              <div style={{ marginBottom:28 }}>
                <p className="md-sec-label">Official Trailer</p>
                <div ref={trailerRef} className="md-trailer">
                  <iframe src={`https://www.youtube.com/embed/${movie.media.trailer.ytId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen title="Trailer" />
                </div>
              </div>
            )}

            {/* ── Blog Articles ── */}
            <OverviewBlogSection movieTitle={movie.title} onNavigate={navigate} />

            {isOwner && (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", paddingTop:16, borderTop:"1px solid rgba(255,255,255,.07)" }}>
                <button className="btn btn-gold btn-sm" onClick={() => setEditing(true)}>✏ Edit Details</button>
                <button className="btn btn-outline btn-sm" onClick={() => { setEditBO(true); setTab("boxoffice"); }}>📊 Box Office</button>
              </div>
            )}
          </div>
        )}

        {/* ── OVERVIEW EDIT ── */}
        {tab==="overview" && editing && (
          <div style={{ maxWidth:900 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <h3 style={{ fontSize:"1rem", textTransform:"uppercase", letterSpacing:"0.08em", color:"rgba(255,255,255,.45)" }}>Edit Movie Details</h3>
              <div style={{ display:"flex", gap:10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn-gold btn-sm" onClick={saveEdit} disabled={savingEdit}>{savingEdit?"Saving…":"Save Changes"}</button>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={editForm.title||""} onChange={e=>setE("title",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Language</label><input className="form-input" value={editForm.language||""} onChange={e=>setE("language",e.target.value)} /></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Category</label><select className="form-select" value={editForm.category||""} onChange={e=>setE("category",e.target.value)}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Release Date</label>
                <input className="form-input" type="date" value={editForm.releaseDate||""} onChange={e=>setE("releaseDate",e.target.value)} disabled={editForm.releaseTBA} />
                <label style={{marginTop:6,display:"flex",alignItems:"center",gap:6,fontSize:"0.8rem",color:"var(--muted)",cursor:"pointer"}}>
                  <input type="checkbox" checked={!!editForm.releaseTBA} onChange={e=>setE("releaseTBA",e.target.checked)} /> TBA
                </label>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Director</label><input className="form-input" value={editForm.director||""} onChange={e=>setE("director",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Producer</label><input className="form-input" value={editForm.producer||""} onChange={e=>setE("producer",e.target.value)} /></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Runtime</label><input className="form-input" value={editForm.runtime||""} onChange={e=>setE("runtime",e.target.value)} placeholder="e.g. 2h 15m" /></div>
              <div className="form-group"><label className="form-label">IMDb Rating</label><input className="form-input" value={editForm.imdbRating||""} onChange={e=>setE("imdbRating",e.target.value)} placeholder="7.5" /></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Poster URL</label><input className="form-input" value={editForm.posterUrl||""} onChange={e=>setE("posterUrl",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Verdict</label><select className="form-select" value={editForm.verdict||"Upcoming"} onChange={e=>setE("verdict",e.target.value)}>{VDICT.map(v=><option key={v}>{v}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Genres</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {GENRES.map(g=>(
                  <button key={g} type="button" className={`btn btn-sm ${(editForm.genre||[]).includes(g)?"btn-gold":"btn-outline"}`} onClick={()=>toggleGenre(g)}>{g}</button>
                ))}
              </div>
            </div>
            <div className="form-group"><label className="form-label">Synopsis</label><textarea className="form-textarea" value={editForm.synopsis||""} onChange={e=>setE("synopsis",e.target.value)} style={{minHeight:100}} /></div>
            <div className="form-group"><label className="form-label">Thumbnail URL</label><input className="form-input" value={editForm.thumbnailUrl||""} onChange={e=>setE("thumbnailUrl",e.target.value)} /></div>
          </div>
        )}

        {/* ── CAST ── */}
        {tab==="cast" && (
          <div>
            {isOwner && (
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:20 }}>
                <button className="btn btn-gold btn-sm" onClick={() => setAddCastModal(true)}>+ Add Cast</button>
              </div>
            )}
            {/* Cast stats summary */}
            {(movie.cast||[]).length > 0 && (
              <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:24,padding:"14px 16px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:10}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:"1.3rem",fontWeight:800,color:"var(--gold)"}}>{actors.length}</div><div style={{fontSize:".64rem",color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".06em"}}>Actors</div></div>
                <div style={{textAlign:"center"}}><div style={{fontSize:"1.3rem",fontWeight:800,color:"var(--gold)"}}>{crew.length}</div><div style={{fontSize:".64rem",color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".06em"}}>Crew</div></div>
                {movie.director&&<div style={{textAlign:"center"}}><div style={{fontSize:".82rem",fontWeight:700,color:"#f1f1f1"}}>{movie.director}</div><div style={{fontSize:".64rem",color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".06em"}}>Director</div></div>}
              </div>
            )}
            {/* Crew section */}
            {crew.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <p className="md-sec-label">Director & Crew</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {crew.map((c,i) => (
                    <div key={c.castId||i} className="md-crew-pill"
                      onClick={() => c.castId && navigate(portalMode?`/portal/cast/${c.castId}`:castPath({ _id:c.castId, name:c.name }))}>
                      <div className="md-crew-av">
                        {c.photo ? <img src={c.photo} alt={c.name} loading="lazy" onError={e=>e.target.style.display="none"}/> : "👤"}
                      </div>
                      <div>
                        <div className="md-crew-name">{c.name}</div>
                        <div className="md-crew-role">{c.type}{c.role?` · ${c.role}`:""}</div>
                      </div>
                      {isOwner && <button style={{marginLeft:8,background:"none",border:"none",color:"rgba(255,100,100,.6)",cursor:"pointer",fontSize:".75rem"}} onClick={e=>{e.stopPropagation();removeCast(c.castId);}}>✕</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Actors grid */}
            {actors.length > 0 && (
              <div>
                <p className="md-sec-label">Actors & Actresses</p>
                <div className="md-cast-grid">
                  {actors.map((c,i) => (
                    <div key={c.castId||i} className="md-cast-card"
                      onClick={() => c.castId && navigate(portalMode?`/portal/cast/${c.castId}`:castPath({ _id:c.castId, name:c.name }))}>
                      <div className="md-cast-img">
                        {c.photo ? <img src={c.photo} alt={c.name} loading="lazy" onError={e=>e.target.style.display="none"}/> : "👤"}
                        {isOwner && <button style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",border:"none",color:"rgba(255,100,100,.8)",cursor:"pointer",borderRadius:4,fontSize:".72rem",padding:"2px 6px"}} onClick={e=>{e.stopPropagation();removeCast(c.castId);}}>✕</button>}
                      </div>
                      <div className="md-cast-meta">
                        <div className="md-cast-cname">{c.name}</div>
                        <div className="md-cast-type">{c.type}</div>
                        {c.role && <div className="md-cast-role">{c.role}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(movie.cast||[]).length === 0 && (
              <div className="md-empty"><span style={{fontSize:"2.5rem"}}>👤</span><p>No cast added yet.</p></div>
            )}
          </div>
        )}

        {/* ── MEDIA (Songs + Trailer) ── */}
        {tab==="media" && (
          <div>
            {isOwner && (
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:20, gap:10 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setEditTrailer(true)}>🎬 Edit Trailer</button>
                <button className="btn btn-gold btn-sm" onClick={() => setAddSongModal(true)}>+ Add Song</button>
              </div>
            )}
            {movie.media?.trailer?.ytId && (
              <div style={{ marginBottom:36 }}>
                <p className="md-sec-label">Official Trailer</p>
                <div ref={trailerRef} className="md-trailer">
                  <iframe src={`https://www.youtube.com/embed/${movie.media.trailer.ytId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen title="Trailer" />
                </div>
                {editTrailer && (
                  <div style={{ display:"flex", gap:10, marginTop:12, flexWrap:"wrap" }}>
                    <input className="form-input" value={trailerInput} onChange={e=>setTrailerInput(e.target.value)} placeholder="YouTube ID or URL" style={{ flex:1, minWidth:200 }} />
                    <button className="btn btn-gold btn-sm" onClick={saveTrailer} disabled={savingTrailer}>{savingTrailer?"Saving…":"Save"}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditTrailer(false)}>Cancel</button>
                  </div>
                )}
              </div>
            )}
            {(movie.media?.songs||[]).length > 0 && (
              <div>
                <p className="md-sec-label">Songs · {movie.media.songs.length}</p>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {movie.media.songs.map((s,i) => (
                    <div key={i} style={{ display:"flex", gap:12, alignItems:"center", padding:"10px 12px", background:"#1a1a1a", border:"1px solid rgba(255,255,255,.07)", borderRadius:8, cursor:"pointer", transition:"border-color .16s" }}
                      onClick={() => navigate(movie ? songPath(movie,i) : `/song/${id}/${i}`)}
                      onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(201,151,58,.4)"}
                      onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,.07)"}>
                      <div style={{ flexShrink:0, width:60, height:40, borderRadius:5, overflow:"hidden", background:"#272727", position:"relative" }}>
                        {s.ytId && <img src={`https://img.youtube.com/vi/${s.ytId}/hqdefault.jpg`} alt={s.title} style={{ width:"100%",height:"100%",objectFit:"cover" }} loading="lazy" onError={e=>{e.target.src=`https://img.youtube.com/vi/${s.ytId}/mqdefault.jpg`;}}/>}
                        <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.25)",fontSize:".9rem" }}>♪</div>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:".82rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#f1f1f1" }}>{s.title}</div>
                        {s.singer && <div style={{ fontSize:".7rem", color:"#c9973a", marginTop:2 }}>{s.singer}</div>}
                        {s.musicDirector && <div style={{ fontSize:".66rem", color:"rgba(255,255,255,.35)", marginTop:1 }}>🎼 {s.musicDirector}</div>}
                      </div>
                      {s.ytId && <a href={`https://youtube.com/watch?v=${s.ytId}`} target="_blank" rel="noreferrer" style={{ fontSize:".68rem",color:"#c9973a",fontWeight:700,opacity:.7,padding:"4px 8px",flexShrink:0 }} onClick={e=>e.stopPropagation()}>YT↗</a>}
                      {isOwner && <button style={{ background:"none",border:"none",color:"rgba(255,100,100,.6)",cursor:"pointer",fontSize:".75rem",padding:"4px 8px",flexShrink:0 }} onClick={e=>{e.stopPropagation();removeSong(i);}}>✕</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!movie.media?.trailer?.ytId && !movie.media?.songs?.length && (
              <div className="md-empty"><span style={{fontSize:"2.5rem"}}>🎵</span><p>No media added yet.</p></div>
            )}
          </div>
        )}

        {/* ── BOX OFFICE ── */}
        {tab==="boxoffice" && !editBO && (
          <div style={{ maxWidth:600 }}>
            <table className="md-bo-table">
              <tbody>
                {[["Opening Weekend", movie.boxOffice?.opening],["First Week", movie.boxOffice?.firstWeek],["Total Collection", movie.boxOffice?.total],["Budget", movie.budget],["Verdict", movie.verdict]].map(([k,v])=>v?(
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ):null)}
              </tbody>
            </table>
            {isOwner && <div style={{ marginTop:24 }}><button className="btn btn-outline btn-sm" onClick={() => setEditBO(true)}>✏ Update Box Office</button></div>}
          </div>
        )}
        {tab==="boxoffice" && editBO && (
          <div style={{ maxWidth:700 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <h3 style={{ fontSize:"1rem", textTransform:"uppercase", letterSpacing:"0.08em", color:"rgba(255,255,255,.45)" }}>Update Box Office</h3>
              <div style={{ display:"flex", gap:10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditBO(false)}>Cancel</button>
                <button className="btn btn-gold btn-sm" onClick={saveBO} disabled={savingBO}>{savingBO?"Saving…":"Save"}</button>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Opening Weekend</label><input className="form-input" value={boForm.opening||""} onChange={e=>setBo("opening",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">First Week</label><input className="form-input" value={boForm.firstWeek||""} onChange={e=>setBo("firstWeek",e.target.value)} /></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Total Collection</label><input className="form-input" value={boForm.total||""} onChange={e=>setBo("total",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Verdict</label><select className="form-select" value={boForm.verdict||movie.verdict||"Upcoming"} onChange={e=>setBo("verdict",e.target.value)}>{VDICT.map(v=><option key={v}>{v}</option>)}</select></div>
            </div>
          </div>
        )}

        {/* ── NEWS ── */}
        {tab==="news" && (
          <div>
            {canNews && <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:20 }}><button className="btn btn-gold btn-sm" onClick={() => { setEditingNews(null); setNewsModal(true); }}>+ Add News</button></div>}
            {movie.news?.length ? (
              <div className="news-grid">
                {[...movie.news].reverse().map(n => (
                  <div key={n._id} className="news-card">
                    <SafeNewsImg src={n.imageUrl} alt={n.title} />
                    <div className="news-card-body">
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                        <div className="news-card-category">{n.category||"Update"}</div>
                        {canNews && <div style={{ display:"flex", gap:6 }}>
                          <button className="news-action-btn" onClick={() => { setEditingNews(n); setNewsModal(true); }}>✏</button>
                          <button className="news-action-btn news-action-delete" onClick={() => handleDeleteNews(n._id)}>🗑</button>
                        </div>}
                      </div>
                      <div className="news-card-title">{n.title}</div>
                      <div className="news-card-content">{n.content}</div>
                      <div className="news-card-meta">{new Date(n.createdAt).toLocaleDateString("en-IN")}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="md-empty">
                <span style={{fontSize:"2.5rem"}}>📰</span>
                <p>No news yet.</p>
                {canNews && <button className="btn btn-gold btn-sm" style={{ marginTop:12 }} onClick={() => setNewsModal(true)}>+ Add First News</button>}
              </div>
            )}
          </div>
        )}

        {/* ── REVIEWS ── */}
        {tab==="reviews" && (
          <div style={{ maxWidth:820 }}>

            {/* ── Rating Summary ── */}
            {movie.reviews?.length > 0 && (() => {
              const total = movie.reviews.length;
              const avg = (movie.reviews.reduce((s,r)=>s+(r.rating||0),0)/total).toFixed(1);
              const dist = [5,4,3,2,1].map(n => ({ n, count: movie.reviews.filter(r=>r.rating===n).length }));
              return (
                <div className="md-rv-summary">
                  <div style={{textAlign:"center"}}>
                    <div className="md-rv-big-score">{avg}</div>
                    <div style={{display:"flex",gap:2,justifyContent:"center",margin:"4px 0"}}>
                      {[1,2,3,4,5].map(s=>(
                        <span key={s} style={{fontSize:".9rem",filter:parseFloat(avg)>=s?"none":"grayscale(1) opacity(.3)"}}>⭐</span>
                      ))}
                    </div>
                    <div style={{fontSize:".7rem",color:"rgba(255,255,255,.4)"}}>{total} review{total!==1?"s":""}</div>
                  </div>
                  <div className="md-rv-bars">
                    {dist.map(({n,count})=>(
                      <div key={n} className="md-rv-bar-row">
                        <span className="md-rv-bar-label">{n}★</span>
                        <div className="md-rv-bar-track">
                          <div className="md-rv-bar-fill" style={{width:`${total?Math.round(count/total*100):0}%`}}/>
                        </div>
                        <span className="md-rv-bar-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Write a Review ── */}
            <div className="md-rv-form" ref={reviewFormRef}>
              <p className="md-rv-form-title">✍️ Write a Review</p>
              <p className="md-rv-form-sub">Share your honest opinion about {movie.title}</p>

              {rvSuccess ? (
                <div className="md-rv-success">
                  🎉 Thank you! Your review has been published.
                </div>
              ) : (
                <form onSubmit={submitReview}>
                  {/* Name */}
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:"rgba(255,255,255,.45)",display:"block",marginBottom:6}}>Your Name</label>
                    <input className="md-rv-input" value={rvUser} onChange={e=>setRvUser(e.target.value)}
                      placeholder="e.g. Raju Mohanty" maxLength={60} />
                  </div>

                  {/* Star Rating */}
                  <div style={{marginBottom:16}}>
                    <label style={{fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:"rgba(255,255,255,.45)",display:"block",marginBottom:8}}>Your Rating</label>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <div className="md-rv-stars">
                        {[1,2,3,4,5].map(star=>(
                          <span key={star}
                            className={`md-rv-star${(rvHover||rvRating)>=star?" lit":""}`}
                            onMouseEnter={()=>setRvHover(star)}
                            onMouseLeave={()=>setRvHover(0)}
                            onClick={()=>setRvRating(star)}>⭐</span>
                        ))}
                      </div>
                      {(rvHover||rvRating)>0 && (
                        <span className="md-rv-star-label">
                          {["","Terrible 😞","Poor 😕","Average 😐","Good 😊","Excellent 🤩"][rvHover||rvRating]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Review Text */}
                  <div style={{marginBottom:16}}>
                    <label style={{fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:"rgba(255,255,255,.45)",display:"block",marginBottom:6}}>Your Review</label>
                    <textarea className="md-rv-input md-rv-textarea"
                      value={rvText} onChange={e=>setRvText(e.target.value)}
                      placeholder={`What did you think of ${movie.title}? Was it worth watching?`}
                      maxLength={1000} />
                    <div className="md-rv-char">{rvText.length}/1000</div>
                  </div>

                  {rvError && <div className="md-rv-error">⚠️ {rvError}</div>}

                  <button className="md-rv-submit" type="submit" disabled={submitting||!rvRating}>
                    {submitting ? "Publishing…" : rvRating ? `Submit ${["","★","★★","★★★","★★★★","★★★★★"][rvRating]} Review` : "Select a rating to continue"}
                  </button>
                </form>
              )}
            </div>

            {/* ── Review Cards ── */}
            {movie.reviews?.length ? (
              <div>
                <div style={{fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"rgba(255,255,255,.35)",marginBottom:14}}>
                  {movie.reviews.length} Review{movie.reviews.length!==1?"s":""}
                </div>
                {[...movie.reviews].reverse().map((r,i) => {
                  const avatarColors = ["#c9973a","#4caf82","#7aaae8","#e5799a","#a78be8","#e8c87a"];
                  const avatarColor  = avatarColors[(r.user?.charCodeAt(0)||0) % avatarColors.length];
                  const filled = Math.round(r.rating||0);
                  return (
                    <div key={i} className="md-rv-card">
                      <div className="md-rv-card-header">
                        <div className="md-rv-avatar" style={{background:avatarColor,width:44,height:44,fontSize:"1.1rem"}}>
                          {(r.user||"?")[0].toUpperCase()}
                        </div>
                        <div className="md-rv-card-meta">
                          <div className="md-rv-card-name">{r.user}</div>
                          {r.date && <div className="md-rv-card-date">{r.date}</div>}
                        </div>
                        <div style={{marginLeft:"auto",textAlign:"right"}}>
                          <div className="md-rv-card-stars">
                            {[1,2,3,4,5].map(s=>(
                              <span key={s} className="md-rv-card-star" style={{filter:s<=filled?"none":"grayscale(1) opacity(.25)"}}>⭐</span>
                            ))}
                          </div>
                          <div style={{fontSize:".66rem",color:"rgba(255,255,255,.35)",marginTop:2}}>
                            {["","Terrible","Poor","Average","Good","Excellent"][filled]}
                          </div>
                        </div>
                      </div>
                      <p className="md-rv-card-text">{r.text}</p>
                      <span className="md-rv-helpful">👍 Helpful?</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{textAlign:"center",padding:"40px 20px",color:"rgba(255,255,255,.25)"}}>
                <div style={{fontSize:"3rem",marginBottom:10}}>✍️</div>
                <div style={{fontWeight:700,marginBottom:6}}>No reviews yet</div>
                <div style={{fontSize:".8rem"}}>Be the first to review {movie.title}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ RELATED SECTIONS ══ */}
      <div className="home-sections" style={{ paddingTop:16, background:"var(--bg)" }}>
        {actors.length > 0 && (
          <HomeRow title="🎭 Full Cast">
            {[...crew,...actors].map((c,i) => (
              <MiniCastCard key={c.castId||i} person={c}
                onClick={() => c.castId && navigate(portalMode?`/portal/cast/${c.castId}`:castPath({ _id:c.castId, name:c.name }))} />
            ))}
          </HomeRow>
        )}
        {sameDirector.length > 0 && (
          <HomeRow title={`🎬 More by ${movie.director}`}>
            {sameDirector.map(m => <MiniMovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
          </HomeRow>
        )}
        {relatedMovies.length > 0 && (
          <HomeRow title="🎥 Similar Films" tag="Related">
            {relatedMovies.map(m => <MiniMovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
          </HomeRow>
        )}
      </div>

      {/* ── Modals ── */}
      {newsModal    && <NewsModal movieId={id} existing={editingNews} onSave={handleNewsSaved} onClose={()=>{setNewsModal(false);setEditingNews(null);}} />}
      {addCastModal && <AddCastModal movieId={id} onAdded={m=>{setMovie(prev=>({...prev,cast:m.cast}));}} onClose={()=>setAddCastModal(false)} />}
      {addSongModal && <AddSongModal movieId={id} onAdded={m=>{setMovie(prev=>({...prev,media:m.media}));}} onClose={()=>setAddSongModal(false)} />}

      {/* ── Share Modal ── */}
      {showShare && (
        <div className="md-share-overlay" onClick={()=>setShowShare(false)}>
          <div className="md-share-card" onClick={e=>e.stopPropagation()}>
            {(movie.thumbnailUrl||movie.posterUrl) && (
              <img src={movie.thumbnailUrl||movie.posterUrl} alt={movie.title}
                style={{width:"100%",aspectRatio:"16/9",objectFit:"cover",display:"block"}}
                onError={e=>e.target.style.display="none"}/>
            )}
            <div style={{padding:"18px 20px 20px"}}>
              <div style={{fontSize:".58rem",fontWeight:800,letterSpacing:".14em",textTransform:"uppercase",color:"#c9973a",marginBottom:6}}>🎬 Odia Film</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1.4rem",fontWeight:900,lineHeight:1.2,marginBottom:5}}>{movie.title}</div>
              <div style={{fontSize:".76rem",color:"rgba(255,255,255,.5)",marginBottom:14}}>
                {movie.releaseDate&&<span>{new Date(movie.releaseDate).getFullYear()} · </span>}
                {movie.director&&<span>{movie.director}</span>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleShare} className="md-btn-play" style={{flex:1,justifyContent:"center",fontSize:".8rem",padding:"9px"}}>
                  {navigator.share?"📤 Share":"🔗 Copy Link"}
                </button>
                <button onClick={()=>setShowShare(false)} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,color:"#f1f1f1",padding:"9px 14px",cursor:"pointer",fontSize:".8rem"}}>✕</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}