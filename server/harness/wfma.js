// wfma.js — first use of the walk-forward machinery: does PICKING the MA
// lengths from recent data beat just using fixed ones?
//
//   node wfma.js                     # default 18-ticker basket, cached data
//   node wfma.js AAPL                # single ticker, with per-fold detail
//   flags: --adjust                  total-return prices
//          --cost=0.001              cost per switch (default 0.1%)
//          --metric=cagr|sharpe      what "best in training" means (default cagr)
//          --train=5 --test=1        window sizes in years
//          --anchored                growing training window instead of sliding
//
// The experiment: every year, look back five years, backtest all 8 classic
// SMA crossover pairs (fast in {10,20,50} x slow in {50,100,200}), pick the
// one that did best, and trade IT for the next year. Roll forward ~15 times,
// stitch the test years together, and compare that walk-forward-optimized
// record against (a) buy-and-hold, (b) the dashboard's FIXED MA rule — the
// "don't tune anything" control — and (c) the hindsight-best single pair
// over the same span, which is the illusion in-sample optimization sells.
//
// Pre-committed prediction (ma-timing.md §2 — data snooping and
// out-of-sample decay): the training winner's test-year rank among the 8
// candidates will average ~4.5/8, i.e. picking from the past adds nothing;
// walk-forward CAGR will trail hindsight-best by a wide gap and won't
// systematically beat the un-tuned fixed rule. If tuning DID help, mean rank
// visibly under 4.5 across ~270 fold-picks would be the tell.

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');
const { smaSeries, maSignalSeries } = require('./strategies');
const { walkForward } = require('./walkforward');
const { signalsToPositions, simulate, buyAndHold, randomBaselineMatched, percentileOf } = require('./backtest');
const { cagr, sharpe, maxDrawdown, TRADING_DAYS_PER_YEAR } = require('./metrics');

// Same basket as sweep.js, same survivorship caveat.
const DEFAULT_BASKET = [
  'SPY', 'QQQ', 'IWM',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
  'KO', 'PG', 'JNJ', 'JPM', 'XOM',
  'INTC', 'T', 'F', 'BA', 'PFE',
];

// The candidate space: every classic fast/slow SMA crossover pair, long when
// the fast SMA is above the slow, cash otherwise. Small on purpose — 8
// candidates is already enough to demonstrate selection noise, and a bigger
// grid would only make the hindsight-best arm look more impressive (more
// candidates = more ways to overfit), not the walk-forward arm better.
const CANDIDATES = [];
for (const fast of [10, 20, 50]) {
  for (const slow of [50, 100, 200]) {
    if (fast < slow) CANDIDATES.push({ fast, slow, label: `${fast}/${slow}` });
  }
}
const WARMUP = 200; // longest slow SMA — every candidate is scored over the SAME training days

function crossSignals(closes, fast, slow) {
  const fastMA = smaSeries(closes, fast);
  const slowMA = smaSeries(closes, slow);
  return closes.map((_, i) =>
    slowMA[i] === null ? null : fastMA[i] > slowMA[i] ? 'BUY' : 'SELL'
  );
}

// Simulate a signal series over its own segment: start in cash, next-day
// execution, costs per switch — identical treatment for every arm so the
// comparison is fair.
function runSegment(segCloses, segSignals, costRate) {
  return simulate(segCloses, signalsToPositions(segSignals), { costRate });
}

// The fit function walk-forward will call once per fold. It sees ONLY the
// training window. All 8 candidates are scored over the same days (the first
// WARMUP-1 days are dropped for everyone, so a 50-day pair gets no head
// start on a 200-day pair), ties go to the first candidate in canonical
// order — deterministic, like everything in this harness.
function makeFit(costRate, metric) {
  return (trainCloses) => {
    if (trainCloses.length < WARMUP + 63) return null; // need warmup + a quarter to score
    let best = null;
    for (const c of CANDIDATES) {
      const sigs = crossSignals(trainCloses, c.fast, c.slow).slice(WARMUP - 1);
      const r = runSegment(trainCloses.slice(WARMUP - 1), sigs, costRate);
      const score = metric === 'sharpe' ? sharpe(r.values) : r.values.at(-1);
      if (!best || score > best.score) best = { ...c, score, trainCagr: cagr(r.values) };
    }
    return best;
  };
}

