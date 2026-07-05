// analyze.js — the complete per-ticker analysis, in one reusable function.
//
// run.js (single-ticker report) and sweep.js (multi-ticker table) both need
// the exact same computation; extracting it here means the two can never
// drift apart and quietly report different numbers for the same ticker.

const { maSignalSeries, faberSignalSeries, tsmomSignalSeries, macdCrossSignalSeries } = require('./strategies');
const { signalsToPositions, simulate, buyAndHold, randomBaseline, randomBaselineMatched, percentileOf, horizonStats, transitionStats, crisisStats } = require('./backtest');
const { totalReturn, cagr, sharpe, maxDrawdown } = require('./metrics');

// strategy: 'ma' (the dashboard's daily MA20/50/200 rule, default),
// 'faber' (10-month SMA at month-ends), or 'tsmom' (12-month time-series
// momentum at month-ends) — see strategies.js for each rule.
const STRATEGIES = {
  ma: (closes) => maSignalSeries(closes),
  faber: (closes, dates) => faberSignalSeries(closes, dates),
  tsmom: (closes, dates) => tsmomSignalSeries(closes, dates),
  macdcross: (closes) => macdCrossSignalSeries(closes),
};

function analyze(history, { costRate = 0.001, strategy = 'ma' } = {}) {
  const allCloses = history.days.map(d => d.close);
  const allDates = history.days.map(d => d.date);
  const allSignals = STRATEGIES[strategy](allCloses, allDates);

  // Every signal needs warmup (200 days for the MA rule, 10 month-ends for
  // Faber, 13 for TSMOM). Chop it off so strategy and buy-and-hold are
  // compared over EXACTLY the same days. (The warmups differ by a few months
  // across strategies, so cross-strategy comparisons are near-identical
  // periods, not identical.)
  const start = allSignals.findIndex(s => s !== null);
  if (start === -1) return null; // not enough history to warm up — can't test

  const closes = allCloses.slice(start);
  const signals = allSignals.slice(start);
  const days = history.days.slice(start);

  const positions = signalsToPositions(signals);
  const strat = simulate(closes, positions, { costRate });
  const bench = buyAndHold(closes, { costRate });
  const randomFinals = randomBaseline(closes, strat.trades, { trials: 1000, costRate });
  const matchedFinals = randomBaselineMatched(closes, positions, { trials: 1000, costRate });

  const summarize = (r) => ({
    total: totalReturn(r.values),
    cagr: cagr(r.values),
    sharpe: sharpe(r.values),
    maxDD: maxDrawdown(r.values),
    trades: r.trades,
  });

  return {
    ticker: history.ticker,
    fetchedAt: history.fetchedAt,
    firstDate: days[0].date,
    lastDate: days.at(-1).date,
    tradingDays: closes.length,
    years: closes.length / 252,
    strat: summarize(strat),
    bench: summarize(bench),
    beatRandom: percentileOf(randomFinals, strat.values.at(-1)),
    beatMatched: percentileOf(matchedFinals, strat.values.at(-1)),
    timeInMarket: positions.reduce((a, b) => a + b, 0) / positions.length,
    horizons: horizonStats(closes, signals),
    transitions: transitionStats(closes, signals),
    crises: crisisStats(days.map(d => d.date), strat.values, bench.values),
  };
}

module.exports = { analyze };
