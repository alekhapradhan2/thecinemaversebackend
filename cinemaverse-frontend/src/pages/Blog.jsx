import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// Uses the same env var as api.js — VITE_API_URL already includes /api
// e.g. "https://ollipedia-backend.onrender.com/api"
// So we must NOT append /api again here.
const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;600;700&display=swap');

@keyframes bl-up      { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
@keyframes bl-shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
@keyframes bl-ticker  { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes bl-dot     { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.5);opacity:1} }
@keyframes bl-glow    { 0%,100%{box-shadow:0 0 18px rgba(201,151,58,.35)} 50%{box-shadow:0 0 36px rgba(201,151,58,.7)} }

:root {
  --gold:#c9973a; --gold2:#e0b86a;
  --bg:#080808; --bg2:#0f0f0f; --bg3:#161616; --bg4:#1d1d1d; --bg5:#252525;
  --border:rgba(255,255,255,.07); --border2:rgba(255,255,255,.13);
  
  --muted:rgba(255,255,255,.38); --text:#f0efe8;
}
*{box-sizing:border-box;}

.bl-root{min-height:100vh;background:var(--bg);padding-top:58px;color:var(--text);font-family:'DM Sans',system-ui,sans-serif;}

/* ── Ticker ── */
.bl-ticker{background:var(--gold);overflow:hidden;height:30px;display:flex;align-items:center;}
.bl-ticker-label{flex-shrink:0;background:#000;color:var(--gold);font-size:.58rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;padding:0 14px;height:100%;display:flex;align-items:center;gap:6px;white-space:nowrap;}
.bl-ticker-ldot{width:5px;height:5px;background:var(--gold);border-radius:50%;animation:bl-dot 1.2s ease infinite;}
.bl-ticker-track{display:flex;animation:bl-ticker 28s linear infinite;white-space:nowrap;}
.bl-ticker-item{font-size:.68rem;font-weight:700;color:#000;padding:0 26px;display:flex;align-items:center;gap:7px;}
.bl-ticker-dot{width:3px;height:3px;background:rgba(0,0,0,.4);border-radius:50%;}

/* ── Masthead ── */
.bl-masthead{position:relative;overflow:hidden;border-bottom:1px solid var(--border);}
.bl-masthead::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 0%,rgba(201,151,58,.1) 0%,transparent 70%);pointer-events:none;}
.bl-masthead::after{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:64px 64px;pointer-events:none;mask-image:linear-gradient(180deg,transparent,rgba(0,0,0,.6) 50%,transparent);}
.bl-masthead-inner{position:relative;z-index:1;max-width:1280px;margin:0 auto;padding:48px 20px 36px;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;}
@media(min-width:768px){.bl-masthead-inner{padding:60px 32px 44px;}}

.bl-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.6rem;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);padding:5px 14px;border:1px solid rgba(201,151,58,.28);border-radius:2px;background:rgba(201,151,58,.06);}
.bl-eyebrow-dot{width:5px;height:5px;background:var(--gold);border-radius:50%;animation:bl-dot 1.5s ease infinite;}

