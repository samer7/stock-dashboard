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

// Faber's (2007) 10-month SMA rule — the literature's favorite MA variant
// (see docs/research/ma-timing.md). At each MONTH-END close: be in the market
// if the close is above the average of the last 10 month-end closes
// (including this one, per Faber's paper), in cash if below. Decisions only
// happen ~12 times a year, so it whipsaws far less than daily MA rules.
//
// The signal for every day between month-ends just carries the last decision
// forward — signalsToPositions treats a repeated BUY as "stay in", so trades
// still execute the day after the month-end close (no lookahead). There's no
// HOLD state: Faber's rule is binary, in or out.
//
// dates are 'YYYY-MM-DD' strings; a month-end is a day whose next trading day
// falls in a different month. The series' final day is NOT treated as a
// month-end (the month may be unfinished — deciding on a partial month would
// use information Faber's monthly rule doesn't have).
function faberSignalSeries(closes, dates) {
  const out = new Array(closes.length).fill(null);
  const monthEndCloses = [];
  let current = null; // null until 10 month-ends exist
  for (let i = 0; i < closes.length; i++) {
    const isMonthEnd = i < closes.length - 1 && dates[i].slice(0, 7) !== dates[i + 1].slice(0, 7);
    if (isMonthEnd) {
      monthEndCloses.push(closes[i]);
      if (monthEndCloses.length >= 10) {
        const sma10 = monthEndCloses.slice(-10).reduce((a, b) => a + b, 0) / 10;
        current = closes[i] > sma10 ? 'BUY' : 'SELL';
      }
    }
    out[i] = current;
  }
  return out;
}

// 12-month time-series momentum (Moskowitz, Ooi & Pedersen 2012), long/cash
// version: at each month-end, be in the market if the trailing 12-month
// return is positive (close above the month-end close 12 months ago), in
// cash if negative. The original paper goes SHORT on negative momentum; our
// simulator is long-or-cash only, so this is the defensive variant — which
// is also the version retail "trend" portfolios actually use.
//
// Same month-end mechanics as faberSignalSeries: decisions ~12x/year, the
// last decision carries forward between month-ends, next-day execution via
// signalsToPositions, and the series' final (possibly partial) month never
// generates a decision. Warmup: 13 month-ends (current + 12 back).
function tsmomSignalSeries(closes, dates) {
  const out = new Array(closes.length).fill(null);
  const monthEndCloses = [];
  let current = null;
  for (let i = 0; i < closes.length; i++) {
    const isMonthEnd = i < closes.length - 1 && dates[i].slice(0, 7) !== dates[i + 1].slice(0, 7);
    if (isMonthEnd) {
      monthEndCloses.push(closes[i]);
      if (monthEndCloses.length >= 13) {
        const twelveMonthsAgo = monthEndCloses[monthEndCloses.length - 13];
        current = closes[i] > twelveMonthsAgo ? 'BUY' : 'SELL';
      }
    }
    out[i] = current;
  }
  return out;
}

module.exports = { smaSeries, maSignalSeries, faberSignalSeries, tsmomSignalSeries };
