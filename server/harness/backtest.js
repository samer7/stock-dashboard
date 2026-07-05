// backtest.js — the portfolio simulator and the honesty checks around it.
//
// Three ideas, and every function here serves one of them:
//
//  1. NO LOOKAHEAD. A signal computed from day i's close cannot be traded at
//     day i's close — you didn't know it until the market shut. Trades take
//     effect the next day. (signalsToPositions does the one-day shift.)
//  2. COSTS COUNT. Every switch between stock and cash pays a fee. Frequent
//     traders die by a thousand cuts; a backtest that ignores costs will
//     always flatter an active strategy.
//  3. COMPARE OR IT DIDN'T HAPPEN. A raw return number means nothing. The
//     strategy runs against buy-and-hold (the "do nothing" benchmark) and
//     against a swarm of RANDOM strategies that trade just as often — if a
//     signal can't beat random switching, its "logic" adds nothing.

// Turn a signal series into a position series. position[i] is the exposure
// DURING day i: 1 = fully in the stock, 0 = in cash.
//
// BUY -> be invested, SELL -> be in cash, HOLD -> keep whatever you had.
// The position for day i comes from the signal at day i-1's close (the
// one-day execution delay described above). We start in cash.
function signalsToPositions(signals) {
  const positions = new Array(signals.length).fill(0);
  let held = 0;
  for (let i = 1; i < signals.length; i++) {
    const s = signals[i - 1]; // yesterday's signal decides today's position
    if (s === 'BUY') held = 1;
    else if (s === 'SELL') held = 0;
    // HOLD or null: keep previous position
    positions[i] = held;
  }
  return positions;
}

// Walk the market one day at a time and track what a portfolio following
// `positions` would be worth. If invested during day i, the portfolio moves
// with the stock (close[i]/close[i-1]); in cash it stays flat. Each position
// CHANGE costs `costRate` of the whole portfolio — this models commission +
// slippage together (0.001 = 0.1% per switch).
function simulate(closes, positions, { costRate = 0.001, startValue = 10_000 } = {}) {
  const values = new Array(closes.length).fill(0);
  values[0] = startValue;
  let trades = 0;
  for (let i = 1; i < closes.length; i++) {
    let v = values[i - 1];
    if (positions[i] === 1) v *= closes[i] / closes[i - 1]; // rode the stock today
    if (positions[i] !== positions[i - 1]) {                // switched -> pay up
      v *= 1 - costRate;
      trades++;
    }
    values[i] = v;
  }
  return { values, trades };
}

// Buy-and-hold over the same days: buy on day 0 (one cost), never touch it.
// This is the benchmark that matters most — it's what a person who ignores
// the dashboard entirely would get.
function buyAndHold(closes, { costRate = 0.001, startValue = 10_000 } = {}) {
  const positions = new Array(closes.length).fill(1);
  positions[0] = 0; // "buys in" at the start -> one cost charged on day 1
  return simulate(closes, positions, { costRate, startValue });
}

// The random baseline: strategies that switch between stock and cash the SAME
// number of times as ours, but at uniformly random days. Run many trials and
// collect the final values. If our strategy's final value doesn't beat the
// bulk of these monkeys-flipping-coins, the signal's timing contains no
// information — it was just "being in the market some of the time".
//
// Math.random() would make runs non-reproducible, so we use a tiny seeded
// generator (mulberry32) — same seed, same trials, same report, every run.
function randomBaseline(closes, nSwitches, { trials = 1000, costRate = 0.001, startValue = 10_000, seed = 42 } = {}) {
  const rand = mulberry32(seed);
  const finals = [];
  for (let t = 0; t < trials; t++) {
    // Pick nSwitches distinct random days and flip position at each of them.
    const switchDays = new Set();
    while (switchDays.size < Math.min(nSwitches, closes.length - 2)) {
      switchDays.add(1 + Math.floor(rand() * (closes.length - 1)));
    }
    const positions = new Array(closes.length).fill(0);
    let held = 0;
    for (let i = 1; i < closes.length; i++) {
      if (switchDays.has(i)) held = 1 - held;
      positions[i] = held;
    }
    finals.push(simulate(closes, positions, { costRate, startValue }).values.at(-1));
  }
  finals.sort((a, b) => a - b);
  return finals;
}

