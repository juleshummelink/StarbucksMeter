# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

StarbucksMeter is a price tracker for Starbucks chilled iced coffee drinks sold at Dutch supermarkets. It tracks three product variants (Caramel Macchiato, Cappuccino, No Sugar/Skinny Latte) across four stores: Dirk, Albert Heijn (AH), Jumbo, and Plus.

## Data

- `recourses/urls.csv` — the canonical list of product URLs per store/type combination. Each row maps a (Store, Type) pair to a product page URL. This is the source of truth for which products to scrape.
- `recourses/stores/` — store logo images (ah.png, dirk.png, jumbo.jpg, plus.png)
- `recourses/coffee/` — coffee type images (caramel.jpg, cappuccino.jpg, nosugar.jpg)

## Architecture Notes

No application code exists yet. When building out the project, the URL list structure implies a scraper that:
1. Reads `recourses/urls.csv` to get (Store, Type, URL) triples
2. Fetches each product page and extracts the current price
3. Stores/displays prices, likely as a comparison table across stores per coffee type
