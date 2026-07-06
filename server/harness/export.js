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

const BASKET = [
  'SPY', 'QQQ', 'IWM',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
  'KO', 'PG', 'JNJ', 'JPM', 'XOM',
  'INTC', 'T', 'F', 'BA', 'PFE',
];

const round1 = (x) => Math.round(x * 1000) / 10; // fraction -> percent, 1 decimal

async function main() {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const tickers = {};
  for (const t of BASKET) {
    const cached = isCached(t, true);
    const h = await loadWithThrottle(t, true); // adjusted = total-return
    const a = analyze(h, { costRate: 0.001, strategy: 'ma' });
    if (!a) continue;
    tickers[t] = {
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
  const out = {
    // Provenance — shown in the UI so the numbers can always be traced.
    generated: new Date().toISOString().slice(0, 10),
    config: 'dashboard MA rule, total-return prices, 0.1% cost/switch, next-day execution',
    source: 'server/harness (node export.js)',
    tickers,
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
