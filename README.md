# ☕ StarbucksMeter

> Dagelijkse prijsvergelijker voor Starbucks gekoelde ijskoffie bij Nederlandse supermarkten.

Live: **[starbucks.bytemountains.com](https://starbucks.bytemountains.com)**

---

## Wat doet het?

StarbucksMeter scrapt dagelijks de prijzen van Starbucks ijskoffie bij vier grote Nederlandse supermarkten en toont:

- De actuele prijs per winkel, met aanbiedings-badges wanneer een product in de aanbieding is
- Een 🏆 bij de goedkoopste optie per variant
- Een grafiek met de prijsontwikkeling over de afgelopen 30 dagen, inclusief welke winkel die dag het goedkoopst was
- Automatische verversing elke ochtend om **06:00 (Amsterdam)**

### Gevolgde producten

| Variant | Dirk | Albert Heijn | Jumbo | Plus |
|---|:---:|:---:|:---:|:---:|
| Caramel Macchiato | ✓ | ✓ | ✓ | ✓ |
| Cappuccino | ✓ | ✓ | ✓ | ✓ |
| No Added Sugar | ✓ | ✓ | ✓ | ✓ |
| Triple Shot Espresso | | ✓ | ✓ | |
| Triple Shot No Added Sugar | | ✓ | ✓ | |

---

## Installatie

**Vereisten:** Node.js 18+

```bash
# 1. Installeer dependencies
npm install

# 2. Installeer de Chromium browser voor Playwright
npm run install-browsers

# 3. Start de server
npm start
```

De app is nu beschikbaar op [http://localhost:3000](http://localhost:3000).

---

## Gebruik

Open de app in de browser en klik op **Vernieuwen** om een handmatige scrape te starten. Het ophalen van alle prijzen duurt ongeveer 30–60 seconden. Tijdens het ophalen toont een animated voortgangsbalk welke winkel op dat moment wordt bekeken.

De server slaat prijzen op in het geheugen en schrijft dagelijkse snapshots naar `data/history.json`. Dit bestand blijft bewaard na een herstart.

### Aanbiedingen: 1+1 gratis en meerdere voor een vaste prijs

De app herkent twee soorten volumekortingen:

| Aanbieding | Voorbeeld | Weergegeven prijs |
|---|---|---|
| 1+1 gratis | 1+1 gratis | Helft van de normale prijs (per stuk bij 2) |
| X voor Y | 2 voor €4,49 | Y gedeeld door X (per stuk bij X) |

Wanneer een product een actieve volumekorting heeft, toont de app de **effectieve prijs per stuk** (de laagste optie) met een groen badge en "bij X stuks". De 🏆 en de grafiek houden ook rekening met deze kortingen.

Welke winkels ondersteunen welke aanbiedingstypen:

| Aanbieding | Dirk | Albert Heijn | Jumbo | Plus |
|---|:---:|:---:|:---:|:---:|
| Reguliere aanbieding (van/was) | ✓ | ✓ | ✓ | ✓ |
| 1+1 gratis | | ✓ | ✓ | |
| X voor Y | | ✓ | ✓ | |

### Test scraper

Om promotieherkenning te testen zonder de echte Starbucks-URLs te gebruiken:

```bash
npm run test-scrape           # gebruikt ./test-urls.csv
node test-scrape.js mijn.csv  # eigen bestand
```

`test-urls.csv` heeft een brede opzet — één rij per winkel, één kolom per aanbiedingstype. Lege cellen worden overgeslagen:

```
Store,Normal,Discount,TwoFor,OnePlusOne
AH,https://...,,https://...,https://...
Jumbo,https://...,,,https://...
```

Het script scrapt elke URL, vergelijkt het resultaat met de verwachte categorie (geen actie / reguliere aanbieding / 2-voor-X / 1+1 gratis) en toont aan het eind een samenvatting met geslaagde en mislukte checks.

---

## Project structuur

```
StarbucksMeter/
├── server.js               # Express server, SSE, cron job
├── history.js              # Lezen/schrijven van prijsgeschiedenis
├── test-scrape.js          # Testscript voor scraperherkennig
├── test-urls.csv           # Voorbeeld-URLs voor promotietests
├── scrapers/
│   ├── index.js            # Orkestreert alle scrapers, leest CSV
│   ├── dirk.js             # Dirk (JSON-LD)
│   ├── ah.js               # Albert Heijn (Playwright + stealth, promo-detectie)
│   ├── plus.js             # Plus (Playwright, split-price patroon)
│   ├── jumbo.js            # Jumbo (Playwright, promo-detectie)
│   └── utils.js            # Gedeelde hulpfuncties incl. parsePromo
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── recourses/
│   ├── urls.csv            # Productpagina's per winkel en variant
│   ├── stores/             # Winkellogo's
│   └── coffee/             # Productafbeeldingen
└── data/
    └── history.json        # Persistente prijsgeschiedenis (30 dagen)
```

---

## Nieuwe producten toevoegen

1. Voeg een regel toe aan `recourses/urls.csv`:
   ```
   Jumbo,NieuweVariant,https://www.jumbo.com/producten/...
   ```
2. Voeg het type toe aan `TYPE_META` in `scrapers/index.js` en aan `TYPE_ORDER` / `TYPE_IMAGES` / `COFFEE_COLORS` / `COFFEE_LABELS` in `public/app.js`.
3. Plaats een productafbeelding in `recourses/coffee/`.

---

## Technische details

| Onderdeel | Technologie |
|---|---|
| Server | Node.js + Express |
| Scraping | Playwright (Chromium) + playwright-extra stealth |
| Scheduling | node-cron |
| Grafiek | ApexCharts |
| Opslag | JSON-bestand op schijf |

Scrapers gebruiken een gelaagde strategie per winkel:

- **Dirk** – JSON-LD `offers.price` (SSR, meest betrouwbaar)
- **Albert Heijn** – Playwright met stealth-modus (Cloudflare-bypass), `__NEXT_DATA__` + meerdere selektor-fallbacks; promotieherkenning via `__NEXT_DATA__` shields of DOM `aria-label`
- **Plus** – Playwright, herkent het gesplitste prijsformaat (`1.` + `99` als losse elementen)
- **Jumbo** – Playwright met langere timeout (site heeft regelmatig technische problemen); promotieherkenning via `.promo-tag` elementen

---

## Disclaimer

StarbucksMeter is een onafhankelijk project en is niet verbonden aan Starbucks Corporation. De naam Starbucks®, het logo en alle productafbeeldingen zijn eigendom van [Starbucks Corporation](https://www.starbucks.com). Winkellogo's zijn eigendom van de respectieve supermarktketens.
