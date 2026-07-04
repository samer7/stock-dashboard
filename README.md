# Stock Dashboard

A personal stock market dashboard for tracking trends, technical signals, and congressional trading activity.

> **Status:** Prototype. Everything shown is real data via a deployed backend: **live prices**, **MA-based signals**, **RSI/MACD**, and **House congressional trades**. Nothing is simulated anymore — the last mock piece (a hand-written signal history log) was removed; that section now honestly says "not tracked yet". See "Honest state" below.

---

## What it does (today)

- Watchlist of tracked tickers rendered as cards with price, daily change, and a signal badge
- Sparkline per card for quick visual trend, drawn from real 30-day closes and colored by the 30-day trend
- BUY / HOLD / SELL badges with signal-change indicators (e.g. HOLD → BUY)
- Expandable detail view per ticker with 52w high/low, volume, market cap, and signal reasoning
- Congressional trade activity per ticker (real U.S. House STOCK Act disclosures)
- Watchlist persists across sessions via `localStorage`
- Loading states while data is fetched (matters on the free-tier backend's ~30s cold start); invalid tickers show a clear error instead of fake numbers

## Honest state of the project

Being upfront about what's real and what isn't, because the line matters:

| Feature | Real | Simulated |
| --- | --- | --- |
| UI / interaction | ✅ | |
| Watchlist persistence | ✅ | |
| Price, change, change % | ✅ live from Finnhub via backend | |
| Moving average signals (MA20/50/200) | ✅ computed server-side from Twelve Data history | |
| RSI (14) / MACD (12/26/9) | ✅ computed server-side from the same closes | |
| Sparkline data | ✅ real 30-day closing prices | |
| Volume, 52w high/low | ✅ from Twelve Data history | |
| Congressional trades (House) | ✅ real U.S. House Clerk disclosures | |
| Signal history log | — not built yet | (was hardcoded; the fake log was removed) |

Price, change, and change % are real (Finnhub via the backend). Signals are real too: the backend pulls ~250 daily closes from Twelve Data, computes MA20/MA50/MA200 plus RSI(14) and MACD(12/26/9), and derives BUY/HOLD/SELL with reason text from the actual price-vs-MA relationships. Sparklines draw real 30-day closing prices, and 52w high/low and volume come from the same history. Congressional trades are real U.S. House STOCK Act disclosures parsed from the House Clerk feed (House only; Senate deferred). Nothing is simulated anymore: cards show a loading state until real data arrives, and the signal history section says "not tracked yet" instead of displaying an invented log. (Note: Finnhub free-tier prices run ~2% off the official regular-session close; data-accuracy review is deferred.)

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
- ✅ Sparkline color reflects the 30-day trend rather than today's price change
- ✅ Widen congress coverage: parse window 120 → 365 days; per-ticker display cap 10 → 25 (window is bounded by the current-year disclosure feed — early in a calendar year it effectively spans "Jan 1 → today"; spanning the prior year's feed is deferred)
- 🔲 Capture clean tickers on **any** asset type, not just `[ST]` — picks up exchange-traded funds/ETFs that filers tag differently
- 🔲 Surface **untickered** disclosures (bonds, private/managed funds, structured products) as an aggregate count so that activity isn't invisible — most non-stock holdings have no market ticker and can't be matched, but they should still be visible
- 🔲 "Recent House activity" feed — a non-ticker-filtered view of the latest disclosures across all active filers (only ~84 of 435 reps trade individual stocks, and the top 10 are ~29% of filings, so a feed reads far more substantial than per-ticker slices)
- 🔲 Trade-size **band breakdown** — distribution across the disclosure bands ($1K–$15K … $50M+), per ticker and/or in the feed
- 🔲 Senate disclosures — separate eFD system behind a click-through agreement; own mini-project, deferred
- 🔲 News headlines with sentiment classification

### 🔲 Phase 5 — Signal rigor & evaluation harness

The honest core of the project. **Reframed goal:** not "predict prices precisely" (not achievable by anyone — even the best quant funds win ~51% of trades), but **quantify uncertainty well and find small, statistically validated edges, measured without self-deception.** "Minimal error" claims almost always come from lookahead bias, overfitting, survivorship bias, or ignoring costs — so the harness comes *before* any fancy model.

- **5a — Evaluation harness first:** a portfolio simulator with walk-forward (out-of-sample) testing, transaction costs + slippage, proper error metrics, and baselines to beat (buy-and-hold and a random walk). No strategy is trusted until it beats those out-of-sample.
- **5b — Probabilistic signals:** convert BUY/HOLD/SELL into *calibrated probabilities*; add volatility modeling (GARCH/EWMA — volatility is far more predictable than price); grade with proper scoring rules (Brier score, log-loss).
- **5c — Weighted multi-signal model:** combine MA / RSI / MACD / congressional flow, each weighted by its validated track record (Bayesian or regularized regression; time-series cross-validation only).
- **5d — Risk & sizing:** Sharpe / Sortino / max-drawdown reporting; Kelly-based position sizing.
- Caveat to test, not assume: the congressional signal carries a ~45-day disclosure delay, so its predictive horizon is long and likely weak for short-term moves.

### 🔲 Phase 6 — Paper trading / simulated portfolio ("simulated run")

Hypothetically invest fake money by following the site's suggestions and track the results. Built on the **same simulator core as Phase 5a** — a backtest and a paper-trade are the same engine with a different clock (historical vs. forward). The auto-follow mode is a **live, lookahead-proof forward-test** of the strategy, which is the gold standard for proving signals aren't fooling us.

- **6a — Manual paper portfolio:** start with fake cash, buy/sell at live prices on suggestions, transaction log, value charted **against a buy-and-hold benchmark**. localStorage-backed (single-user). Can ship relatively early as a standalone feature.
- **6b — Auto-follow mode:** the system executes its own signals forward over time = live forward-test, reusing the Phase 5 engine + metrics (return, Sharpe, drawdown).
- Honest caveat: a single run reflects whatever market regime it ran in and accrues slowly — a great gut-check and demo, but a complement to backtesting, not a replacement.

### 🔲 Phase 7 — UI polish (intentionally later)

Deferred until real data is flowing, because much of this changes once the data is real.

### 🔲 Phase 8 — Multi-user (only if scope expands)

Decision point: this only matters if the tool is meant to be used by other people. A personal tool can stay client-only with localStorage. A real database (e.g. Supabase) only enters here.

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