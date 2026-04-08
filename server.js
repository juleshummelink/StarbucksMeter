'use strict';

const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { scrapeAll } = require('./scrapers/index');
const history = require('./history');
const { DEMO_PRICES } = require('./demo-data');

const DEMO_MODE = process.argv.includes('--demo');

const app = express();
const PORT = process.env.PORT || 3000;

history.init();

app.use(express.static(path.join(__dirname, 'public')));
app.use('/recourses', express.static(path.join(__dirname, 'recourses')));

// ── In-memory state ──────────────────────────────────────────────────────────
let cachedPrices = null;
let lastUpdated = null;
let scrapeInProgress = false;

// SSE progress broadcasting
let progressClients = [];
let currentProgress = null;

function pushProgress(data) {
  currentProgress = data;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  progressClients.forEach((res) => res.write(payload));
}

// ── SSE progress stream ───────────────────────────────────────────────────────
app.get('/api/scrape-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Immediately send current state so late-connecting clients get context
  if (currentProgress) {
    res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);
  }

  progressClients.push(res);

  // Keep-alive heartbeat every 15 s
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    progressClients = progressClients.filter((c) => c !== res);
  });
});

// ── Prices endpoint ───────────────────────────────────────────────────────────
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

app.get('/api/prices', async (req, res) => {
  // Demo mode: return synthetic data immediately, no scrape, no history write
  if (DEMO_MODE) {
    return res.json({ prices: DEMO_PRICES, lastUpdated: new Date().toISOString(), demo: true });
  }

  const forceRefresh = req.query.refresh === 'true';

  if (scrapeInProgress) {
    return res.status(202).json({ status: 'scraping' });
  }

  // Cooldown: block manual refresh if data is less than 1 hour old
  if (forceRefresh && cachedPrices && lastUpdated) {
    const age = Date.now() - new Date(lastUpdated).getTime();
    if (age < REFRESH_COOLDOWN_MS) {
      const nextRefresh = new Date(new Date(lastUpdated).getTime() + REFRESH_COOLDOWN_MS).toISOString();
      return res.status(429).json({ status: 'cooldown', lastUpdated, nextRefresh });
    }
  }

  if (!forceRefresh && cachedPrices) {
    return res.json({ prices: cachedPrices, lastUpdated });
  }

  scrapeInProgress = true;
  currentProgress = null;

  try {
    cachedPrices = await scrapeAll(pushProgress);
    lastUpdated = new Date().toISOString();
    history.addEntry(cachedPrices);
    // Signal completion to all SSE clients
    pushProgress({ done: true });
    res.json({ prices: cachedPrices, lastUpdated });
  } catch (err) {
    console.error('Scrape failed:', err);
    pushProgress({ error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    scrapeInProgress = false;
  }
});

app.get('/api/history', (_req, res) => {
  res.json(history.get());
});

app.get('/api/status', (_req, res) => {
  res.json({ scraping: scrapeInProgress, lastUpdated, hasCachedData: cachedPrices !== null });
});

// ── Scheduled daily scrape at 06:00 ──────────────────────────────────────────
async function runScheduledScrape() {
  if (scrapeInProgress) return;
  console.log('[cron] Starting scheduled 06:00 scrape…');
  scrapeInProgress = true;
  currentProgress = null;
  try {
    cachedPrices = await scrapeAll(pushProgress);
    lastUpdated = new Date().toISOString();
    history.addEntry(cachedPrices);
    pushProgress({ done: true });
    console.log('[cron] Scheduled scrape complete.');
  } catch (err) {
    console.error('[cron] Scheduled scrape failed:', err.message);
    pushProgress({ error: err.message });
  } finally {
    scrapeInProgress = false;
  }
}

// Cron expression: minute=0, hour=6, every day (disabled in demo mode)
if (!DEMO_MODE) {
  cron.schedule('0 6 * * *', runScheduledScrape, { timezone: 'Europe/Amsterdam' });
}

app.listen(PORT, () => {
  if (DEMO_MODE) {
    console.log(`StarbucksMeter running at http://localhost:${PORT}  [DEMO MODE]`);
    console.log('[demo] Scraping disabled — serving synthetic data. History and cache are not written.');
  } else {
    console.log(`StarbucksMeter running at http://localhost:${PORT}`);
    console.log('[cron] Daily scrape scheduled at 06:00 Europe/Amsterdam');
  }
});
