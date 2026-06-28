import React, { useState, useCallback, useEffect } from "react";
import { Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { setToken, setCastToken, setAdminToken } from "./api/api";

import Navbar from "./components/Navbar";
import LoginModal from "./components/LoginModal";
import { Toast } from "./components/UI";

import Home from "./pages/Home";
import Movies from "./pages/Movies";
import MovieDetails from "./pages/MovieDetails";
import Cast from "./pages/Cast";
import CastProfile from "./pages/CastProfile";
import News from "./pages/News";
import NewsDetail from "./pages/NewsDetail";
import Register from "./pages/Register";
import ProductionProfile from "./pages/ProductionProfile";
import SongDetail from "./pages/SongDetail";
import AllSongs from "./pages/AllSongs";
import AboutUs from "./pages/AboutUs";
import Blog from "./pages/Blog";
import BlogPost from "./pages/Blogpost";
import ContactUs from "./pages/ContactUs";
import Footer from "./components/Footer";
import PrivacyPolicy from "./pages/PrivacyPolicy";

import Dashboard from "./pages/Dashboard";
import AddMovie from "./pages/AddMovie";
import CastRegister from "./pages/CastRegister";
import CastPortal from "./pages/CastPortal";
import PortalMovieDetails from "./pages/PortalMovieDetails";
import PortalCastProfile from "./pages/PortalCastProfile";

import AdminPortal from "./pages/AdminPortal";
import AdminLogin from "./pages/AdminLogin";

// ✅ Scroll Fix (SSR Safe)
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType === "POP") return;
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [pathname, navType]);

  return null;
}

function AppInner({
  production,
  setProduction,
  castMember,
  setCastMember,
  admin,
  setAdmin,
}) {
  const location = useLocation();

  const [showLogin, setShowLogin] = useState(false);
  const [toast, setToast] = useState(null);

  const isProdPortal =
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/portal");

  const isCastPortal = location.pathname.startsWith("/cast-portal");
  const isAdminPortal = location.pathname.startsWith("/admin");

  const isAnyPortal = isProdPortal || isCastPortal || isAdminPortal;

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ✅ Auth handlers
  const handleProdAuth = (prod, token) => {
    setProduction(prod);
    setToken(token);
    if (typeof window !== "undefined") {
      localStorage.setItem("op_prod", JSON.stringify(prod));
    }
  };

  const handleProdLogout = () => {
    setProduction(null);
    setToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("op_prod");
    }
  };

  const handleCastAuth = (m, token) => {
    setCastMember(m);
    setCastToken(token);
    if (typeof window !== "undefined") {
      localStorage.setItem("cm_member", JSON.stringify(m));
    }
  };

  const handleCastLogout = () => {
    setCastMember(null);
    setCastToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("cm_member");
      localStorage.removeItem("cm_token");
    }
  };

  const handleAdminAuth = (a, token) => {
    setAdmin(a);
    setAdminToken(token);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin_user", JSON.stringify(a));
    }
  };

  const handleAdminLogout = () => {
    setAdmin(null);
    setAdminToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("admin_user");
      localStorage.removeItem("admin_token");
    }
  };

  const updateProduction = (p) => {
    setProduction(p);
    if (typeof window !== "undefined") {
      localStorage.setItem("op_prod", JSON.stringify(p));
    }
  };

  const updateCastMember = (m) => {
    setCastMember(m);
    if (typeof window !== "undefined") {
      localStorage.setItem("cm_member", JSON.stringify(m));
    }
  };

  return (
    <>
      <ScrollToTop />

      {!isAnyPortal && (
        <Navbar
          production={production}
          castMember={castMember}
          onLoginClick={() => setShowLogin(true)}
          onLogout={handleProdLogout}
          onCastLogout={handleCastLogout}
        />
      )}

      <Routes>
        {/* Public */}
        <Route path="/" element={<Home production={production} />} />
        <Route path="/movies" element={<Movies />} />
        <Route
          path="/movie/:slug"
          element={<MovieDetails production={production} onToast={showToast} />}
        />
        <Route path="/cast" element={<Cast />} />
        <Route path="/cast/:slug" element={<CastProfile />} />
        <Route path="/cast/:slug/:nameSlug" element={<CastProfile />} />
        <Route path="/songs" element={<AllSongs />} />
        <Route path="/news" element={<News />} />
        <Route path="/news/:id" element={<NewsDetail />} />
        <Route
          path="/production/:id"
          element={<ProductionProfile production={production} />}
        />
        <Route
          path="/register"
          element={
            <Register
              onSuccess={(p, t) => handleProdAuth(p, t)}
              onToast={showToast}
            />
          }
        />
        <Route
          path="/cast-register"
          element={
            <CastRegister
              onSuccess={(m, t) => handleCastAuth(m, t)}
              onToast={showToast}
            />
          }
        />
        <Route path="/about" element={<AboutUs />} />
        {/* ✅ NEW: Blog routes */}
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route
          path="/song/:movieSlug/:songIndex"
          element={<SongDetail />}
        />
        <Route
          path="/song/:movieSlug/:songIndex/:songSlug"
          element={<SongDetail />}
        />

        {/* Production Portal */}
        <Route
          path="/dashboard"
          element={
            <Dashboard
              production={production}
              onToast={showToast}
              onLogout={handleProdLogout}
              onProductionUpdate={updateProduction}
            />
          }
        />
        <Route
          path="/dashboard/add-movie"
          element={<AddMovie production={production} onToast={showToast} />}
        />
        <Route
          path="/portal/movie/:id"
          element={
            <PortalMovieDetails
              production={production}
              onToast={showToast}
            />
          }
        />
        <Route
          path="/portal/cast/:id"
          element={<PortalCastProfile production={production} />}
        />

        {/* Cast Portal */}
        <Route
          path="/cast-portal"
          element={
            <CastPortal
              castMember={castMember}
              onToast={showToast}
              onLogout={handleCastLogout}
              onUpdate={updateCastMember}
            />
          }
        />

        {/* Admin */}
        <Route
          path="/admin/login"
          element={
            <AdminLogin onSuccess={handleAdminAuth} onToast={showToast} />
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminPortal
              admin={admin}
              onLogout={handleAdminLogout}
              onToast={showToast}
            />
          }
        />
      </Routes>

      {!isAnyPortal && <Footer />}

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={(prod, token) => {
            handleProdAuth(prod, token);
            setShowLogin(false);
            showToast(`Welcome back, ${prod.name}!`);
          }}
          onCastSuccess={(member, token) => {
            handleCastAuth(member, token);
            setShowLogin(false);
            showToast(`Welcome, ${member.name}!`);
          }}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}

// ✅ FINAL APP (SSR SAFE)
export default function App() {
  const [production, setProduction] = useState(null);
  const [castMember, setCastMember] = useState(null);
  const [admin, setAdmin] = useState(null);

  // ✅ Load from localStorage AFTER mount
  useEffect(() => {
    try {
      const prod = localStorage.getItem("op_prod");
      const cast = localStorage.getItem("cm_member");
      const adm = localStorage.getItem("admin_user");

      if (prod) setProduction(JSON.parse(prod));
      if (cast) setCastMember(JSON.parse(cast));
      if (adm) setAdmin(JSON.parse(adm));
    } catch {}
  }, []);

  return (
    <HelmetProvider>
      <AppInner
        production={production}
        setProduction={setProduction}
        castMember={castMember}
        setCastMember={setCastMember}
        admin={admin}
        setAdmin={setAdmin}
      />
    </HelmetProvider>
  );
}