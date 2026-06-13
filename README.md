# Stock Dashboard

A personal stock market dashboard for tracking trends, technical signals, and congressional trading activity.

> **Status:** Prototype. UI shows **live prices** and **real MA-based signals** for the watchlist via a deployed backend. Congressional trades, signal history, and some metrics are still simulated — see "Honest state" below.

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
| Price, change, change % | ✅ live from Finnhub via backend | |
| Moving average signals (MA20/50/200) | ✅ computed server-side from Twelve Data history | |
| Sparkline data | ✅ real 30-day closing prices | |
| Volume, market cap, 52w high/low | | ⚠️ hardcoded |
| Congressional trades | | ⚠️ hardcoded sample data |
| Signal history log | | ⚠️ hardcoded |

Price, change, and change % are real (Finnhub via the backend). Signals are real too: the backend pulls ~250 daily closes from Twelve Data, computes MA20/MA50/MA200, and derives BUY/HOLD/SELL with reason text from the actual price-vs-MA relationships. Sparklines draw real 30-day closing prices. Still hand-written: congressional trades, the signal history log, and the 52w/volume/market-cap metrics. (Note: Finnhub free-tier prices run ~2% off the official regular-session close; data-accuracy review is deferred.)

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

### ✅ Phase 2 — Backend + one real data source (done)

The critical phase: real price data flowing end-to-end.

- Minimal backend (Node/Express) deployed to Render free tier — see [`/server`](./server)
- Single endpoint: `GET /api/quote/:ticker` proxying Finnhub, with 60s in-memory cache
- Secure API key handling — keys live server-side, never in client code
- CORS enabled for the frontend origin
- UI wired to consume the real endpoint — started with AAPL, then expanded to the full watchlist

### ✅ Phase 3 — Real signal computation (done)

- Fetch historical daily closes from Twelve Data (Finnhub free tier blocks candle data)
- Compute MA20 / MA50 / MA200 server-side in `GET /api/history/:ticker`
- Generate the "reason" text from actual price-vs-MA relationships
- Render real 30-day sparklines from real closing prices

### 🔸 Phase 4 — Additional data layers (in progress)

- ✅ RSI (14) / MACD (12/26/9) indicators — computed server-side from the closes already fetched for the moving averages (no extra API calls); shown in the detail panel with color-coded labels
- ✅ Real congressional disclosures (House) — built from the official U.S. House Clerk feed (free, no API key), parsing each recent PTR PDF server-side and bucketing stock trades by ticker. Paid options (Quiver, FMP, Finnhub) were all rejected as not-free; the community "stock-watcher" datasets are abandoned (last updated 2021).
- 🔲 Senate disclosures — separate eFD system behind a click-through agreement; deferred
- 🔲 News headlines with sentiment classification
- ✅ Sparkline color reflects the 30-day trend rather than today's price change

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
| Backend | Node + Express, deployed to Render | same |
| Data | Finnhub (live quotes) + Twelve Data (history/signals) | + Quiver / news for later phases |
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