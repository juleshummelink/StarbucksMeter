'use strict';

const {
  priceFromJsonLd,
  originalPriceFromVanText,
  firstEuroPriceOnPage,
  diagnose,
} = require('./utils');

async function scrape(page, url) {
  // Jumbo has had technical difficulties — generous timeout
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Strategy 1: JSON-LD
  let currentPrice = await priceFromJsonLd(page);

  // Strategy 2: any element whose class contains "price" or "Price"
  if (currentPrice === null) {
    currentPrice = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[class*="price"],[class*="Price"]')) {
        const text = el.innerText?.trim() ?? '';
        const m = text.match(/€?\s*(\d+)[,.](\d{2})/);
        if (m) {
          const p = parseFloat(`${m[1]}.${m[2]}`);
          if (p > 0 && p < 20) return p;
        }
      }
      return null;
    });
  }

  // Strategy 3: first € on the page
  if (currentPrice === null) currentPrice = await firstEuroPriceOnPage(page);

  if (currentPrice === null) await diagnose(page, 'Jumbo');

  const originalPrice = await originalPriceFromVanText(page);
  const validOriginal =
    originalPrice !== null && currentPrice !== null && originalPrice > currentPrice
      ? originalPrice
      : null;

  return { currentPrice, originalPrice: validOriginal };
}

module.exports = { scrape };
