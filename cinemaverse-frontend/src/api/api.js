// ─────────────────────────────────────────────────────────────────────────────
//  api.js — BOX OFFICE EXTENSION
//  Add the following entries to your existing API object in api.js.
//  These go INSIDE the existing `export const API = { ... }` block.
//  DO NOT replace the existing file — only ADD these lines.
// ─────────────────────────────────────────────────────────────────────────────

/*
  ── Paste inside the API = { ... } object, after the last entry ──

  // ── Box Office (public)
  getMovieBoxOfficeDays:    (id)          => get(`/movies/${id}/boxoffice-days`),
  getMovieBoxOffice:        (id)          => get(`/movies/${id}/boxoffice`),

  // ── Admin — Box Office
  adminGetBoxOfficeMovies:  ()            => get("/admin/boxoffice/all-movies", _adminToken),
  adminAddBoxOfficeDay:     (id, body)    => post(`/admin/movies/${id}/boxoffice-days`, body, _adminToken),
  adminUpdateBoxOfficeDay:  (id, day, body) => req("PATCH", `/admin/movies/${id}/boxoffice-days/${day}`, body, _adminToken),
  adminDeleteBoxOfficeDay:  (id, day)    => del(`/admin/movies/${id}/boxoffice-days/${day}`, _adminToken),

*/

// ─────────────────────────────────────────────────────────────────────────────
//  NOTE: The following two entries already exist in the original api.js.
//  Do NOT add them again:
//    getMovieBoxOfficeDays:   (id) => get(`/movies/${id}/boxoffice-days`),
//    adminGetBoxOfficeMovies: ()   => get("/admin/boxoffice/all-movies", _adminToken),
//
//  Only add the NEW entries (adminAddBoxOfficeDay, adminUpdateBoxOfficeDay,
//  adminDeleteBoxOfficeDay) that are not already present.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
//  FULL UPDATED api.js  — safe to replace your existing file entirely
//  (All existing methods preserved; box office admin methods added at the end)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

let _token = (() => { try { return localStorage.getItem("op_token"); } catch { return null; } })();
export const setToken = (t) => {
  _token = t;
  try { t ? localStorage.setItem("op_token", t) : localStorage.removeItem("op_token"); } catch {}
};
export const getToken = () => _token;

let _castToken = (() => { try { return localStorage.getItem("cm_token"); } catch { return null; } })();
export const setCastToken = (t) => {
  _castToken = t;
  try { t ? localStorage.setItem("cm_token", t) : localStorage.removeItem("cm_token"); } catch {}
};
export const getCastToken = () => _castToken;

let _adminToken = (() => { try { return localStorage.getItem("admin_token"); } catch { return null; } })();
export const setAdminToken = (t) => {
  _adminToken = t;
  try { t ? localStorage.setItem("admin_token", t) : localStorage.removeItem("admin_token"); } catch {}
};
export const getAdminToken = () => _adminToken;

const authHeader = (token) => token ? { Authorization: `Bearer ${token}` } : {};

