import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { API, getAdminToken } from "../api/api";

// Lazy-load heavy panel components — only fetched when the user opens that tab
const BlogGenerator = lazy(() => import("./BlogGenerator"));
const BoxOfficePanel = lazy(() => import("./BoxOfficePanel"));
const BMSTrackerPanel = lazy(() => import("./BMSTrackerPanel"));
const MergePanel = lazy(() => import("./MergePanel"));
const AutoIndexPanel = lazy(() => import("./AutoIndexPanel"));
const SacnilkScraperPanel = lazy(() => import("./SacnilkScraperPanel"));
const PosterGeneratorPanel = lazy(() => import("./PosterGeneratorPanel"));



// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════
const GENRES = ["Action", "Drama", "Romance", "Comedy", "Thriller", "Family", "Historical", "Devotional", "Horror", "Action-Drama", "Crime", "Mystery"];
const CATEGORIES = ["Feature Film", "Short Film", "Web Series", "Documentary"];
const CAST_TYPES = [
  "Actor", "Actress", "Director", "Producer",
  "Music Director", "Singer", "Lyricist", "Musician",
  "Screenplay Writer", "Dialogue Writer", "Writer",
  "Cinematographer", "Choreographer", "Editor",
  "Background Score", "Art Director", "Costume Designer",
  "Stunt Director", "Voice Artist", "Other"
];
const VERDICTS = ["Upcoming", "Hit", "Super Hit", "Blockbuster", "Average", "Flop", "Disaster", "Released"];
const OTT_PLATFORMS = [
  { name: "Aao NXT", url: "https://www.aaonxt.com", logo: "🎬" },
  { name: "Tarang Plus", url: "https://www.tarangplus.in", logo: "📺" },
  { name: "Kanccha Lannka", url: "https://www.kancchalannka.com", logo: "🎥" },
  { name: "SonyLIV", url: "https://www.sonyliv.com", logo: "🔴" },
  { name: "Disney+ Hotstar", url: "https://www.hotstar.com", logo: "⭐" },
  { name: "Netflix", url: "https://www.netflix.com", logo: "🎞" },
  { name: "Amazon Prime", url: "https://www.primevideo.com", logo: "📦" },
  { name: "ZEE5", url: "https://www.zee5.com", logo: "🟣" },
  { name: "MX Player", url: "https://www.mxplayer.in", logo: "▶️" },
  { name: "YouTube", url: "https://www.youtube.com", logo: "🔴" },
  { name: "Other", url: "", logo: "🌐" },
];
const NEWS_CATS = ["Update", "Announcement", "Review", "Interview", "Event", "Award", "Other"];

