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

### 🔲 Phase 2 — Backend + one real data source (next)

This is the critical phase. The goal is to get one ticker showing fully real data end-to-end before adding anything else.

- Minimal backend (Node/Express or Python/FastAPI) on Render or Railway free tier
- Single endpoint: `GET /quote/:ticker` proxying Finnhub, with 60s in-memory cache
- Secure API key handling — keys live server-side, never in client code
- CORS configured for the GitHub Pages origin
- Wire the existing UI to consume the real endpoint for one ticker first, then expand

### 🔲 Phase 3 — Real signal computation

- Fetch historical daily closes (Finnhub `/stock/candle` or equivalent)
- Compute MA20 / MA50 / MA200 in code instead of hardcoding signals
- Generate the "reason" text from actual MA relationships
- Render real 7-day sparklines from real data (the scale and timeline issues in the current UI mostly resolve themselves once the data is real)

### 🔲 Phase 4 — Additional data layers

- Alpha Vantage for pre-calculated RSI / MACD (mind the 25/day free tier limit — verify current limits)
- Quiver Quantitative for real congressional disclosures (paid API; alternative is parsing House/Senate PDFs directly)
- News headlines with sentiment classification

### 🔲 Phase 5 — Signal logic refinement

- Weighted scoring across moving averages, RSI/MACD, congressional activity, news sentiment
- Each input casts a weighted vote toward final BUY / HOLD / SELL
- Backtest signal accuracy against historical data before trusting the output
- Surface confidence level alongside the signal, not just the label

### 🔲 Phase 6 — UI polish (intentionally later)

Deferred until real data is flowing, because much of this changes once the data is real:

- Sparkline scale and timeline labels
- More at-a-glance detail per card (% from 52w high/low, MA values)
- Onboarding and signal-methodology legend
- Mobile-responsive refinements

### 🔲 Phase 7 — Multi-user (only if scope expands)

- Authentication (Supabase or similar)
- Per-user watchlists in database
- Decision point: this only matters if the tool is meant to be used by other people. A personal tool can stay client-only with localStorage.

---

## Tech stack

| Layer | Current | Planned |
| --- | --- | --- |
| Frontend | HTML / CSS / vanilla JS | same |
| Charts | Chart.js | same |
| Hosting | GitHub Pages | same for frontend |
| Backend | none | Node/Express or FastAPI on Render/Railway |
| Data | hardcoded mocks | Finnhub → Alpha Vantage → Quiver |
| Database | localStorage | Supabase (only if Phase 7 happens) |

---

## Data sources (planned)

| Source | Purpose | Tier reality |
| --- | --- | --- |
| Finnhub | Real-time price, candles, news | Free: ~60 calls/min — verify before building |
| Alpha Vantage | Pre-calculated RSI / MACD | Free tier is restrictive (~25/day at last check) — verify |
| Quiver Quantitative | Cleaned STOCK Act disclosures | Paid; alternative is parsing disclosure PDFs |
| SEC EDGAR | Earnings, insider buying, institutional holdings | Free |

---

## Local development

```
git clone https://github.com/samer7/stock-dashboard.git
cd stock-dashboard
open index.html
```

No build step. Single HTML file. Edit and reload.

Once Phase 2 lands, the frontend will need a backend URL configured (probably via a `config.js` or a build-time env var).

---

## Code notes / cleanup before Phase 2

Items worth addressing as the codebase grows:

- `action-btn` CSS rule is missing its leading dot — currently a dead rule.
- `MOCK_DATA`, `CONGRESS`, and `LOG` are three parallel objects keyed by ticker. Consolidate into a single `STOCKS[ticker] = { ..., congress: [], log: [] }` shape before wiring real APIs — easier to reason about and easier to map to API responses.
- Inline `onclick` handlers should migrate to `addEventListener` once the file grows past a single screen.
- User-provided ticker input flows into `innerHTML` — uppercase-only filtering covers this for now, but once ticker metadata starts coming from API responses, sanitize before injecting.
- `genSparkline` returns a fresh random walk on every render, so the sparkline visually contradicts the price/change shown. Either freeze the random seed per ticker or hide sparklines until real candle data is available.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)

---

## Known UI issues (deferred until real data lands)

- [ ] Sparkline charts lack scale and timeline context
- [ ] Stock cards could show more at-a-glance detail (% from 52w high/low, MA values)
- [ ] No onboarding or legend explaining what BUY / HOLD / SELL means or how signals are computed
- [ ] No "not financial advice" disclaimer surfaced in the UI itself
