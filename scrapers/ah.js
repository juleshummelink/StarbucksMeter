'use strict';

const {
  priceFromJsonLd,
  originalPriceFromVanText,
  firstEuroPriceOnPage,
  diagnose,
} = require('./utils');

async function scrape(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // AH is a React/Next.js SPA — wait a moment for hydration
  await page.waitForTimeout(3000);

  let currentPrice = null;

  // Strategy 1: __NEXT_DATA__ (Next.js server props)
  currentPrice = await page.evaluate(() => {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;
      const data = JSON.parse(el.textContent);
      // Navigate common AH price paths
      const product =
        data?.props?.pageProps?.product ??
        data?.props?.pageProps?.initialData?.product;
      if (!product) return null;
      // priceLabel.now.amount  |  price.now  |  currentPrice
      const raw =
        product?.priceLabel?.now?.amount ??
        product?.price?.now ??
        product?.price?.amount ??
        product?.currentPrice ??
        product?.nowPrice;
      return raw != null ? parseFloat(raw) : null;
    } catch (_) {
      return null;
    }
  });

  // Strategy 2: JSON-LD (handles @graph)
  if (currentPrice === null) currentPrice = await priceFromJsonLd(page);

  // Strategy 3: screen-reader price text (AH uses visually-hidden spans with full "€ X,XX")
  if (currentPrice === null) {
    currentPrice = await page.evaluate(() => {
      const selectors = [
        '.sr-only',
        '.visually-hidden',
        '[class*="sr-only"]',
        '[class*="VisuallyHidden"]',
        '[class*="screenReader"]',
      ];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const text = el.textContent.trim();
          const m = text.match(/€\s*(\d+)[,.](\d{2})/);
          if (m) return parseFloat(`${m[1]}.${m[2]}`);
        }
      }
      return null;
    });
  }

  // Strategy 4: data-testhook / data-testid / aria-label containing a price
  if (currentPrice === null) {
    currentPrice = await page.evaluate(() => {
      const attrs = ['data-testhook', 'data-testid', 'aria-label'];
      for (const attr of attrs) {
        for (const el of document.querySelectorAll(`[${attr}]`)) {
          const val = el.getAttribute(attr) ?? '';
          if (!val.toLowerCase().includes('price') && !val.match(/\d+[,.]\d{2}/)) continue;
          const m = val.match(/(\d+)[,.](\d{2})/);
          if (m) return parseFloat(`${m[1]}.${m[2]}`);
          // Might be a container — check inner text
          const text = el.innerText?.trim() ?? '';
          const mt = text.match(/€\s*(\d+)[,.](\d{2})/);
          if (mt) return parseFloat(`${mt[1]}.${mt[2]}`);
        }
      }
      return null;
    });
  }

  // Strategy 5: any element whose class contains "price" (case-insensitive)
  if (currentPrice === null) {
    currentPrice = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[class*="price"],[class*="Price"]')) {
        const text = el.innerText?.trim() ?? '';
        const m = text.match(/€?\s*(\d+)[,.](\d{2})/);
        if (m) {
          const p = parseFloat(`${m[1]}.${m[2]}`);
          if (p > 0 && p < 20) return p; // sanity range for coffee
        }
      }
      return null;
    });
  }

  // Strategy 6: first € price anywhere on the page
  if (currentPrice === null) currentPrice = await firstEuroPriceOnPage(page);

  if (currentPrice === null) await diagnose(page, 'AH');

  // Original price
  let originalPrice = await originalPriceFromVanText(page);

  // Also check for "was" price in __NEXT_DATA__
  if (originalPrice === null) {
    originalPrice = await page.evaluate(() => {
      try {
        const el = document.getElementById('__NEXT_DATA__');
        if (!el) return null;
        const data = JSON.parse(el.textContent);
        const product =
          data?.props?.pageProps?.product ??
          data?.props?.pageProps?.initialData?.product;
        if (!product) return null;
        const raw =
          product?.priceLabel?.was?.amount ??
          product?.price?.was ??
          product?.wasPrice;
        return raw != null ? parseFloat(raw) : null;
      } catch (_) {
        return null;
      }
    });
  }

  const validOriginal =
    originalPrice !== null && currentPrice !== null && originalPrice > currentPrice
      ? originalPrice
      : null;

  return { currentPrice, originalPrice: validOriginal };
}

module.exports = { scrape };
