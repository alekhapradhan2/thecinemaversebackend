import React from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";   // ✅ ADD THIS
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import "./style.css";

const container = document.getElementById("root");

const AppWrapper = (
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>   {/* ✅ REQUIRED */}
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);

if (container.hasChildNodes()) {
  hydrateRoot(container, AppWrapper);
} else {
  createRoot(container).render(AppWrapper);
}