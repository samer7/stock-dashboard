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
const AdmZip = require('adm-zip');    // Reads the House Clerk's yearly disclosure ZIP in memory
const pdfParse = require('pdf-parse'); // Extracts text from the individual disclosure PDFs
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

// Cache for company news headlines. News changes faster than daily closes but
// far slower than prices, so 30 minutes balances freshness against Finnhub's
// rate limit (each watchlist ticker costs one news call on page load).
const newsCache = {};
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const NEWS_WINDOW_DAYS = 7;  // how far back to ask Finnhub for headlines
const NEWS_MAX_ITEMS = 8;    // trimmed list the UI actually renders

// ---------- Congressional trades cache ----------
// Unlike the quote/history caches (one entry per ticker), congressional data is
// built as a SINGLE index covering every ticker at once. The reason: to find
// which members traded AAPL we have to read every recent disclosure PDF anyway,
// so we read them all once, bucket the trades by ticker, and serve from that.
//
// `congressIndex` holds two views of the same parsed trades:
//   byTicker — TICKER -> array of trade objects (for /api/congress/:ticker)
//   recent   — flat newest-first list across ALL tickers (for /api/congress/recent)
// `congressBuild` holds the in-progress build promise so that concurrent
// requests share one build instead of each kicking off their own (these
// builds download many PDFs).
let congressIndex = null;
let congressBuiltAt = 0;
let congressBuild = null;
const CONGRESS_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — filings update ~daily
const CONGRESS_WINDOW_DAYS = 365; // parse filings disclosed in the last ~12 months —
// but coverage is also bounded by the current-year ZIP (see buildCongressIndex): we only
// download THIS year's disclosure feed, so early in a calendar year the effective window
// is "Jan 1 → today", not a true rolling 365 days. Spanning the prior year is deferred.
const CONGRESS_PDF_CONCURRENCY = 6; // how many PDFs to download/parse at once
const CONGRESS_FEED_SIZE = 100; // how many trades /api/congress/recent returns.
// 100 (not ~30) because one member rebalancing a portfolio can file dozens of
// trades in a single day; the frontend groups by member+day, so it needs a
// deeper slice to show a *diverse* feed rather than one filer's bulk day.

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

