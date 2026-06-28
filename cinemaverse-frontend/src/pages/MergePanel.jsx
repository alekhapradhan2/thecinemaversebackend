import React, { useState, useEffect, useRef, useCallback } from "react";
import { API, getAdminToken } from "../api/api";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = (() => {
  const root = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
  return root.endsWith("/api") ? root : root + "/api";
})();

async function mergeRequest(endpoint, body) {
  const token = getAdminToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Merge failed");
  return data;
}

function Pill({ label, onRemove, color = "var(--gold)" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: `${color}18`, border: `1px solid ${color}44`,
      color, fontSize: ".76rem", fontWeight: 700,
      padding: "4px 10px", borderRadius: 20,
    }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", color, cursor: "pointer", padding: 0, lineHeight: 1, fontSize: "1rem" }}>×</button>
      )}
    </span>
  );
}

function SearchBox({ placeholder, onSearch, renderResult, label }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try { setResults(await onSearch(q)); } catch { setResults([]); }
      finally { setBusy(false); }
    }, 280);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div style={{ position: "relative" }}>
      {label && <div style={{ fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginBottom: 5 }}>{label}</div>}
      <input
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: ".84rem", outline: "none" }}
        placeholder={placeholder}
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      {(busy || results.length > 0) && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, zIndex: 80, maxHeight: 220, overflowY: "auto", boxShadow: "0 6px 24px rgba(0,0,0,.5)", marginTop: 3 }}>
          {busy && <div style={{ padding: "10px 14px", color: "var(--muted)", fontSize: ".82rem" }}>Searching…</div>}
          {!busy && results.length === 0 && q.trim() && <div style={{ padding: "10px 14px", color: "var(--muted)", fontSize: ".82rem" }}>No results found.</div>}
          {results.map(r => renderResult(r, () => setQ("") || setResults([])))}
        </div>
      )}
    </div>
  );
}

