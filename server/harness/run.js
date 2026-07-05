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

const { loadDailyHistory } = require('./data');
const { maSignalSeries } = require('./strategies');
const { signalsToPositions, simulate, buyAndHold, randomBaseline, percentileOf, horizonStats } = require('./backtest');
const { totalReturn, cagr, sharpe, maxDrawdown } = require('./metrics');

const COST_RATE = 0.001; // 0.1% of the portfolio per switch (commission + slippage)

const pct = (x, digits = 1) => (x === null ? '  n/a' : (x * 100).toFixed(digits) + '%');

async function main() {
  const args = process.argv.slice(2);
  const ticker = (args.find(a => !a.startsWith('--')) || '').toUpperCase();
  const refresh = args.includes('--refresh');
  if (!ticker) {
    console.error('Usage: node run.js TICKER [--refresh]');
    process.exit(1);
  }

  const history = await loadDailyHistory(ticker, { refresh });
  const allCloses = history.days.map(d => d.close);
  const allSignals = maSignalSeries(allCloses);

  // The signal needs 200 days of warmup. Chop the warmup off so the strategy
  // and buy-and-hold are compared over EXACTLY the same days — comparing
  // different periods is one of the classic ways backtests mislead.
  const start = allSignals.findIndex(s => s !== null);
  if (start === -1) {
    console.error(`${ticker}: only ${allCloses.length} days of history — need 200+ for the MA200 signal.`);
    process.exit(1);
  }
  const closes = allCloses.slice(start);
  const signals = allSignals.slice(start);
  const days = history.days.slice(start);

  // Strategy, benchmark, and the random swarm.
  const positions = signalsToPositions(signals);
  const strat = simulate(closes, positions, { costRate: COST_RATE });
  const bench = buyAndHold(closes, { costRate: COST_RATE });
  const randomFinals = randomBaseline(closes, strat.trades, { trials: 1000, costRate: COST_RATE });
  const beatRandom = percentileOf(randomFinals, strat.values.at(-1));
  const horizons = horizonStats(closes, signals);

  const daysInMarket = positions.reduce((a, b) => a + b, 0) / positions.length;

  // ---------- Report ----------
  console.log(`\n=== Backtest: dashboard MA signal on ${ticker} ===`);
  console.log(`Period: ${days[0].date} -> ${days.at(-1).date} (${closes.length} trading days, ~${(closes.length / 252).toFixed(1)} years)`);
  console.log(`Rule: BUY when price > MA20/50/200; SELL when price < MA20/50; trades next day; ${pct(COST_RATE, 2)} cost per switch`);
  console.log(`Data fetched: ${history.fetchedAt} (cached — pass --refresh to update)\n`);

  const row = (name, r) => console.log(
    `  ${name.padEnd(14)} total ${pct(totalReturn(r.values)).padStart(9)}   CAGR ${pct(cagr(r.values)).padStart(7)}   Sharpe ${sharpe(r.values).toFixed(2).padStart(5)}   maxDD ${pct(maxDrawdown(r.values)).padStart(7)}   trades ${String(r.trades).padStart(4)}`
  );
  row('MA strategy', strat);
  row('Buy & hold', bench);
  console.log(`  Time in market: ${pct(daysInMarket)} of days\n`);

  console.log(`  vs. random switching (1000 seeded trials, same trade count):`);
  console.log(`  strategy beat ${pct(beatRandom)} of random strategies`);
  console.log(`  (~50% = timing adds nothing; consistently >90-95% starts to mean something)\n`);

  console.log(`  Hit rates by horizon (vs. base rate = how often the stock was simply up):`);
  console.log(`  ${'horizon'.padEnd(10)} ${'base up-rate'.padStart(12)} ${'BUY hit'.padStart(9)} ${'(days)'.padStart(7)} ${'SELL hit'.padStart(9)} ${'(days)'.padStart(7)}`);
  for (const h of horizons) {
    console.log(`  ${h.label.padEnd(10)} ${pct(h.baseUpRate).padStart(12)} ${pct(h.buyHitRate).padStart(9)} ${String(h.buyDays).padStart(7)} ${pct(h.sellHitRate).padStart(9)} ${String(h.sellDays).padStart(7)}`);
  }
  console.log(`  A BUY hit = stock higher after the horizon; a SELL hit = stock lower (cash was right).`);
  console.log(`  Skill = hit rate above (BUY) / above 1-minus (SELL) the base rate, not above 50%.\n`);

  console.log(`  Caveats (every run, on purpose):`);
  console.log(`  - One ticker, one history: picking a stock we already like IS survivorship bias.`);
  console.log(`  - Dividends excluded on both sides; understates buy-and-hold most (strategy sits in cash sometimes).`);
  console.log(`  - Cash earns 0% here; real cash earns T-bill rates, so the strategy is slightly understated too.`);
  console.log(`  - Overlapping horizon windows aren't independent samples — hit-rate counts overstate confidence.`);
  console.log(`  - No parameters were fitted to this data (the rule predates the test), so there's no train/test`);
  console.log(`    split yet. The moment we tune ANY number against history, walk-forward splits become mandatory.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
