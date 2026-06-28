import SEO, { homeSEO } from "../components/SEO";
import { moviePath } from "../utils/slugs";
import React, {
  useEffect, useState, useRef, useMemo, useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

// ─── Helpers ──────────────────────────────────────────────────────
const extractYtId = input => {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(s) ? s : null);
};
// mqdefault (320×180) — smallest thumbnail that still looks good
const ytThumb   = id => { const i = extractYtId(id); return i ? `https://img.youtube.com/vi/${i}/mqdefault.jpg` : null; };
const heroImage = m  => m.thumbnailUrl || ytThumb(m.media?.trailer?.ytId) || m.posterUrl || null;
const fmtDate   = d  => d ? new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";

// Date helpers — computed once at module level (not per render)
const _now = new Date();
const RECENT_CUTOFF = new Date(_now.getFullYear()-3, _now.getMonth(), _now.getDate());
const withinDays = (d,p,f) => { if(!d) return false; const diff=(new Date(d)-_now)/86400000; return diff>=-p&&diff<=f; };
const isThisWeek  = d => withinDays(d,7,14);
const isThisMonth = d => { if(!d) return false; const dt=new Date(d); return dt.getMonth()===_now.getMonth()&&dt.getFullYear()===_now.getFullYear(); };
const isLastMonth = d => { if(!d) return false; const dt=new Date(d); const lm=new Date(_now.getFullYear(),_now.getMonth()-1,1); return dt.getMonth()===lm.getMonth()&&dt.getFullYear()===lm.getFullYear(); };
const isLastWeek  = d => withinDays(d,14,0);

// Verdict colours
const VS = {
  "Blockbuster":"#95e5b8","Super Hit":"#95e5b8","Hit":"#a3e8a0",
  "Average":"#e8c87a","Flop":"#e59595","Disaster":"#e59595","Upcoming":"#7aaae8",
};

// ─── ONE shared IntersectionObserver for ALL images ───────────────
// Avoids creating hundreds of individual observers
const imgObserver = (() => {
  if (typeof window === "undefined") return null;
  const callbacks = new WeakMap();
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const cb = callbacks.get(entry.target);
        if (cb) { cb(); callbacks.delete(entry.target); io.unobserve(entry.target); }
      }
    });
  }, { rootMargin: "400px" }); // pre-load 400px ahead of viewport
  io._callbacks = callbacks;
  return io;
})();

function observeImg(el, cb) {
  if (!imgObserver || !el) return;
  imgObserver._callbacks.set(el, cb);
  imgObserver.observe(el);
  return () => { imgObserver.unobserve(el); imgObserver._callbacks.delete(el); };
}

// ─── Lazy image — uses shared observer ───────────────────────────
function LImg({ src, alt, style, eager }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!src || eager) return;
    const el = ref.current;
    if (!el) return;
    return observeImg(el, () => { el.src = src; });
  }, [src, eager]);

  if (!src) return null;
  return (
    <img
      ref={ref}
      src={eager ? src : undefined}
      alt={alt || ""}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      style={{ ...style, opacity: loaded ? 1 : 0, transition: "opacity .3s" }}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
    />
  );
}

// ─── CSS-only hover — zero per-card useState hooks ────────────────
const cardCss = `
  .hcard{flex-shrink:0;width:150px;cursor:pointer;transition:transform .28s cubic-bezier(.34,1.56,.64,1);contain:layout style;}
  .hcard:hover{transform:translateY(-8px) scale(1.03);}
  .hcard:hover .hcard-img{box-shadow:0 22px 52px rgba(0,0,0,.75);border-color:rgba(201,151,58,.5);}
  .hcard:hover .hcard-grad{opacity:1;}
  .hcard:hover .hcard-play{opacity:1;}
  .hcard:hover .hcard-title{color:var(--gold);}
  .hcard-img{position:relative;border-radius:10px;overflow:hidden;aspect-ratio:2/3;background:var(--bg3);
    box-shadow:0 4px 16px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.06);transition:box-shadow .3s,border .3s;}
  .hcard-grad{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.1) 55%,transparent 100%);opacity:.5;transition:opacity .3s;}
  .hcard-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;}
  .hcard-title{margin:0;font-weight:700;font-size:.8rem;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);transition:color .2s;}
  .tcard{flex-shrink:0;width:265px;cursor:pointer;transition:transform .25s;contain:layout style;}
  .tcard:hover{transform:translateY(-5px);}
  .tcard:hover .tcard-img{box-shadow:0 18px 44px rgba(0,0,0,.65);border-color:rgba(220,50,50,.4);}
  .tcard:hover .tcard-play{background:rgba(220,30,30,.9);}
  .tcard:hover .tcard-title{color:var(--gold);}
  .tcard-img{position:relative;border-radius:10px;overflow:hidden;aspect-ratio:16/9;background:var(--bg3);
    box-shadow:0 4px 14px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.06);transition:box-shadow .25s,border .25s;}
  .tcard-play{width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.7);
    display:flex;align-items:center;justify-content:center;padding-left:4px;font-size:1.15rem;transition:background .2s;}
  .tcard-title{margin:0;font-weight:700;font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);transition:color .2s;}
  .scard{flex-shrink:0;width:150px;cursor:pointer;transition:transform .25s;contain:layout style;}
  .scard:hover{transform:translateY(-5px);}
  .scard:hover .scard-img{box-shadow:0 14px 36px rgba(0,0,0,.6);border-color:rgba(201,151,58,.4);}
  .scard:hover .scard-title{color:var(--gold);}
  .scard-img{position:relative;border-radius:10px;overflow:hidden;aspect-ratio:1/1;background:var(--bg3);
    box-shadow:0 4px 12px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.06);transition:box-shadow .25s,border .25s;}
  .scard-title{margin:0;font-weight:700;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);transition:color .2s;}
  .ncard{flex-shrink:0;width:250px;cursor:pointer;background:var(--bg2);border-radius:10px;overflow:hidden;
    border:1px solid var(--border);transition:all .2s;contain:layout style;}
  .ncard:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.45);border-color:rgba(201,151,58,.35);}
  .ncard:hover .ncard-img img{transform:scale(1.06);}
  .ncard-img{height:130px;overflow:hidden;background:var(--bg3);}
  .ncard-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s;}
  .recent-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;padding:0 0 4px;overflow:visible;}
  .recent-grid .hcard{width:100%;min-width:0;flex-shrink:unset;}
  .recent-grid .hcard-img{width:100%;}
  @media(max-width:900px){.recent-grid{grid-template-columns:repeat(4,1fr);}}
  @media(max-width:560px){.recent-grid{grid-template-columns:repeat(3,1fr);}}
`;

