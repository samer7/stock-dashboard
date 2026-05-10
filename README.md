# Stock Dashboard

A personal stock market dashboard for tracking trends, signals, and congressional trading activity.

---

## What it does

- Watchlist of tracked tickers with live price, daily change, and signal badges
- Buy / Hold / Sell signals based on moving average analysis (MA20, MA50, MA200)
- Sparkline charts for quick 7-day trend view
- Congressional trade activity per ticker (STOCK Act disclosures)
- Signal history log to track when and why signals changed
- Expandable detail view per ticker with key metrics

---

## Project status

Currently in **Phase 2** — watchlist dashboard with simulated data. Live API integration coming in Phase 3.

---

## Roadmap

### ✅ Phase 1 — Stock lookup dashboard
- Single ticker search with price, stats, signal, and news sentiment
- Moving average signal logic (MA20, MA50, MA200)
- Interactive price chart with range toggles (1W, 1M, 3M, 6M, 1Y)
- News headlines with AI-powered sentiment classification

### ✅ Phase 2 — Watchlist
- Multi-ticker watchlist grid
- Signal change indicators (e.g. HOLD → BUY)
- Sparkline charts per card
- Congressional trade activity layer
- Signal history log per ticker
- Expandable detail view

### 🔲 Phase 3 — Live data + hosting
- Wire in Finnhub API for real-time prices
- Wire in Alpha Vantage for pre-calculated technical indicators
- Wire in Quiver Quantitative for real congressional trade data
- Resolve CORS via backend server
- Secure API key handling (server-side only)

### 🔲 Phase 4 — Signal logic refinement
- Weighted scoring system across multiple inputs
- Inputs: moving averages, news sentiment, congressional activity, RSI, MACD, institutional holdings
- Each input casts a weighted vote toward final BUY / HOLD / SELL signal
- Back-testing signal accuracy against historical data

### 🔲 Phase 5 — Accounts + multi-user
- User authentication
- Personal watchlists saved to database (Supabase)
- Each user tracks their own portfolio

### 🔲 Phase 6 — Mobile app
- Mobile-optimized UI
- React Native or progressive web app
- Reuses existing signal and data logic

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Charts | Chart.js |
| Hosting | GitHub Pages |
| Version control | Git / GitHub |
| Data (planned) | Finnhub, Alpha Vantage, Quiver Quantitative |
| Backend (planned) | TBD |
| Database (planned) | Supabase |

---

## Data sources

| Source | Purpose |
|---|---|
| Finnhub | Real-time price, news, congressional trades |
| Alpha Vantage | Pre-calculated technical indicators (RSI, MACD) |
| Quiver Quantitative | Cleaned STOCK Act congressional disclosures |
| SEC EDGAR | Earnings, insider buying, institutional holdings |

---

## Local development

```bash
git clone https://github.com/samer7/stock-dashboard.git
cd stock-dashboard
open index.html
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md)