const isOid = (s) => typeof s === "string" && /^[a-f0-9]{24}$/i.test(s.trim());
const extractYtId = (input) => {
  if (!input) return "";
  const s = String(input).trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return "";
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "TBA";
const verdictColor = (v) => v === "Hit" || v === "Super Hit" || v === "Blockbuster" ? "#4caf82" : v === "Upcoming" ? "var(--gold)" : "var(--red)";

// ════════════════════════════════════════════════════════════════
// SMALL HELPERS
// ════════════════════════════════════════════════════════════════
function Spinner() {
  return <div style={{ textAlign: "center", padding: 60, color: "var(--muted)", fontSize: "2rem" }}>⏳</div>;
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header"><span className="modal-title">⚠️ Confirm Delete</span></div>
        <p style={{ padding: "16px 0", color: "var(--text)", lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm" onClick={onConfirm} style={{ background: "var(--red)", color: "#fff", border: "none" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Production Picker ─────────────────────────────────────────────
function ProductionPicker({ selected, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { setResults(await API.searchProductions(query)); } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  const addProd = (p) => {
    if (!selected.some(x => String(x._id) === String(p._id))) onChange([...selected, p]);
    setQuery(""); setResults([]);
  };
  const removeProd = (id) => onChange(selected.filter(x => String(x._id) !== String(id)));
  const createAndAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try { const p = await API.createProduction({ name: newName.trim() }); addProd(p); setNewName(""); setCreating(false); }
    catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {selected.map((p, i) => (
            <span key={p._id || i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(201,151,58,0.12)", border: "1px solid rgba(201,151,58,0.3)", color: "var(--gold)", fontSize: "0.78rem", padding: "4px 10px", borderRadius: 20, fontWeight: 600 }}>
              {i === 0 && <span title="Primary" style={{ fontSize: "0.65rem" }}>★</span>}
              {p.name}
              <button type="button" onClick={() => removeProd(p._id)} style={{ background: "none", border: "none", color: "var(--gold)", cursor: "pointer", padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <input className="form-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search production…" />
        {results.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, zIndex: 50, maxHeight: 180, overflowY: "auto" }}>
            {results.map(p => (
              <div key={p._id} onClick={() => addProd(p)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: "0.85rem" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
      {!creating
        ? <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8, fontSize: "0.75rem" }} onClick={() => setCreating(true)}>+ Create new production</button>
        : (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Production name" style={{ flex: 1 }} />
            <button type="button" className="btn btn-gold btn-sm" disabled={saving || !newName.trim()} onClick={createAndAdd}>{saving ? "…" : "Add"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>✕</button>
          </div>
        )}
    </div>
  );
}

// ── Cast Picker ─────────────────────────────────────────────────
function CastPicker({ cast, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [nc, setNc] = useState({ name: "", type: "Actor", role: "", photo: "", bio: "" });
  const timer = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await API.searchCast(query)); } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  const addFromSearch = (person) => {
    if (cast.some(c => c.castId && String(c.castId) === String(person._id))) return;
    onChange([...cast, { castId: String(person._id), name: person.name, photo: person.photo || "", type: person.type || "Actor", role: "", isNew: false }]);
    setQuery(""); setResults([]);
  };

  const addNew = () => {
    if (!nc.name.trim()) return;
    onChange([...cast, { castId: "", name: nc.name.trim(), photo: nc.photo.trim(), type: nc.type, role: nc.role.trim(), bio: nc.bio.trim(), isNew: true }]);
    setNc({ name: "", type: "Actor", role: "", photo: "", bio: "" });
    setShowNewForm(false);
  };

  const update = (i, k, v) => { const n = [...cast]; n[i] = { ...n[i], [k]: v }; onChange(n); };
  const remove = (i) => { onChange(cast.filter((_, idx) => idx !== i)); if (editIdx === i) setEditIdx(null); };

  return (
    <div>
      {/* Search bar — always visible */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 6 }}>
          🔍 Search & Link Existing Cast
        </label>
        <div style={{ position: "relative" }}>
          <input className="form-input" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Type name to search…" autoComplete="off" />
          {(searching || results.length > 0 || (query.trim() && !searching)) && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, zIndex: 60, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
              {searching && <div style={{ padding: "10px 14px", color: "var(--muted)", fontSize: "0.82rem" }}>Searching…</div>}
              {!searching && results.length === 0 && query.trim() && (
                <div style={{ padding: "10px 14px", color: "var(--muted)", fontSize: "0.82rem" }}>No results — add as new below</div>
              )}
              {results.map(p => {
                const already = cast.some(c => c.castId === String(p._id));
                return (
                  <div key={p._id} onClick={() => !already && addFromSearch(p)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: already ? "default" : "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: already ? 0.5 : 1 }}
                    onMouseEnter={e => { if (!already) e.currentTarget.style.background = "rgba(201,151,58,0.08)"; }}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--bg3)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.photo ? <img src={p.photo} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : "👤"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>{p.name}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--gold)" }}>{p.type}</div>
                    </div>
                    <span style={{ fontSize: "0.68rem", color: already ? "var(--muted)" : "#4caf82", fontWeight: 700 }}>
                      {already ? "✓ Added" : "+ Link"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add new person form */}
      <div style={{ marginBottom: 16 }}>
        {!showNewForm ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowNewForm(true)} style={{ width: "100%", justifyContent: "center" }}>
            + Add New Cast / Crew Member
          </button>
        ) : (
          <div style={{ background: "var(--bg3)", border: "1px solid var(--gold)", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--gold)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>✦ New Cast / Crew Member</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Name *</label>
                <input className="form-input" value={nc.name} onChange={e => setNc(f => ({ ...f, name: e.target.value }))} autoFocus placeholder="Full name" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Type</label>
                <select className="form-select" value={nc.type} onChange={e => setNc(f => ({ ...f, type: e.target.value }))}>
                  {CAST_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Role / Character</label>
                <input className="form-input" value={nc.role} onChange={e => setNc(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Hero" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Photo URL</label>
                <input className="form-input" value={nc.photo} onChange={e => setNc(f => ({ ...f, photo: e.target.value }))} placeholder="https://…" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-gold btn-sm" onClick={addNew} disabled={!nc.name.trim()}>✓ Add to Cast</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowNewForm(false); setNc({ name: "", type: "Actor", role: "", photo: "", bio: "" }); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Cast list */}
      {cast.length === 0
        ? <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: "0.84rem", border: "1px dashed var(--border)", borderRadius: 8 }}>No cast added yet — search above or add new</div>
        : (
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Cast & Crew ({cast.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cast.map((c, i) => (
                <div key={i} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {editIdx === i ? (
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Name *</label>
                          <input className="form-input" value={c.name} onChange={e => update(i, "name", e.target.value)} />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Role / Character</label>
                          <input className="form-input" value={c.role} onChange={e => update(i, "role", e.target.value)} placeholder="e.g. Hero" />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div>
                          <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Type</label>
                          <select className="form-select" value={c.type} onChange={e => update(i, "type", e.target.value)}>
                            {CAST_TYPES.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Photo URL</label>
                          <input className="form-input" value={c.photo} onChange={e => update(i, "photo", e.target.value)} placeholder="https://…" />
                        </div>
                      </div>
                      <button type="button" className="btn btn-gold btn-sm" onClick={() => setEditIdx(null)}>✓ Done</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--bg2)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", border: "1px solid var(--border)" }}>
                        {c.photo ? <img src={c.photo} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : "👤"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{c.name || <span style={{ color: "var(--muted)" }}>Unnamed</span>}</span>
                          <span style={{ fontSize: "0.62rem", fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: "rgba(201,151,58,0.12)", color: "var(--gold)" }}>{c.type}</span>
                          {c.isNew
                            ? <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#e8b96a", background: "rgba(232,185,106,0.12)", padding: "1px 6px", borderRadius: 6 }}>✦ NEW</span>
                            : <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#4caf82", background: "rgba(76,175,130,0.12)", padding: "1px 6px", borderRadius: 6 }}>✓ LINKED</span>}
                        </div>
                        {c.role && <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>as {c.role}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditIdx(i)} style={{ fontSize: "0.7rem", padding: "4px 8px" }}>✏️</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} style={{ color: "var(--red)", fontSize: "0.7rem", padding: "4px 8px" }}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PERSON PICKER — reusable for Singer / Music Director / Lyricist
// Searches Cast by type, allows adding new inline
// ════════════════════════════════════════════════════════════════
function PersonPicker({ label, icon, castType, value, refs, onChange }) {
  // value = display string (comma-sep names)
  // refs  = array of castIds (ObjectId strings)
  // onChange(newValue: string, newRefs: string[])
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhoto, setNewPhoto] = useState("");
  const timer = useRef(null);

  // Selected persons: [{_id, name}]  (built from refs + names)
  const [selected, setSelected] = useState(() => {
    if (!refs?.length) return [];
    return refs.map((id, i) => ({ _id: id, name: (value || "").split(",").map(s => s.trim())[i] || id }));
  });

  // Sync selected -> parent on change
  const update = (next) => {
    setSelected(next);
    const names = next.map(p => p.name).join(", ");
    const ids = next.filter(p => isOid(p._id)).map(p => p._id);
    onChange(names, ids);
  };

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Search all cast, filter by type client-side if type provided
        const all = await API.searchCast(query);
        setResults(castType ? all.filter(p => p.type?.toLowerCase().includes(castType.toLowerCase())) : all);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  const addFromSearch = (person) => {
    if (selected.some(p => p._id === String(person._id))) return;
    update([...selected, { _id: String(person._id), name: person.name }]);
    setQuery(""); setResults([]);
  };

  const addNew = async () => {
    if (!newName.trim()) return;
    try {
      const nc = await API.createCast({ name: newName.trim(), type: castType || "Singer", photo: newPhoto.trim() });
      update([...selected, { _id: String(nc._id), name: nc.name }]);
      setNewName(""); setNewPhoto(""); setShowNew(false);
    } catch (e) {
      // If API fails, add as plain text only
      update([...selected, { _id: "__new__" + Date.now(), name: newName.trim() }]);
      setNewName(""); setNewPhoto(""); setShowNew(false);
    }
  };

  const remove = (idx) => update(selected.filter((_, i) => i !== idx));

  return (
    <div style={{ marginBottom: 0 }}>
      <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 6 }}>
        {icon} {label}
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selected.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(201,151,58,0.1)", border: "1px solid rgba(201,151,58,0.3)", borderRadius: 16, padding: "4px 10px 4px 8px", fontSize: "0.78rem" }}>
              <span style={{ color: "var(--gold)", fontWeight: 600 }}>{p.name}</span>
              {isOid(p._id) && <span style={{ fontSize: "0.6rem", color: "#4caf82", fontWeight: 700 }}>✓</span>}
              <button type="button" onClick={() => remove(i)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.9rem", lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 6 }}>
        <input className="form-input" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`} autoComplete="off" style={{ fontSize: "0.82rem" }} />
        {(searching || results.length > 0 || (query.trim() && !searching)) && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, zIndex: 70, maxHeight: 180, overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
            {searching && <div style={{ padding: "8px 12px", color: "var(--muted)", fontSize: "0.8rem" }}>Searching…</div>}
            {!searching && results.length === 0 && query.trim() && (
              <div style={{ padding: "8px 12px", color: "var(--muted)", fontSize: "0.8rem" }}>No match — add as new below</div>
            )}
            {results.map(p => {
              const already = selected.some(s => s._id === String(p._id));
              return (
                <div key={p._id} onClick={() => !already && addFromSearch(p)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: already ? "default" : "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: already ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!already) e.currentTarget.style.background = "rgba(201,151,58,0.08)"; }}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg3)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem" }}>
                    {p.photo ? <img src={p.photo} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : "👤"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{p.name}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--gold)" }}>{p.type}</div>
                  </div>
                  <span style={{ fontSize: "0.65rem", color: already ? "var(--muted)" : "#4caf82", fontWeight: 700 }}>{already ? "✓ Added" : "+ Add"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new inline */}
      {!showNew ? (
        <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: "0.72rem", padding: "3px 10px" }} onClick={() => setShowNew(true)}>
          + Add New {label}
        </button>
      ) : (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--gold)", borderRadius: 7, padding: "10px 12px", marginTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: "0.65rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Name *</label>
              <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" autoFocus style={{ fontSize: "0.82rem" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.65rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Photo URL</label>
              <input className="form-input" value={newPhoto} onChange={e => setNewPhoto(e.target.value)} placeholder="https://…" style={{ fontSize: "0.82rem" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-gold btn-sm" onClick={addNew} disabled={!newName.trim()} style={{ fontSize: "0.72rem" }}>✓ Add</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowNew(false); setNewName(""); setNewPhoto(""); }} style={{ fontSize: "0.72rem" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MOVIE FORM  (multi-step)
// ════════════════════════════════════════════════════════════════
const MOVIE_STEPS = ["Basic Info", "Cast & Crew", "Media", "Review & Submit"];

function MovieForm({ initial, onSave, onCancel, saving }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    title: initial?.title || "",
    category: initial?.category || "Feature Film",
    genre: initial?.genre || [],
    releaseDate: initial?.releaseDate || "",
    releaseTBA: initial?.releaseTBA || false,
    language: initial?.language || "Odia",
    budget: initial?.budget || "",
    synopsis: initial?.synopsis || "",
    posterUrl: initial?.posterUrl || "",
    thumbnailUrl: initial?.thumbnailUrl || "",
    verdict: initial?.verdict || "Upcoming",
    runtime: initial?.runtime || "",
    imdbId: initial?.imdbId || "",
    imdbRating: initial?.imdbRating || "",
    imdbVotes: initial?.imdbVotes || "",
    contentRating: initial?.contentRating || "",
    bannerUrl: initial?.bannerUrl || "",
    boxOffice: initial?.boxOffice || { opening: "TBA", firstWeek: "TBA", total: "TBA" },
    trivia: initial?.trivia || [],
    streamingOn: initial?.streamingOn || "",
    streamingUrl: initial?.streamingUrl || "",
    ottReleaseDate: initial?.ottReleaseDate || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleGenre = g => set("genre", form.genre.includes(g) ? form.genre.filter(x => x !== g) : [...form.genre, g]);

  // Productions: normalise to [{_id, name}]
  // Server may return productions as populated objects OR bare IDs
  // Productions: normalise to [{_id, name}]
  // Server stores primary production as `productionId` and extras as `collaborators[]`
  // (there is no `productions` field on the movie object — that was the bug)
  const [productions, setProductions] = useState(() => {
    const primary = initial?.productionId ? [initial.productionId] : [];
    const collabs = initial?.collaborators || [];
    return [...primary, ...collabs].map(p => {
      if (p && typeof p === "object" && p._id) return { _id: String(p._id), name: p.name || "Unknown Production" };
      if (typeof p === "string" && p.length === 24) return { _id: p, name: "Loading…" };
      return null;
    }).filter(Boolean);
  });
  // Resolve any "Loading…" entries (bare ObjectId strings, not populated)
  useEffect(() => {
    const unresolved = productions.filter(p => p.name === "Loading…");
    if (!unresolved.length) return;
    (async () => {
      try {
        const allProds = await API.getProductions();
        setProductions(prev => prev.map(p => {
          if (p.name !== "Loading…") return p;
          const found = allProds.find(x => String(x._id) === String(p._id));
          return found ? { _id: String(found._id), name: found.name } : { ...p, name: "Unknown" };
        }));
      } catch { }
    })();
  }, []);

  // Cast: normalise castId
  const [cast, setCast] = useState(() =>
    (initial?.cast || []).map(c => {
      const rawId = c.castId?._id ?? c.castId ?? "";
      return {
        castId: String(rawId),
        isNew: false,
        name: c.name || c.castId?.name || "",
        photo: c.photo || c.castId?.photo || "",
        type: c.type || c.castId?.type || "Actor",
        role: c.role || "",
        bio: "",
      };
    })
  );

  const [trailerUrl, setTrailerUrl] = useState(
    initial?.media?.trailer?.url || (initial?.media?.trailer?.ytId ? `https://youtube.com/watch?v=${initial.media.trailer.ytId}` : "")
  );
  const [songs, setSongs] = useState(initial?.media?.songs || []);
  const EMPTY_SF = { url: "", title: "", singer: "", singerRef: [], musicDirector: "", musicDirectorRef: [], lyricist: "", lyricistRef: [], description: "", lyrics: "" };
  const [sf, setSf] = useState(EMPTY_SF);
  const trailerPreview = extractYtId(trailerUrl);

  const handleSongAdd = () => {
    if (!sf.title.trim()) return;
    const sid = extractYtId(sf.url);
    setSongs(p => [...p, {
      title: sf.title.trim(), singer: sf.singer.trim(), singerRef: sf.singerRef,
      musicDirector: sf.musicDirector.trim(), musicDirectorRef: sf.musicDirectorRef,
      lyricist: sf.lyricist.trim(), lyricistRef: sf.lyricistRef,
      ytId: sid, url: sf.url, thumbnailUrl: sid ? `https://img.youtube.com/vi/${sid}/hqdefault.jpg` : "",
      description: sf.description.trim(), lyrics: sf.lyrics.trim(),
    }]);
    setSf(EMPTY_SF);
  };

  const handleSubmit = () => {
    const castPayload = cast
      .filter(c => c.name.trim())
      .map(c => {
        if (isOid(c.castId)) {
          return { castId: c.castId, isNew: false, name: c.name, type: c.type || "Actor", role: c.role || "", photo: c.photo || "", bio: c.bio || "" };
        }
        return { isNew: true, name: c.name, type: c.type || "Actor", role: c.role || "", photo: c.photo || "", bio: c.bio || "" };
      });
    const trailerYtId = extractYtId(trailerUrl);
    onSave({
      title: form.title,
      category: form.category,
      genre: form.genre,
      releaseDate: form.releaseDate,
      releaseTBA: form.releaseTBA,
      language: form.language,
      budget: form.budget,
      synopsis: form.synopsis,
      posterUrl: form.posterUrl,
      thumbnailUrl: form.thumbnailUrl,
      verdict: form.verdict,
      runtime: form.runtime,
      imdbId: form.imdbId,
      imdbRating: form.imdbRating,
      imdbVotes: form.imdbVotes,
      contentRating: form.contentRating,
      bannerUrl: form.bannerUrl,
      boxOffice: form.boxOffice,
      trivia: form.trivia,
      streamingOn: form.streamingOn,
      streamingUrl: form.streamingUrl,
      ottReleaseDate: form.ottReleaseDate,
      productions: productions.map(p => String(p._id)).filter(isOid),
      cast: castPayload,
      media: { trailer: trailerYtId ? { ytId: trailerYtId, url: trailerUrl } : (initial?.media?.trailer || {}), songs },
    });
  };

  return (
    <div>
      {/* Step bar */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
        {MOVIE_STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div onClick={() => i < step && setStep(i)} style={{
                width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "0.78rem", cursor: i < step ? "pointer" : "default",
                background: i < step ? "var(--gold)" : i === step ? "rgba(201,151,58,0.18)" : "var(--bg3)",
                color: i < step ? "#000" : i === step ? "var(--gold)" : "var(--muted)",
                border: i === step ? "2px solid var(--gold)" : "2px solid transparent",
              }}>{i < step ? "✓" : i + 1}</div>
              <span style={{ fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", color: i === step ? "var(--gold)" : "var(--muted)" }}>{label}</span>
            </div>
            {i < MOVIE_STEPS.length - 1 && <div style={{ flex: 1, height: 2, margin: "0 4px", marginBottom: 18, background: i < step ? "var(--gold)" : "var(--border)", transition: "background 0.3s" }} />}
          </React.Fragment>
        ))}
      </div>

      {/* STEP 0 — Basic Info */}
      {step === 0 && (
        <>
          <div className="form-group">
            <label className="form-label">Movie Title *</label>
            <input className="form-input" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Daman" autoFocus />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e => set("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Language</label>
              <input className="form-input" value={form.language} onChange={e => set("language", e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Genres</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {GENRES.map(g => (
                <button key={g} type="button" onClick={() => toggleGenre(g)} style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: "0.78rem", cursor: "pointer", border: "1px solid",
                  background: form.genre.includes(g) ? "var(--gold)" : "transparent",
                  color: form.genre.includes(g) ? "#000" : "var(--muted)",
                  borderColor: form.genre.includes(g) ? "var(--gold)" : "var(--border)",
                }}>{g}</button>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Release Date</label>
              <input className="form-input" type="date" value={form.releaseDate} onChange={e => set("releaseDate", e.target.value)} disabled={form.releaseTBA} />
              <label style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={form.releaseTBA} onChange={e => set("releaseTBA", e.target.checked)} /> TBA
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">Budget</label>
              <input className="form-input" value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="e.g. ₹2 Crore" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Verdict</label>
              <select className="form-select" value={form.verdict} onChange={e => set("verdict", e.target.value)}>
                {VERDICTS.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Runtime</label>
              <input className="form-input" value={form.runtime} onChange={e => set("runtime", e.target.value)} placeholder="e.g. 2h 15m" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Production House(s)</label>
            <ProductionPicker selected={productions} onChange={setProductions} />
          </div>
          <div className="form-group">
            <label className="form-label">Poster URL <span style={{ color: "var(--muted)", fontWeight: 400 }}>(portrait 2:3)</span></label>
            <input className="form-input" value={form.posterUrl} onChange={e => set("posterUrl", e.target.value)} placeholder="https://…" />
            {form.posterUrl && <img src={form.posterUrl} alt="poster" style={{ marginTop: 8, height: 100, borderRadius: 4, border: "1px solid var(--border)", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
          </div>
          <div className="form-group">
            <label className="form-label">Banner URL <span style={{ color: "var(--muted)", fontWeight: 400 }}>(16:9 landscape)</span></label>
            <input className="form-input" value={form.thumbnailUrl} onChange={e => set("thumbnailUrl", e.target.value)} placeholder="https://…" />
            {form.thumbnailUrl && <img src={form.thumbnailUrl} alt="banner" style={{ marginTop: 8, width: "100%", maxHeight: 130, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }} onError={e => e.target.style.display = "none"} />}
          </div>
          <div className="form-group">
            <label className="form-label">Synopsis</label>
            <textarea className="form-textarea" value={form.synopsis} onChange={e => set("synopsis", e.target.value)} style={{ minHeight: 90 }} placeholder="Brief story description…" />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">IMDb ID</label>
              <input className="form-input" value={form.imdbId} onChange={e => set("imdbId", e.target.value)} placeholder="tt1234567" />
            </div>
            <div className="form-group">
              <label className="form-label">IMDb Rating</label>
              <input className="form-input" value={form.imdbRating} onChange={e => set("imdbRating", e.target.value)} placeholder="7.5" />
            </div>
            <div className="form-group">
              <label className="form-label">IMDb Votes</label>
              <input className="form-input" value={form.imdbVotes} onChange={e => set("imdbVotes", e.target.value)} placeholder="e.g. 1,234" />
            </div>
            <div className="form-group">
              <label className="form-label">Content Rating</label>
              <input className="form-input" value={form.contentRating} onChange={e => set("contentRating", e.target.value)} placeholder="e.g. U/A, A, U" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Banner URL</label>
            <input className="form-input" value={form.bannerUrl} onChange={e => set("bannerUrl", e.target.value)} placeholder="Wide landscape image URL…" />
            {form.bannerUrl && <img src={form.bannerUrl} alt="banner" style={{ marginTop: 8, width: "100%", maxHeight: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} onError={e => e.target.style.display = "none"} />}
          </div>

          {/* Trivia */}
          <div className="form-group">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>💡 Trivia & Fun Facts <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.7rem" }}>({(form.trivia || []).length} facts)</span></label>
              <button type="button" className="btn btn-outline btn-sm"
                onClick={() => set("trivia", [...(form.trivia || []), ""])}>
                + Add Fact
              </button>
            </div>
            {(form.trivia || []).length === 0 && (
              <div style={{ textAlign: "center", padding: "14px", background: "rgba(255,255,255,.02)", borderRadius: 8, border: "1px dashed rgba(255,255,255,.1)", color: "var(--muted)", fontSize: "0.78rem" }}>
                No trivia yet. Click "+ Add Fact" to add fun facts about this movie.
              </div>
            )}
            {(form.trivia || []).map((fact, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: "0.8rem", marginTop: 10, color: "var(--gold)", flexShrink: 0 }}>💡</span>
                <textarea className="form-textarea"
                  value={fact}
                  onChange={e => { const t = [...(form.trivia || [])]; t[i] = e.target.value; set("trivia", t); }}
                  style={{ minHeight: 60, flex: 1, fontSize: "0.82rem", lineHeight: 1.6 }}
                  placeholder={`Fun fact #${i + 1}… e.g. "This film was shot in just 30 days in Puri."`} />
                <button type="button"
                  onClick={() => set("trivia", (form.trivia || []).filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: "rgba(255,100,100,.6)", cursor: "pointer", fontSize: "1rem", padding: "8px 4px", flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>

          <hr className="divider" />
          <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Box Office</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[["Opening", "opening"], ["First Week", "firstWeek"], ["Total", "total"]].map(([label, key]) => (
              <div className="form-group" key={key}>
                <label className="form-label" style={{ fontSize: "0.72rem" }}>{label}</label>
                <input className="form-input" value={form.boxOffice[key]} onChange={e => set("boxOffice", { ...form.boxOffice, [key]: e.target.value })} placeholder="e.g. ₹50 Lakh" />
              </div>
            ))}
          </div>

          {/* OTT Platform */}
          <hr className="divider" />
          <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>📺 OTT / Streaming</p>
          <div className="form-group">
            <label className="form-label">Platform</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {OTT_PLATFORMS.map(p => {
                const sel = form.streamingOn === p.name;
                return (
                  <button key={p.name} type="button" onClick={() => {
                    if (sel) {
                      set("streamingOn", ""); set("streamingUrl", ""); set("ottReleaseDate", "");
                    } else {
                      set("streamingOn", p.name);
                      if (p.url) set("streamingUrl", p.url);
                    }
                  }} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 20, fontSize: "0.8rem",
                    fontWeight: 600, cursor: "pointer", border: "1px solid",
                    background: sel ? "var(--gold)" : "rgba(255,255,255,0.04)",
                    color: sel ? "#000" : "var(--muted)",
                    borderColor: sel ? "var(--gold)" : "var(--border)",
                    transition: "all 0.15s",
                  }}>
                    <span>{p.logo}</span> {p.name}
                    {sel && <span style={{ fontSize: "0.65rem" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {form.streamingOn && (
            <>
              <div className="form-group">
                <label className="form-label">Streaming URL <span style={{ color: "var(--muted)", fontWeight: 400 }}>(direct link to the movie)</span></label>
                <input className="form-input" value={form.streamingUrl} onChange={e => set("streamingUrl", e.target.value)}
                  placeholder="https://www.aaonxt.com/movie/…" />
                {form.streamingUrl && (
                  <a href={form.streamingUrl} target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: "0.75rem", color: "var(--gold)", textDecoration: "none" }}>
                    ↗ Preview link
                  </a>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">OTT Release Date
                  <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6, fontSize: "0.72rem" }}>
                    — when it streams; leave blank if unknown
                  </span>
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    className="form-input"
                    type="date"
                    value={form.ottReleaseDate === "TBA" ? "" : form.ottReleaseDate}
                    onChange={e => set("ottReleaseDate", e.target.value)}
                    disabled={form.ottReleaseDate === "TBA"}
                    style={{ flex: 1, minWidth: 140 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={form.ottReleaseDate === "TBA"}
                      onChange={e => set("ottReleaseDate", e.target.checked ? "TBA" : "")}
                    />
                    TBA (announced, date unknown)
                  </label>
                </div>
                {/* Smart status preview */}
                {form.ottReleaseDate && (
                  <div style={{
                    marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", padding: "4px 12px", borderRadius: 20, fontWeight: 700,
                    ...(form.ottReleaseDate === "TBA"
                      ? { background: "rgba(201,151,58,0.12)", color: "var(--gold)", border: "1px solid rgba(201,151,58,0.3)" }
                      : new Date(form.ottReleaseDate) <= new Date()
                        ? { background: "rgba(76,175,130,0.12)", color: "#4caf82", border: "1px solid rgba(76,175,130,0.3)" }
                        : { background: "rgba(99,179,237,0.12)", color: "#63b3ed", border: "1px solid rgba(99,179,237,0.3)" })
                  }}>
                    {form.ottReleaseDate === "TBA"
                      ? "🕐 Will show: Coming Soon (TBA)"
                      : new Date(form.ottReleaseDate) <= new Date()
                        ? "✅ Will show: Available Now"
                        : `📅 Will show: Coming ${new Date(form.ottReleaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                  </div>
                )}
              </div>
            </>
          )}

        </>
      )}

      {/* STEP 1 — Cast */}
      {step === 1 && <CastPicker cast={cast} onChange={setCast} />}

      {/* STEP 2 — Media */}
      {step === 2 && (
        <>
          <div className="form-group">
            <label className="form-label">Trailer (YouTube URL or ID)</label>
            <input className="form-input" value={trailerUrl} onChange={e => setTrailerUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
            {trailerPreview && (
              <div style={{ marginTop: 10, maxWidth: 380, position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 6 }}>
                <iframe src={`https://www.youtube.com/embed/${trailerPreview}`} allowFullScreen title="Trailer"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
              </div>
            )}
          </div>
          <hr className="divider" />
          <label className="form-label">Songs</label>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: "0.7rem" }}>YouTube URL</label>
              <input className="form-input" value={sf.url} onChange={e => setSf(f => ({ ...f, url: e.target.value }))} placeholder="Paste YouTube link" />
              {extractYtId(sf.url) && <img src={`https://img.youtube.com/vi/${extractYtId(sf.url)}/hqdefault.jpg`} alt="thumb" style={{ marginTop: 6, width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 4 }} />}
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: "0.7rem" }}>Song Title *</label>
              <input className="form-input" value={sf.title} onChange={e => setSf(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mora Kaha Achi Tu" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 8 }}>
              <PersonPicker label="Singer(s)" icon="🎤" castType="Singer"
                value={sf.singer} refs={sf.singerRef}
                onChange={(name, refs) => setSf(f => ({ ...f, singer: name, singerRef: refs }))} />
              <PersonPicker label="Music Director" icon="🎼" castType="Music Director"
                value={sf.musicDirector} refs={sf.musicDirectorRef}
                onChange={(name, refs) => setSf(f => ({ ...f, musicDirector: name, musicDirectorRef: refs }))} />
              <PersonPicker label="Lyricist" icon="✍️" castType="Lyricist"
                value={sf.lyricist} refs={sf.lyricistRef}
                onChange={(name, refs) => setSf(f => ({ ...f, lyricist: name, lyricistRef: refs }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: "0.7rem" }}>Description <span style={{ color: "var(--muted)", fontWeight: 400 }}>(used to generate the song blog)</span></label>
              <textarea className="form-textarea" value={sf.description} onChange={e => setSf(f => ({ ...f, description: e.target.value }))} placeholder="Describe the song — mood, story context, what makes it special…" style={{ minHeight: 60, fontSize: "0.82rem" }} />
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: "0.7rem" }}>Lyrics <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional — if provided, blog will include a full lyrics section)</span></label>
              <textarea className="form-textarea" value={sf.lyrics} onChange={e => setSf(f => ({ ...f, lyrics: e.target.value }))} placeholder="Paste the full song lyrics here…" style={{ minHeight: 80, fontSize: "0.82rem", fontFamily: "monospace" }} />
            </div>
            <button type="button" className="btn btn-gold btn-sm" onClick={handleSongAdd} disabled={!sf.title.trim()}>+ Add Song</button>
          </div>
          {songs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {songs.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg3)", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }}>
                  {s.thumbnailUrl
                    ? <img src={s.thumbnailUrl} alt={s.title} style={{ width: 64, height: 36, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} onError={e => e.target.style.opacity = "0.2"} />
                    : <div style={{ width: 64, height: 36, background: "var(--bg2)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🎵</div>}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>{s.title}</div>
                    {s.singer && <div style={{ fontSize: "0.7rem", color: "var(--gold)" }}>🎤 {s.singer}</div>}
                    {s.musicDirector && <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>🎼 {s.musicDirector}</div>}
                    {s.lyricist && <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>✍️ {s.lyricist}</div>}
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSongs(p => p.filter((_, idx) => idx !== i))} style={{ color: "var(--red)", flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* STEP 3 — Review */}
      {step === 3 && (
        <div>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: 20 }}>Review before saving.</p>
          {form.posterUrl && <img src={form.posterUrl} alt="poster" style={{ height: 90, borderRadius: 5, border: "1px solid var(--border)", marginBottom: 16, objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
          {[
            ["Title", form.title || "—"], ["Category", form.category], ["Language", form.language],
            ["Release", form.releaseTBA ? "TBA" : form.releaseDate || "—"], ["Budget", form.budget || "—"],
            ["Verdict", form.verdict], ["Runtime", form.runtime || "—"],
            ["Genres", form.genre.join(", ") || "—"],
            ["Productions", productions.map(p => p.name).join(", ") || "None"],
            ["Cast count", String(cast.length)], ["Songs", String(songs.length)],
            ["Trailer", extractYtId(trailerUrl) ? "✓ Added" : "—"],
            ["OTT Platform", form.streamingOn || "—"],
            ["OTT Release", form.ottReleaseDate || "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", gap: 14, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", width: 130, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: "0.85rem" }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Nav buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => step > 0 ? setStep(s => s - 1) : onCancel()}>
          ← {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < MOVIE_STEPS.length - 1
          ? <button type="button" className="btn btn-gold btn-sm" onClick={() => setStep(s => s + 1)} disabled={step === 0 && !form.title.trim()}>Next →</button>
          : <button type="button" className="btn btn-gold" onClick={handleSubmit} disabled={saving || !form.title.trim()}>{saving ? "Saving…" : "💾 Save Movie"}</button>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// CAST FORM
// ════════════════════════════════════════════════════════════════
function CastForm({ initial, onSave, onCancel, saving }) {
  // roles is stored as a comma-separated string in `type` for backward compat
  // e.g. "Actor,Director" or just "Actor"
  const initRoles = initial?.type
    ? initial.type.split(",").map(r => r.trim()).filter(Boolean)
    : ["Actor"];

  const [form, setForm] = useState({
    name: initial?.name || "",
    photo: initial?.photo || "",
    bio: initial?.bio || "",
    dob: initial?.dob || "",
    gender: initial?.gender || "",
    location: initial?.location || "",
    website: initial?.website || "",
    instagram: initial?.instagram || "",
  });
  const [roles, setRoles] = useState(initRoles);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleRole = (r) => {
    setRoles(prev =>
      prev.includes(r)
        ? prev.length > 1 ? prev.filter(x => x !== r) : prev  // keep at least 1
        : [...prev, r]
    );
  };

  const handleSave = () => {
    onSave({ ...form, type: roles.join(", ") });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Name */}
      <div className="form-group">
        <label className="form-label">Full Name *</label>
        <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} autoFocus />
      </div>

      {/* Multi-role selector */}
      <div className="form-group">
        <label className="form-label">Roles (select all that apply)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 12px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)" }}>
          {CAST_TYPES.map(r => {
            const sel = roles.includes(r);
            return (
              <button key={r} type="button" onClick={() => toggleRole(r)} style={{
                padding: "4px 12px", fontSize: "0.74rem", fontWeight: 600,
                borderRadius: 20, cursor: "pointer", border: "none",
                background: sel ? "var(--gold)" : "rgba(255,255,255,0.07)",
                color: sel ? "#000" : "var(--muted)",
                transition: "all 0.15s",
              }}>{r}</button>
            );
          })}
        </div>
        <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 5 }}>
          Selected: <strong style={{ color: "var(--gold)" }}>{roles.join(", ")}</strong>
        </div>
      </div>

      {/* Photo */}
      <div className="form-group">
        <label className="form-label">Photo URL</label>
        <input className="form-input" value={form.photo} onChange={e => set("photo", e.target.value)} placeholder="https://…" />
        {form.photo && (
          <img src={form.photo} alt={form.name} style={{ marginTop: 8, width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold)" }}
            onError={e => e.target.style.display = "none"} />
        )}
      </div>

      {/* Bio */}
      <div className="form-group">
        <label className="form-label">Bio</label>
        <textarea className="form-textarea" value={form.bio} onChange={e => set("bio", e.target.value)} style={{ minHeight: 70 }} placeholder="Short biography…" />
      </div>

      {/* DOB + Gender in 2 cols */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Date of Birth</label>
          <input className="form-input" type="date" value={form.dob} onChange={e => set("dob", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Gender</label>
          <select className="form-select" value={form.gender} onChange={e => set("gender", e.target.value)}>
            <option value="">Select…</option>
            <option>Male</option><option>Female</option><option>Non-binary</option><option>Other</option>
          </select>
        </div>
      </div>

      {/* Location + Website */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Location</label>
          <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Bhubaneswar, Odisha" />
        </div>
        <div className="form-group">
          <label className="form-label">Instagram Handle</label>
          <input className="form-input" value={form.instagram} onChange={e => set("instagram", e.target.value)} placeholder="@username" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Website</label>
        <input className="form-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://…" />
      </div>

      <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-gold" onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving ? "Saving…" : "💾 Save"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PRODUCTION FORM
// ════════════════════════════════════════════════════════════════
function ProductionForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: initial?.name || "", logo: initial?.logo || "", banner: initial?.banner || "",
    bio: initial?.bio || "", founded: initial?.founded || "",
    website: initial?.website || "", location: initial?.location || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div>
      <div className="form-group">
        <label className="form-label">Company Name *</label>
        <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} autoFocus />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Founded</label>
          <input className="form-input" value={form.founded} onChange={e => set("founded", e.target.value)} placeholder="e.g. 2010" />
        </div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Bhubaneswar" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Logo URL</label>
        <input className="form-input" value={form.logo} onChange={e => set("logo", e.target.value)} placeholder="https://…" />
      </div>
      <div className="form-group">
        <label className="form-label">Website</label>
        <input className="form-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://…" />
      </div>
      <div className="form-group">
        <label className="form-label">About</label>
        <textarea className="form-textarea" value={form.bio} onChange={e => set("bio", e.target.value)} style={{ minHeight: 80 }} />
      </div>
      <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-gold" onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
          {saving ? "Saving…" : "💾 Save"}
        </button>
      </div>
    </div>
  );
}

// ── Reusable movie search picker ─────────────────────────────────
function MovieSearchPicker({ movies, onSelect, placeholder }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = (movies || []).filter(m => !q.trim() || m.title?.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  return (
    <div style={{ position: "relative" }}>
      <input className="form-input" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder={placeholder || "Type to search movie…"} autoComplete="off" />
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, zIndex: 60, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          <div onClick={() => { onSelect({ _id: "", title: "" }); setOpen(false); setQ(""); }}
            style={{ padding: "9px 12px", cursor: "pointer", fontSize: "0.82rem", color: "var(--muted)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            — General (no movie) —
          </div>
          {filtered.map(m => (
            <div key={m._id} onClick={() => { onSelect(m); setOpen(false); setQ(""); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(201,151,58,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {(m.posterUrl || m.thumbnailUrl) && <img src={m.posterUrl || m.thumbnailUrl} alt={m.title} style={{ width: 26, height: 36, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>{m.title}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{m.releaseDate ? new Date(m.releaseDate).getFullYear() : "TBA"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// NEWS FORM  (with movie picker)
// ════════════════════════════════════════════════════════════════
function NewsForm({ initial, onSave, onCancel, saving, movies }) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    content: initial?.content || "",
    category: initial?.category || "Update",
    imageUrl: initial?.imageUrl || "",
    published: initial?.published !== false,
    movieId: initial?.movieId || "",
    movieTitle: initial?.movieTitle || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleMovieSelect = (e) => {
    const mid = e.target.value;
    const mov = movies?.find(m => m._id === mid);
    set("movieId", mid);
    set("movieTitle", mov?.title || "");
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Headline *</label>
        <input className="form-input" required value={form.title} onChange={e => set("title", e.target.value)} autoFocus />
      </div>
      <div className="form-group" style={{ position: "relative" }}>
        <label className="form-label">Related Movie / Album</label>
        {form.movieId ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(201,151,58,0.1)", border: "1px solid var(--gold)", borderRadius: 7, padding: "8px 12px" }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: "0.88rem" }}>🎬 {form.movieTitle || form.movieId}</span>
            <button type="button" onClick={() => set("movieId", "") || set("movieTitle", "")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem" }}>✕</button>
          </div>
        ) : (
          <MovieSearchPicker movies={movies} onSelect={m => { set("movieId", m._id); set("movieTitle", m.title); }} />
        )}
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-select" value={form.category} onChange={e => set("category", e.target.value)}>
            {NEWS_CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Cover Image URL</label>
          <input className="form-input" value={form.imageUrl} onChange={e => set("imageUrl", e.target.value)} placeholder="https://…" />
        </div>
      </div>
      {form.imageUrl && <img src={form.imageUrl} alt="cover" style={{ width: "100%", maxHeight: 130, objectFit: "cover", borderRadius: 5, marginBottom: 12, border: "1px solid var(--border)" }} onError={e => e.target.style.display = "none"} />}
      <div className="form-group">
        <label className="form-label">Content *</label>
        <textarea className="form-textarea" value={form.content} onChange={e => set("content", e.target.value)} style={{ minHeight: 140 }} placeholder="News content…" />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, cursor: "pointer", fontSize: "0.85rem" }}>
        <input type="checkbox" checked={form.published} onChange={e => set("published", e.target.checked)} />
        Published (visible on public site)
      </label>
      <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-gold" onClick={() => onSave(form)} disabled={saving || !form.title.trim() || !form.content.trim()}>
          {saving ? "Saving…" : "💾 Save"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SONG FORM  (standalone — searchable movie picker)
// ════════════════════════════════════════════════════════════════
function SongForm({ onSave, onCancel, saving, movies, preselectedMovieId, initial, isEdit, songIndex }) {
  const [movieId, setMovieId] = useState(preselectedMovieId || "");
  const [movieTitle, setMovieTitle] = useState(() => {
    if (!preselectedMovieId) return "";
    const m = (movies || []).find(x => x._id === preselectedMovieId);
    return m?.title || "";
  });
  const [movieSearch, setMovieSearch] = useState("");
  const [showMovieDrop, setShowMovieDrop] = useState(false);

  const EMPTY_SF = { url: "", title: "", singer: "", singerRef: [], musicDirector: "", musicDirectorRef: [], lyricist: "", lyricistRef: [], description: "", lyrics: "" };
  const [sf, setSf] = useState(() => initial ? {
    url: initial.url || (initial.ytId ? `https://youtu.be/${initial.ytId}` : ""),
    title: initial.title || "",
    singer: initial.singer || "",
    singerRef: initial.singerRef || [],
    musicDirector: initial.musicDirector || "",
    musicDirectorRef: initial.musicDirectorRef || [],
    lyricist: initial.lyricist || "",
    lyricistRef: initial.lyricistRef || [],
    description: initial.description || "",
    lyrics: initial.lyrics || "",
  } : EMPTY_SF);

  const filteredMovies = (movies || []).filter(m =>
    !movieSearch.trim() || m.title?.toLowerCase().includes(movieSearch.toLowerCase())
  ).slice(0, 12);

  const selectMovie = (m) => {
    setMovieId(m._id);
    setMovieTitle(m.title);
    setMovieSearch("");
    setShowMovieDrop(false);
  };

  const handleAdd = () => {
    if (!sf.title.trim() || !movieId) return;
    const ytId = extractYtId(sf.url);
    onSave({
      movieId, songIndex, isEdit, song: {
        title: sf.title.trim(), singer: sf.singer.trim(), singerRef: sf.singerRef,
        musicDirector: sf.musicDirector.trim(), musicDirectorRef: sf.musicDirectorRef,
        lyricist: sf.lyricist.trim(), lyricistRef: sf.lyricistRef,
        ytId, url: sf.url, thumbnailUrl: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : "",
        description: sf.description.trim(), lyrics: sf.lyrics.trim(),
      }
    });
  };

  return (
    <div>
      {/* Searchable movie picker */}
      <div className="form-group" style={{ position: "relative" }}>
        <label className="form-label">Movie / Album *</label>
        {movieId ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(201,151,58,0.1)", border: "1px solid var(--gold)", borderRadius: 7, padding: "9px 12px" }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: "0.9rem" }}>🎬 {movieTitle}</span>
            <button type="button" onClick={() => { setMovieId(""); setMovieTitle(""); }} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>✕</button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <input
              className="form-input"
              value={movieSearch}
              onChange={e => { setMovieSearch(e.target.value); setShowMovieDrop(true); }}
              onFocus={() => setShowMovieDrop(true)}
              placeholder="Type to search movie…"
              autoComplete="off"
            />
            {showMovieDrop && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, zIndex: 60, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
                {filteredMovies.length === 0
                  ? <div style={{ padding: "10px 14px", color: "var(--muted)", fontSize: "0.82rem" }}>No movies found</div>
                  : filteredMovies.map(m => (
                    <div key={m._id} onClick={() => selectMovie(m)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(201,151,58,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      {(m.posterUrl || m.thumbnailUrl) && <img src={m.posterUrl || m.thumbnailUrl} alt={m.title} style={{ width: 28, height: 40, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>{m.title}</div>
                        <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{m.releaseDate ? new Date(m.releaseDate).getFullYear() : "TBA"} · {m.language || ""}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">YouTube URL</label>
        <input className="form-input" value={sf.url} onChange={e => setSf(f => ({ ...f, url: e.target.value }))} placeholder="Paste YouTube link" />
        {extractYtId(sf.url) && (
          <img src={`https://img.youtube.com/vi/${extractYtId(sf.url)}/hqdefault.jpg`} alt="thumb" style={{ marginTop: 8, width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 4 }} />
        )}
      </div>
      <div className="form-group">
        <label className="form-label">Song Title *</label>
        <input className="form-input" value={sf.title} onChange={e => setSf(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mora Kaha Achi Tu" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <PersonPicker label="Singer(s)" icon="🎤" castType="Singer"
            value={sf.singer} refs={sf.singerRef}
            onChange={(name, refs) => setSf(f => ({ ...f, singer: name, singerRef: refs }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <PersonPicker label="Music Director" icon="🎼" castType="Music Director"
            value={sf.musicDirector} refs={sf.musicDirectorRef}
            onChange={(name, refs) => setSf(f => ({ ...f, musicDirector: name, musicDirectorRef: refs }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <PersonPicker label="Lyricist" icon="✍️" castType="Lyricist"
            value={sf.lyricist} refs={sf.lyricistRef}
            onChange={(name, refs) => setSf(f => ({ ...f, lyricist: name, lyricistRef: refs }))} />
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 14 }}>
        <label className="form-label">Description <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.72rem" }}>(primary source for blog content generation)</span></label>
        <textarea className="form-textarea" value={sf.description} onChange={e => setSf(f => ({ ...f, description: e.target.value }))} placeholder="Describe the song — mood, story context, what makes it special, any interesting production details…" style={{ minHeight: 80, fontSize: "0.85rem" }} />
      </div>
      <div className="form-group">
        <label className="form-label">Lyrics <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.72rem" }}>(optional — if provided, the blog will include a full lyrics section and target lyrics-related searches)</span></label>
        <textarea className="form-textarea" value={sf.lyrics} onChange={e => setSf(f => ({ ...f, lyrics: e.target.value }))} placeholder="Paste the complete song lyrics here…" style={{ minHeight: 100, fontSize: "0.84rem", fontFamily: "monospace", lineHeight: 1.7 }} />
      </div>
      <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-gold" onClick={handleAdd} disabled={saving || !sf.title.trim() || !movieId}>
          {saving ? "Saving…" : isEdit ? "💾 Save Changes" : "🎵 Add Song"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// IN-PORTAL MOVIE DETAIL VIEW
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// CAST DETAIL TAB — inline edit with photo update
// ════════════════════════════════════════════════════════════════
function CastDetailTab({ movie, onAdd, onRemove, onToast, onMovieUpdate }) {
  const [editIdx, setEditIdx] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const startEdit = (c, i) => {
    setEditIdx(i);
    setEditForm({ name: c.name || "", type: c.type || "Actor", role: c.role || "", photo: c.photo || "" });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      // Build updated cast array with the edited entry swapped in
      const updatedCast = movie.cast.map((c, i) =>
        i === editIdx
          ? { castId: c.castId || String(c._id), name: editForm.name, type: editForm.type, role: editForm.role, photo: editForm.photo, isNew: false }
          : { castId: c.castId || String(c._id), name: c.name, type: c.type, role: c.role || "", photo: c.photo || "", isNew: false }
      );
      const m = await API.adminUpdateMovie(movie._id, { cast: updatedCast });
      onMovieUpdate?.(m);
      onToast?.("Cast updated!");
      setEditIdx(null);
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="btn btn-gold btn-sm" onClick={onAdd}>+ Add Cast Member</button>
      </div>
      {(!movie.cast || movie.cast.length === 0)
        ? <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>No cast added yet.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {movie.cast.map((c, i) => (
              <div key={i} style={{ background: "var(--bg2)", border: `1px solid ${editIdx === i ? "var(--gold)" : "var(--border)"}`, borderRadius: 10, overflow: "hidden", transition: "border-color 0.15s" }}>
                {editIdx === i ? (
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>✏ Editing: {c.name}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Name *</label>
                        <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Role / Character</label>
                        <input className="form-input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Hero" />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Type</label>
                        <select className="form-select" value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                          {CAST_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "block", marginBottom: 3 }}>Photo URL</label>
                        <input className="form-input" value={editForm.photo} onChange={e => setEditForm(f => ({ ...f, photo: e.target.value }))} placeholder="https://…" />
                      </div>
                    </div>
                    {editForm.photo && (
                      <img src={editForm.photo} alt={editForm.name} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold)", marginBottom: 10 }} onError={e => e.target.style.display = "none"} />
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-gold btn-sm" onClick={saveEdit} disabled={saving || !editForm.name.trim()}>{saving ? "Saving…" : "💾 Save"}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditIdx(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--bg3)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", border: "1px solid var(--border)" }}>
                      {c.photo ? <img src={c.photo} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : "👤"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.87rem" }}>{c.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--gold)", marginTop: 1 }}>{c.type}{c.role ? ` · ${c.role}` : ""}</div>
                      {c.castId && <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: 1 }}>ID: {String(c.castId).slice(-6)}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.7rem" }} onClick={() => startEdit(c, i)}>✏ Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)", fontSize: "0.7rem" }} onClick={() => onRemove(c.castId || String(c._id), c.name)}>✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function AdminMovieDetail({ movie: initialMovie, movies, onBack, onToast, onMovieUpdate }) {
  const [movie, setMovie] = useState(initialMovie);
  const [detailTab, setDetailTab] = useState("cast");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [modal, setModal] = useState(null);

  const refreshMovie = async () => {
    try {
      const m = await API.getMovie(movie._id);
      setMovie(m);
      onMovieUpdate?.(m);
    } catch { }
  };

  // ── CAST operations ──
  const handleAddCastEntry = async (castEntry) => {
    setSaving(true);
    try {
      const m = await API.adminAddCastToMovie(movie._id, castEntry);
      setMovie(m); onMovieUpdate?.(m);
      onToast?.("Cast member added!");
      setModal(null);
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  const handleRemoveCast = (castId, name) => {
    setConfirm({
      message: `Remove "${name}" from cast?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          const m = await API.adminRemoveCastFromMovie(movie._id, castId);
          setMovie(m); onMovieUpdate?.(m);
          onToast?.(`"${name}" removed from cast.`);
        } catch (e) { onToast?.(e.message, "error"); }
      }
    });
  };

  // ── SONG operations ──
  const handleAddSong = async ({ movieId, song, isEdit, songIndex }) => {
    setSaving(true);
    try {
      let m;
      if (isEdit) {
        m = await API.adminUpdateSong(movieId, songIndex, song);
        onToast?.("Song updated!");
      } else {
        m = await API.adminAddSong(movieId, song);
        onToast?.("Song added!");
      }
      setMovie(m); onMovieUpdate?.(m);
      setModal(null);
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  const handleDeleteSong = (idx, title) => {
    setConfirm({
      message: `Delete song "${title}"?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          const m = await API.deleteSong(movie._id, idx);
          setMovie(m); onMovieUpdate?.(m);
          onToast?.(`"${title}" deleted.`);
        } catch (e) { onToast?.(e.message, "error"); }
      }
    });
  };

  // ── NEWS operations ──
  const handleAddNews = async (formData) => {
    setSaving(true);
    try {
      const n = await API.adminAddNewsToMovie(movie._id, formData);
      await refreshMovie();
      onToast?.("News article added!");
      setModal(null);
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  const handleEditNews = async (newsId, formData) => {
    setSaving(true);
    try {
      await API.updateNews(newsId, formData);
      await refreshMovie();
      onToast?.("Article updated!");
      setModal(null);
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  const handleDeleteNews = (newsId, title) => {
    setConfirm({
      message: `Delete article "${title}"?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await API.adminDeleteNews(newsId);
          await refreshMovie();
          onToast?.("Article deleted.");
        } catch (e) { onToast?.(e.message, "error"); }
      }
    });
  };

  const DETAIL_TABS = ["cast", "songs", "news"];
  const tabSt = (t) => ({
    padding: "8px 16px", border: "none", cursor: "pointer", fontFamily: "inherit",
    fontWeight: detailTab === t ? 700 : 500, fontSize: "0.83rem",
    background: detailTab === t ? "rgba(201,151,58,0.12)" : "transparent",
    color: detailTab === t ? "var(--gold)" : "var(--muted)",
    borderBottom: detailTab === t ? "2px solid var(--gold)" : "2px solid transparent",
    transition: "all 0.15s",
  });

  const banner = movie.thumbnailUrl || movie.posterUrl;

  return (
    <div>
      {/* Back button */}
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>← Back to Movies</button>

      {/* Movie hero */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        {banner && <div style={{ position: "relative", height: 180, overflow: "hidden" }}>
          <img src={banner} alt={movie.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)" }} />
        </div>}
        <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "flex-start" }}>
          {movie.posterUrl && <img src={movie.posterUrl} alt={movie.title} style={{ width: 70, height: 100, objectFit: "cover", borderRadius: 6, flexShrink: 0, marginTop: 0, border: "2px solid var(--border)" }} onError={e => e.target.style.display = "none"} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, lineHeight: 1.2 }}>{movie.title}</div>
            <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 4 }}>
              {movie.language} · {movie.category} · {fmtDate(movie.releaseDate)}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{
                fontSize: "0.72rem", fontWeight: 700, padding: "2px 9px", borderRadius: 9,
                background: `${verdictColor(movie.verdict)}22`, color: verdictColor(movie.verdict),
                border: `1px solid ${verdictColor(movie.verdict)}44`,
              }}>{movie.verdict || "Upcoming"}</span>
              {movie.runtime && <span style={{ fontSize: "0.72rem", color: "var(--muted)", padding: "2px 9px", borderRadius: 9, border: "1px solid var(--border)" }}>{movie.runtime}</span>}
            </div>
          </div>
          <a href={`/movie/${movie._id}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem", flexShrink: 0 }}>View Public ↗</a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {DETAIL_TABS.map(t => (
          <button key={t} onClick={() => setDetailTab(t)} style={tabSt(t)}>
            {t === "cast" ? "🎭 Cast" : t === "songs" ? "🎵 Songs" : "📰 News"}
            {t === "cast" && <span style={{ marginLeft: 6, fontSize: "0.68rem", background: "var(--bg3)", padding: "0 5px", borderRadius: 8 }}>{movie.cast?.length || 0}</span>}
            {t === "songs" && <span style={{ marginLeft: 6, fontSize: "0.68rem", background: "var(--bg3)", padding: "0 5px", borderRadius: 8 }}>{movie.media?.songs?.length || 0}</span>}
            {t === "news" && <span style={{ marginLeft: 6, fontSize: "0.68rem", background: "var(--bg3)", padding: "0 5px", borderRadius: 8 }}>{movie.news?.length || 0}</span>}
          </button>
        ))}
      </div>

      {/* ── CAST tab ── */}
      {detailTab === "cast" && (
        <CastDetailTab
          movie={movie}
          onAdd={() => setModal("add-cast")}
          onRemove={handleRemoveCast}
          onToast={onToast}
          onMovieUpdate={(m) => { setMovie(m); onMovieUpdate?.(m); }}
        />
      )}

      {/* ── SONGS tab ── */}
      {detailTab === "songs" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <button className="btn btn-gold btn-sm" onClick={() => setModal("add-song")}>+ Add Song</button>
          </div>
          {(!movie.media?.songs || movie.media.songs.length === 0)
            ? <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>No songs added yet.</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {movie.media.songs.map((s, i) => {
                  const thumb = s.ytId ? `https://img.youtube.com/vi/${s.ytId}/hqdefault.jpg` : null;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ width: 72, height: 40, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {thumb ? <img src={thumb} alt={s.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : "🎵"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{s.title}</div>
                        {s.singer && <div style={{ fontSize: "0.7rem", color: "var(--gold)" }}>🎤 {s.singer}</div>}
                        {s.musicDirector && <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>🎼 {s.musicDirector}</div>}
                        {s.lyricist && <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>✍️ {s.lyricist}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {s.ytId && <a href={`https://youtube.com/watch?v=${s.ytId}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: "0.7rem" }}>YT↗</a>}
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.7rem" }}
                          onClick={() => setModal({ type: "edit-song", songIndex: i, data: s })}>✏ Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)", fontSize: "0.7rem" }} onClick={() => handleDeleteSong(i, s.title)}>✕ Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* ── NEWS tab ── */}
      {detailTab === "news" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <button className="btn btn-gold btn-sm" onClick={() => setModal("add-news")}>+ Add News</button>
          </div>
          {(!movie.news || movie.news.length === 0)
            ? <div style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>No news articles yet.</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {movie.news.map((n, i) => {
                  const newsObj = typeof n === "object" ? n : { _id: n, title: "—", category: "", published: true };
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                      {newsObj.imageUrl && <img src={newsObj.imageUrl} alt={newsObj.title} style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{newsObj.title}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>
                          {newsObj.category}
                          <span style={{ marginLeft: 8, color: newsObj.published ? "#4caf82" : "var(--red)" }}>{newsObj.published ? "● Published" : "○ Draft"}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.7rem" }} onClick={() => setModal({ type: "edit-news", data: newsObj })}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)", fontSize: "0.7rem" }} onClick={() => handleDeleteNews(newsObj._id, newsObj.title)}>Del</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* ── Inline modals ── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <span className="modal-title">
                {modal === "add-cast" ? "🎭 Add Cast Member" :
                  modal === "add-song" ? "🎵 Add Song" :
                    modal?.type === "edit-song" ? "✏️ Edit Song" :
                      modal === "add-news" ? "📰 Add News Article" :
                        modal?.type === "edit-news" ? "✏️ Edit Article" : ""}
              </span>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div style={{ padding: "20px 0 4px" }}>
              {modal === "add-cast" && (
                <AddCastToMovieForm onSave={handleAddCastEntry} onCancel={() => setModal(null)} saving={saving} />
              )}
              {(modal === "add-song" || modal?.type === "edit-song") && (
                <SongForm
                  onSave={handleAddSong}
                  onCancel={() => setModal(null)}
                  saving={saving}
                  movies={[movie]}
                  preselectedMovieId={movie._id}
                  initial={modal?.data || null}
                  isEdit={modal?.type === "edit-song"}
                  songIndex={modal?.songIndex}
                />
              )}
              {(modal === "add-news" || modal?.type === "edit-news") && (
                <NewsForm
                  initial={modal?.data ? { ...modal.data, movieId: movie._id } : { movieId: movie._id }}
                  onSave={modal?.type === "edit-news"
                    ? (fd) => handleEditNews(modal.data._id, fd)
                    : handleAddNews}
                  onCancel={() => setModal(null)}
                  saving={saving}
                  movies={[movie]}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {confirm && <ConfirmModal message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

// Add Cast to existing movie (single entry form)
function AddCastToMovieForm({ onSave, onCancel, saving }) {
  const [mode, setMode] = useState("search"); // "search" | "new"
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [role, setRole] = useState("");
  const [type, setType] = useState("Actor");
  const [newForm, setNewForm] = useState({ name: "", type: "Actor", role: "", photo: "" });
  const timer = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { setResults(await API.searchCast(query)); } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  const handleSubmit = () => {
    if (mode === "search" && selected) {
      onSave({ castId: String(selected._id), isNew: false, name: selected.name, photo: selected.photo || "", type, role });
    } else if (mode === "new" && newForm.name.trim()) {
      onSave({ isNew: true, name: newForm.name.trim(), photo: newForm.photo, type: newForm.type, role: newForm.role });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: 18, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
        {["search", "new"].map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} style={{
            flex: 1, padding: "8px 0", background: mode === m ? "var(--gold)" : "transparent",
            color: mode === m ? "#000" : "var(--muted)", border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase",
          }}>
            {m === "search" ? "🔍 Search Existing" : "+ New Person"}
          </button>
        ))}
      </div>

      {mode === "search" && (
        <div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input className="form-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Type name to search…" autoFocus />
            {results.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
                {results.map(p => (
                  <div key={p._id} onClick={() => { setSelected(p); setType(p.type || "Actor"); setResults([]); setQuery(p.name); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", fontSize: "0.85rem" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {p.photo && <img src={p.photo} alt={p.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--gold)" }}>{p.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Type</label>
                <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                  {CAST_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Role / Character</label>
                <input className="form-input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Hero" />
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "new" && (
        <div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}>
                {CAST_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Role / Character</label>
              <input className="form-input" value={newForm.role} onChange={e => setNewForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Hero" />
            </div>
            <div className="form-group">
              <label className="form-label">Photo URL</label>
              <input className="form-input" value={newForm.photo} onChange={e => setNewForm(f => ({ ...f, photo: e.target.value }))} placeholder="https://…" />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)", marginTop: 16 }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-gold" onClick={handleSubmit} disabled={saving || (mode === "search" && !selected) || (mode === "new" && !newForm.name.trim())}>
          {saving ? "Adding…" : "✓ Add to Cast"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ════════════════════════════════════════════════════════════════
function AdminSettings({ admin, onToast }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [conf, setConf] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = async (e) => {
    e.preventDefault();
    if (pw !== conf) return onToast?.("Passwords don't match", "error");
    if (pw.length < 8) return onToast?.("Password must be at least 8 characters", "error");
    setSaving(true);
    try {
      await API.adminChangePassword(cur, pw);
      onToast?.("Password updated successfully!");
      setCur(""); setPw(""); setConf("");
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <h2 style={{ marginBottom: 24 }}>Settings</h2>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "24px 22px", marginBottom: 20 }}>
        <h3 style={{ fontSize: "1rem", marginBottom: 16 }}>🔐 Change Password</h3>
        <form onSubmit={handleChange}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input className="form-input" type="password" required value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label className="form-label">New Password (min 8 chars)</label>
            <input className="form-input" type="password" required value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input className="form-input" type="password" required value={conf} onChange={e => setConf(e.target.value)} autoComplete="new-password" />
          </div>
          <button className="btn btn-gold" type="submit" disabled={saving}>{saving ? "Updating…" : "Update Password"}</button>
        </form>
      </div>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 22px" }}>
        <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>🛡 Admin Info</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Username: <strong style={{ color: "var(--text)" }}>{admin?.username}</strong></p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PAGINATION COMPONENT
// ════════════════════════════════════════════════════════════════
function Pagination({ page, total, perPage, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  const scrollTop = () => { const m = document.getElementById("admin-main"); if (m) m.scrollTo({ top: 0, behavior: "smooth" }); };
  const go = (p) => { onChange(p); scrollTop(); };

  const pages = [];
  let lo = Math.max(1, page - 2), hi = Math.min(totalPages, page + 2);
  if (hi - lo < 4) { lo = Math.max(1, hi - 4); hi = Math.min(totalPages, lo + 4); }
  for (let i = lo; i <= hi; i++) pages.push(i);

  const PBtn = ({ label, target, disabled, active }) => (
    <button onClick={() => !disabled && go(target)} disabled={disabled}
      style={{
        minWidth: 36, height: 36, padding: "0 10px", borderRadius: 8,
        border: `1px solid ${active ? "var(--gold)" : disabled ? "var(--border)" : "var(--border)"}`,
        background: active ? "var(--gold)" : "var(--bg2)",
        color: active ? "#000" : disabled ? "rgba(255,255,255,0.2)" : "var(--text)",
        fontWeight: active ? 800 : 500, fontSize: "0.82rem", cursor: disabled ? "default" : "pointer",
        transition: "all 0.12s",
      }}
      onMouseEnter={e => { if (!disabled && !active) { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.color = "var(--gold)"; } }}
      onMouseLeave={e => { if (!disabled && !active) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; } }}
    >{label}</button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "32px 0 12px", flexWrap: "wrap" }}>
      <PBtn label="‹" target={page - 1} disabled={page === 1} active={false} />
      {lo > 1 && <><PBtn label="1" target={1} disabled={false} active={false} />{lo > 2 && <span style={{ color: "var(--muted)", padding: "0 2px" }}>…</span>}</>}
      {pages.map(p => <PBtn key={p} label={p} target={p} disabled={false} active={p === page} />)}
      {hi < totalPages && <>{hi < totalPages - 1 && <span style={{ color: "var(--muted)", padding: "0 2px" }}>…</span>}<PBtn label={totalPages} target={totalPages} disabled={false} active={false} /></>}
      <PBtn label="›" target={page + 1} disabled={page === totalPages} active={false} />
      <span style={{ fontSize: "0.72rem", color: "var(--muted)", marginLeft: 10, whiteSpace: "nowrap" }}>
        {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ENQUIRIES PANEL — proper component so hooks work correctly
// ════════════════════════════════════════════════════════════════
function EnquiriesPanel({ enquiries, setEnquiries, onToast, setConfirm }) {
  const [enqFilter, setEnqFilter] = useState("all");
  const [enqSearch, setEnqSearch] = useState("");
  const [expanded, setExpanded] = useState({});

  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const SUBJECTS = Array.from(new Set(enquiries.map(e => e.subject).filter(Boolean)));

  const filtered = enquiries.filter(e => {
    if (enqFilter === "unread" && e.read) return false;
    if (enqFilter === "read" && !e.read) return false;
    if (enqFilter.startsWith("subj:") && e.subject !== enqFilter.slice(5)) return false;
    if (enqSearch.trim()) {
      const q = enqSearch.toLowerCase();
      return e.name?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.message?.toLowerCase().includes(q) ||
        e.subject?.toLowerCase().includes(q);
    }
    return true;
  });

  const unreadCount = enquiries.filter(e => !e.read).length;

  return (
    <div style={{ padding: "28px" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800 }}>Enquiries</h2>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)", background: "var(--bg3)", padding: "2px 9px", borderRadius: 12, fontWeight: 600 }}>
          {enquiries.length} total
        </span>
        {unreadCount > 0 && (
          <span style={{ fontSize: "0.7rem", background: "#e05555", color: "#fff", padding: "2px 9px", borderRadius: 12, fontWeight: 800 }}>
            {unreadCount} unread
          </span>
        )}
        {unreadCount > 0 && (
          <button style={{ marginLeft: "auto", padding: "6px 14px", fontSize: "0.74rem", background: "rgba(201,151,58,.1)", color: "var(--gold)", border: "1px solid rgba(201,151,58,.3)", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
            onClick={async () => {
              try {
                await Promise.all(enquiries.filter(e => !e.read).map(e => API.adminMarkEnquiryRead(e._id)));
                setEnquiries(p => p.map(e => ({ ...e, read: true })));
                onToast?.("All marked as read.");
              } catch (e) { onToast?.(e.message, "error"); }
            }}>
            ✓ Mark all read
          </button>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18, padding: "12px 16px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10 }}>
        {/* Status chips */}
        {[["all", "All"], ["unread", "Unread"], ["read", "Read"]].map(([val, label]) => (
          <button key={val} onClick={() => setEnqFilter(val)} style={{
            padding: "5px 14px", fontSize: "0.74rem", fontWeight: 600,
            borderRadius: 20, cursor: "pointer", border: "none",
            background: enqFilter === val ? "var(--gold)" : "var(--bg3)",
            color: enqFilter === val ? "#000" : "var(--muted)",
          }}>
            {label}{val === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0, margin: "0 4px" }} />

        {/* Subject filter */}
        {SUBJECTS.length > 0 && (
          <select
            value={enqFilter.startsWith("subj:") ? enqFilter.slice(5) : ""}
            onChange={e => setEnqFilter(e.target.value ? `subj:${e.target.value}` : "all")}
            style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", color: "var(--text)", fontSize: "0.74rem", cursor: "pointer", outline: "none" }}>
            <option value="">All Subjects</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* Search */}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: "0.78rem", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
          <input
            style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 28px", color: "var(--text)", fontSize: "0.78rem", outline: "none", width: 200 }}
            placeholder="Search name, message…"
            value={enqSearch}
            onChange={e => setEnqSearch(e.target.value)}
          />
          {enqSearch && (
            <button onClick={() => setEnqSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.78rem" }}>✕</button>
          )}
        </div>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✉️</div>
          <p>{enquiries.length === 0 ? "No enquiries yet." : "No results match your filter."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(enq => {
            const isOpen = !!expanded[enq._id];
            return (
              <div key={enq._id} style={{
                background: enq.read ? "var(--bg2)" : "rgba(201,151,58,.05)",
                border: `1px solid ${enq.read ? "var(--border)" : "rgba(201,151,58,.28)"}`,
                borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s",
              }}>
                {/* Collapsed header — always visible, click to toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}
                  onClick={() => {
                    toggleExpand(enq._id);
                    if (!enq.read) {
                      API.adminMarkEnquiryRead(enq._id).catch(() => { });
                      setEnquiries(p => p.map(e => e._id === enq._id ? { ...e, read: true } : e));
                    }
                  }}>
                  {!enq.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#e05555", flexShrink: 0 }} />}
                  <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{enq.name}</span>
                  <a href={`mailto:${enq.email}`} style={{ fontSize: "0.75rem", color: "var(--gold)", textDecoration: "none" }}
                    onClick={e => e.stopPropagation()}>{enq.email}</a>
                  <span style={{ fontSize: "0.65rem", background: "rgba(201,151,58,.1)", color: "var(--gold)", padding: "1px 8px", borderRadius: 10, border: "1px solid rgba(201,151,58,.2)", flexShrink: 0 }}>
                    {enq.subject}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "0.67rem", color: "var(--muted)", flexShrink: 0 }}>
                    {new Date(enq.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {new Date(enq.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span style={{ fontSize: "0.68rem", color: "var(--muted)", marginLeft: 6, display: "inline-block", transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "none" }}>▼</span>
                </div>

                {/* Preview line when collapsed */}
                {!isOpen && (
                  <div style={{ padding: "0 16px 12px", fontSize: "0.78rem", color: "rgba(255,255,255,.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {enq.message}
                  </div>
                )}

                {/* Full message when expanded */}
                {isOpen && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <div style={{ padding: "14px", background: "var(--bg3)", borderRadius: 8, marginBottom: 12 }}>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(255,255,255,.82)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{enq.message}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a href={`mailto:${enq.email}?subject=Re: ${encodeURIComponent(enq.subject)}`}
                        style={{ padding: "7px 18px", fontSize: "0.78rem", fontWeight: 700, background: "var(--gold)", color: "#000", borderRadius: 6, textDecoration: "none" }}>
                        ✉️ Reply
                      </a>
                      {!enq.read && (
                        <button style={{ padding: "7px 14px", fontSize: "0.78rem", background: "rgba(201,151,58,.1)", color: "var(--gold)", border: "1px solid rgba(201,151,58,.3)", borderRadius: 6, cursor: "pointer" }}
                          onClick={async e => {
                            e.stopPropagation();
                            try {
                              await API.adminMarkEnquiryRead(enq._id);
                              setEnquiries(p => p.map(x => x._id === enq._id ? { ...x, read: true } : x));
                            } catch (err) { onToast?.(err.message, "error"); }
                          }}>✓ Mark Read</button>
                      )}
                      <button style={{ marginLeft: "auto", padding: "7px 14px", fontSize: "0.78rem", background: "rgba(220,50,50,.08)", color: "var(--red)", border: "1px solid rgba(220,50,50,.2)", borderRadius: 6, cursor: "pointer" }}
                        onClick={e => {
                          e.stopPropagation();
                          setConfirm({
                            message: `Delete enquiry from "${enq.name}"?`,
                            onConfirm: async () => {
                              setConfirm(null);
                              try {
                                await API.adminDeleteEnquiry(enq._id);
                                setEnquiries(p => p.filter(x => x._id !== enq._id));
                                onToast?.("Enquiry deleted.");
                              } catch (err) { onToast?.(err.message, "error"); }
                            }
                          });
                        }}>🗑 Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ANALYTICS PANEL
// ════════════════════════════════════════════════════════════════
function AnalyticsPanel({ onToast }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [clearing, setClearing] = React.useState(false);

  const load = () => {
    setLoading(true);
    API.adminGetAnalytics()
      .then(d => setData(d))
      .catch(e => onToast?.(e.message, "error"))
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  const handleClearOld = async () => {
    if (!window.confirm("Delete all visitor logs older than 90 days?")) return;
    setClearing(true);
    try {
      const r = await API.adminClearOldLogs();
      onToast?.(`Cleared ${r.deleted} old logs`);
      load();
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setClearing(false); }
  };

  if (loading) return <Spinner />;
  if (!data) return null;

  const { summary, byDevice, byOS, byBrowser, byCountry, topPages, recentVisits, dailyTrend } = data;

  // Build 14-day chart data
  const maxDay = Math.max(...dailyTrend.map(d => d.count), 1);
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    const map = Object.fromEntries(dailyTrend.map(x => [x._id, x.count]));
    return {
      key,
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      count: map[key] || 0,
    };
  });

  const fmtTime = (d) => new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const StatCard = ({ label, value }) => (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", flex: 1, minWidth: 130 }}>
      <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color: "var(--gold)", fontSize: "2rem", fontWeight: 900, lineHeight: 1 }}>{Number(value).toLocaleString()}</div>
    </div>
  );

  const Bar = ({ label, count, total, color = "var(--gold)" }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.82rem" }}>
        <span style={{ color: "var(--text)" }}>{label || "Unknown"}</span>
        <span style={{ color: "var(--muted)" }}>{count} <span style={{ fontSize: "0.72rem" }}>({total ? Math.round(count / total * 100) : 0}%)</span></span>
      </div>
      <div style={{ background: "var(--border)", borderRadius: 4, height: 7 }}>
        <div style={{ width: `${total ? Math.min(100, count / total * 100) : 0}%`, background: color, height: 7, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ color: "var(--gold)", margin: 0, fontSize: "1.4rem", fontWeight: 900 }}>📈 Visitor Analytics</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>↺ Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={handleClearOld} disabled={clearing}
            style={{ color: "var(--red)" }}>{clearing ? "Clearing…" : "🗑 Clear Old Logs"}</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="Total Visits" value={summary.totalVisits} />
        <StatCard label="Today" value={summary.todayVisits} />
        <StatCard label="Last 7 Days" value={summary.weekVisits} />
        <StatCard label="Last 30 Days" value={summary.monthVisits} />
      </div>

      {/* 14-day trend chart */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 16, fontSize: "0.9rem" }}>📊 Last 14 Days</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
          {last14.map(d => (
            <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div
                title={`${d.label}: ${d.count} visits`}
                style={{
                  width: "100%", borderRadius: "3px 3px 0 0",
                  background: d.count ? "var(--gold)" : "rgba(255,255,255,0.06)",
                  height: `${Math.max(3, (d.count / maxDay) * 76)}px`,
                  transition: "height 0.4s ease", cursor: "default",
                }}
              />
              <div style={{ fontSize: "0.55rem", color: "var(--muted)", writingMode: "vertical-lr", transform: "rotate(180deg)", height: 30, lineHeight: 1 }}>
                {d.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Breakdown grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px,1fr))", gap: 16 }}>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 14, fontSize: "0.88rem" }}>📱 Device</div>
          {byDevice.length === 0
            ? <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No data yet</div>
            : byDevice.map(d => <Bar key={d._id} label={d._id} count={d.count} total={summary.totalVisits} />)}
        </div>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 14, fontSize: "0.88rem" }}>🖥️ Operating System</div>
          {byOS.length === 0
            ? <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No data yet</div>
            : byOS.map(d => <Bar key={d._id} label={d._id} count={d.count} total={summary.totalVisits} color="#5ba3f5" />)}
        </div>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 14, fontSize: "0.88rem" }}>🌐 Browser</div>
          {byBrowser.length === 0
            ? <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No data yet</div>
            : byBrowser.map(d => <Bar key={d._id} label={d._id} count={d.count} total={summary.totalVisits} color="#4caf82" />)}
        </div>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 14, fontSize: "0.88rem" }}>🌍 Top Countries</div>
          {byCountry.length === 0
            ? <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No geo data yet</div>
            : byCountry.map(d => <Bar key={d._id} label={d._id} count={d.count} total={summary.totalVisits} color="#c084fc" />)}
        </div>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 14, fontSize: "0.88rem" }}>📄 Top Pages</div>
          {topPages.length === 0
            ? <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No data yet</div>
            : topPages.map(d => (
              <div key={d._id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
                <span style={{ color: "var(--muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "78%", whiteSpace: "nowrap" }}>{d._id}</span>
                <span style={{ color: "var(--gold)", fontWeight: 700, flexShrink: 0 }}>{d.count}</span>
              </div>
            ))}
        </div>

      </div>

      {/* Recent visits table */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 14, fontSize: "0.88rem" }}>🕐 Recent Visits <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.78rem" }}>(last 50)</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                {["Time", "IP", "Location", "Device", "OS", "Browser", "Page"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentVisits.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No visits recorded yet</td></tr>
              )}
              {recentVisits.map(v => (
                <tr key={v._id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 10px", color: "var(--muted)", whiteSpace: "nowrap", fontSize: "0.75rem" }}>{fmtTime(v.visitedAt)}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "monospace", color: "var(--muted)", fontSize: "0.75rem" }}>{v.ip || "—"}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text)", fontSize: "0.78rem" }}>{[v.city, v.country].filter(Boolean).join(", ") || "—"}</td>
                  <td style={{ padding: "7px 10px", color: "var(--muted)" }}>{v.device}</td>
                  <td style={{ padding: "7px 10px", color: "var(--muted)" }}>{v.os}</td>
                  <td style={{ padding: "7px 10px", color: "var(--muted)" }}>{v.browser}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "monospace", color: "var(--gold)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN ADMIN PORTAL
// ════════════════════════════════════════════════════════════════
export default function AdminPortal({ admin, onLogout, onToast }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [movies, setMovies] = useState([]);
  const [cast, setCast] = useState([]);
  const [prods, setProds] = useState([]);
  const [news, setNews] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSecondary, setLoadingSecondary] = useState(true); // cast/productions/news/enquiries still fetching
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const setQ = (v) => { setSearch(v); resetPages(); };
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [detailMovie, setDetailMovie] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [moviePage, setMoviePage] = useState(1);
  const [castPage, setCastPage] = useState(1);
  const [prodPage, setProdPage] = useState(1);
  const [newsPage, setNewsPage] = useState(1);
  const [songPage, setSongPage] = useState(1);
  const PG = { movies: 24, cast: 32, songs: 12, prods: 12, news: 16 };
  const resetPages = () => { setMoviePage(1); setCastPage(1); setProdPage(1); setNewsPage(1); setSongPage(1); };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!admin || !getAdminToken()) navigate("/admin/login");
  }, [admin]);

  useEffect(() => {
    if (admin) loadAll();
  }, [admin]);

  const loadAll = async () => {
    setLoading(true);
    setLoadingSecondary(true);
    try {
      // Phase 1 — critical: movies + stats to render Dashboard immediately
      const [m, s] = await Promise.all([
        API.getMovies(),
        API.adminStats(),
      ]);
      setMovies(m); setStats(s);
      setLoading(false); // unblock UI as soon as movies + stats are ready

      // Phase 2 — secondary data loaded silently in the background
      const [c, p, n, enq] = await Promise.all([
        API.getCast(),
        API.getProductions(),
        API.adminGetAllNews(),
        API.adminGetEnquiries().catch(() => []),
      ]);
      setCast(c); setProds(p); setNews(n); setEnquiries(enq);
      setLoadingSecondary(false);
    } catch (e) {
      onToast?.(e.message, "error");
      setLoading(false);
    }
  };

  const openCreate = (type) => setModal({ type, mode: "create", data: null });
  const openEdit = (type, data) => setModal({ type, mode: "edit", data });
  const closeModal = () => setModal(null);

  // ── Movie save ──
  const handleSaveMovie = async (formData) => {
    setSaving(true);
    try {
      const safeBody = JSON.parse(JSON.stringify(formData));
      if (modal.mode === "create") {
        const m = await API.adminCreateMovie(safeBody);
        setMovies(p => [m, ...p]);
        onToast?.(`"${m.title}" created!`);
      } else {
        const m = await API.adminUpdateMovie(modal.data._id, safeBody);
        setMovies(p => p.map(x => x._id === m._id ? m : x));
        onToast?.(`"${m.title}" updated!`);
      }
      closeModal();
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  // ── Cast save ──
  const handleSaveCast = async (formData) => {
    setSaving(true);
    try {
      if (modal.mode === "create") {
        const c = await API.createCast(formData);
        setCast(p => [c, ...p]); onToast?.(`${c.name} added!`);
      } else {
        const c = await API.updateCast(modal.data._id, formData);
        setCast(p => p.map(x => x._id === c._id ? c : x)); onToast?.(`${c.name} updated!`);
      }
      closeModal();
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  // ── Production save ──
  const handleSaveProd = async (formData) => {
    setSaving(true);
    try {
      if (modal.mode === "create") {
        const p = await API.createProduction(formData);
        setProds(prev => [p, ...prev]); onToast?.(`${p.name} created!`);
      } else {
        const p = await API.updateProduction(modal.data._id, formData);
        setProds(prev => prev.map(x => x._id === p._id ? p : x)); onToast?.(`${p.name} updated!`);
      }
      closeModal();
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  // ── News save ──
  const handleSaveNews = async (formData) => {
    setSaving(true);
    try {
      if (modal.mode === "create") {
        const n = await API.createNews(formData);
        setNews(p => [n, ...p]); onToast?.("News article created!");
      } else {
        const n = await API.updateNews(modal.data._id, formData);
        setNews(p => p.map(x => x._id === n._id ? n : x)); onToast?.("Article updated!");
      }
      closeModal();
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  // ── Song save (from songs panel — add OR edit) ──
  const handleSaveSong = async ({ movieId, song, isEdit, songIndex }) => {
    setSaving(true);
    try {
      let m;
      if (isEdit) {
        m = await API.adminUpdateSong(movieId, songIndex, song);
        onToast?.("Song updated!");
      } else {
        m = await API.adminAddSong(movieId, song);
        onToast?.("Song added!");
      }
      setMovies(prev => prev.map(x => x._id === movieId ? m : x));
      closeModal();
    } catch (e) { onToast?.(e.message, "error"); }
    finally { setSaving(false); }
  };

  const openEditSong = (song, songIndex, movie) => {
    setModal({ type: "song", mode: "edit", data: song, songIndex, movieId: movie._id, movieObj: movie });
  };

  // ── Delete ──
  const handleDelete = (type, id, name, extra) => {
    setConfirm({
      message: `Delete "${name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          if (type === "movie") { await API.adminDeleteMovie(id); setMovies(p => p.filter(x => x._id !== id)); }
          if (type === "cast") { await API.deleteCast(id); setCast(p => p.filter(x => x._id !== id)); }
          if (type === "production") { await API.deleteProduction(id); setProds(p => p.filter(x => x._id !== id)); }
          if (type === "news") { await API.adminDeleteNews(id); setNews(p => p.filter(x => x._id !== id)); }
          if (type === "song") {
            const movieId = extra;
            const m = await API.deleteSong(movieId, id);
            setMovies(prev => prev.map(x => x._id === movieId ? m : x));
          }
          onToast?.(`"${name}" deleted.`);
        } catch (e) { onToast?.(e.message, "error"); }
      }
    });
  };

  const handleBulkDelete = (type) => {
    const ids = [...selected];
    if (!ids.length) return;
    setConfirm({
      message: `Permanently delete ${ids.length} selected ${type}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null); let ok = 0, fail = 0;
        for (const id of ids) {
          try {
            if (type === "movies") { await API.adminDeleteMovie(id); setMovies(p => p.filter(x => x._id !== id)); }
            if (type === "news") { await API.adminDeleteNews(id); setNews(p => p.filter(x => x._id !== id)); }
            if (type === "songs") {
              const [mid, idx] = id.split("::");
              const m = await API.deleteSong(mid, Number(idx));
              setMovies(prev => prev.map(x => x._id === mid ? m : x));
            }
            ok++;
          } catch { fail++; }
        }
        setSelected(new Set()); setSelectMode(false);
        onToast?.(`Deleted ${ok}${fail ? ` (${fail} failed)` : ""}`);
      }
    });
  };
  const toggleSel = id => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = ids => setSelected(new Set(ids));
  const clearSel = () => { setSelected(new Set()); setSelectMode(false); };

  const q = search.toLowerCase();
  const filteredMovies = movies
    .filter(m => !q || m.title?.toLowerCase().includes(q))
    .slice().sort((a, b) => {
      const now = Date.now();
      const da = a.releaseDate ? new Date(a.releaseDate).getTime() : Infinity;
      const db = b.releaseDate ? new Date(b.releaseDate).getTime() : Infinity;
      const aUp = da >= now || a.verdict === "Upcoming";
      const bUp = db >= now || b.verdict === "Upcoming";
      if (aUp && !bUp) return -1; if (!aUp && bUp) return 1;
      return db - da;
    });
  const filteredCast = cast.filter(c => !q || c.name?.toLowerCase().includes(q));
  const filteredProds = prods.filter(p => !q || p.name?.toLowerCase().includes(q));
  const filteredNews = news.filter(n => !q || n.title?.toLowerCase().includes(q));

  if (!admin) return null;

  // ── Tab switching ──
  const handleTabChange = (newTab) => {
    setTab(newTab);
    setDetailMovie(null);
    setSearch("");
    setSelected(new Set());
    setSelectMode(false);
    resetPages();
  };

  // ── Movie click = open in-portal detail ──
  const openMovieDetail = (m) => {
    setDetailMovie(m);
    setTab("movies");
  };

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: "var(--bg1)", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <nav style={{
        height: 58, background: "var(--bg2)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: "0 24px", gap: 16,
        flexShrink: 0, zIndex: 200,
      }}>
        <button onClick={() => handleTabChange("dashboard")} style={{ fontFamily: "'Cinzel',serif", fontWeight: 900, fontSize: "1.1rem", letterSpacing: "0.08em", color: "var(--gold)", background: "none", border: "none", cursor: "pointer" }}>
          OLLY<span style={{ color: "var(--text)" }}>PEDIA</span>
        </button>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", background: "var(--gold)", color: "#000", padding: "2px 8px", borderRadius: 4 }}>
          ADMIN
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>@{admin.username}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => onLogout?.()}>Logout</button>
        <a href="/" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ fontSize: "0.76rem" }}>View Site ↗</a>
      </nav>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Sidebar */}
        <aside style={{
          width: 220, background: "var(--bg2)", borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column", padding: "24px 0",
          flexShrink: 0, height: "100%", overflowY: "auto",
        }}>
          {[
            ["dashboard", "🏠", "Dashboard"],
            ["movies", "🎬", "Movies"],
            ["songs", "🎵", "Songs"],
            ["cast", "🎭", "Cast & Crew"],
            ["productions", "🎥", "Productions"],
            ["news", "📰", "News"],
            ["blog", "✍️", "Blog"],
            ["boxoffice", "📊", "Box Office"],
            ["tracker", "🎟", "BMS Tracker"],
            ["sacnilk", "🕷️ Sacnilk"],
            ["poster", "🖼️", "Poster Generator"],
            ["enquiries", "✉️", "Enquiries"],
            ["analytics", "📈", "Analytics"],
            ["merge", "🔀", "Merge Duplicates"],
            ["autoindex", "📡", "Auto-Indexing"],
            ["settings", "⚙️", "Settings"],
          ].map(([key, icon, label]) => {
            const unread = key === "enquiries" ? enquiries.filter(e => !e.read).length : 0;
            return (
              <button key={key} onClick={() => handleTabChange(key)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
                border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.85rem",
                fontWeight: tab === key ? 700 : 400,
                background: tab === key ? "rgba(201,151,58,0.1)" : "transparent",
                color: tab === key ? "var(--gold)" : "var(--text)",
                borderLeft: tab === key ? "3px solid var(--gold)" : "3px solid transparent",
                textAlign: "left", transition: "all 0.15s",
              }}>
                <span style={{ fontSize: "1rem" }}>{icon}</span>
                {label}
                {key === "movies" && movies.length > 0 && <span style={{ marginLeft: "auto", fontSize: "0.7rem", background: "var(--bg3)", padding: "1px 7px", borderRadius: 10 }}>{movies.length}</span>}
                {key === "songs" && movies.length > 0 && <span style={{ marginLeft: "auto", fontSize: "0.7rem", background: "var(--bg3)", padding: "1px 7px", borderRadius: 10 }}>{movies.reduce((a, m) => a + (m.media?.songs?.length || 0), 0)}</span>}
                {key === "cast" && cast.length > 0 && <span style={{ marginLeft: "auto", fontSize: "0.7rem", background: "var(--bg3)", padding: "1px 7px", borderRadius: 10 }}>{cast.length}</span>}
                {key === "productions" && prods.length > 0 && <span style={{ marginLeft: "auto", fontSize: "0.7rem", background: "var(--bg3)", padding: "1px 7px", borderRadius: 10 }}>{prods.length}</span>}
                {key === "news" && news.length > 0 && <span style={{ marginLeft: "auto", fontSize: "0.7rem", background: "var(--bg3)", padding: "1px 7px", borderRadius: 10 }}>{news.length}</span>}
                {/* Red badge for unread enquiries */}
                {key === "enquiries" && unread > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: "0.68rem", background: "#e05555", color: "#fff", padding: "1px 7px", borderRadius: 10, fontWeight: 800 }}>{unread}</span>
                )}
                {key === "enquiries" && unread === 0 && enquiries.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: "0.7rem", background: "var(--bg3)", padding: "1px 7px", borderRadius: 10 }}>{enquiries.length}</span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Main content */}
        <main id="admin-main" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {loading ? <div style={{ padding: 28 }}><Spinner /></div> : (
            <>
              {/* ── DASHBOARD ── */}
              {tab === "dashboard" && (
                <div style={{ padding: "28px 28px 40px" }}>
                  <h2 style={{ marginBottom: 24, fontSize: "1.5rem" }}>Dashboard</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16, marginBottom: 32 }}>
                    {[
                      ["🎬", "Movies", stats?.movies || movies.length, "movies"],
                      ["🎭", "Cast & Crew", stats?.cast || cast.length, "cast"],
                      ["🎥", "Productions", stats?.productions || prods.length, "productions"],
                      ["📰", "News Articles", stats?.news || news.length, "news"],
                      ["✉️", "Enquiries", enquiries.length, "enquiries"],
                    ].map(([icon, label, count, key]) => {
                      const unread = key === "enquiries" ? enquiries.filter(e => !e.read).length : 0;
                      return (
                        <div key={key} onClick={() => handleTabChange(key)} style={{ background: "var(--bg2)", border: `1px solid ${unread > 0 ? "rgba(224,85,85,.5)" : "var(--border)"}`, borderRadius: 10, padding: "20px 22px", cursor: "pointer", transition: "border-color 0.15s", position: "relative" }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = unread > 0 ? "rgba(224,85,85,.5)" : "var(--border)"}>
                          {unread > 0 && (
                            <div style={{ position: "absolute", top: 10, right: 10, background: "#e05555", color: "#fff", fontSize: "0.65rem", fontWeight: 800, padding: "1px 7px", borderRadius: 10 }}>{unread} new</div>
                          )}
                          <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>{icon}</div>
                          <div style={{ fontSize: "2rem", fontWeight: 900, color: "var(--gold)" }}>{count}</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                  {stats?.recentMovies?.length > 0 && (
                    <div>
                      <h3 style={{ marginBottom: 14, fontSize: "1rem" }}>Recent Movies</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {stats.recentMovies.map(m => (
                          <div key={m._id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                            {m.posterUrl && <img src={m.posterUrl} alt={m.title} style={{ width: 34, height: 48, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600 }}>{m.title}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{m.productions?.map(p => p.name).join(", ") || "—"}</div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => openMovieDetail(m)}>Manage</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── MOVIES ── */}
              {tab === "movies" && !detailMovie && (() => {
                const pagedMovies = filteredMovies.slice((moviePage - 1) * PG.movies, moviePage * PG.movies);
                const allIds = filteredMovies.map(m => m._id);
                const allSel = allIds.length > 0 && allIds.every(id => selected.has(id));
                return (
                  <div style={{ padding: "0 28px 40px" }}>
                    {/* ── Toolbar ── */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50, background: "var(--bg1)", padding: "13px 28px", margin: "0 -28px 22px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
                      <h2 style={{ fontSize: "1.35rem", margin: 0, fontWeight: 800 }}>Movies</h2>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", background: "var(--bg3)", padding: "2px 9px", borderRadius: 12, fontWeight: 600 }}>
                        {filteredMovies.length !== movies.length ? `${filteredMovies.length} / ${movies.length}` : `${movies.length} total`}
                      </span>
                      <div style={{ flex: 1 }} />
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8rem", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
                        <input className="form-input" style={{ paddingLeft: 30, width: 200 }} placeholder="Search movies…" value={search} onChange={e => setQ(e.target.value)} />
                      </div>
                      <button className={`btn btn-sm ${selectMode ? "btn-gold" : "btn-outline"}`} onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}>
                        {selectMode ? "✓ Selecting" : "☐ Select"}
                      </button>
                      {selectMode && selected.size > 0 && (
                        <button className="btn btn-sm" onClick={() => handleBulkDelete("movies")} style={{ background: "var(--red)", color: "#fff", border: "none", fontWeight: 700 }}>
                          🗑 Delete {selected.size}
                        </button>
                      )}
                      {!selectMode && <button className="btn btn-gold btn-sm" onClick={() => openCreate("movie")}>+ Add Movie</button>}
                    </div>
                    {/* ── Select-all bar ── */}
                    {selectMode && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "8px 14px", background: "rgba(201,151,58,0.07)", borderRadius: 10, border: "1px solid rgba(201,151,58,0.2)" }}>
                        <input type="checkbox" checked={allSel} onChange={() => allSel ? clearSel() : selectAll(allIds)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--gold)" }} />
                        <span style={{ fontSize: "0.82rem", color: "var(--gold)", fontWeight: 600 }}>
                          {selected.size > 0 ? `${selected.size} of ${filteredMovies.length} selected` : `Select all ${filteredMovies.length} movies`}
                        </span>
                        {selected.size > 0 && <button className="btn btn-ghost btn-sm" onClick={clearSel} style={{ marginLeft: "auto", fontSize: "0.72rem" }}>Clear</button>}
                      </div>
                    )}
                    {/* ── Grid ── */}
                    {filteredMovies.length === 0
                      ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}><div style={{ fontSize: "3rem", marginBottom: 12 }}>🎬</div>No movies found.</div>
                      : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(148px,1fr))", gap: 14 }}>
                        {pagedMovies.map(m => {
                          const img = m.posterUrl || m.thumbnailUrl;
                          const vc = verdictColor(m.verdict);
                          const isSel = selected.has(m._id);
                          return (
                            <div key={m._id} style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "var(--bg2)", border: `2px solid ${isSel ? "var(--gold)" : "var(--border)"}`, cursor: "pointer", transition: "transform 0.15s,border-color 0.15s", display: "flex", flexDirection: "column" }}
                              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; if (!isSel) e.currentTarget.style.borderColor = "rgba(201,151,58,0.6)"; }}
                              onMouseLeave={e => { e.currentTarget.style.transform = "none"; if (!isSel) e.currentTarget.style.borderColor = "var(--border)"; }}
                              onClick={() => selectMode ? toggleSel(m._id) : openMovieDetail(m)}>
                              {selectMode && (
                                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10 }} onClick={e => { e.stopPropagation(); toggleSel(m._id); }}>
                                  <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSel ? "var(--gold)" : "rgba(255,255,255,0.8)"}`, background: isSel ? "var(--gold)" : "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {isSel && <span style={{ color: "#000", fontSize: "0.75rem", fontWeight: 900 }}>✓</span>}
                                  </div>
                                </div>
                              )}
                              {/* Poster */}
                              <div style={{ position: "relative", aspectRatio: "2/3", background: "var(--bg3)", overflow: "hidden" }}>
                                {img
                                  ? <img src={img} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }} onError={e => e.target.style.display = "none"} onMouseEnter={e => e.target.style.transform = "scale(1.05)"} onMouseLeave={e => e.target.style.transform = "none"} />
                                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem" }}>🎬</div>}
                                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.8) 0%,rgba(0,0,0,0) 55%)" }} />
                                <div style={{ position: "absolute", top: 7, right: 7, fontSize: "0.58rem", fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: "rgba(0,0,0,0.8)", color: vc, border: `1px solid ${vc}55`, textTransform: "uppercase", letterSpacing: "0.04em" }}>{m.verdict || "Upcoming"}</div>
                                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "6px 9px" }}>
                                  <div style={{ fontWeight: 800, fontSize: "0.8rem", lineHeight: 1.3, textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>{m.title}</div>
                                  <div style={{ fontSize: "0.63rem", color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{fmtDate(m.releaseDate)}</div>
                                </div>
                              </div>
                              {/* Action strip */}
                              {!selectMode && (
                                <div style={{ display: "flex", borderTop: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
                                  {[["Manage", () => openMovieDetail(m), "var(--gold)"], ["Edit", () => openEdit("movie", m), "var(--text)"]].map(([lbl, fn, hc]) => (
                                    <button key={lbl} style={{ flex: 1, padding: "7px 0", background: "none", border: "none", cursor: "pointer", fontSize: "0.67rem", color: "var(--muted)", borderRight: "1px solid var(--border)", transition: "color 0.1s,background 0.1s" }}
                                      onMouseEnter={e => { e.currentTarget.style.color = hc; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                      onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "none"; }}
                                      onClick={fn}>{lbl}</button>
                                  ))}
                                  <button style={{ padding: "7px 10px", background: "none", border: "none", cursor: "pointer", fontSize: "0.67rem", color: "var(--red)", transition: "background 0.1s" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(220,50,50,0.12)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                                    onClick={() => handleDelete("movie", m._id, m.title)}>✕</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>}
                    <Pagination page={moviePage} total={filteredMovies.length} perPage={PG.movies} onChange={setMoviePage} />
                  </div>
                );
              })()}

              {/* ── MOVIE DETAIL (in-portal) ── */}
              {tab === "movies" && detailMovie && (
                <div style={{ padding: "0 28px 40px" }}><AdminMovieDetail
                  movie={detailMovie}
                  movies={movies}
                  onBack={() => setDetailMovie(null)}
                  onToast={onToast}
                  onMovieUpdate={(m) => setMovies(prev => prev.map(x => x._id === m._id ? m : x))}
                /></div>
              )}

              {/* ── SONGS ── */}
              {tab === "songs" && (() => {
                const q2 = search.toLowerCase();
                const allRows = []; const allRowIds = [];
                movies.forEach(m => {
                  if (!m.media?.songs?.length) return;
                  const matched = m.media.songs.map((s, i) => ({ ...s, _i: i })).filter(s =>
                    !q2 || s.title?.toLowerCase().includes(q2) || s.singer?.toLowerCase().includes(q2) || m.title?.toLowerCase().includes(q2)
                  );
                  if (!matched.length) return;
                  const songIds = matched.map(s => `${m._id}::${s._i}`);
                  const allMovieSel = songIds.every(id => selected.has(id));
                  allRows.push({ m, matched, songIds, allMovieSel });
                  allRowIds.push(songIds);
                });
                const allSongIds = allRowIds.flat();
                const pagedRows = allRows.slice((songPage - 1) * PG.songs, songPage * PG.songs);
                return (
                  <div style={{ padding: "0 28px 40px" }}>
                    {/* Toolbar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50, background: "var(--bg1)", padding: "13px 28px", margin: "0 -28px 22px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
                      <h2 style={{ fontSize: "1.35rem", margin: 0, fontWeight: 800 }}>Songs</h2>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", background: "var(--bg3)", padding: "2px 9px", borderRadius: 12, fontWeight: 600 }}>{allSongIds.length} total</span>
                      <div style={{ flex: 1 }} />
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8rem", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
                        <input className="form-input" style={{ paddingLeft: 30, width: 200 }} placeholder="Search songs…" value={search} onChange={e => setQ(e.target.value)} />
                      </div>
                      <button className={`btn btn-sm ${selectMode ? "btn-gold" : "btn-outline"}`} onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}>
                        {selectMode ? "✓ Selecting" : "☐ Select"}
                      </button>
                      {selectMode && selected.size > 0 && (
                        <button className="btn btn-sm" onClick={() => handleBulkDelete("songs")} style={{ background: "var(--red)", color: "#fff", border: "none", fontWeight: 700 }}>
                          🗑 Delete {selected.size}
                        </button>
                      )}
                      {!selectMode && <button className="btn btn-gold btn-sm" onClick={() => openCreate("song")}>+ Add Song</button>}
                    </div>
                    {selectMode && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "8px 14px", background: "rgba(201,151,58,0.07)", borderRadius: 10, border: "1px solid rgba(201,151,58,0.2)" }}>
                        <input type="checkbox" checked={allSongIds.length > 0 && allSongIds.every(id => selected.has(id))} onChange={() => { const a = allSongIds.every(id => selected.has(id)); a ? clearSel() : selectAll(allSongIds); }} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--gold)" }} />
                        <span style={{ fontSize: "0.82rem", color: "var(--gold)", fontWeight: 600 }}>
                          {selected.size > 0 ? `${selected.size} songs selected` : `Select all ${allSongIds.length} songs`}
                        </span>
                        {selected.size > 0 && <button className="btn btn-ghost btn-sm" onClick={clearSel} style={{ marginLeft: "auto", fontSize: "0.72rem" }}>Clear</button>}
                      </div>
                    )}
                    {allRows.length === 0
                      ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}><div style={{ fontSize: "3rem", marginBottom: 12 }}>🎵</div>No songs found.</div>
                      : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {pagedRows.map(({ m, matched, songIds, allMovieSel }) => (
                          <div key={m._id} style={{ marginBottom: 4 }}>
                            {/* Movie header */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "var(--bg2)", borderRadius: "10px 10px 0 0", border: "1px solid var(--border)", borderBottom: "none" }}>
                              {m.posterUrl
                                ? <img src={m.posterUrl} alt={m.title} style={{ width: 34, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }} onError={e => e.target.style.display = "none"} />
                                : <div style={{ width: 34, height: 48, background: "var(--bg3)", borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🎬</div>}
                              {selectMode && (
                                <input type="checkbox" checked={allMovieSel}
                                  onChange={() => setSelected(prev => { const n = new Set(prev); songIds.forEach(id => allMovieSel ? n.delete(id) : n.add(id)); return n; })}
                                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--gold)", flexShrink: 0 }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: "0.9rem" }}>{m.title}</div>
                                <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 1 }}>
                                  <span style={{ color: "var(--gold)" }}>{matched.length}</span> track{matched.length !== 1 ? "s" : ""}
                                </div>
                              </div>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem", opacity: 0.7 }} onClick={() => openMovieDetail(m)}>Open →</button>
                            </div>
                            {/* Track rows */}
                            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderTop: "1px solid rgba(255,255,255,0.05)", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
                              {matched.map((s, rowIdx) => {
                                const thumb = s.ytId ? `https://img.youtube.com/vi/${s.ytId}/mqdefault.jpg` : null;
                                const songId = `${m._id}::${s._i}`;
                                const isSel = selected.has(songId);
                                return (
                                  <div key={s._i}
                                    style={{ display: "flex", alignItems: "center", borderBottom: rowIdx < matched.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: isSel ? "rgba(201,151,58,0.08)" : "transparent", cursor: "pointer", transition: "background 0.12s" }}
                                    onClick={() => selectMode ? toggleSel(songId) : null}
                                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                                    {/* Track# / checkbox */}
                                    <div style={{ width: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.75rem", fontWeight: 600 }}>
                                      {selectMode
                                        ? <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSel ? "var(--gold)" : "rgba(255,255,255,0.25)"}`, background: isSel ? "var(--gold)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { e.stopPropagation(); toggleSel(songId); }}>
                                          {isSel && <span style={{ color: "#000", fontSize: "0.65rem", fontWeight: 900 }}>✓</span>}
                                        </div>
                                        : rowIdx + 1}
                                    </div>
                                    {/* Thumbnail */}
                                    <div style={{ width: 52, height: 52, flexShrink: 0, overflow: "hidden", position: "relative", background: "var(--bg3)" }}>
                                      {thumb
                                        ? <img src={thumb} alt={s.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.opacity = "0.2"} />
                                        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", color: "var(--muted)" }}>♪</div>}
                                    </div>
                                    {/* Info */}
                                    <div style={{ flex: 1, padding: "0 14px", minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: "0.86rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                                      {s.singer && <div style={{ fontSize: "0.7rem", color: "var(--gold)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🎤 {s.singer}</div>}
                                      {s.musicDirector && <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: 1 }}>🎼 {s.musicDirector}</div>}
                                    </div>
                                    {/* Actions */}
                                    {!selectMode && (
                                      <div style={{ display: "flex", gap: 4, padding: "0 12px", flexShrink: 0 }}>
                                        {s.ytId && <a href={`https://youtube.com/watch?v=${s.ytId}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: "0.68rem", padding: "3px 7px" }} onClick={e => e.stopPropagation()}>YT ↗</a>}
                                        <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.68rem", padding: "3px 7px", color: "var(--red)" }} onClick={e => { e.stopPropagation(); handleDelete("song", s._i, s.title, m._id); }}>✕</button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>}
                    <Pagination page={songPage} total={allRows.length} perPage={PG.songs} onChange={setSongPage} />
                  </div>
                );
              })()}

              {/* ── CAST ── */}
              {tab === "cast" && (loadingSecondary ? <Spinner /> : (() => {
                const pagedCast = filteredCast.slice((castPage - 1) * PG.cast, castPage * PG.cast);
                return (
                  <div style={{ padding: "0 28px 40px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50, background: "var(--bg1)", padding: "13px 28px", margin: "0 -28px 22px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
                      <h2 style={{ fontSize: "1.35rem", margin: 0, fontWeight: 800 }}>Cast & Crew</h2>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", background: "var(--bg3)", padding: "2px 9px", borderRadius: 12, fontWeight: 600 }}>
                        {filteredCast.length !== cast.length ? `${filteredCast.length} / ${cast.length}` : `${cast.length} total`}
                      </span>
                      <div style={{ flex: 1 }} />
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8rem", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
                        <input className="form-input" style={{ paddingLeft: 30, width: 200 }} placeholder="Search cast…" value={search} onChange={e => setQ(e.target.value)} />
                      </div>
                      <button className="btn btn-gold btn-sm" onClick={() => openCreate("cast")}>+ Add Person</button>
                    </div>
                    {filteredCast.length === 0
                      ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}><div style={{ fontSize: "3rem", marginBottom: 12 }}>🎭</div>No cast found.</div>
                      : <>
                        {["Actor", "Actress", "Director", "Producer", "Music Director", "Singer", "Lyricist", "Cinematographer", "Other"].map(typeLabel => {
                          const group = pagedCast.filter(c => (c.type || "Other") === typeLabel || (typeLabel === "Other" && !["Actor", "Actress", "Director", "Producer", "Music Director", "Singer", "Lyricist", "Cinematographer"].includes(c.type)));
                          if (!group.length) return null;
                          return (
                            <div key={typeLabel} style={{ marginBottom: 32 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                                <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
                                <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold)", whiteSpace: "nowrap", padding: "0 6px" }}>{typeLabel}s — {group.length}</span>
                                <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(148px,1fr))", gap: 14 }}>
                                {group.map(c => {
                                  const movieCount = movies.filter(m => m.cast?.some(mc => String(mc.castId?._id || mc.castId) === String(c._id))).length;
                                  return (
                                    <div key={c._id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s,transform 0.15s", cursor: "pointer" }}
                                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
                                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}>
                                      <div style={{ width: "100%", aspectRatio: "1/1", background: "var(--bg3)", overflow: "hidden", position: "relative" }}>
                                        {c.photo
                                          ? <img src={c.photo} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} onError={e => e.target.style.display = "none"} />
                                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.8rem", color: "var(--muted)" }}>👤</div>}
                                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.82) 0%,transparent 50%)" }} />
                                        <div style={{ position: "absolute", bottom: 8, left: 8 }}>
                                          <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--gold)", background: "rgba(0,0,0,0.7)", padding: "2px 7px", borderRadius: 10, border: "1px solid rgba(201,151,58,0.4)" }}>{c.type || "Actor"}</span>
                                        </div>
                                      </div>
                                      <div style={{ padding: "10px 12px 4px" }}>
                                        <div style={{ fontWeight: 700, fontSize: "0.86rem", lineHeight: 1.3, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                                        <div style={{ fontSize: "0.67rem", color: "var(--muted)" }}>
                                          {movieCount > 0 ? <span style={{ color: "rgba(201,151,58,0.8)" }}>🎬 {movieCount} film{movieCount !== 1 ? "s" : ""}</span> : <span>No films</span>}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", borderTop: "1px solid var(--border)", marginTop: 8 }}>
                                        <a href={`/cast/${c._id}`} target="_blank" rel="noreferrer" style={{ flex: 1, padding: "7px 0", textAlign: "center", fontSize: "0.67rem", color: "var(--muted)", textDecoration: "none", borderRight: "1px solid var(--border)", transition: "color 0.1s,background 0.1s" }}
                                          onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                          onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "none"; }}>View</a>
                                        <button onClick={() => openEdit("cast", c)} style={{ flex: 1, padding: "7px 0", textAlign: "center", fontSize: "0.67rem", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", borderRight: "1px solid var(--border)", transition: "color 0.1s,background 0.1s" }}
                                          onMouseEnter={e => { e.currentTarget.style.color = "var(--gold)"; e.currentTarget.style.background = "rgba(201,151,58,0.07)"; }}
                                          onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "none"; }}>Edit</button>
                                        <button onClick={() => handleDelete("cast", c._id, c.name)} style={{ flex: 1, padding: "7px 0", textAlign: "center", fontSize: "0.67rem", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", transition: "color 0.1s,background 0.1s" }}
                                          onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "rgba(220,50,50,0.07)"; }}
                                          onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "none"; }}>Del</button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        <Pagination page={castPage} total={filteredCast.length} perPage={PG.cast} onChange={setCastPage} />
                      </>}
                  </div>
                );
              })())}

              {/* ── PRODUCTIONS ── */}
              {tab === "productions" && (loadingSecondary ? <Spinner /> : (() => {
                const pagedProds = filteredProds.slice((prodPage - 1) * PG.prods, prodPage * PG.prods);
                return (
                  <div style={{ padding: "0 28px 40px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50, background: "var(--bg1)", padding: "13px 28px", margin: "0 -28px 22px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
                      <h2 style={{ fontSize: "1.35rem", margin: 0, fontWeight: 800 }}>Productions</h2>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", background: "var(--bg3)", padding: "2px 9px", borderRadius: 12, fontWeight: 600 }}>
                        {filteredProds.length !== prods.length ? `${filteredProds.length} / ${prods.length}` : `${prods.length} total`}
                      </span>
                      <div style={{ flex: 1 }} />
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8rem", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
                        <input className="form-input" style={{ paddingLeft: 30, width: 200 }} placeholder="Search productions…" value={search} onChange={e => setQ(e.target.value)} />
                      </div>
                      <button className="btn btn-gold btn-sm" onClick={() => openCreate("production")}>+ Add Production</button>
                    </div>
                    {filteredProds.length === 0
                      ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}><div style={{ fontSize: "3rem", marginBottom: 12 }}>🎥</div>No productions found.</div>
                      : <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
                          {pagedProds.map(p => {
                            const filmCount = movies.filter(m => m.productions?.some(pr => String(pr._id || pr) === String(p._id))).length;
                            return (
                              <div key={p._id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", transition: "transform 0.15s,border-color 0.15s" }}
                                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = "rgba(201,151,58,0.5)"; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "var(--border)"; }}>
                                {/* Banner */}
                                <div style={{ height: 72, background: "linear-gradient(135deg,rgba(201,151,58,0.12),rgba(201,151,58,0.03))", position: "relative", overflow: "hidden" }}>
                                  {p.banner && <img src={p.banner} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.25 }} onError={e => e.target.style.display = "none"} />}
                                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(201,151,58,0.4)" }}>Production House</span>
                                  </div>
                                </div>
                                <div style={{ padding: "0 16px 16px", marginTop: -22, position: "relative" }}>
                                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 10 }}>
                                    <div style={{ width: 46, height: 46, background: "var(--bg3)", borderRadius: 10, border: "2px solid var(--border)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
                                      {p.logo ? <img src={p.logo} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={e => e.target.style.display = "none"} /> : "🎥"}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                                      <div style={{ fontWeight: 800, fontSize: "0.94rem", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                                      <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 2 }}>
                                        {p.founded && `Est. ${p.founded}`}{p.founded && p.location && " · "}{p.location}
                                      </div>
                                    </div>
                                  </div>
                                  {p.bio && <p style={{ fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.6, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.bio}</p>}
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                    <span style={{ fontSize: "0.7rem", color: "rgba(201,151,58,0.9)", fontWeight: 700 }}>🎬 {filmCount} film{filmCount !== 1 ? "s" : ""}</span>
                                    {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: "0.68rem", color: "var(--muted)", textDecoration: "none" }} onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"} onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}>Website ↗</a>}
                                  </div>
                                  <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                                    <a href={`/production/${p._id}`} target="_blank" rel="noreferrer"
                                      style={{ flex: 1, textAlign: "center", padding: "7px 0", background: "rgba(201,151,58,0.08)", border: "1px solid rgba(201,151,58,0.25)", borderRadius: 8, fontSize: "0.72rem", color: "var(--gold)", textDecoration: "none", fontWeight: 600, transition: "background 0.12s" }}
                                      onMouseEnter={e => e.currentTarget.style.background = "rgba(201,151,58,0.18)"}
                                      onMouseLeave={e => e.currentTarget.style.background = "rgba(201,151,58,0.08)"}>View ↗</a>
                                    <button style={{ flex: 1, padding: "7px 0", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.72rem", color: "var(--text)", cursor: "pointer", transition: "border-color 0.12s" }}
                                      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
                                      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                                      onClick={() => openEdit("production", p)}>Edit</button>
                                    <button style={{ padding: "7px 12px", background: "rgba(220,50,50,0.07)", border: "1px solid rgba(220,50,50,0.2)", borderRadius: 8, fontSize: "0.72rem", color: "var(--red)", cursor: "pointer", transition: "background 0.12s" }}
                                      onMouseEnter={e => e.currentTarget.style.background = "rgba(220,50,50,0.18)"}
                                      onMouseLeave={e => e.currentTarget.style.background = "rgba(220,50,50,0.07)"}
                                      onClick={() => handleDelete("production", p._id, p.name)}>✕</button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <Pagination page={prodPage} total={filteredProds.length} perPage={PG.prods} onChange={setProdPage} />
                      </>}
                  </div>
                );
              })())}

              {/* ── NEWS ── */}
              {tab === "news" && (loadingSecondary ? <Spinner /> : (() => {
                const pagedNews = filteredNews.slice((newsPage - 1) * PG.news, newsPage * PG.news);
                const allNewsIds = filteredNews.map(n => n._id);
                const allNewsSel = allNewsIds.length > 0 && allNewsIds.every(id => selected.has(id));
                return (
                  <div style={{ padding: "0 28px 40px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50, background: "var(--bg1)", padding: "13px 28px", margin: "0 -28px 22px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" }}>
                      <h2 style={{ fontSize: "1.35rem", margin: 0, fontWeight: 800 }}>News</h2>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", background: "var(--bg3)", padding: "2px 9px", borderRadius: 12, fontWeight: 600 }}>
                        {filteredNews.length !== news.length ? `${filteredNews.length} / ${news.length}` : `${news.length} total`}
                      </span>
                      <div style={{ flex: 1 }} />
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8rem", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
                        <input className="form-input" style={{ paddingLeft: 30, width: 200 }} placeholder="Search news…" value={search} onChange={e => setQ(e.target.value)} />
                      </div>
                      <button className={`btn btn-sm ${selectMode ? "btn-gold" : "btn-outline"}`} onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}>
                        {selectMode ? "✓ Selecting" : "☐ Select"}
                      </button>
                      {selectMode && selected.size > 0 && (
                        <button className="btn btn-sm" onClick={() => handleBulkDelete("news")} style={{ background: "var(--red)", color: "#fff", border: "none", fontWeight: 700 }}>
                          🗑 Delete {selected.size}
                        </button>
                      )}
                      {!selectMode && <button className="btn btn-gold btn-sm" onClick={() => openCreate("news")}>+ Add Article</button>}
                    </div>
                    {selectMode && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "8px 14px", background: "rgba(201,151,58,0.07)", borderRadius: 10, border: "1px solid rgba(201,151,58,0.2)" }}>
                        <input type="checkbox" checked={allNewsSel} onChange={() => allNewsSel ? clearSel() : selectAll(allNewsIds)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--gold)" }} />
                        <span style={{ fontSize: "0.82rem", color: "var(--gold)", fontWeight: 600 }}>
                          {selected.size > 0 ? `${selected.size} of ${filteredNews.length} selected` : `Select all ${filteredNews.length} articles`}
                        </span>
                        {selected.size > 0 && <button className="btn btn-ghost btn-sm" onClick={clearSel} style={{ marginLeft: "auto", fontSize: "0.72rem" }}>Clear</button>}
                      </div>
                    )}
                    {filteredNews.length === 0
                      ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}><div style={{ fontSize: "3rem", marginBottom: 12 }}>📰</div>No news found.</div>
                      : <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
                          {pagedNews.map(n => {
                            const isSel = selected.has(n._id);
                            return (
                              <div key={n._id}
                                style={{ background: "var(--bg2)", border: `2px solid ${isSel ? "var(--gold)" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", cursor: selectMode ? "pointer" : "default", transition: "transform 0.15s,border-color 0.15s" }}
                                onClick={() => selectMode && toggleSel(n._id)}
                                onMouseEnter={e => { if (!selectMode) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "rgba(201,151,58,0.45)"; } }}
                                onMouseLeave={e => { if (!selectMode) { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = isSel ? "var(--gold)" : "var(--border)"; } }}>
                                {/* Image banner */}
                                {n.imageUrl && (
                                  <div style={{ height: 130, overflow: "hidden", position: "relative", background: "var(--bg3)" }}>
                                    <img src={n.imageUrl} alt={n.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
                                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.75),transparent)" }} />
                                    {selectMode && (
                                      <div style={{ position: "absolute", top: 10, left: 10 }} onClick={e => { e.stopPropagation(); toggleSel(n._id); }}>
                                        <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSel ? "var(--gold)" : "rgba(255,255,255,0.8)"}`, background: isSel ? "var(--gold)" : "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                          {isSel && <span style={{ color: "#000", fontSize: "0.75rem", fontWeight: 900 }}>✓</span>}
                                        </div>
                                      </div>
                                    )}
                                    <div style={{ position: "absolute", bottom: 8, left: 10, right: 10, display: "flex", gap: 6, alignItems: "center" }}>
                                      <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "rgba(201,151,58,0.9)", color: "#000", textTransform: "uppercase", letterSpacing: "0.06em" }}>{n.category || "Update"}</span>
                                      <span style={{ fontSize: "0.62rem", fontWeight: 700, color: n.published ? "#4caf82" : "#e8876a" }}>{n.published ? "● Live" : "○ Draft"}</span>
                                    </div>
                                  </div>
                                )}
                                <div style={{ padding: "12px 14px" }}>
                                  {!n.imageUrl && (
                                    <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                      {selectMode && (
                                        <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isSel ? "var(--gold)" : "rgba(255,255,255,0.3)"}`, background: isSel ? "var(--gold)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }} onClick={e => { e.stopPropagation(); toggleSel(n._id); }}>
                                          {isSel && <span style={{ color: "#000", fontSize: "0.65rem", fontWeight: 900 }}>✓</span>}
                                        </div>
                                      )}
                                      <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "rgba(201,151,58,0.12)", color: "var(--gold)", border: "1px solid rgba(201,151,58,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{n.category || "Update"}</span>
                                      <span style={{ fontSize: "0.62rem", fontWeight: 700, color: n.published ? "#4caf82" : "#e8876a", marginLeft: "auto" }}>{n.published ? "● Live" : "○ Draft"}</span>
                                    </div>
                                  )}
                                  <div style={{ fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.4, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.title}</div>
                                  {n.movieTitle && <div style={{ fontSize: "0.68rem", color: "var(--gold)", marginBottom: 4 }}>🎬 {n.movieTitle}</div>}
                                  {n.content && <div style={{ fontSize: "0.72rem", color: "var(--muted)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 10 }}>{n.content}</div>}
                                  {!selectMode && (
                                    <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                                      <a href={`/news/${n._id}`} target="_blank" rel="noreferrer"
                                        style={{ flex: 1, textAlign: "center", padding: "6px 0", fontSize: "0.7rem", color: "var(--muted)", textDecoration: "none", background: "var(--bg3)", borderRadius: 7, transition: "color 0.1s" }}
                                        onMouseEnter={e => e.currentTarget.style.color = "var(--text)"}
                                        onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}>View ↗</a>
                                      <button style={{ flex: 1, padding: "6px 0", fontSize: "0.7rem", color: "var(--muted)", background: "var(--bg3)", border: "none", borderRadius: 7, cursor: "pointer", transition: "color 0.1s" }}
                                        onMouseEnter={e => e.currentTarget.style.color = "var(--gold)"}
                                        onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}
                                        onClick={e => { e.stopPropagation(); openEdit("news", n); }}>Edit</button>
                                      <button style={{ padding: "6px 12px", fontSize: "0.7rem", color: "var(--red)", background: "rgba(220,50,50,0.07)", border: "none", borderRadius: 7, cursor: "pointer", transition: "background 0.1s" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(220,50,50,0.18)"}
                                        onMouseLeave={e => e.currentTarget.style.background = "rgba(220,50,50,0.07)"}
                                        onClick={e => { e.stopPropagation(); handleDelete("news", n._id, n.title); }}>✕</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <Pagination page={newsPage} total={filteredNews.length} perPage={PG.news} onChange={setNewsPage} />
                      </>}
                  </div>
                );
              })())}

              {/* ── BLOG ── */}
              {tab === "blog" && (
                <Suspense fallback={<Spinner />}>
                  <BlogGenerator movies={movies} cast={cast} onToast={onToast} />
                </Suspense>
              )}
              {/* ── BOX OFFICE ── */}
              {tab === "boxoffice" && (
                <Suspense fallback={<Spinner />}>
                  <BoxOfficePanel movies={movies} onToast={onToast} />
                </Suspense>
              )}

              {/* ── BMS TRACKER ── */}
              {tab === "tracker" && (
                <Suspense fallback={<Spinner />}>
                  <BMSTrackerPanel movies={movies} onToast={onToast} />
                </Suspense>
              )}

              {/* ── ENQUIRIES ── */}
              {tab === "enquiries" && (
                loadingSecondary
                  ? <Spinner />
                  : <EnquiriesPanel
                    enquiries={enquiries}
                    setEnquiries={setEnquiries}
                    onToast={onToast}
                    setConfirm={setConfirm}
                  />
              )}

              {/* ── MERGE ── */}
              {tab === "merge" && (
                <Suspense fallback={<Spinner />}>
                  <MergePanel movies={movies} onToast={onToast} />
                </Suspense>
              )}

              {/* ── AUTO-INDEXING ── */}
              {tab === "autoindex" && (
                <div style={{ padding: 28 }}>
                  <Suspense fallback={<Spinner />}>
                    <AutoIndexPanel onToast={onToast} />
                  </Suspense>
                </div>
              )}

              {tab === "sacnilk" && (
                <Suspense fallback={<Spinner />}>
                  <SacnilkScraperPanel movies={movies} onToast={onToast} />
                </Suspense>
              )}

              {/* ── POSTER GENERATOR ── */}
              {tab === "poster" && (
                <Suspense fallback={<Spinner />}>
                  <PosterGeneratorPanel movies={movies} onToast={onToast} />
                </Suspense>
              )}

              {/* ── ANALYTICS ── */}
              {tab === "analytics" && (
                <div style={{ padding: 28 }}>
                  <AnalyticsPanel onToast={onToast} />
                </div>
              )}

              {/* ── SETTINGS ── */}
              {tab === "settings" && <div style={{ padding: 28 }}><AdminSettings admin={admin} onToast={onToast} /></div>}
            </>
          )}
        </main>
      </div>

      {/* Global Modals */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth: modal.type === "movie" ? 780 : 540, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <span className="modal-title">
                {modal.type === "movie" ? (modal.mode === "create" ? "+ Add New Movie" : "✏️ Edit Movie") :
                  modal.type === "cast" ? (modal.mode === "create" ? "+ Add Cast / Crew" : "✏️ Edit Cast Member") :
                    modal.type === "production" ? (modal.mode === "create" ? "+ Add Production House" : "✏️ Edit Production") :
                      modal.type === "song" ? (modal.mode === "edit" ? "✏️ Edit Song" : "🎵 Add New Song") :
                        (modal.mode === "create" ? "+ Add News Article" : "✏️ Edit Article")}
              </span>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div style={{ padding: "20px 0 4px" }}>
              {modal.type === "movie" && <MovieForm initial={modal.data} onSave={handleSaveMovie} onCancel={closeModal} saving={saving} />}
              {modal.type === "cast" && <CastForm initial={modal.data} onSave={handleSaveCast} onCancel={closeModal} saving={saving} />}
              {modal.type === "production" && <ProductionForm initial={modal.data} onSave={handleSaveProd} onCancel={closeModal} saving={saving} />}
              {modal.type === "news" && <NewsForm initial={modal.data} onSave={handleSaveNews} onCancel={closeModal} saving={saving} movies={movies} />}
              {modal.type === "song" && (
                <SongForm
                  onSave={handleSaveSong}
                  onCancel={closeModal}
                  saving={saving}
                  movies={movies}
                  preselectedMovieId={modal.mode === "edit" ? modal.movieId : undefined}
                  initial={modal.mode === "edit" ? modal.data : null}
                  isEdit={modal.mode === "edit"}
                  songIndex={modal.mode === "edit" ? modal.songIndex : undefined}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {confirm && <ConfirmModal message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}