// voltarget.js — Phase 5d: does sizing by the EWMA vol forecast (the
// project's one measured-positive forecast) buy anything per unit of risk?
//
//   node voltarget.js             # default 18-ticker basket, cached data
//   node voltarget.js --adjust    # total-return prices
//   flags: --lambda=0.94          EWMA decay (RiskMetrics constant)
//          --power=1              scaling exponent p (1 = industry vol
//                                 targeting, 2 = Moreira-Muir variance style)
//          --band=0.05            rebalance only when |target - held| > band
//          --cost=0.001           cost per unit of traded volume
//
// The strategy makes NO directional claim (direction measured unpredictable
// in 5a/5b/5c, repeatedly). It holds the stock always — just less of it when
// forecast volatility is above this ticker's own historical norm:
//
//     w_t = min(1, (targetVol_{t-1} / ewmaVol_{t-1})^p)
//
// targetVol = the EXPANDING MEDIAN of the ticker's own EWMA vol series
// ("normal weather for this stock") — causal, nothing fitted; the median is
// a pre-committed convention, not a tuned number. Cap at 1: long-only, no
// leverage. Day t's weight uses only day t-1's information (same discipline
// as signalsToPositions). No walk-forward needed: zero fitted parameters.
//
// Why this could work when every directional rule failed: vol clusters and
// is forecastable (vol.js: 0.59 rank corr, 18/18 vs baselines), and crashes
// live in the high-vol cluster — so leveling realized risk should trim the
// left tail even though it knows nothing about direction. Why it could
// fail: high-vol moments lean UP here (prob.js's rebound result), so
// de-risking in storms gives up rebound return; and Cederburg et al. (2020)
// found vol-managed gains fragile on many portfolios. Both stories are in
// docs/research/risk-sizing.md; this script decides between them for us.
//
// Benchmarks:
//   b&h      buy-and-hold — what ignoring the dashboard earns.
//   control  matched CONSTANT exposure: the strategy's own average weight,
//            held every day. Any portfolio that's partially in cash gets
//            lower vol and shallower drawdowns for free; beating the control
//            isolates the TIMING of the de-risking, exactly as the matched
//            random shuffles did in 5a.
//
// Pre-committed ship rule (written before the first run): a vol-sizing
// number reaches the UI only if, on BOTH price sets (plain and --adjust),
// (a) the strategy's Sharpe beats the matched constant-exposure control's
// on a majority of tickers (>=10/18), AND (b) the strategy's max drawdown
// is shallower than buy-and-hold's on a majority. Raw CAGR vs b&h is NOT a
// criterion (holding less stock in a rising market earns less — the claim
// under test is per-unit-of-risk and tail damage, and any UI label must say
// exactly that). Sortino and crisis windows are reported as diagnostics
// either way.

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');
const { logReturns, ewmaVolSeries, DEFAULT_BASKET } = require('./vol');
const { simulateWeights, buyAndHold, crisisStats, CRISIS_WINDOWS } = require('./backtest');
const { cagr, sharpe, sortino, annualVol, maxDrawdown } = require('./metrics');

const WARMUP = 252; // trading days before the first sized position
const ANN = Math.sqrt(252);

// Expanding median with a sorted insert — O(n log n) comparisons, O(n²)
// element moves worst case, which is milliseconds at our ~5,000 days.
function expandingMedianStep(sorted, x) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1; else hi = mid;
  }
  sorted.splice(lo, 0, x);
}
const medianOf = (sorted) => {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};

// Build the full-length weight series (null before warmup). weights[t] is
// the exposure DURING day t, decided from information through day t-1.
function volTargetWeights(ewma, { power, band }) {
  const weights = new Array(ewma.length).fill(null);
  const sorted = [];
  let held = null;
  for (let t = 1; t < ewma.length; t++) {
    // Day t-1's vol becomes part of history the moment day t starts.
    if (ewma[t - 1] !== null) expandingMedianStep(sorted, ewma[t - 1]);
    if (t < WARMUP || sorted.length === 0 || ewma[t - 1] === null) continue;
    const raw = Math.min(1, Math.pow(medianOf(sorted) / ewma[t - 1], power));
    if (held === null || Math.abs(raw - held) > band) held = raw;
    weights[t] = held;
  }
  return weights;
}

