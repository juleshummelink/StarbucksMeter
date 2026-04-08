'use strict';

/**
 * Promotion test runner.
 *
 * Reads test-urls.csv (or a path you pass as the first argument).
 * CSV format — one row per store, one column per expected promo type:
 *
 *   Store,Normal,Discount,TwoFor,OnePlusOne
 *   AH,https://...,https://...,https://...,https://...
 *
 * Leave a cell empty to skip that combination.
 *
 * Usage:
 *   npm run test-scrape
 *   node test-scrape.js              # uses ./test-urls.csv
 *   node test-scrape.js my-file.csv  # custom path
 */

const path = require('path');
const fs   = require('fs');
const { parse } = require('csv-parse/sync');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const dirk  = require('./scrapers/dirk');
const ah    = require('./scrapers/ah');
const plus  = require('./scrapers/plus');
const jumbo = require('./scrapers/jumbo');

const SCRAPERS = { Dirk: dirk, AH: ah, Plus: plus, Jumbo: jumbo };

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = ['Normal', 'Discount', 'TwoFor', 'OnePlusOne'];

const CATEGORY_LABELS = {
  Normal:     'Normal     ',
  Discount:   'Discount   ',
  TwoFor:     '2 voor X   ',
  OnePlusOne: '1+1 gratis ',
};

// ── Verification ──────────────────────────────────────────────────────────────
function verify(category, result) {
  const price = result.displayPrice ?? result.currentPrice;

  if (result.error)    return { pass: false, reason: `scrape error: ${result.error}` };
  if (price == null)   return { pass: false, reason: 'no price found' };

  switch (category) {
    case 'Normal':
      if (result.onPromo) return { pass: false, reason: `unexpected promo detected: "${result.promoLabel}"` };
      if (result.onSale)  return { pass: false, reason: `unexpected sale detected (was €${result.originalPrice?.toFixed(2)})` };
      return { pass: true };

    case 'Discount':
      if (!result.onSale && !result.onPromo)
        return { pass: false, reason: 'expected a sale/discount but none detected' };
      return { pass: true };

    case 'TwoFor':
      if (!result.onPromo)
        return { pass: false, reason: 'expected multi-buy promo but none detected' };
      if (!/\d+\s*(voor|for)/i.test(result.promoLabel))
        return { pass: false, reason: `got promo "${result.promoLabel}" — expected "X voor Y"` };
      return { pass: true };

    case 'OnePlusOne':
      if (!result.onPromo)
        return { pass: false, reason: 'expected 1+1 promo but none detected' };
      if (!/gratis/i.test(result.promoLabel))
        return { pass: false, reason: `got promo "${result.promoLabel}" — expected "1+1 gratis"` };
      return { pass: true };

    default:
      return { pass: true };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2] ?? path.join(__dirname, 'test-urls.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(csvPath, 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Build flat list of {store, category, url} — skip empty cells
  const jobs = [];
  for (const row of rows) {
    const store = row.Store;
    if (!SCRAPERS[store]) {
      console.warn(`  Unknown store "${store}" — skipping row`);
      continue;
    }
    for (const cat of CATEGORIES) {
      const url = row[cat];
      if (url) jobs.push({ store, category: cat, url });
    }
  }

  if (!jobs.length) {
    console.log('No URLs to test (all cells empty).');
    process.exit(0);
  }

  console.log(`\nTest scraper — ${jobs.length} URL(s) to check\n`);
  console.log('─'.repeat(72));

  // ── Browser setup (mirrors scrapers/index.js) ─────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'nl-NL',
    extraHTTPHeaders: { 'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8' },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // ── Run each job ──────────────────────────────────────────────────────────
  let passed = 0, failed = 0;
  const failures = [];

  for (const job of jobs) {
    const { store, category, url } = job;
    const label = `${store.padEnd(6)} ${CATEGORY_LABELS[category]}`;
    process.stdout.write(`  ${label} … `);

    const page = await context.newPage();
    let result;
    try {
      result = await SCRAPERS[store].scrape(page, url);
      // Compute displayPrice the same way index.js does
      const ep = result.effectivePrice ?? null;
      const cp = result.currentPrice ?? null;
      result.displayPrice =
        ep != null && (cp == null || ep < cp) ? ep : cp;
      result.onPromo = ep != null;
      result.onSale  = result.originalPrice != null && cp != null && result.originalPrice > cp;
      result.error   = null;
    } catch (err) {
      result = {
        currentPrice: null, originalPrice: null, displayPrice: null,
        promoLabel: null, effectivePrice: null, minQty: null,
        onPromo: false, onSale: false, error: err.message,
      };
    } finally {
      await page.close();
    }

    const { pass, reason } = verify(category, result);

    if (pass) {
      passed++;
      const price = result.displayPrice ?? result.currentPrice;
      let detail = `€${price?.toFixed(2)}`;
      if (result.onPromo) detail += ` (${result.promoLabel}, bij ${result.minQty})`;
      else if (result.onSale) detail += ` (was €${result.originalPrice?.toFixed(2)})`;
      console.log(`PASS  ${detail}`);
    } else {
      failed++;
      failures.push({ label: `${store} ${CATEGORY_LABELS[category].trim()}`, reason });
      console.log(`FAIL  ${reason}`);
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  await browser.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(72));
  console.log(`\nSummary: ${passed} passed, ${failed} failed  (${jobs.length} total)\n`);

  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  ✗ ${f.label}: ${f.reason}`);
    }
    console.log('');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