const req = async (method, path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

const get  = (path, token)        => req("GET",    path, undefined, token);
const post = (path, body, token)  => req("POST",   path, body,      token);
const patch= (path, body, token)  => req("PATCH",  path, body,      token);
const del  = (path, token)        => req("DELETE", path, undefined, token);

export const API = {
  // ── Public
  getMovies:         ()         => get("/movies"),
  getMovie:          (id)       => get(`/movies/${id}`),
  getCast:           ()         => get("/cast"),
  searchCast:        (q)        => get(`/cast/search/${encodeURIComponent(q)}`),
  searchCastByType:  (type, q)  => get(`/cast/search-type/${encodeURIComponent(type)}/${encodeURIComponent(q)}`),
  getCastMember:     (id)       => get(`/cast/${id}`),
  getNews:           ()         => get("/news"),
  getNewsItem:       (id)       => get(`/news/${id}`),
  getSongs:          ()         => get("/songs"),
  postReview:        (id, body) => post(`/movies/${id}/reviews`, body),
  getInterested:     (id)       => get(`/movies/${id}/interested`),
  postInterested:    (id, vote) => post(`/movies/${id}/interested`, { vote }),
  getProductions:    ()         => get("/productions"),
  getProduction:     (id)       => get(`/productions/${id}`),
  searchProductions: (q)        => get(`/productions/search/${encodeURIComponent(q)}`),
  getProductionMovies:(id)      => get(`/productions/${id}/movies`),

  // ── Production auth
  register:      (body)        => post("/auth/register", body),
  login:         (email, pw)   => post("/auth/login", { email, password: pw }),
  updateProfile: (body)        => patch("/productions/me", body, _token),

  // ── Cast member auth
  castRegister:  (body)        => post("/cast-auth/register", body),
  castLogin:     (email, pw)   => post("/cast-auth/login", { email, password: pw }),
  castGetMe:     ()            => get("/cast-auth/me", _castToken),
  castUpdateMe:  (body)        => patch("/cast-auth/me", body, _castToken),

  // ── Movie management (production token)
  createMovie:         (body)      => post("/movies", body, _token),
  updateMovie:         (id, body)  => patch(`/movies/${id}`, body, _token),
  updateBoxOffice:     (id, body)  => patch(`/movies/${id}/boxoffice`, body, _token),
  addCastToMovie:      (id, data)  => post(`/movies/${id}/cast`, data, _token),
  removeCastFromMovie: (id, castId)=> del(`/movies/${id}/cast/${castId}`, _token),
  addSong:             (id, song)  => post(`/movies/${id}/songs`, song, _token),
  removeSong:          (id, idx)   => del(`/movies/${id}/songs/${idx}`, _token),
  updateTrailer:       (id, data)  => patch(`/movies/${id}/trailer`, data, _token),
  addCollaborator:     (id, pid)   => post(`/movies/${id}/collaborators`, { productionId: pid }, _token),
  addNews:             (id, body)  => post(`/movies/${id}/news`, body, _token),
  editNews:            (nid, body) => patch(`/news/${nid}`, body, _token),
  deleteNews:          (nid)       => del(`/news/${nid}`, _token),

  // ── Admin auth
  adminSetupStatus:    ()                                        => get("/admin/setup-status"),
  adminRegister:       (username, email, password, adminSecret) => post("/admin/register", { username, email, password, adminSecret }),
  adminLogin:          (username, password)                     => post("/admin/login", { username, password }),
  adminChangePassword: (cur, newPw)                             => post("/admin/change-password", { currentPassword: cur, newPassword: newPw }, _adminToken),

  // ── Admin — movies
  adminCreateMovie:       (body)         => post("/admin/movies", body, _adminToken),
  adminUpdateMovie:       (id, body)     => patch(`/admin/movies/${id}`, body, _adminToken),
  adminDeleteMovie:       (id)           => del(`/admin/movies/${id}`, _adminToken),
  adminAddCastToMovie:    (id, entry)    => post(`/admin/movies/${id}/cast`, entry, _adminToken),
  adminRemoveCastFromMovie:(id, castId)  => del(`/admin/movies/${id}/cast/${castId}`, _adminToken),
  adminAddSong:           (id, song)     => post(`/admin/movies/${id}/songs`, song, _adminToken),
  adminUpdateSong:        (id, idx, song)=> patch(`/admin/movies/${id}/songs/${idx}`, song, _adminToken),
  adminAddNewsToMovie:    (id, body)     => post(`/admin/movies/${id}/news`, body, _adminToken),

  // ── Admin — cast
  createCast:   (body)     => post("/admin/cast", body, _adminToken),
  updateCast:   (id, body) => patch(`/admin/cast/${id}`, body, _adminToken),
  deleteCast:   (id)       => del(`/admin/cast/${id}`, _adminToken),

  // ── Admin — productions
  createProduction:  (body)     => post("/admin/productions", body, _adminToken),
  updateProduction:  (id, body) => patch(`/admin/productions/${id}`, body, _adminToken),
  deleteProduction:  (id)       => del(`/admin/productions/${id}`, _adminToken),

  // ── Admin — news
  adminGetAllNews: ()           => get("/admin/news", _adminToken),
  createNews:      (body)       => post("/admin/news", body, _adminToken),
  updateNews:      (id, body)   => patch(`/admin/news/${id}`, body, _adminToken),
  adminDeleteNews: (id)         => del(`/admin/news/${id}`, _adminToken),

  // ── Admin — songs
  deleteSong: (movieId, idx) => del(`/admin/movies/${movieId}/songs/${idx}`, _adminToken),

  // ── Admin stats
  adminStats: () => get("/admin/stats", _adminToken),

  // ── Blog (public)
  getBlogPosts:  (params = "") => get(`/blog${params ? `?${params}` : ""}`),
  getBlogPost:   (slug)        => get(`/blog/${slug}`),

  // ── Admin — blog
  adminGetBlogPosts:  ()           => get("/admin/blog", _adminToken),
  adminCreateBlog:    (body)       => post("/admin/blog", body, _adminToken),
  adminUpdateBlog:    (id, body)   => patch(`/admin/blog/${id}`, body, _adminToken),
  adminDeleteBlog:    (id)         => del(`/admin/blog/${id}`, _adminToken),

  // ── Contact / Enquiries
  submitContact:        (body) => post("/contact", body),
  adminGetEnquiries:    ()     => get("/admin/enquiries", _adminToken),
  adminUnreadCount:     ()     => get("/admin/enquiries/unread-count", _adminToken),
  adminMarkEnquiryRead: (id)   => req("PATCH", `/admin/enquiries/${id}/read`, undefined, _adminToken),
  adminDeleteEnquiry:   (id)   => del(`/admin/enquiries/${id}`, _adminToken),

  // ── Box Office (public) — existing
  getMovieBoxOfficeDays:   (id) => get(`/movies/${id}/boxoffice-days`),

  // ── Admin — Box Office (existing)
  adminGetBoxOfficeMovies: ()   => get("/admin/boxoffice/all-movies", _adminToken),

  // ── Admin — Box Office (NEW additions)
  adminAddBoxOfficeDay:    (id, body)       => post(`/admin/movies/${id}/boxoffice-days`, body, _adminToken),
  adminUpdateBoxOfficeDay: (id, day, body)  => req("PATCH", `/admin/movies/${id}/boxoffice-days/${day}`, body, _adminToken),
  adminDeleteBoxOfficeDay: (id, day)        => del(`/admin/movies/${id}/boxoffice-days/${day}`, _adminToken),
  adminBulkBoxOfficeDays:  (id, body)       => post(`/admin/movies/${id}/boxoffice-days/bulk`, body, _adminToken),

  // ── Admin — BMS Tracker
  trackerGetSessions:    (movieId)    => get(`/admin/tracker/sessions/${movieId}`, _adminToken),
  trackerGetSnapshot:    (id)         => get(`/admin/tracker/snapshot/${id}`, _adminToken),
  trackerSaveSnapshot:   (body)       => post(`/admin/tracker/save-snapshot`, body, _adminToken),
  trackerDeleteSnapshot: (id)         => del(`/admin/tracker/snapshot/${id}`, _adminToken),
  trackerGetAllActive:   ()           => get(`/admin/tracker/all-active`, _adminToken),

  // ── Admin — Sacnilk Tracker
  sacnilkGetConfigs:  ()              => get("/admin/sacnilk/configs", _adminToken),
  sacnilkGetLogs:     (movieId)       => get(`/admin/sacnilk/logs/${movieId}`, _adminToken),
  sacnilkSaveConfig:  (movieId, body) => req("PUT", `/admin/sacnilk/configs/${movieId}`, body, _adminToken),
  sacnilkDeleteConfig:(movieId)       => req("DELETE", `/admin/sacnilk/configs/${movieId}`, undefined, _adminToken),
  sacnilkScrapeOne:   (movieId)       => post(`/admin/sacnilk/scrape/${movieId}`, undefined, _adminToken),
  sacnilkScrapeAll:   ()              => post("/admin/sacnilk/scrape-all", undefined, _adminToken),

  // ── Admin — Analytics
  adminGetAnalytics: ()  => get("/admin/analytics", _adminToken),
  adminClearOldLogs: ()  => del("/admin/analytics/clear", _adminToken),
};