.bl-brand{font-family:'Playfair Display',serif;font-size:clamp(2.2rem,7vw,4.8rem);font-weight:900;line-height:.9;letter-spacing:-.025em;margin:0;background:linear-gradient(135deg,#f5e6c0 0%,var(--gold) 45%,#7a5018 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.bl-brand em{font-style:italic;font-weight:700;}
.bl-brand-rule{width:100%;max-width:460px;height:1px;background:linear-gradient(90deg,transparent,var(--gold),rgba(201,151,58,.25),transparent);}
.bl-brand-sub{font-size:.75rem;color:var(--muted);letter-spacing:.16em;text-transform:uppercase;display:flex;align-items:center;gap:9px;}
.bl-brand-sub span{opacity:.35;}

/* Search */
.bl-srow{display:flex;align-items:stretch;max-width:520px;width:100%;border:1.5px solid var(--border2);border-radius:3px;background:var(--bg3);transition:border-color .2s,box-shadow .2s;}
.bl-srow:focus-within{border-color:rgba(201,151,58,.5);box-shadow:0 0 0 3px rgba(201,151,58,.07);}
.bl-sico{padding:0 14px;display:flex;align-items:center;color:var(--muted);font-size:.88rem;flex-shrink:0;}
.bl-sinput{flex:1;background:none;border:none;outline:none;color:var(--text);font-family:inherit;font-size:.86rem;padding:12px 0;}
.bl-sinput::placeholder{color:rgba(255,255,255,.2);}
.bl-sclear{background:none;border:none;color:var(--muted);cursor:pointer;padding:0 10px;font-size:.78rem;}
.bl-sbtn{padding:0 22px;background:var(--gold);border:none;color:#000;font-family:inherit;font-weight:700;font-size:.78rem;letter-spacing:.04em;cursor:pointer;transition:background .15s;border-radius:0 1px 1px 0;flex-shrink:0;}
.bl-sbtn:hover{background:var(--gold2);}

/* ── Category Nav ── */
.bl-catnav-wrap{background:var(--bg2);border-bottom:1px solid var(--border);position:sticky;top:58px;z-index:90;}
.bl-catnav{max-width:1280px;margin:0 auto;padding:0 20px;display:flex;overflow-x:auto;scrollbar-width:none;}
.bl-catnav::-webkit-scrollbar{display:none;}
@media(min-width:768px){.bl-catnav{padding:0 32px;}}
.bl-catbtn{padding:13px 18px;border:none;border-bottom:2.5px solid transparent;background:none;color:var(--muted);font-family:inherit;font-size:.74rem;font-weight:600;cursor:pointer;white-space:nowrap;letter-spacing:.04em;transition:color .15s,border-color .15s;flex-shrink:0;}
.bl-catbtn:hover{color:var(--text);}
.bl-catbtn.on{color:var(--gold);border-bottom-color:var(--gold);}

/* ── Topbar ── */
.bl-topbar{max-width:1280px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
@media(min-width:768px){.bl-topbar{padding:16px 32px;}}
.bl-topbar-l{font-size:.72rem;color:var(--muted);display:flex;align-items:center;gap:8px;}
.bl-count-badge{background:rgba(201,151,58,.1);border:1px solid rgba(201,151,58,.2);border-radius:10px;padding:1px 8px;font-size:.66rem;font-weight:700;color:var(--gold);}
.bl-sort-grp{display:flex;gap:5px;align-items:center;}
.bl-sort-l{font-size:.68rem;color:var(--muted);}
.bl-sortbtn{padding:5px 12px;border-radius:2px;border:1px solid var(--border2);background:var(--bg3);color:var(--muted);font-family:inherit;font-size:.7rem;font-weight:600;cursor:pointer;transition:all .15s;}
.bl-sortbtn.on{border-color:rgba(201,151,58,.4);color:var(--gold);background:rgba(201,151,58,.08);}

/* ── Main ── */
.bl-main{max-width:1280px;margin:0 auto;padding:0 20px 80px;}
@media(min-width:768px){.bl-main{padding:0 32px 80px;}}

/* ── Hero grid ── */
.bl-hero{display:grid;grid-template-columns:1fr;gap:3px;margin-bottom:36px;border-radius:5px;overflow:hidden;border:1px solid var(--border);}
@media(min-width:700px){.bl-hero{grid-template-columns:1.65fr 1fr;}}

.bl-hero-main{position:relative;cursor:pointer;overflow:hidden;min-height:360px;display:flex;align-items:flex-end;background:var(--bg3);animation:bl-up .5s ease both;}
@media(min-width:700px){.bl-hero-main{min-height:460px;}}
.bl-hero-main-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .6s ease;filter:brightness(.65);}
.bl-hero-main:hover .bl-hero-main-img{transform:scale(1.05);}
.bl-hero-main-grad{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.96) 0%,rgba(0,0,0,.6) 38%,transparent 72%);}
.bl-hero-main-body{position:relative;z-index:1;padding:26px 22px;display:flex;flex-direction:column;gap:10px;}
.bl-hero-badge{display:inline-flex;align-items:center;gap:5px;width:fit-content;font-size:.56rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:4px 10px;border-radius:2px;background:var(--gold);color:#000;animation:bl-glow 2.5s ease infinite;}
.bl-hero-title{font-family:'Playfair Display',serif;font-size:clamp(1.25rem,2.8vw,1.9rem);font-weight:700;color:#fff;line-height:1.25;margin:0;}
.bl-hero-excerpt{font-size:.78rem;color:rgba(255,255,255,.58);line-height:1.65;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.bl-hero-meta{font-size:.63rem;color:rgba(255,255,255,.36);display:flex;gap:9px;flex-wrap:wrap;align-items:center;}
.bl-hero-read{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(201,151,58,.16);border:1px solid rgba(201,151,58,.38);border-radius:2px;color:var(--gold);font-size:.71rem;font-weight:700;width:fit-content;transition:background .15s;}
.bl-hero-main:hover .bl-hero-read{background:rgba(201,151,58,.3);}

.bl-hero-stack{display:flex;flex-direction:row;gap:3px;}
@media(min-width:700px){.bl-hero-stack{flex-direction:column;}}
.bl-hero-side{flex:1;position:relative;cursor:pointer;overflow:hidden;min-height:160px;display:flex;align-items:flex-end;background:var(--bg3);}
.bl-hero-side-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .45s;filter:brightness(.6);}
.bl-hero-side:hover .bl-hero-side-img{transform:scale(1.07);}
.bl-hero-side-grad{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.94) 0%,transparent 62%);}
.bl-hero-side-body{position:relative;z-index:1;padding:12px 14px;}
.bl-hero-side-cat{font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--gold);margin-bottom:4px;}
.bl-hero-side-title{font-size:.8rem;font-weight:700;color:#fff;line-height:1.35;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .15s;}
.bl-hero-side:hover .bl-hero-side-title{color:var(--gold);}
.bl-hero-side-meta{font-size:.6rem;color:rgba(255,255,255,.3);margin-top:3px;}

/* ── Content wrap ── */
.bl-cwrap{display:grid;grid-template-columns:1fr;gap:40px;}
@media(min-width:1024px){.bl-cwrap{grid-template-columns:1fr 290px;gap:48px;}}

/* ── Section title ── */
.bl-stitle{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);display:flex;align-items:center;gap:11px;margin-bottom:18px;padding-bottom:11px;border-bottom:1px solid var(--border);}
.bl-stitle::before{content:'';display:block;width:22px;height:2.5px;background:var(--gold);border-radius:2px;flex-shrink:0;}
.bl-stitle-ct{margin-left:auto;font-size:.6rem;color:rgba(201,151,58,.55);font-weight:400;letter-spacing:.04em;}