const applyModel = (model, prefixCloses) => crossSignals(prefixCloses, model.fast, model.slow);

function analyzeTicker(history, { costRate, metric, trainDays, testDays, anchored }) {
  const closes = history.days.map(d => d.close);
  const dates = history.days.map(d => d.date);

  const wf = walkForward(closes, dates, {
    fit: makeFit(costRate, metric), apply: applyModel, trainDays, testDays, anchored,
  });
  if (!wf.folds.length) return null;
  const oosStart = wf.folds[0].testStart;
  const span = closes.slice(oosStart);

  // Score any full-length signal series over the SAME out-of-sample span.
  const arm = (signalsFull) => {
    const r = runSegment(span, signalsFull.slice(oosStart), costRate);
    return { r, positions: signalsToPositions(signalsFull.slice(oosStart)) };
  };

  const wfArm = arm(wf.signals);                 // the walk-forward-optimized record
  const fixedArm = arm(maSignalSeries(closes));  // the dashboard's un-tuned rule (control)
  const bh = buyAndHold(span, { costRate });

  // Hindsight-best: the single pair that did best over the whole OOS span —
  // chosen WITH full knowledge of the future, so it is a cheat by
  // construction. It's here to quantify the illusion: this is the number an
  // in-sample optimizer would show you. Along the way, keep 50/200 (the
  // classic golden cross): a same-family pair that is NEVER re-picked, which
  // is the cleanest control for "does the yearly re-picking itself help?"
  // (the dashboard's fixed rule is a different family — 3 MAs with a HOLD
  // state — so beating IT could just be a family difference).
  let hind = null;
  let golden = null;
  for (const c of CANDIDATES) {
    const a = arm(crossSignals(closes, c.fast, c.slow));
    if (!hind || a.r.values.at(-1) > hind.arm.r.values.at(-1)) hind = { cand: c, arm: a };
    if (c.label === '50/200') golden = { cagr: cagr(a.r.values) };
  }

  const matchedFinals = randomBaselineMatched(span, wfArm.positions, { trials: 1000, costRate });
  const beatMatched = percentileOf(matchedFinals, wfArm.r.values.at(-1));

  // Fold-level truth: for each fold, how did the TRAINING winner actually
  // RANK among all 8 candidates on the test segment it was chosen for?
  // Mid-rank for ties keeps the no-information expectation at exactly 4.5.
  const folds = wf.folds.map((f) => {
    const segCloses = closes.slice(f.testStart, f.testEnd);
    const finals = CANDIDATES.map((c) => {
      const sigs = crossSignals(closes.slice(0, f.testEnd), c.fast, c.slow).slice(f.testStart);
      const r = runSegment(segCloses, sigs, costRate);
      return { label: c.label, final: r.values.at(-1), values: r.values };
    });
    const chosen = finals.find(x => x.label === f.model.label);
    const better = finals.filter(x => x.final > chosen.final).length;
    const tied = finals.filter(x => x.final === chosen.final).length; // includes the chosen itself
    return {
      from: dates[f.testStart], to: dates[f.testEnd - 1],
      label: f.model.label,
      trainCagr: f.model.trainCagr,
      testCagr: cagr(chosen.values),
      rank: better + (tied + 1) / 2,
      wonTest: better === 0 && tied === 1,
    };
  });

  return {
    ticker: history.ticker,
    oosFrom: dates[oosStart], oosTo: dates.at(-1),
    oosYears: span.length / TRADING_DAYS_PER_YEAR,
    wf: { cagr: cagr(wfArm.r.values), sharpe: sharpe(wfArm.r.values), maxDD: maxDrawdown(wfArm.r.values), trades: wfArm.r.trades },
    fixed: { cagr: cagr(fixedArm.r.values), sharpe: sharpe(fixedArm.r.values), maxDD: maxDrawdown(fixedArm.r.values) },
    bench: { cagr: cagr(bh.values), sharpe: sharpe(bh.values), maxDD: maxDrawdown(bh.values) },
    hindsight: { label: hind.cand.label, cagr: cagr(hind.arm.r.values) },
    golden,
    beatMatched,
    folds,
    distinctParams: new Set(folds.map(f => f.label)).size,
    meanRank: folds.reduce((a, f) => a + f.rank, 0) / folds.length,
  };
}

