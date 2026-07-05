// momentum.js — the momentum digest's proposed test, exactly as specced in
// docs/research/momentum.md §5: 12-2 relative momentum, top-3, monthly,
// benchmarked against equal-weighted buy-and-hold of the same basket.
//
//   node momentum.js                     # default 18-ticker basket, cached data
//   node momentum.js AAPL MSFT KO ...    # custom basket
//   flags: --adjust        total-return prices (dividends reinvested)
//          --cost=0.001    cost per traded dollar (default 0.1%)
//          --skip=0        12-1 ablation (no skip month; digest check #2 —
//                          Jegadeesh 1990 predicts this is WORSE than 12-2)
//          --top=3         how many winners to hold
//
// The rule: on the last trading day of each month, compute every ticker's
// 12-2 return — close[21 trading days ago] / close[252 trading days ago] − 1,
// i.e. the past year SKIPPING the most recent month (short-term reversal,
// Jegadeesh 1990). Hold the top 3 equal-weighted for the next month. No
// shorting, no cash: it's a RELATIVE bet, so the benchmark is the same
// basket held whole, not SPY and not cash.

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');
const { alignHistories, simulatePortfolio, equalWeightBuyHold, equalWeightRebalanced, randomPicksBaseline } = require('./portfolio');
const { percentileOf, crisisStats, CRISIS_WINDOWS } = require('./backtest');
const { cagr, sharpe, maxDrawdown, TRADING_DAYS_PER_YEAR } = require('./metrics');

// Same basket as sweep.js — see the survivorship caveat there (and note the
// momentum digest's sharper version: we watch AAPL/MSFT/NVDA *because* they
// won, which flatters any past-winner rule tested on them).
const DEFAULT_BASKET = [
  'SPY', 'QQQ', 'IWM',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
  'KO', 'PG', 'JNJ', 'JPM', 'XOM',
  'INTC', 'T', 'F', 'BA', 'PFE',
];

const LOOKBACK = 252; // ~12 months of trading days

// Daniel & Moskowitz (2016): momentum LAGS the market when beaten-down names
// rocket back after a crash. If our rule *outperforms* in these windows, it
// isn't measuring momentum (digest check #3). One year from each S&P trough.
const REBOUND_WINDOWS = [
  { label: '2009 recovery', from: '2009-03-09', to: '2010-03-09' },
  { label: '2020 recovery', from: '2020-03-23', to: '2021-03-23' },
];

// Build the strategy's rebalance targets over the aligned grid.
// Decisions happen at each month-end close (a day whose next trading day is
// in a different month — the series' final, possibly-partial month never
// decides); the trade executes the NEXT day, same as every other strategy in
// this harness. Returns the targets array for simulatePortfolio plus the
// eligibility map the random baseline needs to draw from the same universe.
function buildMomentumTargets(aligned, { skip = 21, top = 3 } = {}) {
  const { tickers, dates, closes } = aligned;
  const targets = new Array(dates.length).fill(null);
  const eligibleByDay = new Map(); // rebalance-day index -> eligible tickers
  for (let m = LOOKBACK; m < dates.length - 1; m++) {
    const isMonthEnd = dates[m].slice(0, 7) !== dates[m + 1].slice(0, 7);
    if (!isMonthEnd) continue;
    // On the aligned grid every ticker has a close at m-252 by construction,
    // so all are eligible; the check is kept for baskets whose alignment
    // starts later than 13 months before the first month-end.
    const eligible = tickers.filter(t => closes[t][m - LOOKBACK] > 0);
    if (eligible.length < top) continue;
    const mom = new Map(eligible.map(t => [t, closes[t][m - skip] / closes[t][m - LOOKBACK] - 1]));
    const winners = eligible
      .slice()
      .sort((a, b) => mom.get(b) - mom.get(a) || a.localeCompare(b)) // ties: alphabetical, for determinism
      .slice(0, top);
    targets[m + 1] = Object.fromEntries(winners.map(t => [t, 1 / top]));
    eligibleByDay.set(m + 1, eligible);
  }
  return { targets, eligibleByDay };
}