const SECTION_STYLE = {
  background: "var(--bg2)", border: "1px solid var(--border)",
  borderRadius: 12, padding: "20px 22px", marginBottom: 18,
};
const LABEL_STYLE = {
  fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase",
  letterSpacing: ".08em", color: "var(--muted)", marginBottom: 6, display: "block",
};
const BTN = (extra = {}) => ({
  padding: "7px 18px", borderRadius: 7, border: "none",
  fontSize: ".82rem", fontWeight: 700, cursor: "pointer",
  transition: "opacity .15s", ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// CAST MERGE
// ─────────────────────────────────────────────────────────────────────────────
function CastMerge({ onToast }) {
  const [primary,    setPrimary]    = useState(null); // keep this
  const [duplicates, setDuplicates] = useState([]);   // these get deleted
  const [preview,    setPreview]    = useState(null);
  const [busy,       setBusy]       = useState(false);
  const [previewBusy,setPreviewBusy]= useState(false);

  const addDuplicate = (c) => {
    if (primary && String(c._id) === String(primary._id)) return;
    if (duplicates.some(d => String(d._id) === String(c._id))) return;
    setDuplicates(prev => [...prev, c]);
    setPreview(null);
  };

  const fetchPreview = async () => {
    if (!primary || duplicates.length === 0) return;
    setPreviewBusy(true);
    try {
      const data = await mergeRequest("/admin/merge/cast/preview", {
        primaryId:    String(primary._id),
        duplicateIds: duplicates.map(d => String(d._id)),
      });
      setPreview(data);
    } catch (e) { onToast("❌ " + e.message, "error"); }
    finally { setPreviewBusy(false); }
  };

  const doMerge = async () => {
    if (!primary || duplicates.length === 0) return;
    if (!window.confirm(`Merge ${duplicates.length} duplicate(s) into "${primary.name}"? The duplicates will be deleted. This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await mergeRequest("/admin/merge/cast", {
        primaryId:    String(primary._id),
        duplicateIds: duplicates.map(d => String(d._id)),
      });
      onToast(`✅ Merged! ${res.moviesUpdated} movie(s) updated, ${res.deleted} duplicate(s) removed.`, "success");
      setPrimary(null); setDuplicates([]); setPreview(null);
    } catch (e) { onToast("❌ " + e.message, "error"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ fontSize: ".75rem", color: "var(--muted)", lineHeight: 1.7, marginBottom: 16, padding: "10px 14px", background: "rgba(201,151,58,.06)", borderRadius: 8, border: "1px solid rgba(201,151,58,.2)" }}>
        <b style={{ color: "var(--gold)" }}>How it works:</b> Select the <b style={{ color: "var(--text)" }}>primary cast member</b> (the one to keep), then add all <b style={{ color: "var(--text)" }}>duplicates</b> (they will be deleted). All movie references and credits pointing to the duplicates will be re-pointed to the primary.
      </div>

      {/* Primary */}
      <div style={SECTION_STYLE}>
        <span style={LABEL_STYLE}>✅ Primary — Keep This One</span>
        {primary ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "rgba(76,175,130,.08)", border: "1px solid rgba(76,175,130,.3)", borderRadius: 8 }}>
            {primary.photo && <img src={primary.photo} alt={primary.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{primary.name}</div>
              <div style={{ fontSize: ".72rem", color: "var(--muted)" }}>{primary.type} · {primary.movies?.length || 0} movie(s)</div>
            </div>
            <button onClick={() => { setPrimary(null); setPreview(null); }} style={BTN({ background: "rgba(220,50,50,.12)", color: "var(--red)", border: "1px solid rgba(220,50,50,.2)" })}>Remove</button>
          </div>
        ) : (
          <SearchBox
            placeholder="Search cast member to keep…"
            label=""
            onSearch={q => API.searchCast(q)}
            renderResult={(r, clear) => (
              <div key={r._id}
                onClick={() => { setPrimary(r); setPreview(null); clear(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.04)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(201,151,58,.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {r.photo ? <img src={r.photo} alt={r.name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>👤</div>}
                <div>
                  <div style={{ fontWeight: 600, fontSize: ".86rem" }}>{r.name}</div>
                  <div style={{ fontSize: ".68rem", color: "var(--gold)" }}>{r.type}</div>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Duplicates */}
      <div style={SECTION_STYLE}>
        <span style={LABEL_STYLE}>🗑 Duplicates — These Will Be Deleted</span>
        {duplicates.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {duplicates.map(d => (
              <Pill key={d._id} label={`${d.name} (${d.type})`} color="#e57373" onRemove={() => { setDuplicates(prev => prev.filter(x => String(x._id) !== String(d._id))); setPreview(null); }} />
            ))}
          </div>
        )}
        <SearchBox
          placeholder="Search duplicate cast to merge & delete…"
          label=""
          onSearch={q => API.searchCast(q)}
          renderResult={(r, clear) => {
            const isPrimary = primary && String(r._id) === String(primary._id);
            const already   = duplicates.some(d => String(d._id) === String(r._id));
            return (
              <div key={r._id}
                onClick={() => { if (!isPrimary && !already) { addDuplicate(r); clear(); } }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", cursor: (isPrimary || already) ? "default" : "pointer", opacity: (isPrimary || already) ? 0.45 : 1, borderBottom: "1px solid rgba(255,255,255,.04)" }}
                onMouseEnter={e => { if (!isPrimary && !already) e.currentTarget.style.background = "rgba(229,115,115,.08)"; }}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {r.photo ? <img src={r.photo} alt={r.name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>👤</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: ".86rem" }}>{r.name}</div>
                  <div style={{ fontSize: ".68rem", color: "var(--gold)" }}>{r.type}</div>
                </div>
                <span style={{ fontSize: ".68rem", fontWeight: 700, color: isPrimary ? "var(--gold)" : already ? "#4caf82" : "#e57373" }}>
                  {isPrimary ? "← Primary" : already ? "✓ Added" : "+ Duplicate"}
                </span>
              </div>
            );
          }}
        />
      </div>

      {/* Preview */}
      {primary && duplicates.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={fetchPreview} disabled={previewBusy} style={BTN({ background: "rgba(144,202,249,.1)", color: "#90caf9", border: "1px solid rgba(144,202,249,.3)" })}>
            {previewBusy ? "⏳ Loading…" : "🔍 Preview Impact"}
          </button>
          <button onClick={doMerge} disabled={busy} style={BTN({ background: "var(--gold)", color: "#000" })}>
            {busy ? "⏳ Merging…" : `🔀 Merge ${duplicates.length} → "${primary.name}"`}
          </button>
        </div>
      )}

      {preview && (
        <div style={{ ...SECTION_STYLE, background: "rgba(144,202,249,.05)", border: "1px solid rgba(144,202,249,.2)" }}>
          <span style={{ ...LABEL_STYLE, color: "#90caf9" }}>📋 Preview</span>
          <div style={{ fontSize: ".82rem", color: "var(--text)", lineHeight: 1.8 }}>
            <div>🎬 <b>{preview.affectedMovies?.length || 0}</b> movie(s) will have cast references updated</div>
            <div>🗑 <b>{preview.duplicateIds?.length || 0}</b> duplicate cast record(s) will be deleted</div>
            <div>✅ Primary kept: <b style={{ color: "var(--gold)" }}>{primary.name}</b></div>
            {preview.affectedMovies?.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {preview.affectedMovies.map(m => <Pill key={m._id} label={m.title} color="#90caf9" />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVIE MERGE
// ─────────────────────────────────────────────────────────────────────────────
function MovieMerge({ movies = [], onToast }) {
  const [primary,    setPrimary]    = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [query,      setQuery]      = useState("");
  const [dupQuery,   setDupQuery]   = useState("");
  const [busy,       setBusy]       = useState(false);

  const filtered    = movies.filter(m => m.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  const filteredDup = movies.filter(m => m.title.toLowerCase().includes(dupQuery.toLowerCase())).slice(0, 8);

  const addDuplicate = (m) => {
    if (primary && String(m._id) === String(primary._id)) return;
    if (duplicates.some(d => String(d._id) === String(m._id))) return;
    setDuplicates(prev => [...prev, m]);
  };

  const doMerge = async () => {
    if (!primary || duplicates.length === 0) return;
    if (!window.confirm(`Merge ${duplicates.length} duplicate movie(s) into "${primary.title}"?\n\nThe duplicates' cast, songs, news and blog references will move to the primary. Duplicates will be deleted. This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await mergeRequest("/admin/merge/movie", {
        primaryId:    String(primary._id),
        duplicateIds: duplicates.map(d => String(d._id)),
      });
      onToast(`✅ Movies merged! ${res.castMoved} cast, ${res.songsMoved} songs, ${res.newsMoved} news moved. ${res.deleted} duplicate(s) removed.`, "success");
      setPrimary(null); setDuplicates([]); setQuery(""); setDupQuery("");
    } catch (e) { onToast("❌ " + e.message, "error"); }
    finally { setBusy(false); }
  };

  const MovieRow = ({ m, onClick, badge, badgeColor }) => {
    const img = m.posterUrl || m.thumbnailUrl;
    return (
      <div onClick={onClick}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.04)" }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(201,151,58,.06)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ width: 32, height: 46, borderRadius: 4, overflow: "hidden", background: "var(--bg3)", flexShrink: 0 }}>
          {img ? <img src={img} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>🎬</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: ".86rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
          <div style={{ fontSize: ".68rem", color: "var(--muted)" }}>{m.releaseDate ? new Date(m.releaseDate).getFullYear() : "TBA"} · {m.verdict || "Upcoming"}</div>
        </div>
        {badge && <span style={{ fontSize: ".68rem", fontWeight: 700, color: badgeColor || "var(--gold)" }}>{badge}</span>}
      </div>
    );
  };

  return (
    <div>
      <div style={{ fontSize: ".75rem", color: "var(--muted)", lineHeight: 1.7, marginBottom: 16, padding: "10px 14px", background: "rgba(201,151,58,.06)", borderRadius: 8, border: "1px solid rgba(201,151,58,.2)" }}>
        <b style={{ color: "var(--gold)" }}>How it works:</b> Choose the <b style={{ color: "var(--text)" }}>primary movie</b> to keep, then add any duplicate entries. Cast members, songs, news and blog references from duplicates will all be merged into the primary. Duplicates are permanently deleted.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Primary */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>✅ Primary — Keep This</span>
          {primary ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(76,175,130,.08)", border: "1px solid rgba(76,175,130,.3)", borderRadius: 8 }}>
              <div style={{ width: 28, height: 40, borderRadius: 3, overflow: "hidden", background: "var(--bg3)", flexShrink: 0 }}>
                {(primary.posterUrl || primary.thumbnailUrl) && <img src={primary.posterUrl || primary.thumbnailUrl} alt={primary.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: ".88rem" }}>{primary.title}</div>
                <div style={{ fontSize: ".68rem", color: "var(--muted)" }}>{primary.releaseDate ? new Date(primary.releaseDate).getFullYear() : "TBA"}</div>
              </div>
              <button onClick={() => setPrimary(null)} style={BTN({ background: "rgba(220,50,50,.1)", color: "var(--red)", border: "1px solid rgba(220,50,50,.2)", padding: "4px 10px", fontSize: ".72rem" })}>✕</button>
            </div>
          ) : (
            <>
              <input
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: ".83rem", outline: "none", marginBottom: 6 }}
                placeholder="Search movie…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 7 }}>
                {filtered.length === 0
                  ? <div style={{ padding: "12px 14px", color: "var(--muted)", fontSize: ".82rem" }}>Type to search movies…</div>
                  : filtered.map(m => <MovieRow key={m._id} m={m} onClick={() => { setPrimary(m); setQuery(""); }} badge="← Select" badgeColor="#4caf82" />)}
              </div>
            </>
          )}
        </div>

        {/* Duplicates */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>🗑 Duplicates — Will Be Deleted</span>
          {duplicates.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {duplicates.map(d => <Pill key={d._id} label={d.title} color="#e57373" onRemove={() => setDuplicates(prev => prev.filter(x => String(x._id) !== String(d._id)))} />)}
            </div>
          )}
          <input
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: ".83rem", outline: "none", marginBottom: 6 }}
            placeholder="Search duplicate movie…"
            value={dupQuery}
            onChange={e => setDupQuery(e.target.value)}
          />
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 7 }}>
            {filteredDup.length === 0
              ? <div style={{ padding: "12px 14px", color: "var(--muted)", fontSize: ".82rem" }}>Type to search…</div>
              : filteredDup.map(m => {
                  const isPrimary = primary && String(m._id) === String(primary._id);
                  const already   = duplicates.some(d => String(d._id) === String(m._id));
                  return (
                    <MovieRow key={m._id} m={m}
                      onClick={() => { if (!isPrimary && !already) addDuplicate(m); }}
                      badge={isPrimary ? "← Primary" : already ? "✓ Added" : "+ Add"}
                      badgeColor={isPrimary ? "var(--gold)" : already ? "#4caf82" : "#e57373"}
                    />
                  );
                })}
          </div>
        </div>
      </div>

      {primary && duplicates.length > 0 && (
        <button onClick={doMerge} disabled={busy} style={{ ...BTN({ background: "var(--gold)", color: "#000" }), marginTop: 4 }}>
          {busy ? "⏳ Merging…" : `🔀 Merge ${duplicates.length} duplicate(s) into "${primary.title}"`}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SONG MERGE  (same song title appearing in multiple movies / duplicate entries)
// ─────────────────────────────────────────────────────────────────────────────
function SongMerge({ movies = [], onToast }) {
  // Each song entry: { movieId, movieTitle, songIndex, title, singer, ytId }
  const [primary,    setPrimary]    = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [query,      setQuery]      = useState("");
  const [busy,       setBusy]       = useState(false);

  // Flatten all songs across all movies with a unique key
  const allSongs = movies.flatMap(m =>
    (m.media?.songs || []).map((s, i) => ({
      key:        `${m._id}::${i}`,
      movieId:    String(m._id),
      movieTitle: m.title,
      songIndex:  i,
      title:      s.title || "(Untitled)",
      singer:     s.singer || "",
      ytId:       s.ytId || "",
    }))
  );

  const filtered = query.trim()
    ? allSongs.filter(s =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.singer.toLowerCase().includes(query.toLowerCase()) ||
        s.movieTitle.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 30)
    : [];

  const addDuplicate = (s) => {
    if (primary && s.key === primary.key) return;
    if (duplicates.some(d => d.key === s.key)) return;
    setDuplicates(prev => [...prev, s]);
  };

  const doMerge = async () => {
    if (!primary || duplicates.length === 0) return;
    if (!window.confirm(`Delete ${duplicates.length} duplicate song entry/entries? The primary "${primary.title}" in "${primary.movieTitle}" will be kept. This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await mergeRequest("/admin/merge/song", {
        primary:    { movieId: primary.movieId, songIndex: primary.songIndex },
        duplicates: duplicates.map(d => ({ movieId: d.movieId, songIndex: d.songIndex })),
      });
      onToast(`✅ Song merge done! ${res.deleted} duplicate(s) removed.`, "success");
      setPrimary(null); setDuplicates([]); setQuery("");
    } catch (e) { onToast("❌ " + e.message, "error"); }
    finally { setBusy(false); }
  };

  const SongRow = ({ s, onClick, badge, badgeColor }) => (
    <div onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.04)" }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(201,151,58,.06)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {s.ytId
        ? <img src={`https://img.youtube.com/vi/${s.ytId}/default.jpg`} alt={s.title} style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />
        : <div style={{ width: 48, height: 36, background: "var(--bg3)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.1rem" }}>♪</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: ".85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
        <div style={{ fontSize: ".68rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.singer && `🎤 ${s.singer} · `}🎬 {s.movieTitle}
        </div>
      </div>
      {badge && <span style={{ fontSize: ".68rem", fontWeight: 700, color: badgeColor || "var(--gold)", flexShrink: 0 }}>{badge}</span>}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: ".75rem", color: "var(--muted)", lineHeight: 1.7, marginBottom: 16, padding: "10px 14px", background: "rgba(201,151,58,.06)", borderRadius: 8, border: "1px solid rgba(201,151,58,.2)" }}>
        <b style={{ color: "var(--gold)" }}>How it works:</b> Search for a song title. Select the <b style={{ color: "var(--text)" }}>primary</b> entry to keep, then mark <b style={{ color: "var(--text)" }}>duplicates</b>. Duplicates will be removed from their respective movies.
      </div>

      <div style={SECTION_STYLE}>
        <span style={LABEL_STYLE}>🔍 Search Songs</span>
        <input
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: ".84rem", outline: "none" }}
          placeholder="Song title, singer or movie name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {filtered.length > 0 && (
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>Results — click to mark Primary or Duplicate</span>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {filtered.map(s => {
              const isPrimary = primary?.key === s.key;
              const isDup     = duplicates.some(d => d.key === s.key);
              return (
                <div key={s.key} style={{ background: isPrimary ? "rgba(76,175,130,.07)" : isDup ? "rgba(229,115,115,.07)" : "transparent", display: "flex", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <SongRow s={s} onClick={() => {}} />
                  </div>
                  <div style={{ display: "flex", gap: 6, padding: "0 10px", flexShrink: 0 }}>
                    <button
                      onClick={() => { setPrimary(s); setDuplicates(prev => prev.filter(d => d.key !== s.key)); }}
                      style={BTN({ padding: "3px 9px", fontSize: ".68rem", background: isPrimary ? "#4caf82" : "rgba(76,175,130,.12)", color: isPrimary ? "#000" : "#4caf82", border: `1px solid ${isPrimary ? "#4caf82" : "rgba(76,175,130,.3)"}` })}>
                      {isPrimary ? "✓ Primary" : "Keep"}
                    </button>
                    <button
                      onClick={() => { if (!isPrimary) addDuplicate(s); }}
                      disabled={isPrimary}
                      style={BTN({ padding: "3px 9px", fontSize: ".68rem", background: isDup ? "#e57373" : "rgba(229,115,115,.1)", color: isDup ? "#000" : "#e57373", border: `1px solid ${isDup ? "#e57373" : "rgba(229,115,115,.3)"}`, opacity: isPrimary ? .4 : 1 })}>
                      {isDup ? "✓ Dup" : "Duplicate"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      {(primary || duplicates.length > 0) && (
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>📋 Summary</span>
          {primary && <div style={{ marginBottom: 8, fontSize: ".82rem" }}>✅ Keep: <b>{primary.title}</b> in <b>{primary.movieTitle}</b></div>}
          {duplicates.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {duplicates.map(d => <Pill key={d.key} label={`${d.title} (${d.movieTitle})`} color="#e57373" onRemove={() => setDuplicates(prev => prev.filter(x => x.key !== d.key))} />)}
            </div>
          )}
          {primary && duplicates.length > 0 && (
            <button onClick={doMerge} disabled={busy} style={BTN({ background: "var(--gold)", color: "#000" })}>
              {busy ? "⏳ Merging…" : `🔀 Remove ${duplicates.length} Duplicate Song(s)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MERGE PANEL
// ─────────────────────────────────────────────────────────────────────────────
export default function MergePanel({ movies = [], onToast }) {
  const [activeTab, setActiveTab] = useState("cast");

  const tabs = [
    { id: "cast",  label: "🎭 Cast & Crew",  desc: "Merge duplicate cast/crew profiles" },
    { id: "movie", label: "🎬 Movies",        desc: "Merge duplicate movie entries" },
    { id: "song",  label: "🎵 Songs",         desc: "Remove duplicate song entries" },
  ];

  return (
    <div style={{ padding: "24px 28px 48px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 6px" }}>🔀 Merge Duplicates</h2>
        <p style={{ fontSize: ".82rem", color: "var(--muted)", margin: 0 }}>
          Find and merge duplicate cast members, movies, or songs into a single clean record.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 26, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "9px 20px", borderRadius: 9, border: `1.5px solid ${activeTab === t.id ? "var(--gold)" : "var(--border)"}`,
            background: activeTab === t.id ? "rgba(201,151,58,.12)" : "transparent",
            color: activeTab === t.id ? "var(--gold)" : "var(--text)",
            fontWeight: activeTab === t.id ? 700 : 400,
            fontSize: ".84rem", cursor: "pointer", transition: "all .14s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      {activeTab === "cast"  && <CastMerge  onToast={onToast} />}
      {activeTab === "movie" && <MovieMerge movies={movies} onToast={onToast} />}
      {activeTab === "song"  && <SongMerge  movies={movies} onToast={onToast} />}
    </div>
  );
}
