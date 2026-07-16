// metrics.js — standard performance and risk measures.
//
// Every function takes `values`: the portfolio's worth at the end of each
// trading day, oldest first. These are the numbers any honest comparison of
// strategies rests on — a strategy isn't "better" because its final value is
// higher; it's better if it earns more PER UNIT OF RISK over the same period.

const TRADING_DAYS_PER_YEAR = 252; // the standard count for US markets

// Day-to-day percentage changes: values [100, 102, 101] -> [0.02, -0.0098...]
function dailyReturns(values) {
  const out = [];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] / values[i - 1] - 1);
  }
  return out;
}

// Simple growth over the whole period: end/start - 1. Easy to read, but it
// ignores how LONG the period was — 50% over 2 years is very different from
// 50% over 20. That's what CAGR is for.
function totalReturn(values) {
  return values[values.length - 1] / values[0] - 1;
}

// Compound Annual Growth Rate: the constant yearly return that would produce
// the same overall growth. Makes different-length periods comparable.
function cagr(values) {
  const years = (values.length - 1) / TRADING_DAYS_PER_YEAR;
  if (years <= 0) return 0;
  return Math.pow(values[values.length - 1] / values[0], 1 / years) - 1;
}

// Sharpe ratio: average daily return divided by the volatility of daily
// returns, annualized (multiply by sqrt(252)). It answers "how much return
// per unit of risk?" — rough intuition: < 0.5 is weak, ~1 is good, > 2 is
// suspicious for anything simple. We assume a 0% risk-free rate, which
// slightly flatters every strategy equally; noted in the report's caveats.
function sharpe(values) {
  const rets = dailyReturns(values);
  if (rets.length === 0) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Sortino ratio: like Sharpe, but the denominator only counts DOWNSIDE
// volatility — the root-mean-square of the negative daily returns (positive
// days contribute zero). Rationale: volatility that surprises you upward
// isn't risk anyone minds. Same conventions as sharpe() above: daily
// returns, annualized by sqrt(252), 0% risk-free/target rate. Note the
// downside sum is still divided by ALL days (the standard convention), so a
// strategy with rare small losses gets a small denominator, not a biased one.
function sortino(values) {
  const rets = dailyReturns(values);
  if (rets.length === 0) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const downsideVar = rets.reduce((a, b) => a + (b < 0 ? b * b : 0), 0) / rets.length;
  const downside = Math.sqrt(downsideVar);
  if (downside === 0) return 0;
  return (mean / downside) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Annualized volatility of the daily returns — the risk number on its own,
// for reports that compare "how bumpy was the ride" directly.
function annualVol(values) {
  const rets = dailyReturns(values);
  if (rets.length === 0) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Maximum drawdown: the worst peak-to-trough fall, as a fraction of the peak.
// This is the "how much pain would I have sat through?" number — many people
// abandon a strategy (or the market) during a deep drawdown, which is why a
// lower-return strategy with a shallower drawdown can be the better one.
function maxDrawdown(values) {
  let peak = values[0];
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = v / peak - 1; // negative when below the peak
    if (dd < worst) worst = dd;
  }
  return worst; // e.g. -0.34 means a 34% fall from the peak at the worst point
}

module.exports = { dailyReturns, totalReturn, cagr, sharpe, sortino, annualVol, maxDrawdown, TRADING_DAYS_PER_YEAR };
