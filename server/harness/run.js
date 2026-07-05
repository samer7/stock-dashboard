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
  // --strategy=faber: Faber's (2007) 10-month SMA rule instead of the
  // dashboard's daily MA20/50/200 rule.
  const stratArg = args.find(a => a.startsWith('--strategy='));
  const strategy = stratArg ? stratArg.split('=')[1] : 'ma';
  if (!ticker || Number.isNaN(costRate) || !['ma', 'faber'].includes(strategy)) {
    console.error('Usage: node run.js TICKER [--refresh] [--adjust] [--cost=0.001] [--strategy=ma|faber]');
    process.exit(1);
  }

  const history = await loadDailyHistory(ticker, { refresh, adjusted });
  const a = analyze(history, { costRate, strategy });
  if (!a) {
    console.error(`${ticker}: only ${history.days.length} days of history — not enough to warm up the signal.`);
    process.exit(1);
  }

  // ---------- Report ----------
  const ruleDesc = strategy === 'faber'
    ? 'Faber 10-month SMA: at month-end, in if close > 10-month average, else cash'
    : 'BUY when price > MA20/50/200; SELL when price < MA20/50';
  console.log(`\n=== Backtest: ${strategy === 'faber' ? 'Faber 10-month SMA' : 'dashboard MA signal'} on ${a.ticker} ===`);
  console.log(`Period: ${a.firstDate} -> ${a.lastDate} (${a.tradingDays} trading days, ~${a.years.toFixed(1)} years)`);
  console.log(`Rule: ${ruleDesc}; trades next day; ${pct(costRate, 2)} cost per switch`);
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

  console.log(`  vs. random switching (1000 seeded trials each):`);
  console.log(`  same trade count:                  beat ${pct(a.beatRandom)} of random strategies`);
  console.log(`  same trades AND time in market:    beat ${pct(a.beatMatched)} (holding periods shuffled in place)`);
  console.log(`  (~50% = timing adds nothing; consistently >90-95% starts to mean something.`);
  console.log(`   The second line is the fairer test — random flips only average ~50% invested,`);
  console.log(`   so the first one partly rewards mere market exposure, not timing.)\n`);

  console.log(`  Hit rates by horizon (vs. base rate = how often the stock was simply up):`);
  console.log(`  ${'horizon'.padEnd(10)} ${'base up-rate'.padStart(12)} ${'BUY hit'.padStart(9)} ${'(days)'.padStart(7)} ${'SELL hit'.padStart(9)} ${'(days)'.padStart(7)}`);
  for (const h of a.horizons) {
    console.log(`  ${h.label.padEnd(10)} ${pct(h.baseUpRate).padStart(12)} ${pct(h.buyHitRate).padStart(9)} ${String(h.buyDays).padStart(7)} ${pct(h.sellHitRate).padStart(9)} ${String(h.sellDays).padStart(7)}`);
  }
  console.log(`  A BUY hit = stock higher after the horizon; a SELL hit = stock lower (cash was right).`);
  console.log(`  Skill = hit rate above (BUY) / above 1-minus (SELL) the base rate, not above 50%.\n`);

  // Event test: the table above counts every signal-DAY, but a BUY that stays
  // on for months is really one decision counted hundreds of times. Here we
  // look only at the days the signal FLIPS — the moment a dashboard user
  // actually sees something change.
  console.log(`  Event test — what follows a signal FLIP (vs. what follows any day):`);
  console.log(`  ${'horizon'.padEnd(10)} ${'flips→BUY'.padStart(10)} ${'up-rate'.padStart(8)} ${'base'.padStart(7)} ${'avg ret'.padStart(8)} ${'any-day'.padStart(8)}`);
  for (const t of a.transitions) {
    console.log(
      `  ${t.label.padEnd(10)} ${String(t.buyFlips).padStart(10)}` +
      ` ${pct(t.buyFlips ? t.buyUps / t.buyFlips : null).padStart(8)}` +
      ` ${pct(t.allDays ? t.allUps / t.allDays : null).padStart(7)}` +
      ` ${pct(t.buyFlips ? t.buyRetSum / t.buyFlips : null).padStart(8)}` +
      ` ${pct(t.allDays ? t.allRetSum / t.allDays : null).padStart(8)}`
    );
  }
  console.log(`  ${'horizon'.padEnd(10)} ${'flips→SELL'.padStart(10)} ${'down-rate'.padStart(9)} ${'base'.padStart(7)} ${'avg ret'.padStart(8)} ${'any-day'.padStart(8)}`);
  for (const t of a.transitions) {
    console.log(
      `  ${t.label.padEnd(10)} ${String(t.sellFlips).padStart(10)}` +
      ` ${pct(t.sellFlips ? t.sellDowns / t.sellFlips : null).padStart(9)}` +
      ` ${pct(t.allDays ? 1 - t.allUps / t.allDays : null).padStart(7)}` +
      ` ${pct(t.sellFlips ? t.sellRetSum / t.sellFlips : null).padStart(8)}` +
      ` ${pct(t.allDays ? t.allRetSum / t.allDays : null).padStart(8)}`
    );
  }
  console.log(`  "avg ret" = mean return over the horizon starting at the flip; "any-day" = same mean over`);
  console.log(`  ALL days. Few flips per ticker -> noisy; the sweep pools them across tickers.\n`);

  // Crisis windows: the direct test of the one claim we still advertise —
  // losing less in prolonged declines. Windows are S&P peak-to-trough dates.
  console.log(`  Crisis windows (does the rule actually lose less in big declines?):`);
  console.log(`  ${'window'.padEnd(18)} ${'covered'.padEnd(24)} ${'strat ret'.padStart(10)} ${'b&h ret'.padStart(9)} ${'strat DD'.padStart(9)} ${'b&h DD'.padStart(8)}`);
  for (const c of a.crises) {
    if (!c.covered) {
      console.log(`  ${c.label.padEnd(18)} ${'no data'.padEnd(24)} (history starts ${a.firstDate})`);
      continue;
    }
    const covered = `${c.coveredFrom}..${c.coveredTo}${c.partial ? ' *' : ''}`;
    console.log(
      `  ${c.label.padEnd(18)} ${covered.padEnd(24)}` +
      ` ${pct(c.stratReturn).padStart(10)} ${pct(c.benchReturn).padStart(9)}` +
      ` ${pct(c.stratDD, 0).padStart(9)} ${pct(c.benchDD, 0).padStart(8)}`
    );
  }
  console.log(`  (* = window only partly covered by this history. Returns are over the covered span;`);
  console.log(`   DD = worst peak-to-trough inside it. The rule should beat b&h HERE or the risk story fails.)\n`);

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
