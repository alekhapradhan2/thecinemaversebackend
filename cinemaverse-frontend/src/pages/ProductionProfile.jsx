import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { API } from "../api/api";
import { MovieCard, SafeImg } from "../components/UI";

export default function ProductionProfile({ production: currentProd }) {
  const { id } = useParams();
  const [prod, setProd] = useState(null);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([API.getProduction(id), API.getProductionMovies(id)])
      .then(([p, m]) => { setProd(p); setMovies(m); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page empty-state"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;
  if (!prod) return <div className="page empty-state"><h3>Production not found</h3></div>;

  const isOwner = currentProd && String(currentProd._id) === String(id);
  const myMovies = movies.filter(m => String(m.productionId?._id) === String(id));
  const collabMovies = movies.filter(m => String(m.productionId?._id) !== String(id));

  return (
    <div className="page">
      {/* Banner + Profile */}
      <div className="prod-hero">
        <div className="prod-hero-banner">
          <SafeImg src={prod.banner} alt="Banner" className="prod-hero-banner-img" />
        </div>
        <div className="prod-hero-body">
          <div className="prod-logo-wrap">
            <SafeImg src={prod.logo} alt={prod.name} className="prod-logo"
              fallback={<div className="prod-logo-placeholder">{prod.name[0]}</div>} />
          </div>
          <div className="prod-hero-info">
            <h1 className="prod-name">{prod.name}</h1>
            <div className="prod-meta">
              {prod.location && <span>📍 {prod.location}</span>}
              {prod.founded && <span>📅 Est. {prod.founded}</span>}
              {prod.website && <a href={prod.website} target="_blank" rel="noreferrer">🌐 Website</a>}
            </div>
            {prod.bio && <p className="prod-bio">{prod.bio}</p>}
          </div>
          {isOwner && (
            <div className="prod-hero-actions">
              <Link to="/dashboard" className="btn btn-gold btn-sm">⚙ My Dashboard</Link>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="prod-stats">
        <div className="prod-stat">
          <div className="prod-stat-val">{myMovies.length}</div>
          <div className="prod-stat-label">Films</div>
        </div>
        <div className="prod-stat">
          <div className="prod-stat-val">{collabMovies.length}</div>
          <div className="prod-stat-label">Collaborations</div>
        </div>
        <div className="prod-stat">
          <div className="prod-stat-val">
            {[...new Set(movies.flatMap(m => m.cast || []).map(c => String(c.castId)))].length}
          </div>
          <div className="prod-stat-label">Cast</div>
        </div>
      </div>

      {/* Films */}
      {myMovies.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Films by {prod.name}</span>
          </div>
          <div className="movie-grid">
            {myMovies.map(m => <MovieCard key={m._id} movie={m} />)}
          </div>
        </div>
      )}

      {/* Collaborations */}
      {collabMovies.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Collaborations</span>
          </div>
          <div className="movie-grid">
            {collabMovies.map(m => <MovieCard key={m._id} movie={m} />)}
          </div>
        </div>
      )}

      {myMovies.length === 0 && collabMovies.length === 0 && (
        <div className="empty-state">
          <h3>No films yet</h3>
          {isOwner && <Link to="/dashboard/add-movie" className="btn btn-gold" style={{ marginTop: 16 }}>+ Add Your First Movie</Link>}
        </div>
      )}
    </div>
  );
}