const pct = (x, d = 1) => (x === null || x === undefined ? 'n/a' : (x * 100).toFixed(d) + '%');
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  const rawArgs = process.argv.slice(2);
  const adjusted = rawArgs.includes('--adjust');
  const anchored = rawArgs.includes('--anchored');
  const get = (name, dflt) => {
    const a = rawArgs.find(s => s.startsWith(`--${name}=`));
    return a ? a.split('=')[1] : dflt;
  };
  const costRate = parseFloat(get('cost', '0.001'));
  const metric = get('metric', 'cagr');
  if (!['cagr', 'sharpe'].includes(metric)) {
    console.error('Usage: node wfma.js [tickers...] [--adjust] [--cost=0.001] [--metric=cagr|sharpe] [--train=5] [--test=1] [--anchored]');
    process.exit(1);
  }
  const trainDays = Math.round(parseFloat(get('train', '5')) * TRADING_DAYS_PER_YEAR);
  const testDays = Math.round(parseFloat(get('test', '1')) * TRADING_DAYS_PER_YEAR);
  const basket = rawArgs.filter(a => !a.startsWith('--')).map(t => t.toUpperCase());
  const tickers = basket.length ? basket : DEFAULT_BASKET;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const results = [];
  const warnings = [];
  for (const t of tickers) {
    const cached = isCached(t, adjusted);
    const h = await loadWithThrottle(t, adjusted);
    const stale = stalenessWarning(h);
    if (stale) warnings.push(stale);
    const a = analyzeTicker(h, { costRate, metric, trainDays, testDays, anchored });
    if (!a) { warnings.push(`${t}: not enough history for a single fold`); continue; }
    results.push(a);
    process.stderr.write(`  ${t} done (${a.folds.length} folds${cached ? ', cached' : ''})\n`);
    if (!cached) await sleep(8500);
  }
  if (!results.length) { console.error('No tickers analyzed.'); process.exit(1); }

  // ---------- report ----------
  console.log(`\n=== Walk-forward MA selection — refit every ${(testDays / TRADING_DAYS_PER_YEAR).toFixed(0)}y from the ${anchored ? 'anchored' : 'previous'} ${(trainDays / TRADING_DAYS_PER_YEAR).toFixed(0)}y, trade the winner forward ===`);
  console.log(`Candidates: ${CANDIDATES.map(c => c.label).join('  ')}  (fast SMA > slow SMA -> in, else cash)`);
  console.log(`Fit metric: best training ${metric.toUpperCase()}. Costs ${pct(costRate, 2)}/switch, next-day execution.`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN (dividends reinvested)' : 'split-adjusted only — dividends excluded (--adjust for total return)'}\n`);

  console.log(
    `  ${'ticker'.padEnd(7)}${'OOSy'.padStart(5)}${'folds'.padStart(6)}` +
    `${'wf CAGR'.padStart(9)}${'fixed'.padStart(8)}${'b&h'.padStart(8)}${'hindsight'.padStart(15)}` +
    `${'wf DD'.padStart(7)}${'b&h DD'.padStart(8)}${'beatMtch'.padStart(9)}${'rank'.padStart(6)}${'params'.padStart(7)}`
  );
  for (const a of results) {
    console.log(
      `  ${a.ticker.padEnd(7)}${a.oosYears.toFixed(1).padStart(5)}${String(a.folds.length).padStart(6)}` +
      `${pct(a.wf.cagr).padStart(9)}${pct(a.fixed.cagr).padStart(8)}${pct(a.bench.cagr).padStart(8)}` +
      `${`${pct(a.hindsight.cagr)} ${a.hindsight.label}`.padStart(15)}` +
      `${pct(a.wf.maxDD, 0).padStart(7)}${pct(a.bench.maxDD, 0).padStart(8)}` +
      `${pct(a.beatMatched, 0).padStart(9)}${a.meanRank.toFixed(1).padStart(6)}${String(a.distinctParams).padStart(7)}`
    );
  }

  const n = results.length;
  const bhWins = results.filter(a => a.wf.cagr > a.bench.cagr).length;
  const sharpeWins = results.filter(a => a.wf.sharpe > a.bench.sharpe).length;
  const ddWins = results.filter(a => a.wf.maxDD > a.bench.maxDD).length;
  const fixedWins = results.filter(a => a.wf.cagr > a.fixed.cagr).length;
  const goldenWins = results.filter(a => a.wf.cagr > a.golden.cagr).length;
  const hindGaps = results.map(a => a.hindsight.cagr - a.wf.cagr);

  console.log(`\n  Scoreboard (walk-forward-optimized rule, ${n} tickers, out-of-sample only):`);
  console.log(`    beats buy-and-hold CAGR:            ${bhWins}/${n}`);
  console.log(`    beats buy-and-hold Sharpe:          ${sharpeWins}/${n}`);
  console.log(`    shallower max drawdown than b&h:    ${ddWins}/${n}`);
  console.log(`    beats the FIXED dashboard MA rule:  ${fixedWins}/${n}   (different family — 3 MAs with HOLD)`);
  console.log(`    beats an untuned 50/200 golden cross: ${goldenWins}/${n}   <- same family, never re-picked: does re-picking itself help?`);
  console.log(`    median beat-matched percentile:     ${pct(median(results.map(a => a.beatMatched)), 0)}`);
  console.log(`    median gap to hindsight-best pair:  ${pct(median(hindGaps))} CAGR   <- the in-sample illusion, quantified`);

  const allFolds = results.flatMap(a => a.folds);
  const meanRank = allFolds.reduce((s, f) => s + f.rank, 0) / allFolds.length;
  // Under "picks carry no information", each fold's rank is an independent-ish
  // draw with mean 4.5 and sd ~2.29 (uniform on 1..8): quote the 2-sigma band
  // so a reader can see whether the measured mean is even outside noise.
  const rankSE = 2.29 / Math.sqrt(allFolds.length);
  const testWinnerHits = allFolds.filter(f => f.wonTest).length;

  console.log(`\n  Fold-level truth (${allFolds.length} picks pooled = ${n} tickers x ~${Math.round(allFolds.length / n)} folds):`);
  console.log(`    mean test rank of the training winner: ${meanRank.toFixed(2)} of 8  (no-information mean: 4.50 ± ${(2 * rankSE).toFixed(2)})`);
  console.log(`    training winner also won its test year: ${testWinnerHits}/${allFolds.length} = ${pct(testWinnerHits / allFolds.length, 0)}  (chance ≈ 12.5%)`);
  console.log(`    median training CAGR of the pick: ${pct(median(allFolds.map(f => f.trainCagr)))}  ->  median realized test CAGR: ${pct(median(allFolds.map(f => f.testCagr)))}`);
  console.log(`    distinct pairs chosen per ticker (median): ${median(results.map(a => a.distinctParams))} of ${Math.round(allFolds.length / n)} folds`);

  const counts = new Map();
  for (const f of allFolds) counts.set(f.label, (counts.get(f.label) || 0) + 1);
  const hist = CANDIDATES.map(c => `${c.label} x${counts.get(c.label) || 0}`).join('   ');
  console.log(`    pooled choice histogram: ${hist}`);

  if (results.length === 1) {
    console.log(`\n  Per-fold detail (${results[0].ticker}):`);
    console.log(`    ${'test window'.padEnd(26)}${'pick'.padStart(8)}${'train CAGR'.padStart(12)}${'test CAGR'.padStart(11)}${'test rank'.padStart(11)}`);
    for (const f of results[0].folds) {
      console.log(
        `    ${(f.from + ' -> ' + f.to).padEnd(26)}${f.label.padStart(8)}` +
        `${pct(f.trainCagr).padStart(12)}${pct(f.testCagr).padStart(11)}${f.rank.toFixed(1).padStart(11)}`
      );
    }
  }

  if (warnings.length) console.log(`\n  ${warnings.join('\n  ')}`);
  console.log(`\n  How to read this: the "hindsight" column is a CHEAT (best pair chosen knowing the`);
  console.log(`  future) — it's what an in-sample backtest would have promised. The walk-forward`);
  console.log(`  column is what actually operating that promise delivers. If the mean test rank`);
  console.log(`  sits at ~4.5, the yearly re-picking is a random-number generator with extra steps.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
