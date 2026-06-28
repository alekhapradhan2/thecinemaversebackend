// src/components/admin/AutoIndexPanel.jsx
// Drop this file into:  src/components/admin/AutoIndexPanel.jsx
// Then import it in your admin dashboard wherever you want the panel.
//
// Uses your existing API pattern from api.js — no new dependencies needed.

import React, { useState } from "react";
import { getAdminToken } from "../api/api";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const adminPost = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

export default function AutoIndexPanel({ onToast }) {
  const [singleUrl, setSingleUrl] = useState("");
  const [batchText, setBatchText] = useState("");
  const [mode, setMode]           = useState("single");
  const [loading, setLoading]     = useState(false);
  const [log, setLog]             = useState([]);

  const addLog = (url, ok) =>
    setLog(prev => [{ url, ok, time: new Date().toLocaleTimeString("en-IN") }, ...prev].slice(0, 30));

  const handleIndex = async () => {
    const urls = mode === "batch"
      ? batchText.split("\n").map(u => u.trim()).filter(Boolean)
      : [singleUrl.trim()].filter(Boolean);

    if (!urls.length) { onToast?.("Enter at least one URL", "error"); return; }

    setLoading(true);
    try {
      const data = await adminPost("/admin/auto-index", { urls });
      urls.forEach(u => addLog(u, true));
      onToast?.(`✅ Indexed ${data.indexed} URL${data.indexed > 1 ? "s" : ""}`, "success");
      if (mode === "single") setSingleUrl(""); else setBatchText("");
    } catch (e) {
      urls.forEach(u => addLog(u, false));
      onToast?.("❌ " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const s = {
    card:     { background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 18 },
    label:    { fontSize: "0.72rem", color: "var(--muted)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 },
    input:    { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", color: "var(--text)", fontSize: "0.83rem", fontFamily: "monospace", outline: "none" },
    btn:      { background: "var(--gold)", color: "#000", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 800, fontSize: "0.82rem", cursor: "pointer", marginTop: 12 },
    btnGhost: { background: "rgba(255,255,255,0.05)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 12px", fontSize: "0.7rem", cursor: "pointer" },
    code:     { background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: "12px 14px", fontFamily: "monospace", fontSize: "0.76rem", overflowX: "auto", lineHeight: 1.7, whiteSpace: "pre" },
    dot:      (ok) => ({ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: ok ? "#4caf7d" : "#e87a6a", marginRight: 6, flexShrink: 0 }),
  };

  return (
    <div style={{ padding: "4px 0", color: "var(--text)", fontFamily: "inherit" }}>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: "1.12rem", marginBottom: 4 }}>📡 Auto-Indexing</div>
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6 }}>
          Ping Google &amp; Bing instantly after publishing — no Search Console clicking needed.
        </div>
      </div>

      {/* .env setup */}
      <div style={{ ...s.card, background: "rgba(201,151,58,0.05)", border: "1px solid rgba(201,151,58,0.2)" }}>
        <div style={{ fontWeight: 700, color: "var(--gold)", marginBottom: 10, fontSize: "0.85rem" }}>
          🔧 Add to your .env (one-time)
        </div>
        <div style={s.code}>{`SITE_URL=https://www.ollypedia.in\nGOOGLE_KEY_FILE=./google-service-account.json\nBING_API_KEY=your_bing_api_key_here`}</div>
        <div style={{ marginTop: 10, fontSize: "0.73rem", color: "var(--muted)", lineHeight: 1.7 }}>
          Google key →{" "}
          <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: "var(--gold)" }}>
            console.cloud.google.com
          </a>{" "}→ Enable Indexing API → Service Accounts → Download JSON → add email as OWNER in Search Console
          <br />
          Bing key →{" "}
          <a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer" style={{ color: "var(--gold)" }}>
            bing.com/webmasters
          </a>{" "}→ Settings → API Access → Generate Key
        </div>
      </div>

      {/* Box office wiring tip */}
      <div style={s.card}>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 10 }}>
          ✅ Add this inside POST /api/admin/movies/:id/boxoffice-days in server.js
        </div>
        <div style={s.code}>{`// After  await movie.save({ validateBeforeSave: false });
// Add this one line:
autoIndexUrl(\`/\${movie.slug}-day-\${dayNum}-box-office-collection\`).catch(() => {});`}</div>
        <div style={{ fontSize: "0.73rem", color: "var(--muted)", marginTop: 8 }}>
          This pings Google every time you add a new day's collection — no extra clicks needed.
        </div>
      </div>

      {/* Manual trigger */}
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
            {mode === "batch" ? "📦 Batch index" : "🔗 Manual re-index"}
          </div>
          <button style={s.btnGhost} onClick={() => setMode(m => m === "single" ? "batch" : "single")}>
            Switch to {mode === "single" ? "batch" : "single"}
          </button>
        </div>

        {mode === "batch" ? (
          <>
            <span style={s.label}>One URL per line</span>
            <textarea
              rows={5}
              value={batchText}
              onChange={e => setBatchText(e.target.value)}
              placeholder={"/mehermunda-2026-day-1-box-office-collection\n/mehermunda-2026-day-2-box-office-collection"}
              style={{ ...s.input, resize: "vertical" }}
            />
          </>
        ) : (
          <>
            <span style={s.label}>Slug or full URL</span>
            <input
              type="text"
              value={singleUrl}
              onChange={e => setSingleUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleIndex()}
              placeholder="/mehermunda-2026-day-25-box-office-collection"
              style={s.input}
            />
          </>
        )}

        <button
          onClick={handleIndex}
          disabled={loading}
          style={{ ...s.btn, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "⏳ Pinging…" : "📡 Index Now"}
        </button>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 12 }}>Recent Pings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {log.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", fontSize: "0.77rem", gap: 6 }}>
                <span style={s.dot(entry.ok)} />
                <span style={{ fontFamily: "monospace", color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.url}
                </span>
                <span style={{ color: "var(--muted)", fontSize: "0.68rem", flexShrink: 0 }}>{entry.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}