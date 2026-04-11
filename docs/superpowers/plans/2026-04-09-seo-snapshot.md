# SEO Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every scrape, write a pre-rendered `public/index.html` with the price table baked in as static HTML so Google can crawl content without running JavaScript.

**Architecture:** A new `render-snapshot.js` module reads a template at `views/index.html`, builds a static price table from scraped data, injects it into the template, and writes `public/index.html` + `public/sitemap.xml`. `server.js` calls this module after every successful scrape (both cron and manual).

**Tech Stack:** Node.js built-in `fs.promises`, `node:test` for tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `views/index.html` | HTML template with `<!-- SNAPSHOT_TABLE -->` marker |
| Create | `render-snapshot.js` | Builds + writes pre-rendered HTML and sitemap |
| Create | `tests/render-snapshot.test.js` | Unit + integration tests |
| Modify | `server.js` | Import + call `renderSnapshot` after scrapes |

---

### Task 1: Create the HTML template

**Files:**
- Create: `views/index.html` (copied from `public/index.html` with table interior replaced)

The template is identical to `public/index.html` except the `<table id="price-table">` interior is replaced with a single marker comment. The renderer replaces this marker at runtime.

- [ ] **Step 1: Create views/ directory and copy index.html**

```bash
mkdir views
cp public/index.html views/index.html
```

- [ ] **Step 2: Replace the table interior in views/index.html**

In `views/index.html`, find this block (lines 134–145):
```html
    <div id="price-table-wrap" class="hidden">
      <table id="price-table">
        <thead>
          <tr id="store-header-row">
            <th class="type-col"></th>
            <!-- store headers injected by JS -->
          </tr>
        </thead>
        <tbody id="table-body">
          <!-- rows injected by JS -->
        </tbody>
      </table>
    </div>
```

Replace it with:
```html
    <div id="price-table-wrap" class="hidden">
      <table id="price-table"><!-- SNAPSHOT_TABLE --></table>
    </div>
```

- [ ] **Step 3: Commit**

```bash
git add views/index.html
git commit -m "feat: add views/index.html template with SNAPSHOT_TABLE marker"
```

---

### Task 2: Write failing tests for render-snapshot.js

**Files:**
- Create: `tests/render-snapshot.test.js`

- [ ] **Step 1: Create the test file**

Create `tests/render-snapshot.test.js`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { renderSnapshot, buildTableHtml } = require('../render-snapshot');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_PRICES = [
  { type: 'Caramel',    store: 'Dirk',  currentPrice: 2.49, displayPrice: 2.49, url: 'https://dirk.nl/caramel' },
  { type: 'Caramel',    store: 'AH',    currentPrice: 2.79, displayPrice: 2.79, url: 'https://ah.nl/caramel'   },
  { type: 'Caramel',    store: 'Jumbo', currentPrice: 2.69, displayPrice: 2.69, url: 'https://jumbo.nl/caramel'},
  { type: 'Caramel',    store: 'Plus',  currentPrice: 2.89, displayPrice: 2.89, url: 'https://plus.nl/caramel' },
  { type: 'Cappuccino', store: 'Dirk',  currentPrice: 2.49, displayPrice: 2.49, url: 'https://dirk.nl/capp'   },
  { type: 'Cappuccino', store: 'AH',    currentPrice: 2.79, displayPrice: 2.79, url: 'https://ah.nl/capp'     },
  { type: 'Cappuccino', store: 'Jumbo', currentPrice: null,  displayPrice: null,  url: null                    },
  { type: 'Cappuccino', store: 'Plus',  currentPrice: 2.59, displayPrice: 2.59, url: 'https://plus.nl/capp'   },
];

const MINIMAL_TEMPLATE = `<html>
<body>
<div id="state-empty" class="state-card"><p>Klik op vernieuwen</p></div>
<div id="price-table-wrap" class="hidden">
  <table id="price-table"><!-- SNAPSHOT_TABLE --></table>
</div>
</body>
</html>`;

// ── buildTableHtml ────────────────────────────────────────────────────────────

