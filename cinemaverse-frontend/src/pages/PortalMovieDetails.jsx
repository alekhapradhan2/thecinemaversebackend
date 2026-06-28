import React from "react";
import { Link, useNavigate } from "react-router-dom";
import MovieDetails from "./MovieDetails";

// Wraps the existing MovieDetails inside a portal shell (no public navbar)
export default function PortalMovieDetails({ production, onToast }) {
  const navigate = useNavigate();
  return (
    <div className="portal-wrap">
      <div className="portal-wrap-topbar">
        <button className="portal-wrap-back" onClick={() => navigate("/dashboard")}>
          ← Back to Portal
        </button>
        <span className="portal-wrap-brand">OLLI<span>PEDIA</span> Portal</span>
        <span />
      </div>
      <MovieDetails production={production} onToast={onToast} portalMode />
    </div>
  );
}
