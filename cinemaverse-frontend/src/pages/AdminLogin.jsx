import SEO from "../components/SEO";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

export default function AdminLogin({ onSuccess, onToast }) {
  const navigate = useNavigate();

  const [mode,     setMode]     = useState("login"); // "login" | "register"
  const [hasAdmin, setHasAdmin] = useState(null);    // null = loading
  const [loading,  setLoading]  = useState(false);

  // Form fields
  const [username, setUsername] = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [secret,   setSecret]   = useState("");      // optional register secret when admins exist

  // Auto-detect: if no admin exists yet, show register form
  useEffect(() => {
    API.adminSetupStatus()
      .then(({ hasAdmin }) => {
        setHasAdmin(hasAdmin);
        setMode(hasAdmin ? "login" : "register");
      })
      .catch(() => {
        setHasAdmin(true);
        setMode("login");
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    if (mode === "register") {
      if (password.length < 8) { onToast?.("Password must be at least 8 characters", "error"); return; }
      if (password !== confirm) { onToast?.("Passwords do not match", "error"); return; }
      if (!email.trim())        { onToast?.("Email is required", "error"); return; }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const { token, admin } = await API.adminLogin(username.trim(), password);
        onSuccess?.(admin, token);
        onToast?.(`Welcome back, ${admin.username}!`, "success");
        navigate("/admin");
      } else {
        const { token, admin } = await API.adminRegister(username.trim(), email.trim(), password, secret);
        onSuccess?.(admin, token);
        onToast?.(`Admin account created! Welcome, ${admin.username}!`, "success");
        navigate("/admin");
      }
    } catch (err) {
      onToast?.(err.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg1)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 14, padding: "40px 36px", width: "100%", maxWidth: 420,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 900, fontSize: "1.6rem", color: "var(--gold)", letterSpacing: "0.1em" }}>
            OLLI<span style={{ color: "var(--text)" }}>PEDIA</span>
          </div>
          <div style={{ marginTop: 6, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
            Admin Portal
          </div>
        </div>

        {/* Tab switcher — only show if setup is already done */}
        {hasAdmin && (
          <div style={{ display: "flex", gap: 0, marginBottom: 28, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "9px 0", background: mode === m ? "var(--gold)" : "transparent",
                color: mode === m ? "#000" : "var(--muted)", border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase",
                transition: "all 0.2s",
              }}>
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>
        )}

        {/* First-time setup banner */}
        {!hasAdmin && hasAdmin !== null && (
          <div style={{
            background: "rgba(255,200,60,0.12)", border: "1px solid var(--gold)",
            borderRadius: 8, padding: "10px 14px", marginBottom: 22,
            fontSize: "0.78rem", color: "var(--gold)", lineHeight: 1.5,
          }}>
            👋 No admin account found. Create the first admin account below.
          </div>
        )}

        {hasAdmin === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: "32px 0" }}>Checking setup…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus autoComplete="username"
                placeholder="admin"
              />
            </div>

            {isRegister && (
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="admin@example.com"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "Min. 8 characters" : "••••••••"}
              />
            </div>

            {isRegister && (
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                />
              </div>
            )}

            {/* Only show secret field when registering and an admin already exists */}
            {isRegister && hasAdmin && (
              <div className="form-group">
                <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  Register Secret
                  <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontWeight: 400 }}>(required — set ADMIN_REGISTER_SECRET in .env)</span>
                </label>
                <input
                  className="form-input"
                  type="password"
                  value={secret}
                  onChange={e => setSecret(e.target.value)}
                  placeholder="Enter register secret"
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-gold"
              style={{ width: "100%", marginTop: 8 }}
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading
                ? (isRegister ? "Creating account…" : "Logging in…")
                : (isRegister ? "Create Admin Account →" : "Login →")}
            </button>
          </form>
        )}

        {mode === "login" && (
          <p style={{ marginTop: 20, fontSize: "0.72rem", color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
            Admin accounts are stored securely in your database.
          </p>
        )}
      </div>
    </div>
  );
}