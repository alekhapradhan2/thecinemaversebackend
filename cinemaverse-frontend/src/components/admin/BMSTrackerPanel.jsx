// src/components/admin/BMSTrackerPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  BookMyShow Occupancy Tracker Panel
//
//  HOW IT WORKS (no Puppeteer needed on your server):
//  ─────────────────────────────────────────────────
//  BookMyShow uses a public JSON API internally — when you open a BMS movie
//  page in the browser, it fires network requests to endpoints like:
//    https://in.bookmyshow.com/api/movies-data/showtimes-by-event?...
//  This panel intercepts those requests using a fetch proxy approach.
//
//  The admin:
//    1. Selects a movie from their DB
//    2. Pastes the BMS movie URL
//    3. Clicks "Fetch Occupancy"
//    4. The panel calls a CORS proxy → BMS API → parses shows
//    5. Displays city/theatre/show breakdown with occupancy %
//    6. Admin clicks "Save Snapshot" → stored in MongoDB
//    7. Can push estimated collection to BoxOfficeDays
//
//  NOTE: BMS does not expose ticket prices in their public API, so
//  estimated collection uses configurable average ticket price (default ₹200).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { API, getAdminToken } from "../api/api";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtINR = (n) => {
  if (!n || isNaN(n)) return "—";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${Number(n).toLocaleString("en-IN")}`;
};

const fmtTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }) + " IST";
};

const pct = (sold, total) =>
  total > 0 ? Math.round((sold / total) * 100) : 0;

const OccBar = ({ val }) => {
  const color = val >= 70 ? "#4caf50" : val >= 40 ? "#f0a500" : "#e87a6a";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--bg3)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${val}%`, height: "100%", background: color, borderRadius: 4,
          transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, color, minWidth: 36 }}>{val}%</span>
    </div>
  );
};

// ─── BMS Fetch Logic ──────────────────────────────────────────────────────────
// BMS exposes a REST API for showtimes. We use allorigins.win as CORS proxy.
// Real endpoint: https://in.bookmyshow.com/api/movies-data/showtimes-by-event?EventCode=XX&RegionCode=YY

const CORS_PROXY = "https://api.allorigins.win/get?url=";

/** Extract BMS EventCode from a BMS URL like /movies/title/ET00XXXXXX */
function extractEventCode(url) {
  const m = url.match(/\/(ET\d{8})/i);
  return m ? m[1] : null;
}