const pct = (x, d = 1) => (x === null || x === undefined ? 'n/a' : (x * 100).toFixed(d) + '%');
const money = (x) => '$' + Math.round(x).toLocaleString('en-US');

async function main() {
  const rawArgs = process.argv.slice(2);
  const adjusted = rawArgs.includes('--adjust');
  const get = (name, dflt) => {
    const a = rawArgs.find(s => s.startsWith(`--${name}=`));
    return a ? parseFloat(a.split('=')[1]) : dflt;
  };
  const costRate = get('cost', 0.001);
  const skip = get('skip', 21);
  const top = get('top', 3);
  const basket = rawArgs.filter(a => !a.startsWith('--')).map(t => t.toUpperCase());
  const tickers = basket.length ? basket : DEFAULT_BASKET;

  // Load histories (cached tickers are free; fresh ones spaced for the rate limit).
  const histories = [];
  const warnings = [];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (const t of tickers) {
    const cached = isCached(t, adjusted);
    const h = await loadWithThrottle(t, adjusted);
    const stale = stalenessWarning(h);
    if (stale) warnings.push(stale);
    histories.push(h);
    process.stderr.write(`  ${t} loaded (${h.days.length} days${cached ? ', cached' : ''})\n`);
    if (!cached) await sleep(8500);
  }

  const alignedFull = alignHistories(histories);
  const { targets: targetsFull, eligibleByDay: eligFull } = buildMomentumTargets(alignedFull, { skip, top });

  // Chop the warmup so strategy and benchmarks run over EXACTLY the same
  // days: day 0 of the comparison = the month-end of the first decision, so
  // everyone places their first trade on day 1.
  const firstReb = targetsFull.findIndex(t => t !== null);
  if (firstReb === -1) { console.error('Not enough history for a single decision.'); process.exit(1); }
  const cut = firstReb - 1;
  const aligned = {
    tickers: alignedFull.tickers,
    dates: alignedFull.dates.slice(cut),
    closes: Object.fromEntries(alignedFull.tickers.map(t => [t, alignedFull.closes[t].slice(cut)])),
  };
  const targets = targetsFull.slice(cut);
  const eligibleByDay = new Map([...eligFull].map(([i, e]) => [i - cut, e]));
  const rebalanceDays = [...eligibleByDay.keys()].sort((a, b) => a - b);

  // The three portfolios + the monkey swarm.
  const strat = simulatePortfolio(aligned, targets, { costRate });
  const bh = equalWeightBuyHold(aligned, 1, { costRate });
  const ewReb = equalWeightRebalanced(aligned, rebalanceDays, { costRate });
  const randomFinals = randomPicksBaseline(aligned, eligibleByDay, top, { trials: 1000, costRate });

  // Monthly hit rate: sample both curves at every rebalance day plus the last
  // day; each consecutive ratio is one month. Same sampling for both sides,
  // so the comparison is fair even though rebalance days carry that day's cost.
  const bounds = [...new Set([0, ...rebalanceDays.slice(1), aligned.dates.length - 1])];
  let wins = 0, months = 0;
  for (let k = 1; k < bounds.length; k++) {
    const sRet = strat.values[bounds[k]] / strat.values[bounds[k - 1]];
    const bRet = bh.values[bounds[k]] / bh.values[bounds[k - 1]];
    months++;
    if (sRet > bRet) wins++;
  }
  const flipNoise = 1 / Math.sqrt(months); // ±2σ of a fair coin's hit rate on this many months

  const years = (aligned.dates.length - 1) / TRADING_DAYS_PER_YEAR;
  const meanValue = strat.values.reduce((a, b) => a + b, 0) / strat.values.length;
  const turnoverPerYear = strat.traded / meanValue / years; // one-way, as a multiple of the portfolio

  const rebounds = crisisStats(aligned.dates, strat.values, bh.values, REBOUND_WINDOWS);
  const crises = crisisStats(aligned.dates, strat.values, bh.values, CRISIS_WINDOWS);

  // ---------- report ----------
  const ruleName = skip === 21 ? '12-2' : skip === 0 ? '12-1 (no skip month — ablation)' : `12-x (skip ${skip}d)`;
  console.log(`\n=== ${ruleName} relative momentum, top-${top}, monthly — vs equal-weighted basket ===`);
  console.log(`Basket: ${aligned.tickers.length} tickers, aligned ${aligned.dates[0]} → ${aligned.dates.at(-1)} (${aligned.dates.length} trading days ≈ ${years.toFixed(1)}y, ${months} months)`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN (dividends reinvested)' : 'split-adjusted only — dividends excluded (--adjust for total return)'}`);
  console.log(`Costs: ${pct(costRate, 2)} per traded dollar. Decisions at month-end close, trades next day.\n`);

  const row = (name, r, extra = '') => console.log(
    `  ${name.padEnd(22)}${pct(cagr(r.values)).padStart(8)}${sharpe(r.values).toFixed(2).padStart(9)}` +
    `${pct(maxDrawdown(r.values), 0).padStart(9)}${money(r.values.at(-1)).padStart(11)}${extra.padStart(14)}`
  );
  console.log(`  ${'portfolio'.padEnd(22)}${'CAGR'.padStart(8)}${'Sharpe'.padStart(9)}${'maxDD'.padStart(9)}${'final'.padStart(11)}${'turnover/yr'.padStart(14)}`);
  row(`momentum top-${top}`, strat, pct(turnoverPerYear, 0));
  row('EW buy-and-hold', bh, '—');
  row('EW monthly rebal.', ewReb, pct(ewReb.traded / meanValue / years, 0));

  console.log(`\n  Monthly hit rate vs EW buy-and-hold: ${wins}/${months} = ${pct(wins / months)}`);
  console.log(`    (a coin lands within ±${pct(flipNoise, 1)} of 50% on ${months} months — anything inside that band is noise)`);
  const medianRandom = randomFinals[Math.floor(randomFinals.length / 2)];
  console.log(`  vs 1000 random top-${top} portfolios (same months, same universe, same costs):`);
  console.log(`    momentum's final value beats ${pct(percentileOf(randomFinals, strat.values.at(-1)), 0)} of them (median random final: ${money(medianRandom)})`);

  console.log(`\n  Rebound windows (digest check #3 — real momentum should LAG the basket here):`);
  for (const r of rebounds) {
    if (!r.covered) { console.log(`    ${r.label.padEnd(16)} not covered by the data`); continue; }
    const note = r.stratReturn < r.benchReturn ? 'lagged, as momentum should' : '⚠ did NOT lag — suspicious';
    console.log(`    ${r.label.padEnd(16)} strat ${pct(r.stratReturn).padStart(7)}   basket ${pct(r.benchReturn).padStart(7)}   ${note}`);
  }
  console.log(`  Crisis windows (no cash exit — expect little to no protection):`);
  for (const c of crises) {
    if (!c.covered) { console.log(`    ${c.label.padEnd(18)} not covered by the data`); continue; }
    console.log(`    ${c.label.padEnd(18)} strat ${pct(c.stratReturn).padStart(7)}   basket ${pct(c.benchReturn).padStart(7)}${c.partial ? '   (partial window)' : ''}`);
  }

  if (warnings.length) console.log(`\n  ${warnings.join('\n  ')}`);
  console.log(`\n  Caveats:`);
  console.log(`  - The basket is survivor-SELECTED, not just survivor-tilted: we watch AAPL/MSFT/NVDA`);
  console.log(`    because they won, which flatters any past-winner rule. A win here is suspect;`);
  console.log(`    a loss here is informative.`);
  console.log(`  - ${aligned.tickers.length} mega-caps is close to the worst place to find momentum (spreads are smallest`);
  console.log(`    among big stocks — Fama & French 2012); the literature's edge lives in 100s of names.`);
  console.log(`  - One overlapping history, ~${months} monthly bets: differences of a few CAGR points are noise.`);
  if (!adjusted) console.log(`  - Dividends excluded — hurts the benchmark more than the strategy (KO/PG/JNJ/T/XOM`);
  if (!adjusted) console.log(`    rarely rank top-3). Re-run with --adjust before believing any verdict.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
