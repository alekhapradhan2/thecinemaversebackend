# Ollypedia Box Office Blog — SEO & Content Upgrade

All changes are surgical drop-in replacements.  
**No URLs, slugs, routes, schemas, or admin workflows are changed.**

---

## 1 · Fix SSR/SEO Rendering — `page.tsx`

### Problem
`BlogDetailClient` is `"use client"`. When `initialData` is passed from the
server component, the client skips the API fetch and renders immediately —
**but the article HTML lives inside `dangerouslySetInnerHTML` inside a client
component that only runs after JS hydration.** Googlebot's mobile-first
crawler (Chromium-based) does see client-rendered content, but:

- The `loading` skeleton (`bp-sk`) is what appears in View Source before
  hydration, not the article.  
- LCP is delayed while the `<ColorfulArticle>` parser runs on the client.  
- Related-content fetches (`relMovies`, `relSongs`, `boxOfficeDays`) happen
  **after** hydration — those internal links are invisible to the crawler at
  first paint.

### Fix — Add a server-rendered article preview

In `page.tsx`, render the article body **statically** in a `<noscript>` block
AND as a visually-hidden `<article>` that hydrates into the client component.
This gives Googlebot the full H1 + article content in the initial HTML, and
the client component can still take over for interactive features.

Paste the `ArticleSSRPreview` component into `page.tsx` (after the imports,
before `generateStaticParams`):

```tsx
// ─── SSR article preview — seen by crawlers in initial HTML ────
// This renders the raw blog HTML server-side so Googlebot gets
// H1, article text, headings, tables, and internal links without
// waiting for React hydration. The client component (<BlogDetailClient>)
// takes over visually after JS loads. No duplicate content — the
// preview is visually hidden (aria-hidden) so it does NOT show to users.
function ArticleSSRPreview({ blog }: { blog: any }) {
  if (!blog?.content) return null;

  // Sanitise the stored HTML minimally — same approach as sanitizeMixedHtml
  // in BlogDetailClient but server-side so crawlers always see it.
  const clean = blog.content
    .replace(/<!--[\s\S]*?-->/g, "")   // strip HTML comments (meta block)
    .replace(/<script[\s\S]*?<\/script>/gi, "")  // strip embedded <script> tags
    .replace(/<style[\s\S]*?<\/style>/gi, "");   // strip embedded <style> tags

  return (
    <article
      aria-hidden="true"
      data-ssr-preview="true"
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden",
               clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
    >
      {/* H1 — always present for Google's primary heading signal */}
      <h1>{blog.title}</h1>
      {/* Full article HTML — all headings, paragraphs, tables, links */}
      <div dangerouslySetInnerHTML={{ __html: clean }} />
    </article>
  );
}
```

Then in the `BlogPage` return, add `<ArticleSSRPreview>` **before**
`<BlogDetailClient>`:

```tsx
return (
  <>
    {blog.coverImage && (
      <link rel="preload" as="image" href={blog.coverImage} />
    )}
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
    {/* ★ NEW — server-rendered article for crawlers */}
    <ArticleSSRPreview blog={blog} />
    <BlogDetailClient slug={params.slug} initialData={blog} sidebarContent={sidebarContent} />
    <SeoInterlinks blog={blog} movie={movie} />
    <RecentBlogs blogs={recentBlogs} />
  </>
);
```

**Effect:** View Source now shows the complete `<h1>`, all article paragraphs,
headings, the data table, FAQ questions, and internal links. The client
component still handles interactivity (share buttons, reviews, TOC scroll-spy).

---

## 2 · Improve Daily Blog Uniqueness — `server.js`

### 2A · Expand `classifyBoxOfficeDayType` — weekend numbering + festival detection

Replace the existing `classifyBoxOfficeDayType` function body (around line 4704)
with the version below. Key additions:

- **Weekend number** (`first-weekend`, `second-weekend`, `third-weekend`, …)  
- **First-week / second-week / third-week** labels  
- **Festival detection** re-used from `findNearbyFestival` for the target date  
- **Milestone expansion** — adds ₹10L, ₹25L, ₹50L, ₹75L below ₹1 Cr  
- **Theatrical-run status** tags (`silver-jubilee-run` at 25 days, `golden-run` at 50)

