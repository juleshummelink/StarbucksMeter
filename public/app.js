'use strict';

// ── Coffee colours (used for chart and cards) ────────────────────────────────
const COFFEE_COLORS = {
  Caramel:             '#E8810A', // orange/caramel
  Cappuccino:          '#6B3A2A', // dark brown
  NoSugar:             '#5BA4CF', // light blue
  TrippleShot:         '#B03A2E', // deep espresso red
  TrippleShotNoSugar:  '#7D3C98', // purple
};
const COFFEE_LABELS = {
  Caramel:             'Caramel Macchiato',
  Cappuccino:          'Cappuccino',
  NoSugar:             'No Added Sugar',
  TrippleShot:         'Triple Shot Espresso',
  TrippleShotNoSugar:  'Triple Shot No Added Sugar',
};

// ── Store & type metadata ────────────────────────────────────────────────────
const STORE_META = {
  Dirk:  { name: 'Dirk',         logo: '/recourses/stores/dirk.png'  },
  AH:    { name: 'Albert Heijn', logo: '/recourses/stores/ah.png'    },
  Jumbo: { name: 'Jumbo',        logo: '/recourses/stores/jumbo.jpg' },
  Plus:  { name: 'Plus',         logo: '/recourses/stores/plus.png'  },
};
const STORE_ORDER = ['Dirk', 'AH', 'Jumbo', 'Plus'];

