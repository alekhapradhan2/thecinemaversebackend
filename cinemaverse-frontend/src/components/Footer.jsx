import React from "react";
import { Link } from "react-router-dom";

const FOOTER_CSS = `
.site-footer {
  background: linear-gradient(to bottom, var(--bg2), #0a0a0a);
  border-top: 1px solid rgba(255,255,255,.07);
  padding: 48px 24px 24px;
  margin-top: 60px;
  font-size: .82rem;
  color: var(--muted, #888);
}
.footer-inner {
  max-width: 1300px;
  margin: 0 auto;
}
.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 40px;
  margin-bottom: 40px;
}
@media (max-width: 900px) {
  .footer-grid { grid-template-columns: 1fr 1fr; gap: 28px; }
}
@media (max-width: 540px) {
  .footer-grid { grid-template-columns: 1fr; gap: 24px; }
}
.footer-brand-name {
  font-size: 1.35rem;
  font-weight: 900;
  color: var(--gold, #c9973a);
  letter-spacing: -.02em;
  font-family: 'Playfair Display', serif;
  margin: 0 0 10px;
}
.footer-brand-desc {
  font-size: .79rem;
  line-height: 1.65;
  color: var(--muted, #888);
  max-width: 280px;
  margin: 0 0 18px;
}
.footer-social {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.footer-social-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04);
  color: var(--text, #eee);
  font-size: .74rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: all .2s;
}
.footer-social-btn:hover {
  border-color: rgba(201,151,58,.45);
  background: rgba(201,151,58,.08);
  color: var(--gold, #c9973a);
}
.footer-col-title {
  font-size: .72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--text, #eee);
  margin: 0 0 16px;
}
.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer-links a, .footer-links button {
  color: var(--muted, #888);
  text-decoration: none;
  font-size: .8rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  transition: color .2s;
}
.footer-links a:hover, .footer-links button:hover {
  color: var(--gold, #c9973a);
}
.footer-divider {
  border: none;
  border-top: 1px solid rgba(255,255,255,.06);
  margin: 0 0 20px;
}
.footer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.footer-bottom-links {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.footer-bottom-links a {
  color: var(--muted, #888);
  text-decoration: none;
  font-size: .76rem;
  transition: color .2s;
}
.footer-bottom-links a:hover {
  color: var(--gold, #c9973a);
}
.footer-disclaimer {
  font-size: .68rem;
  color: rgba(255,255,255,.25);
  line-height: 1.6;
  margin-top: 14px;
}
`;

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <>
      <style>{FOOTER_CSS}</style>
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-grid">
            {/* Brand */}
            <div>
              <h2 className="footer-brand-name">🎬 Ollypedia</h2>
              <p className="footer-brand-desc">
                Your complete encyclopedia of Odia cinema — movies, cast, songs, trailers and news all in one place.
              </p>
              <div className="footer-social">
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="footer-social-btn">
                  <span>f</span> Facebook
                </a>
                <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="footer-social-btn">
                  <span>▶</span> YouTube
                </a>
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="footer-social-btn">
                  <span>◎</span> Instagram
                </a>
              </div>
            </div>

            {/* Explore */}
            <div>
              <p className="footer-col-title">Explore</p>
              <ul className="footer-links">
                <li><Link to="/">🏠 Home</Link></li>
                <li><Link to="/movies">🎬 Movies</Link></li>
                <li><Link to="/cast">👥 Cast & Crew</Link></li>
                <li><Link to="/songs">🎵 Songs</Link></li>
                <li><Link to="/news">📰 News</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <p className="footer-col-title">Company</p>
              <ul className="footer-links">
                <li><Link to="/about">About Us</Link></li>
                <li><Link to="/contact">Contact Us</Link></li>
                <li><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">Sitemap</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="footer-col-title">Legal</p>
              <ul className="footer-links">
                <li><Link to="/privacy-policy">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>

          <hr className="footer-divider" />

          <div className="footer-bottom">
            <span style={{ fontSize: ".76rem" }}>
              © {year} <strong style={{ color: "var(--gold)" }}>Ollypedia</strong>. All rights reserved.
            </span>
            <div className="footer-bottom-links">
              <Link to="/privacy-policy">Privacy Policy</Link>
              <Link to="/contact">Contact</Link>
            </div>
          </div>

          <p className="footer-disclaimer">
            All movie titles, posters, trailers and related media are trademarks and property of their respective owners and production companies.
            Ollypedia is an independent fan site and is not affiliated with any film studio or production house.
            Content on this site is for informational and entertainment purposes only.
          </p>
        </div>
      </footer>
    </>
  );
}