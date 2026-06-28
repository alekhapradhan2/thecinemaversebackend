import React from "react";
import { useNavigate } from "react-router-dom";
import CastProfile from "./CastProfile";

export default function PortalCastProfile({ production }) {
  const navigate = useNavigate();
  return (
    <div className="portal-wrap">
      <div className="portal-wrap-topbar">
        <button className="portal-wrap-back" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <span className="portal-wrap-brand">OLLI<span>PEDIA</span> Portal</span>
        <span />
      </div>
      <CastProfile portalMode />
    </div>
  );
}