test('buildTableHtml includes all store name headers', () => {
  const html = buildTableHtml(SAMPLE_PRICES);
  assert.ok(html.includes('<th>Dirk</th>'),         'missing Dirk header');
  assert.ok(html.includes('<th>Albert Heijn</th>'), 'missing AH header');
  assert.ok(html.includes('<th>Jumbo</th>'),        'missing Jumbo header');
  assert.ok(html.includes('<th>Plus</th>'),         'missing Plus header');
});

test('buildTableHtml includes coffee type labels', () => {
  const html = buildTableHtml(SAMPLE_PRICES);
  assert.ok(html.includes('Caramel Macchiato'), 'missing Caramel label');
  assert.ok(html.includes('Cappuccino'),        'missing Cappuccino label');
});

test('buildTableHtml formats prices correctly', () => {
  const html = buildTableHtml(SAMPLE_PRICES);
  // € + non-breaking space + 2,49
  assert.ok(html.includes('2,49'), 'missing price 2,49');
  assert.ok(html.includes('2,79'), 'missing price 2,79');
});

test('buildTableHtml marks cheapest cell', () => {
  const html = buildTableHtml(SAMPLE_PRICES);
  assert.ok(html.includes('class="price-cell cheapest"'), 'missing cheapest class');
  assert.ok(html.includes('Goedkoopst'),                  'missing Goedkoopst label');
});

test('buildTableHtml shows dash for unavailable price', () => {
  const html = buildTableHtml(SAMPLE_PRICES);
  assert.ok(html.includes('price-unavailable'), 'missing unavailable class for null price');
});

test('buildTableHtml includes product links', () => {
  const html = buildTableHtml(SAMPLE_PRICES);
  assert.ok(html.includes('href="https://dirk.nl/caramel"'), 'missing dirk product link');
});

// ── renderSnapshot integration ────────────────────────────────────────────────

test('renderSnapshot writes pre-rendered HTML to outputPath', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbtest-'));
  const templatePath = path.join(tmpDir, 'index.template.html');
  const outputPath   = path.join(tmpDir, 'index.html');
  const sitemapPath  = path.join(tmpDir, 'sitemap.xml');

  fs.writeFileSync(templatePath, MINIMAL_TEMPLATE, 'utf8');

  await renderSnapshot(SAMPLE_PRICES, '2026-04-09T06:00:00.000Z', {
    templatePath,
    outputPath,
    sitemapPath,
  });

  const html = fs.readFileSync(outputPath, 'utf8');

  // price-table-wrap should NOT have hidden class
  assert.ok(!html.includes('id="price-table-wrap" class="hidden"'), 'price-table-wrap still hidden');
  assert.ok(html.includes('id="price-table-wrap"'),                  'price-table-wrap div missing');

  // state-empty should have hidden class
  assert.ok(html.includes('id="state-empty" class="state-card hidden"'), 'state-empty not hidden');

  // SNAPSHOT_TABLE marker should be replaced
  assert.ok(!html.includes('<!-- SNAPSHOT_TABLE -->'), 'marker not replaced');

  // should contain price content
  assert.ok(html.includes('Caramel Macchiato'), 'missing coffee type');
  assert.ok(html.includes('2,49'),              'missing price');
});

test('renderSnapshot writes sitemap with lastmod', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbtest-'));
  const templatePath = path.join(tmpDir, 'index.template.html');
  const outputPath   = path.join(tmpDir, 'index.html');
  const sitemapPath  = path.join(tmpDir, 'sitemap.xml');

  fs.writeFileSync(templatePath, MINIMAL_TEMPLATE, 'utf8');

  await renderSnapshot(SAMPLE_PRICES, '2026-04-09T06:00:00.000Z', {
    templatePath,
    outputPath,
    sitemapPath,
  });

  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  assert.ok(sitemap.includes('<lastmod>2026-04-09</lastmod>'), 'missing lastmod in sitemap');
  assert.ok(sitemap.includes('starbucks.bytemountains.com'),   'missing site URL in sitemap');
});
```

- [ ] **Step 2: Run tests to confirm they fail (module not found)**

```bash
node --test tests/render-snapshot.test.js
```

Expected output: error like `Cannot find module '../render-snapshot'`

- [ ] **Step 3: Commit the test file**

```bash
git add tests/render-snapshot.test.js
git commit -m "test: add failing tests for render-snapshot"
```

---

### Task 3: Implement render-snapshot.js

**Files:**
- Create: `render-snapshot.js`

- [ ] **Step 1: Create render-snapshot.js**

Create `render-snapshot.js` in the project root:

```js
'use strict';

