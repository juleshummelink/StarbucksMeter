'use strict';

const {
  priceFromJsonLd,
  originalPriceFromJsonLd,
  originalPriceFromVanText,
  firstEuroPriceOnPage,
  diagnose,
  parsePromo,
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

  // Detect multi-buy promotions (1+1 gratis, 2 voor X)
  const promoText = await page.evaluate(() => {
    // Jumbo uses .promo-tag span and data-testid="jum-tag"
    const selectors = [
      '[data-testid="jum-tag"]',
      '[class*="promo-tag"]',
      '[class*="promotion-tag"]',
      '[class*="promo-label"]',
      '[class*="promotionTag"]',
      '[class*="PromotionTag"]',
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const text = el.innerText?.trim() ?? '';
        if (text && /1\s*\+\s*1\s*gratis|\d+\s+voor\s+/i.test(text)) return text;
      }
    }
    return null;
  });

  const promoData = parsePromo(promoText, currentPrice);

  // Strategy 1: AggregateOffer highPrice > lowPrice indicates a sale
  let originalPrice = await originalPriceFromJsonLd(page);

  // Strategy 2: "Oude prijs" in screenreader-only divs
  if (originalPrice === null) {
    originalPrice = await page.evaluate(() => {
      for (const el of document.querySelectorAll('.screenreader-only, [class*="screenreader"]')) {
        const text = el.textContent?.trim() ?? '';
        const m = text.match(/oude prijs[:\s]*€?\s*(\d+)[,.](\d{2})/i);
        if (m) return parseFloat(`${m[1]}.${m[2]}`);
      }
      return null;
    });
  }

  // Strategy 3: "van X,XX" text pattern
  if (originalPrice === null) originalPrice = await originalPriceFromVanText(page);

  const validOriginal =
    originalPrice !== null && currentPrice !== null && originalPrice > currentPrice
      ? originalPrice
      : null;

  return {
    currentPrice,
    originalPrice: validOriginal,
    promoLabel: promoData?.promoLabel ?? null,
    effectivePrice: promoData?.effectivePrice ?? null,
    minQty: promoData?.minQty ?? null,
  };
}

module.exports = { scrape };