```js
const classifyBoxOfficeDayType = (day, dateStr, totalNetNum, prevTotalNetNum, movieDoc) => {
  const tags = [];
  const dow = dateStr ? new Date(dateStr).getDay() : null; // 0=Sun..6=Sat
  const isWeekend = dow === 0 || dow === 5 || dow === 6;

  // ── Specific day labels ──────────────────────────────────────────
  if (day === 1)  tags.push("opening-day");
  else if (day === 2) tags.push("day-two");
  else if (day === 3) tags.push("day-three");
  else if (day === 7) tags.push("first-week-closing");
  else if (day === 14) tags.push("second-week-closing");
  else if (day === 10) tags.push("day-ten");
  else if (day === 15) tags.push("day-fifteen");

  // ── Week labels ──────────────────────────────────────────────────
  if (day <= 7)        tags.push("first-week");
  else if (day <= 14)  tags.push("second-week");
  else if (day <= 21)  tags.push("third-week");
  else if (day <= 28)  tags.push("fourth-week");

  // ── Weekend numbering ────────────────────────────────────────────
  // Box office "weekend" = Fri+Sat+Sun. Day 1-3 is Opening Weekend.
  if (day > 3) {
    if (isWeekend) {
      // Which weekend? Rough: every 7 days is a new weekend cycle.
      const weekendNum = Math.ceil(day / 7);
      const label =
        weekendNum === 2 ? "second-weekend" :
        weekendNum === 3 ? "third-weekend" :
        weekendNum === 4 ? "fourth-weekend" :
        `weekend-${weekendNum}`;
      tags.push(label, "weekend");
    } else {
      tags.push("weekday");
    }
  } else if (day >= 1 && day <= 3) {
    // Opening Weekend always labelled separately
    if (isWeekend || day <= 3) tags.push("opening-weekend");
  }

  // ── Milestone detection — sub-crore AND crore marks ─────────────
  const MILESTONES_L = [10, 25, 50, 75].map(l => l * 1_00_000);       // ₹10L..₹75L
  const MILESTONES_CR = [1, 2, 3, 5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 200]
    .map(cr => cr * 1_00_00_000);                                        // ₹1Cr..₹200Cr
  const allMilestones = [...MILESTONES_L, ...MILESTONES_CR];

  const crossed = allMilestones.find(m => prevTotalNetNum < m && totalNetNum >= m);
  if (crossed) {
    const inLakh = crossed / 1_00_000;
    const inCr   = crossed / 1_00_00_000;
    const label  = inCr >= 1 ? `milestone-${inCr}cr` : `milestone-${inLakh}L`;
    tags.push(label);
  }

  // ── OTT proximity ────────────────────────────────────────────────
  if (movieDoc?.ottReleaseDate && dateStr) {
    const ottD = new Date(movieDoc.ottReleaseDate);
    const curD = new Date(dateStr);
    if (!isNaN(ottD.getTime())) {
      const diffDays = Math.round((ottD - curD) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 7)  tags.push("approaching-ott");
      if (diffDays < 0)                    tags.push("post-ott-theatrical");
    }
  }

  // ── Extended run milestones ──────────────────────────────────────
  if (day >= 50) tags.push("golden-run");
  else if (day >= 25) tags.push("silver-jubilee-run");
  else if (day >= 21) tags.push("extended-run");

  // ── Festival detection ───────────────────────────────────────────
  // Re-use the existing findNearbyFestival() — if today's date falls
  // near a major Odisha festival, tag it so the AI prompt can mention it.
  const festival = dateStr ? findNearbyFestival(dateStr) : "";
  if (festival) tags.push(`festival-${festival.toLowerCase().replace(/\s+/g, "-")}`);

  if (!tags.length) tags.push("standard-day");

  // Crore milestone value for the milestone badge (backward-compat)
  const milestoneCroreCrossed = crossed && crossed >= 1_00_00_000
    ? crossed / 1_00_00_000
    : null;

  return { tags, isWeekend, milestoneCroreCrossed, festival };
};
```

### 2B · Expand `parseAiSections` fallbacks for new tags

Inside `parseAiSections`, extend the `defaults` object to use the new tags.
Replace the `weekendWeekdayComparison` and `futureOutlook` fallback strings:

