import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

// ── Helpers ───────────────────────────────────────────────
const extractYtId = (input) => {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
};
const ytThumb = (ytId) => {
  const id = extractYtId(ytId);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
};
const heroImage = (m) =>
  m.thumbnailUrl || ytThumb(m.media?.trailer?.ytId) || m.posterUrl || null;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

// Stable reference — computed once at module load, not on every render
const NOW = new Date();

const withinDays = (d, pastDays, futureDays) => {
  if (!d) return false;
  const diff = (new Date(d) - NOW) / 86400000;
  return diff >= -pastDays && diff <= futureDays;
};
const isThisWeek  = (d) => withinDays(d, 7, 14);
const isThisMonth = (d) => {
  if (!d) return false;
  const dt = new Date(d);
  return dt.getMonth() === NOW.getMonth() && dt.getFullYear() === NOW.getFullYear();
};
const isLastMonth = (d) => {
  if (!d) return false;
  const dt  = new Date(d);
  const lm  = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
  return dt.getMonth() === lm.getMonth() && dt.getFullYear() === lm.getFullYear();
};
const isLastWeek = (d) => withinDays(d, 14, 0);

// ── Hero Slide ────────────────────────────────────────────
function HeroSlide({ movie, active }) {
  const navigate = useNavigate();
  const img = heroImage(movie);
  return (
    <div
      className={`home-hero-slide ${active ? "active" : ""}`}
      style={{ backgroundImage: img ? `url(${img})` : "none" }}
    >
      <div className="home-hero-overlay" />
      <div className="home-hero-content">
        <div className="home-hero-meta">
          {movie.category && <span className="home-tag">{movie.category}</span>}
          {movie.genre?.[0] && <span className="home-tag-outline">{movie.genre[0]}</span>}
          {movie.language  && <span className="home-tag-outline">{movie.language}</span>}
        </div>
        <h1 className="home-hero-title">{movie.title}</h1>
        <div className="home-hero-info">
          {movie.releaseDate && (
            <span>🗓 {new Date(movie.releaseDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}</span>
          )}
          {movie.director && <span>Dir. {movie.director}</span>}
          {movie.verdict && movie.verdict !== "Upcoming" && (
            <span className="home-hero-verdict-badge">{movie.verdict}</span>
          )}
        </div>
        {movie.synopsis && (
          <p className="home-hero-synopsis">
            {movie.synopsis.slice(0, 160)}{movie.synopsis.length > 160 ? "…" : ""}
          </p>
        )}
        <div className="home-hero-actions">
          {movie.media?.trailer?.ytId && (
            <a
              href={`https://www.youtube.com/watch?v=${movie.media.trailer.ytId}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-hero-play"
            >▶ Watch Trailer</a>
          )}
          <button className="btn-hero-info" onClick={() => navigate(`/movie/${movie._id}`)}>
            More Info
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Movie Card ────────────────────────────────────────────
function MovieCard({ movie }) {
  const navigate = useNavigate();
  const img = movie.posterUrl || movie.thumbnailUrl || ytThumb(movie.media?.trailer?.ytId);
  return (
    <div className="home-card" onClick={() => navigate(`/movie/${movie._id}`)}>
      <div className="home-card-img">
        {img
          ? <img src={img} alt={movie.title} loading="lazy"
              onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }} />
          : null}
        <div className="home-card-fallback" style={{ display: img ? "none" : "flex" }}>🎬</div>
        <div className="home-card-overlay">
          <span className="home-card-verdict">{movie.verdict || "Upcoming"}</span>
          {movie.genre?.[0] && <span className="home-card-genre">{movie.genre[0]}</span>}
        </div>
      </div>
      <div className="home-card-info">
        <p className="home-card-title">{movie.title}</p>
        {movie.releaseDate && <p className="home-card-date">{fmtDate(movie.releaseDate)}</p>}
      </div>
    </div>
  );
}

// ── Movie Row ─────────────────────────────────────────────
function MovieRow({ title, movies, viewAllPath }) {
  const navigate = useNavigate();
  const rowRef = useRef(null);
  const scroll = (d) => rowRef.current?.scrollBy({ left: d * 280, behavior: "smooth" });
  const limited = movies.slice(0, 15);
  if (!movies.length) return null;
  return (
    <section className="home-section">
      <div className="home-section-header">
        <h2 className="home-section-title">{title}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(movies.length > 15 || viewAllPath) && (
            <button className="home-view-all" onClick={() => navigate(viewAllPath || "/movies")}>
              View All ({movies.length})
            </button>
          )}
          <button className="home-arrow" onClick={() => scroll(-1)}>‹</button>
          <button className="home-arrow" onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div className="home-row" ref={rowRef}>
        {limited.map(m => <MovieCard key={m._id} movie={m} />)}
      </div>
    </section>
  );
}

// ── Trailers Row ──────────────────────────────────────────
function TrailersRow({ movies }) {
  const rowRef = useRef(null);
  const scroll = (d) => rowRef.current?.scrollBy({ left: d * 340, behavior: "smooth" });
  const withTrailer = movies.filter(m => m.media?.trailer?.ytId).slice(0, 15);
  if (!withTrailer.length) return null;
  return (
    <section className="home-section">
      <div className="home-section-header">
        <h2 className="home-section-title">🎬 Latest Trailers</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="home-arrow" onClick={() => scroll(-1)}>‹</button>
          <button className="home-arrow" onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div className="home-row home-trailer-row" ref={rowRef}>
        {withTrailer.map(m => (
          <a key={m._id}
            href={`https://www.youtube.com/watch?v=${m.media.trailer.ytId}`}
            target="_blank" rel="noopener noreferrer"
            className="home-trailer-card">
            <div className="home-trailer-thumb">
              <img src={ytThumb(m.media.trailer.ytId)} alt={m.title}
                onError={e => e.target.style.opacity = "0"} />
              <div className="home-trailer-play">▶</div>
              <div className="home-trailer-duration">Trailer</div>
            </div>
            <div className="home-trailer-info">
              <p className="home-trailer-title">{m.title}</p>
              {m.releaseDate && <p className="home-trailer-date">{fmtDate(m.releaseDate)}</p>}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

// ── News Row ──────────────────────────────────────────────
function NewsRow({ news }) {
  const navigate = useNavigate();
  const rowRef = useRef(null);
  const scroll = (d) => rowRef.current?.scrollBy({ left: d * 300, behavior: "smooth" });
  if (!news.length) return null;
  return (
    <section className="home-section">
      <div className="home-section-header">
        <h2 className="home-section-title">📰 Latest News</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="home-view-all" onClick={() => navigate("/news")}>View All</button>
          <button className="home-arrow" onClick={() => scroll(-1)}>‹</button>
          <button className="home-arrow" onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div className="home-row home-news-row" ref={rowRef}>
        {news.map(n => (
          <div key={n._id} className="home-news-card" onClick={() => navigate(`/news/${n._id}`)}>
            {n.imageUrl && (
              <div className="home-news-img">
                <img src={n.imageUrl} alt={n.title} onError={e => e.target.style.display = "none"} />
              </div>
            )}
            <div className="home-news-body">
              {n.category && <span className="home-news-cat">{n.category}</span>}
              <p className="home-news-title">{n.title}</p>
              {n.movieTitle && <p className="home-news-movie">{n.movieTitle}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Songs Row ─────────────────────────────────────────────
function SongsRow({ movies }) {
  const rowRef = useRef(null);
  const scroll = (d) => rowRef.current?.scrollBy({ left: d * 220, behavior: "smooth" });
  const songs = [];
  movies.forEach(m => {
    (m.media?.songs || []).forEach(s => {
      if (s.ytId) songs.push({ ...s, movieTitle: m.title, movieId: m._id, posterUrl: m.posterUrl });
    });
  });
  if (!songs.length) return null;
  return (
    <section className="home-section">
      <div className="home-section-header">
        <h2 className="home-section-title">🎵 Latest Songs</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="home-arrow" onClick={() => scroll(-1)}>‹</button>
          <button className="home-arrow" onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div className="home-row home-songs-row" ref={rowRef}>
        {songs.slice(0, 15).map((s, i) => (
          <a key={i}
            href={`https://www.youtube.com/watch?v=${s.ytId}`}
            target="_blank" rel="noopener noreferrer"
            className="home-song-card">
            <div className="home-song-thumb">
              <img src={s.thumbnailUrl || ytThumb(s.ytId) || s.posterUrl || ""}
                alt={s.title} onError={e => e.target.style.opacity = "0.2"} />
              <div className="home-song-play">♪</div>
            </div>
            <div className="home-song-info">
              <p className="home-song-title">{s.title}</p>
              <p className="home-song-singer">{s.singer}</p>
              <p className="home-song-movie">{s.movieTitle}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════
export default function Home({ production }) {
  const navigate  = useNavigate();
  const [movies,  setMovies]  = useState([]);
  const [news,    setNews]    = useState([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    // Phase 1 — fetch movies first; render hero + rows immediately
    API.getMovies()
      .then(m => { setMovies(m); setLoading(false); })
      .catch(() => setLoading(false));

    // Phase 2 — news is below the fold; fetch independently, doesn't block
    API.getNews()
      .then(n => setNews(n.slice(0, 12)))
      .catch(() => {});
  }, []);

  // ── Memoised section arrays — computed once per movies change, not per render ──
  const allMovies = useMemo(
    () => [...movies].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [movies]
  );

  const heroMovies = useMemo(() => movies
    .filter(m => {
      const hasImg = m.thumbnailUrl || m.media?.trailer?.ytId || m.posterUrl;
      if (!hasImg) return false;
      if (!m.verdict || m.verdict === "Upcoming") return true;
      if (m.releaseDate && withinDays(m.releaseDate, 60, 0)) return true;
      if (isThisMonth(m.releaseDate) || isLastMonth(m.releaseDate)) return true;
      return false;
    })
    .sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0))
    .slice(0, 8),
    [movies]
  );

  const thisWeek   = useMemo(() => movies.filter(m => isThisWeek(m.releaseDate)  && !m.releaseTBA), [movies]);
  const thisMonth  = useMemo(() => movies.filter(m => isThisMonth(m.releaseDate)),                  [movies]);
  const lastMonth  = useMemo(() => movies.filter(m => isLastMonth(m.releaseDate)),                  [movies]);
  const lastWeek   = useMemo(() => movies.filter(m => isLastWeek(m.releaseDate)  && !isThisWeek(m.releaseDate)), [movies]);
  const upcoming   = useMemo(() => movies.filter(m => !m.verdict || m.verdict === "Upcoming"),      [movies]);
  const inTheatres = useMemo(() => movies.filter(m => ["Hit","Average","Flop","Super Hit","Blockbuster"].includes(m.verdict)), [movies]);
  const highRated  = useMemo(() => movies
    .filter(m => m.reviews?.length >= 1)
    .map(m => ({ ...m, avg: m.reviews.reduce((s, r) => s + (r.rating || 0), 0) / m.reviews.length }))
    .filter(m => m.avg >= 3.5)
    .sort((a, b) => b.avg - a.avg),
    [movies]
  );

  // Hero auto-advance — only restarts when heroMovies.length actually changes
  const heroLen = heroMovies.length;
  useEffect(() => {
    if (!heroLen) return;
    timerRef.current = setInterval(() => setHeroIdx(i => (i + 1) % heroLen), 5500);
    return () => clearInterval(timerRef.current);
  }, [heroLen]);

  const goHero = (i) => { setHeroIdx(i); clearInterval(timerRef.current); };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--muted)" }}>
      Loading…
    </div>
  );

  return (
    <div className="home-root">

      {/* ── HERO ── */}
      {heroMovies.length > 0 && (
        <div className="home-hero">
          {heroMovies.map((m, i) => (
            <HeroSlide key={m._id} movie={m} active={i === heroIdx} />
          ))}

          <div className="home-hero-dots">
            {heroMovies.map((_, i) => (
              <button key={i} className={`home-hero-dot ${i === heroIdx ? "active" : ""}`}
                onClick={() => goHero(i)} />
            ))}
          </div>

          <div className="home-hero-strip">
            {heroMovies.map((m, i) => {
              const img = heroImage(m);
              return (
                <div key={m._id}
                  className={`home-hero-strip-item ${i === heroIdx ? "active" : ""}`}
                  onClick={() => goHero(i)}>
                  {img
                    ? <img src={img} alt={m.title} onError={e => e.target.style.display = "none"} />
                    : <div className="home-strip-fallback">🎬</div>}
                  {m.media?.trailer?.ytId && <div className="home-strip-play">▶</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CTA Bar ── */}
      {production && (
        <div className="home-cta-bar">
          <span>Welcome back, <strong>{production.name}</strong></span>
          <button className="btn btn-gold btn-sm" onClick={() => navigate("/dashboard/add-movie")}>+ Add Movie</button>
        </div>
      )}

      <div className="home-sections">

        {thisWeek.length   > 0 && <MovieRow title="🔥 Releasing This Week" movies={thisWeek} />}
        {thisMonth.length  > 0 && <MovieRow title="🗓 This Month"          movies={thisMonth} />}
        {lastWeek.length   > 0 && <MovieRow title="📅 Last Week"           movies={lastWeek} />}
        {lastMonth.length  > 0 && <MovieRow title="📆 Last Month"          movies={lastMonth} />}
        {inTheatres.length > 0 && <MovieRow title="🎭 Now in Theatres"     movies={inTheatres} />}

        <TrailersRow movies={allMovies} />
        <NewsRow news={news} />
        <SongsRow movies={allMovies} />

        {highRated.length > 0 && <MovieRow title="⭐ Top Rated"       movies={highRated} />}
        {upcoming.length  > 0 && <MovieRow title="🚀 Upcoming Movies" movies={upcoming} viewAllPath="/movies" />}

        <MovieRow title="🎬 All Movies" movies={allMovies} viewAllPath="/movies" />

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