const TYPE_ORDER  = ['Caramel', 'Cappuccino', 'NoSugar', 'TrippleShot', 'TrippleShotNoSugar'];
const TYPE_IMAGES = {
  Caramel:             '/recourses/coffee/caramel.jpg',
  Cappuccino:          '/recourses/coffee/cappuccino.jpg',
  NoSugar:             '/recourses/coffee/nosugar.jpg',
  TrippleShot:         '/recourses/coffee/trippleshot.jpg',
  TrippleShotNoSugar:  '/recourses/coffee/trippleshotnosugar.jpg',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(price) {
  if (price == null) return null;
  return '€\u00a0' + price.toFixed(2).replace('.', ',');
}

function setState(name) {
  ['state-empty', 'state-loading', 'state-error', 'price-table-wrap', 'price-cards'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
  if (name === 'price-table-wrap') {
    // Both views are built; CSS decides which one is visible per breakpoint
    document.getElementById('price-table-wrap').classList.remove('hidden');
    document.getElementById('price-cards').classList.remove('hidden');
  } else {
    document.getElementById(name).classList.remove('hidden');
  }
}

// ── Progress / Scanner UI ────────────────────────────────────────────────────
let activeStore = null;  // which store is currently displayed in centre

function resetScannerUI() {
  activeStore = null;
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-label').textContent = '0 / 12 producten';
  document.getElementById('scrape-store-logo').src = '';
  document.getElementById('scrape-store-text').textContent = 'Prijzen ophalen…';
  STORE_ORDER.forEach((s) => {
    const dot = document.getElementById(`dot-${s}`);
    if (dot) { dot.classList.remove('active', 'done'); }
  });
  // reset connectors
  document.querySelectorAll('.store-dot-connector').forEach((c) => c.classList.remove('done'));
}

function updateProgressBar(step, total) {
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('progress-label').textContent = `${step} / ${total} producten`;
}

/**
 * Transition the centre display (logo + text) to a new store.
 * Fades out → swaps content → fades in.
 */
function transitionStore(store) {
  if (store === activeStore) return;
  const meta = STORE_META[store];
  if (!meta) return;

  const display = document.getElementById('scrape-store-display');

  // Mark previous store as done
  if (activeStore) {
    const prevDot = document.getElementById(`dot-${activeStore}`);
    if (prevDot) {
      prevDot.classList.remove('active');
      prevDot.classList.add('done');
    }
    // Mark connector between prev and current as done
    const prevIdx = STORE_ORDER.indexOf(activeStore);
    const connectors = document.querySelectorAll('.store-dot-connector');
    if (connectors[prevIdx]) connectors[prevIdx].classList.add('done');
  }

  // Activate new store dot
  const nextDot = document.getElementById(`dot-${store}`);
  if (nextDot) nextDot.classList.add('active');

  activeStore = store;

  // Fade out → update → fade in
  display.classList.add('fading');
  setTimeout(() => {
    document.getElementById('scrape-store-logo').src = meta.logo;
    document.getElementById('scrape-store-logo').alt = meta.name;
    document.getElementById('scrape-store-text').textContent =
      `Nu aan het kijken bij ${meta.name}`;
    display.classList.remove('fading');
  }, 350);
}

function markAllDone() {
  STORE_ORDER.forEach((s) => {
    const dot = document.getElementById(`dot-${s}`);
    if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }
  });
  document.querySelectorAll('.store-dot-connector').forEach((c) => c.classList.add('done'));
  document.getElementById('progress-bar').style.width = '100%';
}

// ── SSE progress stream ───────────────────────────────────────────────────────
let eventSource = null;

function openProgressStream() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  eventSource = new EventSource('/api/scrape-stream');

  eventSource.onmessage = (e) => {
    let data;
    try { data = JSON.parse(e.data); } catch (_) { return; }

    if (data.done) {
      markAllDone();
      return;
    }
    if (data.error) return;
    if (data.store) transitionStore(data.store);
    if (data.step != null && data.total != null) {
      updateProgressBar(data.step, data.total);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    eventSource = null;
  };
}

function closeProgressStream() {
  if (eventSource) { eventSource.close(); eventSource = null; }
}

// ── Table builder ─────────────────────────────────────────────────────────────
function buildTable(prices) {
  const index = {};
  for (const entry of prices) {
    if (!index[entry.type]) index[entry.type] = {};
    index[entry.type][entry.store] = entry;
  }

  // Header
  const headerRow = document.getElementById('store-header-row');
  headerRow.innerHTML = '<th class="type-col"></th>';
  for (const storeKey of STORE_ORDER) {
    const meta = STORE_META[storeKey];
    const th = document.createElement('th');
    th.innerHTML = `
      <div class="store-header">
        <img class="store-logo" src="${meta.logo}" alt="${meta.name}" />
        <span class="store-name">${meta.name}</span>
      </div>`;
    headerRow.appendChild(th);
  }

  // Body
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  for (const typeKey of TYPE_ORDER) {
    const typeData = index[typeKey] ?? {};
    const allPrices = STORE_ORDER
      .map((s) => typeData[s]?.displayPrice ?? typeData[s]?.currentPrice)
      .filter((p) => p != null);
    const cheapest = allPrices.length ? Math.min(...allPrices) : null;

    const tr = document.createElement('tr');

    // Type cell
    const firstEntry = typeData[STORE_ORDER.find((s) => typeData[s])] ?? {};
    const typeLabel = firstEntry.typeMeta?.label ?? typeKey;
    const typeTd = document.createElement('td');
    typeTd.className = 'type-cell';
    typeTd.innerHTML = `
      <div class="type-inner">
        <img class="coffee-img" src="${TYPE_IMAGES[typeKey]}" alt="${typeLabel}" />
        <span class="type-label">${typeLabel}</span>
      </div>`;
    tr.appendChild(typeTd);

    for (const storeKey of STORE_ORDER) {
      const entry = typeData[storeKey];
      const td = document.createElement('td');
      td.className = 'price-cell';

      const displayPrice = entry?.displayPrice ?? entry?.currentPrice;

      if (!entry || displayPrice == null) {
        td.innerHTML = `<span class="price-unavailable" title="${entry?.error ?? ''}">–</span>`;
      } else {
        if (cheapest !== null && displayPrice === cheapest) td.classList.add('cheapest');
        let html = `<div class="price-current">${fmt(displayPrice)}</div>`;
        if (entry.onPromo) {
          html += `<span class="badge-promo">${entry.promoLabel}</span>`;
          html += `<span class="promo-qty">bij ${entry.minQty} stuks</span>`;
        } else if (entry.onSale && entry.originalPrice) {
          html += `<div class="price-original">${fmt(entry.originalPrice)}</div>`;
          html += `<span class="badge-sale">Aanbieding</span>`;
        }
        html += `<a class="price-link" href="${entry.url}" target="_blank" rel="noopener">Bekijk →</a>`;
        td.innerHTML = html;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// ── Mobile card builder ───────────────────────────────────────────────────────
function buildCards(prices) {
  const index = {};
  for (const entry of prices) {
    if (!index[entry.type]) index[entry.type] = {};
    index[entry.type][entry.store] = entry;
  }

  const container = document.getElementById('price-cards');
  container.innerHTML = '<div class="price-cards-container"></div>';
  const wrap = container.firstChild;

  for (const typeKey of TYPE_ORDER) {
    const typeData = index[typeKey] ?? {};
    const allPrices = STORE_ORDER
      .map((s) => typeData[s]?.displayPrice ?? typeData[s]?.currentPrice)
      .filter((p) => p != null);
    const cheapest = allPrices.length ? Math.min(...allPrices) : null;

    const firstEntry = typeData[STORE_ORDER.find((s) => typeData[s])] ?? {};
    const typeLabel = firstEntry.typeMeta?.label ?? typeKey;

    const card = document.createElement('div');
    card.className = 'price-card';
    card.innerHTML = `
      <div class="price-card-header">
        <img class="coffee-img" src="${TYPE_IMAGES[typeKey]}" alt="${typeLabel}" />
        <span class="type-label">${typeLabel}</span>
      </div>`;

    const rowsDiv = document.createElement('div');
    rowsDiv.className = 'price-card-rows';

    for (const storeKey of STORE_ORDER) {
      const meta = STORE_META[storeKey];
      const entry = typeData[storeKey];
      const displayPrice = entry?.displayPrice ?? entry?.currentPrice;
      const isCheapest = displayPrice != null && displayPrice === cheapest;

      const row = document.createElement('a');
      row.className = 'price-card-row' + (isCheapest ? ' cheapest' : '');
      // Make the whole row a link to the product page
      if (entry?.url) { row.href = entry.url; row.target = '_blank'; row.rel = 'noopener'; }
      row.style.textDecoration = 'none';
      row.style.color = 'inherit';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '13px 16px';
      row.style.borderBottom = '1px solid var(--border)';
      row.style.position = 'relative';
      if (isCheapest) row.style.background = 'var(--green-light)';

      let pricesHtml = `<div class="price-card-right">`;
      if (!entry || displayPrice == null) {
        pricesHtml += `<span class="price-unavailable">–</span>`;
      } else {
        pricesHtml += `<span class="price-current">${fmt(displayPrice)}</span>`;
        if (entry.onPromo) {
          pricesHtml += `<span class="badge-promo">${entry.promoLabel}</span>`;
          pricesHtml += `<span class="promo-qty">bij ${entry.minQty} stuks</span>`;
        } else if (entry.onSale && entry.originalPrice) {
          pricesHtml += `<span class="price-original">${fmt(entry.originalPrice)}</span>`;
          pricesHtml += `<span class="badge-sale">Aanbieding</span>`;
        }
      }
      pricesHtml += `</div>`;

      const trophy = isCheapest ? `<span class="price-card-trophy">🏆</span>` : '';

      row.innerHTML = `
        <img class="store-logo-sm" src="${meta.logo}" alt="${meta.name}" />
        <span class="store-name-sm">${meta.name}</span>
        ${pricesHtml}
        ${trophy}`;

      rowsDiv.appendChild(row);
    }

    card.appendChild(rowsDiv);
    wrap.appendChild(card);
  }
}

// ── Main load function ────────────────────────────────────────────────────────
async function loadPrices(forceRefresh = false) {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.classList.add('spinning');

  if (forceRefresh) {
    resetScannerUI();
    setState('state-loading');
    openProgressStream();
  }

  try {
    const url = '/api/prices' + (forceRefresh ? '?refresh=true' : '');
    const res = await fetch(url);

    if (res.status === 202) {
      // Another scrape is already running — wait and retry
      setTimeout(() => loadPrices(false), 3000);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      document.getElementById('error-msg').textContent = body.error ?? `Server fout (${res.status})`;
      setState('state-error');
      return;
    }

    const { prices, lastUpdated } = await res.json();
    closeProgressStream();
    buildTable(prices);
    buildCards(prices);
    setState('price-table-wrap');
    loadHistory();

    if (lastUpdated) {
      const d = new Date(lastUpdated);
      document.getElementById('last-updated').textContent =
        'Bijgewerkt: ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    }
  } catch (err) {
    closeProgressStream();
    document.getElementById('error-msg').textContent = err.message;
    setState('state-error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');
  }
}

// ── History chart (ApexCharts) ────────────────────────────────────────────────
let chartInstance = null;

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) return;
    const data = await res.json();

    const dates = Object.keys(data).sort();
    if (dates.length < 1) return;

    // Build series — store name travels inside each data point.
    // Only include a series if at least one day has real data for that type.
    const builtSeries = TYPE_ORDER.map((typeKey) => ({
      typeKey,
      name: COFFEE_LABELS[typeKey],
      data: dates.map((date) => {
        const entry = data[date]?.[typeKey];
        return {
          x: new Date(date).getTime(),
          y: entry?.price ?? null,
          store: entry?.store ?? null,
        };
      }),
    })).filter((s) => s.data.some((d) => d.y != null));

    if (!builtSeries.length) return;

    const activeTypes  = builtSeries.map((s) => s.typeKey);
    const seriesColors = builtSeries.map((s) => COFFEE_COLORS[s.typeKey]);
    // Strip internal typeKey before passing to ApexCharts
    const series = builtSeries.map(({ typeKey, ...rest }) => rest);

    const section = document.getElementById('history-section');
    section.classList.remove('hidden');

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const isMobile = window.innerWidth < 640;

    const options = {
      chart: {
        type: 'area',
        height: isMobile ? 220 : 300,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 700,
          animateGradually: { enabled: true, delay: 80 },
        },
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: 'transparent',
      },
      series,
      colors: seriesColors,
      stroke: { curve: 'smooth', width: 2.5 },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.28,
          opacityTo: 0.01,
          stops: [0, 90],
        },
      },
      markers: {
        size: 4,
        strokeWidth: 2,
        strokeColors: '#ffffff',
        hover: { size: 7 },
      },
      xaxis: {
        type: 'datetime',
        labels: {
          format: 'd MMM',
          datetimeUTC: false,
          style: { colors: '#54554B', fontSize: '11px' },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        tickAmount: 4,
        labels: {
          formatter: (v) => v == null ? '' : '€\u00a0' + v.toFixed(2).replace('.', ','),
          style: { colors: '#54554B', fontSize: '11px' },
          offsetX: -4,
        },
      },
      grid: {
        borderColor: 'rgba(0,0,0,0.07)',
        strokeDashArray: 5,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        padding: { left: 0, right: 12 },
      },
      dataLabels: { enabled: false },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '12px',
        fontWeight: 600,
        labels: { colors: '#1E3932' },
        markers: {
          width: 10, height: 10,
          radius: 3,
          offsetX: -2,
        },
        itemMargin: { horizontal: 14, vertical: 0 },
        onItemClick: { toggleDataSeries: true },
        onItemHover: { highlightDataSeries: true },
      },
      tooltip: {
        shared: true,
        intersect: false,
        followCursor: false,
        custom: ({ series: s, dataPointIndex, w }) => {
          const ts = w.globals.seriesX[0]?.[dataPointIndex];
          const dateStr = ts
            ? new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
            : '';

          const rows = activeTypes.map((typeKey, idx) => {
            const price = s[idx]?.[dataPointIndex];
            const rawStore = w.config.series[idx]?.data[dataPointIndex]?.store;
            const storeName = STORE_META[rawStore]?.name ?? rawStore ?? '–';
            const color = COFFEE_COLORS[typeKey];
            const priceStr = price != null
              ? '€\u00a0' + price.toFixed(2).replace('.', ',')
              : '–';
            return `
              <div class="apex-tt-row">
                <span class="apex-tt-dot" style="background:${color}"></span>
                <span class="apex-tt-name">${COFFEE_LABELS[typeKey]}</span>
                <span class="apex-tt-price">${priceStr}</span>
                <span class="apex-tt-store">${storeName}</span>
              </div>`;
          }).join('');

          return `
            <div class="apex-tooltip">
              <div class="apex-tt-date">${dateStr}</div>
              ${rows}
            </div>`;
        },
      },
      theme: { mode: 'light' },
    };

    chartInstance = new ApexCharts(document.getElementById('history-chart'), options);
    await chartInstance.render();
  } catch (err) {
    console.warn('Could not load price history:', err.message);
  }
}

// ── On first load check for cached data ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/status')
    .then((r) => r.json())
    .then(({ hasCachedData }) => {
      if (hasCachedData) loadPrices(false);
      loadHistory(); // always try to show the chart from persisted data
    })
    .catch(() => {});
});
