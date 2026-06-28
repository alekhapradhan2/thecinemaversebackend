import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, getCastToken } from "../api/api";

// ── Role config — each role gets icon, accent colour, nav sections ──
const ROLE_CONFIG = {
  "Actor":           { icon:"🎭", accent:"#3a5a8a", label:"Actor"            },
  "Actress":         { icon:"🌟", accent:"#8a3a6a", label:"Actress"          },
  "Director":        { icon:"🎬", accent:"#5a3a8a", label:"Director"         },
  "Producer":        { icon:"🎥", accent:"#2d6a4f", label:"Producer"         },
  "Singer":          { icon:"🎤", accent:"#8a3a3a", label:"Singer"           },
  "Music Director":  { icon:"🎼", accent:"#6a4a2a", label:"Music Director"   },
  "Lyricist":        { icon:"✍️",  accent:"#4a6a3a", label:"Lyricist"         },
  "Cinematographer": { icon:"📷", accent:"#2a5a6a", label:"Cinematographer"  },
  "Choreographer":   { icon:"💃", accent:"#7a3a5a", label:"Choreographer"   },
  "Background Score":{ icon:"🎻", accent:"#5a4a2a", label:"Bg Score Artist"  },
  "Editor":          { icon:"✂️",  accent:"#4a4a6a", label:"Editor"           },
  "Other":           { icon:"🎪", accent:"#555",    label:"Crew Member"      },
};

const getRoleConfig = (role) => ROLE_CONFIG[role] || ROLE_CONFIG["Other"];

// ── Role-specific stats/features ──
function RoleFeatureSection({ role, movies }) {
  const cfg = getRoleConfig(role);
  const roleMovies = movies.filter(m =>
    m.cast?.some(c => {
      const t = (c.type||"").toLowerCase();
      const r = role.toLowerCase();
      return t === r || t.includes(r.split(" ")[0].toLowerCase());
    })
  );

  const sections = {
    "Actor":    { label:"Films as Actor",       stat:`${roleMovies.length} films`, sub:"Performance credits" },
    "Actress":  { label:"Films as Actress",     stat:`${roleMovies.length} films`, sub:"Performance credits" },
    "Director": { label:"Films Directed",        stat:`${roleMovies.length} films`, sub:"Directorial credits"  },
    "Producer": { label:"Films Produced",        stat:`${roleMovies.length} films`, sub:"Production credits"   },
    "Singer":   { label:"Songs Sung",            stat:`${movies.flatMap(m=>m.media?.songs||[]).length}`, sub:"Across all films" },
    "Music Director": { label:"Films Scored",   stat:`${roleMovies.length} films`, sub:"Music direction"      },
    "Lyricist":       { label:"Songs Written",  stat:`${movies.flatMap(m=>m.media?.songs||[]).length}`, sub:"Lyrics credits"   },
  };
  const info = sections[role] || { label:`${role} Credits`, stat:`${roleMovies.length} films`, sub:"Credits" };

  return (
    <div className="cast-portal-role-card" style={{ borderLeft:`3px solid ${cfg.accent}` }}>
      <span style={{ fontSize:"1.8rem" }}>{cfg.icon}</span>
      <div>
        <div style={{ fontSize:"0.72rem", color:"var(--muted)", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:2 }}>{info.label}</div>
        <div style={{ fontSize:"1.5rem", fontWeight:700, fontFamily:"'Playfair Display',serif", lineHeight:1 }}>{info.stat}</div>
        <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:2 }}>{info.sub}</div>
      </div>
    </div>
  );
}