/** Fetch showtimes for one city (regionCode) from BMS */
async function fetchShowtimesForCity(eventCode, regionCode, regionName) {
  const bmsUrl = `https://in.bookmyshow.com/api/movies-data/showtimes-by-event?EventCode=${eventCode}&RegionCode=${regionCode}&ShowDate=&PageCount=10&withHits=true`;
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(bmsUrl)}`;

  const res  = await fetch(proxyUrl, { timeout: 15000 });
  const json = await res.json();
  const data = JSON.parse(json.contents || "{}");

  const shows     = data.ShowDetails || data.shows || [];
  const theatreMap = {};

  for (const show of shows) {
    const venueName = show.VenueName || show.venue_name || "Unknown Theatre";
    const venueAddr = show.VenueAddress || show.venue_address || "";
    const time      = show.ShowTime || show.show_time || "";
    const totalSeats = Number(show.TotalSeatsCount || show.total_seats || 0);
    const available  = Number(show.AvailableSeatsCount || show.available_seats || 0);
    const sold       = totalSeats - available;

    if (!theatreMap[venueName]) {
      theatreMap[venueName] = {
        name: venueName, location: venueAddr,
        shows: 0, totalSeats: 0, soldSeats: 0, showList: [],
      };
    }
    theatreMap[venueName].shows++;
    theatreMap[venueName].totalSeats += totalSeats;
    theatreMap[venueName].soldSeats  += sold;
    theatreMap[venueName].showList.push({ time, totalSeats, available, sold });
  }

  const theatres = Object.values(theatreMap);
  const cityTotal = theatres.reduce((a, t) => ({
    shows:      a.shows      + t.shows,
    totalSeats: a.totalSeats + t.totalSeats,
    soldSeats:  a.soldSeats  + t.soldSeats,
  }), { shows: 0, totalSeats: 0, soldSeats: 0 });

  return {
    name:       regionName,
    shows:      cityTotal.shows,
    totalSeats: cityTotal.totalSeats,
    soldSeats:  cityTotal.soldSeats,
    theatres,
  };
}

// BMS region codes for Odisha + major Indian cities
const BMS_REGIONS = [
  { code: "BBI", name: "Bhubaneswar" },
  { code: "CUT", name: "Cuttack" },
  { code: "BBSR",name: "Berhampur" },
  { code: "ROU", name: "Rourkela" },
  { code: "SMBL",name: "Sambalpur" },
  { code: "BOM", name: "Mumbai" },
  { code: "NCR", name: "Delhi NCR" },
  { code: "BNG", name: "Bengaluru" },
  { code: "HYD", name: "Hyderabad" },
  { code: "CHN", name: "Chennai" },
  { code: "KOL", name: "Kolkata" },
  { code: "PUN", name: "Pune" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BMSTrackerPanel({ movies = [], onToast }) {
  const [selMovieId,   setSelMovieId]   = useState("");
  const [bmsUrl,       setBmsUrl]       = useState("");
  const [avgTicket,    setAvgTicket]    = useState(200);
  const [selRegions,   setSelRegions]   = useState(["BBI","CUT","BOM","NCR","KOL"]);
  const [fetching,     setFetching]     = useState(false);
  const [fetchLog,     setFetchLog]     = useState([]);
  const [liveData,     setLiveData]     = useState(null);   // { cities, totals }
  const [saving,       setSaving]       = useState(false);
  const [sessions,     setSessions]     = useState([]);
  const [sessLoading,  setSessLoading]  = useState(false);
  const [expandSnap,   setExpandSnap]   = useState(null);   // full snapshot data
  const [expandCity,   setExpandCity]   = useState(null);   // city name expanded in live view
  const [pushDay,      setPushDay]      = useState("");
  const [pushing,      setPushing]      = useState(false);
  const logRef = useRef(null);

  // Load sessions when movie changes
  useEffect(() => {
    if (!selMovieId) { setSessions([]); return; }
    loadSessions(selMovieId);
  }, [selMovieId]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [fetchLog]);

  const log = (msg) => setFetchLog(p => [...p, `[${new Date().toLocaleTimeString("en-IN")}] ${msg}`]);

  const loadSessions = async (movieId) => {
    setSessLoading(true);
    try {
      const token = getAdminToken();
      const res   = await fetch(`${BASE}/admin/tracker/sessions/${movieId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSessions(await res.json());
    } catch {}
    setSessLoading(false);
  };

  const toggleRegion = (code) => {
    setSelRegions(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code]);
  };

  // ─── Main fetch ─────────────────────────────────────────────────────────────
  const handleFetch = async () => {
    if (!selMovieId) { onToast?.("Select a movie first", "error"); return; }
    if (!bmsUrl.trim()) { onToast?.("Paste the BookMyShow URL", "error"); return; }
    if (selRegions.length === 0) { onToast?.("Select at least one city", "error"); return; }

    const eventCode = extractEventCode(bmsUrl);
    if (!eventCode) {
      onToast?.("Could not find EventCode in URL. Make sure it's a BMS movie URL like in.bookmyshow.com/movies/title/ET00XXXXXX", "error");
      return;
    }

    setFetching(true);
    setLiveData(null);
    setFetchLog([]);
    log(`Event code: ${eventCode}`);
    log(`Fetching ${selRegions.length} cities...`);

    const cities = [];
    for (const region of BMS_REGIONS.filter(r => selRegions.includes(r.code))) {
      log(`Fetching ${region.name}...`);
      try {
        const cityData = await fetchShowtimesForCity(eventCode, region.code, region.name);
        if (cityData.shows > 0) {
          // Add estimated collection
          cityData.estCollection = cityData.soldSeats * avgTicket;
          cityData.theatres = cityData.theatres.map(t => ({
            ...t, estCollection: t.soldSeats * avgTicket,
          }));
          cities.push(cityData);
          log(`✅ ${region.name}: ${cityData.shows} shows, ${cityData.soldSeats}/${cityData.totalSeats} seats sold (${pct(cityData.soldSeats, cityData.totalSeats)}%)`);
        } else {
          log(`⚪ ${region.name}: no shows found`);
        }
      } catch (e) {
        log(`❌ ${region.name}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 400)); // rate limit
    }

    // Compute totals
    const totals = cities.reduce((a, c) => ({
      shows:         a.shows         + c.shows,
      totalSeats:    a.totalSeats    + c.totalSeats,
      soldSeats:     a.soldSeats     + c.soldSeats,
      estCollection: a.estCollection + c.estCollection,
    }), { shows: 0, totalSeats: 0, soldSeats: 0, estCollection: 0 });
    totals.occupancy = pct(totals.soldSeats, totals.totalSeats);

    setLiveData({ cities, totals });
    log(`─── Done. ${cities.length} cities with shows. Overall: ${totals.occupancy}% occupancy`);
    setFetching(false);
  };

  // ─── Save snapshot ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!liveData) return;
    setSaving(true);
    try {
      const token = getAdminToken();
      const res   = await fetch(`${BASE}/admin/tracker/save-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          movieId: selMovieId,
          bmsUrl,
          cities: liveData.cities,
          status: "done",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onToast?.("✅ Snapshot saved!", "success");
      loadSessions(selMovieId);
    } catch (e) { onToast?.(e.message, "error"); }
    setSaving(false);
  };

  // ─── Push to BoxOfficeDays ──────────────────────────────────────────────────
  const handlePushDay = async () => {
    if (!liveData || !pushDay) { onToast?.("Enter a day number", "error"); return; }
    setPushing(true);
    try {
      const coll = fmtINR(liveData.totals.estCollection);
      await API.adminAddBoxOfficeDay(selMovieId, {
        day:   Number(pushDay),
        net:   coll,
        gross: fmtINR(Math.round(liveData.totals.estCollection * 1.18)),
        note:  `BMS occupancy: ${liveData.totals.occupancy}% · ${liveData.totals.soldSeats}/${liveData.totals.totalSeats} seats · avg ₹${avgTicket}/ticket`,
        date:  new Date().toISOString().slice(0, 10),
      });
      onToast?.(`✅ Pushed to Day ${pushDay}!`, "success");
    } catch (e) {
      onToast?.(`❌ ${e.message}`, "error");
    }
    setPushing(false);
  };

  // ─── Load full snapshot ──────────────────────────────────────────────────────
  const openSnapshot = async (id) => {
    if (expandSnap?._id === id) { setExpandSnap(null); return; }
    try {
      const token = getAdminToken();
      const res   = await fetch(`${BASE}/admin/tracker/snapshot/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setExpandSnap(await res.json());
    } catch {}
  };

  const deleteSnapshot = async (id) => {
    try {
      const token = getAdminToken();
      await fetch(`${BASE}/admin/tracker/snapshot/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSessions(p => p.filter(s => s._id !== id));
      if (expandSnap?._id === id) setExpandSnap(null);
      onToast?.("Snapshot deleted");
    } catch (e) { onToast?.(e.message, "error"); }
  };

  const selMovie = movies.find(m => m._id === selMovieId);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "24px 28px 48px", maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 900, margin: 0, display: "flex",
          alignItems: "center", gap: 12 }}>
          <span>🎟</span> BMS Occupancy Tracker
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "6px 0 0" }}>
          Fetch live seat availability from BookMyShow → calculate occupancy → estimate collection → push to Box Office Days
        </p>
      </div>

      {/* Setup card */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "20px 22px", marginBottom: 24 }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 14 }}>
          Step 1 — Configure
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Movie select */}
          <div>
            <label style={labelSt}>Movie</label>
            <select value={selMovieId} onChange={e => setSelMovieId(e.target.value)}
              style={inputSt}>
              <option value="">— Select a movie —</option>
              {movies.filter(m => m.status !== "Upcoming" || true).map(m => (
                <option key={m._id} value={m._id}>{m.title} ({m.releaseDate?.slice(0,4) || "—"})</option>
              ))}
            </select>
          </div>

          {/* Avg ticket price */}
          <div>
            <label style={labelSt}>Avg Ticket Price (₹) <span style={{ color: "var(--muted)", fontWeight: 400 }}>used for collection estimate</span></label>
            <input type="number" value={avgTicket} min={50} max={2000}
              onChange={e => setAvgTicket(Number(e.target.value))}
              style={{ ...inputSt, width: "100%" }} />
          </div>
        </div>

        {/* BMS URL */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>BookMyShow Movie URL</label>
          <input
            type="text"
            value={bmsUrl}
            onChange={e => setBmsUrl(e.target.value)}
            placeholder="https://in.bookmyshow.com/movies/movie-name/ET00XXXXXX"
            style={{ ...inputSt, width: "100%" }}
          />
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 4 }}>
            Open the movie on BMS → copy the URL from the address bar → paste here
          </div>
        </div>

        {/* City selector */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelSt}>Cities to scan</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {BMS_REGIONS.map(r => (
              <button key={r.code} onClick={() => toggleRegion(r.code)}
                style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: "0.77rem", fontWeight: 700,
                  border: selRegions.includes(r.code)
                    ? "1px solid rgba(201,151,58,0.6)" : "1px solid var(--border)",
                  background: selRegions.includes(r.code)
                    ? "rgba(201,151,58,0.12)" : "var(--bg3)",
                  color: selRegions.includes(r.code) ? "var(--gold)" : "var(--muted)",
                  cursor: "pointer",
                }}>
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleFetch} disabled={fetching || !selMovieId || !bmsUrl}
          style={{
            background: fetching ? "var(--bg3)" : "rgba(201,151,58,0.14)",
            border: "1px solid rgba(201,151,58,0.5)",
            borderRadius: 8, color: "var(--gold)", fontWeight: 800,
            fontSize: "0.88rem", padding: "10px 24px",
            cursor: fetching || !selMovieId || !bmsUrl ? "not-allowed" : "pointer",
          }}>
          {fetching ? "⏳ Fetching…" : "▶ Fetch Occupancy"}
        </button>
      </div>

      {/* Fetch log */}
      {fetchLog.length > 0 && (
        <div ref={logRef} style={{
          background: "#0a0a0a", border: "1px solid var(--border)", borderRadius: 10,
          padding: "12px 16px", fontFamily: "monospace", fontSize: "0.73rem",
          color: "#a0e0a0", maxHeight: 160, overflowY: "auto", marginBottom: 24,
        }}>
          {fetchLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {/* Live results */}
      {liveData && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 14 }}>
            Step 2 — Results
          </div>

          {/* Summary strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12,
            marginBottom: 20 }}>
            {[
              ["🎭", "Cities", liveData.cities.length],
              ["🏛", "Theatres", liveData.cities.reduce((a,c) => a+c.theatres.length, 0)],
              ["🎬", "Shows", liveData.totals.shows],
              ["💺", "Occupancy", `${liveData.totals.occupancy}%`],
              ["💰", "Est. Collection", fmtINR(liveData.totals.estCollection)],
            ].map(([icon, label, val]) => (
              <div key={label} style={{ background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", fontWeight: 700,
                  textTransform: "uppercase", marginBottom: 6 }}>{icon} {label}</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 900, color:
                  label === "Est. Collection" ? "var(--gold)" :
                  label === "Occupancy" ? (liveData.totals.occupancy >= 70 ? "#4caf50" :
                    liveData.totals.occupancy >= 40 ? "#f0a500" : "#e87a6a") : "var(--text)" }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* City table */}
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "var(--bg3)" }}>
                  {["City", "Shows", "Seats", "Sold", "Occupancy", "Est. Collection", ""].map(h => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left",
                      fontSize: "0.64rem", color: "var(--muted)", fontWeight: 700,
                      textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liveData.cities.map(city => (
                  <React.Fragment key={city.name}>
                    <tr style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                      onClick={() => setExpandCity(expandCity === city.name ? null : city.name)}>
                      <td style={{ padding: "11px 14px", fontWeight: 800 }}>
                        {expandCity === city.name ? "▾" : "▸"} {city.name}
                      </td>
                      <td style={{ padding: "11px 14px" }}>{city.shows}</td>
                      <td style={{ padding: "11px 14px" }}>{city.totalSeats.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "11px 14px", color: "#4caf50", fontWeight: 700 }}>{city.soldSeats.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "11px 14px", minWidth: 140 }}>
                        <OccBar val={pct(city.soldSeats, city.totalSeats)} />
                      </td>
                      <td style={{ padding: "11px 14px", fontWeight: 700, color: "var(--gold)" }}>{fmtINR(city.estCollection)}</td>
                      <td style={{ padding: "11px 14px", fontSize: "0.7rem", color: "var(--muted)" }}>
                        {city.theatres.length} theatres
                      </td>
                    </tr>
                    {expandCity === city.name && city.theatres.map(th => (
                      <tr key={th.name} style={{ background: "var(--bg3)",
                        borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "9px 14px 9px 28px", color: "var(--muted)",
                          fontSize: "0.78rem" }}>↳ {th.name}</td>
                        <td style={{ padding: "9px 14px", fontSize: "0.78rem" }}>{th.shows}</td>
                        <td style={{ padding: "9px 14px", fontSize: "0.78rem" }}>{th.totalSeats}</td>
                        <td style={{ padding: "9px 14px", fontSize: "0.78rem", color: "#4caf50" }}>{th.soldSeats}</td>
                        <td style={{ padding: "9px 14px", minWidth: 140 }}>
                          <OccBar val={pct(th.soldSeats, th.totalSeats)} />
                        </td>
                        <td style={{ padding: "9px 14px", fontSize: "0.78rem", color: "var(--gold)" }}>{fmtINR(th.estCollection)}</td>
                        <td style={{ padding: "9px 14px", fontSize: "0.7rem", color: "var(--muted)" }}>{th.location}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Save + Push row */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <button onClick={handleSave} disabled={saving}
              style={{
                background: "rgba(76,175,80,0.12)", border: "1px solid rgba(76,175,80,0.4)",
                borderRadius: 8, color: "#4caf50", fontWeight: 800,
                fontSize: "0.85rem", padding: "10px 22px",
                cursor: saving ? "not-allowed" : "pointer",
              }}>
              {saving ? "💾 Saving…" : "💾 Save Snapshot to DB"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8,
              background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "8px 14px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>
                Push est. collection to:
              </span>
              <input type="number" min={1} max={99} placeholder="Day #"
                value={pushDay} onChange={e => setPushDay(e.target.value)}
                style={{ width: 64, ...inputSt, padding: "5px 8px" }} />
              <button onClick={handlePushDay} disabled={pushing || !pushDay}
                style={{
                  background: "rgba(201,151,58,0.14)", border: "1px solid rgba(201,151,58,0.4)",
                  borderRadius: 6, color: "var(--gold)", fontWeight: 800, fontSize: "0.78rem",
                  padding: "6px 14px", cursor: !pushDay || pushing ? "not-allowed" : "pointer",
                }}>
                {pushing ? "Pushing…" : "→ Box Office Days"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session history */}
      {selMovieId && (
        <div>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 10 }}>
            Snapshot History
            {sessLoading && <span style={{ fontWeight: 400, color: "var(--muted)" }}>Loading…</span>}
            {!sessLoading && sessions.length > 0 &&
              <span style={{ fontWeight: 400 }}>({sessions.length} snapshots)</span>}
          </div>

          {sessions.length === 0 && !sessLoading && (
            <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
              No snapshots yet for this movie.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.map(s => (
              <div key={s._id}>
                <div style={{
                  background: "var(--bg2)", border: "1px solid var(--border)",
                  borderRadius: 10, padding: "14px 18px",
                  display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                  cursor: "pointer",
                }} onClick={() => openSnapshot(s._id)}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)", minWidth: 160 }}>
                    {fmtTime(s.runAt)}
                  </span>
                  <span style={{ fontWeight: 700 }}>{s.cityCount} cities · {s.theatreCount} theatres · {s.totalShows} shows</span>
                  <span style={{ color: s.avgOccupancy >= 70 ? "#4caf50" : s.avgOccupancy >= 40 ? "#f0a500" : "#e87a6a",
                    fontWeight: 800 }}>
                    {s.avgOccupancy}% occ.
                  </span>
                  <span style={{ color: "var(--gold)", fontWeight: 800 }}>
                    {fmtINR(s.estCollection)}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button onClick={e => { e.stopPropagation(); deleteSnapshot(s._id); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer",
                      color: "#e87a6a", fontSize: "0.75rem", padding: "4px 8px" }}>
                    🗑 Delete
                  </button>
                  <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                    {expandSnap?._id === s._id ? "▲ Hide" : "▼ Expand"}
                  </span>
                </div>

                {/* Expanded snapshot */}
                {expandSnap?._id === s._id && (
                  <div style={{ background: "var(--bg3)", border: "1px solid var(--border)",
                    borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px" }}>
                    {(expandSnap.cities || []).map(city => (
                      <div key={city.name} style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 6,
                          display: "flex", gap: 12, alignItems: "center" }}>
                          <span>{city.name}</span>
                          <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 600 }}>
                            {city.shows} shows · {city.soldSeats}/{city.totalSeats} seats
                          </span>
                          <OccBar val={city.occupancy} />
                          <span style={{ color: "var(--gold)", fontSize: "0.78rem", fontWeight: 700 }}>
                            {fmtINR(city.estCollection)}
                          </span>
                        </div>
                        {(city.theatres || []).map(th => (
                          <div key={th.name} style={{ display: "flex", gap: 10,
                            fontSize: "0.75rem", color: "var(--muted)", padding: "4px 0 4px 16px",
                            borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                            <span style={{ flex: 1 }}>↳ {th.name}</span>
                            <span>{th.shows} shows</span>
                            <span>{th.soldSeats}/{th.totalSeats}</span>
                            <span style={{ minWidth: 100 }}><OccBar val={th.occupancy} /></span>
                            <span style={{ color: "var(--gold)" }}>{fmtINR(th.estCollection)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
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

// ─── Style constants ──────────────────────────────────────────────────────────
const labelSt = {
  display: "block", fontSize: "0.7rem", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--muted)", marginBottom: 6,
};
const inputSt = {
  background: "var(--bg3)", border: "1px solid var(--border)",
  borderRadius: 7, color: "var(--text)", padding: "9px 12px",
  fontSize: "0.85rem", width: "100%", boxSizing: "border-box",
  outline: "none",
};
