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

async function loadDailyHistory(ticker, { refresh = false } = {}) {
  const file = path.join(CACHE_DIR, `${ticker}.json`);

  if (!refresh && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  if (!API_KEY) {
    throw new Error('TWELVE_DATA_API_KEY is not set — expected it in server/.env');
  }

  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=5000&apikey=${API_KEY}`;
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

  const history = { ticker, fetchedAt: new Date().toISOString(), days };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(history));
  return history;
}

module.exports = { loadDailyHistory };
