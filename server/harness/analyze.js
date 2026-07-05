// analyze.js — the complete per-ticker analysis, in one reusable function.
//
// run.js (single-ticker report) and sweep.js (multi-ticker table) both need
// the exact same computation; extracting it here means the two can never
// drift apart and quietly report different numbers for the same ticker.

const { maSignalSeries } = require('./strategies');
const { signalsToPositions, simulate, buyAndHold, randomBaseline, percentileOf, horizonStats } = require('./backtest');
const { totalReturn, cagr, sharpe, maxDrawdown } = require('./metrics');

function analyze(history, { costRate = 0.001 } = {}) {
  const allCloses = history.days.map(d => d.close);
  const allSignals = maSignalSeries(allCloses);

  // The signal needs 200 days of warmup. Chop it off so strategy and
  // buy-and-hold are compared over EXACTLY the same days.
  const start = allSignals.findIndex(s => s !== null);
  if (start === -1) return null; // fewer than 200 days of history — can't test

  const closes = allCloses.slice(start);
  const signals = allSignals.slice(start);
  const days = history.days.slice(start);

  const positions = signalsToPositions(signals);
  const strat = simulate(closes, positions, { costRate });
  const bench = buyAndHold(closes, { costRate });
  const randomFinals = randomBaseline(closes, strat.trades, { trials: 1000, costRate });

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
    timeInMarket: positions.reduce((a, b) => a + b, 0) / positions.length,
    horizons: horizonStats(closes, signals),
  };
}

module.exports = { analyze };
