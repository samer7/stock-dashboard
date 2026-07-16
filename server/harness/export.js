// export.js — turn the harness's measured verdict into a small JSON blob the
// frontend can embed, so the dashboard shows its own report card.
//
//   node export.js            # prints the JSON to stdout
//
// Design choices, all deliberate:
// - TOTAL-RETURN prices (dividends reinvested) and 0.1% cost per switch — the
//   honest configuration; price-only numbers flatter the strategy.
// - Only the 18-ticker research basket is exported. Other tickers on a user's
//   watchlist show "not measured yet" in the UI rather than a borrowed number.
// - The output is meant to be pasted into index.html as a constant (the
//   frontend is deliberately a single file with no build step and no extra
//   fetches). Regenerate whenever the harness or cached data changes:
//     cd server/harness && node export.js
//   then replace the HARNESS_RESULTS constant in index.html with the output.

const { loadWithThrottle, isCached } = require('./data');
const { analyze } = require('./analyze');
const { logReturns, ewmaVolSeries } = require('./vol');
const { volTargetWeights } = require('./voltarget');
const { simulateWeights, buyAndHold } = require('./backtest');
const { sharpe, maxDrawdown } = require('./metrics');

const BASKET = [
  'SPY', 'QQQ', 'IWM',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
  'KO', 'PG', 'JNJ', 'JPM', 'XOM',
  'INTC', 'T', 'F', 'BA', 'PFE',
];

const round1 = (x) => Math.round(x * 1000) / 10; // fraction -> percent, 1 decimal

// Historical base rates: over the full cached history, how often was the
// (total-return) price higher h trading days later? These are the "odds"
// column of the report card — shipped BECAUSE prob.js measured that no model
// we own beats them (the vol layer scored worse at every horizon; see
// docs/research/calibration.md). Whole percents: two digits of precision
// would be fake — the 1y column rests on only ~20 independent windows.
const ODDS_HORIZONS = { '1w': 5, '1m': 21, '3m': 63, '1y': 252 };
function baseRates(days) {
  const closes = days.map(d => d.close);
  const odds = {};
  for (const [label, h] of Object.entries(ODDS_HORIZONS)) {
    let up = 0, n = 0;
    for (let s = 0; s + h < closes.length; s++) {
      if (closes[s + h] > closes[s]) up++;
      n++;
    }
    odds[label] = Math.round((up / n) * 100);
  }
  return odds;
}

// Vol-targeted sizing, the exact spec measured positive by voltarget.js
// (docs/research/risk-sizing.md §5): w = min(1, median vol / EWMA vol),
// no leverage, 5pp band, 0.1% cost on traded volume. Exported per ticker:
// the sizing TARGET (the full-history median of the EWMA vol series, as a
// ±% typical month — the frontend compares the live EWMA forecast against
// it to state today's implied exposure) plus the measured Sharpe/worst-drop
// pair vs buy-and-hold over the same post-warmup window.
function volSizing(days) {
  const closes = days.map(d => d.close);
  const ewma = ewmaVolSeries(logReturns(closes), 0.94);
  const weights = volTargetWeights(ewma, { power: 1, band: 0.05 });
  const start = weights.findIndex(w => w !== null);
  if (start === -1) return null;
  const closesS = closes.slice(start);
  const w = weights.slice(start);
  w[0] = 0; // buys in on day one, paying the entry cost like b&h
  const strat = simulateWeights(closesS, w, { costRate: 0.001 });
  const bh = buyAndHold(closesS, { costRate: 0.001 });
  const sorted = ewma.filter(v => v !== null).sort((a, b) => a - b);
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    target: Math.round(median * Math.sqrt(21) * 1000) / 10, // ±% typical month
    sharpe: Math.round(sharpe(strat.values) * 100) / 100,
    bhSharpe: Math.round(sharpe(bh.values) * 100) / 100,
    dd: round1(maxDrawdown(strat.values)),
    bhDD: round1(maxDrawdown(bh.values)),
  };
}

async function main() {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const tickers = {};
  for (const t of BASKET) {
    const cached = isCached(t, true);
    const h = await loadWithThrottle(t, true); // adjusted = total-return
    const a = analyze(h, { costRate: 0.001, strategy: 'ma' });
    if (!a) continue;
    tickers[t] = {
      odds: baseRates(h.days),
      vt: volSizing(h.days),
      years: Math.round(a.years * 10) / 10,
      stratCagr: round1(a.strat.cagr),   // %/yr following the signal
      bhCagr: round1(a.bench.cagr),      // %/yr buy-and-hold, same days
      stratDD: round1(a.strat.maxDD),    // worst drawdown, signal (negative %)
      bhDD: round1(a.bench.maxDD),       // worst drawdown, buy-and-hold
      matchedPct: Math.round(a.beatMatched * 100), // vs shuffles of its own pattern
      trades: a.strat.trades,
    };
    process.stderr.write(`  ${t} done${cached ? ' (cached)' : ''}\n`);
    if (!cached) await sleep(8500);
  }
  // Print in the exact shape of index.html's HARNESS_RESULTS constant — one
  // aligned line per ticker — so "regenerate and paste" stays a clean diff.
  const generated = new Date().toISOString().slice(0, 10);
  const pad = (s, w) => String(s).padEnd(w);
  console.log('{');
  console.log(`  generated: '${generated}',`);
  console.log(`  config: 'total-return prices, 0.1% cost/switch, next-day execution',`);
  console.log('  tickers: {');
  for (const [t, r] of Object.entries(tickers)) {
    const odds = `{ '1w': ${r.odds['1w']}, '1m': ${r.odds['1m']}, '3m': ${r.odds['3m']}, '1y': ${r.odds['1y']} }`;
    const vt = r.vt
      ? `vt: { target: ${pad(r.vt.target + ',', 6)} sharpe: ${pad(r.vt.sharpe + ',', 6)} bhSharpe: ${pad(r.vt.bhSharpe + ',', 6)} dd: ${pad(r.vt.dd + ',', 7)} bhDD: ${r.vt.bhDD} }`
      : 'vt: null';
    console.log(
      `    ${pad(t + ':', 6)} { years: ${r.years}, stratCagr: ${pad(r.stratCagr + ',', 6)} bhCagr: ${pad(r.bhCagr + ',', 6)} ` +
      `stratDD: ${pad(r.stratDD + ',', 7)} bhDD: ${pad(r.bhDD + ',', 7)} matchedPct: ${pad(r.matchedPct + ',', 4)} ` +
      `trades: ${pad(r.trades + ',', 5)} odds: ${odds},`
    );
    console.log(`            ${vt} },`);
  }
  console.log('  },');
  console.log('}');
}

main().catch(err => { console.error(err.message); process.exit(1); });
