// Analytics.jsx — Local analytics dashboard
// Place in: src/pages/Analytics.jsx
// Route: /analytics (add to App.jsx)

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

const RECENT_KEY = "op_recent_songs";
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString("en-IN", { day:"numeric", month:"short" }) : "";

function readViews() {
  const data = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("views_")) {
        data.push({ id: key.replace("views_",""), views: parseInt(localStorage.getItem(key)||"0",10) });
      }
    }
  } catch {}
  return data.sort((a,b) => b.views - a.views).slice(0, 20);
}

function readRatings(movies) {
  const data = [];
  movies.forEach(m => {
    (m.media?.songs || []).forEach((s, i) => {
      const key = `rating_${m._id}_${i}`;
      try {
        const r = parseInt(localStorage.getItem(key)||"0",10);
        if (r > 0) data.push({ title: s.title, movie: m.title, rating: r, movieId: m._id });
      } catch {}
    });
  });
  return data.sort((a,b) => b.rating - a.rating);
}

function readWatchlist(movies) {
  try {
    const ids = JSON.parse(localStorage.getItem("op_watchlist")||"[]");
    return movies.filter(m => ids.includes(String(m._id)));
  } catch { return []; }
}

const STAR_LABEL = ["","Terrible","Poor","Average","Good","Excellent"];
const STAT_CARD = ({ label, value, sub, color="#c9973a" }) => (
  <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:12, padding:"16px 20px", minWidth:140 }}>
    <div style={{ fontSize:".68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", color:"rgba(255,255,255,.4)", marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:"1.8rem", fontWeight:900, color, lineHeight:1 }}>{value}</div>
    {sub && <div style={{ fontSize:".7rem", color:"rgba(255,255,255,.35)", marginTop:4 }}>{sub}</div>}
  </div>
);

