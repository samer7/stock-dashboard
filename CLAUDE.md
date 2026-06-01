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

## Current state (Phase 3 complete, Phase 4 next)

- Backend deployed to Render at `https://samer7-stock-api.onrender.com` (free tier). `npm start` in `/server` also runs it locally on port 3000.
- Two data sources: **Finnhub** supplies live quotes (`GET /api/quote/:ticker`, 60s cache); **Twelve Data** supplies historical daily closes (`GET /api/history/:ticker`, 6h cache). Finnhub's free tier blocks historical candles, which is why Twelve Data was added.
- `/api/history` computes MA20/MA50/MA200 and a BUY/HOLD/SELL signal with reason text server-side, and returns a 30-day sparkline of real closes.
- Frontend (`index.html`) fetches both endpoints per ticker: live price from quote, real signal + sparkline from history. `BACKEND_URL` constant points at the Render service.
- Still mock: congressional trades, signal history log, and 52w high/low / volume / market cap.
- Known limitation: Finnhub free-tier prices run ~2% off the official regular-session close. Accuracy review is intentionally deferred.

## Keys

- `FINNHUB_API_KEY` and `TWELVE_DATA_API_KEY` both live in `server/.env` (gitignored) locally and as environment variables in the Render dashboard. Never commit them.

## Immediate next steps (Phase 4 — additional data layers)

1. RSI / MACD indicators — Twelve Data already provides these, so likely reuse it rather than adding Alpha Vantage.
2. Real congressional disclosures (Quiver Quantitative, or parse House/Senate filings).
3. News headlines with sentiment.

## Key files

| Path | What it is |
| --- | --- |
| `index.html` | The entire frontend. Edit carefully — it's one file. |
| `server/server.js` | The backend. One endpoint: `GET /api/quote/:ticker`. |
| `server/package.json` | Node dependencies (express, cors, dotenv). |
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
- Render's free tier sleeps after inactivity (~30s cold start on first request). The frontend should show a loading state once wired up.
- Node version in use: v20.x. Don't rely on features newer than that without checking.
