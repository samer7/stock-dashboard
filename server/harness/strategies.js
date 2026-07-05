// strategies.js — turns a price history into a day-by-day series of signals.
//
// The first strategy under test is the dashboard's own MA rule — the exact
// BUY/HOLD/SELL logic the site displays (computeSignal in server.js). That's
// deliberate: before adding any new signal, the harness should tell us
// whether the one we already show has any measurable edge.
//
// ⚠️ Keep the rule here in sync with computeSignal() in server.js:
//   BUY  — price above MA20, MA50, AND MA200
//   SELL — price below MA20 AND MA50
//   HOLD — anything mixed or transitional

// Rolling simple moving average for every day, computed with a running sum so
// the whole series costs O(n) instead of O(n·window). out[i] is the average
// of closes[i-window+1 .. i], or null for the first window-1 days where there
// isn't enough history yet.
function smaSeries(closes, window) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= window) sum -= closes[i - window]; // slide the window forward
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

// The dashboard's signal, evaluated at EVERY day in history using only data
// up to that day. This "only what was knowable at the time" discipline is the
// whole game in backtesting — using future data (lookahead bias) is the #1
// way backtests lie. out[i] is null until day 199 (MA200 needs 200 closes).
function maSignalSeries(closes) {
  const ma20 = smaSeries(closes, 20);
  const ma50 = smaSeries(closes, 50);
  const ma200 = smaSeries(closes, 200);
  return closes.map((price, i) => {
    if (ma200[i] === null) return null; // not enough history yet
    if (price > ma20[i] && price > ma50[i] && price > ma200[i]) return 'BUY';
    if (price < ma20[i] && price < ma50[i]) return 'SELL';
    return 'HOLD';
  });
}

module.exports = { smaSeries, maSignalSeries };
