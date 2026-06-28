// src/components/admin/SacnilkScraperPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  Sacnilk Scraper Panel — v5
//  Movie Tracking Management System
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { API, getAdminToken } from "../api/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

const STATUS_COLOR = { success: "#4caf82", error: "#e8876a", running: "#c9973a", skipped: "#7ec8e3", default: "#666" };
const STATUS_ICON  = { success: "✅", error: "❌", running: "⏳", skipped: "⏭", default: "○" };
const sc  = (s) => STATUS_COLOR[s] || STATUS_COLOR.default;
const si  = (s) => STATUS_ICON[s]  || STATUS_ICON.default;
const cfgMovieId = (c) => String(c.movieId?._id ?? c.movieId ?? "");

// ── API calls go through the shared API object from api.js ─────────────────

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

// ── Mini bar chart ────────────────────────────────────
function MiniBarChart({ days }) {
  if (!days || days.length === 0) return null;
  const vals = days.map((d) => parseFloat(String(d.net || "0").replace(/[^0-9.]/g, "")) || 0);
  const max  = Math.max(...vals, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 44, marginTop: 12 }}>
      {vals.map((v, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1, minWidth: 8 }}>
          <div
            title={`Day ${days[i].day}: ${days[i].net}`}
            style={{
              width: "100%",
              height: `${Math.max(4, (v / max) * 38)}px`,
              background: `linear-gradient(180deg, rgba(201,151,58,${0.5 + 0.5*(v/max)}) 0%, rgba(201,151,58,0.2) 100%)`,
              borderRadius: "3px 3px 0 0",
              transition: "height 0.3s",
            }}
          />
          {days.length <= 14 && (
            <span style={{ fontSize: "0.52rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{days[i].day}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Poster thumbnail ──────────────────────────────────
function Poster({ movie, size = 44 }) {
  const h = Math.round(size * 1.42);
  return (
    <div style={{ width: size, height: h, borderRadius: 7, overflow: "hidden", flexShrink: 0, background: "var(--bg3)" }}>
      {movie.posterUrl || movie.thumbnailUrl ? (
        <img
          src={movie.posterUrl || movie.thumbnailUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 40 ? "1.3rem" : "1rem" }}>🎬</div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────
function SectionHeader({ icon, title, subtitle, badge, badgeColor = "#c9973a", badgeBg = "rgba(201,151,58,0.1)", iconBg = "rgba(201,151,58,0.12)", iconBorder = "rgba(201,151,58,0.35)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: iconBg, border: `1px solid ${iconBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontSize: "1rem",
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: "0.96rem" }}>{title}</div>
        {subtitle && <div style={{ fontSize: "0.71rem", color: "var(--muted)", marginTop: 1 }}>{subtitle}</div>}
      </div>
      {badge != null && (
        <span style={{
          fontSize: "0.68rem", fontWeight: 700,
          color: badgeColor, background: badgeBg,
          border: `1px solid ${badgeColor}33`,
          padding: "3px 12px", borderRadius: 10,
        }}>{badge}</span>
      )}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────
const Divider = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "30px 0" }}>
    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    {label && (
      <span style={{ fontSize: "0.63rem", fontWeight: 700, letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase" }}>{label}</span>
    )}
    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
  </div>
);

// ── Confirm Dialog ────────────────────────────────────
function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = "Confirm", confirmColor = "var(--red)", icon = "⚠️" }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 16, padding: 28, maxWidth: 420, width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: 10 }}>{icon}</div>
        <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 8 }}>{title}</div>
        <p style={{ color: "var(--muted)", fontSize: "0.84rem", lineHeight: 1.6, marginBottom: 22 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ padding: "8px 18px", borderRadius: 9, background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{ padding: "8px 20px", borderRadius: 9, background: confirmColor, border: "none", color: "#fff", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700 }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Toast notification ────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map((t) => {
        const colors = {
          success: { bg: "rgba(76,175,130,0.95)",  border: "#4caf82" },
          error:   { bg: "rgba(220,60,60,0.95)",    border: "#e8876a" },
          warn:    { bg: "rgba(201,151,58,0.95)",   border: "#c9973a" },
          info:    { bg: "rgba(126,200,227,0.95)",  border: "#7ec8e3" },
        };
        const c = colors[t.type] || colors.info;
        return (
          <div key={t.id} style={{
            background: c.bg, border: `1px solid ${c.border}`,
            color: "#fff", borderRadius: 10, padding: "11px 18px",
            fontSize: "0.82rem", fontWeight: 600,
            boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
            animation: "fadeInUp 0.2s ease",
            maxWidth: 340,
          }}>{t.message}</div>
        );
      })}
    </div>
  );
}

// ── History Panel ─────────────────────────────────────
function HistoryPanel({ movie, logs, onClose }) {
  const [tab, setTab]     = useState("days");
  const mid               = String(movie._id);
  const sortedDays        = [...(movie.boxOfficeDays || [])].sort((a, b) => a.day - b.day);
  const movieLogs         = logs || [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "20px 20px 0",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg1)", border: "1px solid var(--border)",
          borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 760,
          maxHeight: "75vh", display: "flex", flexDirection: "column",
          boxShadow: "0 -16px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <Poster movie={movie} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{movie.title}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 1 }}>Tracking History</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", cursor: "pointer", fontSize: "1.1rem", padding: "5px 10px", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", padding: "0 22px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {[
            { key: "days", label: `📊 Box Office Days`, count: sortedDays.length },
            { key: "logs", label: `🕷️ Scrape Logs`,     count: movieLogs.length  },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: "none", border: "none",
                borderBottom: tab === key ? "2px solid #c9973a" : "2px solid transparent",
                color: tab === key ? "#c9973a" : "var(--muted)",
                padding: "12px 14px", fontSize: "0.78rem",
                fontWeight: tab === key ? 700 : 500,
                cursor: "pointer", marginBottom: -1,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {label}
              <span style={{
                background: tab === key ? "rgba(201,151,58,0.2)" : "var(--bg3)",
                color: tab === key ? "#c9973a" : "var(--muted)",
                borderRadius: 10, padding: "1px 8px", fontSize: "0.65rem", fontWeight: 700,
              }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>

          {/* Days tab */}
          {tab === "days" && (
            sortedDays.length === 0 ? (
              <EmptyState icon="📊" message="No box office data recorded yet." sub="Use ⚡ Manual Trigger to collect the first entry." />
            ) : (
              <>
                <MiniBarChart days={sortedDays} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                  {sortedDays.map((d, i) => (
                    <div key={i} style={{
                      background: "var(--bg2)", border: "1px solid var(--border)",
                      borderRadius: 10, padding: "9px 14px",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      minWidth: 80,
                    }}>
                      <span style={{ color: "var(--muted)", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Day {d.day}</span>
                      <span style={{ color: "#c9973a", fontWeight: 800, fontSize: "0.88rem" }}>{d.net || "—"}</span>
                      {d.gross && (
                        <span style={{ color: "#7ec8e3", fontWeight: 600, fontSize: "0.75rem" }}>{d.gross}</span>
                      )}
                      {d.date && <span style={{ color: "var(--muted)", fontSize: "0.6rem" }}>{fmtDateShort(d.date) || d.date}</span>}
                      {d.note && d.note.includes("Sacnilk") && (
                        <span style={{ color: "#555", fontSize: "0.55rem", letterSpacing: "0.04em" }}>auto</span>
                      )}
                    </div>
                  ))}
                </div>
                {/* Totals */}
                {sortedDays.length > 0 && (() => {
                  const fmtVal   = (raw) => parseFloat(String(raw || "0").replace(/[^0-9.]/g, "")) || 0;
                  const totalNet   = sortedDays.reduce((s, d) => s + fmtVal(d.net),   0);
                  const totalGross = sortedDays.reduce((s, d) => s + fmtVal(d.gross), 0);
                  const unit       = sortedDays[0]?.net?.includes("Cr") ? "Cr" : "L";
                  const bestDay    = sortedDays.reduce((b, d) => {
                    const v = fmtVal(d.net);
                    return v > b.v ? { v, day: d.day } : b;
                  }, { v: 0, day: "—" });
                  return (
                    <div style={{ marginTop: 18, padding: "12px 16px", background: "rgba(201,151,58,0.07)", border: "1px solid rgba(201,151,58,0.2)", borderRadius: 10, display: "flex", gap: 24, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Days</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#c9973a" }}>{sortedDays.length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Net</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#4caf82" }}>{totalNet.toFixed(2)} {unit}</div>
                      </div>
                      {totalGross > 0 && (
                        <div>
                          <div style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Gross</div>
                          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#7ec8e3" }}>{totalGross.toFixed(2)} {unit}</div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Best Day</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#7ec8e3" }}>Day {bestDay.day}</div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )
          )}

          {/* Logs tab */}
          {tab === "logs" && (
            movieLogs.length === 0 ? (
              <EmptyState icon="🕷️" message="No scrape logs yet." sub="Logs appear after the first manual trigger or scheduled run." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {movieLogs.map((log, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    background: "var(--bg2)", borderRadius: 9, padding: "10px 14px",
                    fontSize: "0.78rem", borderLeft: `3px solid ${sc(log.status)}`,
                  }}>
                    <span style={{ color: sc(log.status), flexShrink: 0, fontSize: "0.9rem", marginTop: 1 }}>{si(log.status)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--muted)", fontSize: "0.72rem", marginBottom: 3 }}>{fmtDate(log.runAt)}</div>
                      {log.status === "success" ? (
                        <div style={{ color: "#4caf82" }}>
                          Day {log.day} → Net: <strong style={{ color: "#c9973a" }}>{log.net}</strong>
                          {log.gross && <span style={{ color: "#7ec8e3", marginLeft: 4 }}>· Gross {log.gross}</span>}
                          {log.blogSlug && (
                            <> · <a href={`/blog/${log.blogSlug}`} target="_blank" rel="noreferrer" style={{ color: "#7ec8e3", textDecoration: "none" }}>Blog ↗</a></>
                          )}
                        </div>
                      ) : log.status === "skipped" ? (
                        <div style={{ color: "#7ec8e3", fontSize: "0.72rem" }}>
                          ⏭ No new data — Sacnilk hadn't updated yet.
                          {log.error && <span style={{ color: "#555", marginLeft: 4 }}>{log.error}</span>}
                        </div>
                      ) : (
                        <div style={{ color: "#e8876a" }}>{log.error || "Scrape failed"}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────
function EmptyState({ icon, message, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "44px 20px", color: "var(--muted)" }}>
      <div style={{ fontSize: "2.4rem", marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 6 }}>{message}</div>
      {sub && <div style={{ fontSize: "0.76rem" }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function SacnilkScraperPanel({ movies = [], onToast: parentToast }) {
  const [configs,      setConfigs]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState({});
  const [scraping,     setScraping]     = useState({});
  const [scrapingAll,  setScrapingAll]  = useState(false);
  const [logs,         setLogs]         = useState({});
  const [editUrl,      setEditUrl]      = useState({});

  // search & staging
  const [query,        setQuery]        = useState("");
  const [dropResults,  setDropResults]  = useState([]);
  const [staged,       setStaged]       = useState({});
  const inputRef = useRef(null);

  // local toast — stable via useCallback so loadConfigs dep array stays empty
  const [toasts,       setToasts]       = useState([]);
  const parentToastRef = useRef(parentToast);
  const addToastRef    = useRef(null);          // stable ref for use inside useCallback deps
  useEffect(() => { parentToastRef.current = parentToast; }, [parentToast]);

  const addToast = useCallback((message, type = "info") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
    parentToastRef.current?.(message, type);
  }, []);
  addToastRef.current = addToast; // keep ref current on every render (safe, not in render output)

  // modals
  const [confirm,      setConfirm]      = useState(null);
  const [historyMovie, setHistoryMovie] = useState(null); // movie object for history panel

  const loadConfigs = useCallback(async () => {
    try {
      const data = await API.sacnilkGetConfigs();
      setConfigs(Array.isArray(data) ? data : []);
    } catch (e) {
      addToastRef.current?.("Failed to load configs: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  }, []); // stable — no deps

  const loadLogs = useCallback(async (movieId) => {
    try {
      const data = await API.sacnilkGetLogs(movieId);
      setLogs((p) => ({ ...p, [movieId]: Array.isArray(data) ? data : [] }));
    } catch { /* silent */ }
  }, []);

  // Mount once — loadConfigs is stable (empty deps), so this fires exactly once
  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    loadConfigs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived (memoised to avoid stale reference loops) ──
  const configByMovieId = useMemo(() => {
    const map = {};
    for (const c of configs) map[cfgMovieId(c)] = c;
    return map;
  }, [configs]);

  const movieById = useMemo(() => {
    const map = {};
    for (const m of movies) map[String(m._id)] = m;
    return map;
  }, [movies]);

  const trackedMovies = useMemo(() =>
    configs.map((c) => {
      const mid = cfgMovieId(c).trim();
      const found = movieById[mid];
      // Fallback: movie not yet in parent movies prop — show from config data
      return found || {
        _id: mid,
        title: c.movieTitle || `Movie (${mid.slice(-6)})`,
        boxOfficeDays: [],
        posterUrl: "",
        releaseDate: null,
      };
    }),
  [configs, movieById]);

  const trackedIds = useMemo(() => new Set(configs.map(cfgMovieId)), [configs]);

  const untrackedMovies = useMemo(() => {
    const stagedIds = new Set(Object.keys(staged));
    return movies.filter(
      (m) => !trackedIds.has(String(m._id)) && !stagedIds.has(String(m._id))
    );
  }, [movies, trackedIds, staged]);

  const activeCount   = configs.filter((c) => c.active).length;
  const trackedCount  = configs.length;
  const pausedCount   = trackedCount - activeCount;
  const stagedList    = Object.values(staged);
  const totalDays     = configs.reduce((s, c) => s + (movieById[cfgMovieId(c)]?.boxOfficeDays?.length || 0), 0);

  // ── Search dropdown ──────────────────────────────────
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setDropResults([]); return; }
    setDropResults(
      untrackedMovies.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 8)
    );
  }, [query, untrackedMovies]);

  const pickMovie = (movie) => {
    setStaged((p) => ({ ...p, [String(movie._id)]: { movie, url: movie.sacnilkUrl || "" } }));
    setQuery("");
    setDropResults([]);
    inputRef.current?.focus();
  };

  const removeFromStaged = (id) =>
    setStaged((p) => { const n = { ...p }; delete n[id]; return n; });

  // ── Save config ──────────────────────────────────────
  const saveConfig = async (movieId, payload) => {
    setSaving((p) => ({ ...p, [movieId]: true }));
    try {
      await API.sacnilkSaveConfig(movieId, payload);
      addToast("Saved ✓", "success");
      await loadConfigs();
      setEditUrl((p) => { const n = { ...p }; delete n[movieId]; return n; });
    } catch (e) {
      addToast("Save failed: " + e.message, "error");
    } finally {
      setSaving((p) => ({ ...p, [movieId]: false }));
    }
  };

  const toggleActive = (movieId, cur) => saveConfig(movieId, { active: !cur });

  // ── Confirm tracking (from staged) ──────────────────
  const confirmTracking = async (movieId) => {
    const entry = staged[movieId];
    if (!entry) return;
    const url = (entry.url || "").trim();
    if (!url) {
      addToast("Enter the Sacnilk URL first", "error");
      return;
    }
    if (!url.startsWith("http")) {
      addToast("URL must start with http:// or https://", "error");
      return;
    }
    setSaving((p) => ({ ...p, [movieId]: true }));
    try {
      await API.sacnilkSaveConfig(movieId, { sacnilkUrl: url, active: true });
      addToast(`Now tracking "${entry.movie.title}" ✓`, "success");
      removeFromStaged(movieId);
      await loadConfigs();
      await loadLogs(movieId);
    } catch (e) {
      addToast("Failed: " + e.message, "error");
    } finally {
      setSaving((p) => ({ ...p, [movieId]: false }));
    }
  };

  // ── Stop tracking (pause, keep history) ─────────────
  const stopTracking = (movieId, title) => {
    setConfirm({
      title: "Stop Tracking",
      message: `Stop scheduled scraping for "${title}"? Existing box-office data and logs are kept. You can re-activate at any time.`,
      icon: "⏸",
      confirmLabel: "Stop Tracking",
      confirmColor: "#888",
      onConfirm: async () => {
        setConfirm(null);
        await saveConfig(movieId, { active: false });
        addToast(`Tracking paused for "${title}"`, "warn");
      },
    });
  };

  // ── Remove tracking entirely ─────────────────────────
  const removeTracking = (movieId, title) => {
    setConfirm({
      title: "Remove from Tracking",
      message: `Remove "${title}" from the tracking list? Existing data is kept but the config will be deleted.`,
      icon: "🗑",
      confirmLabel: "Remove",
      confirmColor: "var(--red)",
      onConfirm: async () => {
        setConfirm(null);
        setSaving((p) => ({ ...p, [movieId]: true }));
        try {
          await API.sacnilkDeleteConfig(movieId);
          addToast(`Removed "${title}" from tracking`, "success");
          setLogs((p) => { const n = { ...p }; delete n[movieId]; return n; });
          await loadConfigs();
        } catch (e) {
          addToast("Delete failed: " + e.message, "error");
        } finally {
          setSaving((p) => ({ ...p, [movieId]: false }));
        }
      },
    });
  };

  // ── Manual scrape (single) ───────────────────────────
  const scrapeOne = async (movieId, title) => {
    setScraping((p) => ({ ...p, [movieId]: true }));
    try {
      const data = await API.sacnilkScrapeOne(movieId);
      // data now returns: { skipped, netRaw, grossRaw, scrapedTotal, day, date, blogSlug, message }
      if (data.skipped) {
        // Sacnilk hasn't updated yet — nothing was saved or published
        addToast(
          data.message || `⏭ "${title}" skipped — Sacnilk hasn't updated yet. Try again later.`,
          "warn"
        );
      } else {
        const netPart   = data.netRaw   ? `Net ${data.netRaw}`        : "";
        const grossPart = data.grossRaw ? ` · Gross ${data.grossRaw}` : "";
        const datePart  = data.date     ? ` (${data.date})`           : "";
        const msg = data.message ||
          `✅ Day ${data.day}${datePart} — ${netPart}${grossPart}. Blog: /blog/${data.blogSlug}`;
        addToast(msg, "success");
      }
      await loadConfigs();
      await loadLogs(movieId);
    } catch (e) {
      addToast(`Scrape failed for "${title}": ` + e.message, "error");
    } finally {
      setScraping((p) => ({ ...p, [movieId]: false }));
    }
  };

  // ── Track All Active Now ─────────────────────────────
  const trackAllActive = async () => {
    if (activeCount === 0) { addToast("No active movies to track", "warn"); return; }
    setConfirm({
      title: "Track All Active Movies Now",
      message: `Immediately trigger scraping for all ${activeCount} active movie${activeCount > 1 ? "s" : ""}? This runs outside the scheduled 8:00 AM cycle.`,
      icon: "⚡",
      confirmLabel: `Run ${activeCount} Scrapes`,
      confirmColor: "#c9973a",
      onConfirm: async () => {
        setConfirm(null);
        setScrapingAll(true);
        try {
          const data = await API.sacnilkScrapeAll();
          addToast(
            `Batch done: ${data.success} success, ${data.failed} failed`,
            data.failed === 0 ? "success" : "warn"
          );
          await loadConfigs();
          for (const mid of Object.keys(logs)) await loadLogs(mid);
        } catch (e) {
          addToast("Batch scrape failed: " + e.message, "error");
        } finally {
          setScrapingAll(false);
        }
      },
    });
  };

  // ── Open history panel ───────────────────────────────
  const openHistory = async (movie) => {
    const mid = String(movie._id);
    if (!logs[mid]) await loadLogs(mid);
    setHistoryMovie(movie);
  };

  // ── Loading ──────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: "0.9rem" }}>Loading tracker configs…</div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ padding: "0 28px 80px" }}>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        .ssp-row-btn { background:none; border:1px solid var(--border); color:var(--muted); cursor:pointer; border-radius:8px; padding:7px 13px; font-size:0.74rem; font-weight:600; transition:all 0.15s; }
        .ssp-row-btn:hover { border-color:#c9973a; color:#c9973a; background:rgba(201,151,58,0.06); }
        .ssp-row-btn.danger:hover { border-color:#e8876a; color:#e8876a; background:rgba(232,135,106,0.06); }
        .ssp-row-btn.stop:hover { border-color:#888; color:#ccc; background:rgba(255,255,255,0.04); }
        .ssp-row-btn:disabled { opacity:0.35; cursor:not-allowed; }
        .ssp-scrape-btn { background:rgba(201,151,58,0.12); color:#c9973a; border:1px solid rgba(201,151,58,0.3); border-radius:8px; padding:7px 14px; font-size:0.78rem; font-weight:700; cursor:pointer; transition:all 0.15s; }
        .ssp-scrape-btn:hover:not(:disabled) { background:rgba(201,151,58,0.22); }
        .ssp-scrape-btn:disabled { opacity:0.35; cursor:not-allowed; }
      `}</style>

      {/* ══ STICKY HEADER ══════════════════════════════ */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--bg1)", padding: "14px 28px",
        margin: "0 -28px 28px",
        boxShadow: "0 2px 24px rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <h2 style={{ fontSize: "1.3rem", margin: 0, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
          🕷️ Sacnilk Tracker
        </h2>

        <span style={{ fontSize: "0.69rem", color: "var(--muted)", background: "var(--bg3)", padding: "3px 10px", borderRadius: 12, fontWeight: 600 }}>
          {trackedCount} tracked · {activeCount} active
        </span>

        <span style={{ fontSize: "0.67rem", color: "#4caf82", background: "rgba(76,175,130,0.08)", padding: "3px 10px", borderRadius: 10, border: "1px solid rgba(76,175,130,0.2)", fontWeight: 700 }}>
          ⏰ 8:00 AM IST daily
        </span>

        {stagedList.length > 0 && (
          <span style={{ fontSize: "0.67rem", color: "#c9973a", background: "rgba(201,151,58,0.1)", padding: "3px 10px", borderRadius: 10, border: "1px solid rgba(201,151,58,0.25)", fontWeight: 700 }}>
            📋 {stagedList.length} pending
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* ⚡ Track All Active Now */}
        <button
          onClick={trackAllActive}
          disabled={scrapingAll || activeCount === 0}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 9,
            background: scrapingAll ? "rgba(201,151,58,0.08)" : "linear-gradient(135deg, rgba(201,151,58,0.18) 0%, rgba(201,151,58,0.1) 100%)",
            border: "1px solid rgba(201,151,58,0.4)",
            color: "#c9973a", fontWeight: 700, fontSize: "0.82rem",
            cursor: activeCount === 0 ? "not-allowed" : "pointer",
            opacity: activeCount === 0 ? 0.4 : 1,
            transition: "all 0.15s",
          }}
        >
          {scrapingAll ? (
            <>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⚙️</span>
              Running all…
            </>
          ) : (
            <>⚡ Track All Active Now ({activeCount})</>
          )}
        </button>
      </div>

      {/* ══ STATS GRID ═════════════════════════════════ */}
      {trackedCount > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10, marginBottom: 30 }}>
          {[
            { label: "Tracked",    value: trackedCount, icon: "🎬", color: "#c9973a" },
            { label: "Active",     value: activeCount,  icon: "✅", color: "#4caf82" },
            { label: "Paused",     value: pausedCount,  icon: "⏸",  color: "#888"    },
            { label: "Days Recorded", value: totalDays, icon: "📊", color: "#7ec8e3" },
          ].map(({ label, value, icon, color }) => (
            <div key={label} style={{
              background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ fontSize: "1.1rem", marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "0.67rem", color: "var(--muted)", fontWeight: 600, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══ SECTION 1 — SEARCH & ADD ══════════════════ */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader
          icon="🔍"
          title="Add Movie to Track"
          subtitle="Search your movie database, enter the Sacnilk URL, and start tracking"
          badge={`${untrackedMovies.length} available`}
        />

        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
          <input
            ref={inputRef}
            className="form-input"
            style={{ paddingLeft: 38, width: "100%", fontSize: "0.9rem" }}
            placeholder="Search movies by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => { setQuery(""); setDropResults([]); }} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem" }}>✕</button>
          )}
        </div>

        {dropResults.length > 0 && (
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginTop: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}>
            {dropResults.map((movie, idx) => (
              <div
                key={String(movie._id)}
                onClick={() => pickMovie(movie)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px", cursor: "pointer",
                  borderTop: idx > 0 ? "1px solid var(--border)" : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Poster movie={movie} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{movie.title}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)", display: "flex", gap: 8 }}>
                    <span>{movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "TBA"}</span>
                    {movie.sacnilkUrl && <span style={{ color: "#4caf82", fontWeight: 600 }}>✓ URL saved</span>}
                  </div>
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#c9973a", background: "rgba(201,151,58,0.1)", border: "1px solid rgba(201,151,58,0.25)", borderRadius: 8, padding: "3px 10px", flexShrink: 0 }}>+ Select</span>
              </div>
            ))}
          </div>
        )}

        {query.trim() && dropResults.length === 0 && (
          <div style={{ padding: "10px 14px", color: "var(--muted)", fontSize: "0.82rem", background: "var(--bg2)", borderRadius: 10, border: "1px solid var(--border)", marginTop: 6 }}>
            No untracked movies match "{query}"
          </div>
        )}
      </section>

      {/* ══ SECTION 2 — STAGED QUEUE ══════════════════ */}
      {stagedList.length > 0 && (
        <>
          <Divider label="Pending Confirmation" />
          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              icon="📋"
              title="Selected Movies"
              subtitle="Enter the Sacnilk URL and confirm to begin tracking"
              badge={`${stagedList.length} pending`}
              badgeColor="#c9973a"
              iconBg="rgba(201,151,58,0.12)"
              iconBorder="rgba(201,151,58,0.35)"
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stagedList.map(({ movie, url }) => {
                const id         = String(movie._id);
                const isSav      = saving[id];
                const autoFilled = !!movie.sacnilkUrl && url === movie.sacnilkUrl;
                const urlValid   = url.trim().startsWith("http");

                return (
                  <div key={id} style={{
                    background: "var(--bg2)",
                    border: "1px solid rgba(201,151,58,0.3)",
                    borderRadius: 13, overflow: "hidden",
                    animation: "fadeInUp 0.2s ease",
                  }}>
                    <div style={{ height: 2, background: "linear-gradient(90deg,rgba(201,151,58,0.7) 0%,transparent 70%)" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", flexWrap: "wrap" }}>
                      <Poster movie={movie} size={44} />

                      <div style={{ flex: "0 0 auto", minWidth: 120 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.92rem" }}>{movie.title}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 2 }}>
                          {movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "TBA"}
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: 240 }}>
                        <input
                          className="form-input"
                          style={{
                            width: "100%", fontSize: "0.8rem", padding: "8px 12px",
                            borderColor: url && urlValid ? "rgba(76,175,130,0.5)" : url && !urlValid ? "rgba(232,135,106,0.5)" : undefined,
                          }}
                          placeholder="https://www.sacnilk.com/movie/MovieName_2026"
                          value={url}
                          onChange={(e) => setStaged((p) => ({ ...p, [id]: { ...p[id], url: e.target.value } }))}
                          onKeyDown={(e) => e.key === "Enter" && confirmTracking(id)}
                        />
                        {autoFilled && <div style={{ fontSize: "0.67rem", color: "#4caf82", marginTop: 3 }}>✓ Auto-filled from movie data</div>}
                        {url && !urlValid && <div style={{ fontSize: "0.67rem", color: "#e8876a", marginTop: 3 }}>⚠ URL must start with https://</div>}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <button
                          className="btn btn-sm btn-gold"
                          onClick={() => confirmTracking(id)}
                          disabled={isSav || !urlValid}
                          style={{ opacity: !urlValid ? 0.4 : 1, padding: "8px 16px", fontSize: "0.8rem" }}
                        >
                          {isSav ? "⏳ Saving…" : "✓ Start Tracking"}
                        </button>
                        <button
                          onClick={() => removeFromStaged(id)}
                          className="ssp-row-btn danger"
                        >✕ Remove</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* ══ SECTION 3 — CURRENTLY TRACKING TABLE ══════ */}
      <Divider label="Currently Tracking" />
      <section>
        <SectionHeader
          icon="📡"
          title="Currently Tracking"
          subtitle="Stop Tracking pauses scheduled runs while keeping all history. Remove deletes the config."
          badge={`${trackedCount} movies · ${activeCount} active`}
          badgeColor="#4caf82"
          badgeBg="rgba(76,175,130,0.08)"
          iconBg="rgba(76,175,130,0.12)"
          iconBorder="rgba(76,175,130,0.3)"
        />

        {trackedMovies.length === 0 ? (
          <EmptyState
            icon="📡"
            message="No movies being tracked yet."
            sub="Use the search above to add your first movie."
          />
        ) : (
          <>
            {/* Table view for desktop */}
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>

              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 2.2fr 110px 1.6fr auto",
                gap: 0,
                padding: "10px 18px",
                background: "rgba(0,0,0,0.2)",
                borderBottom: "1px solid var(--border)",
                fontSize: "0.67rem", fontWeight: 700,
                color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                <span>Movie</span>
                <span>Sacnilk URL</span>
                <span>Status</span>
                <span>Last Tracked</span>
                <span style={{ textAlign: "right" }}>Actions</span>
              </div>

              {/* Table rows */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {trackedMovies.map((movie, rowIdx) => {
                  const mid      = String(movie._id).trim();
                  // cfg is always available — trackedMovies is built from configs
                  const cfg      = configByMovieId[mid] || configs.find(c => cfgMovieId(c).trim() === mid);
                  if (!cfg) return null; // should never happen

                  const isSav    = saving[mid];
                  const isScrp   = scraping[mid];
                  const lastLog  = cfg?.lastLog;
                  const daysCount = (movie.boxOfficeDays || []).length;
                  const inEdit   = editUrl[mid] !== undefined;
                  const urlVal   = inEdit ? editUrl[mid] : (cfg?.sacnilkUrl || "");

                  const statusPill = !cfg.sacnilkUrl
                    ? { label: "No URL",  color: "#e8876a", bg: "rgba(232,135,106,0.1)",  border: "rgba(232,135,106,0.3)"  }
                    : cfg.active
                    ? { label: "Active",  color: "#4caf82", bg: "rgba(76,175,130,0.1)",   border: "rgba(76,175,130,0.3)"   }
                    : { label: "Paused",  color: "#888",    bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.12)" };

                  return (
                    <div key={mid} style={{ borderTop: rowIdx > 0 ? "1px solid var(--border)" : "none", transition: "background 0.1s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Active top line */}
                      {cfg.active && rowIdx === 0 && (
                        <div style={{ height: 2, background: "linear-gradient(90deg,#4caf82 0%,transparent 60%)" }} />
                      )}

                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 2.2fr 110px 1.6fr auto",
                        gap: 0, alignItems: "center",
                        padding: "14px 18px",
                      }}>

                        {/* ── Col 1: Movie ── */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, paddingRight: 12 }}>
                          <Poster movie={movie} size={36} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {movie.title}
                            </div>
                            <div style={{ fontSize: "0.67rem", color: "var(--muted)", marginTop: 2, display: "flex", gap: 6 }}>
                              {movie.releaseDate && <span>{new Date(movie.releaseDate).getFullYear()}</span>}
                              {daysCount > 0 && (
                                <span style={{ color: "#c9973a", fontWeight: 600 }}>{daysCount}d</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── Col 2: URL ── */}
                        <div style={{ paddingRight: 12, minWidth: 0 }}>
                          {inEdit ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input
                                autoFocus
                                className="form-input"
                                style={{ flex: 1, fontSize: "0.74rem", padding: "5px 9px" }}
                                value={urlVal}
                                onChange={(e) => setEditUrl((p) => ({ ...p, [mid]: e.target.value }))}
                                placeholder="https://www.sacnilk.com/movie/…"
                                onKeyDown={(e) => e.key === "Enter" && saveConfig(mid, { sacnilkUrl: urlVal })}
                              />
                              <button className="btn btn-sm btn-gold" onClick={() => saveConfig(mid, { sacnilkUrl: urlVal })} disabled={isSav} style={{ fontSize: "0.72rem", padding: "5px 10px", flexShrink: 0 }}>
                                {isSav ? "…" : "Save"}
                              </button>
                              <button onClick={() => setEditUrl((p) => { const n = { ...p }; delete n[mid]; return n; })} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.8rem", flexShrink: 0 }}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {cfg.sacnilkUrl ? (
                                <a href={cfg.sacnilkUrl} target="_blank" rel="noreferrer" style={{ color: "#7ec8e3", textDecoration: "none", fontSize: "0.74rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, maxWidth: 200 }}
                                  title={cfg.sacnilkUrl}
                                >{cfg.sacnilkUrl.replace("https://www.sacnilk.com/", "…/")}</a>
                              ) : (
                                <span style={{ color: "#e8876a", fontSize: "0.72rem", fontWeight: 600 }}>⚠ No URL</span>
                              )}
                              <button
                                onClick={() => setEditUrl((p) => ({ ...p, [mid]: cfg.sacnilkUrl || "" }))}
                                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 5, color: "var(--muted)", cursor: "pointer", fontSize: "0.67rem", padding: "2px 8px", flexShrink: 0 }}
                              >✏️</button>
                            </div>
                          )}
                        </div>

                        {/* ── Col 3: Status ── */}
                        <div>
                          <div
                            onClick={() => !isSav && cfg.sacnilkUrl && toggleActive(mid, cfg.active)}
                            title={cfg.active ? "Click to pause" : cfg.sacnilkUrl ? "Click to activate" : "Set URL first"}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              background: statusPill.bg, border: `1px solid ${statusPill.border}`,
                              borderRadius: 8, padding: "4px 10px",
                              fontSize: "0.71rem", fontWeight: 700, color: statusPill.color,
                              cursor: isSav || !cfg.sacnilkUrl ? "default" : "pointer",
                              opacity: isSav ? 0.5 : 1, userSelect: "none",
                            }}
                          >
                            {cfg.sacnilkUrl && (
                              <div style={{ width: 22, height: 11, borderRadius: 999, background: cfg.active ? "#4caf82" : "#444", position: "relative", flexShrink: 0 }}>
                                <div style={{ position: "absolute", top: 2, left: cfg.active ? 12 : 2, width: 7, height: 7, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                              </div>
                            )}
                            {statusPill.label}
                          </div>
                        </div>

                        {/* ── Col 4: Last tracked ── */}
                        <div style={{ paddingRight: 12 }}>
                          {lastLog?.runAt ? (
                            <div>
                              <div style={{ fontSize: "0.7rem", color: sc(lastLog.status), display: "flex", alignItems: "center", gap: 4 }}>
                                <span>{si(lastLog.status)}</span>
                                <span>{fmtDate(lastLog.runAt)}</span>
                              </div>
                              {lastLog.status === "success" && lastLog.net && (
                                <div style={{ fontSize: "0.67rem", color: "#c9973a", marginTop: 2 }}>
                                  Day {lastLog.day} → Net {lastLog.net}
                                  {lastLog.gross && (
                                    <span style={{ color: "#7ec8e3", marginLeft: 4 }}>· Gross {lastLog.gross}</span>
                                  )}
                                </div>
                              )}
                              {lastLog.status === "error" && (
                                <div style={{ fontSize: "0.67rem", color: "#e8876a", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                                  {lastLog.error}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: "0.73rem" }}>Never scraped</span>
                          )}
                        </div>

                        {/* ── Col 5: Actions ── */}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "nowrap" }}>

                          {/* History */}
                          <button
                            className="ssp-row-btn"
                            onClick={() => openHistory(movie)}
                            title="View tracking history"
                            disabled={isSav}
                          >
                            📈 History{daysCount > 0 ? ` (${daysCount})` : ""}
                          </button>

                          {/* Manual trigger */}
                          <button
                            className="ssp-scrape-btn"
                            onClick={() => scrapeOne(mid, movie.title)}
                            disabled={isScrp || !cfg.sacnilkUrl || isSav}
                            title={!cfg.sacnilkUrl ? "Set URL first" : "Scrape now"}
                          >
                            {isScrp ? (
                              <><span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⚙️</span> Running…</>
                            ) : (
                              "⚡ Trigger"
                            )}
                          </button>

                          {/* Stop tracking */}
                          {cfg.active ? (
                            <button
                              className="ssp-row-btn stop"
                              onClick={() => stopTracking(mid, movie.title)}
                              disabled={isSav}
                              title="Pause scheduled tracking (keep history)"
                            >
                              ⏸ Stop
                            </button>
                          ) : (
                            <button
                              className="ssp-row-btn"
                              onClick={() => cfg.sacnilkUrl && toggleActive(mid, false)}
                              disabled={isSav || !cfg.sacnilkUrl}
                              title="Resume tracking"
                              style={{ color: "#4caf82", borderColor: "rgba(76,175,130,0.3)" }}
                            >
                              ▶ Resume
                            </button>
                          )}

                          {/* Remove entirely */}
                          <button
                            className="ssp-row-btn danger"
                            onClick={() => removeTracking(mid, movie.title)}
                            disabled={isSav}
                            title="Remove config entirely"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile / card fallback — shown below 700px via inline note */}
            <p style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 10, textAlign: "right" }}>
              {trackedCount} movie{trackedCount !== 1 ? "s" : ""} tracked · {totalDays} days recorded
            </p>
          </>
        )}
      </section>

      {movies.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", marginTop: 32 }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🎬</div>
          No movies in the database. Add movies from the Movies tab first.
        </div>
      )}

      {/* ══ MODALS ══════════════════════════════════════ */}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          icon={confirm.icon}
          confirmLabel={confirm.confirmLabel}
          confirmColor={confirm.confirmColor}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {historyMovie && (
        <HistoryPanel
          movie={historyMovie}
          logs={logs[String(historyMovie._id)]}
          onClose={() => setHistoryMovie(null)}
        />
      )}

      {/* ══ LOCAL TOASTS ════════════════════════════════ */}
      <Toast toasts={toasts} />
    </div>
  );
}