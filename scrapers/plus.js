'use strict';

const {
  priceFromJsonLd,
  originalPriceFromVanText,
  firstEuroPriceOnPage,
  diagnose,
} = require('./utils');

async function scrape(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2000);

  // Strategy 1: JSON-LD
  let currentPrice = await priceFromJsonLd(page);

  // Strategy 2: Plus-specific split price pattern.
  // Plus renders prices as two separate elements: "1." (euros) and "99" (cents),
  // with NO € symbol on the item price. The € only appears on the per-liter unit price.
  // We find "X.\nYY" or "X\nYY" in the page text, before the "Toevoegen" (add) button.
  if (currentPrice === null) {
    currentPrice = await page.evaluate(() => {
      const body = document.body.innerText;
      // Grab just the section before "Toevoegen" to avoid picking up other prices on the page
      const beforeAdd = body.split(/Toevoegen|In winkelwagen/i)[0] ?? body;
      // Match: 1–2 digits + optional dot + whitespace + exactly 2 digits
      const m = beforeAdd.match(/\b(\d{1,2})\.?\s*\n\s*(\d{2})\b/);
      if (m) {
        const p = parseFloat(`${m[1]}.${m[2]}`);
        if (p > 0 && p < 20) return p;
      }
      return null;
    });
  }

  // Strategy 3: first € price on the page that is NOT a unit price
  if (currentPrice === null) currentPrice = await firstEuroPriceOnPage(page);

  if (currentPrice === null) await diagnose(page, 'Plus');

  const originalPrice = await originalPriceFromVanText(page);
  const validOriginal =
    originalPrice !== null && currentPrice !== null && originalPrice > currentPrice
      ? originalPrice
      : null;

  return { currentPrice, originalPrice: validOriginal };
}

module.exports = { scrape };