/* ── Article grid ── */
.bl-grid{display:grid;gap:2px;grid-template-columns:1fr;}
@media(min-width:500px){.bl-grid{grid-template-columns:1fr 1fr;}}
@media(min-width:900px){.bl-grid{grid-template-columns:1fr 1fr 1fr;}}

.bl-card{background:var(--bg3);cursor:pointer;display:flex;flex-direction:column;animation:bl-up .4s ease both;transition:background .18s;}
.bl-card:hover{background:var(--bg4);}
.bl-card-img-wrap{position:relative;overflow:hidden;aspect-ratio:16/9;background:var(--bg4);flex-shrink:0;}
.bl-card-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .42s ease;}
.bl-card:hover .bl-card-img{transform:scale(1.07);}
.bl-card-img-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;background:linear-gradient(135deg,#1a1200,#060606);}
.bl-card-cat{position:absolute;top:0;left:0;font-size:.54rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;padding:4px 9px;line-height:1.5;}
.bl-card-views{position:absolute;bottom:7px;right:8px;font-size:.57rem;color:rgba(255,255,255,.65);background:rgba(0,0,0,.62);backdrop-filter:blur(4px);border-radius:10px;padding:2px 7px;}
.bl-card-body{padding:13px 15px 15px;display:flex;flex-direction:column;gap:6px;flex:1;border-bottom:1px solid var(--border);}
.bl-card-title{font-size:.87rem;font-weight:700;color:var(--text);line-height:1.4;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .15s;}
.bl-card:hover .bl-card-title{color:var(--gold);}
.bl-card-exc{font-size:.73rem;color:rgba(255,255,255,.4);line-height:1.6;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1;}
.bl-card-meta{display:flex;align-items:center;gap:7px;font-size:.62rem;color:rgba(255,255,255,.25);margin-top:3px;flex-wrap:wrap;}
.bl-card-movie{color:var(--gold);font-weight:600;margin-left:auto;}

/* ── Trending sidebar ── */
.bl-sidebar{}
.bl-trending-list{display:flex;flex-direction:column;}
.bl-trending-item{display:flex;gap:11px;align-items:flex-start;padding:13px 0;border-bottom:1px solid var(--border);cursor:pointer;transition:all .15s;}
.bl-trending-item:last-child{border-bottom:none;}
.bl-trending-item:hover .bl-t-num{color:var(--gold);}
.bl-trending-item:hover .bl-t-title{color:var(--gold);}
.bl-t-num{font-family:'Playfair Display',serif;font-size:1.55rem;font-weight:900;color:rgba(255,255,255,.1);line-height:1;flex-shrink:0;width:28px;text-align:right;transition:color .15s;}
.bl-t-thumb{width:66px;height:44px;object-fit:cover;border-radius:2px;background:var(--bg4);flex-shrink:0;}
.bl-t-ph{width:66px;height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--bg4);border-radius:2px;font-size:1.1rem;}
.bl-t-info{flex:1;min-width:0;}
.bl-t-cat{font-size:.55rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--gold);margin-bottom:3px;}
.bl-t-title{font-size:.78rem;font-weight:700;color:var(--text);line-height:1.36;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .15s;}
.bl-t-meta{font-size:.6rem;color:rgba(255,255,255,.26);margin-top:3px;}

