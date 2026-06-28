// ─────────────────────────────────────────────────────────────────
//  SEO.jsx  —  src/components/SEO.jsx
//  Full SEO component with dynamic keyword patterns for Ollypedia.
//  Requires: npm install react-helmet-async
//  Wrap <App> with <HelmetProvider> once in App.jsx (already done).
// ─────────────────────────────────────────────────────────────────

import React from "react";
import { Helmet } from "react-helmet-async";

const SITE_URL   = import.meta.env.VITE_SITE_URL || "https://www.ollypedia.in";
const SITE_NAME  = "Ollypedia";
const DEFAULT_IMG = `${SITE_URL}/og-default.jpg`;

const truncate = (str = "", n = 155) =>
  str.length > n ? str.slice(0, n - 1) + "…" : str;

const slugify = (text = "") =>
  String(text).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").trim();

// ─────────────────────────────────────────────────────────────────
// Core <SEO> component
// ─────────────────────────────────────────────────────────────────
export default function SEO({
  title,
  description,
  keywords,
  canonical,
  ogType      = "website",
  ogImage     = DEFAULT_IMG,
  ogImageAlt,
  twitterCard = "summary_large_image",
  noindex     = false,
  structuredData,
  children,
}) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} – Odia Movie Database | Ollywood Films, Cast & Songs`;

  const desc = description ||
    "Explore the complete Odia (Ollywood) movie database. Find latest Odia films, actors, trailers, songs and news.";

  const kw = keywords ||
    "odia movies, odia film database, ollywood movies, odia actors, odia cinema, odia songs";

  const canonicalUrl = canonical
    ? (canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`)
    : (typeof window !== "undefined" ? window.location.href : SITE_URL);

  return (
    <Helmet>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description"  content={desc} />
      <meta name="keywords"     content={kw} />
      <meta name="author"       content={SITE_NAME} />
      <meta name="robots"       content={noindex ? "noindex,nofollow" : "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"} />
      <link rel="canonical"     href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type"          content={ogType} />
      <meta property="og:title"         content={fullTitle} />
      <meta property="og:description"   content={desc} />
      <meta property="og:image"         content={ogImage} />
      <meta property="og:image:alt"     content={ogImageAlt || fullTitle} />
      <meta property="og:image:width"   content="1200" />
      <meta property="og:image:height"  content="630" />
      <meta property="og:url"           content={canonicalUrl} />
      <meta property="og:site_name"     content={SITE_NAME} />
      <meta property="og:locale"        content="en_IN" />

      {/* Twitter */}
      <meta name="twitter:card"         content={twitterCard} />
      <meta name="twitter:title"        content={fullTitle} />
      <meta name="twitter:description"  content={desc} />
      <meta name="twitter:image"        content={ogImage} />
      <meta name="twitter:image:alt"    content={ogImageAlt || fullTitle} />

      {/* Mobile */}
      <meta name="theme-color"          content="#c9973a" />
      <meta name="mobile-web-app-capable"            content="yes" />
      <meta name="apple-mobile-web-app-capable"      content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

      {/* JSON-LD */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}

      {children}
    </Helmet>
  );
}

