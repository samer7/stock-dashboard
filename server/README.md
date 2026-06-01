# Stock Dashboard API

Minimal Express backend for the stock dashboard. It sits between the browser and
two market-data providers, keeping API keys server-side and caching responses to
stay under rate limits.

- **Finnhub** — live price quotes
- **Twelve Data** — historical daily prices, used to compute moving-average signals

The browser never talks to these providers directly and never sees the keys.

```
Browser (index.html)  →  this backend  →  Finnhub      (live quotes)
                                       →  Twelve Data  (history + signals)
```

---

## Live API

**Base URL:** `https://samer7-stock-api.onrender.com`

| Endpoint | What it returns |
| --- | --- |
| `GET /health` | `{"status":"ok"}` — a quick "is the server awake?" check |
| `GET /api/quote/:ticker` | Live price and daily change (from Finnhub) |
| `GET /api/history/:ticker` | Moving averages, BUY/HOLD/SELL signal, 52-week high/low, volume, and a 30-day sparkline (from Twelve Data) |

Swap `:ticker` for any symbol, e.g. `/api/quote/MSFT` or `/api/history/NVDA`.

> **Note:** the root URL (`/`) intentionally returns "Cannot GET /". This is a
> pure API — there's no homepage. That's expected, not an error.

### Example: `GET /api/quote/AAPL`

```json
{
  "ticker": "AAPL",
  "price": 312.06,
  "change": -0.45,
  "changePct": -0.14,
  "high": 315.00,
  "low": 309.53,
  "open": 311.78,
  "prevClose": 312.51,
  "timestamp": 1780084800
}
```

Cached for **60 seconds**. A repeat call within that window includes `"cached": true`.

### Example: `GET /api/history/AAPL`

```json
{
  "ticker": "AAPL",
  "price": 312.06,
  "signal": {
    "label": "BUY",
    "reason": "Price 4.9% above MA20, 13.4% above MA50, 18.5% above MA200."
  },
  "ma20": 297.54,
  "ma50": 275.28,
  "ma200": 263.24,
  "high52": 315.00,
  "low52": 195.07,
  "volume": 69982800,
  "sparkline": [ /* 30 daily closes, oldest first */ ]
}
```

Cached for **6 hours** (daily data only changes once a day, after market close).

**How the signal is computed** (matches the legend in the UI):

- **BUY** — price is above MA20, MA50, *and* MA200 (bullish across all timeframes)
- **SELL** — price is below MA20 *and* MA50 (bearish short-term trend)
- **HOLD** — anything mixed or transitional

---

## Local setup

### 1. Install Node

If you don't have it, download the LTS version from [nodejs.org](https://nodejs.org), then verify:

```
node --version
```

You want v18 or higher; v20+ recommended.

### 2. Get the two free API keys

- **Finnhub** — sign up at [finnhub.io](https://finnhub.io). Free tier is ~60 requests/minute.
- **Twelve Data** — sign up at [twelvedata.com](https://twelvedata.com). Free tier is ~800 requests/day (8/minute).

Copy each key from its dashboard.

### 3. Install dependencies

In the `/server` folder:

```
npm install
```

This reads `package.json` and downloads `express`, `cors`, and `dotenv` into a
`node_modules` folder (which is gitignored — never commit it).

### 4. Create your `.env` file

```
cp .env.example .env
```

Open `.env` and fill in both real keys:

```
FINNHUB_API_KEY=your_finnhub_key
TWELVE_DATA_API_KEY=your_twelvedata_key
```

The `.env` file is gitignored — verify with `git status` that it never appears
before committing anything.

### 5. Run the server

```
npm start
```

You should see:

```
Server running on port 3000
Try: curl http://localhost:3000/api/quote/AAPL
```

### 6. Test it

In a new terminal (leave the server running):

```
curl http://localhost:3000/api/quote/AAPL
curl http://localhost:3000/api/history/AAPL
```

To stop the server: `Ctrl+C` in the terminal where it's running.

---

## Deploying to Render

This backend is already deployed at `https://samer7-stock-api.onrender.com`.
Render auto-redeploys on every push to `main`. To set it up from scratch:

### 1. Push to GitHub

Make sure `/server` is committed. Verify `.env` is **not** in the commit
(`git status` should not list it).

### 2. Create a Render account

Sign up at [render.com](https://render.com). The free tier works.

### 3. Create a new Web Service

- Click **New +** → **Web Service**, connect GitHub, and select the `stock-dashboard` repo.
- Configure:
  - **Name**: `samer7-stock-api` (becomes part of your URL)
  - **Root Directory**: `server`
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
  - **Plan**: Free

### 4. Add the environment variables

Under "Environment Variables", add **both** keys (the production equivalent of
your local `.env`):

- `FINNHUB_API_KEY` = your Finnhub key
- `TWELVE_DATA_API_KEY` = your Twelve Data key

### 5. Deploy

Click **Create Web Service**. Render installs dependencies, starts the server,
and gives you a URL like `https://samer7-stock-api.onrender.com`.

### 6. Test the deployed version

```
curl https://samer7-stock-api.onrender.com/api/history/AAPL
```

Same shape as local. Done.

---

## Notes

- **Cold starts**: Render's free tier spins the server down after ~15 minutes of
  inactivity. The next request takes ~30 seconds to wake it up; the frontend
  shows mock data until the real response arrives.
- **Rate limits**: Finnhub ~60/min, Twelve Data ~800/day. The 60-second quote
  cache and 6-hour history cache keep usage far under both limits for a personal
  watchlist.
- **If you ever leak a key**: regenerate it at the provider, then update both your
  local `.env` and the matching Render environment variable. The old key stops
  working within seconds.

---

## Next steps (Phase 4)

- **RSI / MACD** — Twelve Data already provides these indicators, so likely reuse it
  rather than adding another provider.
- **Real congressional trades** — Quiver Quantitative, or parse House/Senate filings.
- **News + sentiment** — headlines with a sentiment classification.
- **Market cap** — needs share-count (fundamentals) data; currently omitted from
  the UI rather than shown as a mock value.
