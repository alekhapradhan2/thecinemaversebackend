import SEO, { staticSEO } from "../components/SEO";
import { castPath } from "../utils/slugs";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";
import { Cache } from "../api/cache";

const CSS = `
@keyframes cpulse{0%,100%{opacity:1}50%{opacity:.35}}
.cc{flex-shrink:0;width:140px;cursor:pointer;transition:transform .25s cubic-bezier(.34,1.56,.64,1);contain:layout style;}
@media(min-width:480px){.cc{width:152px;}}
@media(min-width:768px){.cc{width:162px;}}
.cc:hover{transform:translateY(-6px) scale(1.02);}
.cc:hover .cc-box{box-shadow:0 18px 48px rgba(0,0,0,.7);border-color:rgba(201,151,58,.45);}
.cc:hover .cc-play{opacity:1;}.cc:hover .cc-name{color:var(--gold);}
.cc-box{position:relative;border-radius:10px;overflow:hidden;height:180px;background:var(--bg3);box-shadow:0 4px 14px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.06);transition:box-shadow .25s,border .25s;}
@media(min-width:480px){.cc-box{height:196px;}}
@media(min-width:768px){.cc-box{height:210px;}}
.cc-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25);opacity:0;transition:opacity .2s;}
.cc-name{margin:0;font-weight:700;font-size:.76rem;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);transition:color .2s;}
@media(min-width:480px){.cc-name{font-size:.82rem;}}
/* Cast page */
.cast-root{min-height:100vh;background:var(--bg);padding-top:60px;}
.cast-header{padding:24px 16px 0;background:linear-gradient(to bottom,rgba(201,151,58,.06),transparent);border-bottom:1px solid var(--border);}
@media(min-width:480px){.cast-header{padding:28px 20px 0;}}
@media(min-width:768px){.cast-header{padding:32px 28px 0;}}
.cast-title{font-family:'Playfair Display',serif;font-size:clamp(1.4rem,4vw,2.2rem);font-weight:900;margin:0 0 16px;}
.cast-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.06);}
.cast-tab{padding:10px 16px;background:none;border:none;cursor:pointer;font-weight:700;font-size:.78rem;color:var(--muted);border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;}
@media(min-width:480px){.cast-tab{padding:10px 20px;font-size:.82rem;}}
.cast-tab.active{color:var(--gold);border-bottom-color:var(--gold);}
.cast-filters{padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
@media(min-width:480px){.cast-filters{padding:10px 20px;gap:10px;}}
.cast-sections{padding:20px 0 60px;}
.cast-row-wrap{margin-bottom:8px;}
.cast-row-header{display:flex;align-items:center;justify-content:space-between;padding:0 16px;margin-bottom:12px;}
@media(min-width:480px){.cast-row-header{padding:0 20px;}}
@media(min-width:768px){.cast-row-header{padding:0 28px;}}
.cast-hrow{display:flex;gap:10px;overflow-x:auto;padding:4px 16px 10px;scrollbar-width:none;}
@media(min-width:480px){.cast-hrow{gap:12px;padding:4px 20px 12px;}}
@media(min-width:768px){.cast-hrow{gap:14px;padding:4px 28px 14px;}}
.cast-hrow::-webkit-scrollbar{display:none;}
.cast-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:12px;padding:4px 16px 20px;}
@media(min-width:480px){.cast-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:4px 20px 20px;}}
@media(min-width:768px){.cast-grid{grid-template-columns:repeat(auto-fill,minmax(162px,1fr));gap:16px;padding:4px 28px 20px;}}
.cast-row-title{margin:0;font-size:.9rem;font-weight:800;}
@media(min-width:480px){.cast-row-title{font-size:1rem;}}
.cast-arrow{width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--text);cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;}
.cast-arrow:hover{border-color:rgba(201,151,58,.4);color:var(--gold);}
@media(max-width:400px){.cast-arrow{display:none;}}
`;

// Shared IO
const _io = typeof window!=="undefined" ? (()=>{
  const cbs=new WeakMap();
  const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){cbs.get(e.target)?.();cbs.delete(e.target);io.unobserve(e.target);}});},{rootMargin:"350px"});
  io._cbs=cbs; return io;
})() : null;
const obsImg=(el,cb)=>{if(!_io||!el)return;_io._cbs.set(el,cb);_io.observe(el);return()=>{_io.unobserve(el);_io._cbs.delete(el);};};

