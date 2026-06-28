const fs = require('fs');
const file = 'c:/Users/BYTEIQ/Documents/Ollypidea/Ollypedia-Backend/server.js';
let content = fs.readFileSync(file, 'utf8');

const regexWeekend = /function buildWeekendBlogHTML[\s\S]*?`\s*;\s*\n}/;
const regexMilestone = /function buildMilestoneBlogHTML[\s\S]*?`\s*;\s*\n}/;
const regexComparison = /function buildComparisonBlogHTML[\s\S]*?`\s*;\s*\n}/;

const newWeekend = `function buildWeekendBlogHTML(movie, days, totalNet, weekendLabel, ai, slug, title, relatedMovies) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const dm = dp;

  const movieUrl = \`/movie/\${movie.slug}\`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || \`\${SITE_URL}/logo.png\`;

  const css = EVENT_BLOG_CSS_VARIABLES;
  const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));

  let weekendNum = 1;
  if (weekendLabel.includes("Second")) weekendNum = 2;
  else if (weekendLabel.includes("Third")) weekendNum = 3;
  else if (weekendLabel.includes("Weekend ")) weekendNum = parseInt(weekendLabel.replace("Weekend ", ""), 10) || 1;
  
  const fridayDay = (weekendNum - 1) * 7 + 1;
  const weekendDays = days.filter(d => d.day >= fridayDay && d.day <= fridayDay + 2);
  
  let prevCumulative = days.filter(d => d.day < fridayDay).reduce((s, d) => s + parseToRupeesGlobal(d.net || "0"), 0);
  
  const dataTableRows = weekendDays.map((d, i) => {
    const netNum = parseToRupeesGlobal(d.net || "0");
    prevCumulative += netNum;
    const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
    const dayNames = ["Friday", "Saturday", "Sunday"];

    return \`
    <tr style="background:\${i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#aaa;font-weight:700;">Day \${d.day} (\${dayNames[i] || ""})</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">\${dateStr}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-weight:700;">\${d.net ? formatINR(netNum) : "—"}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#c9973a;font-weight:700;">\${formatINR(prevCumulative)}</td>
    </tr>\`;
  }).join("");

  const toc = [
    ["Weekend Breakdown", "weekend-breakdown"],
    ["Occupancy Trends", "occupancy-trends"],
    ["Audience Profile", "audience-profile"],
    ["Hold Analysis", "hold-analysis"],
    ["Industry Context", "industry-context"],
    ["Weekday Outlook", "weekday-outlook"],
    ["Conclusion", "conclusion"],
    relatedMovies.length ? ["Related Reads", "related-movies"] : null
  ].filter(Boolean);

  const keywordsArr = [
    movieName, \`\${movieName} \${weekendLabel.toLowerCase()} collection\`, \`\${movieName} weekend box office\`,
    "Odia box office", "Ollywood weekend report"
  ];
  const keywordsStr = [...new Set(keywordsArr)].join(", ");
  const plainWordCount = Object.values(ai).join(" ").split(/\\s+/).filter(Boolean).length;

  return \\\`<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          \${title}
  description:    \${ai.metaDescription}
  keywords:       \${keywordsStr}
  canonical:      \${SITE_URL}/blog/\${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       \${title}
  og:description: \${ai.metaDescription}
  og:url:         \${SITE_URL}/blog/\${slug}
  og:image:       \${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: \${dp}
  article:modified_time:  \${dm}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  \${title}
  twitter:description: \${ai.metaDescription}
  twitter:image:  \${ogImage}
  twitter:image:alt: \${movieName} Weekend Poster
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": \${JSON.stringify(title)},
      "description": \${JSON.stringify(ai.metaDescription)},
      "image": \${JSON.stringify(ogImage)},
      "datePublished": "\${dp}",
      "dateModified": "\${dm}",
      "inLanguage": "en",
      "wordCount": \${plainWordCount},
      "keywords": \${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "\${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "\${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "\${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "\${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "\${SITE_URL}/blog/\${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "\${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "\${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": \${JSON.stringify(movieName)}, "item": "\${SITE_URL}\${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "\${weekendLabel} Report", "item": "\${SITE_URL}/blog/\${slug}" }
      ]
    }
  ]
}
</script>

<style>
\${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="\${movieUrl}" style="color:#777;text-decoration:none;">\${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#c9973a;">\${weekendLabel} Report</span>
  </nav>
  <time datetime="\${dp}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: \${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#0a1520 0%,#121212 100%);border:1px solid #102a40;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#0d2030;color:#7ec8e3;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #1a3a54;">🎟️ Weekend Report</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">\${weekendLabel}</span>
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      \${title}
    </h1>
    <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">
      \${ai.introParagraph}
    </p>
</div>

<nav aria-label="Table of contents" style="\${css.card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    \${toc.map(([label, id]) => \`<li><a href="#\${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">\${label}</a></li>\`).join("")}
  </ul>
</nav>

<section id="weekend-breakdown" style="\${css.card}">
  <h2 style="\${css.h2}">\${weekendLabel} Breakdown</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0 0 18px;">
    \${ai.weekendBreakdownParagraph}
  </p>
  \${dataTableRows ? \`
  <div style="overflow-x:auto;">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:400px;margin-bottom:18px;">
      <thead>
        <tr>
          <th style="\${css.th}">Day</th>
          <th style="\${css.th}">Date</th>
          <th style="\${css.th}">Net Collection</th>
          <th style="\${css.th}">Cumulative Net</th>
        </tr>
      </thead>
      <tbody>
        \${dataTableRows}
      </tbody>
    </table>
  </div>
  \` : ""}
</section>

<section id="occupancy-trends" style="\${css.card}">
  <h2 style="\${css.h2}">Occupancy Trends</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.occupancyTrendSection}
  </p>
</section>

<section id="audience-profile" style="\${css.card}">
  <h2 style="\${css.h2}">Audience Profile</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.audienceProfileSection}
  </p>
</section>

<section id="hold-analysis" style="\${css.card}">
  <h2 style="\${css.h2}">Hold Analysis</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.holdAnalysisParagraph}
  </p>
</section>

<section id="industry-context" style="\${css.card}">
  <h2 style="\${css.h2}">Ollywood Industry Context</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.industryContextSection}
  </p>
</section>

<section id="weekday-outlook" style="\${css.card}">
  <h2 style="\${css.h2}">Upcoming Weekday Outlook</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.weekdayOutlookSection}
  </p>
</section>

<section id="conclusion" style="\${css.card}">
  <h2 style="\${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.conclusionParagraph}
  </p>
  <p style="font-size:0.75rem;color:#555;margin-top:15px;">
    * All comparison figures are based on estimates. Back to <a href="\${movieUrl}" style="color:#c9973a;text-decoration:underline;">\${movieName} Main Page</a>.
  </p>
</section>

\${relatedMovies.length ? \`
<section id="related-movies">
  \${buildRelatedMoviesHtml(relatedMovies, "#c9973a")}
</section>\` : ""}
\\\`;
}`;

