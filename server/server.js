// server.js
//
// A minimal Express backend that proxies Finnhub stock quotes.
//
// The whole job of this file:
//   1. Listen for requests like GET /api/quote/AAPL
//   2. Call Finnhub on behalf of the browser, using a secret API key
//   3. Cache the response for 60 seconds so we don't hammer Finnhub
//   4. Send the result back to the browser as JSON
//
// The key reason this server exists at all: the Finnhub API key must
// never be exposed to the browser. The browser talks to this server,
// this server talks to Finnhub. The key lives on the server.

// ---------- Imports ----------
// `require` is Node's way of loading other files or packages.
// These three packages are listed in package.json as dependencies.

const express = require('express');   // The web framework — handles routing and requests
const cors = require('cors');         // Lets browsers from other domains call this server
require('dotenv').config();           // Loads variables from a local .env file into process.env

// ---------- Configuration ----------
// `process.env` is how Node exposes environment variables.
// Locally, these come from the .env file (loaded by dotenv above).
// On Render, these come from the Environment Variables you set in the dashboard.

const PORT = process.env.PORT || 3000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

// Fail fast if the key is missing. Better to crash on startup with a clear
// error than to start up "successfully" and then return broken responses.
if (!FINNHUB_API_KEY) {
  console.error('ERROR: FINNHUB_API_KEY is not set. Create a .env file or set the env var.');
  process.exit(1);
}

// ---------- App setup ----------
const app = express();

// CORS = "Cross-Origin Resource Sharing". By default, a browser will refuse
// to let a page from one domain (like samer7.github.io) call an API on a
// different domain (like your-app.onrender.com). This line tells the
// browser "it's fine, I allow it." For a personal project, allowing all
// origins is fine. For a real product you'd lock this down to your domain.
app.use(cors());

// ---------- In-memory cache ----------
// A plain object that maps ticker symbols to { data, expiresAt }.
// "In-memory" means it lives in this process's RAM and disappears
// whenever the server restarts. That's fine for a 60-second cache —
// we don't need persistence, we just want to avoid burning rate limit
// on duplicate requests within a short window.

const cache = {};
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Separate cache for historical data + computed signals. Daily closes only
// change once a day (after market close), so we can cache these for hours.
// This keeps us comfortably under Twelve Data's free-tier request limits.
const historyCache = {};
const HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ---------- The actual endpoint ----------
// When the browser sends GET /api/quote/AAPL, Express runs this function.
// `req` is the incoming request, `res` is the response we send back.
// The `async` keyword lets us use `await` inside, which makes asynchronous
// code (like network calls) read top-to-bottom instead of nesting callbacks.

