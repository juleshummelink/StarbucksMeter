'use strict';

const { priceFromJsonLd, originalPriceFromVanText, trySelectors, diagnose } = require('./utils');

// DOM fallback selectors (price split across two spans)
const PRICE_SELECTORS = ['.price-large', '[class*="price-large"]'];

async function scrape(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Primary: JSON-LD offers.price (handles @graph wrapper correctly via utils)
  let currentPrice = await priceFromJsonLd(page);

  // Fallback: DOM split-price (.price-large = euros, .price-small = cents)
  if (currentPrice === null) {
    currentPrice = await page.evaluate(() => {
      const large = document.querySelector('.price-large, [class*="price-large"]');
      const small = document.querySelector('.price-small, [class*="price-small"]');
      if (large && small) {
        const euros = large.textContent.trim();
        const cents = small.textContent.trim().padStart(2, '0');
        const p = parseFloat(`${euros}.${cents}`);
        return isNaN(p) ? null : p;
      }
      return null;
    });
  }

  if (currentPrice === null) {
    await diagnose(page, 'Dirk');
  }

  // Original price: "van X,XX" text appears when item is on sale
  const originalPrice = await originalPriceFromVanText(page);
  const validOriginal =
    originalPrice !== null && currentPrice !== null && originalPrice > currentPrice
      ? originalPrice
      : null;

  return { currentPrice, originalPrice: validOriginal };
}

module.exports = { scrape };