const fs   = require('fs');
const path = require('path');

const DEFAULT_TEMPLATE_PATH = path.join(__dirname, 'views',  'index.html');
const DEFAULT_OUTPUT_PATH   = path.join(__dirname, 'public', 'index.html');
const DEFAULT_SITEMAP_PATH  = path.join(__dirname, 'public', 'sitemap.xml');

const STORE_ORDER = ['Dirk', 'AH', 'Jumbo', 'Plus'];
const STORE_NAMES = { Dirk: 'Dirk', AH: 'Albert Heijn', Jumbo: 'Jumbo', Plus: 'Plus' };

const TYPE_ORDER  = ['Caramel', 'Cappuccino', 'NoSugar', 'TrippleShot', 'TrippleShotNoSugar'];
const TYPE_LABELS = {
  Caramel:             'Caramel Macchiato',
  Cappuccino:          'Cappuccino',
  NoSugar:             'No Added Sugar',
  TrippleShot:         'Triple Shot Espresso',
  TrippleShotNoSugar:  'Triple Shot No Added Sugar',
};

function fmtPrice(price) {
  return '\u20ac\u00a0' + price.toFixed(2).replace('.', ',');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Build the static <thead> + <tbody> HTML for the price table.
 * Exported for unit testing.
 */
function buildTableHtml(prices) {
  // Build lookup index: index[type][store] = entry
  const index = {};
  for (const entry of prices) {
    if (!index[entry.type]) index[entry.type] = {};
    index[entry.type][entry.store] = entry;
  }

  // thead
  const storeHeaders = STORE_ORDER.map(s => `<th>${STORE_NAMES[s]}</th>`).join('');
  const thead = `<thead><tr><th></th>${storeHeaders}</tr></thead>`;

  // tbody
  let tbody = '<tbody>';
  for (const typeKey of TYPE_ORDER) {
    const typeData = index[typeKey] ?? {};
    const allPrices = STORE_ORDER
      .map(s => typeData[s]?.displayPrice ?? typeData[s]?.currentPrice)
      .filter(p => p != null);
    const cheapest = allPrices.length ? Math.min(...allPrices) : null;
    const typeLabel = TYPE_LABELS[typeKey] ?? typeKey;

    let row = `<tr><td class="type-cell">${typeLabel}</td>`;
    for (const storeKey of STORE_ORDER) {
      const entry = typeData[storeKey];
      const displayPrice = entry?.displayPrice ?? entry?.currentPrice;

      if (!entry || displayPrice == null) {
        row += `<td class="price-cell"><span class="price-unavailable">\u2013</span></td>`;
      } else {
        const isCheapest = cheapest !== null && displayPrice === cheapest;
        const cls = 'price-cell' + (isCheapest ? ' cheapest' : '');
        const cheapestLabel = isCheapest ? '<span>Goedkoopst</span>' : '';
        const link = entry.url
          ? `<a class="price-link" href="${escapeAttr(entry.url)}" rel="noopener">Bekijk \u2192</a>`
          : '';
        row += `<td class="${cls}"><div class="price-current">${fmtPrice(displayPrice)}</div>${cheapestLabel}${link}</td>`;
      }
    }
    row += '</tr>';
    tbody += row;
  }
  tbody += '</tbody>';

  return thead + tbody;
}

/**
 * Render a pre-built price table into the HTML template and write to disk.
 * Also updates the sitemap <lastmod>.
 *
 * @param {Array}  prices      - Array of price objects from scrapeAll()
 * @param {string} lastUpdated - ISO 8601 timestamp string
 * @param {Object} [opts]      - Optional path overrides (for testing)
 */
async function renderSnapshot(prices, lastUpdated, {
  templatePath = DEFAULT_TEMPLATE_PATH,
  outputPath   = DEFAULT_OUTPUT_PATH,
  sitemapPath  = DEFAULT_SITEMAP_PATH,
} = {}) {
  const template = await fs.promises.readFile(templatePath, 'utf8');

  const tableHtml = buildTableHtml(prices);

  const html = template
    .replace('<!-- SNAPSHOT_TABLE -->', tableHtml)
    .replace('id="price-table-wrap" class="hidden"', 'id="price-table-wrap"')
    .replace('id="state-empty" class="state-card"', 'id="state-empty" class="state-card hidden"');

  await fs.promises.writeFile(outputPath, html, 'utf8');

  // Update sitemap lastmod (YYYY-MM-DD)
  const dateStr = lastUpdated.slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://starbucks.bytemountains.com/</loc>
    <changefreq>daily</changefreq>
    <lastmod>${dateStr}</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>
`;
  await fs.promises.writeFile(sitemapPath, sitemap, 'utf8');
}

module.exports = { renderSnapshot, buildTableHtml };
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test tests/render-snapshot.test.js
```

Expected output: all tests pass, output shows `✔` for each test name. Zero failures.

- [ ] **Step 3: Commit**

```bash
git add render-snapshot.js
git commit -m "feat: add render-snapshot module for SEO pre-rendering"
```

---

### Task 4: Wire render-snapshot into server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the import at the top of server.js**

At line 7, after `const { DEMO_PRICES } = require('./demo-data');`, add:

```js
const { renderSnapshot } = require('./render-snapshot');
```

- [ ] **Step 2: Call renderSnapshot in the manual scrape path**

In the `/api/prices` handler, find this block (around line 92–94):
```js
    cachedPrices = await scrapeAll(pushProgress);
    lastUpdated = new Date().toISOString();
    history.addEntry(cachedPrices);
    // Signal completion to all SSE clients
    pushProgress({ done: true });
```

Replace it with:
```js
    cachedPrices = await scrapeAll(pushProgress);
    lastUpdated = new Date().toISOString();
    history.addEntry(cachedPrices);
    renderSnapshot(cachedPrices, lastUpdated).catch(err =>
      console.error('[snapshot] Failed to render snapshot:', err.message)
    );
    // Signal completion to all SSE clients
    pushProgress({ done: true });
```

- [ ] **Step 3: Call renderSnapshot in the cron scrape path**

In `runScheduledScrape()`, find this block (around line 120–124):
```js
    cachedPrices = await scrapeAll(pushProgress);
    lastUpdated = new Date().toISOString();
    history.addEntry(cachedPrices);
    pushProgress({ done: true });
    console.log('[cron] Scheduled scrape complete.');
```

Replace it with:
```js
    cachedPrices = await scrapeAll(pushProgress);
    lastUpdated = new Date().toISOString();
    history.addEntry(cachedPrices);
    renderSnapshot(cachedPrices, lastUpdated).catch(err =>
      console.error('[snapshot] Failed to render snapshot:', err.message)
    );
    pushProgress({ done: true });
    console.log('[cron] Scheduled scrape complete.');
```

- [ ] **Step 4: Verify the server still starts cleanly**

```bash
node server.js --demo
```

Expected output:
```
StarbucksMeter running at http://localhost:3000  [DEMO MODE]
[demo] Scraping disabled — serving synthetic data. History and cache are not written.
```

No errors. Stop with Ctrl+C.

- [ ] **Step 5: Verify snapshot generation manually**

Start the server normally (requires network access for scraping):
```bash
node server.js
```

In a second terminal, trigger a scrape:
```bash
curl "http://localhost:3000/api/prices?refresh=true"
```

After it completes, check that `public/index.html` now contains price data:
```bash
grep -c "Caramel Macchiato" public/index.html
```

Expected output: `1` or more (the count of matches).

Also check the sitemap:
```bash
grep "lastmod" public/sitemap.xml
```

Expected output: `    <lastmod>2026-04-09</lastmod>` (today's date).

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: call renderSnapshot after each scrape for SEO pre-rendering"
```

---

## Post-Implementation: Submit sitemap to Google

After deploying, submit the sitemap in Google Search Console:

1. Go to **Search Console → Indexing → Sitemaps**
2. Enter `https://starbucks.bytemountains.com/sitemap.xml`
3. Click Submit

The `<lastmod>` will update automatically after every daily scrape.
