'use strict';

/**
 * Parse price from Dutch/European formatted text.
 * Handles "€ 1,49", "1,49", "1.49", whole-euro "1".
 */
function parseDutchPrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[€\s\u00a0*]/g, '');
  // "1,49" or "1.49"
  const m = cleaned.match(/^(\d+)[,.](\d{2})$/);
  if (m) return parseFloat(`${m[1]}.${m[2]}`);
  // Whole euros "2" → 2.00
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  return null;
}

/**
 * Extract current price from JSON-LD on the page.
 * Handles both top-level arrays and @graph wrappers.
 */
async function priceFromJsonLd(page) {
  return page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const raw = JSON.parse(script.textContent);
        // Normalise: could be object with @graph, plain object, or array
        let entries = [];
        if (Array.isArray(raw)) {
          entries = raw;
        } else if (raw['@graph']) {
          entries = raw['@graph'];
        } else {
          entries = [raw];
        }
        for (const entry of entries) {
          if (!entry.offers) continue;
          const offer = Array.isArray(entry.offers) ? entry.offers[0] : entry.offers;
          // Dirk uses capital-P "Price", schema.org uses lowercase "price"
          const raw_price = offer.price ?? offer.Price;
          const price = parseFloat(raw_price);
          if (!isNaN(price) && price > 0) return price;
        }
      } catch (_) {}
    }
    return null;
  });
}

/**
 * Search page body text for "van X,XX" pattern (Dutch: "from X.XX").
 * Used to detect original price when an item is on sale.
 */
async function originalPriceFromVanText(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const m = text.match(/\bvan\s+€?\s*(\d+)[,.](\d{2})\b/i);
    if (m) return parseFloat(`${m[1]}.${m[2]}`);
    return null;
  });
}

/**
 * Last-resort: find the first € price anywhere visible on the page.
 * Skips unit prices (per liter, per 100g, etc.) by checking the surrounding text.
 */
async function firstEuroPriceOnPage(page) {
  return page.evaluate(() => {
    const unitPattern = /per\s*(liter|100|kg|ml|g\b|cl)|\/\s*(ltr|l\b|kg|100)/i;
    const regex = /€\s*(\d+)[,.](\d{2})/g;
    const body = document.body.innerText;
    let match;
    while ((match = regex.exec(body)) !== null) {
      // Check ~30 chars after the price for a unit indicator
      const context = body.slice(match.index, match.index + 50);
      if (unitPattern.test(context)) continue;
      return parseFloat(`${match[1]}.${match[2]}`);
    }
    return null;
  });
}

/**
 * Try a list of CSS selectors; return the parsed price from the first match.
 */
async function trySelectors(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const text = await el.innerText();
      const price = parseDutchPrice(text);
      if (price !== null && price > 0) return price;
    } catch (_) {}
  }
  return null;
}

/**
 * Print a diagnostic snapshot of what the scraper sees on the page.
 * Call this when currentPrice is null to aid debugging.
 */
async function diagnose(page, store) {
  const info = await page.evaluate(() => {
    const title = document.title;
    const url = location.href;
    // First 500 chars of visible text
    const text = document.body.innerText.substring(0, 500).replace(/\n+/g, ' ');
    // All elements with "price" in class or data attribute (first 5)
    const priceEls = [...document.querySelectorAll('[class*="price"],[class*="Price"],[data-testhook*="price"],[data-testid*="price"]')]
      .slice(0, 5)
      .map(el => ({ tag: el.tagName, class: el.className.substring(0, 80), text: el.innerText?.substring(0, 40) }));
    return { title, url, text, priceEls };
  });
  console.warn(`[DIAG ${store}] title="${info.title}" url=${info.url}`);
  console.warn(`[DIAG ${store}] body start: ${info.text}`);
  console.warn(`[DIAG ${store}] price-class elements:`, JSON.stringify(info.priceEls));
}

module.exports = {
  parseDutchPrice,
  priceFromJsonLd,
  originalPriceFromVanText,
  firstEuroPriceOnPage,
  trySelectors,
  diagnose,
};