// ─────────────────────────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────────────────────────
export function homeSEO() {
  return {
    title: "Odia Movie Database – Latest Odia Films, Cast, Songs & News",
    description:
      "Ollypedia is the #1 Odia (Ollywood) movie database. Discover latest Odia films 2025, actors, directors, trailers, songs and box office results.",
    keywords:
      "odia movies, odia movies 2025,odia movies 2026,odia movies 2027, ollywood movies, odia film database, odia actors list, " +
      "odia songs, odia movie trailers, latest odia movie, recent odia movie, new odia movie 2025, " +
      "odia cinema, odia film news, ollywood 2025, odia movie cast, ollypedia, odia full movie",
    canonical: SITE_URL,
    ogType: "website",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": SITE_NAME,
      "url": SITE_URL,
      "description": "Complete Odia (Ollywood) movie database.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${SITE_URL}/movies?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// MOVIE DETAIL — full keyword pattern set
// ─────────────────────────────────────────────────────────────────
export function movieSEO(movie) {
  if (!movie) return {};

  const year   = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const title  = movie.title || "";
  const genre  = movie.genre?.[0] || "Odia";
  const lang   = movie.language || "Odia";
  const slug   = movie.slug || slugify(title) + (year ? `-${year}` : "");
  const img    = movie.posterUrl || movie.thumbnailUrl || DEFAULT_IMG;
  const cast   = (movie.cast || []).slice(0, 4).map(c => c.name).filter(Boolean).join(", ");

  const desc = movie.synopsis
    ? truncate(movie.synopsis)
    : truncate(
        `${title}${year ? ` (${year})` : ""} is an ${lang} ${genre.toLowerCase()} film` +
        `${movie.director ? ` directed by ${movie.director}` : ""}` +
        `${cast ? `. Cast: ${cast}` : ""}` +
        `${movie.verdict && movie.verdict !== "Upcoming" ? `. Verdict: ${movie.verdict}` : ""}.` +
        ` Watch trailer, songs and full details on Ollypedia.`
      );

  // Dynamic keyword pattern — exactly as requested
  const keywords = [
    title,
    `${title} odia movie`,
    `${title} cast`,
    `${title} trailer`,
    `${title} release date`,
    `${title} full movie`,
    `${title} songs`,
    `${title} review`,
    `${title} box office`,
    year ? `odia movie ${year}` : null,
    year ? `ollywood movie ${year}` : null,
    "latest odia movie",
    "ollywood movie",
    `${genre} odia film`,
    movie.director ? `${movie.director} movie` : null,
  ].filter(Boolean).join(", ");

  const url = `${SITE_URL}/movie/${slug}`;

  return {
    title: `${title}${year ? ` (${year})` : ""} Odia Movie – Cast, Songs, Trailer & Review`,
    description: desc,
    keywords,
    canonical: url,
    ogType: "video.movie",
    ogImage: img,
    ogImageAlt: `${title} odia movie poster`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Movie",
      "name": title,
      "description": desc,
      "image": img,
      "datePublished": movie.releaseDate,
      "duration": movie.runtime,
      "director": movie.director ? { "@type": "Person", "name": movie.director } : undefined,
      "producer": movie.producer ? { "@type": "Person", "name": movie.producer } : undefined,
      "contentRating": movie.contentRating,
      "genre": movie.genre,
      "inLanguage": lang,
      "url": url,
      "aggregateRating": movie.reviews?.length ? {
        "@type": "AggregateRating",
        "ratingValue": (movie.reviews.reduce((s, r) => s + (r.rating || 0), 0) / movie.reviews.length).toFixed(1),
        "reviewCount": movie.reviews.length,
        "bestRating": "5",
        "worstRating": "1",
      } : undefined,
      "trailer": movie.media?.trailer?.ytId ? {
        "@type": "VideoObject",
        "name": `${title} Official Trailer`,
        "description": `Watch the official trailer of ${title} on Ollypedia`,
        "thumbnailUrl": `https://img.youtube.com/vi/${movie.media.trailer.ytId}/hqdefault.jpg`,
        "embedUrl": `https://www.youtube.com/embed/${movie.media.trailer.ytId}`,
      } : undefined,
      "actor": (movie.cast || []).slice(0, 8).map(c => ({
        "@type": "Person", "name": c.name,
      })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// CAST / PERSON PAGE
// ─────────────────────────────────────────────────────────────────
export function castSEO(person) {
  if (!person) return {};

  const movies    = person.moviesList || [];
  const role      = person.type || "Actor";
  const filmCount = movies.length;
  const hits      = movies.filter(m => ["Hit", "Super Hit", "Blockbuster"].includes(m.verdict)).length;
  const img       = person.photo || DEFAULT_IMG;
  const nameSlug  = slugify(person.name || "");
  const url       = `${SITE_URL}/cast/${nameSlug}`;

  const desc = person.bio
    ? truncate(person.bio)
    : truncate(
        `${person.name} is an Odia ${role.toLowerCase()} with ${filmCount} film${filmCount !== 1 ? "s" : ""}` +
        `${hits ? ` and ${hits} hit${hits !== 1 ? "s" : ""}` : ""} in Ollywood. ` +
        `See full filmography, photos and biography on Ollypedia.`
      );

  return {
    title: `${person.name} – Odia ${role} | Movies, Biography & Photos`,
    description: desc,
    keywords: [
      person.name,
      `${person.name} odia ${role.toLowerCase()}`,
      `${person.name} movies`,
      `${person.name} biography`,
      `${person.name} age`,
      `${person.name} photos`,
      `odia ${role.toLowerCase()}`,
      `ollywood ${role.toLowerCase()}`,
      "odia film cast",
    ].filter(Boolean).join(", "),
    canonical: url,
    ogType: "profile",
    ogImage: img,
    ogImageAlt: `${person.name} – Odia ${role}`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Person",
      "name": person.name,
      "image": img,
      "description": desc,
      "jobTitle": role,
      "nationality": { "@type": "Country", "name": "India" },
      "url": url,
      "sameAs": [
        person.instagram ? `https://instagram.com/${person.instagram.replace("@", "")}` : null,
        person.website || null,
      ].filter(Boolean),
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// SONG DETAIL PAGE
// ─────────────────────────────────────────────────────────────────
export function songDetailSEO(song, movie) {
  if (!song) return {};

  const movieTitle = movie?.title || "";
  const year       = movie?.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const movieSlug  = movie?.slug || slugify(movieTitle) + (year ? `-${year}` : "");
  const idx        = song.songIndex ?? 0;
  const songSlug   = song.title ? `/${slugify(song.title)}-odia-song` : "";
  const url        = `${SITE_URL}/song/${movieSlug}/${idx}${songSlug}`;
  const img        = song.thumbnailUrl ||
    (song.ytId ? `https://img.youtube.com/vi/${song.ytId}/hqdefault.jpg` : null) ||
    movie?.posterUrl || DEFAULT_IMG;

  const desc = truncate(
    `Listen to "${song.title}"` +
    (song.singer       ? ` sung by ${song.singer}`               : "") +
    (song.musicDirector? `, music by ${song.musicDirector}`       : "") +
    (song.lyricist     ? `, lyrics by ${song.lyricist}`           : "") +
    (movieTitle        ? ` from the Odia movie ${movieTitle}` : "") +
    `. Watch video and full details on Ollypedia.`
  );

  return {
    title: `${song.title}${song.singer ? ` – ${song.singer}` : ""}${movieTitle ? ` | ${movieTitle}` : ""} Odia Song`,
    description: desc,
    keywords: [
      song.title,
      `${song.title} odia song`,
      `${song.title} lyrics`,
      `${song.title} video`,
      song.singer       ? `${song.singer} song`        : null,
      song.singer       ? `${song.singer} songs`        : null,
      song.singer       ? `${song.singer} all song`        : null,
      song.singer       ? `${song.singer} odia song`   : null,
      song.musicDirector? `${song.musicDirector} music`: null,
      movieTitle        ? `${movieTitle} songs`         : null,
      movieTitle        ? `${movieTitle} all songs`     : null,
      year              ? `odia songs ${year}`          : null,
      "odia movie songs",
      "ollywood songs",
    ].filter(Boolean).join(", "),
    canonical: url,
    ogType: "music.song",
    ogImage: img,
    ogImageAlt: `${song.title} – Odia Song`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      "name": song.title,
      "byArtist": song.singer ? { "@type": "MusicGroup", "name": song.singer } : undefined,
      "inAlbum": movieTitle ? { "@type": "Movie", "name": movieTitle } : undefined,
      "url": url,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// STATIC PAGE SEO CONFIGS
// ─────────────────────────────────────────────────────────────────
export const staticSEO = {
  movies: {
    title: "All Odia Movies – Ollywood Films Database 2025",
    description:
      "Browse the complete list of Odia (Ollywood) movies. Filter by genre, year and verdict. Find latest, hit and upcoming Odia films all in one place.",
    keywords:
      "odia movies list, odia films 2025, ollywood movies database, all odia movies, " +
      "latest odia movie, new odia movie 2025, odia full movie, hit odia movies, upcoming odia movies",
    canonical: `${SITE_URL}/movies`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Odia Movies Database",
      "description": "Complete list of Odia (Ollywood) films.",
      "url": `${SITE_URL}/movies`,
    },
  },

  cast: {
    title: "Odia Actors & Actresses – Ollywood Cast & Crew Database",
    description:
      "Discover all Odia actors, actresses, directors, music directors and crew. Complete Ollywood cast database with photos, bios and filmographies.",
    keywords:
      "odia actors, odia actresses, ollywood actors, odia directors, odia film cast, " +
      "odia celebrities, ollywood stars, odia actor name list, odia actress list",
    canonical: `${SITE_URL}/cast`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Odia Film Cast & Crew",
      "description": "Complete Ollywood cast and crew database.",
      "url": `${SITE_URL}/cast`,
    },
  },

  songs: {
    title: "Odia Songs – Latest Ollywood Movie Songs 2025",
    description:
      "Listen to the latest Odia movie songs online. Browse Ollywood music with videos, singers, music directors and lyrics from all Odia films.",
    keywords:
      "odia songs, odia movie songs, ollywood songs 2025, odia film music, " +
      "odia song video, odia gana, new odia song, latest odia song 2025, odia mp3",
    canonical: `${SITE_URL}/songs`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Odia Movie Songs",
      "description": "Latest Odia (Ollywood) movie songs and music.",
      "url": `${SITE_URL}/songs`,
    },
  },

  news: {
    title: "Odia Film News – Latest Ollywood Updates 2025",
    description:
      "Stay updated with the latest Odia film news. Ollywood movie releases, trailers, awards, interviews and entertainment updates.",
    keywords:
      "odia film news, ollywood news, odia entertainment news, odia movie updates, " +
      "ollywood latest news, odia cinema news 2025, odia movie release",
    canonical: `${SITE_URL}/news`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Odia Film News",
      "description": "Latest Odia (Ollywood) film news and updates.",
      "url": `${SITE_URL}/news`,
    },
  },

  about: {
    title: "About Ollypedia – Odia Movie Database | Our Story & Mission",
    description:
      "Learn about Ollypedia, the #1 Odia cinema encyclopedia. Our mission is to document and celebrate Odia (Ollywood) films, artists and culture.",
    keywords:
      "about ollypedia, odia movie database, ollywood encyclopedia, odia cinema database",
    canonical: `${SITE_URL}/about`,
  },

  privacy: {
    title: "Privacy Policy – Ollypedia",
    description: "Ollypedia privacy policy. How we collect, use and protect your data.",
    canonical: `${SITE_URL}/privacy`,
    noindex: false,
  },

  contact: {
    title: "Contact Ollypedia – Report Errors & Contribute Data",
    description:
      "Contact Ollypedia to report incorrect data, suggest new movies, or contribute to the Odia film database.",
    keywords:
      "contact ollypedia, odia movie database contact, ollywood database feedback",
    canonical: `${SITE_URL}/contact`,
  },
};