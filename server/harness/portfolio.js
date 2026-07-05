// portfolio.js — the multi-ticker simulator core.
//
// The single-ticker simulator in backtest.js answers "in or out of ONE
// stock?". A portfolio strategy instead holds SEVERAL tickers at once and
// occasionally rebalances between them. This file is Phase 5's portfolio
// mode — and, deliberately, the engine Phase 6's paper trading will reuse
// (backtest = run it over history; paper-trade = run it forward).
//
// The same three honesty rules as backtest.js apply:
//  1. NO LOOKAHEAD — a decision made at day i's close trades on day i+1.
//  2. COSTS COUNT — every traded dollar pays `costRate` (buys AND sells).
//     This generalizes the single-ticker model, where one 0→1 switch traded
//     100% of the portfolio and paid costRate once.
//  3. COMPARE OR IT DIDN'T HAPPEN — benchmarks and a random baseline that
//     trades with the exact same cadence live here too.

const { mulberry32 } = require('./backtest');

// --- alignment -------------------------------------------------------------
// Histories come per ticker and may not share every trading day (data quirks,
// different listing dates). The simulator needs a rectangular grid: one shared
// date axis, one close per ticker per day. We keep only the dates present in
// EVERY ticker's history — with the default basket (all listed since before
// 2007) this drops almost nothing, and it guarantees every day's returns are
// computed from real same-day closes, never interpolated ones.
function alignHistories(histories) {
  const tickers = histories.map(h => h.ticker);
  const maps = histories.map(h => new Map(h.days.map(d => [d.date, d.close])));
  const dates = histories[0].days
    .map(d => d.date)
    .filter(date => maps.every(m => m.has(date)));
  const closes = {};
  histories.forEach((h, k) => { closes[h.ticker] = dates.map(d => maps[k].get(d)); });
  return { tickers, dates, closes };
}

// --- the simulator ---------------------------------------------------------
// targets[i] is either null (no trade today: positions ride the market) or an
// object { ticker: weight } to rebalance to at the START of day i, priced at
// day i-1's close — exactly the single-ticker convention: a decision from day
// i-1's close earns day i's return. Weights may sum to less than 1; the rest
// sits in cash earning 0%.
//
// Positions are tracked in dollars, not weights, so between rebalances they
// DRIFT with prices like a real account (a winner grows into a bigger share
// of the portfolio until the next rebalance resets it).
function simulatePortfolio(aligned, targets, { costRate = 0.001, startValue = 10_000 } = {}) {
  const { tickers, dates, closes } = aligned;
  const values = new Array(dates.length).fill(0);
  values[0] = startValue;
  let cash = startValue;
  const pos = Object.fromEntries(tickers.map(t => [t, 0])); // dollars per ticker
  let traded = 0;      // total dollars traded one-way, for the turnover report
  let rebalances = 0;  // how many days actually traded

  for (let i = 1; i < dates.length; i++) {
    if (targets[i]) {
      // Retarget using yesterday's closing values. Cost is charged on the
      // total traded volume and paid out of the portfolio before sizing the
      // new positions (measuring the deltas against the pre-cost value is
      // off by ~costRate² — invisible at 0.1%).
      const v = cash + tickers.reduce((a, t) => a + pos[t], 0);
      let delta = 0;
      for (const t of tickers) delta += Math.abs((targets[i][t] || 0) * v - pos[t]);
      const net = v - delta * costRate;
      traded += delta;
      if (delta > 0) rebalances++;
      for (const t of tickers) pos[t] = (targets[i][t] || 0) * net;
      cash = net - tickers.reduce((a, t) => a + pos[t], 0);
    }
    // Ride today's market moves.
    for (const t of tickers) {
      if (pos[t] !== 0) pos[t] *= closes[t][i] / closes[t][i - 1];
    }
    values[i] = cash + tickers.reduce((a, t) => a + pos[t], 0);
  }
  return { values, traded, rebalances };
}

// --- benchmarks ------------------------------------------------------------
// Equal-weight buy-and-hold: put 1/N in every ticker on `startDay`, then
// never touch it. Weights drift for the rest of history — by the end the
// winners dominate, exactly like a real never-rebalanced account. This is
// the "do nothing" benchmark the momentum digest names.
function equalWeightBuyHold(aligned, startDay, opts) {
  const w = 1 / aligned.tickers.length;
  const targets = new Array(aligned.dates.length).fill(null);
  targets[startDay] = Object.fromEntries(aligned.tickers.map(t => [t, w]));
  return simulatePortfolio(aligned, targets, opts);
}

// Equal-weight, rebalanced on the same days the strategy trades. A stricter
// comparison: it removes "the strategy rebalances monthly and B&H doesn't"
// as an explanation for any difference. Reported alongside, not instead.
function equalWeightRebalanced(aligned, rebalanceDays, opts) {
  const w = 1 / aligned.tickers.length;
  const ew = Object.fromEntries(aligned.tickers.map(t => [t, w]));
  const targets = new Array(aligned.dates.length).fill(null);
  for (const i of rebalanceDays) targets[i] = ew;
  return simulatePortfolio(aligned, targets, opts);
}

// --- the random baseline ---------------------------------------------------
// Monkeys with the same calendar: on every rebalance day, pick `k` tickers
// UNIFORMLY AT RANDOM from the same eligible set the strategy chose from,
// equal-weighted, same costs. Run many trials, collect final values. If the
// momentum ranking can't beat most of these, its "past winners keep winning"
// logic adds nothing beyond "hold 3 names from this basket, monthly".
//
// eligibleByDay: Map from rebalance-day index -> array of eligible tickers
// (the strategy builder already knows this; passing it in keeps the two
// selection universes identical by construction). Seeded -> reproducible.
function randomPicksBaseline(aligned, eligibleByDay, k, { trials = 1000, costRate = 0.001, startValue = 10_000, seed = 42 } = {}) {
  const rand = mulberry32(seed);
  const finals = [];
  for (let t = 0; t < trials; t++) {
    const targets = new Array(aligned.dates.length).fill(null);
    for (const [day, eligible] of eligibleByDay) {
      const pool = eligible.slice();
      const picks = [];
      while (picks.length < Math.min(k, pool.length)) {
        picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      }
      targets[day] = Object.fromEntries(picks.map(p => [p, 1 / picks.length]));
    }
    finals.push(simulatePortfolio(aligned, targets, { costRate, startValue }).values.at(-1));
  }
  finals.sort((a, b) => a - b);
  return finals;
}

module.exports = { alignHistories, simulatePortfolio, equalWeightBuyHold, equalWeightRebalanced, randomPicksBaseline };
