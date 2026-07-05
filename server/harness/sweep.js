// sweep.js — run the backtest across a whole basket of tickers at once.
//
//   node sweep.js                    # the default basket below
//   node sweep.js AAPL MSFT KO ...   # your own list
//
// Why this exists: a single-ticker backtest is a story; a sweep is evidence.
// Testing only on a stock we already like (AAPL) bakes in survivorship bias —
// of course trend-following looks tolerable on one of history's great
// uptrends. The basket below deliberately mixes index ETFs, mega-winners,
// steady dividend names, and long-term strugglers so the rule gets tested on
// histories it would NOT have enjoyed.
//
// Honest limitation we can't fix with free data: Twelve Data only serves
// CURRENTLY LISTED symbols, so companies that went bankrupt or were delisted
// (the worst histories of all) can't be included. Even this basket is
// survivor-tilted; the report says so.

const { loadDailyHistory, stalenessWarning } = require('./data');
const { analyze } = require('./analyze');
const { HORIZONS } = require('./backtest');

// The default basket: 3 index ETFs, 5 mega-winners, 5 steady/defensive
// names, 5 strugglers/cyclicals. ~18 API credits on first run (cached after).
const DEFAULT_BASKET = [
  'SPY', 'QQQ', 'IWM',                       // index ETFs — the market itself
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',   // mega-winners (best case for buy-and-hold)
  'KO', 'PG', 'JNJ', 'JPM', 'XOM',           // steady / defensive / cyclical blue chips
  'INTC', 'T', 'F', 'BA', 'PFE',             // long-term strugglers (worst case for buy-and-hold)
];

// Twelve Data free tier allows 8 API calls/minute. Cached tickers cost
// nothing; uncached ones are spaced out, and if we still hit the limit we
// wait a minute and retry rather than dying halfway through a sweep.
const FETCH_SPACING_MS = 8500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function loadWithThrottle(ticker, adjusted) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await loadDailyHistory(ticker, { adjusted });
    } catch (err) {
      if (/credit|limit|frequen/i.test(err.message) && attempt < 3) {
        process.stderr.write(`  ${ticker}: rate limited, waiting 60s (attempt ${attempt}/3)...\n`);
        await sleep(60_000);
      } else {
        throw err;
      }
    }
  }
}

const pct = (x, d = 1) => (x === null ? 'n/a' : (x * 100).toFixed(d) + '%');

