# CLAUDE.md

Instructions for Claude Code working in this repository. Read this first.

## What this project is

A personal stock market dashboard for tracking price trends, technical signals, and congressional trading activity. It is a learning project owned by a developer working at an amateur/intermediate level — explain reasoning, prefer clarity over cleverness, and don't introduce advanced patterns without saying why.

## Architecture

Two parts, one repo:

- **Frontend** — `index.html` at the repo root. Single-file HTML/CSS/vanilla JS, uses Chart.js for sparklines. Deployed to GitHub Pages. No build step.
- **Backend** — `/server` folder. Minimal Node + Express server that proxies the Finnhub API, hides the API key, and caches responses. Intended to deploy to Render (not yet deployed as of this writing).

The frontend talks to the backend over HTTP. The backend talks to Finnhub. The API key lives only on the backend.

```
Browser (index.html, GitHub Pages)
   → fetch → Backend (Express, Render)
       → fetch (with secret key) → Finnhub API
```

## Current state (Phase 4 in progress)

- Backend deployed to Render at `https://samer7-stock-api.onrender.com` (free tier). `npm start` in `/server` also runs it locally on port 3000.
- Three data sources: **Finnhub** supplies live quotes (`GET /api/quote/:ticker`, 60s cache); **Twelve Data** supplies historical daily closes (`GET /api/history/:ticker`, 6h cache); the **U.S. House Clerk** disclosure feed supplies congressional trades (`GET /api/congress/:ticker`, 12h cache, no API key). Finnhub's free tier blocks historical candles, which is why Twelve Data was added.
- `/api/history` computes MA20/MA50/MA200, a BUY/HOLD/SELL signal with reason text, RSI(14), MACD(12/26/9), 52w high/low, and volume server-side, plus a 30-day sparkline of real closes.
- `/api/congress` downloads the House Clerk's yearly disclosure ZIP, parses each recent PTR PDF (via `pdf-parse`), and buckets tickered trades by ticker. House only; ~90% of PTRs are machine-readable (the rest are scanned and skipped). Any `(TICKER) [XX]` asset tag is kept except `[OP]` options and `[CT]` crypto (both would mislead); non-`[ST]` trades carry an `asset` tag the UI labels. Note: filers tag ETFs `[ST]` — the `[EF]` tag never occurs in practice. The per-ticker response includes `bands` (buy/sell counts per disclosure dollar band, over all trades in the window) and `total`.
- `GET /api/congress/recent` serves the cross-ticker feed (newest 100 trades from the same index, future-dated filer typos filtered). The route is registered BEFORE `/api/congress/:ticker` so the literal path wins. The frontend groups feed rows by member + day so one filer's bulk rebalance doesn't flood the list.
- Frontend (`index.html`) fetches all three endpoints per ticker. `BACKEND_URL` constant points at the Render service. Cards start as loading placeholders (no mock data anywhere); persisted watchlist tickers hydrate on reload; invalid tickers show an error state.
- Nothing is mock anymore. The last mock piece (signal history log) was removed rather than simulated — the UI section says "not tracked yet". (Market cap was removed earlier for the same reason.)
- Known limitations: Finnhub free-tier prices run ~2% off the official regular-session close (accuracy review deferred); congress data is House-only (Senate eFD deferred) and the first `/api/congress` call after a cold start is slow because it builds the disclosure index by reading many PDFs.

## Keys

- `FINNHUB_API_KEY` and `TWELVE_DATA_API_KEY` both live in `server/.env` (gitignored) locally and as environment variables in the Render dashboard. Never commit them.

## Roadmap (see README.md for the full, detailed version)

Phases 1–3 done. Current and upcoming:

