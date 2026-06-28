/**
 * SEO.jsx — src/components/SEO.jsx
 * Requires: npm install react-helmet-async
 * Wrap app in <HelmetProvider> in main.jsx (already done if you follow setup)
 */
import { Helmet } from "react-helmet-async";

const SITE      = "Ollipedia";
const SITE_URL  = import.meta.env.VITE_SITE_URL || "https://ollypedia.in";
const SITE_DESC = "Ollipedia — The complete Odia film encyclopedia. Movies, cast, songs, trailers and more.";
const SITE_IMG  = `${SITE_URL}/og-default.jpg`;

export default function SEO({
  title, description = SITE_DESC, image = SITE_IMG,
  url, type = "website", publishDate, keywords, noIndex = false,
}) {
  const full = title ? `${title} | ${SITE}` : SITE;
  const canon = url ? `${SITE_URL}${url}` : undefined;
  return (
    <Helmet>
      <title>{full}</title>
      <meta name="description"     content={description.slice(0,160)} />
      {keywords  && <meta name="keywords"  content={keywords} />}
      {noIndex   && <meta name="robots"    content="noindex,nofollow" />}
      {canon     && <link rel="canonical"  href={canon} />}
      <meta property="og:type"        content={type} />
      <meta property="og:title"       content={full} />
      <meta property="og:description" content={description.slice(0,200)} />
      <meta property="og:image"       content={image} />
      {canon     && <meta property="og:url" content={canon} />}
      <meta property="og:site_name"   content={SITE} />
      <meta property="og:locale"      content="en_IN" />
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:title"       content={full} />
      <meta name="twitter:description" content={description.slice(0,200)} />
      <meta name="twitter:image"       content={image} />
      {publishDate && <meta property="article:published_time" content={publishDate} />}
    </Helmet>
  );
}

// ── SEO helpers for each page type ────────────────────────────────
const trunc = (s="",n=160) => s.length>n ? s.slice(0,n-1)+"…" : s;
const ytHQ  = id => id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null;

export const homeSEO = () => ({
  description: "The complete Odia film encyclopedia — movies, cast, songs, trailers, box office and more.",
  url: "/",
  keywords: "Odia film, Ollywood, Odia cinema, Odia movies, Odia actors, Odia songs",
});

export const movieSEO = (movie) => {
  if (!movie) return {};
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const desc = movie.synopsis
    ? trunc(movie.synopsis)
    : `${movie.title}${year?" ("+year+")":""}. ${movie.language||"Odia"} ${movie.category||"film"}.${movie.director?" Dir. "+movie.director+".":""}${movie.verdict&&movie.verdict!=="Upcoming"?" "+movie.verdict+".":""}`;
  return {
    title:       `${movie.title}${year?" ("+year+")":""}`,
    description: desc,
    image:       movie.posterUrl || movie.thumbnailUrl || ytHQ(movie.media?.trailer?.ytId) || undefined,
    url:         `/movie/${movie._id}`,
    type:        "article",
    publishDate: movie.releaseDate || undefined,
    keywords:    [movie.title, movie.language||"Odia", movie.director, movie.genre?.join(", "), "film","Ollywood"].filter(Boolean).join(", "),
  };
};

export const castSEO = (person) => {
  if (!person) return {};
  const count = person.moviesList?.length || 0;
  return {
    title:       `${person.name} — ${person.type||"Actor"}`,
    description: person.bio ? trunc(person.bio) : `${person.name} — ${person.type||"Actor"} in Odia cinema.${count?" "+count+" films.":""}`,
    image:       person.photo || undefined,
    url:         `/cast/${person._id}`,
    keywords:    `${person.name}, ${person.type||"Actor"}, Odia film, Ollywood`,
  };
};

export const songDetailSEO = (song, movie) => {
  if (!song) return {};
  const desc = [`"${song.title}"`, movie?.title?"from "+movie.title:null, song.singer?"sung by "+song.singer:null, song.musicDirector?"music by "+song.musicDirector:null].filter(Boolean).join(", ")+".";
  return {
    title:       [song.title, movie?.title, song.singer].filter(Boolean).join(" — "),
    description: trunc(desc),
    image:       song.thumbnailUrl || (song.ytId?ytHQ(song.ytId):null) || movie?.posterUrl || undefined,
    url:         `/song/${movie?._id}/${song.songIndex??""}`,
    keywords:    `${song.title}, ${song.singer||""}, Odia song, Ollywood`,
  };
};

export const newsItemSEO = (item) => {
  if (!item) return {};
  return {
    title:       item.title,
    description: trunc(item.content||item.title),
    image:       item.imageUrl || undefined,
    url:         `/news/${item._id}`,
    type:        "article",
    publishDate: item.createdAt,
    keywords:    `${item.category||"news"}, Odia cinema, Ollywood`,
  };
};

export const staticSEO = {
  movies:  { title:"Films",       description:"Browse all Odia films — filter by year, genre and verdict.", url:"/movies", keywords:"Odia films, Ollywood movies" },
  cast:    { title:"Cast & Crew", description:"Explore Odia film actors, directors, music directors and crew.", url:"/cast", keywords:"Odia actors, Odia directors, Ollywood cast" },
  songs:   { title:"Songs",       description:"Browse all Odia film songs — singers, music directors, lyricists.", url:"/songs", keywords:"Odia songs, Ollywood music" },
  news:    { title:"News",        description:"Latest news and updates from Odia cinema and Ollywood.", url:"/news", keywords:"Odia film news, Ollywood news" },
};