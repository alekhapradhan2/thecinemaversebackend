const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// ── Dual token management ──
let _prodToken = (() => { try { return localStorage.getItem("op_token"); } catch { return null; } })();
let _castToken = (() => { try { return localStorage.getItem("cm_token"); } catch { return null; } })();

export const setToken     = (t) => { _prodToken = t; try { t ? localStorage.setItem("op_token", t) : localStorage.removeItem("op_token"); } catch {} };
export const getToken     = () => _prodToken;
export const setCastToken = (t) => { _castToken = t; try { t ? localStorage.setItem("cm_token", t) : localStorage.removeItem("cm_token"); } catch {} };
export const getCastToken = () => _castToken;

// ── Helpers ──
const json = (res) => {
  if (!res.ok) return res.json().then(d => Promise.reject(d.error || "Request failed"));
  return res.json();
};
const get   = (path)              => fetch(`${BASE}${path}`).then(json);
const post  = (path, body, token) => fetch(`${BASE}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then(json);
const patch = (path, body, token) => fetch(`${BASE}${path}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || _prodToken}` },
  body: JSON.stringify(body),
}).then(json);
const del   = (path, token)       => fetch(`${BASE}${path}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${token || _prodToken}` },
}).then(json);

export const API = {
  // ── Production Auth ──
  register:  (body)      => post("/auth/register", body),
  login:     (email, pw) => post("/auth/login", { email, password: pw }),

  // ── Cast Member Auth ──
  castRegister: (body)      => post("/cast-auth/register", body),
  castLogin:    (email, pw) => post("/cast-auth/login", { email, password: pw }),
  castGetMe:    ()          => fetch(`${BASE}/cast-auth/me`, { headers: { Authorization: `Bearer ${_castToken}` } }).then(json),
  castUpdateMe: (body)      => patch("/cast-auth/me", body, _castToken),

  // ── Productions ──
  getProductions:      ()     => get("/productions"),
  getProduction:       (id)   => get(`/productions/${id}`),
  searchProductions:   (q)    => get(`/productions/search/${encodeURIComponent(q)}`),
  getProductionMovies: (id)   => get(`/productions/${id}/movies`),
  updateProfile:       (body) => patch("/productions/me", body, _prodToken),

  // ── Movies (public) ──
  getMovies:   ()         => get("/movies"),
  getMovie:    (id)       => get(`/movies/${id}`),
  getNews:     ()         => get("/news"),
  getNewsItem: (id)       => get(`/news/${id}`),
  getSongs:    ()         => get("/songs"),
  postReview:  (id, body) => post(`/movies/${id}/reviews`, body),

  // ── Cast (public) ──
  getCast:       ()  => get("/cast"),
  searchCast:    (q) => get(`/cast/search/${encodeURIComponent(q)}`),
  getCastMember: (id)=> get(`/cast/${id}`),

  // ── Movie management (production protected) ──
  createMovie:     (body)     => post("/movies", body, _prodToken),
  updateMovie:     (id, body) => patch(`/movies/${id}`, body, _prodToken),
  updateBoxOffice: (id, body) => patch(`/movies/${id}/boxoffice`, body, _prodToken),

  addCastToMovie:      (id, castData) => post(`/movies/${id}/cast`, castData, _prodToken),
  removeCastFromMovie: (id, castId)   => del(`/movies/${id}/cast/${castId}`, _prodToken),
  addSong:             (id, song)     => post(`/movies/${id}/songs`, song, _prodToken),
  removeSong:          (id, index)    => del(`/movies/${id}/songs/${index}`, _prodToken),
  updateTrailer:       (id, data)     => patch(`/movies/${id}/trailer`, data, _prodToken),
  addCollaborator:     (id, pid)      => post(`/movies/${id}/collaborators`, { productionId: pid }, _prodToken),

  addNews:    (id, body)  => post(`/movies/${id}/news`, body, _prodToken),
  editNews:   (nid, body) => patch(`/news/${nid}`, body, _prodToken),
  deleteNews: (nid)       => del(`/news/${nid}`, _prodToken),
};