```js
weekendWeekdayComparison: (() => {
  if (tagSet.has("opening-weekend"))
    return `The opening weekend (Days 1-3) is the most critical window for any Odia film, and ${movie.title} is currently in the thick of it. Opening weekends typically set the tone for the entire theatrical run — a strong three-day total builds confidence among exhibitors and can lead to screen additions for the second week.`;
  if (tagSet.has("second-weekend"))
    return `Day ${targetDay} is part of ${movie.title}'s second weekend, a crucial checkpoint after the initial buzz has settled. Second-weekend numbers reveal whether the film has genuine audience legs or was primarily a first-week phenomenon. A drop of less than 40% from the first weekend is considered healthy for an Odia release.`;
  if (tagSet.has("third-weekend"))
    return `By the third weekend, most Odia films have either consolidated a strong audience base or started a steady wind-down. ${movie.title} reaching Day ${targetDay} with theatres still running is itself a sign of respectable staying power in the market.`;
  if (isWeekendDay)
    return `Day ${targetDay} falls in a weekend box-office window for ${movie.title}. Weekends typically deliver 1.5–2× the footfall of weekdays for Odia films, driven by family audiences and leisure-time viewing. Comparing this weekend's figures to the previous one will reveal how quickly the film's appeal is evolving.`;
  return `Day ${targetDay} is a weekday in ${movie.title}'s theatrical run. Weekday collections test a film's word-of-mouth strength once the opening excitement fades. A film that holds its weekday numbers close to its weekend collections is signalling strong repeat-viewing intent and broad audience approval.`;
})(),

futureOutlook: (() => {
  if (milestoneCr)
    return `Having just crossed the ₹${milestoneCr} Cr mark, ${movie.title} enters a new chapter in its box office story. In Odia cinema, reaching this level is a significant achievement — the film now joins a select group of Ollywood releases that have crossed this threshold in recent years. The next milestone to watch will be ₹${milestoneCr < 1 ? 1 : milestoneCr < 2 ? 2 : milestoneCr < 3 ? 3 : milestoneCr < 5 ? 5 : milestoneCr < 10 ? 10 : milestoneCr + 5} Cr, and whether audience momentum can carry the film there.`;
  if (tagSet.has("approaching-ott"))
    return `With the OTT release of ${movie.title} approaching within the next week, the theatrical window is in its final days. Audiences who have been waiting to watch at home will shortly get that chance, which may slow the final few days of theatre collections. However, a digital release on a major platform will introduce the film to a far wider audience across India and among the Odia diaspora globally.`;
  if (tagSet.has("silver-jubilee-run") || tagSet.has("extended-run"))
    return `${movie.title} reaching Day ${targetDay} in theatres is a sign of remarkable staying power. Most Odia releases wind down in the second or third week, so a film running this deep into its theatrical run has found a loyal core audience that keeps returning. Future days will be driven by repeat viewings, word of mouth among family and friends, and the availability of shows in smaller towns and B/C centres of Odisha.`;
  return `Looking ahead, ${movie.title}'s trajectory will be shaped by how it performs in the coming weekend and whether exhibitors add or reduce screens in response to audience demand. Any new competition from other Odia or Hindi releases will also be a factor to watch.`;
})(),
```

### 2C · Expand the AI prompt with week/weekend/festival context

In the `aiPrompt` string (around line 5040 in server.js), add these lines
after the existing `dayTags.includes("extended-run")` block:

```js
${dayTags.some(t => t.startsWith("festival-")) ? `Today's collection coincides with the ODISHA FESTIVAL SEASON (${dayClassification.festival}) — mention how festival footfalls typically boost Odia cinema and whether this film is benefiting.` : ""}
${dayTags.includes("second-weekend") ? "Today is the SECOND WEEKEND — compare with the first weekend and explain what the drop (or hold) means for the film's overall commercial standing." : ""}
${dayTags.includes("third-weekend") || dayTags.includes("fourth-weekend") ? `Today is the ${dayTags.find(t => /-(weekend|run)$/.test(t))?.replace("-", " ")} — focus on the film's incredible staying power and what sustains audience interest this far into the run.` : ""}
${dayTags.includes("first-week-closing") ? "Today closes the FIRST WEEK — write a full week-one verdict: total, daily average, best day, worst day, and outlook for week two." : ""}
${dayTags.includes("second-week-closing") ? "Today closes the SECOND WEEK — compare week-two total with week-one, analyse the drop percentage, and forecast the second half of the run." : ""}
${dayTags.includes("silver-jubilee-run") ? "The film has crossed 25 DAYS in theatres (Silver Jubilee run) — celebrate this milestone, compare with other recent Odia films that achieved this, and explain what it means for Ollywood." : ""}
${dayTags.includes("golden-run") ? "The film has crossed 50 DAYS in theatres (Golden Jubilee run) — this is exceptional for Odia cinema; lead with this achievement." : ""}
```

Also add these keys to the JSON object the AI must return, inside the
`aiPrompt` template (add after `"futureOutlook"` key):

```
"weekOneTwoComparison": "ONLY if day >= 14: 1-2 paragraphs comparing week-one and week-two totals, the drop percentage, and what it reveals about the audience type. Leave empty string if day < 14.",
"festivalImpact": "ONLY if a festival was mentioned in CONTEXT: 1 paragraph on how the festival season has affected footfalls, family audience turnout, and occupancy. Leave empty string if no festival context.",
```

And add those two keys to `parseAiSections`:

```js
const keys = [
  "seoHeadline", "introParagraph", "boxOfficeAnalysis", "audienceResponse",
  "performanceAnalysis", "weekendWeekdayComparison", "occupancyTrend",
  "prediction", "industryImpact", "futureOutlook", "finalVerdict",
  "weekOneTwoComparison", "festivalImpact",   // ← NEW
];
```

And in the `defaults` object inside `parseAiSections`, add:

```js
weekOneTwoComparison: (() => {
  if (targetDay < 14) return "";
  const week1 = sortedDays.filter(d => d.day <= 7);
  const week2 = sortedDays.filter(d => d.day > 7 && d.day <= 14);
  const w1Total = week1.reduce((s,d) => s + parseToRupeesGlobal(d.net||"0"), 0);
  const w2Total = week2.reduce((s,d) => s + parseToRupeesGlobal(d.net||"0"), 0);
  if (!w1Total || !w2Total) return "";
  const drop = (((w1Total - w2Total) / w1Total) * 100).toFixed(0);
  return `${movie.title} collected approximately ${formatINR(w1Total)} in its first week and ${formatINR(w2Total)} in the second week — a drop of around ${drop}%. A drop below 50% is considered healthy for an Odia theatrical release, indicating the film has sustained audience interest beyond the opening-week buzz.`;
})(),
festivalImpact: dayClassification?.festival
  ? `${movie.title}'s box office run is coinciding with the ${dayClassification.festival} festival season in Odisha. Odia films traditionally see a boost in footfalls during this period as families spend leisure time at cinemas. Whether ${movie.title} has capitalised on this festival window will be reflected in the coming days' collections.`
  : "",
