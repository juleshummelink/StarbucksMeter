# SEO Improvement: Pre-rendered HTML Snapshot

**Date:** 2026-04-09  
**Goal:** Improve Google indexing speed and ranking by making page content visible without JavaScript execution.

---

## Problem

The StarbucksMeter price table is entirely JS-rendered. Google places JS-rendered pages in a slower "second wave" crawl queue. The page currently has strong meta/OG/JSON-LD SEO, but the main content — the price comparison table — is invisible to crawlers until JS runs.

## Solution: Pre-rendered HTML Snapshot

After every successful scrape, the server writes a static `public/index.html` with the price table baked in as plain HTML. Google crawls this and sees real content immediately. Client-side JS still runs and replaces the table with the full interactive version for users.

---

## Components

### 1. `views/index.html` (template)
Current `public/index.html` moved to `views/index.html`. Acts as the source-of-truth template. Two changes from the current file:

- The `<table id="price-table">` element in the template contains only `<!-- SNAPSHOT_TABLE -->` as its sole child — the renderer replaces this marker with the full `<thead>` + `<tbody>` block
- The `price-table-wrap` div keeps its `hidden` class in the template; the renderer removes it via string replacement on the class attribute

### 2. `render-snapshot.js` (new module)
Exports a single function: `renderSnapshot(prices, lastUpdated)`

**Responsibilities:**
- Read `views/index.html` template
- Build static `<thead>` + `<tbody>` HTML from `prices` array using the same `STORE_ORDER` and `TYPE_ORDER` as `app.js`
- Static table includes:
  - Store name text headers (no logos — decorative only)
  - Coffee type label per row
  - EUR-formatted price per cell (`€ X,XX`)
  - CSS class `cheapest` on the cheapest price cell per row
  - `<a href="...">` product link per cell
  - "Goedkoopst" text label on cheapest cell
- Remove `hidden` from `price-table-wrap` class in the output HTML
- Add `hidden` class to `state-empty` div in the output HTML via string replacement (the template has `id="state-empty" class="state-card"` → rendered as `id="state-empty" class="state-card hidden"`)
- Write result to `public/index.html`
- Write updated `public/sitemap.xml` with `<lastmod>` set to `lastUpdated` (ISO 8601 date, `YYYY-MM-DD` format)

**Does NOT do:**
- Render promo badges, sale badges, or the history chart (JS handles these; they are not needed for crawlability)
- Replace `public/index.html` on startup — only after a successful scrape

### 3. `server.js` (2-line change)
```js
const { renderSnapshot } = require('./render-snapshot');
// After: history.addEntry(cachedPrices); — in both cron and manual scrape paths:
renderSnapshot(cachedPrices, lastUpdated).catch(err => console.error('[snapshot] Failed:', err.message));
```

Called in both `runScheduledScrape()` and the `/api/prices` handler, after `history.addEntry()`.

---

## Data Flow

```
Scrape completes
  → cachedPrices set, lastUpdated = new Date().toISOString()
  → history.addEntry(cachedPrices)
  → renderSnapshot(cachedPrices, lastUpdated)
      → reads views/index.html
      → builds static table HTML
      → writes public/index.html   ← Google crawls this
      → writes public/sitemap.xml  ← lastmod updated
```

---

## Static Table Structure

```html
<table id="price-table">
  <thead>
    <tr>
      <th></th>
      <th>Dirk</th>
      <th>Albert Heijn</th>
      <th>Jumbo</th>
      <th>Plus</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="type-cell">Caramel Macchiato</td>
      <td class="price-cell cheapest">
        € 2,49 <span>Goedkoopst</span>
        <a href="[url]" rel="noopener">Bekijk →</a>
      </td>
      <td class="price-cell">€ 2,79 ...</td>
      ...
    </tr>
    ...
  </tbody>
</table>
```

---

## Sitemap Update

`public/sitemap.xml` after each scrape:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://starbucks.bytemountains.com/</loc>
    <changefreq>daily</changefreq>
    <lastmod>2026-04-09</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>
```

---

## What Does NOT Change

- `public/app.js` — no changes; JS still builds the full interactive table on load
- `public/style.css` — no changes; static table reuses existing CSS classes
- All API routes — no changes
- Demo mode — `renderSnapshot` is not called in demo mode (scrape never runs)

---

## Out of Scope

- og:image redesign (1200×630 social preview) — separate task
- Richer JSON-LD (Product/Offer schema) — separate task
- Server-side rendering on every request — deliberately avoided (snapshot is simpler and sufficient)
