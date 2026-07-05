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

module.exports = { signalsToPositions, simulate, buyAndHold, randomBaseline, percentileOf, horizonStats, HORIZONS };
