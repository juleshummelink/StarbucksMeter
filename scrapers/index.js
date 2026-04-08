'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const dirk = require('./dirk');
const ah = require('./ah');
const plus = require('./plus');
const jumbo = require('./jumbo');

const SCRAPERS = {
  Dirk: dirk,
  AH: ah,
  Plus: plus,
  Jumbo: jumbo,
};

// Map CSV type values to display names and image keys
const TYPE_META = {
  Caramel: { label: 'Caramel Macchiato', image: 'caramel' },
  Cappuccino: { label: 'Cappuccino', image: 'cappuccino' },
  NoSugar: { label: 'No Added Sugar', image: 'nosugar' },
};

function loadUrls() {
  const raw = fs.readFileSync('./recourses/urls.csv', 'utf-8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

async function scrapeAll(onProgress = () => {}) {
  const records = loadUrls();
  const total = records.length;

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
    extraHTTPHeaders: {
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  });

  // Hide webdriver flag so bot-detection is less likely to trigger
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const results = [];
  let step = 0;
  let lastStore = null;

  for (const record of records) {
    const { Store, Type, Url } = record;
    const scraper = SCRAPERS[Store];

    if (!scraper) {
      console.warn(`No scraper found for store: ${Store}`);
      continue;
    }

    // Emit a store-change event whenever we move to a new store
    if (Store !== lastStore) {
      lastStore = Store;
      onProgress({ store: Store, step, total, done: false });
    }

    console.log(`Scraping ${Store} ${Type}...`);
    const page = await context.newPage();

    try {
      const { currentPrice, originalPrice } = await scraper.scrape(page, Url);
      results.push({
        store: Store,
        type: Type,
        typeMeta: TYPE_META[Type] ?? { label: Type, image: Type.toLowerCase() },
        url: Url,
        currentPrice,
        originalPrice,
        onSale: originalPrice !== null && originalPrice > currentPrice,
        error: null,
      });
      console.log(
        `  ${Store} ${Type}: €${currentPrice}${originalPrice ? ` (was €${originalPrice})` : ''}`
      );
    } catch (err) {
      console.error(`  Error scraping ${Store} ${Type}: ${err.message}`);
      results.push({
        store: Store,
        type: Type,
        typeMeta: TYPE_META[Type] ?? { label: Type, image: Type.toLowerCase() },
        url: Url,
        currentPrice: null,
        originalPrice: null,
        onSale: false,
        error: err.message,
      });
    } finally {
      await page.close();
    }

    step++;
    onProgress({ store: Store, step, total, done: false });

    // Small delay between requests to be polite
    await new Promise((r) => setTimeout(r, 500));
  }

  await browser.close();
  return results;
}

module.exports = { scrapeAll };
