import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ── Toast ──
export function Toast({ message, type = "success", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast ${type}`}>{type === "success" ? "✓ " : "✕ "}{message}</div>;
}
export default Toast;

// ── Safe image with fallback ──
export function SafeImg({ src, alt, className, style, fallback }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return fallback || null;
  return <img src={src} alt={alt} className={className} style={style} onError={() => setBroken(true)} />;
}

// ── Verdict badge class ──
export function verdictClass(v) {
  if (!v) return "verdict-upcoming";
  const l = v.toLowerCase();
  if (["hit","super hit","blockbuster"].includes(l)) return "verdict-hit";
  if (["flop","disaster"].includes(l)) return "verdict-flop";
  if (l === "average") return "verdict-average";
  return "verdict-upcoming";
}

// ── Movie Card ──
export function MovieCard({ movie, portalMode }) {
  const navigate = useNavigate();
  return (
    <div className="movie-card" onClick={() => navigate(portalMode ? `/portal/movie/${movie._id}` : `/movie/${movie._id}`)}>
      <div className="movie-card-poster">
        <SafeImg
          src={movie.posterUrl} alt={movie.title}
          fallback={<span className="movie-card-poster-placeholder">🎬</span>}
        />
        <span className={`movie-card-verdict ${verdictClass(movie.verdict)}`}>
          {movie.verdict || "Upcoming"}
        </span>
      </div>
      <div className="movie-card-body">
        <div className="movie-card-title">{movie.title}</div>
        <div className="movie-card-meta">
          {movie.productionId?.name && <span>{movie.productionId.name}</span>}
          {movie.releaseDate && <span> · {movie.releaseDate}</span>}
        </div>
      </div>
    </div>
  );
}