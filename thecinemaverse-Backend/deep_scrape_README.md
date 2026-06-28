# 🎬 Ollipedia Deep Scraper v3 — `deep_scrape.js`

Scrapes **every Odia film from 1936 to today** from Wikipedia + IMDB and fills your MongoDB with rich data — no API key needed.

---

## What data is extracted

| Field | Source |
|---|---|
| Title, release date | Wikipedia year-list page |
| Director, Producer, Runtime, Budget | Wikipedia film article infobox |
| Box office gross | Wikipedia infobox |
| Synopsis / Plot | Wikipedia "Plot" section (or IMDB if longer) |
| Poster image (800px) | Wikipedia infobox image |
| Genre | Wikipedia categories + IMDB genres (merged) |
| IMDB ID (`tt1234567`) | Wikipedia external links / IMDB suggest API |
| ⭐ **IMDB Rating** (e.g. `7.2`) | IMDB JSON-LD + Next.js data |
| 🗳️ **Vote count** (e.g. `12,450`) | IMDB JSON-LD + Next.js data |
| 🔞 **Content rating** (U, UA, A, PG-13…) | IMDB JSON-LD + Next.js data |
| 🎭 **Full cast with roles** | IMDB title page + /fullcredits |
| 🖼️ **Cast profile photos** | IMDB cast photos (saved directly to Cast docs) |
| Cast bio, DOB | Wikipedia REST API per person |
| Trailer thumbnail | IMDB JSON-LD |
| Keywords | IMDB keywords |

**Smart update logic — never overwrites existing data:**
- Movie exists + missing rating → adds rating only
- Cast member exists + missing photo → adds photo only
- Movie fully populated → skips it entirely

---

## Setup

```bash
# In your backend folder:
npm install axios cheerio mongoose dotenv
```

`.env` file:
```env
MONGO_URI=mongodb+srv://...your connection string...
```

---

## Usage

```bash
# Test on 2023 first — dry run (nothing saved)
node deep_scrape.js 2023 --limit 5 --dry-run

# Scrape a single year
node deep_scrape.js 2024

# Scrape multiple years
node deep_scrape.js 2022 2023 2024

# Fill IMDB ratings/votes for all existing movies (fast, no Wikipedia)
node deep_scrape.js --imdb-only

# Fill cast photos and bios from Wikipedia only
node deep_scrape.js --cast-only

# Scrape everything 1936 → today (run overnight)
node deep_scrape.js

# Skip cast Wikipedia enrichment for speed
node deep_scrape.js --movies-only
```

---

## IMDB data — how it works (no API key!)

IMDB embeds structured JSON-LD data on every title page:
```
https://www.imdb.com/title/tt1234567/
```
The scraper reads `<script type="application/ld+json">` and the React `__NEXT_DATA__` block which contains:
- `aggregateRating.ratingValue` → star rating
- `aggregateRating.ratingCount` → vote count
- `contentRating` → U / UA / A / PG-13 / R etc.
- `actor[]` → cast names
- `director[]` → directors
- `description` → plot
- `genre[]` → genres
- `trailer.thumbnailUrl` → trailer image

For full cast with **roles + photos**, it also scrapes:
```
https://www.imdb.com/title/tt1234567/fullcredits
```

IMDB movies are found via the free suggest API:
```
https://v2.sg.media-imdb.com/suggestion/x/MOVIE_TITLE.json
```

---

## Recommended workflow

### Starting fresh
```bash
# Quick pass: get all movies + ratings (skip cast Wiki enrichment)
node deep_scrape.js --movies-only

# Then enrich cast photos/bios from Wikipedia
node deep_scrape.js --cast-only
```

### Already have movies, just want IMDB ratings
```bash
node deep_scrape.js --imdb-only
```

### Keep data fresh (run monthly)
```bash
node deep_scrape.js 2025 2026
```

---

## New fields added to MovieSchema (add to server.js if not already there)

```js
imdbVotes:     { type: String, default: "" },
contentRating: { type: String, default: "" },
```
> `imdbId`, `imdbRating`, and `runtime` are already in your schema.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| IMDB ratings missing | Run `node deep_scrape.js --imdb-only` |
| IMDB blocked (403) | Add a 2–3 second delay; IMDB rate-limits aggressive scrapers |
| Cast photos missing | Run `node deep_scrape.js --cast-only` |
| Some movies not found on IMDB | They may not be listed; check manually and add `imdbId` in Admin Portal |
| Duplicate cast entries | Use Admin Portal to merge duplicates |
