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
