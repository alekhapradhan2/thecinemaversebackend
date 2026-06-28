import React, { useState } from "react";
import { Link } from "react-router-dom";
import { API, setToken, setCastToken } from "../api/api";

export default function LoginModal({ onClose, onSuccess, onCastSuccess }) {
  const [tab,      setTab]      = useState("production"); // "production" | "artist"
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (tab === "production") {
        const { token, production } = await API.login(email, password);
        setToken(token);
        onSuccess(production, token);
      } else {
        const { token, castMember } = await API.castLogin(email, password);
        setCastToken(token);
        onCastSuccess(castMember, token);
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Invalid email or password");
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Login to Ollipedia</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display:"flex", gap:0, marginBottom:20, border:"1px solid var(--border)", borderRadius:6, overflow:"hidden" }}>
          {[["production","🎬 Production House"],["artist","🎭 Artist / Crew"]].map(([key, label]) => (
            <button key={key} type="button"
              onClick={() => { setTab(key); setError(""); }}
              style={{
                flex:1, padding:"10px 8px", border:"none", cursor:"pointer",
                background: tab === key ? "var(--gold)" : "var(--bg3)",
                color:      tab === key ? "#000" : "var(--muted)",
                fontWeight: tab === key ? 700 : 400,
                fontSize: "0.83rem", fontFamily:"inherit",
                transition: "all 0.15s",
              }}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" required value={email}
              onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" required value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p style={{ color:"var(--red)", fontSize:"0.85rem", marginBottom:12 }}>{error}</p>}
          <button className="btn btn-gold" style={{ width:"100%" }} type="submit" disabled={loading}>
            {loading ? "Logging in…" : `Login as ${tab === "production" ? "Production" : "Artist"}`}
          </button>
        </form>

        <p style={{ marginTop:16, fontSize:"0.78rem", color:"var(--muted)", textAlign:"center" }}>
          {tab === "production"
            ? <><Link to="/register" style={{ color:"var(--gold)" }} onClick={onClose}>Register a Production House</Link></>
            : <><Link to="/cast-register" style={{ color:"var(--gold)" }} onClick={onClose}>Register as Artist / Crew</Link></>
          }
        </p>
      </div>
    </div>
  );
}