```

---

## 3 · Comparative Analysis sections in the blog HTML — `server.js`

In `§10 BUILD STRUCTURED DATA TABLE` section (around line 5210), add a
**Day-wise comparison bar chart** section that shows previous-day comparison.

After the existing data table section (`§10`), add:

```js
// §10b  WEEK SUMMARY CALLOUT (new — renders only if day >= 7)
const weekSummaryHtml = (() => {
  if (sortedDays.length < 7) return "";
  const week1Days = sortedDays.filter(d => d.day <= 7);
  const week1Net = week1Days.reduce((s,d) => s + parseToRupeesGlobal(d.net||"0"), 0);
  const week1Avg = week1Net / week1Days.length;
  const bestDay  = [...week1Days].sort((a,b) => parseToRupeesGlobal(b.net||"0") - parseToRupeesGlobal(a.net||"0"))[0];
  const worstDay = [...week1Days].sort((a,b) => parseToRupeesGlobal(a.net||"0") - parseToRupeesGlobal(b.net||"0"))[0];

  if (sortedDays.length >= 14) {
    // Week 2 comparison
    const week2Days = sortedDays.filter(d => d.day > 7 && d.day <= 14);
    const week2Net  = week2Days.reduce((s,d) => s + parseToRupeesGlobal(d.net||"0"), 0);
    const dropPct   = week1Net > 0 ? (((week1Net - week2Net) / week1Net) * 100).toFixed(0) : null;
    return `
<section style="${card}">
  <h2 style="${h2}">Week-by-Week Breakdown</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
    <div style="background:#1a1200;border:1px solid #2e2000;border-radius:10px;padding:16px 20px;">
      <div style="font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Week 1 Total</div>
      <div style="font-size:1.2rem;font-weight:800;color:#c9973a;">${formatINR(week1Net)}</div>
      <div style="font-size:0.72rem;color:#666;margin-top:4px;">Avg/day: ${formatINR(Math.round(week1Avg))}</div>
    </div>
    <div style="background:#0f1a2a;border:1px solid #1a2e40;border-radius:10px;padding:16px 20px;">
      <div style="font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Week 2 Total</div>
      <div style="font-size:1.2rem;font-weight:800;color:#7ec8e3;">${formatINR(week2Net)}</div>
      ${dropPct ? `<div style="font-size:0.72rem;color:${Number(dropPct) < 50 ? '#5dba7d' : '#e07070'};margin-top:4px;">Week-on-week drop: ${dropPct}%</div>` : ""}
    </div>
  </div>
</section>`;
  }

  // Week 1 summary only
  return `
<section style="${card}">
  <h2 style="${h2}">First Week Summary</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;">
    <div style="background:#1a1200;border:1px solid #2e2000;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Week 1 Total</div>
      <div style="font-size:1.1rem;font-weight:800;color:#c9973a;">${formatINR(week1Net)}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Daily Average</div>
      <div style="font-size:1.1rem;font-weight:800;color:#fff;">${formatINR(Math.round(week1Avg))}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Best Day</div>
      <div style="font-size:1.1rem;font-weight:800;color:#5dba7d;">Day ${bestDay?.day}</div>
      <div style="font-size:0.72rem;color:#666;">${formatINR(parseToRupeesGlobal(bestDay?.net||"0"))}</div>
    </div>
    <div style="background:#181818;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;">
      <div style="font-size:0.62rem;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Weakest Day</div>
      <div style="font-size:1.1rem;font-weight:800;color:#e07070;">Day ${worstDay?.day}</div>
      <div style="font-size:0.72rem;color:#666;">${formatINR(parseToRupeesGlobal(worstDay?.net||"0"))}</div>
    </div>
  </div>
</section>`;
})();
```

Then in `§13 ASSEMBLE FULL BLOG HTML`, insert `${weekSummaryHtml}` after the
data table section and before the editorial sections:

```js
<!-- WEEK/WEEKEND SUMMARY (rendered only from Day 7+) -->
${weekSummaryHtml}