const newMilestone = `function buildMilestoneBlogHTML(movie, milestoneKey, totalNet, ai, slug, title, relatedMovies, sortedDays) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const dm = dp;

  const movieUrl = \`/movie/\${movie.slug}\`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || \`\${SITE_URL}/logo.png\`;

  const milestoneClean = milestoneKey.toUpperCase().replace("CR", " Crore").replace("L", " Lakh");

  const css = EVENT_BLOG_CSS_VARIABLES;
  const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));

  const toc = [
    ["Milestone Significance", "significance"],
    ["Box Office Journey", "journey"],
    ["Industry Impact", "industry-impact"],
    ["Creative Team Context", "creative-team"],
    ["Future Outlook", "future-outlook"],
    ["Conclusion", "conclusion"],
    relatedMovies.length ? ["Related Reads", "related-movies"] : null
  ].filter(Boolean);

  const keywordsArr = [
    movieName, \`\${movieName} \${milestoneClean}\`, \`\${movieName} box office milestone\`,
    "Odia box office records", "Ollywood collections"
  ];
  const keywordsStr = [...new Set(keywordsArr)].join(", ");
  const plainWordCount = Object.values(ai).join(" ").split(/\\s+/).filter(Boolean).length;
  
  let milestoneTableHtml = "";
  if (sortedDays && sortedDays.length > 0) {
    const tableDays = [];
    if (sortedDays.length >= 1) tableDays.push(sortedDays[0]);
    if (sortedDays.length >= 3) tableDays.push(sortedDays.find(d => d.day === 3) || sortedDays[2]);
    if (sortedDays.length >= 7) tableDays.push(sortedDays.find(d => d.day === 7) || sortedDays[6]);
    if (sortedDays.length > 7) tableDays.push(sortedDays[sortedDays.length - 1]);
    
    const uniqueDays = tableDays.filter((d, index, self) => index === self.findIndex(t => t.day === d.day));
    
    let cumNet = 0;
    const allCumulatives = sortedDays.reduce((acc, d) => {
        cumNet += parseToRupeesGlobal(d.net || "0");
        acc[d.day] = cumNet;
        return acc;
    }, {});

    const rows = uniqueDays.map((d, i) => {
      const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
      const cumVal = allCumulatives[d.day] || 0;
      return \`
      <tr style="background:\${i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"};">
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#aaa;font-weight:700;">Day \${d.day}</td>
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#888;font-size:0.82rem;">\${dateStr}</td>
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-weight:700;">\${d.net ? formatINR(parseToRupeesGlobal(d.net)) : "—"}</td>
        <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#10b981;font-weight:700;">\${formatINR(cumVal)}</td>
      </tr>\`;
    }).join("");

    milestoneTableHtml = \`
    <div style="overflow-x:auto;margin-top:20px;margin-bottom:18px;">
      <h3 style="color:#ddd;font-size:1.05rem;margin-bottom:12px;">Milestone Progress Tracker</h3>
      <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:400px;">
        <thead>
          <tr>
            <th style="\${css.th}">Checkpoint</th>
            <th style="\${css.th}">Date</th>
            <th style="\${css.th}">Day Net Collection</th>
            <th style="\${css.th}">Cumulative Net</th>
          </tr>
        </thead>
        <tbody>
          \${rows}
        </tbody>
      </table>
    </div>\`;
  }

  return \\\`<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          \${title}
  description:    \${ai.metaDescription}
  keywords:       \${keywordsStr}
  canonical:      \${SITE_URL}/blog/\${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       \${title}
  og:description: \${ai.metaDescription}
  og:url:         \${SITE_URL}/blog/\${slug}
  og:image:       \${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: \${dp}
  article:modified_time:  \${dm}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  \${title}
  twitter:description: \${ai.metaDescription}
  twitter:image:  \${ogImage}
  twitter:image:alt: \${movieName} Box Office Milestone
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": \${JSON.stringify(title)},
      "description": \${JSON.stringify(ai.metaDescription)},
      "image": \${JSON.stringify(ogImage)},
      "datePublished": "\${dp}",
      "dateModified": "\${dm}",
      "inLanguage": "en",
      "wordCount": \${plainWordCount},
      "keywords": \${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "\${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "\${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "\${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "\${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "\${SITE_URL}/blog/\${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "\${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "\${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": \${JSON.stringify(movieName)}, "item": "\${SITE_URL}\${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "₹\${milestoneClean} Milestone", "item": "\${SITE_URL}/blog/\${slug}" }
      ]
    }
  ]
}
</script>

<style>
\${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="\${movieUrl}" style="color:#777;text-decoration:none;">\${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#10b981;">₹\${milestoneClean} Milestone</span>
  </nav>
  <time datetime="\${dp}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: \${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#021a11 0%,#121212 100%);border:1px solid #063d27;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#03291b;color:#10b981;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #064d32;">🏆 Box Office Milestone</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">₹\${milestoneClean}</span>
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      \${title}
    </h1>
    <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">
      \${ai.introParagraph}
    </p>
</div>

<nav aria-label="Table of contents" style="\${css.card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    \${toc.map(([label, id]) => \`<li><a href="#\${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">\${label}</a></li>\`).join("")}
  </ul>
</nav>

<section id="significance" style="\${css.card}">
  <h2 style="\${css.h2}">Significance of the ₹\${milestoneClean} Milestone</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.milestoneSignificanceParagraph}
  </p>
</section>

<section id="journey" style="\${css.card}">
  <h2 style="\${css.h2}">The Box Office Journey</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.journeyTimelineSection}
  </p>
  \${milestoneTableHtml}
</section>

<section id="industry-impact" style="\${css.card}">
  <h2 style="\${css.h2}">Impact on Ollywood</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.industryImpactSection}
  </p>
</section>

<section id="creative-team" style="\${css.card}">
  <h2 style="\${css.h2}">Context for the Creative Team</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.castDirectorContextSection}
  </p>
</section>

<section id="future-outlook" style="\${css.card}">
  <h2 style="\${css.h2}">Future Outlook & Projections</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.futureOutlookSection}
  </p>
</section>

<section id="conclusion" style="\${css.card}">
  <h2 style="\${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.conclusionParagraph}
  </p>
  <p style="font-size:0.75rem;color:#555;margin-top:15px;">
    * All figures are based on estimates. Back to <a href="\${movieUrl}" style="color:#c9973a;text-decoration:underline;">\${movieName} Main Page</a>.
  </p>
</section>

\${relatedMovies.length ? \`
<section id="related-movies">
  \${buildRelatedMoviesHtml(relatedMovies, "#10b981")}
</section>\` : ""}
\\\`;
}`;

