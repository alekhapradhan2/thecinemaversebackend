import React from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";

const PAGE_CSS = `
.policy-root {
  max-width: 860px;
  margin: 0 auto;
  padding: 80px 24px 60px;
  color: var(--text);
}
.policy-root h1 {
  font-family: 'Playfair Display', serif;
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 900;
  margin: 0 0 6px;
  color: var(--gold);
}
.policy-root .updated {
  font-size: .78rem;
  color: var(--muted);
  margin-bottom: 36px;
  display: block;
}
.policy-root h2 {
  font-size: 1.05rem;
  font-weight: 800;
  margin: 32px 0 10px;
  color: var(--text);
}
.policy-root p, .policy-root li {
  font-size: .87rem;
  line-height: 1.75;
  color: rgba(255,255,255,.72);
}
.policy-root ul {
  padding-left: 22px;
  margin: 8px 0;
}
.policy-root a {
  color: var(--gold);
  text-decoration: none;
}
.policy-root a:hover { text-decoration: underline; }
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

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  return (
    <>
      <Helmet>
        <title>Privacy Policy — Ollypedia</title>
        <meta name="description" content="Privacy Policy for Ollypedia — how we collect, use and protect your information." />
      </Helmet>
      <style>{PAGE_CSS}</style>
      <div className="policy-root">
        <button className="policy-back" onClick={() => navigate(-1)}>← Back</button>
        <h1>Privacy Policy</h1>
        <span className="updated">Last updated: {new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</span>

        <p>Welcome to <strong>Ollypedia</strong> ("we", "our", or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, and share information about you when you visit our website.</p>

        <h2>1. Information We Collect</h2>
        <p>We may collect the following types of information:</p>
        <ul>
          <li><strong>Usage Data:</strong> Pages visited, time spent, links clicked, browser type, device type, and IP address (collected automatically).</li>
          <li><strong>Cookies & Tracking:</strong> We use cookies and similar tracking technologies to improve your experience and show relevant advertisements.</li>
          <li><strong>Third-Party Services:</strong> We use Google Analytics and Google AdSense, which may collect data according to their own privacy policies.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To operate and improve our website</li>
          <li>To analyse site traffic and usage patterns</li>
          <li>To serve personalised and non-personalised advertisements via Google AdSense</li>
          <li>To comply with legal obligations</li>
        </ul>

        <h2>3. Google AdSense & Advertising</h2>
        <p>We use Google AdSense to display advertisements on our website. Google may use cookies to serve ads based on your prior visits to our website or other websites. You can opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ad Settings</a>.</p>
        <p>Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to our website. Google's use of advertising cookies enables it and its partners to serve ads based on your visit to our site and/or other sites on the Internet.</p>

        <h2>4. Cookies</h2>
        <p>Our website uses cookies to enhance your browsing experience. Cookies are small files stored on your device. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, some features of our website may not function properly without cookies.</p>
        <p>Types of cookies we use:</p>
        <ul>
          <li><strong>Essential Cookies:</strong> Necessary for the website to function.</li>
          <li><strong>Analytics Cookies:</strong> Help us understand how visitors interact with our website (Google Analytics).</li>
          <li><strong>Advertising Cookies:</strong> Used to display relevant advertisements (Google AdSense).</li>
        </ul>

        <h2>5. Third-Party Links</h2>
        <p>Our website may contain links to third-party websites, including YouTube for trailers and videos. We are not responsible for the privacy practices of those websites. We encourage you to read their privacy policies.</p>

        <h2>6. Children's Privacy</h2>
        <p>Our website is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us to have it removed.</p>

        <h2>7. Data Security</h2>
        <p>We implement reasonable technical and organisational measures to protect your information. However, no method of transmission over the internet is 100% secure.</p>

        <h2>8. Your Rights</h2>
        <p>Depending on your location, you may have rights to access, correct, or delete your personal data. To exercise these rights, please contact us using the details below.</p>

        <h2>9. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last updated" date at the top of this page.</p>

        <h2>10. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us at:</p>
        <ul>
          <li>Email: <a href="mailto:alekhpradhan18@gmail.com">alekhpradhan18@gmail.com</a></li>
          <li>Website: <a href="/contact">ollypedia.in/contact</a></li>
        </ul>

        <p style={{marginTop:32,fontSize:".75rem",color:"rgba(255,255,255,.3)"}}>© {year} Ollypedia. All rights reserved.</p>
      </div>
    </>
  );
}