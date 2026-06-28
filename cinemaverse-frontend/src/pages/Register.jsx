import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API, setToken } from "../api/api";

export default function Register({ onSuccess, onToast }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirm: "",
    logo: "", bio: "", founded: "", website: "", location: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Passwords don't match");
    if (form.password.length < 6) return setError("Password must be at least 6 characters");
    setError(""); setLoading(true);
    try {
      const { token, production } = await API.register({
        name: form.name, email: form.email, password: form.password,
        logo: form.logo, bio: form.bio, founded: form.founded,
        website: form.website, location: form.location,
      });
      setToken(token);
      onSuccess(production);
      onToast && onToast(`Welcome to Ollipedia, ${production.name}!`);
      navigate("/dashboard");
    } catch (e) {
      setError(typeof e === "string" ? e : "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="register-page">
      <div className="register-header">
        <h1>Register Your Production</h1>
        <p>Join Ollipedia to add and manage your Ollywood films.</p>
        <p style={{ marginTop: 8, fontSize: "0.85rem", color: "var(--muted)" }}>
          Already registered? <button className="btn btn-ghost btn-sm" style={{ display: "inline", padding: "0 4px" }} onClick={() => navigate(-1)}>Login</button>
        </p>
      </div>

      <div className="register-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Production Company Name *</label>
            <input className="form-input" required value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Tarang Cine Productions" />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" required value={form.email} onChange={e => set("email", e.target.value)} placeholder="contact@yourproduction.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Bhubaneswar, Odisha" />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Password * (min 6 chars)</label>
              <input className="form-input" type="password" required value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••••" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password *</label>
              <input className="form-input" type="password" required value={form.confirm} onChange={e => set("confirm", e.target.value)} placeholder="••••••••" />
              {form.confirm && form.password !== form.confirm && (
                <p style={{ color: "var(--red)", fontSize: "0.75rem", marginTop: 4 }}>Passwords don't match</p>
              )}
            </div>
          </div>

          <hr className="divider" />
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: 16 }}>Optional — you can fill these later from your dashboard.</p>

          <div className="form-group">
            <label className="form-label">Logo URL</label>
            <input className="form-input" value={form.logo} onChange={e => set("logo", e.target.value)} placeholder="https://…" />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Founded Year</label>
              <input className="form-input" value={form.founded} onChange={e => set("founded", e.target.value)} placeholder="e.g. 2010" />
            </div>
            <div className="form-group">
              <label className="form-label">Website</label>
              <input className="form-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://…" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">About Your Production</label>
            <textarea className="form-textarea" value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Brief description of your production company…" />
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "0.85rem", marginBottom: 12, padding: "10px 14px", background: "rgba(217,79,61,0.1)", borderRadius: 4 }}>{error}</p>}

          <button className="btn btn-gold" type="submit" disabled={loading} style={{ width: "100%", padding: "12px" }}>
            {loading ? "Creating account…" : "🎬 Create Production Account"}
          </button>
        </form>
      </div>
    </div>
  );
}