// data.js — historical daily closes for backtesting, with a disk cache.
//
// The live dashboard only needs ~250 closes (one year) per ticker, but a
// backtest wants as much history as it can get. Twelve Data's free tier
// allows up to 5000 daily bars per request (~20 years of trading days) for
// one API credit, within a budget of 8 calls/minute and 800/day. That's
// plenty — as long as we don't refetch the same data over and over.
//
// So: the first fetch for a ticker is saved to disk (harness/cache/TICKER.json)
// and every later run reads the file. Pass --refresh to force a refetch.
//
// The cache isn't just about rate limits — it's about REPRODUCIBILITY. A
// backtest should give the same answer every time it runs. Frozen input data
// is the first ingredient of that (deterministic code is the second).

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CACHE_DIR = path.join(__dirname, 'cache');
const API_KEY = process.env.TWELVE_DATA_API_KEY;

// `adjusted: false` (default) fetches split-adjusted closes — the same view of
// prices the live dashboard computes signals from. `adjusted: true` fetches
// TOTAL-RETURN closes (splits AND dividends folded in, adjust=all), which is
// the honest basis for long-run return comparisons: a stock paying 5%/year in
// dividends (like AT&T) looks like a loser on price alone while actually
// making money. The two views cache to separate files.
async function loadDailyHistory(ticker, { refresh = false, adjusted = false } = {}) {
  const file = path.join(CACHE_DIR, `${ticker}${adjusted ? '.adj' : ''}.json`);

  if (!refresh && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  if (!API_KEY) {
    throw new Error('TWELVE_DATA_API_KEY is not set — expected it in server/.env');
  }

  const adjust = adjusted ? '&adjust=all' : ''; // API default is splits-only
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=5000${adjust}&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'error' || !Array.isArray(data.values)) {
    throw new Error(`Twelve Data returned no data for ${ticker}: ${data.message || 'unknown error'}`);
  }

  // The API returns newest-first. A backtest walks time forward, so reverse
  // to chronological (oldest-first) once here and never think about it again.
  const days = data.values
    .map(v => ({ date: v.datetime, close: parseFloat(v.close) }))
    .reverse();

  const history = { ticker, adjusted, fetchedAt: new Date().toISOString(), days };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(history));
  return history;
}

// The cache never expires on purpose (reproducibility), but a report computed
// on months-old data should say so. Returns a warning string or null.
function stalenessWarning(history) {
  const ageDays = (Date.now() - Date.parse(history.fetchedAt)) / 86_400_000;
  if (ageDays <= 30) return null;
  return `⚠ ${history.ticker} data is ${Math.round(ageDays)} days old — pass --refresh to refetch`;
}

module.exports = { loadDailyHistory, stalenessWarning };