// A fairer random baseline: match time-in-market, not just trade count.
//
// randomBaseline above flips at random days, so its strategies spend ~50% of
// days invested on average — but ours spends ~58%. In a market that mostly
// rises, that difference ALONE makes our strategy look better than random,
// with zero timing skill involved. The fix: take the strategy's own holding
// pattern — its alternating runs of in-market and in-cash days — and shuffle
// the run lengths (in-runs among in-runs, cash-runs among cash-runs). Every
// trial then has the SAME number of switches and the SAME total days in the
// market; the only thing randomized is WHERE the holding periods land. If the
// real strategy can't beat these shuffles, its placement carries no
// information beyond "be invested 58% of the time".
function randomBaselineMatched(closes, positions, { trials = 1000, costRate = 0.001, startValue = 10_000, seed = 42 } = {}) {
  // Decompose the position series into alternating runs: [{held, len}, ...].
  const runs = [];
  for (let i = 0; i < positions.length; i++) {
    if (runs.length && runs.at(-1).held === positions[i]) runs.at(-1).len++;
    else runs.push({ held: positions[i], len: 1 });
  }
  const inLens = runs.filter(r => r.held === 1).map(r => r.len);
  const outLens = runs.filter(r => r.held === 0).map(r => r.len);
  const startsHeld = runs.length > 0 && runs[0].held === 1;

  const rand = mulberry32(seed);
  const shuffle = (arr) => { // Fisher–Yates with the seeded generator
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const finals = [];
  for (let t = 0; t < trials; t++) {
    const ins = shuffle(inLens), outs = shuffle(outLens);
    const pos = new Array(positions.length);
    let idx = 0, held = startsHeld ? 1 : 0, ii = 0, oi = 0;
    while (idx < positions.length) {
      const len = held ? ins[ii++] : outs[oi++];
      for (let k = 0; k < len && idx < positions.length; k++) pos[idx++] = held;
      held = 1 - held;
    }
    finals.push(simulate(closes, pos, { costRate, startValue }).values.at(-1));
  }
  finals.sort((a, b) => a - b);
  return finals;
}

// What fraction of the random finals our strategy beat. 0.95 means better
// than 95% of random strategies — a decent sign the timing carries signal.
// Around 0.5 means indistinguishable from luck.
function percentileOf(sortedFinals, value) {
  let below = 0;
  while (below < sortedFinals.length && sortedFinals[below] < value) below++;
  return below / sortedFinals.length;
}

// Per-horizon hit rates: on days the signal said BUY, how often was the stock
// actually higher 1 week / 1 month / 3 months / 1 year later? (And lower, for
// SELL days.) Each is compared against the BASE RATE — how often the stock
// was up over any window of that length — because in a stock that rises 60%
// of all months, a "BUY" that's right 60% of the time has zero skill.
const HORIZONS = [
  { label: '1 week', days: 5 },
  { label: '1 month', days: 21 },
  { label: '3 months', days: 63 },
  { label: '1 year', days: 252 },
];

function horizonStats(closes, signals) {
  return HORIZONS.map(({ label, days }) => {
    let buyDays = 0, buyHits = 0, sellDays = 0, sellHits = 0, allDays = 0, allUp = 0;
    for (let i = 0; i < closes.length - days; i++) {
      if (signals[i] === null) continue; // warmup period — signal not defined yet
      const up = closes[i + days] > closes[i];
      allDays++;
      if (up) allUp++;
      if (signals[i] === 'BUY') { buyDays++; if (up) buyHits++; }
      if (signals[i] === 'SELL') { sellDays++; if (!up) sellHits++; }
    }
    return {
      label, days,
      baseUpRate: allDays ? allUp / allDays : 0,   // "always bullish" gets this for free
      buyDays, buyHitRate: buyDays ? buyHits / buyDays : null,
      sellDays, sellHitRate: sellDays ? sellHits / sellDays : null,
      // Raw counts too, so a multi-ticker sweep can POOL hits across tickers.
      // (Averaging per-ticker rates would weight a 2-signal ticker the same as
      // a 2000-signal one; pooling counts weights every signal day equally.)
      buyHits, sellHits, allDays, allUp,
    };
  });
}

// Event test: what happens after the signal FLIPS, rather than on every day
// it happens to be showing.
//
// Why this exists: horizonStats counts every BUY *day*, but a BUY that stays
// on for six months contributes ~126 rows that are really one decision — the
// samples are massively autocorrelated, so those counts flatter our
// confidence. The sharper question is event-based: on the day the signal
// flips to BUY (it was something else yesterday), does the market behave any
// differently afterwards than it does after a random day? Same for flips to
// SELL. This is also exactly what a dashboard user experiences: they don't
// see "day 83 of an ongoing BUY", they see "it just turned BUY".
//
// For each horizon we record, per flip type:
//   - how many flips there were (far fewer than signal-days — honesty about N)
//   - the up-rate afterwards (down-rate for SELL flips), vs the any-day base
//   - the AVERAGE forward return, vs the any-day average (direction alone can
//     hide magnitude: a flip could pick winners no more often but pick bigger
//     ones — or vice versa)
// Raw sums are included so sweep.js can pool events across tickers.
//
// Windows are measured from the flip day's close, like horizonStats (the
// signal is knowable at that close; actual trading starts a day later).
function transitionStats(closes, signals) {
  return HORIZONS.map(({ label, days }) => {
    const t = {
      label, days,
      buyFlips: 0, buyUps: 0, buyRetSum: 0,
      sellFlips: 0, sellDowns: 0, sellRetSum: 0,
      allDays: 0, allUps: 0, allRetSum: 0,
    };
    for (let i = 1; i < closes.length - days; i++) {
      if (signals[i] === null || signals[i - 1] === null) continue; // warmup
      const ret = closes[i + days] / closes[i] - 1;
      const up = ret > 0;
      t.allDays++; if (up) t.allUps++; t.allRetSum += ret;
      if (signals[i] === 'BUY' && signals[i - 1] !== 'BUY') {
        t.buyFlips++; if (up) t.buyUps++; t.buyRetSum += ret;
      }
      if (signals[i] === 'SELL' && signals[i - 1] !== 'SELL') {
        t.sellFlips++; if (!up) t.sellDowns++; t.sellRetSum += ret;
      }
    }
    return t;
  });
}

// Crisis-window test: score the strategy ONLY inside the big equity declines.
//
// Why this exists: the literature's surviving claim for MA rules (and this
// project's own measured result) is drawdown protection — the rule should
// earn its keep precisely in prolonged bear markets. That claim is testable
// on its own: compare strategy vs buy-and-hold inside each named window. If
// the rule doesn't clearly lose less money in THESE windows, even the
// risk-dampening story fails.
//
// Windows are S&P 500 peak-to-trough dates — market-wide crisis calendars,
// deliberately not tuned per ticker. A window is scored over whatever part of
// it the data covers (and says so): our histories start mid-2007, so the
// dot-com bust is expected to come back uncovered.
const { maxDrawdown } = require('./metrics');

const CRISIS_WINDOWS = [
  { label: 'Dot-com bust', from: '2000-03-24', to: '2002-10-09' },
  { label: 'Financial crisis', from: '2007-10-09', to: '2009-03-09' },
  { label: 'COVID crash', from: '2020-02-19', to: '2020-03-23' },
  { label: '2022 bear market', from: '2022-01-03', to: '2022-10-12' },
];

// dates: 'YYYY-MM-DD' per day; stratValues/benchValues: daily portfolio worth
// from the same simulation the headline numbers come from (no re-warmup).
function crisisStats(dates, stratValues, benchValues) {
  return CRISIS_WINDOWS.map((w) => {
    let i0 = -1, i1 = -1;
    for (let i = 0; i < dates.length; i++) {
      if (i0 === -1 && dates[i] >= w.from) i0 = i;
      if (dates[i] <= w.to) i1 = i;
    }
    if (i0 === -1 || i1 <= i0) return { ...w, covered: false };
    const stratSeg = stratValues.slice(i0, i1 + 1);
    const benchSeg = benchValues.slice(i0, i1 + 1);
    return {
      ...w,
      covered: true,
      coveredFrom: dates[i0], coveredTo: dates[i1],
      partial: dates[i0] > w.from || dates[i1] < w.to,
      stratReturn: stratSeg.at(-1) / stratSeg[0] - 1,
      benchReturn: benchSeg.at(-1) / benchSeg[0] - 1,
      stratDD: maxDrawdown(stratSeg),
      benchDD: maxDrawdown(benchSeg),
    };
  });
}

// Small, well-known seeded pseudo-random generator. Not cryptographic — just
// deterministic, which is all a reproducible backtest needs.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { signalsToPositions, simulate, buyAndHold, randomBaseline, randomBaselineMatched, percentileOf, horizonStats, transitionStats, crisisStats, HORIZONS, CRISIS_WINDOWS };