/* ── Skeleton ── */
.bl-sk{background:linear-gradient(90deg,var(--bg4) 25%,var(--bg5) 50%,var(--bg4) 75%);background-size:600px 100%;animation:bl-shimmer 1.5s infinite;border-radius:2px;}
.bl-skel-card{background:var(--bg3);}

/* ── Empty ── */
.bl-empty{text-align:center;padding:80px 20px;display:flex;flex-direction:column;align-items:center;gap:14px;}
.bl-empty-ico{font-size:3rem;opacity:.35;}
.bl-empty-t{font-family:'Playfair Display',serif;font-size:1.25rem;color:rgba(255,255,255,.38);}
.bl-empty-s{font-size:.8rem;color:var(--muted);}

/* ── Load more ── */
.bl-lmore{text-align:center;margin-top:40px;padding-top:22px;border-top:1px solid var(--border);}
.bl-lmore-btn{display:inline-flex;align-items:center;gap:10px;padding:11px 34px;background:transparent;border:1.5px solid rgba(201,151,58,.28);border-radius:2px;color:var(--gold);font-family:inherit;font-size:.78rem;font-weight:700;letter-spacing:.06em;cursor:pointer;transition:all .2s;}
.bl-lmore-btn:hover{background:rgba(201,151,58,.1);border-color:var(--gold);}
.bl-lmore-btn:disabled{opacity:.4;cursor:not-allowed;}
`;

const CATS = ["All","Movie Review","Top 10","Actor Spotlight","News","Upcoming","General"];
const CAT_STYLE = {
  "Movie Review":    {bg:"rgba(201,151,58,.9)",  c:"#000"},
  "Actor Spotlight": {bg:"rgba(167,139,232,.9)", c:"#fff"},
  "Top 10":          {bg:"rgba(232,200,122,.9)", c:"#000"},
  "News":            {bg:"rgba(74,207,130,.9)",  c:"#000"},
  "Upcoming":        {bg:"rgba(90,170,232,.9)",  c:"#000"},
  "General":         {bg:"rgba(229,121,154,.9)", c:"#fff"},
};
const cs = cat => { const s = CAT_STYLE[cat] || CAT_STYLE["Movie Review"]; return {background:s.bg,color:s.c}; };
const fd = iso => iso ? new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";
const fv = v => !v ? "" : v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v);

function SkelCard() {
  return (
    <div className="bl-skel-card">
      <div className="bl-sk" style={{aspectRatio:"16/9"}} />
      <div style={{padding:"13px 15px",display:"flex",flexDirection:"column",gap:9}}>
        <div className="bl-sk" style={{height:9,width:"36%"}} />
        <div className="bl-sk" style={{height:12,width:"90%"}} />
        <div className="bl-sk" style={{height:12,width:"72%"}} />
        <div className="bl-sk" style={{height:9,width:"26%",marginTop:4}} />
      </div>
    </div>
  );
}

export default function Blog() {
  const navigate = useNavigate();
  const [sp, setSP] = useSearchParams();
  const [posts,setPosts] = useState([]);
  const [total,setTotal] = useState(0);
  const [page,setPage] = useState(1);
  const [loading,setLoading] = useState(true);
  const [more,setMore] = useState(false);
  const [si,setSi] = useState(sp.get("q")||"");
  const [search,setSearch] = useState(sp.get("q")||"");
  const [cat,setCat] = useState(sp.get("cat")||"All");
  const [sort,setSort] = useState("newest");
  const PER = 15;

  const fetch_ = useCallback(async(pg=1,reset=true)=>{
    if(reset){setLoading(true);setPosts([]);}else setMore(true);
    try{
      const p=new URLSearchParams({page:pg,limit:PER});
      if(search.trim()) p.set("q",search.trim());
      if(cat&&cat!=="All") p.set("category",cat);
      const r=await fetch(`${API_BASE}/blog?${p}`);
      const d=await r.json();
      let list=d.posts||d||[];
      if(sort==="popular") list=[...list].sort((a,b)=>(b.views||0)-(a.views||0));
      setPosts(prev=>reset?list:[...prev,...list]);
      setTotal(d.total||list.length);
      setPage(pg);
    }catch{if(reset)setPosts([]);}
    finally{setLoading(false);setMore(false);}
  },[search,cat,sort]);

  useEffect(()=>{fetch_(1,true);},[fetch_]);
  useEffect(()=>{
    const p={};
    if(search) p.q=search;
    if(cat&&cat!=="All") p.cat=cat;
    setSP(p,{replace:true});
  },[search,cat]);

  const go=()=>setSearch(si);
  const isDefault=!search&&cat==="All";
  const heroMain=isDefault&&posts[0];
  const heroSides=isDefault?posts.slice(1,3):[];
  const gridPosts=isDefault?posts.slice(3):posts;
  const trending=[...posts].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,8);
  const hasMore=posts.length<total;

  return (
    <>
      <style>{CSS}</style>
      <Helmet>
        <title>Ollywood Blog – Odia Movie Articles, Reviews & News | OllyPedia</title>
        <meta name="description" content="Trending Odia movie reviews, top 10 lists, actor spotlights, and the latest Ollywood news." />
      </Helmet>

      <div className="bl-root">
        {/* Ticker */}
        <div className="bl-ticker">
          <div className="bl-ticker-label"><span className="bl-ticker-ldot"/>TRENDING</div>
          <div style={{overflow:"hidden",flex:1}}>
            <div className="bl-ticker-track">
              {[...(posts.length?posts.slice(0,6):Array(6).fill({title:"Ollywood News & Reviews"})),...(posts.length?posts.slice(0,6):Array(6).fill({title:"Ollywood News & Reviews"}))].map((p,i)=>(
                <span key={i} className="bl-ticker-item"><span className="bl-ticker-dot"/>{p.title}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Masthead */}
        <div className="bl-masthead">
          <div className="bl-masthead-inner">
            <div className="bl-eyebrow"><span className="bl-eyebrow-dot"/>Odia Cinema Coverage</div>
            <h1 className="bl-brand">The Ollywood<br/><em>Journal</em></h1>
            <div className="bl-brand-rule"/>
            <div className="bl-brand-sub">Reviews<span>·</span>Spotlights<span>·</span>Stories<span>·</span>Rankings</div>
            <div className="bl-srow">
              <div className="bl-sico">🔍</div>
              <input className="bl-sinput" placeholder="Search articles, movies, actors…" value={si} onChange={e=>setSi(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
              {si&&<button className="bl-sclear" onClick={()=>{setSi("");setSearch("");}}>✕</button>}
              <button className="bl-sbtn" onClick={go}>Search</button>
            </div>
          </div>
        </div>

        {/* Cat nav */}
        <div className="bl-catnav-wrap">
          <div className="bl-catnav">
            {CATS.map(c=>(
              <button key={c} className={`bl-catbtn${cat===c?" on":""}`} onClick={()=>{setCat(c);setSearch("");setSi("");}}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Topbar */}
        <div className="bl-topbar">
          <div className="bl-topbar-l">
            {!loading&&total>0&&<><span className="bl-count-badge">{total}</span>articles</>}
          </div>
          <div className="bl-sort-grp">
            <span className="bl-sort-l">Sort</span>
            {[["newest","🕐 Newest"],["popular","🔥 Popular"]].map(([k,l])=>(
              <button key={k} className={`bl-sortbtn${sort===k?" on":""}`} onClick={()=>setSort(k)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="bl-main">
          {loading?(
            <div className="bl-cwrap">
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1.65fr 1fr",gap:3,marginBottom:36,borderRadius:5,overflow:"hidden",border:"1px solid var(--border)"}}>
                  <div className="bl-sk" style={{minHeight:320}}/>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    <div className="bl-sk" style={{flex:1,minHeight:100}}/>
                    <div className="bl-sk" style={{flex:1,minHeight:100}}/>
                  </div>
                </div>
                <div className="bl-grid">{Array.from({length:6}).map((_,i)=><SkelCard key={i}/>)}</div>
              </div>
              <div>{Array.from({length:5}).map((_,i)=>(
                <div key={i} style={{display:"flex",gap:11,padding:"13px 0",borderBottom:"1px solid var(--border)"}}>
                  <div className="bl-sk" style={{width:66,height:44,borderRadius:2,flexShrink:0}}/>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
                    <div className="bl-sk" style={{height:9,width:"30%"}}/>
                    <div className="bl-sk" style={{height:11,width:"88%"}}/>
                    <div className="bl-sk" style={{height:9,width:"45%"}}/>
                  </div>
                </div>
              ))}</div>
            </div>
          ):posts.length===0?(
            <div className="bl-empty">
              <div className="bl-empty-ico">📭</div>
              <div className="bl-empty-t">No articles found</div>
              <div className="bl-empty-s">{search?`No results for "${search}" — try something else.`:"Check back soon for fresh stories!"}</div>
            </div>
          ):(
            <div className="bl-cwrap">
              <div>
                {/* Hero */}
                {heroMain&&(
                  <div className="bl-hero">
                    <div className="bl-hero-main" onClick={()=>navigate(`/blog/${heroMain.slug}`)}>
                      {heroMain.coverImage
                        ?<img src={heroMain.coverImage} alt={heroMain.title} className="bl-hero-main-img" onError={e=>e.target.style.display="none"}/>
                        :<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#1a1200,#040404)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"3.5rem"}}>✍️</div>
                      }
                      <div className="bl-hero-main-grad"/>
                      <div className="bl-hero-main-body">
                        <span className="bl-hero-badge">⭐ Featured Story</span>
                        <h2 className="bl-hero-title">{heroMain.title}</h2>
                        {heroMain.excerpt&&<p className="bl-hero-excerpt">{heroMain.excerpt}</p>}
                        <div className="bl-hero-meta">
                          <span>📅 {fd(heroMain.createdAt)}</span>
                          {heroMain.readTime&&<span>⏱ {heroMain.readTime} min</span>}
                          {heroMain.views>0&&<span>👁 {fv(heroMain.views)}</span>}
                          {heroMain.movieTitle&&<span style={{color:"var(--gold)"}}>🎬 {heroMain.movieTitle}</span>}
                        </div>
                        <span className="bl-hero-read">Read Story →</span>
                      </div>
                    </div>
                    {heroSides.length>0&&(
                      <div className="bl-hero-stack">
                        {heroSides.map((p,i)=>(
                          <div key={p._id} className="bl-hero-side" style={{animationDelay:`${(i+1)*80}ms`}} onClick={()=>navigate(`/blog/${p.slug}`)}>
                            {p.coverImage?<img src={p.coverImage} alt={p.title} className="bl-hero-side-img" loading="lazy" onError={e=>e.target.style.display="none"}/>
                              :<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#1a1200,#040404)"}}/>}
                            <div className="bl-hero-side-grad"/>
                            <div className="bl-hero-side-body">
                              <div className="bl-hero-side-cat">{p.category||"Article"}</div>
                              <h3 className="bl-hero-side-title">{p.title}</h3>
                              <div className="bl-hero-side-meta">{fd(p.createdAt)}{p.readTime?` · ${p.readTime} min`:""}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Grid */}
                {gridPosts.length>0&&(
                  <>
                    <div className="bl-stitle">
                      {isDefault?"Latest Articles":"Results"}
                      <span className="bl-stitle-ct">{gridPosts.length} stories</span>
                    </div>
                    <div className="bl-grid">
                      {gridPosts.map((post,i)=>(
                        <div key={post._id} className="bl-card" style={{animationDelay:`${Math.min(i,8)*45}ms`}} onClick={()=>navigate(`/blog/${post.slug}`)}>
                          <div className="bl-card-img-wrap">
                            {post.coverImage?<img src={post.coverImage} alt={post.title} className="bl-card-img" loading="lazy" onError={e=>e.target.style.display="none"}/>
                              :<div className="bl-card-img-ph">✍️</div>}
                            <span className="bl-card-cat" style={cs(post.category)}>{post.category||"Article"}</span>
                            {post.views>0&&<span className="bl-card-views">👁 {fv(post.views)}</span>}
                          </div>
                          <div className="bl-card-body">
                            <h3 className="bl-card-title">{post.title}</h3>
                            {post.excerpt&&<p className="bl-card-exc">{post.excerpt}</p>}
                            <div className="bl-card-meta">
                              <span>{fd(post.createdAt)}</span>
                              {post.readTime&&<span>· {post.readTime} min</span>}
                              {post.movieTitle&&<span className="bl-card-movie">🎬 {post.movieTitle}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {hasMore&&(
                  <div className="bl-lmore">
                    <button className="bl-lmore-btn" onClick={()=>fetch_(page+1,false)} disabled={more}>
                      {more?"⏳ Loading…":`Load More · ${total-posts.length} remaining`}
                    </button>
                  </div>
                )}
              </div>

              {/* Trending sidebar */}
              {trending.length>0&&(
                <aside className="bl-sidebar">
                  <div className="bl-stitle" style={{marginBottom:0,paddingBottom:11}}>🔥 Trending Now</div>
                  <div className="bl-trending-list">
                    {trending.map((post,i)=>(
                      <div key={post._id} className="bl-trending-item" onClick={()=>navigate(`/blog/${post.slug}`)}>
                        <div className="bl-t-num">{String(i+1).padStart(2,"0")}</div>
                        {post.coverImage
                          ?<img src={post.coverImage} alt={post.title} className="bl-t-thumb" loading="lazy" onError={e=>e.target.style.display="none"}/>
                          :<div className="bl-t-ph">✍️</div>}
                        <div className="bl-t-info">
                          <div className="bl-t-cat">{post.category||"Article"}</div>
                          <div className="bl-t-title">{post.title}</div>
                          <div className="bl-t-meta">{fd(post.createdAt)}{post.views?` · 👁 ${fv(post.views)}`:""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}