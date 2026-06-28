import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

const CSS = `
.contact-root {
  max-width: 860px;
  margin: 0 auto;
  padding: 80px 24px 60px;
  color: var(--text);
}
.contact-root h1 {
  font-family: 'Playfair Display', serif;
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 900;
  margin: 0 0 8px;
  color: var(--gold);
}
.contact-root .subtitle {
  font-size: .87rem;
  color: var(--muted);
  margin-bottom: 40px;
  display: block;
}
.contact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: start;
}
@media (max-width: 680px) { .contact-grid { grid-template-columns: 1fr; } }
.contact-form {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
}
.contact-form h2 { font-size: 1rem; font-weight: 800; margin: 0 0 20px; color: var(--text); }
.cf-group { margin-bottom: 16px; }
.cf-label { display: block; font-size: .76rem; font-weight: 700; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .06em; }
.cf-input, .cf-textarea, .cf-select {
  width: 100%;
  background: var(--bg3, #1a1a1a);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text);
  font-size: .85rem;
  font-family: inherit;
  outline: none;
  transition: border .2s;
  box-sizing: border-box;
}
.cf-input:focus, .cf-textarea:focus, .cf-select:focus {
  border-color: rgba(201,151,58,.5);
}
.cf-textarea { min-height: 110px; resize: vertical; }
.cf-submit {
  width: 100%;
  padding: 12px;
  background: var(--gold, #c9973a);
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: .87rem;
  font-weight: 800;
  cursor: pointer;
  transition: opacity .2s;
  margin-top: 4px;
}
.cf-submit:hover { opacity: .88; }
.cf-submit:disabled { opacity: .5; cursor: not-allowed; }
.contact-info-cards { display: flex; flex-direction: column; gap: 16px; }
.contact-info-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 22px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.contact-info-card .icon {
  font-size: 1.4rem;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(201,151,58,.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.contact-info-card .label { font-size: .73rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; margin-bottom: 4px; }
.contact-info-card .value { font-size: .85rem; color: var(--text); }
.contact-info-card a { color: var(--gold); text-decoration: none; }
.contact-info-card a:hover { text-decoration: underline; }
.success-box {
  background: rgba(149,229,184,.1);
  border: 1px solid rgba(149,229,184,.3);
  border-radius: 10px;
  padding: 16px 20px;
  color: #95e5b8;
  font-size: .85rem;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
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

export default function ContactUs() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", subject: "General Inquiry", message: "" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState("");

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message) return;
    setSending(true);
    setError("");
    try {
      await API.submitContact(form);
      setSent(true);
      setForm({ name:"", email:"", subject:"General Inquiry", message:"" });
    } catch (e) {
      setError(typeof e?.message === "string" ? e.message : "Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Contact Us — Ollypedia</title>
        <meta name="description" content="Get in touch with Ollypedia. Report errors, suggest additions, or send us your feedback." />
      </Helmet>
      <style>{CSS}</style>
      <div className="contact-root">
        <button className="policy-back" onClick={() => navigate(-1)}>← Back</button>
        <h1>Contact Us</h1>
        <span className="subtitle">We'd love to hear from you — corrections, suggestions, business inquiries, all welcome.</span>

        <div className="contact-grid">
          {/* Form */}
          <div className="contact-form">
            <h2>✉️ Send a Message</h2>

            <div className="cf-group">
              <label className="cf-label">Your Name *</label>
              <input className="cf-input" value={form.name} onChange={set("name")} placeholder="Full name" />
            </div>
            <div className="cf-group">
              <label className="cf-label">Email Address *</label>
              <input className="cf-input" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" />
            </div>
            <div className="cf-group">
              <label className="cf-label">Subject</label>
              <select className="cf-select" value={form.subject} onChange={set("subject")}>
                <option>General Inquiry</option>
                <option>Report Incorrect Info</option>
                <option>Add/Update Movie</option>
                <option>Advertise With Us</option>
                <option>Copyright Issue</option>
                <option>Technical Problem</option>
                <option>Other</option>
              </select>
            </div>
            <div className="cf-group">
              <label className="cf-label">Message *</label>
              <textarea className="cf-textarea" value={form.message} onChange={set("message")} placeholder="Write your message here…" />
            </div>

            {!sent ? (
              <>
                {error && (
                  <div style={{ background:"rgba(220,50,50,.1)", border:"1px solid rgba(220,50,50,.3)", borderRadius:8, padding:"10px 14px", color:"#e87a7a", fontSize:".82rem", marginBottom:10 }}>
                    ⚠️ {error}
                  </div>
                )}
                <button className="cf-submit" onClick={handleSubmit} disabled={sending || !form.name || !form.email || !form.message}>
                  {sending ? "Sending…" : "Send Message"}
                </button>
              </>
            ) : (
              <div className="success-box">✅ Message sent! We'll get back to you within 24–48 hours.</div>
            )}
          </div>

          {/* Info cards */}
          <div className="contact-info-cards">
            <div className="contact-info-card">
              <div className="icon">📧</div>
              <div>
                <div className="label">Email</div>
                <div className="value"><a href="mailto:contact@ollipedia.in">alekhpradhan18@gmail.com</a></div>
              </div>
            </div>
            <div className="contact-info-card">
              <div className="icon">🌐</div>
              <div>
                <div className="label">Website</div>
                <div className="value"><a href="https://ollypedia.in">ollypedia.in</a></div>
              </div>
            </div>
            <div className="contact-info-card">
              <div className="icon">📍</div>
              <div>
                <div className="label">Based in</div>
                <div className="value">Odisha, India</div>
              </div>
            </div>
            <div className="contact-info-card">
              <div className="icon">⏰</div>
              <div>
                <div className="label">Response Time</div>
                <div className="value">Within 24–48 hours (Mon–Sat)</div>
              </div>
            </div>
            <div className="contact-info-card">
              <div className="icon">📢</div>
              <div>
                <div className="label">Advertise With Us</div>
                <div className="value">Reach thousands of Odia cinema fans daily. <a href="alekhpradhan18@gmail.com">alekhpradhan18@gmail.com</a></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}