- **Phase 4 — data layers (in progress).** ✅ RSI/MACD, ✅ House congressional trades, ✅ sparkline trend color, ✅ widened congress coverage (365d window, 25-trade cap), ✅ "recent House activity" feed, ✅ any-asset-type ticker capture (with asset labels; options/crypto excluded on purpose), ✅ trade-size band breakdown. Remaining: surface untickered disclosures as an aggregate, Senate disclosures (deferred — gated eFD), and news + sentiment.
- **Phase 5 — signal rigor & evaluation harness.** Reframed goal: *not* precise prediction (unachievable; even top quant funds win ~51% of trades) but honestly-measured small edges. Build the evaluation harness FIRST (walk-forward/out-of-sample, transaction costs, Brier/log-loss, beat buy-and-hold + random-walk baselines), THEN probabilistic/volatility models, weighted multi-signal scoring, and risk/sizing (Sharpe, Kelly). Guard against lookahead/overfitting/survivorship bias. Note the congressional 45-day delay limits its short-term predictive value.
- **Phase 6 — paper trading / "simulated run."** Fake-money portfolio following the site's suggestions. Shares ONE simulator core with Phase 5a (backtest = same engine run over history; paper-trade = run forward). 6a manual (localStorage, live-priced, benchmarked vs buy-and-hold); 6b auto-follow = live forward-test.
- **Phase 7 — UI polish.** **Phase 8 — multi-user** (only if scope expands; a real DB like Supabase enters only here).

When working on Phase 5/6, keep the owner-is-learning ethos: explain the math, prefer clarity, and never report an "accuracy" number that isn't out-of-sample and cost-aware.

## Key files

| Path | What it is |
| --- | --- |
| `index.html` | The entire frontend. Edit carefully — it's one file. |
| `server/server.js` | The backend. Endpoints: `GET /api/quote/:ticker` (live), `GET /api/history/:ticker` (history + signal + RSI/MACD), `GET /api/congress/recent` (cross-ticker feed), `GET /api/congress/:ticker` (House trades), `GET /health`. |
| `server/package.json` | Node dependencies (express, cors, dotenv, adm-zip, pdf-parse). |
| `server/.env` | Real Finnhub API key. GITIGNORED. Never read aloud, never commit. |
| `server/.env.example` | Template showing required env vars. Safe to commit. |
| `README.md` | Human-facing project overview and roadmap. |
| `CHANGELOG.md` | Version history. |

## Commands

All backend commands run from inside `/server`:

```
cd server
npm install        # install dependencies (after cloning or changing package.json)
npm start          # start the server on port 3000
```

Test the backend (from any directory, while the server is running):

```
curl http://localhost:3000/api/quote/AAPL
```

Frontend: just open `index.html` in a browser. No build, no server needed for the frontend itself.

## Critical rules — do not break these

- **Never commit secrets.** `server/.env` contains a real API key and is gitignored. Do not move the key into any tracked file, do not echo it into committed code, do not hardcode it. If asked to wire up the key, use environment variables only.
- **Never call Finnhub directly from the frontend.** The whole reason the backend exists is to keep the API key off the client. Any real-data fetching from `index.html` must go through the backend, not to Finnhub directly.
- **This dashboard is not financial advice.** Signals are heuristic. Keep the in-UI disclaimer intact; don't remove it.
- **Don't fabricate the signal logic as "done."** If signal computation is still placeholder, say so. Don't write code that looks like it computes signals but actually returns hardcoded values without flagging it clearly.
- **Run `git status` understanding before committing.** Confirm `.env` and `node_modules/` never appear in staged changes.

## Conventions

- Frontend stays vanilla JS + Chart.js for now. Don't introduce a framework (React, Vue) without discussing it first — it's a deliberate simplicity choice.
- Backend stays minimal Express. No database yet (watchlist is in browser localStorage). A database only enters the picture if multi-user support (Phase 7) is actually pursued.
- Keep changes small and explain them. The owner is learning; a clear diff with a short explanation is more valuable than a large refactor.
- Preserve the existing visual design of the frontend unless asked to change it.

## Gotchas

- Finnhub free tier is rate-limited (~60 calls/min). The 60-second cache in `server.js` is there to respect this — keep it.
- Finnhub returns `{ c: 0, pc: 0 }` for invalid tickers rather than an error; the backend already special-cases this.
- Render's free tier sleeps after inactivity (~30s cold start on first request). The frontend shows loading states on every card until data arrives — keep that behavior.
- Node version in use: v20.x. Don't rely on features newer than that without checking.
