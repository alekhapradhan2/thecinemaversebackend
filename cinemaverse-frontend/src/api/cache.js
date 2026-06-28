// ─────────────────────────────────────────────────────────────────
//  src/api/cache.js
//  Module-level cache — lives for the entire browser session.
//  All pages share this single instance — fetch once, reuse everywhere.
//  No re-fetch on back-navigation, no prop drilling.
// ─────────────────────────────────────────────────────────────────
import { API } from "./api";

const TTL = 5 * 60 * 1000; // 5 minutes before re-fetch

const store = {
  movies:  { data: null, ts: 0, promise: null },
  cast:    { data: null, ts: 0, promise: null },
  news:    { data: null, ts: 0, promise: null },
  songs:   { data: null, ts: 0, promise: null },
};

// Generic fetcher — deduplicates in-flight requests too
function fetchOnce(key, apiFn) {
  const entry = store[key];
  const now   = Date.now();

  // Cache hit — data is fresh
  if (entry.data !== null && (now - entry.ts) < TTL) {
    return Promise.resolve(entry.data);
  }

  // In-flight — reuse the same promise (deduplicates parallel calls)
  if (entry.promise) return entry.promise;

  // Cache miss — fetch
  entry.promise = apiFn()
    .then(data => {
      entry.data    = data;
      entry.ts      = Date.now();
      entry.promise = null;
      return data;
    })
    .catch(err => {
      entry.promise = null; // allow retry on next call
      throw err;
    });

  return entry.promise;
}

// ── Public API ────────────────────────────────────────────────────
export const Cache = {
  getMovies: ()  => fetchOnce("movies", API.getMovies),
  getCast:   ()  => fetchOnce("cast",   API.getCast),
  getNews:   ()  => fetchOnce("news",   () => API.getNews().then(n => n.slice(0, 40))),

  // Bust specific keys after a write operation
  bust: (key) => {
    if (store[key]) { store[key].data = null; store[key].ts = 0; }
  },
  bustAll: () => {
    Object.keys(store).forEach(k => { store[k].data = null; store[k].ts = 0; });
  },

  // Read cached data synchronously (returns null if not yet fetched)
  peek: (key) => store[key]?.data ?? null,
};