// ─── Movie Card ───────────────────────────────────────────────────
const MovieCard = React.memo(function MovieCard({ movie, onClick }) {
  const v = movie.verdict || "Upcoming";
  const c = VS[v] || "#7aaae8";
  const img = movie.posterUrl || movie.thumbnailUrl || ytThumb(movie.media?.trailer?.ytId);
  return (
    <div className="hcard" onClick={onClick}>
      <div className="hcard-img">
        {img
          ? <LImg src={img} alt={movie.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"top",display:"block"}} />
          : <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2.5rem"}}>🎬</div>}
        <div className="hcard-grad" />
        <div style={{position:"absolute",top:7,left:7,background:`${c}cc`,color:"#000",
          fontSize:".6rem",fontWeight:900,padding:"3px 7px",borderRadius:4,letterSpacing:".06em",
          textTransform:"uppercase",whiteSpace:"nowrap",maxWidth:"calc(100% - 14px)",
          overflow:"hidden",textOverflow:"ellipsis",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}>{v}</div>
        {movie.genre?.[0] && <div style={{position:"absolute",bottom:8,left:8,fontSize:".58rem",color:"rgba(255,255,255,.65)",fontWeight:600}}>{movie.genre[0]}</div>}
        <div className="hcard-play">
          <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(201,151,58,.9)",display:"flex",alignItems:"center",justifyContent:"center",paddingLeft:3}}>▶</div>
        </div>
      </div>
      <div style={{padding:"9px 2px 0"}}>
        <p className="hcard-title">{movie.title}</p>
        <p style={{margin:"3px 0 0",fontSize:".67rem",color:"var(--muted)"}}>{movie.releaseDate ? fmtDate(movie.releaseDate) : "TBA"}</p>
        {movie.director && <p style={{margin:"2px 0 0",fontSize:".63rem",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:.75}}>🎥 {movie.director}</p>}
      </div>
    </div>
  );
});

// ─── Trailer Card ─────────────────────────────────────────────────
const TrailerCard = React.memo(function TrailerCard({ movie, onClick }) {
  const thumb = ytThumb(movie.media?.trailer?.ytId);
  return (
    <div className="tcard" onClick={onClick}>
      <div className="tcard-img">
        {thumb && <LImg src={thumb} alt={movie.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />}
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div className="tcard-play">▶</div>
        </div>
        <div style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,.75)",color:"#fff",fontSize:".58rem",fontWeight:700,padding:"2px 6px",borderRadius:3}}>TRAILER</div>
      </div>
      <div style={{padding:"9px 2px 0"}}>
        <p className="tcard-title">{movie.title}</p>
        {movie.releaseDate && <p style={{margin:"3px 0 0",fontSize:".67rem",color:"var(--muted)"}}>{fmtDate(movie.releaseDate)}</p>}
      </div>
    </div>
  );
});

// ─── Song Card ────────────────────────────────────────────────────
const SongCard = React.memo(function SongCard({ s, onClick }) {
  const thumb = s.thumbnailUrl || ytThumb(s.ytId) || s.posterUrl;
  return (
    <div className="scard" onClick={onClick}>
      <div className="scard-img">
        {thumb && <LImg src={thumb} alt={s.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />}
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(201,151,58,.85)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem"}}>♪</div>
        </div>
      </div>
      <div style={{padding:"9px 2px 0"}}>
        <p className="scard-title">{s.title}</p>
        {s.singer && <p style={{margin:"2px 0 0",fontSize:".63rem",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🎤 {s.singer}</p>}
        <p style={{margin:"1px 0 0",fontSize:".62rem",color:"rgba(255,255,255,.3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.movieTitle}</p>
      </div>
    </div>
  );
});

// ─── News Card ────────────────────────────────────────────────────
const NewsCard = React.memo(function NewsCard({ n, onClick }) {
  return (
    <div className="ncard" onClick={onClick}>
      {n.imageUrl && (
        <div className="ncard-img">
          <LImg src={n.imageUrl} alt={n.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
        </div>
      )}
      <div style={{padding:"12px 14px"}}>
        {n.category && <span style={{fontSize:".58rem",fontWeight:800,color:"var(--gold)",letterSpacing:".08em",textTransform:"uppercase"}}>{n.category}</span>}
        <p style={{margin:"5px 0 4px",fontWeight:700,fontSize:".8rem",lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{n.title}</p>
        {n.movieTitle && <p style={{margin:0,fontSize:".67rem",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🎬 {n.movieTitle}</p>}
      </div>
    </div>
  );
});

// ─── Skeleton placeholder card ────────────────────────────────────
function CardSkeleton({ ratio = "2/3", width = 150 }) {
  return (
    <div style={{
      flexShrink: 0, width, aspectRatio: ratio, borderRadius: 10,
      background: "var(--bg3)", animation: "homepulse 1.5s ease-in-out infinite",
    }} />
  );
}

// ─── Row — renders skeletons until scrolled into view ─────────────
// Each row gets its own IntersectionObserver so off-screen rows
// never render cards at all — huge DOM / memory saving.
// loading={true}  → always show skeletons (data fetch in progress)
// loading={false} → normal: skeletons until scrolled into view, then real cards
function Row({ title, badge, badgeColor = "#c9973a", viewAll, children, gap = 14, cardRatio, cardWidth, loading = false }) {
  const navigate = useNavigate();
  const rowRef   = useRef(null);
  const sentRef  = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sentRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "250px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const slide = n => rowRef.current?.scrollBy({ left: n, behavior: "smooth" });
  const count = React.Children.count(children);

  // Show skeletons when: (a) still fetching data, or (b) not scrolled into view yet
  const showSkeletons = loading || !visible;

  return (
    <section className="home-section" ref={sentRef}>
      <div className="home-section-header">
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Skeleton title while loading, real title once ready */}
          {loading
            ? <div style={{ width: 160, height: 18, borderRadius: 4, background: "var(--bg3)", animation: "homepulse 1.5s ease-in-out infinite" }} />
            : <h2 className="home-section-title">{title}</h2>
          }
          {!loading && badge && (
            <span style={{
              background:`${badgeColor}20`,border:`1px solid ${badgeColor}50`,color:badgeColor,
              fontSize:".58rem",fontWeight:800,padding:"2px 8px",borderRadius:3,
              letterSpacing:".08em",textTransform:"uppercase",
            }}>{badge}</span>
          )}
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {!loading && viewAll && <button className="home-view-all" onClick={()=>navigate(viewAll)}>View All</button>}
          <button className="home-arrow" onClick={()=>slide(-640)}>‹</button>
          <button className="home-arrow" onClick={()=>slide(640)}>›</button>
        </div>
      </div>
      <div ref={rowRef} className="home-row" style={{ gap }}>
        {showSkeletons
          ? Array.from({ length: Math.min(count || 8, 8) }).map((_, i) => (
              <CardSkeleton key={i} ratio={cardRatio} width={cardWidth} />
            ))
          : children}
      </div>
    </section>
  );
}

// ─── Hero CSS — 100% self-contained, zero external class deps ────
const heroCss = `
/* ── Outer wrapper — sits right below the fixed 58px navbar ── */
.hh-wrap {
  position: relative;
  width: 100%;
  background: #0a0a0a;
  overflow: hidden;
}

/* ── Each slide — all absolutely stacked, same size as wrapper ── */
.hh-slide {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 25%;
  opacity: 0;
  transition: opacity .7s ease;
  pointer-events: none;
}
/* Active slide is relative — drives the wrapper's height */
.hh-slide.active {
  position: relative;
  opacity: 1;
  pointer-events: auto;
}

/* ── Inner — sets the height responsively, contains ALL overlays ── */
.hh-inner {
  position: relative;
  min-height: clamp(300px, 56vw, 580px);
  overflow: hidden;
}

/* ── Gradient overlay ── */
.hh-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top,
      rgba(0,0,0,.96) 0%,
      rgba(0,0,0,.65) 35%,
      rgba(0,0,0,.15) 65%,
      transparent    100%
    ),
    linear-gradient(to right,
      rgba(0,0,0,.80) 0%,
      rgba(0,0,0,.40) 50%,
      transparent    80%
    );
}

/* ── Text content — bottom-left, above overlay ── */
.hh-content {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 16px 16px 52px;
  z-index: 3;
  max-width: 680px;
}
@media(min-width:480px)  { .hh-content { padding: 20px 24px 58px; } }
@media(min-width:768px)  { .hh-content { padding: 28px 36px 70px; } }
@media(min-width:1100px) { .hh-content { padding: 32px 52px 78px; } }

/* Tags row */
.hh-tags { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:9px; }
.hh-tag {
  font-size:.6rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
  padding:3px 9px; border-radius:20px;
  background:rgba(201,151,58,.18); border:1px solid rgba(201,151,58,.5); color:#c9973a;
}
.hh-tag-gl {
  font-size:.6rem; font-weight:600;
  padding:3px 9px; border-radius:20px;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.22);
  color:rgba(255,255,255,.82);
}

/* Title */
.hh-title {
  font-family: 'Playfair Display', serif;
  font-size: clamp(1.4rem, 5.5vw, 3rem);
  font-weight: 900;
  line-height: 1.08;
  color: #fff;
  margin: 0 0 7px;
  text-shadow: 0 2px 20px rgba(0,0,0,.7);
}

/* Meta row — director / date / verdict */
.hh-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 12px;
  margin-bottom: 8px;
  font-size: clamp(.68rem, 2vw, .79rem);
  color: rgba(255,255,255,.58);
}
.hh-badge {
  font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: .07em;
  padding: 2px 9px; border-radius: 3px;
}

/* Synopsis — hidden on tiny screens, clamped on larger */
.hh-synopsis {
  font-size: clamp(.78rem, 2.2vw, .86rem);
  color: rgba(255,255,255,.62);
  line-height: 1.6;
  margin: 0 0 14px;
  display: none;
}
@media(min-width:420px) {
  .hh-synopsis {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
@media(min-width:768px) { .hh-synopsis { -webkit-line-clamp: 3; } }

/* Buttons */
.hh-btns { display:flex; gap:8px; flex-wrap:wrap; }
.hh-btn-play {
  display: inline-flex; align-items: center; gap: 7px;
  background: #c9973a; color: #000; border: none;
  padding: clamp(9px,2vw,12px) clamp(14px,3vw,24px);
  border-radius: 8px;
  font-size: clamp(.76rem, 2vw, .88rem); font-weight: 800;
  cursor: pointer; transition: opacity .18s; white-space: nowrap;
}
.hh-btn-play:hover { opacity: .85; }
.hh-btn-info {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,.1); color: #f1f1f1;
  border: 1px solid rgba(255,255,255,.28);
  padding: clamp(9px,2vw,12px) clamp(12px,2.5vw,20px);
  border-radius: 8px;
  font-size: clamp(.74rem, 2vw, .86rem); font-weight: 600;
  cursor: pointer; transition: background .18s; white-space: nowrap;
  backdrop-filter: blur(6px);
}
.hh-btn-info:hover { background: rgba(255,255,255,.18); }

/* ── Dots — inside hh-inner, bottom-left ── */
.hh-dots {
  position: absolute;
  bottom: 16px; left: 16px;
  display: flex; gap: 6px; z-index: 4;
}
@media(min-width:480px)  { .hh-dots { bottom: 18px; left: 24px; } }
@media(min-width:768px)  { .hh-dots { bottom: 22px; left: 36px; } }
@media(min-width:1100px) { .hh-dots { left: 52px; } }
.hh-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,.3); border: none;
  cursor: pointer; padding: 0; transition: all .25s;
}
.hh-dot.active { width: 24px; border-radius: 4px; background: #c9973a; }

/* ── Thumbnail strip — inside hh-inner, bottom-right, desktop only ── */
.hh-strip {
  position: absolute;
  bottom: 14px; right: 16px;
  display: none;
  gap: 5px; z-index: 4;
}
@media(min-width:900px) { .hh-strip { display: flex; bottom: 18px; right: 24px; } }
.hh-strip-item {
  width: 72px; height: 48px;
  border-radius: 5px; overflow: hidden;
  cursor: pointer; flex-shrink: 0;
  border: 2px solid rgba(255,255,255,.15);
  background: #1c1c1c;
  position: relative; transition: border-color .2s;
}
.hh-strip-item.active { border-color: #c9973a; }
.hh-strip-item img { width:100%; height:100%; object-fit:cover; display:block; }
.hh-strip-play {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.28); font-size: .55rem; color: #fff;
}

/* ── Skeleton ── */
.hh-skel {
  width: 100%;
  min-height: clamp(300px, 56vw, 580px);
  background: #141414;
  animation: homepulse 1.5s ease-in-out infinite;
}
`;

// ─── Hero Slide — dots and strip live inside so they're within hh-inner ──
function HeroSlide({ movie, active, dots, strip }) {
  const navigate = useNavigate();
  const img = heroImage(movie);
  const vc  = VS[movie.verdict] || "#7aaae8";

  return (
    <div
      className={`hh-slide${active ? " active" : ""}`}
      style={{ backgroundImage: img ? `url(${img})` : "none" }}
    >
      <div className="hh-inner">
        <div className="hh-overlay" />

        <div className="hh-content">
          {/* Category / genre / language tags */}
          <div className="hh-tags">
            {movie.category   && <span className="hh-tag">{movie.category}</span>}
            {movie.genre?.[0] && <span className="hh-tag-gl">{movie.genre[0]}</span>}
            {movie.language   && <span className="hh-tag-gl">{movie.language}</span>}
          </div>

          {/* Title */}
          <h2 className="hh-title">{movie.title}</h2>

          {/* Meta */}
          <div className="hh-meta">
            {movie.releaseDate && <span>🗓 {fmtDate(movie.releaseDate)}</span>}
            {movie.director   && <span>🎬 {movie.director}</span>}
            {movie.verdict && movie.verdict !== "Upcoming" && (
              <span className="hh-badge" style={{
                background:`${vc}22`, border:`1px solid ${vc}`, color:vc,
              }}>{movie.verdict}</span>
            )}
          </div>

          {/* Synopsis */}
          {movie.synopsis && (
            <p className="hh-synopsis">
              {movie.synopsis.slice(0, 180)}{movie.synopsis.length > 180 ? "…" : ""}
            </p>
          )}

          {/* Buttons */}
          <div className="hh-btns">
            {movie.media?.trailer?.ytId && (
              <button className="hh-btn-play"
                onClick={() => navigate(`/movie/${movie._id}`, { state:{ scrollTo:"trailer" } })}>
                ▶ Watch Trailer
              </button>
            )}
            <button className="hh-btn-info"
              onClick={() => navigate(moviePath(movie))}>
              More Info
            </button>
          </div>
        </div>

        {/* Dots — rendered only on active slide, positioned inside hh-inner */}
        {active && dots}

        {/* Thumbnail strip — rendered only on active slide */}
        {active && strip}
      </div>
    </div>
  );
}

// Rich skeleton that mirrors the real hero layout so users immediately
// understand the page structure rather than seeing a blank pulsing bar.
function HeroSkeleton() {
  return (
    <div className="hh-skel" style={{ position: "relative", overflow: "hidden" }}>
      {/* Fake content anchored to bottom-left like the real hero */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "clamp(16px,3vw,32px) clamp(16px,4vw,52px) clamp(52px,8vw,78px)",
        maxWidth: 680,
      }}>
        {/* Tags row */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[60, 80, 55].map((w, i) => (
            <div key={i} style={{ width: w, height: 18, borderRadius: 20, background: "rgba(255,255,255,.08)", animation: "homepulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        {/* Title */}
        <div style={{ width: "clamp(200px,50vw,420px)", height: "clamp(28px,6vw,48px)", borderRadius: 6, background: "rgba(255,255,255,.1)", animation: "homepulse 1.5s ease-in-out infinite", marginBottom: 12 }} />
        {/* Meta row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          {[100, 130].map((w, i) => (
            <div key={i} style={{ width: w, height: 14, borderRadius: 4, background: "rgba(255,255,255,.07)", animation: "homepulse 1.5s ease-in-out infinite", animationDelay: `${0.15 + i * 0.1}s` }} />
          ))}
        </div>
        {/* Synopsis lines */}
        {[90, 75].map((pct, i) => (
          <div key={i} style={{ width: `${pct}%`, maxWidth: 520, height: 13, borderRadius: 4, background: "rgba(255,255,255,.06)", animation: "homepulse 1.5s ease-in-out infinite", animationDelay: `${0.25 + i * 0.07}s`, marginBottom: 6 }} />
        ))}
        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div style={{ width: 140, height: 40, borderRadius: 8, background: "rgba(201,151,58,.25)", animation: "homepulse 1.5s ease-in-out infinite", animationDelay: "0.35s" }} />
          <div style={{ width: 100, height: 40, borderRadius: 8, background: "rgba(255,255,255,.07)", animation: "homepulse 1.5s ease-in-out infinite", animationDelay: "0.42s" }} />
        </div>
      </div>
      {/* Dots row */}
      <div style={{ position: "absolute", bottom: 16, left: "clamp(16px,4vw,52px)", display: "flex", gap: 6 }}>
        {[1, 0, 0, 0].map((active, i) => (
          <div key={i} style={{ width: active ? 24 : 7, height: 7, borderRadius: active ? 4 : "50%", background: "rgba(255,255,255,.18)", animation: "homepulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Blog Section — Magazine / Editorial style ──────────────────────────────
const BLOG_CSS = `
@keyframes bsFadeUp  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
@keyframes bsShimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }

/* ── Wrapper ── */
.blog-sec {
  padding: 0;
  contain: layout style;
}

/* ── Section header ── */
.blog-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
  gap: 12px;
}
.blog-sec-head-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.blog-sec-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: linear-gradient(135deg,rgba(201,151,58,.18),rgba(201,151,58,.06));
  border: 1px solid rgba(201,151,58,.35);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: .63rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #c9973a;
}
.blog-sec-title {
  font-size: 1.12rem;
  font-weight: 900;
  color: #f1f1f1;
  margin: 0;
  letter-spacing: -.02em;
}
.blog-sec-viewall {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border: 1.5px solid rgba(201,151,58,.35);
  border-radius: 20px;
  background: transparent;
  color: #c9973a;
  font-size: .73rem;
  font-weight: 700;
  cursor: pointer;
  transition: background .18s, border-color .18s, transform .18s;
  white-space: nowrap;
  flex-shrink: 0;
}
.blog-sec-viewall:hover {
  background: rgba(201,151,58,.12);
  border-color: #c9973a;
  transform: translateX(2px);
}

/* ── Magazine layout grid ── */
.blog-mag-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .blog-mag-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (min-width: 960px) {
  .blog-mag-grid {
    grid-template-columns: 1.65fr 1fr 1fr;
    grid-template-rows: auto auto;
  }
}

/* ── Featured (first) card — takes 2 rows on desktop ── */
.blog-feat {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  background: #111;
  border: 1px solid rgba(255,255,255,.07);
  transition: transform .28s cubic-bezier(.34,1.56,.64,1), border-color .2s, box-shadow .2s;
  animation: bsFadeUp .4s ease both;
  isolation: isolate;
}
@media (min-width: 960px) {
  .blog-feat {
    grid-row: 1 / 3;
    grid-column: 1 / 2;
  }
}
.blog-feat:hover {
  transform: translateY(-5px);
  border-color: rgba(201,151,58,.45);
  box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(201,151,58,.15);
}
.blog-feat-img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  overflow: hidden;
}
@media (min-width: 960px) {
  .blog-feat-img-wrap {
    aspect-ratio: auto;
    min-height: 340px;
    height: 100%;
  }
}
.blog-feat-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform .5s ease;
}
.blog-feat:hover .blog-feat-img { transform: scale(1.06); }
.blog-feat-ph {
  width: 100%;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3.5rem;
  background: linear-gradient(135deg,#1a1200,#0d0d0d);
}
/* gradient overlay for text legibility */
.blog-feat-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    0deg,
    rgba(0,0,0,.94) 0%,
    rgba(0,0,0,.55) 42%,
    rgba(0,0,0,.08) 80%,
    transparent 100%
  );
}
.blog-feat-body {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.blog-feat-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  font-size: .58rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  padding: 3px 9px;
  border-radius: 3px;
}
.blog-feat-title {
  font-size: clamp(.96rem, 1.8vw, 1.2rem);
  font-weight: 800;
  color: #fff;
  line-height: 1.36;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.blog-feat-excerpt {
  font-size: .74rem;
  color: rgba(255,255,255,.58);
  line-height: 1.6;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.blog-feat-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: .62rem;
  color: rgba(255,255,255,.38);
  flex-wrap: wrap;
}
.blog-feat-meta-dot { opacity: .3; }
.blog-feat-movie {
  color: #c9973a;
  font-weight: 700;
}
/* ── Read more pill ── */
.blog-feat-read {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  padding: 6px 13px;
  background: rgba(201,151,58,.15);
  border: 1px solid rgba(201,151,58,.35);
  border-radius: 16px;
  color: #c9973a;
  font-size: .68rem;
  font-weight: 700;
  width: fit-content;
  transition: background .15s;
}
.blog-feat:hover .blog-feat-read {
  background: rgba(201,151,58,.28);
}

/* ── Small side cards ── */
.blog-side-card {
  border-radius: 12px;
  overflow: hidden;
  background: #161616;
  border: 1px solid rgba(255,255,255,.07);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: transform .25s cubic-bezier(.34,1.56,.64,1), border-color .2s, box-shadow .2s;
  animation: bsFadeUp .4s ease both;
  isolation: isolate;
}
.blog-side-card:hover {
  transform: translateY(-4px);
  border-color: rgba(201,151,58,.38);
  box-shadow: 0 12px 32px rgba(0,0,0,.55);
}
.blog-side-img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  overflow: hidden;
  background: #1a1a1a;
  flex-shrink: 0;
}
.blog-side-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .38s;
}
.blog-side-card:hover .blog-side-img { transform: scale(1.07); }
.blog-side-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: linear-gradient(135deg,#1a1200,#0d0d0d);
}
.blog-side-badge {
  position: absolute;
  top: 8px;
  left: 9px;
  font-size: .55rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .09em;
  padding: 2px 7px;
  border-radius: 3px;
  line-height: 1.5;
  pointer-events: none;
}
.blog-side-views {
  position: absolute;
  top: 8px;
  right: 9px;
  font-size: .55rem;
  color: rgba(255,255,255,.6);
  background: rgba(0,0,0,.65);
  backdrop-filter: blur(4px);
  border-radius: 10px;
  padding: 2px 7px;
  display: flex;
  align-items: center;
  gap: 3px;
}
.blog-side-body {
  padding: 12px 13px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.blog-side-title {
  font-size: .84rem;
  font-weight: 700;
  color: #f1f1f1;
  line-height: 1.38;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  transition: color .18s;
}
.blog-side-card:hover .blog-side-title { color: #c9973a; }
.blog-side-excerpt {
  font-size: .71rem;
  color: rgba(255,255,255,.4);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}
.blog-side-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: .62rem;
  color: rgba(255,255,255,.26);
  margin-top: 2px;
  flex-wrap: wrap;
}
.blog-side-dot { opacity: .3; }
.blog-side-movie {
  color: #c9973a;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

/* ── Horizontal scroll row (mobile overflow) ── */
.blog-more-row {
  display: flex;
  gap: 13px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
  scrollbar-width: none;
  margin-top: 16px;
}
.blog-more-row::-webkit-scrollbar { display: none; }

/* ── Mini card (row below grid) ── */
.blog-mini {
  flex-shrink: 0;
  width: 200px;
  border-radius: 10px;
  overflow: hidden;
  background: #161616;
  border: 1px solid rgba(255,255,255,.06);
  cursor: pointer;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  transition: transform .22s, border-color .2s;
  animation: bsFadeUp .35s ease both;
}
.blog-mini:hover {
  transform: translateY(-4px);
  border-color: rgba(201,151,58,.32);
}
.blog-mini-img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  overflow: hidden;
  background: #1a1a1a;
}
.blog-mini-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .35s;
}
.blog-mini:hover .blog-mini-img { transform: scale(1.07); }
.blog-mini-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  background: linear-gradient(135deg,#1a1200,#0d0d0d);
}
.blog-mini-body {
  padding: 9px 10px 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.blog-mini-title {
  font-size: .75rem;
  font-weight: 700;
  color: #f1f1f1;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  transition: color .15s;
}
.blog-mini:hover .blog-mini-title { color: #c9973a; }
.blog-mini-meta {
  font-size: .6rem;
  color: rgba(255,255,255,.28);
  margin-top: auto;
}

/* ── Skeleton ── */
.blog-skel-feat {
  border-radius: 14px;
  overflow: hidden;
  background: #161616;
  border: 1px solid rgba(255,255,255,.06);
}
.blog-skel-feat-img {
  width: 100%;
  aspect-ratio: 16/9;
  background: linear-gradient(90deg, #1e1e1e 25%, #252525 50%, #1e1e1e 75%);
  background-size: 400px 100%;
  animation: bsShimmer 1.4s infinite;
}
@media (min-width: 960px) {
  .blog-skel-feat-img { min-height: 340px; }
}
.blog-skel-body { padding: 14px 13px; display: flex; flex-direction: column; gap: 10px; }
.blog-skel-line {
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, #1e1e1e 25%, #252525 50%, #1e1e1e 75%);
  background-size: 400px 100%;
  animation: bsShimmer 1.4s infinite;
}
.blog-skel-side {
  border-radius: 12px;
  overflow: hidden;
  background: #161616;
  border: 1px solid rgba(255,255,255,.06);
}
.blog-skel-side-img {
  width: 100%;
  aspect-ratio: 16/9;
  background: linear-gradient(90deg, #1e1e1e 25%, #252525 50%, #1e1e1e 75%);
  background-size: 400px 100%;
  animation: bsShimmer 1.4s infinite;
}

/* ── Category badge colours ── */
.bsc-review   { background: rgba(201,151,58,.92);  color: #000; }
.bsc-actor    { background: rgba(167,139,232,.9);  color: #fff; }
.bsc-music    { background: rgba(74,207,130,.9);   color: #000; }
.bsc-top10    { background: rgba(232,200,122,.9);  color: #000; }
.bsc-news     { background: rgba(122,170,232,.9);  color: #000; }
.bsc-general  { background: rgba(229,121,154,.85); color: #fff; }
.bsc-upcoming { background: rgba(94,174,232,.9);   color: #000; }
`;

function bsCatClass(cat) {
  if (!cat) return "bsc-review";
  const c = cat.toLowerCase();
  if (c.includes("review"))                        return "bsc-review";
  if (c.includes("actor") || c.includes("spot"))  return "bsc-actor";
  if (c.includes("music") || c.includes("song"))  return "bsc-music";
  if (c.includes("top"))                           return "bsc-top10";
  if (c.includes("news"))                          return "bsc-news";
  if (c.includes("upcoming"))                      return "bsc-upcoming";
  return "bsc-general";
}

function bsFmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}

function BlogSection({ posts, onNavigate }) {
  if (!posts.length) return null;

  const featured = posts[0];
  const side     = posts.slice(1, 5);   // up to 4 side cards in grid
  const mini     = posts.slice(5, 12);  // up to 7 in bottom scroll row

  return (
    <section className="home-section blog-sec">
      <style>{BLOG_CSS}</style>

      {/* ── Header ── */}
      <div className="blog-sec-head">
        <div className="blog-sec-head-left">
          <span className="blog-sec-label">✍️ Editorial</span>
          <h2 className="blog-sec-title">From the Blog</h2>
        </div>
        <button className="blog-sec-viewall" onClick={() => onNavigate("/blog")}>
          All Articles →
        </button>
      </div>

      {/* ── Magazine grid ── */}
      <div className="blog-mag-grid">

        {/* Featured card */}
        <div
          className="blog-feat"
          onClick={() => onNavigate(`/blog/${featured.slug}`)}
        >
          <div className="blog-feat-img-wrap">
            {featured.coverImage
              ? <img src={featured.coverImage} alt={featured.title} className="blog-feat-img" loading="lazy" onError={e => e.target.style.display="none"} />
              : <div className="blog-feat-ph">✍️</div>
            }
            <div className="blog-feat-overlay" />
          </div>
          <div className="blog-feat-body">
            <span className={`blog-feat-badge ${bsCatClass(featured.category)}`}>
              {featured.category || "Article"}
            </span>
            <h3 className="blog-feat-title">{featured.title}</h3>
            {featured.excerpt && (
              <p className="blog-feat-excerpt">{featured.excerpt}</p>
            )}
            <div className="blog-feat-meta">
              <span>{bsFmtDate(featured.createdAt)}</span>
              {featured.readTime && <>
                <span className="blog-feat-meta-dot">·</span>
                <span>{featured.readTime} min read</span>
              </>}
              {featured.views > 0 && <>
                <span className="blog-feat-meta-dot">·</span>
                <span>👁 {featured.views.toLocaleString()}</span>
              </>}
              {featured.movieTitle && <>
                <span className="blog-feat-meta-dot">·</span>
                <span className="blog-feat-movie">🎬 {featured.movieTitle}</span>
              </>}
            </div>
            <span className="blog-feat-read">Read Article →</span>
          </div>
        </div>

        {/* Side cards */}
        {side.map((post, i) => (
          <div
            key={post._id}
            className="blog-side-card"
            style={{ animationDelay: `${(i + 1) * 60}ms` }}
            onClick={() => onNavigate(`/blog/${post.slug}`)}
          >
            <div className="blog-side-img-wrap">
              {post.coverImage
                ? <img src={post.coverImage} alt={post.title} className="blog-side-img" loading="lazy" onError={e => e.target.style.display="none"} />
                : <div className="blog-side-ph">✍️</div>
              }
              <span className={`blog-side-badge ${bsCatClass(post.category)}`}>
                {post.category || "Article"}
              </span>
              {post.views > 0 && (
                <span className="blog-side-views">👁 {post.views >= 1000 ? `${(post.views/1000).toFixed(1)}k` : post.views}</span>
              )}
            </div>
            <div className="blog-side-body">
              <h3 className="blog-side-title">{post.title}</h3>
              {post.excerpt && <p className="blog-side-excerpt">{post.excerpt}</p>}
              <div className="blog-side-meta">
                <span>{bsFmtDate(post.createdAt)}</span>
                {post.readTime && <>
                  <span className="blog-side-dot">·</span>
                  <span>{post.readTime} min</span>
                </>}
                {post.movieTitle && <>
                  <span className="blog-side-dot">·</span>
                  <span className="blog-side-movie">🎬 {post.movieTitle}</span>
                </>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom scroll row (mini cards) ── */}
      {mini.length > 0 && (
        <div className="blog-more-row">
          {mini.map((post, i) => (
            <div
              key={post._id}
              className="blog-mini"
              style={{ animationDelay: `${i * 45}ms` }}
              onClick={() => onNavigate(`/blog/${post.slug}`)}
            >
              <div className="blog-mini-img-wrap">
                {post.coverImage
                  ? <img src={post.coverImage} alt={post.title} className="blog-mini-img" loading="lazy" onError={e => e.target.style.display="none"} />
                  : <div className="blog-mini-ph">✍️</div>
                }
              </div>
              <div className="blog-mini-body">
                <h4 className="blog-mini-title">{post.title}</h4>
                <div className="blog-mini-meta">{bsFmtDate(post.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MODULE-LEVEL CACHE// ═══════════════════════════════════════════════════════════════════
//  MODULE-LEVEL CACHE — survives navigation, cleared on hard refresh
//  This is the key fix: data is fetched ONCE and reused on every
//  back-navigation. No spinner, no skeleton, instant restore.
// ═══════════════════════════════════════════════════════════════════
const _cache = {
  movies: null,   // null = not fetched yet, [] = fetched but empty
  news:   null,
  blog:   null,
  ts:     0,      // timestamp of last fetch (for optional TTL)
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — re-fetch if stale

// ═══════════════════════════════════════════════════════════════════
//  MAIN HOME — 3-phase progressive loading
//  Phase 1: hero + first rows  → from cache (instant) or API fetch
//  Phase 2: news               → deferred via requestIdleCallback
//  Phase 3: all other rows     → IntersectionObserver (scroll-lazy)
// ═══════════════════════════════════════════════════════════════════
// ── Recently played helper (reads localStorage) ─────────────────
function readRecentPlayed() {
  try { return JSON.parse(localStorage.getItem("op_recent_songs") || "[]"); } catch { return []; }
}

export default function Home({ production }) {
  const navigate = useNavigate();

  // ── State — initialise from cache so back-navigation is instant ──
  const [movies,      setMovies]      = useState(() => _cache.movies || []);
  const [moviesReady, setMoviesReady] = useState(() => _cache.movies !== null);
  const [recentPlayed, setRecentPlayed] = useState(() => readRecentPlayed());
  const [news,        setNews]        = useState(() => _cache.news   || []);
  const [blogPosts,   setBlogPosts]   = useState(() => _cache.blog   || []);
  const [heroIdx,     setHeroIdx]     = useState(0);
  const timerRef = useRef(null);

  // ── Phase 1: movies ───────────────────────────────────────────
  // If cache is warm → skip fetch entirely (instant re-render on back)
  // If cache is stale or empty → fetch, update cache, update state
  useEffect(() => {
    const now = Date.now();
    // Cache hit — already have data, nothing to do
    if (_cache.movies !== null && (now - _cache.ts) < CACHE_TTL) return;

    // Cache miss or stale — fetch
    API.getMovies()
      .then(m => {
        _cache.movies = m;
        _cache.ts     = Date.now();
        setMovies(m);
        setMoviesReady(true);
      })
      .catch(() => setMoviesReady(true));
  }, []);

  // ── Phase 2: news (deferred, non-critical) ─────────────────────
  useEffect(() => {
    if (!moviesReady) return;
    // Cache hit
    if (_cache.news !== null) { setNews(_cache.news); return; }

    const load = () => API.getNews()
      .then(n => {
        const slice = n.slice(0, 12);
        _cache.news = slice;
        setNews(slice);
      })
      .catch(() => {});

    const id = typeof requestIdleCallback !== "undefined"
      ? requestIdleCallback(load, { timeout: 2000 })
      : setTimeout(load, 200);
    return () => (typeof requestIdleCallback !== "undefined" ? cancelIdleCallback(id) : clearTimeout(id));
  }, [moviesReady]);

  // ── Phase 2b: blog posts (deferred, after news) ────────────────
  useEffect(() => {
    if (!moviesReady) return;
    if (_cache.blog !== null) { setBlogPosts(_cache.blog); return; }

    const load = () => {
      const _rawBase = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api");
      const apiBase = _rawBase.replace(/\/$/, "").replace(/\/api$/, "");
      fetch(`${apiBase}/api/blog?limit=12`)
        .then(r => r.json())
        .then(data => {
          const posts = data.posts || data || [];
          _cache.blog = posts;
          setBlogPosts(posts);
        })
        .catch(() => {});
    };

    const id = typeof requestIdleCallback !== "undefined"
      ? requestIdleCallback(load, { timeout: 3000 })
      : setTimeout(load, 400);
    return () => (typeof requestIdleCallback !== "undefined" ? cancelIdleCallback(id) : clearTimeout(id));
  }, [moviesReady]);

  // ── Sort helper (stable, memoised once) ───────────────────────
  const srt = useCallback(arr => [...arr].sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return 0;
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return new Date(b.releaseDate) - new Date(a.releaseDate);
  }), []);

  // ── Derived lists — each capped to avoid huge DOM ─────────────
  const MAX = 18; // max cards per row (was 20, small saving)

  const allMovies   = useMemo(() => srt(movies), [movies, srt]);

  // High-priority rows (shown near top of page)
  const thisWeek    = useMemo(() => srt(movies.filter(m => isThisWeek(m.releaseDate) && !m.releaseTBA)).slice(0, MAX), [movies, srt]);
  const thisMonth   = useMemo(() => srt(movies.filter(m => isThisMonth(m.releaseDate))).slice(0, MAX), [movies, srt]);
  const inTheatres  = useMemo(() => srt(movies.filter(m => m.releaseDate && withinDays(m.releaseDate, 35, 35))).slice(0, MAX), [movies, srt]);

  // Lower-priority rows (will be lazy-rendered by Row's own IO)
  const lastWeek    = useMemo(() => srt(movies.filter(m => isLastWeek(m.releaseDate) && !isThisWeek(m.releaseDate))).slice(0, MAX), [movies, srt]);
  const lastMonth   = useMemo(() => srt(movies.filter(m => isLastMonth(m.releaseDate))).slice(0, MAX), [movies, srt]);
  const withTrailer = useMemo(() => {
  return allMovies
    .filter(m => m.media?.trailer?.ytId)
    .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)) // newest first
    .slice(0, 12);
}, [allMovies]);
  const highRated   = useMemo(() => movies
    .filter(m => m.reviews?.length >= 1 && m.releaseDate && new Date(m.releaseDate) >= RECENT_CUTOFF)
    .map(m => ({ ...m, avg: m.reviews.reduce((s, r) => s + (r.rating || 0), 0) / m.reviews.length }))
    .filter(m => m.avg >= 3.5)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, MAX),
  [movies]);
  const upcoming = useMemo(() => {
    const now = new Date();
    return movies
      .filter(m => !m.verdict || m.verdict === "Upcoming")
      .sort((a, b) => {
        const aDate = a.releaseDate ? new Date(a.releaseDate) : null;
        const bDate = b.releaseDate ? new Date(b.releaseDate) : null;
        // TBA (no date) always goes to the end
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        // Soonest upcoming first (ascending)
        return aDate - bDate;
      })
      .slice(0, MAX);
  }, [movies]);

  // All Films row — capped at 30 (link to /movies for the rest)
  const allFilmsRow = useMemo(() => allMovies.slice(0, 30), [allMovies]);

  // Recent Movies — 16 most recently released movies (past first, TBA/upcoming last)
  const recentMovies = useMemo(() => {
    const now = new Date();
    const released = [...movies]
      .filter(m => m.releaseDate && new Date(m.releaseDate) <= now)
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
    const notReleased = [...movies]
      .filter(m => !m.releaseDate || new Date(m.releaseDate) > now)
      .sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
    return [...released, ...notReleased].slice(0, 12);
  }, [movies]);

  // Trending songs — built lazily from allMovies
  const trendingSongs = useMemo(() => {
    const songs = [];
    allMovies
      .filter(m => (!m.verdict || m.verdict === "Upcoming") || withinDays(m.releaseDate, 90, 60))
      .forEach(m => (m.media?.songs || []).forEach((s, idx) => {
        if (s.ytId) songs.push({ ...s, songIndex: idx, movieTitle: m.title, movieId: m._id, posterUrl: m.posterUrl });
      }));
    if (songs.length < 6) {
      allMovies.forEach(m => (m.media?.songs || []).forEach((s, idx) => {
        if (s.ytId && !songs.find(t => t.movieId === m._id && t.songIndex === idx))
          songs.push({ ...s, songIndex: idx, movieTitle: m.title, movieId: m._id, posterUrl: m.posterUrl });
      }));
    }
    return songs.slice(0, 12);
  }, [allMovies]);

  // ── Hero ───────────────────────────────────────────────────────
  const heroMovies = useMemo(() => {
    const now = new Date();
    return movies
      .filter(m => {
        const h = m.thumbnailUrl || m.media?.trailer?.ytId || m.posterUrl;
        if (!h) return false;
        if (!m.verdict || m.verdict === "Upcoming") return true;
        if (m.releaseDate && withinDays(m.releaseDate, 60, 0)) return true;
        return isThisMonth(m.releaseDate) || isLastMonth(m.releaseDate);
      })
      .sort((a, b) => {
        const aUp = !a.verdict || a.verdict === "Upcoming";
        const bUp = !b.verdict || b.verdict === "Upcoming";
        const aDate = a.releaseDate ? new Date(a.releaseDate) : null;
        const bDate = b.releaseDate ? new Date(b.releaseDate) : null;

        // Both upcoming → soonest first, TBA at end
        if (aUp && bUp) {
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return aDate - bDate;
        }
        // Upcoming before released
        if (aUp && !bUp) return -1;
        if (!aUp && bUp) return 1;
        // Both released → most recent first
        return (bDate || 0) - (aDate || 0);
      })
      .slice(0, 8);
  }, [movies]);

  // Hero auto-advance
  useEffect(() => {
    if (!heroMovies.length) return;
    timerRef.current = setInterval(() => setHeroIdx(i => (i + 1) % heroMovies.length), 5500);
    return () => clearInterval(timerRef.current);
  }, [heroMovies.length]);

  const goHero = i => { setHeroIdx(i); clearInterval(timerRef.current); };

  // ── Always render the full page shell; skeletons fill each
  //    section until moviesReady flips true. This means users
  //    immediately see the complete page structure instead of a
  //    single pulsing banner, making the loading state obvious.
  return (
    <div className="home-root">
      <SEO {...homeSEO()} />
      <style>{`@keyframes homepulse{0%,100%{opacity:1}50%{opacity:.35}}${cardCss}${heroCss}`}</style>

      {/* ══ HERO ══ */}
      {!moviesReady
        ? <HeroSkeleton />
        : heroMovies.length > 0 && (
        <div className="hh-wrap">
          {heroMovies.map((m, i) => {
            const isAdjacentOrActive =
              i === heroIdx ||
              i === (heroIdx + 1) % heroMovies.length ||
              i === (heroIdx - 1 + heroMovies.length) % heroMovies.length;

            // Build dots and strip — only passed to the active slide so they
            // sit inside hh-inner and are correctly positioned
            const dotsEl = (
              <div className="hh-dots">
                {heroMovies.map((_, di) => (
                  <button key={di}
                    className={`hh-dot${di === heroIdx ? " active" : ""}`}
                    onClick={() => goHero(di)} />
                ))}
              </div>
            );

            const stripEl = (
              <div className="hh-strip">
                {heroMovies.map((sm, si) => {
                  const simg = heroImage(sm);
                  return (
                    <div key={sm._id}
                      className={`hh-strip-item${si === heroIdx ? " active" : ""}`}
                      onClick={() => goHero(si)}>
                      {simg
                        ? <img src={simg} alt={sm.title} loading="lazy" decoding="async"
                            onError={e => e.target.style.display="none"} />
                        : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".9rem" }}>🎬</div>}
                      {sm.media?.trailer?.ytId && <div className="hh-strip-play">▶</div>}
                    </div>
                  );
                })}
              </div>
            );

            return isAdjacentOrActive
              ? <HeroSlide key={m._id} movie={m} active={i === heroIdx}
                  dots={dotsEl} strip={stripEl} />
              : <div key={m._id} className="hh-slide" />;
          })}
        </div>
      )}

      {production && (
        <div className="home-cta-bar">
          <span>Welcome back, <strong>{production.name}</strong></span>
          <button className="btn btn-gold btn-sm" onClick={() => navigate("/dashboard/add-movie")}>+ Add Movie</button>
        </div>
      )}

      {/* ══ SECTIONS ══ */}
      <div className="home-sections">

        {/* ── Recent Movies Row ── */}
        <Row title="🎬 Recent Movies" badge="Latest" viewAll="/movies" loading={!moviesReady}>
          {recentMovies.map(m => <MovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
        </Row>
                {upcoming.length > 0 && (
          <Row title="🚀 Upcoming" viewAll="/movies">
            {upcoming.map(m => <MovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
          </Row>
        )}

        {/* Always show these rows while loading OR when data fills them */}
                {(!moviesReady || inTheatres.length > 0) && (
          <Row title="🎭 Now in Theatres" badge="Live" badgeColor="#95e5b8" loading={!moviesReady}>
            {inTheatres.map(m => <MovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
          </Row>
        )}
        {(!moviesReady || thisMonth.length > 0) && (
          <Row title="🗓 This Month" badge="New" loading={!moviesReady}>
            {thisMonth.map(m => <MovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
          </Row>
        )}






                {withTrailer.length > 0 && (
          <Row title="🎬 Latest Trailers" gap={16} cardRatio="16/9" cardWidth={265}>
            {withTrailer.map(m => <TrailerCard key={m._id} movie={m} onClick={() => navigate(`/movie/${m._id}`, { state: { scrollTo: "trailer" } })} />)}
          </Row>
        )}

        {/* News: only rendered once Phase-2 fetch completes */}
        {news.length > 0 && (
          <Row title="📰 Latest News" viewAll="/news" gap={14} cardRatio="136/250" cardWidth={250}>
            {news.map(n => <NewsCard key={n._id} n={n} onClick={() => navigate(`/news/${n._id}`)} />)}
          </Row>
        )}

        {/* ── Blog Articles — IMDb style ── */}
        {blogPosts.length > 0 && (
          <BlogSection posts={blogPosts} onNavigate={navigate} />
        )}

        {/* ── Recently Played ── */}
        {recentPlayed.length > 0 && (
          <Row title="🕐 Recently Played" viewAll="/songs" gap={14} cardRatio="1/1" cardWidth={150}>
            {recentPlayed.slice(0, 12).map((s, i) => {
              const thumb = s.thumb || (s.ytId ? `https://img.youtube.com/vi/${s.ytId}/mqdefault.jpg` : null);
              return (
                <div key={i} className="home-song-card" style={{flexShrink:0,width:150}}
                  onClick={() => navigate(`/song/${s.movieSlug||s.movieId}/${s.songIdx}`)}>
                  <div className="home-song-thumb">
                    {thumb
                      ? <img src={thumb} alt={s.title} loading="lazy" onError={e=>e.target.style.display="none"}/>
                      : <div style={{width:"100%",height:"100%",background:"linear-gradient(135deg,#111,#1a1200)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.8rem"}}>🎵</div>
                    }
                    <div className="home-song-play">▶</div>
                  </div>
                  <div className="home-song-info">
                    <p className="home-song-title">{s.title}</p>
                    {s.singer && <p className="home-song-singer">{s.singer}</p>}
                    <p className="home-song-movie" style={{color:"var(--gold)"}}>{s.movieTitle}</p>
                  </div>
                </div>
              );
            })}
          </Row>
        )}

        {trendingSongs.length > 0 && (
          <Row title="🎵 Trending Songs" viewAll="/songs" gap={14} cardRatio="1/1" cardWidth={150}>
            {trendingSongs.map((s, i) => (
              <SongCard
                key={i}
                s={s}
                onClick={() => navigate(
                  s._movieSlug
                    ? s._movieSlug.replace("/movie/", "/song/") + "/" + s.songIndex
                    : `/song/${s.movieId}/${s.songIndex}`
                )}
              />
            ))}
          </Row>
        )}

        {highRated.length > 0 && (
          <Row title="⭐ Top Rated" badge="Critic Pick" badgeColor="#e8c87a">
            {highRated.map(m => <MovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
          </Row>
        )}



        {/* <Row title="🎬 All Films" viewAll="/movies">
          {allFilmsRow.map(m => <MovieCard key={m._id} movie={m} onClick={() => navigate(moviePath(m))} />)}
        </Row> */}

        {movies.length === 0 && (
          <div className="home-empty">
            <div style={{ fontSize: "4rem", marginBottom: 16 }}>🎬</div>
            <h2>No movies yet</h2>
            <p style={{ color: "var(--muted)" }}>Be the first to add a film to Ollipedia</p>
            {production && (
              <button className="btn btn-gold" onClick={() => navigate("/dashboard/add-movie")}>+ Add Movie</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}