app.get('/api/quote/:ticker', async (req, res) => {
  // Normalize the ticker: uppercase, strip anything that isn't a letter or dot.
  // Tickers like BRK.B exist, but nothing legitimate has special characters.
  // This is defense-in-depth — we don't trust input from the browser.
  const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z.]/g, '');

  if (!ticker || ticker.length > 6) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  // ---------- Cache check ----------
  // If we fetched this ticker recently, return the cached copy instead of
  // calling Finnhub again. Date.now() returns the current time in milliseconds.
  const cached = cache[ticker];
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.data, cached: true });
  }

  // ---------- Fetch from Finnhub ----------
  // Finnhub's /quote endpoint returns an object like:
  //   { c: 213.49, d: 2.14, dp: 1.01, h: 215, l: 211, o: 212, pc: 211.35, t: 1234567890 }
  // where c = current price, d = change, dp = change %, etc.
  // Their full docs: https://finnhub.io/docs/api/quote

  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;

  try {
    // `fetch` is built into Node 18+. If you're on an older Node version,
    // you'd need to install node-fetch. Node 20 LTS is fine.
    const finnhubResponse = await fetch(url);

    if (!finnhubResponse.ok) {
      // Finnhub returned a non-2xx status. Pass the status code through so
      // the browser knows whether it's a 404 (bad ticker), 429 (rate limited), etc.
      return res.status(finnhubResponse.status).json({
        error: `Finnhub returned ${finnhubResponse.status}`,
      });
    }

    const data = await finnhubResponse.json();

    // Finnhub returns { c: 0, d: null, ... } for invalid tickers instead of 404.
    // Catch that explicitly so the browser gets a clear error.
    if (data.c === 0 && data.pc === 0) {
      return res.status(404).json({ error: `No data for ticker ${ticker}` });
    }

    // ---------- Reshape into our own format ----------
    // Finnhub's field names are terse (c, d, dp). Translate them into
    // something readable. Doing this on the server means the frontend
    // doesn't need to know anything about Finnhub's quirks — and if we
    // ever swap data providers, only this file changes.

    const result = {
      ticker,
      price: data.c,           // current price
      change: data.d,          // absolute change today
      changePct: data.dp,      // percent change today
      high: data.h,            // day's high
      low: data.l,             // day's low
      open: data.o,            // opening price
      prevClose: data.pc,      // previous close
      timestamp: data.t,       // unix timestamp of the quote
    };

    // Store in cache for next time
    cache[ticker] = {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    res.json(result);
  } catch (err) {
    // This catches network errors, timeouts, JSON parsing failures, etc.
    // We log the real error to the server console (useful for debugging on
    // Render's log viewer) but send a generic message to the browser.
    console.error('Error fetching quote:', err);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// ---------- Signal helpers ----------
// A "simple moving average" (SMA) is just the average of the last N closing
// prices. MA20 smooths over ~1 trading month, MA50 ~2.5 months, MA200 ~10
// months. Comparing today's price to these averages is a classic way to gauge
// trend: above the averages = uptrend, below = downtrend.
//
// `closes` is ordered newest-first (closes[0] is the most recent day), so the
// "last N days" are simply the first N entries.
function sma(closes, n) {
  if (closes.length < n) return null; // not enough history to compute this MA
  let sum = 0;
  for (let i = 0; i < n; i++) sum += closes[i];
  return sum / n;
}

// Turn the price-vs-MA relationships into a BUY / HOLD / SELL label plus a
// human-readable reason. Rules match the legend in the UI:
//   BUY  — price above MA20, MA50, AND MA200 (bullish across all timeframes)
//   SELL — price below MA20 AND MA50 (bearish short-term trend)
//   HOLD — anything mixed or transitional
function computeSignal(price, ma20, ma50, ma200) {
  // If we don't have enough history for the long averages, don't pretend.
  if (ma20 === null || ma50 === null || ma200 === null) {
    return { label: 'HOLD', reason: 'Not enough price history yet to compute a full signal.' };
  }

  // Describe each relationship as a readable phrase, e.g. "2.1% above MA20".
  const rel = (ma, name) => {
    const pct = ((price - ma) / ma) * 100;
    const dir = pct >= 0 ? 'above' : 'below';
    return `${Math.abs(pct).toFixed(1)}% ${dir} ${name}`;
  };
  const reason = `Price ${rel(ma20, 'MA20')}, ${rel(ma50, 'MA50')}, ${rel(ma200, 'MA200')}.`;

  let label;
  if (price > ma20 && price > ma50 && price > ma200) {
    label = 'BUY';
  } else if (price < ma20 && price < ma50) {
    label = 'SELL';
  } else {
    label = 'HOLD';
  }
  return { label, reason };
}

// ---------- History + signal endpoint ----------
// GET /api/history/:ticker
// Fetches ~250 daily closes from Twelve Data, computes the moving averages and
// signal on the server, and returns a small shape the frontend can render
// directly (it never sees Twelve Data's raw response or our API key).

app.get('/api/history/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z.]/g, '');

  if (!ticker || ticker.length > 6) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  if (!TWELVE_DATA_API_KEY) {
    return res.status(500).json({ error: 'TWELVE_DATA_API_KEY is not set on the server' });
  }

  // Serve from cache if we fetched this ticker's history recently.
  const cached = historyCache[ticker];
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.data, cached: true });
  }

  // outputsize=250 ~ a year of trading days, enough to compute MA200.
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=250&apikey=${TWELVE_DATA_API_KEY}`;

  try {
    const tdResponse = await fetch(url);
    const data = await tdResponse.json();

    // Twelve Data signals errors in the body with status: "error" (e.g. bad
    // ticker, rate limit) rather than always using an HTTP error code.
    if (data.status === 'error' || !Array.isArray(data.values)) {
      const msg = data.message || 'No data returned';
      const code = data.code === 429 ? 429 : 404;
      return res.status(code).json({ error: msg });
    }

    // values is newest-first. Pull out closing prices as numbers.
    const closes = data.values.map(v => parseFloat(v.close));
    const price = closes[0];

    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);
    const signal = computeSignal(price, ma20, ma50, ma200);

    // 52-week high/low from the full ~year of daily data we already have.
    // Each day reports its own high and low; the 52w high is the highest of
    // all the daily highs, the 52w low the lowest of all the daily lows.
    const high52 = Math.max(...data.values.map(v => parseFloat(v.high)));
    const low52 = Math.min(...data.values.map(v => parseFloat(v.low)));

    // Most recent day's trading volume.
    const volume = parseFloat(data.values[0].volume);

    // Sparkline: last 30 trading days, reversed to chronological (oldest→newest)
    // so the line reads left-to-right as time moving forward.
    const sparkline = data.values
      .slice(0, 30)
      .map(v => parseFloat(v.close))
      .reverse();

    const result = {
      ticker,
      price,
      signal,
      ma20,
      ma50,
      ma200,
      high52,
      low52,
      volume,
      sparkline,
    };

    historyCache[ticker] = {
      data: result,
      expiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
    };

    res.json(result);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ---------- Health check ----------
// A trivial endpoint that returns 200 OK. Useful for confirming the server
// is alive without burning a Finnhub API call, and Render uses it to check
// whether the service started successfully.

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------- Start the server ----------
// `app.listen` opens a port and starts accepting requests.
// The callback runs once the server is ready.

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/api/quote/AAPL`);
});
