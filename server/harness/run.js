// run.js — the harness CLI. Backtests the dashboard's MA signal on one ticker
// and prints an honest report.
//
//   node run.js AAPL             # uses cached history (fetches once if absent)
//   node run.js AAPL --refresh   # force refetch from Twelve Data
//
// "Honest" means: next-day execution (no lookahead), transaction costs
// included, compared against buy-and-hold AND a seeded random-switching
// baseline, hit rates shown per horizon against the base rate, and a caveats
// section that prints every run — the limitations are part of the result.
//
// All computation lives in analyze.js (shared with sweep.js); this file only
// loads data and formats the report.

const { loadDailyHistory, stalenessWarning } = require('./data');
const { analyze } = require('./analyze');

const pct = (x, digits = 1) => (x === null ? '  n/a' : (x * 100).toFixed(digits) + '%');

async function main() {
  const args = process.argv.slice(2);
  const ticker = (args.find(a => !a.startsWith('--')) || '').toUpperCase();
  const refresh = args.includes('--refresh');
  // --adjust: use total-return closes (dividends reinvested) — the honest
  // basis for return comparisons, especially on dividend payers like T or KO.
  const adjusted = args.includes('--adjust');
  // --cost=0.002: sensitivity check on the per-switch cost assumption.
  const costArg = args.find(a => a.startsWith('--cost='));
  const costRate = costArg ? parseFloat(costArg.split('=')[1]) : 0.001;
  if (!ticker || Number.isNaN(costRate)) {
    console.error('Usage: node run.js TICKER [--refresh] [--adjust] [--cost=0.001]');
    process.exit(1);
  }

  const history = await loadDailyHistory(ticker, { refresh, adjusted });
  const a = analyze(history, { costRate });
  if (!a) {
    console.error(`${ticker}: only ${history.days.length} days of history — need 200+ for the MA200 signal.`);
    process.exit(1);
  }

  // ---------- Report ----------
  console.log(`\n=== Backtest: dashboard MA signal on ${a.ticker} ===`);
  console.log(`Period: ${a.firstDate} -> ${a.lastDate} (${a.tradingDays} trading days, ~${a.years.toFixed(1)} years)`);
  console.log(`Rule: BUY when price > MA20/50/200; SELL when price < MA20/50; trades next day; ${pct(costRate, 2)} cost per switch`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN (splits + dividends reinvested, adjust=all)' : 'split-adjusted only — dividends excluded'}`);
  const stale = stalenessWarning(history);
  if (stale) console.log(stale);
  console.log(`Data fetched: ${a.fetchedAt} (cached — pass --refresh to update)\n`);

  const row = (name, m) => console.log(
    `  ${name.padEnd(14)} total ${pct(m.total).padStart(9)}   CAGR ${pct(m.cagr).padStart(7)}   Sharpe ${m.sharpe.toFixed(2).padStart(5)}   maxDD ${pct(m.maxDD).padStart(7)}   trades ${String(m.trades).padStart(4)}`
  );
  row('MA strategy', a.strat);
  row('Buy & hold', a.bench);
  console.log(`  Time in market: ${pct(a.timeInMarket)} of days\n`);

  console.log(`  vs. random switching (1000 seeded trials, same trade count):`);
  console.log(`  strategy beat ${pct(a.beatRandom)} of random strategies`);
  console.log(`  (~50% = timing adds nothing; consistently >90-95% starts to mean something)\n`);

  console.log(`  Hit rates by horizon (vs. base rate = how often the stock was simply up):`);
  console.log(`  ${'horizon'.padEnd(10)} ${'base up-rate'.padStart(12)} ${'BUY hit'.padStart(9)} ${'(days)'.padStart(7)} ${'SELL hit'.padStart(9)} ${'(days)'.padStart(7)}`);
  for (const h of a.horizons) {
    console.log(`  ${h.label.padEnd(10)} ${pct(h.baseUpRate).padStart(12)} ${pct(h.buyHitRate).padStart(9)} ${String(h.buyDays).padStart(7)} ${pct(h.sellHitRate).padStart(9)} ${String(h.sellDays).padStart(7)}`);
  }
  console.log(`  A BUY hit = stock higher after the horizon; a SELL hit = stock lower (cash was right).`);
  console.log(`  Skill = hit rate above (BUY) / above 1-minus (SELL) the base rate, not above 50%.\n`);

  console.log(`  Caveats (every run, on purpose):`);
  console.log(`  - One ticker, one history: picking a stock we already like IS survivorship bias.`);
  if (adjusted) {
    console.log(`  - Total-return prices: signals here are computed on dividend-adjusted closes, so they can`);
    console.log(`    differ slightly from the live dashboard's (which sees split-adjusted prices only).`);
  } else {
    console.log(`  - Dividends excluded on both sides; understates buy-and-hold most (strategy sits in cash`);
    console.log(`    sometimes). Re-run with --adjust for total-return numbers.`);
  }
  console.log(`  - Cash earns 0% here; real cash earns T-bill rates, so the strategy is slightly understated too.`);
  console.log(`  - Overlapping horizon windows aren't independent samples — hit-rate counts overstate confidence.`);
  console.log(`  - No parameters were fitted to this data (the rule predates the test), so there's no train/test`);
  console.log(`    split yet. The moment we tune ANY number against history, walk-forward splits become mandatory.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
