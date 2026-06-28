// ─────────────────────────────────────────────────────────────────
//  src/utils/slugs.js
//  Clean SEO-friendly URL helpers for Ollipedia
//
//  URLs produced:
//    /movie/bindusagar-2026          ← movie page
//    /cast/babushaan-mohanty         ← cast profile
//    /song/bindusagar-2026/0/silpita ← song detail
// ─────────────────────────────────────────────────────────────────

// ── Is a string a 24-hex MongoDB ObjectId? ────────────────────
export const isOid = (s) =>
  typeof s === "string" && /^[a-f0-9]{24}$/i.test(s.trim());

// ── Generic text → URL slug ───────────────────────────────────
export function slugify(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// ─────────────────────────────────────────────────────────────────
// MOVIE
// Produces:  /movie/bindusagar-2026
//            /movie/sital-2025-2  (if duplicate slug)
// ─────────────────────────────────────────────────────────────────
export function moviePath(movie) {
  if (!movie) return "/movies";
  // Prefer server-generated slug stored on the movie object
  if (movie.slug) return `/movie/${movie.slug}`;
  // Fallback: derive from title + year (matches server makeMovieSlug)
  const year  = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const base  = slugify(movie.title || "movie");
  const slug  = year ? `${base}-${year}` : base;
  return `/movie/${slug}`;
}

// Extract an ID or slug from a URL param for use in API calls.
// Handles all formats that may appear in the wild:
//   "bindusagar-2026"                      → slug  (new)
//   "69b248e88d73808b70a105af"             → ObjectId (old)
//   "bindusagar-2026-69b248e88d73808b70a105af"  → strip ID, return slug
export function extractMovieParam(param = "") {
  if (!param) return "";
  // If the full string is a valid ObjectId, pass it straight through
  if (isOid(param)) return param;
  // If it ends with a 24-hex ObjectId, strip it → clean slug
  return param.replace(/-[a-f0-9]{24}$/i, "");
}

// Alias used by existing pages (MovieDetails uses `extractId`)
export const extractId = extractMovieParam;

// ─────────────────────────────────────────────────────────────────
// CAST
// Produces:  /cast/babushaan-mohanty
//            /cast/69b248e88d73808b70a105af  (fallback when no name)
// ─────────────────────────────────────────────────────────────────
export function castPath(person) {
  if (!person) return "/cast";
  const id   = person._id ? String(person._id) : "";
  const name = slugify(person.name || "");
  // Use name-based slug when available, fall back to bare ID
  if (name) return `/cast/${id}/${name}`;
  return `/cast/${id}`;
}

// Extract cast ID from slug param — the ID is always the first segment
// Route is /cast/:id/:nameSlug  so :id is the raw ObjectId
export function extractCastId(param = "") {
  return param; // already just the ID from :id segment
}

// ─────────────────────────────────────────────────────────────────
// SONG
// Produces:  /song/bindusagar-2026/3/silpita-odia-song
// ─────────────────────────────────────────────────────────────────
export function songPath(movie, songIndex, song) {
  const movieSlug = movie?.slug || (() => {
    const year = movie?.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
    const base = slugify(movie?.title || "movie");
    return year ? `${base}-${year}` : base;
  })();
  const idx      = songIndex ?? 0;
  const songSlug = song?.title ? `-${slugify(song.title)}` : "";
  return `/song/${movieSlug}/${idx}${songSlug}`;
}

// For SongDetail: extract movieParam and songIndex from URL params
export function extractSongParams(movieParam, songIndexParam) {
  return {
    movieParam: extractMovieParam(movieParam || ""),
    songIndex:  parseInt(songIndexParam, 10) || 0,
  };
}