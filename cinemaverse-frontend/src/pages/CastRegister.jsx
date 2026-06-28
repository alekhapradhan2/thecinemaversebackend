import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, setCastToken } from "../api/api";

const ALL_ROLES = [
  "Actor","Actress","Director","Producer",
  "Music Director","Singer","Lyricist",
  "Cinematographer","Choreographer",
  "Background Score","Editor","Art Director","Costume Designer",
  "Stunt Director","Voice Artist","Other"
];

export default function CastRegister({ onSuccess, onToast }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "",
    roles: [], gender: "", dob: "", location: "", bio: "", photo: "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleRole = (r) => set("roles", form.roles.includes(r) ? form.roles.filter(x => x !== r) : [...form.roles, r]);

  const steps = ["Personal Info", "Your Roles", "Review & Register"];

  const validate = () => {
    if (step === 0) {
      if (!form.name.trim()) return "Full name is required";
      if (!form.email)       return "Email is required";
      if (form.password.length < 6) return "Password must be at least 6 characters";
      if (form.password !== form.confirmPassword) return "Passwords do not match";
    }
    if (step === 1) {
      if (form.roles.length === 0) return "Select at least one role";
    }
    return null;
  };

  const next = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setStep(s => s + 1);
  };

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const { token, castMember } = await API.castRegister({
        name: form.name, email: form.email, password: form.password,
        roles: form.roles, gender: form.gender, dob: form.dob,
        location: form.location, bio: form.bio, photo: form.photo,
      });
      setCastToken(token);
      onSuccess?.(castMember, token);
      onToast?.(`Welcome, ${castMember.name}! Your profile is ready.`);
      navigate("/cast-portal");
    } catch (e) {
      setError(typeof e === "string" ? e : "Registration failed");
    } finally { setLoading(false); }
  };

  const roleColors = {
    Actor:"#3a5a8a", Actress:"#8a3a6a", Director:"#5a3a8a", Producer:"#2d6a4f",
    Singer:"#8a5a3a", "Music Director":"#6a5a3a",
  };

  return (
    <div className="register-page" style={{ maxWidth: 680 }}>
      <div className="register-header">
        <div style={{ marginBottom:12 }}>
          <Link to="/" className="btn btn-ghost btn-sm">← Back to Home</Link>
        </div>
        <h1>Join as Industry Professional</h1>
        <p>Create your artist profile on Ollipedia — the Ollywood database</p>
      </div>

      <div className="register-card">
        {/* Step indicators */}
        <div className="register-steps">
          {steps.map((s, i) => (
            <div key={s} className={`register-step ${i === step ? "active" : i < step ? "done" : ""}`}>
              {i < step ? "✓" : i + 1}
            </div>
          ))}
        </div>
        <p style={{ textAlign:"center", color:"var(--muted)", fontSize:"0.82rem", marginBottom:24 }}>
          Step {step + 1} of {steps.length} — <strong style={{ color:"var(--text)" }}>{steps[step]}</strong>
        </p>

        {/* STEP 0 */}
        {step === 0 && (
          <>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Your real name or screen name" />
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="your@email.com" />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input className="form-input" type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password *</label>
                <input className="form-input" type="password" value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} placeholder="Repeat password" />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select className="form-select" value={form.gender} onChange={e => set("gender", e.target.value)}>
                  <option value="">Select…</option>
                  <option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input className="form-input" type="date" value={form.dob} onChange={e => set("dob", e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Bhubaneswar, Odisha" />
            </div>
            <div className="form-group">
              <label className="form-label">Photo URL</label>
              <input className="form-input" value={form.photo} onChange={e => set("photo", e.target.value)} placeholder="https://…" />
            </div>
            <div className="form-group">
              <label className="form-label">Bio</label>
              <textarea className="form-textarea" value={form.bio} onChange={e => set("bio", e.target.value)} style={{ minHeight:80 }} placeholder="Brief introduction…" />
            </div>
          </>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <>
            <p style={{ color:"var(--muted)", fontSize:"0.85rem", marginBottom:20, lineHeight:1.6 }}>
              Select all roles that apply to you. Your portal will show features relevant to each role. You can update this later.
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px,1fr))", gap:10, marginBottom:24 }}>
              {ALL_ROLES.map(r => {
                const active = form.roles.includes(r);
                const color  = roleColors[r] || "#444";
                return (
                  <button key={r} type="button"
                    onClick={() => toggleRole(r)}
                    style={{
                      padding:"12px 14px", borderRadius:8, cursor:"pointer",
                      border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
                      background: active ? "rgba(201,151,58,0.12)" : "var(--bg3)",
                      color: active ? "var(--gold)" : "var(--muted)",
                      fontWeight: active ? 700 : 400,
                      fontFamily:"inherit", fontSize:"0.85rem",
                      display:"flex", alignItems:"center", gap:8,
                      transition:"all 0.15s",
                    }}>
                    <span>{active ? "✓" : "○"}</span>
                    {r}
                  </button>
                );
              })}
            </div>
            {form.roles.length > 0 && (
              <div style={{ background:"rgba(201,151,58,0.06)", border:"1px solid rgba(201,151,58,0.2)", borderRadius:6, padding:12 }}>
                <p style={{ fontSize:"0.78rem", color:"var(--gold)", fontWeight:700, marginBottom:6 }}>Your roles:</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {form.roles.map(r => (
                    <span key={r} style={{ background:"rgba(201,151,58,0.15)", color:"var(--gold)", fontSize:"0.75rem", padding:"3px 10px", borderRadius:10, fontWeight:600 }}>{r}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* STEP 2 — Review */}
        {step === 2 && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"flex", gap:20, alignItems:"center" }}>
              <div style={{ width:72, height:72, borderRadius:"50%", background:"var(--bg3)", border:"2px solid var(--border)", overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2rem" }}>
                {form.photo
                  ? <img src={form.photo} alt={form.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />
                  : "👤"
                }
              </div>
              <div>
                <h2 style={{ fontSize:"1.3rem", marginBottom:4 }}>{form.name}</h2>
                <p style={{ fontSize:"0.8rem", color:"var(--muted)" }}>{form.email}</p>
                {form.location && <p style={{ fontSize:"0.8rem", color:"var(--muted)" }}>📍 {form.location}</p>}
              </div>
            </div>
            <div>
              <p style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:6 }}>ROLES</p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {form.roles.map(r => (
                  <span key={r} style={{ background:"rgba(201,151,58,0.15)", color:"var(--gold)", fontSize:"0.78rem", padding:"4px 12px", borderRadius:10, fontWeight:600 }}>{r}</span>
                ))}
              </div>
            </div>
            {form.bio && (
              <div>
                <p style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:4 }}>BIO</p>
                <p style={{ fontSize:"0.85rem" }}>{form.bio}</p>
              </div>
            )}
          </div>
        )}

        {error && <p style={{ color:"var(--red)", fontSize:"0.85rem", margin:"16px 0 0" }}>{error}</p>}

        <div style={{ display:"flex", gap:10, marginTop:28 }}>
          {step > 0 && (
            <button className="btn btn-outline" onClick={() => { setStep(s => s-1); setError(""); }}>← Back</button>
          )}
          {step < steps.length - 1
            ? <button className="btn btn-gold" style={{ flex:1 }} onClick={next}>Continue →</button>
            : <button className="btn btn-gold" style={{ flex:1 }} onClick={submit} disabled={loading}>
                {loading ? "Creating profile…" : "🎬 Create My Artist Profile"}
              </button>
          }
        </div>

        <p style={{ textAlign:"center", marginTop:16, fontSize:"0.78rem", color:"var(--muted)" }}>
          Already have an account? <button style={{ background:"none", border:"none", color:"var(--gold)", cursor:"pointer", fontFamily:"inherit", fontSize:"inherit" }} onClick={() => navigate("/")}>Login here</button>
        </p>
      </div>
    </div>
  );
}