// ── Settings panel ──
function SettingsPanel({ member, onToast, onUpdate }) {
  const [form, setForm] = useState({
    name:      member.name      || "",
    bio:       member.bio       || "",
    photo:     member.photo     || "",
    banner:    member.banner    || "",
    location:  member.location  || "",
    website:   member.website   || "",
    instagram: member.instagram || "",
    roles:     member.roles     || [],
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const ALL_ROLES = ["Actor","Actress","Director","Producer","Music Director","Singer","Lyricist","Cinematographer","Choreographer","Background Score","Editor","Art Director","Stunt Director","Other"];
  const toggleRole = (r) => set("roles", form.roles.includes(r) ? form.roles.filter(x => x !== r) : [...form.roles, r]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await API.castUpdateMe(form);
      onUpdate(updated);
      onToast("Profile updated!");
    } catch (e) {
      onToast(typeof e === "string" ? e : "Save failed", "error");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth:660 }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:"1.4rem", marginBottom:4 }}>Profile Settings</h2>
        <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Update your artist profile and roles</p>
      </div>

      <div className="portal-form-grid">
        <div className="form-group">
          <label className="form-label">Display Name</label>
          <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="e.g. Bhubaneswar, Odisha" />
        </div>
        <div className="form-group" style={{ gridColumn:"1/-1" }}>
          <label className="form-label">Photo URL</label>
          <input className="form-input" value={form.photo} onChange={e => set("photo", e.target.value)} />
        </div>
        <div className="form-group" style={{ gridColumn:"1/-1" }}>
          <label className="form-label">Banner URL</label>
          <input className="form-input" value={form.banner} onChange={e => set("banner", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Website</label>
          <input className="form-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://…" />
        </div>
        <div className="form-group">
          <label className="form-label">Instagram</label>
          <input className="form-input" value={form.instagram} onChange={e => set("instagram", e.target.value)} placeholder="@handle" />
        </div>
        <div className="form-group" style={{ gridColumn:"1/-1" }}>
          <label className="form-label">Bio</label>
          <textarea className="form-textarea" value={form.bio} onChange={e => set("bio", e.target.value)} style={{ minHeight:90 }} />
        </div>
        <div className="form-group" style={{ gridColumn:"1/-1" }}>
          <label className="form-label">My Roles</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6 }}>
            {ALL_ROLES.map(r => (
              <button key={r} type="button" onClick={() => toggleRole(r)}
                style={{
                  padding:"6px 14px", borderRadius:20, fontSize:"0.78rem", cursor:"pointer",
                  border:`1px solid ${form.roles.includes(r) ? "var(--gold)" : "var(--border)"}`,
                  background: form.roles.includes(r) ? "rgba(201,151,58,0.15)" : "var(--bg3)",
                  color: form.roles.includes(r) ? "var(--gold)" : "var(--muted)",
                  fontFamily:"inherit", fontWeight: form.roles.includes(r) ? 700 : 400,
                }}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button className="btn btn-gold" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "💾 Save Changes"}
      </button>
    </div>
  );
}

// ── Main CastPortal ──
export default function CastPortal({ castMember, onToast, onLogout, onUpdate }) {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("overview");
  const [sideOpen, setSideOpen] = useState(false);

  const load = useCallback(async () => {
    if (!castMember || !getCastToken()) { navigate("/"); return; }
    try {
      const me = await API.castGetMe();
      setData(me);
    } catch { navigate("/"); }
    finally { setLoading(false); }
  }, [castMember]);

  useEffect(() => { load(); }, [load]);

  if (!castMember || !getCastToken()) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", gap:16 }}>
      <h2>Not logged in</h2>
      <Link to="/" className="btn btn-gold">Go Home</Link>
    </div>
  );
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <div className="skeleton" style={{ width:200, height:20 }} />
    </div>
  );

  const member = data || castMember;
  const movies = data?.movies || [];
  const roles  = member.roles || ["Other"];
  const primary = roles[0] || "Other";
  const primaryCfg = getRoleConfig(primary);

  // Build nav based on roles
  const NAV_ITEMS = [
    { key:"overview",     icon:"⬛", label:"Overview"     },
    { key:"filmography",  icon:"🎬", label:"Filmography"  },
    ...(roles.some(r => ["Singer","Music Director","Lyricist"].includes(r))
      ? [{ key:"music", icon:"🎵", label:"Music" }] : []),
    { key:"settings",     icon:"⚙️",  label:"Settings"     },
  ];

  // Songs the member is credited on
  const allSongs = movies.flatMap(m =>
    (m.media?.songs || []).map(s => ({ ...s, movieTitle: m.title, movieId: m._id }))
  );

  const hits = movies.filter(m => ["Hit","Super Hit","Blockbuster"].includes(m.verdict)).length;

  return (
    <div className="portal-layout">
      {/* ── TOP BAR ── */}
      <header className="portal-topbar">
        <div className="portal-topbar-left">
          <button className="portal-mobile-toggle" onClick={() => setSideOpen(o => !o)}>
            {sideOpen ? "✕" : "☰"}
          </button>
          <span className="portal-topbar-wordmark">OLLI<span>PEDIA</span></span>
          <span className="portal-topbar-badge">{primaryCfg.icon} {primaryCfg.label} Portal</span>
        </div>
        <div className="portal-topbar-right">
          <span className="portal-topbar-user">
            {member.photo && <img src={member.photo} alt="" style={{ width:26, height:26, borderRadius:"50%", objectFit:"cover", border:"1px solid var(--border)" }} onError={e=>e.target.style.display="none"} />}
            {member.name}
          </span>
          <Link to="/" className="btn btn-ghost btn-sm">Public Site ↗</Link>
          <button className="btn btn-outline btn-sm" onClick={() => { onLogout(); navigate("/"); }}>Logout</button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="portal-body">
        {/* Sidebar */}
        <aside className={`portal-sidebar ${sideOpen ? "open" : ""}`}>
          {/* Member card */}
          <div className="portal-sidebar-brand" style={{ flexDirection:"column", alignItems:"flex-start", gap:10, paddingBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div className="portal-sidebar-logo" style={{ width:44, height:44, borderRadius:"50%", border:`2px solid ${primaryCfg.accent}` }}>
                {member.photo
                  ? <img src={member.photo} alt="" onError={e=>e.target.style.display="none"} style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }} />
                  : <span style={{ fontSize:"1.3rem" }}>{primaryCfg.icon}</span>
                }
              </div>
              <div>
                <div className="portal-sidebar-name">{member.name}</div>
                {member.location && <div style={{ fontSize:"0.7rem", color:"var(--muted)" }}>📍 {member.location}</div>}
              </div>
            </div>
            {/* Role badges */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {roles.map(r => {
                const cfg = getRoleConfig(r);
                return (
                  <span key={r} style={{ fontSize:"0.65rem", fontWeight:700, padding:"2px 8px", borderRadius:10, background:`${cfg.accent}22`, color:cfg.accent, border:`1px solid ${cfg.accent}44` }}>
                    {cfg.icon} {r}
                  </span>
                );
              })}
            </div>
          </div>

          <nav className="portal-nav">
            {NAV_ITEMS.map(n => (
              <button key={n.key}
                className={`portal-nav-item ${tab === n.key ? "active" : ""}`}
                onClick={() => { setTab(n.key); setSideOpen(false); }}>
                <span className="portal-nav-icon">{n.icon}</span>
                <span className="portal-nav-label">{n.label}</span>
                {n.key === "filmography" && movies.length > 0 && <span className="portal-nav-badge">{movies.length}</span>}
              </button>
            ))}
          </nav>

          <div className="portal-sidebar-footer">
            {member.castId && (
              <Link to={`/cast/${member.castId}`} className="btn btn-outline btn-sm" style={{ width:"100%", textAlign:"center" }} target="_blank">
                👁 Public Profile ↗
              </Link>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="portal-main">

          {/* OVERVIEW */}
          {tab === "overview" && (
            <>
              {/* Hero banner */}
              <div style={{
                borderRadius:10, overflow:"hidden", marginBottom:28,
                background: member.banner ? `url(${member.banner}) center/cover` : `linear-gradient(135deg, ${primaryCfg.accent}33, var(--bg3))`,
                minHeight:160, position:"relative",
              }}>
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }} />
                <div style={{ position:"absolute", bottom:20, left:24, display:"flex", alignItems:"flex-end", gap:16 }}>
                  <div style={{ width:72, height:72, borderRadius:"50%", border:`3px solid ${primaryCfg.accent}`, overflow:"hidden", background:"var(--bg2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2rem", flexShrink:0 }}>
                    {member.photo
                      ? <img src={member.photo} alt={member.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />
                      : primaryCfg.icon
                    }
                  </div>
                  <div>
                    <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:"1.6rem", marginBottom:4 }}>{member.name}</h1>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {roles.map(r => {
                        const cfg = getRoleConfig(r);
                        return <span key={r} style={{ fontSize:"0.72rem", fontWeight:700, padding:"3px 10px", borderRadius:10, background:`${cfg.accent}55`, color:"#fff", border:`1px solid ${cfg.accent}88` }}>{cfg.icon} {r}</span>;
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio */}
              {member.bio && <p style={{ color:"var(--muted)", fontSize:"0.9rem", lineHeight:1.7, marginBottom:28, maxWidth:600 }}>{member.bio}</p>}

              {/* Role-specific stat cards */}
              <div className="portal-stats-grid" style={{ marginBottom:32 }}>
                <div className="portal-stat-card">
                  <div className="portal-stat-icon">🎬</div>
                  <div>
                    <div className="portal-stat-val">{movies.length}</div>
                    <div className="portal-stat-label">Total Films</div>
                  </div>
                </div>
                <div className="portal-stat-card">
                  <div className="portal-stat-icon" style={{ background:"rgba(45,106,79,0.2)" }}>🏆</div>
                  <div>
                    <div className="portal-stat-val">{hits}</div>
                    <div className="portal-stat-label">Hits</div>
                    <div className="portal-stat-sub">Hit / Super Hit / Blockbuster</div>
                  </div>
                </div>
                {roles.some(r => ["Singer","Music Director","Lyricist"].includes(r)) && (
                  <div className="portal-stat-card">
                    <div className="portal-stat-icon" style={{ background:"rgba(138,60,60,0.2)" }}>🎵</div>
                    <div>
                      <div className="portal-stat-val">{allSongs.length}</div>
                      <div className="portal-stat-label">Songs</div>
                    </div>
                  </div>
                )}
                <div className="portal-stat-card">
                  <div className="portal-stat-icon" style={{ background:`${primaryCfg.accent}22` }}>
                    {primaryCfg.icon}
                  </div>
                  <div>
                    <div className="portal-stat-val">{roles.length}</div>
                    <div className="portal-stat-label">Role{roles.length !== 1 ? "s" : ""}</div>
                    <div className="portal-stat-sub">{roles.join(" · ")}</div>
                  </div>
                </div>
              </div>

              {/* Per-role feature cards */}
              {roles.length > 0 && (
                <div className="portal-section">
                  <div className="portal-section-header">
                    <h2 className="portal-section-title">Career by Role</h2>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
                    {roles.map(r => <RoleFeatureSection key={r} role={r} movies={movies} />)}
                  </div>
                </div>
              )}

              {/* Recent films */}
              {movies.length > 0 && (
                <div className="portal-section">
                  <div className="portal-section-header">
                    <h2 className="portal-section-title">Recent Films</h2>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab("filmography")}>View All →</button>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {movies.slice(0, 5).map(m => (
                      <div key={m._id} onClick={() => navigate(`/movie/${m._id}`)}
                        style={{ display:"flex", gap:14, alignItems:"center", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:6, padding:"12px 16px", cursor:"pointer", transition:"border-color 0.15s" }}
                        onMouseOver={e=>e.currentTarget.style.borderColor="var(--gold)"}
                        onMouseOut={e=>e.currentTarget.style.borderColor="var(--border)"}>
                        <div style={{ width:40, height:56, borderRadius:4, overflow:"hidden", background:"var(--bg3)", flexShrink:0 }}>
                          {m.posterUrl && <img src={m.posterUrl} alt={m.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:"0.9rem", marginBottom:2 }}>{m.title}</div>
                          <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>
                            {m.releaseDate?.slice(0,4) || "TBA"} · {m.productionId?.name || ""}
                          </div>
                          {/* Show role in this film */}
                          {m.cast?.filter(c => c.castId === member.castId).map((c,i) => (
                            <span key={i} style={{ fontSize:"0.7rem", color:"var(--gold)", marginRight:6 }}>{c.type}{c.role ? ` — ${c.role}` : ""}</span>
                          ))}
                        </div>
                        {m.verdict && m.verdict !== "Upcoming" && (
                          <span className={`verdict verdict-${m.verdict?.toLowerCase().replace(" ","-")}`}>{m.verdict}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {movies.length === 0 && (
                <div className="portal-empty-hero">
                  <div className="portal-empty-icon">{primaryCfg.icon}</div>
                  <h2>No film credits yet</h2>
                  <p>Once a production house adds you to a movie, it will appear here.</p>
                </div>
              )}
            </>
          )}

          {/* FILMOGRAPHY */}
          {tab === "filmography" && (
            <>
              <div className="portal-page-header">
                <div>
                  <h1 className="portal-page-title">Filmography</h1>
                  <p className="portal-page-sub">{movies.length} film{movies.length !== 1 ? "s" : ""} on record</p>
                </div>
              </div>
              {movies.length === 0 ? (
                <div className="portal-empty-hero">
                  <div className="portal-empty-icon">🎬</div>
                  <h2>No film credits yet</h2>
                  <p>Productions will add you to films as they register them on Ollipedia.</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {movies.map(m => (
                    <div key={m._id} onClick={() => navigate(`/movie/${m._id}`)}
                      style={{ display:"flex", gap:16, alignItems:"center", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, padding:"14px 18px", cursor:"pointer", transition:"border-color 0.15s" }}
                      onMouseOver={e=>e.currentTarget.style.borderColor="var(--gold)"}
                      onMouseOut={e=>e.currentTarget.style.borderColor="var(--border)"}>
                      <div style={{ width:44, height:60, borderRadius:4, overflow:"hidden", background:"var(--bg3)", flexShrink:0 }}>
                        {m.posterUrl && <img src={m.posterUrl} alt={m.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:"0.95rem", marginBottom:2 }}>{m.title}</div>
                        <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:4 }}>
                          {m.releaseDate?.slice(0,4) || "TBA"} · {m.genre?.join(", ") || ""} · {m.productionId?.name || ""}
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {m.cast?.filter(c => String(c.castId) === String(member.castId)).map((c, i) => (
                            <span key={i} style={{ fontSize:"0.7rem", background:"rgba(201,151,58,0.12)", color:"var(--gold)", padding:"2px 8px", borderRadius:10 }}>
                              {c.type}{c.role ? ` · ${c.role}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      {m.verdict && m.verdict !== "Upcoming" && (
                        <span className={`verdict verdict-${m.verdict?.toLowerCase().replace(" ","-")}`}>{m.verdict}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* MUSIC (for singers / music directors / lyricists) */}
          {tab === "music" && (
            <>
              <div className="portal-page-header">
                <div>
                  <h1 className="portal-page-title">Music Credits</h1>
                  <p className="portal-page-sub">{allSongs.length} song{allSongs.length !== 1 ? "s" : ""} across {movies.length} film{movies.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              {allSongs.length === 0 ? (
                <div className="portal-empty-hero">
                  <div className="portal-empty-icon">🎵</div>
                  <h2>No music credits yet</h2>
                </div>
              ) : (
                <div className="song-list">
                  {allSongs.map((s, i) => (
                    <div key={i} className="song-item" style={{ cursor:"pointer" }} onClick={() => navigate(`/movie/${s.movieId}`)}>
                      <span className="song-num">{i + 1}</span>
                      <div className="song-info">
                        <div className="song-title">{s.title}</div>
                        <div className="song-singer">{s.singer && `${s.singer} · `}<span style={{ color:"var(--gold)" }}>{s.movieTitle}</span></div>
                      </div>
                      {s.ytId && (
                        <a href={`https://youtube.com/watch?v=${s.ytId}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>
                          <button className="song-play" style={{ opacity:1 }}>▶</button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* SETTINGS */}
          {tab === "settings" && (
            <SettingsPanel member={member} onToast={onToast} onUpdate={m => { onUpdate(m); setData(d => ({ ...d, ...m })); }} />
          )}

        </main>
      </div>
    </div>
  );
}