function LImg({src,alt,style}){
  const [ok,setOk]=useState(false);const ref=useRef(null);
  useEffect(()=>{if(!src)return;return obsImg(ref.current,()=>{if(ref.current)ref.current.src=src;});},[src]);
  if(!src)return null;
  return <img ref={ref} alt={alt||""} decoding="async" style={{...style,opacity:ok?1:0,transition:"opacity .3s"}} onLoad={()=>setOk(true)} onError={()=>setOk(true)}/>;
}

const CastCard=React.memo(function CastCard({person,onClick}){
  const filmCount=person.movies?.length||0;
  return (
    <div className="cc" onClick={onClick}>
      <div className="cc-box">
        <LImg src={person.photo} alt={person.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
        {!person.photo && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2.5rem"}}>👤</div>}
        <div className="cc-play"><div style={{width:34,height:34,borderRadius:"50%",background:"rgba(201,151,58,.9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".85rem"}}>▶</div></div>
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"4px 8px",background:"linear-gradient(to top,rgba(0,0,0,.8),transparent)",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <span style={{fontSize:".58rem",color:"rgba(255,255,255,.7)",fontWeight:600}}>{person.type||"Actor"}</span>
          {filmCount>0 && <span style={{fontSize:".58rem",color:"var(--gold)",fontWeight:700}}>{filmCount}🎬</span>}
        </div>
      </div>
      <div style={{padding:"7px 2px 0"}}>
        <p className="cc-name">{person.name}</p>
        <p style={{margin:"2px 0 0",fontSize:".64rem",color:"var(--gold)"}}>{person.type||"Actor"}</p>
      </div>
    </div>
  );
});

function CastRow({title,people,tag}){
  const navigate=useNavigate();
  const rowRef=useRef(null),sentRef=useRef(null);
  const [vis,setVis]=useState(false);
  useEffect(()=>{
    const el=sentRef.current;if(!el)return;
    const io=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVis(true);io.disconnect();}},{rootMargin:"200px"});
    io.observe(el);return()=>io.disconnect();
  },[]);
  const slide=n=>rowRef.current?.scrollBy({left:n,behavior:"smooth"});
  if(!people.length)return null;
  return (
    <div className="cast-row-wrap" ref={sentRef}>
      <div className="cast-row-header">
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
          <h2 className="cast-row-title">{title}</h2>
          {tag && <span className="home-tag" style={{flexShrink:0}}>{tag}</span>}
          <span style={{flexShrink:0,background:"rgba(201,151,58,.15)",color:"var(--gold)",fontSize:".65rem",fontWeight:700,padding:"2px 8px",borderRadius:10}}>{people.length}</span>
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button className="cast-arrow" onClick={()=>slide(-520)}>‹</button>
          <button className="cast-arrow" onClick={()=>slide(520)}>›</button>
        </div>
      </div>
      <div className="cast-hrow" ref={rowRef}>
        {vis
          ? people.map(p=><CastCard key={p._id} person={p} onClick={()=>navigate(castPath(p))}/>)
          : Array.from({length:6},(_,i)=><div key={i} style={{flexShrink:0,width:140,height:220,borderRadius:8,background:"var(--bg3)",animation:`cpulse 1.5s ease-in-out ${i*.1}s infinite`}}/>)
        }
      </div>
    </div>
  );
}

export default function Cast(){
  const navigate=useNavigate();
  const [cast,setCast]=useState(()=>{
    const c = Cache.peek("cast");
    return c ? [...c].sort((a,b)=>(b.movies?.length||0)-(a.movies?.length||0)) : [];
  });
  const [loading,setLoading]=useState(()=>Cache.peek("cast")===null);
  const [search,setSearch]=useState("");
  const [view,setView]=useState("trending");
  const [typeFilter,setTypeFilter]=useState("All");

  useEffect(()=>{
    if (Cache.peek("cast") !== null) return;
    Cache.getCast()
      .then(data=>setCast([...data].sort((a,b)=>(b.movies?.length||0)-(a.movies?.length||0))))
      .catch(console.error)
      .finally(()=>setLoading(false));
  },[]);

  const isFiltering=search||typeFilter!=="All";
  const types=useMemo(()=>["All",...Array.from(new Set(cast.map(c=>c.type).filter(Boolean))).sort()],[cast]);

  const filtered=useMemo(()=>cast.filter(c=>{
    const ms=!search||c.name?.toLowerCase().includes(search.toLowerCase());
    const mt=typeFilter==="All"||c.type===typeFilter;
    return ms&&mt;
  }),[cast,search,typeFilter]);

  const groups=useMemo(()=>({
    stars:     cast.filter(c=>c.type==="Actor"||c.type==="Actress"),
    directors: cast.filter(c=>c.type==="Director"),
    musicians: cast.filter(c=>["Music Director","Singer","Lyricist"].includes(c.type)),
    crew:      cast.filter(c=>["Producer","Cinematographer","Choreographer","Editor"].includes(c.type)),
    topStars:  cast.filter(c=>c.type==="Actor"||c.type==="Actress").slice(0,18),
    risingNew: cast.filter(c=>(c.movies?.length||0)===1).slice(0,18),
    veterans:  cast.filter(c=>(c.movies?.length||0)>=5).slice(0,18),
  }),[cast]);

  return (
    <div className="cast-root">
      <SEO {...staticSEO.cast}/>
      <style>{CSS}</style>

      <div className="cast-header">
        <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap"}}>
          <h1 className="cast-title">Cast & Crew</h1>
          {!loading && <span style={{fontSize:".8rem",color:"var(--muted)"}}>{cast.length} people</span>}
        </div>
        <div className="cast-tabs">
          <button className={`cast-tab${view==="trending"?" active":""}`} onClick={()=>setView("trending")}>🔥 Trending</button>
          <button className={`cast-tab${view==="all"?" active":""}`} onClick={()=>setView("all")}>👥 Browse All</button>
        </div>
      </div>

      {(view==="all"||isFiltering) && (
        <div className="cast-filters">
          <div style={{position:"relative",flex:1,minWidth:160,maxWidth:280}}>
            <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--muted)",fontSize:".8rem"}}>🔍</span>
            <input className="form-input" style={{paddingLeft:32,width:"100%",fontSize:".82rem"}} placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="form-select" style={{width:"auto",fontSize:".8rem"}} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            {types.map(t=><option key={t}>{t}</option>)}
          </select>
          {isFiltering && <>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setSearch("");setTypeFilter("All");}} style={{color:"var(--gold)",border:"1px solid rgba(201,151,58,.3)",borderRadius:4,fontSize:".76rem"}}>✕ Clear</button>
            <span style={{fontSize:".75rem",color:"var(--muted)",marginLeft:"auto"}}>{filtered.length} result{filtered.length!==1?"s":""}</span>
          </>}
        </div>
      )}

      {loading && (
        <div className="cast-sections">
          {[0,1,2].map(i=>(
            <div key={i} className="cast-row-wrap">
              <div className="cast-row-header"><div className="skeleton" style={{height:16,width:180}}/></div>
              <div className="cast-hrow">
                {Array.from({length:6},(_,j)=><div key={j} className="skeleton" style={{flexShrink:0,width:140,height:218,borderRadius:8}}/>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && view==="trending" && !isFiltering && (
        <div className="cast-sections">
          <CastRow title="⭐ Top Stars"         people={groups.topStars}  tag="Popular"/>
          <CastRow title="🎬 Directors"         people={groups.directors}/>
          <CastRow title="🏆 Veteran Artists"   people={groups.veterans}  tag="5+ Films"/>
          <CastRow title="🎵 Music & Songs"     people={groups.musicians}/>
          <CastRow title="🌟 Rising Talents"    people={groups.risingNew} tag="New"/>
          <CastRow title="🎥 Crew & Production" people={groups.crew}/>
          {groups.stars.length>18 && <CastRow title="👥 All Actors & Actresses" people={groups.stars}/>}
          {cast.length===0 && <div style={{textAlign:"center",padding:"60px 24px",color:"var(--muted)"}}><div style={{fontSize:"2.5rem",marginBottom:10}}>👤</div><p>No cast members yet.</p></div>}
        </div>
      )}

      {!loading && (view==="all"||isFiltering) && (
        <div className="cast-sections">
          {filtered.length===0
            ? <div style={{textAlign:"center",padding:"60px 24px",color:"var(--muted)"}}><div style={{fontSize:"2.5rem",marginBottom:10}}>👤</div><p>No results found.</p><button className="btn btn-outline btn-sm" style={{marginTop:14}} onClick={()=>{setSearch("");setTypeFilter("All");}}>Clear Filters</button></div>
            : search
              ? <div style={{padding:"4px 0 24px"}}>
                  <div className="cast-row-header"><h2 className="cast-row-title">Results</h2><span style={{fontSize:".78rem",color:"var(--muted)"}}>{filtered.length} people</span></div>
                  <div className="cast-grid">{filtered.map(p=><CastCard key={p._id} person={p} onClick={()=>navigate(castPath(p))}/>)}</div>
                </div>
              : types.filter(t=>t!=="All").map(t=>{const g=filtered.filter(c=>c.type===t);return g.length?<CastRow key={t} title={t+"s"} people={g}/>:null;})
          }
        </div>
      )}
    </div>
  );
}