function fmtPct(x, digits = 1) { return `${(x * 100).toFixed(digits)}%`; }

async function main() {
  const rawArgs = process.argv.slice(2);
  const flag = (name, dflt) => {
    const a = rawArgs.find(s => s.startsWith(`--${name}=`));
    return a ? parseFloat(a.split('=')[1]) : dflt;
  };
  const adjusted = rawArgs.includes('--adjust');
  const lambda = flag('lambda', 0.94);
  const power = flag('power', 1);
  const band = flag('band', 0.05);
  const costRate = flag('cost', 0.001);
  const basket = rawArgs.filter(a => !a.startsWith('--')).map(t => t.toUpperCase());
  const tickers = basket.length ? basket : DEFAULT_BASKET;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const results = [];
  const warnings = [];
  const crisisPool = new Map(); // window label -> {stratWins, covered, stratDDs, bhDDs}

  for (const t of tickers) {
    const cached = isCached(t, adjusted);
    const h = await loadWithThrottle(t, adjusted);
    const stale = stalenessWarning(h);
    if (stale) warnings.push(stale);
    process.stderr.write(`  ${t} done${cached ? ' (cached)' : ''}\n`);
    if (!cached) await sleep(8500);

    const closes = h.days.map(d => d.close);
    const dates = h.days.map(d => d.date);
    const ewma = ewmaVolSeries(logReturns(closes), lambda);
    const weightsFull = volTargetWeights(ewma, { power, band });

    // Score everything over the same post-warmup window.
    const start = weightsFull.findIndex(w => w !== null);
    if (start === -1) continue;
    const closesS = closes.slice(start);
    const datesS = dates.slice(start);
    const w = weightsFull.slice(start);
    w[0] = 0; // buys in on the first day -> pays the entry cost like b&h does

    const strat = simulateWeights(closesS, w, { costRate });
    const bh = buyAndHold(closesS, { costRate });
    const avgW = w.reduce((a, b) => a + b, 0) / w.length;
    const constW = new Array(closesS.length).fill(avgW);
    constW[0] = 0;
    const control = simulateWeights(closesS, constW, { costRate });

    const years = (closesS.length - 1) / 252;
    const m = (values) => ({
      cagr: cagr(values), vol: annualVol(values), sharpe: sharpe(values),
      sortino: sortino(values), dd: maxDrawdown(values),
    });
    results.push({
      ticker: t, years, avgW,
      turnoverPerYear: strat.turnover / years,
      trades: strat.trades,
      strat: m(strat.values), bh: m(bh.values), control: m(control.values),
    });

    for (const c of crisisStats(datesS, strat.values, bh.values)) {
      if (!c.covered) continue;
      if (!crisisPool.has(c.label)) crisisPool.set(c.label, { n: 0, wins: 0, stratRets: [], bhRets: [] });
      const p = crisisPool.get(c.label);
      p.n++;
      if (c.stratReturn > c.benchReturn) p.wins++;
      p.stratRets.push(c.stratReturn);
      p.bhRets.push(c.benchReturn);
    }
  }

  console.log(`\n=== Volatility-targeted sizing (Phase 5d) — w = min(1, (median vol / EWMA vol)^${power}) ===`);
  console.log(`lambda=${lambda}, band=${band}, cost=${costRate} per unit traded volume, warmup ${WARMUP}d, long-only, no leverage.`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN' : 'split-adjusted only (--adjust for total return)'}.`);
  console.log(`control = the strategy's own average exposure held CONSTANT — beating it isolates the timing.\n`);

  console.log(
    `  ${'ticker'.padEnd(7)}${'avgW'.padStart(6)}${'to/yr'.padStart(7)}` +
    `${'CAGR s/c/bh'.padStart(20)}${'vol s/bh'.padStart(13)}` +
    `${'Sharpe s/c/bh'.padStart(18)}${'Sortino s/bh'.padStart(14)}${'maxDD s/bh'.padStart(15)}`
  );
  for (const r of results) {
    console.log(
      `  ${r.ticker.padEnd(7)}${(r.avgW * 100).toFixed(0).padStart(5)}%${r.turnoverPerYear.toFixed(1).padStart(7)}` +
      `${`${fmtPct(r.strat.cagr)}/${fmtPct(r.control.cagr)}/${fmtPct(r.bh.cagr)}`.padStart(20)}` +
      `${`${fmtPct(r.strat.vol, 0)}/${fmtPct(r.bh.vol, 0)}`.padStart(13)}` +
      `${`${r.strat.sharpe.toFixed(2)}/${r.control.sharpe.toFixed(2)}/${r.bh.sharpe.toFixed(2)}`.padStart(18)}` +
      `${`${r.strat.sortino.toFixed(2)}/${r.bh.sortino.toFixed(2)}`.padStart(14)}` +
      `${`${fmtPct(r.strat.dd, 0)}/${fmtPct(r.bh.dd, 0)}`.padStart(15)}`
    );
  }

  const n = results.length;
  const count = (pred) => results.filter(pred).length;
  const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(`\n  Ship-rule scoreboard:`);
  console.log(`    Sharpe: strat beats control ${count(r => r.strat.sharpe > r.control.sharpe)}/${n} ` +
    `(vs b&h ${count(r => r.strat.sharpe > r.bh.sharpe)}/${n}) | ` +
    `median Sharpe strat ${med(results.map(r => r.strat.sharpe)).toFixed(2)}, ` +
    `control ${med(results.map(r => r.control.sharpe)).toFixed(2)}, ` +
    `b&h ${med(results.map(r => r.bh.sharpe)).toFixed(2)}`);
  console.log(`    maxDD: strat shallower than b&h ${count(r => r.strat.dd > r.bh.dd)}/${n} ` +
    `(than control ${count(r => r.strat.dd > r.control.dd)}/${n}) | ` +
    `median maxDD strat ${fmtPct(med(results.map(r => r.strat.dd)), 0)}, ` +
    `control ${fmtPct(med(results.map(r => r.control.dd)), 0)}, ` +
    `b&h ${fmtPct(med(results.map(r => r.bh.dd)), 0)}`);
  console.log(`    Sortino (diagnostic): strat beats control ${count(r => r.strat.sortino > r.control.sortino)}/${n}, ` +
    `beats b&h ${count(r => r.strat.sortino > r.bh.sortino)}/${n}`);
  console.log(`    Return give-up (expected): median CAGR strat ${fmtPct(med(results.map(r => r.strat.cagr)))} ` +
    `vs b&h ${fmtPct(med(results.map(r => r.bh.cagr)))} at median avg exposure ` +
    `${fmtPct(med(results.map(r => r.avgW)), 0)}`);

  console.log(`\n  Crisis windows (strategy vs b&h, pooled across covered tickers):`);
  for (const [label, p] of crisisPool) {
    console.log(`    ${label}: strat lost less in ${p.wins}/${p.n} | ` +
      `median return ${fmtPct(med(p.stratRets))} vs ${fmtPct(med(p.bhRets))}`);
  }

  if (warnings.length) console.log(`\n  ${warnings.join('\n  ')}`);
  console.log(`\n  Caveats:`);
  console.log(`  - No leverage means this can only DE-risk: in long calm stretches w sits at 1 and`);
  console.log(`    the strategy IS buy-and-hold. The levered version in the literature is a`);
  console.log(`    different (margin-cost-laden) claim we deliberately don't test.`);
  console.log(`  - Sharpe/Sortino assume 0% risk-free rate, flattering all arms equally; cash`);
  console.log(`    earning T-bill rates would flatter the partially-in-cash arms slightly more.`);
  console.log(`  - One spec, pre-committed (see header). Ablations (--power, --band, --lambda) are`);
  console.log(`    robustness checks, not a menu to pick from.`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { volTargetWeights, WARMUP };