async function main() {
  const rawArgs = process.argv.slice(2);
  const adjusted = rawArgs.includes('--adjust');
  const costArg = rawArgs.find(a => a.startsWith('--cost='));
  const costRate = costArg ? parseFloat(costArg.split('=')[1]) : 0.001;
  const args = rawArgs.filter(a => !a.startsWith('--'));
  const basket = args.length ? args.map(t => t.toUpperCase()) : DEFAULT_BASKET;

  const results = [];
  const failed = [];
  const warnings = [];
  const fs = require('fs');
  const path = require('path');

  for (const ticker of basket) {
    const cached = fs.existsSync(path.join(__dirname, 'cache', `${ticker}${adjusted ? '.adj' : ''}.json`));
    try {
      const history = await loadWithThrottle(ticker, adjusted);
      const stale = stalenessWarning(history);
      if (stale) warnings.push(stale);
      const a = analyze(history, { costRate });
      if (!a) { failed.push({ ticker, reason: `only ${history.days.length} days of history` }); continue; }
      results.push(a);
      process.stderr.write(`  ${ticker} done (${a.years.toFixed(1)}y${cached ? ', cached' : ''})\n`);
      if (!cached) await sleep(FETCH_SPACING_MS); // stay under 8 calls/min
    } catch (err) {
      failed.push({ ticker, reason: err.message });
      process.stderr.write(`  ${ticker} FAILED: ${err.message}\n`);
    }
  }

  if (results.length === 0) {
    console.error('No tickers analyzed.');
    process.exit(1);
  }

  // ---------- Per-ticker table ----------
  console.log(`\n=== Sweep: dashboard MA signal across ${results.length} tickers ===`);
  console.log(`Rule: BUY > MA20/50/200, SELL < MA20/50, next-day execution, ${pct(costRate, 2)} cost/switch`);
  console.log(`Prices: ${adjusted ? "TOTAL RETURN (dividends reinvested)" : "split-adjusted only — dividends excluded (--adjust for total return)"}\n`);
  console.log(
    `  ${'ticker'.padEnd(7)}${'years'.padStart(6)}` +
    `${'strat CAGR'.padStart(12)}${'b&h CAGR'.padStart(10)}` +
    `${'strat DD'.padStart(10)}${'b&h DD'.padStart(9)}` +
    `${'strat Shrp'.padStart(11)}${'b&h Shrp'.padStart(9)}` +
    `${'beatRnd'.padStart(9)}${'trades'.padStart(8)}`
  );
  for (const a of results) {
    console.log(
      `  ${a.ticker.padEnd(7)}${a.years.toFixed(1).padStart(6)}` +
      `${pct(a.strat.cagr).padStart(12)}${pct(a.bench.cagr).padStart(10)}` +
      `${pct(a.strat.maxDD, 0).padStart(10)}${pct(a.bench.maxDD, 0).padStart(9)}` +
      `${a.strat.sharpe.toFixed(2).padStart(11)}${a.bench.sharpe.toFixed(2).padStart(9)}` +
      `${pct(a.beatRandom, 0).padStart(9)}${String(a.strat.trades).padStart(8)}`
    );
  }

  // ---------- Scoreboard ----------
  // The three questions that matter, counted across the basket. A rule that
  // "sometimes wins" isn't validated by its wins — it's characterized by how
  // OFTEN it wins and on what kind of history.
  const n = results.length;
  const retWins = results.filter(a => a.strat.cagr > a.bench.cagr).length;
  const sharpeWins = results.filter(a => a.strat.sharpe > a.bench.sharpe).length;
  const ddWins = results.filter(a => a.strat.maxDD > a.bench.maxDD).length; // less negative = shallower
  const medianBeat = results.map(a => a.beatRandom).sort((x, y) => x - y)[Math.floor(n / 2)];

  console.log(`\n  Scoreboard (strategy vs buy-and-hold, ${n} tickers):`);
  console.log(`    higher return (CAGR):        ${retWins}/${n}`);
  console.log(`    better risk-adjusted (Sharpe): ${sharpeWins}/${n}`);
  console.log(`    shallower max drawdown:      ${ddWins}/${n}`);
  console.log(`    median "beat random" percentile: ${pct(medianBeat, 0)}`);

  // ---------- Pooled horizon hit rates ----------
  // Counts are POOLED across tickers (every signal-day weighs the same),
  // not averaged per ticker.
  console.log(`\n  Pooled hit rates by horizon (all tickers together):`);
  console.log(`  ${'horizon'.padEnd(10)} ${'base up-rate'.padStart(12)} ${'BUY hit'.padStart(9)} ${'(days)'.padStart(8)} ${'SELL hit'.padStart(9)} ${'(days)'.padStart(8)}`);
  HORIZONS.forEach((H, hi) => {
    let buyHits = 0, buyDays = 0, sellHits = 0, sellDays = 0, allUp = 0, allDays = 0;
    for (const a of results) {
      const h = a.horizons[hi];
      buyHits += h.buyHits; buyDays += h.buyDays;
      sellHits += h.sellHits; sellDays += h.sellDays;
      allUp += h.allUp; allDays += h.allDays;
    }
    console.log(
      `  ${H.label.padEnd(10)} ${pct(allDays ? allUp / allDays : null).padStart(12)}` +
      ` ${pct(buyDays ? buyHits / buyDays : null).padStart(9)} ${String(buyDays).padStart(8)}` +
      ` ${pct(sellDays ? sellHits / sellDays : null).padStart(9)} ${String(sellDays).padStart(8)}`
    );
  });

  if (failed.length) {
    console.log(`\n  Skipped: ${failed.map(f => `${f.ticker} (${f.reason})`).join('; ')}`);
  }
  if (warnings.length) {
    console.log(`\n  ${warnings.join('\n  ')}`);
  }

  console.log(`\n  Caveats:`);
  console.log(`  - Only currently-listed symbols can be fetched — bankrupt/delisted histories are missing,`);
  console.log(`    so even this deliberately-mixed basket is survivor-tilted.`);
  if (adjusted) {
    console.log(`  - Total-return prices: signals computed on dividend-adjusted closes can differ slightly`);
    console.log(`    from the live dashboard's (which sees split-adjusted prices only).`);
  } else {
    console.log(`  - Dividends excluded (understates buy-and-hold most, especially KO/PG/JNJ/T/XOM) —`);
    console.log(`    re-run with --adjust for total-return numbers.`);
  }
  console.log(`  - Cash earns 0%; overlapping horizon windows overstate confidence; see run.js report for detail.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