const newComparison = `function buildComparisonBlogHTML(movie, comparators, totalNet, ai, slug, title, relatedMovies) {
  const movieName = movie.title;
  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "";
  const totalNetStr = formatINR(totalNet);
  const dp = new Date().toISOString();
  const dm = dp;

  const movieUrl = \`/movie/\${movie.slug}\`;
  const poster = movie.posterUrl || movie.thumbnailUrl || movie.bannerUrl || "";
  const ogImage = poster || \`\${SITE_URL}/logo.png\`;

  const css = EVENT_BLOG_CSS_VARIABLES;
  const nowIST = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));

  const dataRows = comparators.map((c, i) => \`
    <tr style="background:\${i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"};">
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ddd;font-weight:600;"><a href="/movie/\${c.slug}" style="color:#ddd;text-decoration:none;">\${c.title}</a></td>
      <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#bbb;">\${c.firstWeekNetStr}</td>
    </tr>
  \`).join("");

  const toc = [
    ["Ranking Context", "ranking-context"],
    ["Comparative Analysis", "comparison-analysis"],
    ["Opening Weekend comparison", "opening-weekend"],
    ["Comparison Verdict", "verdict-comparison"],
    ["Industry Impact", "industry-impact"],
    ["Conclusion", "conclusion"],
    relatedMovies.length ? ["Related Reads", "related-movies"] : null
  ].filter(Boolean);

  const keywordsArr = [
    movieName, \`\${movieName} box office comparison\`, \`\${movieName} vs other odia movies\`,
    "Odia box office hits", "Ollywood collections"
  ];
  const keywordsStr = [...new Set(keywordsArr)].join(", ");
  const plainWordCount = Object.values(ai).join(" ").split(/\\s+/).filter(Boolean).length;

  return \\\`<!-- ════════════════════════════════════════════════════════════════
  OLLYPEDIA SEO META — READ BY CMS
  title:          \${title}
  description:    \${ai.metaDescription}
  keywords:       \${keywordsStr}
  canonical:      \${SITE_URL}/blog/\${slug}
  robots:         index, follow
  og:site_name:   Ollypedia
  og:title:       \${title}
  og:description: \${ai.metaDescription}
  og:url:         \${SITE_URL}/blog/\${slug}
  og:image:       \${ogImage}
  og:image:width: 1200
  og:image:height: 630
  og:type:        article
  og:locale:      en_IN
  article:published_time: \${dp}
  article:modified_time:  \${dm}
  article:author: Ollypedia Team
  article:section: Box Office
  twitter:card:   summary_large_image
  twitter:site:   @OllypediaIn
  twitter:creator: @OllypediaIn
  twitter:title:  \${title}
  twitter:description: \${ai.metaDescription}
  twitter:image:  \${ogImage}
  twitter:image:alt: \${movieName} Box Office Comparison
════════════════════════════════════════════════════════════════ -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NewsArticle",
      "headline": \${JSON.stringify(title)},
      "description": \${JSON.stringify(ai.metaDescription)},
      "image": \${JSON.stringify(ogImage)},
      "datePublished": "\${dp}",
      "dateModified": "\${dm}",
      "inLanguage": "en",
      "wordCount": \${plainWordCount},
      "keywords": \${JSON.stringify(keywordsStr)},
      "author": [
        { "@type": "Person", "name": "Ollypedia Team", "url": "\${SITE_URL}/about" },
        { "@type": "Organization", "name": "Ollypedia", "url": "\${SITE_URL}" }
      ],
      "publisher": {
        "@type": "Organization",
        "name": "Ollypedia",
        "url": "\${SITE_URL}",
        "logo": { "@type": "ImageObject", "url": "\${SITE_URL}/logo.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "\${SITE_URL}/blog/\${slug}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "\${SITE_URL}" },
        { "@type": "ListItem", "position": 2, "name": "Box Office", "item": "\${SITE_URL}/box-office" },
        { "@type": "ListItem", "position": 3, "name": \${JSON.stringify(movieName)}, "item": "\${SITE_URL}\${movieUrl}" },
        { "@type": "ListItem", "position": 4, "name": "First Week Comparison", "item": "\${SITE_URL}/blog/\${slug}" }
      ]
    }
  ]
}
</script>

<style>
\${EVENT_BLOG_RESPONSIVE_STYLES}
</style>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
  <nav aria-label="Breadcrumb" style="font-size:0.78rem;color:#555;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
    <a href="/"           style="color:#777;text-decoration:none;">Home</a>
    <span style="color:#333;">›</span>
    <a href="/box-office" style="color:#777;text-decoration:none;">Box Office</a>
    <span style="color:#333;">›</span>
    <a href="\${movieUrl}" style="color:#777;text-decoration:none;">\${movieName}</a>
    <span style="color:#333;">›</span>
    <span style="color:#ff9800;">First Week Comparison</span>
  </nav>
  <time datetime="\${dp}" style="font-size:0.73rem;color:#444;white-space:nowrap;">
    🕐 Updated: \${nowIST.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
  </time>
</div>

<div class="hero-section" style="background:linear-gradient(135deg,#1b1002 0%,#121212 100%);border:1px solid #3d2403;border-radius:14px;padding:30px 28px 24px;margin-bottom:22px;">
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="display:inline-block;background:#381d02;color:#ff9800;font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #542f02;">📊 Box Office Comparison</span>
      <span style="display:inline-block;background:#1e1e1e;color:#888;font-size:0.68rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a2a2a;">Odia Film Rankings</span>
    </div>
    <h1 style="color:#fff;font-size:clamp(1.2rem,4.5vw,1.6rem);line-height:1.3;font-weight:800;margin:0 0 14px;word-break:break-word;">
      \${title}
    </h1>
    <p style="color:#bbb;font-size:0.98rem;line-height:1.85;margin:0 0 16px;">
      \${ai.introParagraph}
    </p>
</div>

<nav aria-label="Table of contents" style="\${css.card}padding:18px 24px;">
  <strong style="color:#888;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;">On this page</strong>
  <ul style="margin:10px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;">
    \${toc.map(([label, id]) => \`<li><a href="#\${id}" style="color:#7ec8e3;text-decoration:none;font-size:0.85rem;">\${label}</a></li>\`).join("")}
  </ul>
</nav>

<section id="ranking-context" style="\${css.card}">
  <h2 style="\${css.h2}">Ranking Context</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.rankingContextSection}
  </p>
</section>

<section id="comparison-analysis" style="\${css.card}">
  <h2 style="\${css.h2}">Comparative Data Analysis</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0 0 18px;">
    \${ai.comparisonParagraph}
  </p>
  <div style="overflow-x:auto;">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;min-width:350px;">
      <thead>
        <tr>
          <th style="\${css.th}">Movie Name</th>
          <th style="\${css.th}">First Week Net (Odia Box Office)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:rgba(255,152,0,0.08);">
          <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ff9800;font-weight:800;">\${movieName} (Current)</td>
          <td style="padding:11px 14px;border-bottom:1px solid #1e1e1e;color:#ff9800;font-weight:800;font-size:0.98rem;">\${totalNetStr}</td>
        </tr>
        \${dataRows}
      </tbody>
    </table>
  </div>
</section>

<section id="opening-weekend" style="\${css.card}">
  <h2 style="\${css.h2}">Opening Weekend Context</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.openingWeekendCompareSection}
  </p>
</section>

<section id="verdict-comparison" style="\${css.card}">
  <h2 style="\${css.h2}">Comparison Verdict</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.verdictComparisonSection}
  </p>
</section>

<section id="industry-impact" style="\${css.card}">
  <h2 style="\${css.h2}">Broader Industry Impact</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.industryImpactSection}
  </p>
</section>

<section id="conclusion" style="\${css.card}">
  <h2 style="\${css.h2}">Conclusion</h2>
  <p style="color:#ccc;line-height:1.8;font-size:0.95rem;margin:0;">
    \${ai.conclusionParagraph}
  </p>
  <p style="font-size:0.75rem;color:#555;margin-top:15px;">
    * All comparison figures are based on estimates. Back to <a href="\${movieUrl}" style="color:#ff9800;text-decoration:underline;">\${movieName} Main Page</a>.
  </p>
</section>

\${relatedMovies.length ? \`
<section id="related-movies">
  \${buildRelatedMoviesHtml(relatedMovies, "#ff9800")}
</section>\` : ""}
\\\`;
}`;

content = content.replace(regexWeekend, newWeekend);
content = content.replace(regexMilestone, newMilestone);
content = content.replace(regexComparison, newComparison);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully replaced 3 HTML builders!');