// ---------- RSI (Relative Strength Index) ----------
// RSI is a 0–100 momentum gauge. Roughly: above 70 is "overbought" (price has
// climbed fast and may be due for a pullback), below 30 is "oversold". It
// compares the size of recent up-moves to recent down-moves over `period` days.
//
// We use Wilder's smoothing — the original 1978 definition — so our numbers
// line up with what brokers and sites like TradingView/Yahoo show. A plain
// average of gains/losses would be close, but subtly different.
//
// `closes` is newest-first (like the other helpers); the math reads more
// naturally oldest-first, so we reverse a copy first.
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null; // need period+1 closes for period changes
  const chron = [...closes].reverse(); // oldest → newest

  // Step 1: seed with the average gain and average loss over the first
  // `period` day-to-day changes.
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = chron[i] - chron[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  // Step 2: Wilder-smooth those averages forward through the rest of the data.
  // Each new day nudges the running average rather than recomputing from scratch.
  for (let i = period + 1; i < chron.length; i++) {
    const change = chron[i] - chron[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  // Step 3: turn the final averages into the 0–100 value.
  if (avgLoss === 0) return 100; // no down-moves at all → pinned at the top
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// An exponential moving average (EMA) over a chronological (oldest→newest)
// series. Unlike the SMA above, an EMA weights recent prices more heavily.
// We seed it with a simple average of the first `period` values, then roll
// forward. Returns an array the same length as the input, with null in the
// early slots that don't have enough data behind them yet. MACD needs EMAs,
// which is why this is separate from sma().
function emaSeries(values, period) {
  const k = 2 / (period + 1); // smoothing factor: how much each new day counts
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period; // seed = SMA of the first `period` values
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// ---------- MACD (Moving Average Convergence Divergence) ----------
// MACD reads momentum by subtracting a slow EMA (26-day) from a fast EMA
// (12-day) — that difference is the "MACD line". A 9-day EMA of that line is
// the "signal line". When the MACD line crosses above the signal line it's
// read as bullish momentum; crossing below, bearish. The "histogram" is just
// the gap between the two lines (positive = MACD above signal).
//
// `closes` is newest-first; reverse to chronological for the EMA math.
function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null; // not enough history
  const chron = [...closes].reverse();

  const emaFast = emaSeries(chron, fast);
  const emaSlow = emaSeries(chron, slow);

  // The MACD line only exists where BOTH EMAs do (from day `slow` onward).
  const macdLine = chron.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
  );

  // Signal line = 9-day EMA of the MACD line's defined portion.
  const defined = macdLine.filter(v => v !== null);
  const signalArr = emaSeries(defined, signalPeriod);

  const macdValue = defined[defined.length - 1];
  const signalValue = signalArr[signalArr.length - 1];
  if (macdValue === undefined || signalValue === null) return null;

  return {
    macd: macdValue,
    signal: signalValue,
    histogram: macdValue - signalValue,
  };
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

    // Two more technical indicators, computed from the same closes we already
    // have (no extra API calls). rsi() and macd() return null if there isn't
    // enough history; the frontend should treat null as "not available".
    const rsi14 = rsi(closes, 14);
    const macdData = macd(closes);

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
      // Round to keep the payload tidy: RSI to 1 decimal, MACD values to 2.
      rsi: rsi14 === null ? null : Number(rsi14.toFixed(1)),
      macd: macdData === null ? null : {
        macd: Number(macdData.macd.toFixed(2)),
        signal: Number(macdData.signal.toFixed(2)),
        histogram: Number(macdData.histogram.toFixed(2)),
      },
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

// ---------- Company news ----------
// GET /api/news/:ticker
// Finnhub's free tier includes company news (unlike candles). We ask for the
// last NEWS_WINDOW_DAYS of headlines and pass along a small, deduplicated,
// newest-first list. Sentiment is deliberately NOT scored yet — showing plain
// headlines honestly beats bolting on a crude classifier; scoring is a
// follow-up with its own design decision (word-list vs. LLM).

// Unix seconds -> "Jul 3", matching the short dates used elsewhere in the UI.
function formatNewsDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

app.get('/api/news/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z.]/g, '');
  if (!ticker || ticker.length > 6) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  const cached = newsCache[ticker];
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.data, cached: true });
  }

  // Finnhub wants explicit from/to dates (YYYY-MM-DD).
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const to = new Date();
  const from = new Date(Date.now() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${isoDay(from)}&to=${isoDay(to)}&token=${FINNHUB_API_KEY}`;

  try {
    const finnhubResponse = await fetch(url);
    if (!finnhubResponse.ok) {
      return res.status(finnhubResponse.status).json({
        error: `Finnhub returned ${finnhubResponse.status}`,
      });
    }
    const raw = await finnhubResponse.json();
    // Finnhub returns [] for tickers with no coverage (and for invalid ones —
    // unlike /quote there's no zero-price tell here). An empty list is a valid
    // answer: the UI says "no recent headlines" rather than erroring.
    if (!Array.isArray(raw)) {
      return res.status(502).json({ error: 'Unexpected news response' });
    }

    // Newest first, then dedupe: aggregators syndicate the same story under
    // near-identical headlines, so we key on the normalized headline text.
    raw.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
    const seen = new Set();
    const articles = [];
    for (const a of raw) {
      if (!a.headline || !a.url) continue;
      const key = a.headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push({
        headline: a.headline,
        source: a.source || '',
        url: a.url,
        date: formatNewsDate(a.datetime || 0),
      });
      if (articles.length >= NEWS_MAX_ITEMS) break;
    }

    const result = { ticker, articles, count: articles.length };
    newsCache[ticker] = { data: result, expiresAt: Date.now() + NEWS_CACHE_TTL_MS };
    res.json(result);
  } catch (err) {
    console.error('Error fetching news:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// ---------- Congressional trades ----------
// Source: the U.S. House Clerk's official financial-disclosure feed. Every year
// is published as a ZIP at disclosures-clerk.house.gov containing a tab-separated
// index of all filings, and each "Periodic Transaction Report" (PTR) is a PDF.
// PTRs are where members report individual stock trades, as required by the
// STOCK Act. This is free, official, and updated daily — no API key.
//
// Two practical limits we accept for this first version:
//   1. House only. The Senate publishes through a different system (eFD) that
//      sits behind a click-through agreement, so it's deferred.
//   2. ~90% of recent PTRs are filed electronically and produce machine-readable
//      PDFs; the other ~10% are scanned/handwritten and yield no text. We simply
//      skip those rather than guess. We also only keep STOCK trades that carry a
//      clean ticker symbol (the "(AAPL) [ST]" form) — bonds, options, and assets
//      without a ticker are skipped so we never mis-attribute a trade.

// Compact a dollar figure like 15001 into "$15K" / "$1.5M" for display.
// Band floors are off-by-one ($1,000,001), so round to one decimal and let
// whole numbers drop the ".0" — 1000001 → "$1M", 1500000 → "$1.5M".
function abbreviateDollars(n) {
  if (n >= 1_000_000) return '$' + Math.round(n / 100_000) / 10 + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + n;
}

// PTR amounts are disclosed as ranges ("$15,001 - $50,000"), not exact figures.
// Turn the two raw numbers into a tidy "$15K–$50K". An open-ended top ("$50M+")
// is possible for the largest band.
function formatRange(loStr, hiStr) {
  const lo = parseInt(loStr.replace(/,/g, ''), 10);
  if (!hiStr) return abbreviateDollars(lo) + '+';
  const hi = parseInt(hiStr.replace(/,/g, ''), 10);
  return abbreviateDollars(lo) + '–' + abbreviateDollars(hi); // en dash
}

// "12/12/2025" -> "Dec 12". Keeps the display short like the rest of the UI.
function formatTxDate(mdy) {
  const [m, d, y] = mdy.split('/').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!m || !d || !y) return mdy;
  return `${months[m - 1]} ${d}`;
}

// Pull the tickered transactions out of one PTR's extracted text. We match any
// "(TICKER) [XX]" row — a ticker in parentheses immediately followed by a
// two-letter asset-type tag — which is the unambiguous, machine-readable case.
//
// In the PDF text a row looks like (after whitespace is collapsed):
//   "... Common Stock (NFLX) [ST] S 12/12/202501/06/2026$1,001 - $15,000"
// i.e. ticker, then the type letter (P purchase / S sale / E exchange), then the
// transaction date glued to the notification date, then the amount range.
//
// Asset tags, surveyed against the full 2026 corpus: ~99% of tickered rows are
// [ST] stock — which is also how filers tag ETFs, so ETFs were already covered.
// We now keep the other tickered types too ([OT] other, [PS] non-public stock,
// [RS] restricted, [AB] LP units, ...), passing the tag along so the UI can
// label them. Two tags stay excluded on purpose:
//   [OP] options — a bought put is bearish on the underlying, so showing it as
//        a plain "Buy" would mislead;
//   [CT] crypto — symbols collide with real stock tickers (e.g. (ETH) the coin
//        vs. ETH, Ethan Allen on the NYSE), so we'd mis-attribute trades.
const SKIPPED_ASSET_TAGS = new Set(['OP', 'CT']);

// Parse every transaction row in one PTR. The "(TICKER)" prefix is OPTIONAL in
// the regex: rows that have one (and aren't an excluded/exchange type) become
// trades; every other row — treasuries, bonds, private funds, options, crypto,
// exchanges — is counted by asset tag instead of being silently dropped.
// Roughly 17% of transaction rows have no ticker, so without this count a
// member could move millions in treasuries and look inactive on the dashboard.
function parseTransactions(text) {
  const flat = text.replace(/\s+/g, ' ');
  const re = /(?:\(([A-Z.]{1,5})\)\s*)?\[([A-Z]{2})\]\s*(P|S|E)(?:\s*\(partial\))?\s*(\d{2}\/\d{2}\/\d{4})\d{2}\/\d{2}\/\d{4}\$([\d,]+)\s*-\s*\$?([\d,]+)?/g;
  const trades = [];
  const skipped = {}; // asset tag -> count of rows not shown as trades
  let m;
  while ((m = re.exec(flat)) !== null) {
    const [, ticker, asset, typeCode, txDate, lo, hi] = m;
    // Not attributable as a clean stock trade: no ticker, an excluded type
    // (options/crypto), or an exchange (neither buy nor sell). Count it.
    if (!ticker || SKIPPED_ASSET_TAGS.has(asset) || typeCode === 'E') {
      skipped[asset] = (skipped[asset] || 0) + 1;
      continue;
    }
    trades.push({
      ticker,
      asset, // two-letter tag; the frontend labels anything that isn't [ST]
      type: typeCode === 'P' ? 'Buy' : 'Sell',
      range: formatRange(lo, hi),
      lo: parseInt(lo.replace(/,/g, ''), 10), // band floor — orders the size breakdown
      date: formatTxDate(txDate),
      txDate, // raw mm/dd/yyyy, kept for sorting
    });
  }
  return { trades, skipped };
}

// Aggregate trades into the disclosure's fixed dollar bands ("$1K–$15K", …),
// counting buys and sells per band, ordered smallest band first. PTRs never
// disclose exact amounts — the bands ARE the size data, so a distribution
// across them is the most honest "how big were these trades" view possible.
function bandBreakdown(trades) {
  const byRange = new Map();
  for (const t of trades) {
    let b = byRange.get(t.range);
    if (!b) { b = { range: t.range, lo: t.lo, buys: 0, sells: 0 }; byRange.set(t.range, b); }
    b[t.type === 'Buy' ? 'buys' : 'sells']++;
  }
  return [...byRange.values()]
    .sort((a, b) => a.lo - b.lo)
    .map(({ lo, ...band }) => band); // lo was only needed for ordering
}

// Strip internal-only fields before a trade goes out in an API response.
function publicTrade({ lo, ...t }) {
  return t;
}

// Run an async worker over `items` with at most `limit` in flight at once. This
// keeps us from opening hundreds of simultaneous connections to the House server
// (rude, and likely to get throttled) while still being much faster than one at
// a time.
async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// Download and parse every recent House PTR, returning a TICKER -> trades map.
// This is the expensive part (one HTTP request per PDF), so it runs at most once
// per cache window; callers go through getCongressIndex(), not this directly.
async function buildCongressIndex() {
  // We download only the current calendar year's feed. This caps real coverage: the
  // CONGRESS_WINDOW_DAYS cutoff can reach back 12 months, but the ZIP and PDF folder
  // below only hold this year's filings, so the prior year is invisible until we also
  // fetch ${year - 1}'s feed (deferred — it doubles the cold-start PDF count early in
  // the year). Net effect today: the window surfaces all of this year, nothing before.
  const year = new Date().getFullYear();
  const zipUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`;

  // 1. Grab the yearly ZIP and read the tab-separated index out of it.
  const zipResp = await fetch(zipUrl);
  if (!zipResp.ok) throw new Error(`House feed returned ${zipResp.status}`);
  const zip = new AdmZip(Buffer.from(await zipResp.arrayBuffer()));
  const txtEntry = zip.getEntries().find(e => e.entryName.endsWith('.txt'));
  if (!txtEntry) throw new Error('No index .txt inside the House ZIP');
  const rows = txtEntry.getData().toString('latin1').split('\n');

  // Columns: Prefix, Last, First, Suffix, FilingType, StateDst, Year, FilingDate, DocID
  const cutoff = Date.now() - CONGRESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const filings = [];
  for (let r = 1; r < rows.length; r++) { // r=0 is the header
    const c = rows[r].split('\t');
    if (c.length < 9) continue;
    const filingType = c[4];
    const docId = c[8].trim();
    if (filingType !== 'P') continue;          // P = Periodic Transaction Report
    if (!/^\d+$/.test(docId) || Number(docId) < 20_000_000) continue; // digital filings only
    const filed = Date.parse(c[7]);            // FilingDate, mm/dd/yyyy
    if (Number.isFinite(filed) && filed < cutoff) continue; // older than our window
    filings.push({
      docId,
      name: `Rep. ${c[2].trim()} ${c[1].trim()}`.replace(/\s+/g, ' ').trim(),
      district: c[5].trim(),
    });
  }

  // 2. Fetch + parse each filing's PDF, bucketing every stock trade by ticker
  // and tallying the rows we can't attribute (untickered assets, options, …).
  const index = {};
  const skippedByTag = {};
  await mapWithConcurrency(filings, CONGRESS_PDF_CONCURRENCY, async (f) => {
    const pdfUrl = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${f.docId}.pdf`;
    try {
      const resp = await fetch(pdfUrl);
      if (!resp.ok) return;
      const text = (await pdfParse(Buffer.from(await resp.arrayBuffer()))).text;
      const { trades: txs, skipped } = parseTransactions(text);
      for (const [tag, n] of Object.entries(skipped)) {
        skippedByTag[tag] = (skippedByTag[tag] || 0) + n;
      }
      for (const tx of txs) {
        (index[tx.ticker] ||= []).push({
          name: f.name,
          district: f.district,
          type: tx.type,
          asset: tx.asset,
          range: tx.range,
          lo: tx.lo, // internal: orders the band breakdown; stripped by publicTrade()
          date: tx.date,
          txDate: tx.txDate,
        });
      }
    } catch (err) {
      // A single unreadable/missing PDF shouldn't sink the whole build.
      console.error(`congress: skipped ${f.docId}:`, err.message);
    }
  });

  // 3. Sort each ticker's trades newest-first by the actual transaction date.
  for (const ticker of Object.keys(index)) {
    index[ticker].sort((a, b) => Date.parse(b.txDate) - Date.parse(a.txDate));
  }

  // 4. Build the flat "recent activity" view from the same trades: every trade
  // across every ticker, newest-first. This powers the cross-ticker feed —
  // only ~84 of 435 reps trade individual stocks, so a combined feed reads far
  // more substantial than any single ticker's slice. We keep only the newest
  // CONGRESS_FEED_SIZE trades since that's all the endpoint ever serves.
  // Skip trades dated in the future — those are filer typos (e.g. a real PDF
  // filed in 2026 listing "12/26/2026" for a December 2025 trade). Sorting
  // newest-first would otherwise pin such typos to the top of the feed for
  // months. The one-day grace covers timezone edges around "today".
  const maxDate = Date.now() + 24 * 60 * 60 * 1000;
  const recent = [];
  for (const [ticker, trades] of Object.entries(index)) {
    for (const t of trades) {
      if (Date.parse(t.txDate) <= maxDate) recent.push({ ticker, ...t });
    }
  }
  recent.sort((a, b) => Date.parse(b.txDate) - Date.parse(a.txDate));

  // 5. The unattributed aggregate: how many transaction rows in the window we
  // did NOT surface as trades, by asset tag. Keeps non-stock activity visible
  // as a count even though it can't be matched to any market ticker.
  const unattributed = {
    count: Object.values(skippedByTag).reduce((a, b) => a + b, 0),
    byTag: skippedByTag,
  };

  return { byTicker: index, recent: recent.slice(0, CONGRESS_FEED_SIZE), unattributed };
}

// Return the cached index, (re)building it if missing or stale. Concurrent
// callers during a build all await the same promise.
async function getCongressIndex() {
  const fresh = congressIndex && Date.now() - congressBuiltAt < CONGRESS_CACHE_TTL_MS;
  if (fresh) return congressIndex;
  if (!congressBuild) {
    congressBuild = buildCongressIndex()
      .then((idx) => {
        congressIndex = idx;
        congressBuiltAt = Date.now();
        return idx;
      })
      .finally(() => { congressBuild = null; });
  }
  return congressBuild;
}

// GET /api/congress/recent
// The cross-ticker feed: the newest trades across ALL tickers and filers,
// straight from the same parsed index. Registered BEFORE /api/congress/:ticker
// — Express matches routes in definition order, so this literal path must come
// first or "recent" would be treated as a ticker symbol.
app.get('/api/congress/recent', async (req, res) => {
  try {
    const index = await getCongressIndex();
    const trades = index.recent.map(publicTrade);
    res.json({
      trades,
      count: trades.length,
      // Rows in the window NOT shown as trades (no ticker, options, crypto,
      // exchanges), counted by asset tag so that activity isn't invisible.
      unattributed: index.unattributed,
      builtAt: new Date(congressBuiltAt).toISOString(),
      source: 'U.S. House Clerk financial disclosures (House only)',
    });
  } catch (err) {
    console.error('Error building congress index:', err);
    res.status(502).json({ error: 'Failed to load congressional disclosures' });
  }
});

// GET /api/congress/:ticker
// Returns recent House trades for one ticker, newest-first. The first call after
// startup (or after the 12h cache expires) triggers a build that downloads many
// PDFs and can take a while — the frontend should show a loading state.
app.get('/api/congress/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z.]/g, '');
  if (!ticker || ticker.length > 6) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  try {
    const index = await getCongressIndex();
    const all = index.byTicker[ticker] || [];
    const trades = all.slice(0, 25).map(publicTrade); // cap what we send the UI
    res.json({
      ticker,
      trades,
      count: trades.length,
      total: all.length, // real total in the window, since `trades` is capped
      // Size distribution across ALL of this ticker's trades in the window
      // (not just the capped list): [{ range, buys, sells }], smallest first.
      bands: bandBreakdown(all),
      builtAt: new Date(congressBuiltAt).toISOString(),
      source: 'U.S. House Clerk financial disclosures (House only)',
    });
  } catch (err) {
    console.error('Error building congress index:', err);
    res.status(502).json({ error: 'Failed to load congressional disclosures' });
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
