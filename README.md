# Stock Dashboard

A personal stock market dashboard for tracking trends, technical signals, and congressional trading activity.

> **Status:** Prototype. UI shell is functional with simulated data. Real data integration is the next major milestone.

---

## What it does (today)

- Watchlist of tracked tickers rendered as cards with price, daily change, and a signal badge
- Sparkline per card for quick visual trend (currently synthetic — see "Honest state" below)
- BUY / HOLD / SELL badges with signal-change indicators (e.g. HOLD → BUY)
- Expandable detail view per ticker with 52w high/low, volume, market cap, and signal reasoning
- Congressional trade activity per ticker (STOCK Act disclosures, currently simulated)
- Signal history log per ticker
- Watchlist persists across sessions via `localStorage`

## Honest state of the project

Being upfront about what's real and what isn't, because the line matters:

| Feature | Real | Simulated |
| --- | --- | --- |
| UI / interaction | ✅ | |
| Watchlist persistence | ✅ | |
| Price, change, volume | | ⚠️ hardcoded |
| Moving average signals | | ⚠️ hardcoded strings, no MA math runs in code yet |
| Sparkline data | | ⚠️ random walk, regenerates each render |
| Congressional trades | | ⚠️ hardcoded sample data |
| Signal history log | | ⚠️ hardcoded |

The signal labels and reasoning text in `MOCK_DATA` were written by hand. The actual MA20/MA50/MA200 calculation referenced in the UI does not yet exist in code — implementing it is part of the next phase, not a completed feature.

---

## ⚠️ Disclaimer

This project is for personal research and learning. Nothing it displays is financial advice. Signals shown here are heuristic and lag the market by design. Do not make trades based on this dashboard.

---

## Roadmap

The next phase is the real project. Everything before it is UI scaffolding.

### ✅ Phase 1 — UI shell (done)

- Single-page layout with watchlist grid and detail panel
- Card components: price, change, signal badge, sparkline, congress pill
- Add / remove ticker flow with localStorage persistence
- Detail view with metrics, signal reasoning, congress trades, signal log
- Simulated data for all of the above

### 🔲 Phase 2 — Backend + one real data source (in progress)

This is the critical phase. The goal is to get one ticker showing fully real data end-to-end before adding anything else.

- Minimal backend (Node/Express) on Render free tier — see [`/server`](./server)
- Single endpoint: `GET /api/quote/:ticker` proxying Finnhub, with 60s in-memory cache
- Secure API key handling — keys live server-side, never in client code
- CORS configured for the GitHub Pages origin
- Wire the existing UI to consume the real endpoint for one ticker first, then expand

### 🔲 Phase 3 — Real signal computation

- Fetch historical daily closes (Finnhub `/stock/candle` or equivalent)
- Compute MA20 / MA50 / MA200 in code instead of hardcoding signals
- Generate the "reason" text from actual MA relationships
- Render real 7-day sparklines from real data

### 🔲 Phase 4 — Additional data layers

- Alpha Vantage for pre-calculated RSI / MACD (mind the 25/day free tier limit — verify current limits)
- Quiver Quantitative for real congressional disclosures (paid API; alternative is parsing House/Senate PDFs directly)
- News headlines with sentiment classification

### 🔲 Phase 5 — Signal logic refinement

- Weighted scoring across moving averages, RSI/MACD, congressional activity, news sentiment
- Each input casts a weighted vote toward final BUY / HOLD / SELL
- Backtest signal accuracy against historical data before trusting the output

### 🔲 Phase 6 — UI polish (intentionally later)

Deferred until real data is flowing, because much of this changes once the data is real.

### 🔲 Phase 7 — Multi-user (only if scope expands)

Decision point: this only matters if the tool is meant to be used by other people. A personal tool can stay client-only with localStorage.

---

## Tech stack

| Layer | Current | Planned |
| --- | --- | --- |
| Frontend | HTML / CSS / vanilla JS | same |
| Charts | Chart.js | same |
| Hosting | GitHub Pages | same for frontend |
| Backend | Node + Express (scaffolded) | same, deployed to Render |
| Data | hardcoded mocks | Finnhub → Alpha Vantage → Quiver |
| Database | localStorage | Supabase (only if Phase 7 happens) |

---

## Local development

**Frontend:**

```
git clone https://github.com/samer7/stock-dashboard.git
cd stock-dashboard
open index.html
```

No build step. Single HTML file. Edit and reload.

**Backend:** see [`/server/README.md`](./server/README.md) for setup and deployment instructions.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)