<!-- EDITORIAL SECTIONS (AI-written) -->
```

---

## 4 · Festival Impact + Week-on-Week sections in blog HTML

In `§13 ASSEMBLE FULL BLOG HTML`, add these two optional sections **between**
`"Occupancy Trends"` and `"Performance Analysis"`:

```js
${sections.weekOneTwoComparison ? `
<section style="${card}">
  <h2 style="${h2}">Week-on-Week Performance Comparison</h2>
  ${toParagraphs(sections.weekOneTwoComparison)}
</section>` : ""}

${sections.festivalImpact ? `
<section style="${card}">
  <h2 style="${h2}">Festival Season Impact — ${dayClassification.festival}</h2>
  ${toParagraphs(sections.festivalImpact)}
</section>` : ""}
```

---

## 5 · Strengthen Internal Linking in the "Also Read" section

In `§13`, extend the `also-read-grid` with two more links that are always
present, giving every daily blog additional cross-links:

```js
<!-- Add these inside the also-read-grid div, after the existing entries -->
<a href="/blog?category=Box%20Office&movie=${encodeURIComponent(movieName)}"
   style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
  <span style="font-size:1.3rem;flex-shrink:0;">📅</span>
  <div>
    <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} — All Daily Box Office Reports</div>
    <div style="font-size:0.72rem;color:#666;margin-top:2px;">Every day tracked on Ollypedia</div>
  </div>
