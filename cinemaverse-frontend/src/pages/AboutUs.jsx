import React from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";

const CSS = `
.about-root {
  max-width: 860px;
  margin: 0 auto;
  padding: 80px 24px 60px;
  color: var(--text);
}
.about-root h1 {
  font-family: 'Playfair Display', serif;
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 900;
  margin: 0 0 20px;
  color: var(--gold);
}
.about-hero-box {
  background: linear-gradient(135deg, rgba(201,151,58,.1), rgba(201,151,58,.03));
  border: 1px solid rgba(201,151,58,.2);
  border-radius: 14px;
  padding: 32px;
  margin-bottom: 40px;
  text-align: center;
}
.about-hero-box .emoji { font-size: 3.5rem; display: block; margin-bottom: 12px; }
.about-hero-box h2 { font-size: 1.4rem; font-weight: 900; color: var(--gold); margin: 0 0 10px; font-family: 'Playfair Display', serif; }
.about-hero-box p { font-size: .87rem; line-height: 1.7; color: rgba(255,255,255,.7); max-width: 560px; margin: 0 auto; }
.about-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 40px;
}
@media (max-width: 540px) { .about-stats { grid-template-columns: 1fr; } }
.about-stat {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}
.about-stat .num { font-size: 1.8rem; font-weight: 900; color: var(--gold); }
.about-stat .label { font-size: .75rem; color: var(--muted); margin-top: 4px; }
.about-section h2 {
  font-size: 1.05rem;
  font-weight: 800;
  margin: 0 0 12px;
  color: var(--text);
}
.about-section p, .about-section li {
  font-size: .87rem;
  line-height: 1.75;
  color: rgba(255,255,255,.7);
}
.about-section ul { padding-left: 22px; margin: 8px 0; }
.about-section { margin-bottom: 32px; }
.policy-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 32px;
  font-size: .82rem;
  color: var(--muted);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  transition: color .2s;
}
.policy-back:hover { color: var(--gold); }
`;

export default function AboutUs() {
  const navigate = useNavigate();
  return (
    <>
      <Helmet>
        <title>About Us — Ollypedia | Odia Cinema Encyclopedia</title>
        <meta name="description" content="Learn about Ollypedia — your complete encyclopedia of Odia cinema. Our mission, story and how to contribute." />
      </Helmet>
      <style>{CSS}</style>
      <div className="about-root">
        <button className="policy-back" onClick={() => navigate(-1)}>← Back</button>

        <div className="about-hero-box">
          <span className="emoji">🎬</span>
          <h2>Ollypedia — The Odia Cinema Encyclopedia</h2>
          <p>Your complete, community-powered database of Odia (Ollywood) movies, actors, songs, trailers and entertainment news. We're passionate about celebrating Odia cinema and its artists.</p>
        </div>

        <div className="about-stats">
          <div className="about-stat">
            <div className="num">500+</div>
            <div className="label">Movies Listed</div>
          </div>
          <div className="about-stat">
            <div className="num">1000+</div>
            <div className="label">Cast & Crew</div>
          </div>
          <div className="about-stat">
            <div className="num">5000+</div>
            <div className="label">Songs & Trailers</div>
          </div>
        </div>

        <div className="about-section">
          <h2>🎯 Our Mission</h2>
          <p>Ollipedia was created to give Odia cinema the digital home it deserves. Our goal is to make it easy for fans, researchers, and film enthusiasts to discover, explore and celebrate everything about Ollywood — from classic films to the latest releases.</p>
        </div>

        <div className="about-section">
          <h2>✨ What We Offer</h2>
          <ul>
            <li><strong>Movie Database:</strong> Comprehensive listings of Odia films with cast, crew, trailers, songs and box office information.</li>
            <li><strong>Cast Profiles:</strong> Detailed profiles for actors, directors, music directors and other film industry professionals.</li>
            <li><strong>Songs & Trailers:</strong> Watch trailers and listen to songs directly from our platform via YouTube integration.</li>
            <li><strong>Latest News:</strong> Stay up to date with the latest happenings in Odia entertainment.</li>
            <li><strong>Box Office Verdicts:</strong> Track whether films are blockbusters, hits, or flops.</li>
          </ul>
        </div>

        <div className="about-section">
          <h2>📖 Our Story</h2>
          <p>Ollipedia started as a personal project by a group of Odia cinema lovers who noticed a lack of a reliable, well-organised online resource for Ollywood films. What began as a simple spreadsheet evolved into a full-featured web platform dedicated to documenting and celebrating Odia cinema heritage.</p>
        </div>

        <div className="about-section">
          <h2>🤝 Contribute</h2>
          <p>We welcome contributions from the community. If you notice missing information, incorrect data, or want to help us grow the database, please reach out through our <a href="/contact" style={{color:"var(--gold)"}}>Contact page</a>.</p>
        </div>

        <div className="about-section">
          <h2>📬 Get in Touch</h2>
          <p>Have questions, suggestions, or just want to say hello?</p>
          <ul>
            <li>Email: <a href="mailto:alekhpradhan18@gmail.com" style={{color:"var(--gold)"}}>alekhpradhan18@gmail.com</a></li>
            <li>Visit our <a href="/contact" style={{color:"var(--gold)"}}>Contact page</a> to send us a message directly.</li>
          </ul>
        </div>
      </div>
    </>
  );
}