export default function Analytics() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    API.getMovies().catch(()=>[]).then(setMovies);
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY)||"[]")); } catch {}
  }, []);

  const viewData  = useMemo(() => readViews(), [movies]);
  const ratingData= useMemo(() => readRatings(movies), [movies]);
  const watchlist = useMemo(() => readWatchlist(movies), [movies]);

  const topMovies = viewData.map(v => ({
    ...v, movie: movies.find(m => String(m._id)===v.id)
  })).filter(v => v.movie);

  const totalViews     = viewData.reduce((s,v) => s + v.views, 0);
  const totalSongRates = ratingData.length;
  const avgSongRating  = totalSongRates ? (ratingData.reduce((s,r)=>s+r.rating,0)/totalSongRates).toFixed(1) : "-";

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", paddingTop:72, paddingBottom:60 }}>
      <style>{`
        .an-section { max-width:1100px; margin:0 auto; padding:0 20px 32px; }
        .an-title { font-size:.62rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.35); margin-bottom:14px; }
        .an-table { width:100%; border-collapse:collapse; }
        .an-table td { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.05); font-size:.84rem; }
        .an-table td:first-child { color:rgba(255,255,255,.4); width:30px; }
        .an-bar { height:6px; background:rgba(255,255,255,.08); border-radius:3px; overflow:hidden; margin-top:3px; }
        .an-bar-fill { height:100%; background:linear-gradient(to right,#c9973a,#e8c87a); border-radius:3px; }
        .an-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; background:rgba(201,151,58,.1); border:1px solid rgba(201,151,58,.2); font-size:.72rem; color:#c9973a; font-weight:600; }
      `}</style>

      <div className="an-section">
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:"1.8rem", fontWeight:900, marginBottom:6 }}>📊 Your Analytics</h1>
        <p style={{ color:"rgba(255,255,255,.4)", fontSize:".82rem", marginBottom:28 }}>Based on your local browsing activity</p>

        {/* Stats strip */}
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:36 }}>
          <STAT_CARD label="Total Page Views"  value={totalViews}       sub="across all movies" />
          <STAT_CARD label="Songs Rated"       value={totalSongRates}   sub={`avg ${avgSongRating}⭐`} />
          <STAT_CARD label="Watchlist"         value={watchlist.length} sub="movies saved" color="#7aaae8" />
          <STAT_CARD label="Recently Played"   value={recent.length}    sub="songs" color="#95e5b8" />
        </div>

        {/* Most visited movies */}
        {topMovies.length > 0 && (
          <div style={{ marginBottom:36 }}>
            <div className="an-title">🔥 Most Visited Movies</div>
            <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:12, overflow:"hidden" }}>
              <table className="an-table">
                <tbody>
                  {topMovies.slice(0,10).map((v,i) => (
                    <tr key={v.id} style={{ cursor:"pointer" }}
                      onClick={() => navigate(`/movie/${v.movie.slug||v.id}`)}>
                      <td style={{ paddingLeft:16 }}>{i+1}</td>
                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          {v.movie.posterUrl && <img src={v.movie.posterUrl} alt="" style={{ width:32,height:44,objectFit:"cover",borderRadius:4,flexShrink:0 }} onError={e=>e.target.style.display="none"}/>}
                          <div>
                            <div style={{ fontWeight:600 }}>{v.movie.title}</div>
                            <div style={{ fontSize:".68rem", color:"rgba(255,255,255,.35)" }}>{v.movie.releaseDate?new Date(v.movie.releaseDate).getFullYear():""}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign:"right", paddingRight:16, color:"#c9973a", fontWeight:700 }}>{v.views} views</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recently played songs */}
        {recent.length > 0 && (
          <div style={{ marginBottom:36 }}>
            <div className="an-title">🎵 Recently Played Songs</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {recent.slice(0,8).map((s,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10, cursor:"pointer" }}
                  onClick={() => navigate(`/song/${s.movieSlug||s.movieId}/${s.songIdx||0}`)}>
                  {s.thumb && <img src={s.thumb} alt="" style={{ width:48,height:32,objectFit:"cover",borderRadius:5,flexShrink:0 }} onError={e=>e.target.style.display="none"}/>}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:".84rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</div>
                    <div style={{ fontSize:".68rem", color:"rgba(255,255,255,.4)" }}>{s.singer && `🎤 ${s.singer}`}{s.singer&&s.movieTitle?" · ":""}{s.movieTitle}</div>
                  </div>
                  <div style={{ fontSize:".66rem", color:"rgba(255,255,255,.3)", flexShrink:0 }}>{fmtDate(s.ts)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <div style={{ marginBottom:36 }}>
            <div className="an-title">📋 Your Watchlist</div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              {watchlist.map(m => (
                <div key={m._id} style={{ cursor:"pointer", width:110 }} onClick={() => navigate(`/movie/${m.slug||m._id}`)}>
                  <div style={{ borderRadius:8, overflow:"hidden", aspectRatio:"2/3", background:"var(--bg3)", marginBottom:6 }}>
                    {m.posterUrl && <img src={m.posterUrl} alt={m.title} style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>e.target.style.display="none"}/>}
                  </div>
                  <div style={{ fontSize:".72rem", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Song ratings */}
        {ratingData.length > 0 && (
          <div>
            <div className="an-title">⭐ Your Song Ratings</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {ratingData.map((r,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 14px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:".82rem" }}>{r.title}</div>
                    <div style={{ fontSize:".68rem", color:"rgba(255,255,255,.4)" }}>from {r.movie}</div>
                  </div>
                  <div>
                    {[1,2,3,4,5].map(s=><span key={s} style={{ fontSize:".8rem", filter:s<=r.rating?"none":"grayscale(1) opacity(.25)" }}>⭐</span>)}
                  </div>
                  <span className="an-chip">{STAR_LABEL[r.rating]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalViews === 0 && recent.length === 0 && watchlist.length === 0 && (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"rgba(255,255,255,.25)" }}>
            <div style={{ fontSize:"3rem", marginBottom:12 }}>📊</div>
            <div style={{ fontWeight:700, marginBottom:8 }}>No data yet</div>
            <div style={{ fontSize:".82rem" }}>Browse some movies and songs to see your activity here</div>
          </div>
        )}
      </div>
    </div>
  );
}