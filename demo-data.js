'use strict';

/**
 * Synthetic price data used when the server is started with --demo.
 * Covers every possible UI state so all visual elements can be reviewed
 * without running a real scrape.
 */

const TYPE_META = {
  Caramel:            { label: 'Caramel Macchiato',          image: 'caramel' },
  Cappuccino:         { label: 'Cappuccino',                  image: 'cappuccino' },
  NoSugar:            { label: 'No Added Sugar',              image: 'nosugar' },
  TrippleShot:        { label: 'Triple Shot Espresso',        image: 'trippleshot' },
  TrippleShotNoSugar: { label: 'Triple Shot No Added Sugar',  image: 'trippleshotnosugar' },
};

function entry(store, type, opts = {}) {
  const {
    currentPrice  = null,
    originalPrice = null,
    promoLabel    = null,
    effectivePrice = null,
    minQty        = null,
    error         = null,
  } = opts;

  const displayPrice =
    effectivePrice != null && (currentPrice == null || effectivePrice < currentPrice)
      ? effectivePrice
      : currentPrice;

  return {
    store,
    type,
    typeMeta: TYPE_META[type],
    url: '#',
    currentPrice,
    originalPrice,
    promoLabel,
    effectivePrice,
    minQty,
    displayPrice,
    onSale:  originalPrice != null && currentPrice != null && originalPrice > currentPrice,
    onPromo: effectivePrice != null,
    error,
  };
}

// Each row demonstrates a different UI state:
//
//  Caramel        — normal | sale (was) | 2-for promo | 1+1 promo
//  Cappuccino     — cheapest highlight | normal | unavailable (–) | sale
//  NoSugar        — unavailable (–) | 1+1 promo | normal | normal
//  TrippleShot    — 2-for promo | sale (AH+Jumbo only)
//  TrippleShot NS — normal | unavailable (AH+Jumbo only)

const DEMO_PRICES = [
  // ── Caramel ───────────────────────────────────────────────────────────────
  entry('Dirk',  'Caramel', { currentPrice: 1.99 }),
  entry('AH',    'Caramel', { currentPrice: 1.69, originalPrice: 2.29 }),
  entry('Jumbo', 'Caramel', { currentPrice: 1.99, promoLabel: '2 voor\u00a0€\u00a03,49', effectivePrice: 1.75, minQty: 2 }),
  entry('Plus',  'Caramel', { currentPrice: 1.99, promoLabel: '1+1 gratis', effectivePrice: 1.00, minQty: 2 }),

  // ── Cappuccino ────────────────────────────────────────────────────────────
  entry('Dirk',  'Cappuccino', { currentPrice: 0.99 }),          // cheapest
  entry('AH',    'Cappuccino', { currentPrice: 1.99 }),          // normal
  entry('Jumbo', 'Cappuccino'),                                  // unavailable (–)
  entry('Plus',  'Cappuccino', { currentPrice: 1.49, originalPrice: 2.49 }),

  // ── NoSugar ───────────────────────────────────────────────────────────────
  entry('Dirk',  'NoSugar'),                                     // unavailable
  entry('AH',    'NoSugar', { currentPrice: 2.09, promoLabel: '1+1 gratis', effectivePrice: 1.05, minQty: 2 }),
  entry('Jumbo', 'NoSugar', { currentPrice: 1.99 }),
  entry('Plus',  'NoSugar', { currentPrice: 2.19 }),

  // ── TrippleShot (AH + Jumbo only) ─────────────────────────────────────────
  entry('AH',    'TrippleShot', { currentPrice: 2.49, promoLabel: '2 voor\u00a0€\u00a04,49', effectivePrice: 2.25, minQty: 2 }),
  entry('Jumbo', 'TrippleShot', { currentPrice: 2.49, originalPrice: 2.99 }),

  // ── TrippleShotNoSugar (AH + Jumbo only) ──────────────────────────────────
  entry('AH',    'TrippleShotNoSugar', { currentPrice: 2.49 }),
  entry('Jumbo', 'TrippleShotNoSugar'),                          // unavailable
];

module.exports = { DEMO_PRICES };
