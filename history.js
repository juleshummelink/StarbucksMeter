'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_DAYS = 30;

/**
 * Called once at server startup — ensures the data directory and an empty
 * history file exist so the rest of the code can always assume the file is there.
 */
function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, '{}', 'utf-8');
    console.log('[history] Created empty history file at', HISTORY_FILE);
  }
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch (err) {
    console.error('[history] Failed to read history file:', err.message);
    return {};
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * After a successful scrape, record the cheapest store per coffee type for
 * today's date. Prunes entries older than MAX_DAYS.
 */
function addEntry(prices) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const history = load();

  const entry = {};
  for (const type of ['Caramel', 'Cappuccino', 'NoSugar', 'TrippleShot', 'TrippleShotNoSugar']) {
    const candidates = prices.filter((p) => p.type === type && p.currentPrice != null);
    if (!candidates.length) continue;
    const cheapest = candidates.reduce((a, b) => (a.currentPrice <= b.currentPrice ? a : b));
    entry[type] = { price: cheapest.currentPrice, store: cheapest.store };
  }

  history[today] = entry;

  // Prune old entries
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  for (const date of Object.keys(history)) {
    if (new Date(date) < cutoff) delete history[date];
  }

  save(history);
}

function get() {
  return load();
}

module.exports = { init, addEntry, get };