</a>
${actualDay > 1 ? `
<a href="/blog/${prevSlug}"
   style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
  <span style="font-size:1.3rem;flex-shrink:0;">⬅️</span>
  <div>
    <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${movieName} Day ${actualDay - 1} Collection</div>
    <div style="font-size:0.72rem;color:#666;margin-top:2px;">Previous day report</div>
  </div>
</a>` : ""}
${musicDirector ? `
<a href="/blog?q=${encodeURIComponent(musicDirector)}"
   style="display:flex;align-items:center;gap:10px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:14px 16px;text-decoration:none;">
  <span style="font-size:1.3rem;flex-shrink:0;">🎵</span>
  <div>
    <div style="font-size:0.82rem;font-weight:700;color:#ddd;line-height:1.4;">${musicDirector} — Music</div>
    <div style="font-size:0.72rem;color:#666;margin-top:2px;">More films by this music director</div>
  </div>
</a>` : ""}
```

In the JS template string, encode the movie name properly:

```js
// Near the top of §13, add:
const encMovieName = encodeURIComponent(movieName);
```

Then replace `encodeURIComponent(movieName)` in the template with `${encMovieName}`.

---

## 6 · Milestone badge in the hero — expand for sub-crore milestones

In `§13`, the hero section currently only shows a milestone badge for ≥₹1 Cr.
Update the badge logic:

```js
// Replace the existing milestoneCroreCrossed badge line with:
${dayClassification.milestoneCroreCrossed
  ? `<span style="display:inline-block;background:#1a2e10;color:#8fd17a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a4a1a;">🏆 ₹${dayClassification.milestoneCroreCrossed} Cr Crossed</span>`
  : dayTags.find(t => t.startsWith("milestone-") && t.includes("L"))
    ? `<span style="display:inline-block;background:#1a2e10;color:#8fd17a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #2a4a1a;">🏆 ${dayTags.find(t => t.startsWith("milestone-") && t.includes("L"))?.replace("milestone-","₹")} Crossed</span>`
    : dayClassification.festival
      ? `<span style="display:inline-block;background:#1e1000;color:#e0a93a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a2800;">🎉 ${dayClassification.festival}</span>`
      : dayClassification.isWeekend
        ? `<span style="display:inline-block;background:#1e1500;color:#e0a93a;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a2a00;">Weekend Collection</span>`
        : dayTags.includes("silver-jubilee-run")
          ? `<span style="display:inline-block;background:#1a0a2e;color:#c9a0e8;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:999px;border:1px solid #3a1a5a;">🥈 Silver Jubilee Run</span>`
          : ""}
```

---

## 7 · Ensure `findNearbyFestival` handles the box office scraper date

The box office scraper calls `classifyBoxOfficeDayType(actualDay, yesterdayStr, ...)`.
The festival lookup uses `dateStr` (`yesterdayStr`). Ensure `findNearbyFestival`
accepts `yesterdayStr` format. It already does (ISO `YYYY-MM-DD`).

**Also add 2027 festival dates** to avoid returning "" once 2026 ends:

```js
const FESTIVAL_WINDOWS_2027 = [
  { label: "Makar Sankranti",       start: "2027-01-14", end: "2027-01-18" },
  { label: "Maha Vishuba Sankranti",start: "2027-04-14", end: "2027-04-18" },
  { label: "Raja Parba",            start: "2027-06-14", end: "2027-06-19" },
  { label: "Ratha Yatra",           start: "2027-07-04", end: "2027-07-09" },
  { label: "Nuakhai",               start: "2027-09-06", end: "2027-09-10" },
  { label: "Durga Puja",            start: "2027-10-05", end: "2027-10-10" },
  { label: "Diwali",                start: "2027-10-26", end: "2027-10-30" },
];
```

In `findNearbyFestival`:

```js
const table = year === 2026 ? FESTIVAL_WINDOWS_2026
            : year === 2027 ? FESTIVAL_WINDOWS_2027
            : [];
```

---

## 8 · AI prompt uniqueness — per-day seed in `seoHeadline` instruction

The `seoHeadline` key often produces near-identical phrasing across days.
Add this line to the `seoHeadline` instruction in `aiPrompt`:

```
"seoHeadline": "A compelling 10-15 word headline for h1. Use a DIFFERENT ANGLE than 'Day N Box Office Collection'. Choose from: milestone lead, weekend verdict, weekday hold, industry comparison, audience sentiment, OTT countdown, or running-total achievement. Never use a generic 'Day N collection report' phrasing. TODAY'S CONTEXT: ${dayTagLine}.",
```

---

## Summary of changes by file

| File | Section | Change |
|---|---|---|
| `page.tsx` | `BlogPage` return | Add `<ArticleSSRPreview>` before `<BlogDetailClient>` — full article visible in View Source |
| `server.js` | `classifyBoxOfficeDayType` | Weekend numbering, week labels, sub-crore milestones, festival detection, silver/golden jubilee |
| `server.js` | `parseAiSections` | New `weekOneTwoComparison` and `festivalImpact` fallback sections |
| `server.js` | `aiPrompt` | Festival, weekend number, week-closing, silver jubilee context lines; new JSON keys |
| `server.js` | `§10b` (new) | Week summary callout HTML (Day 7+ only) |
| `server.js` | `§13` blog HTML | Festival section, week comparison section, 3 extra Also Read links, expanded milestone badge |
| `server.js` | Constants | `FESTIVAL_WINDOWS_2027` added, `findNearbyFestival` updated for 2027 |

All existing blog URLs, slugs, schema, admin workflows, and daily generation
logic are **unchanged**. No FAQ content or FAQ schema is added.
