// prob.js — Phase 5b proper: are calibrated up/down PROBABILITIES any better
// than base rates on our data?
//
//   node prob.js              # default 18-ticker basket, cached data
//   node prob.js --adjust     # total-return prices
//   flags: --lambda=0.94      EWMA decay for the volatility layer
//
// The question. The dashboard wants to say "P(price higher in 1 month): 62%"
// instead of a bare BUY/HOLD/SELL. Every directional test so far scored zero,
// so the honest starting point is: the best probability is probably just the
// BASE RATE (stocks drift up, so "up in 1 month" is right ~60% of the time
// regardless of any signal). The one measured-positive thing we own is the
// EWMA volatility forecast (vol.js, 0.59 rank corr). This script asks whether
// layering that vol forecast onto the base rate produces a probability that
// beats the base rate alone — and whether either is actually CALIBRATED
// (when we say 60%, does it happen 60% of the time?).
//
// The candidate model is the textbook one (Christoffersen & Diebold 2006):
// if h-day log returns are roughly normal with drift mu*h and volatility
// sigma*sqrt(h), then
//
//     P(up over h days) = Phi( mu*h / (sigma*sqrt(h)) )
//
// where Phi is the standard normal CDF. Both inputs are causal and nothing
// is fitted: mu = expanding mean of daily log returns so far (base-rate
// drift), sigma = today's EWMA vol (the measured layer). The interesting
// mechanic: when current vol is HIGH the probability shrinks toward 50%
// (drift drowns in noise); when vol is LOW it rises toward the drift-implied
// rate. Vol never says which way — it says how CONFIDENT the drift is.
//
// Four forecasters, so we can see exactly where any skill comes from:
//   coin        p = 0.5 always (the "know nothing" floor)
//   climatology p = expanding historical up-rate at this horizon (base rate —
//               THE baseline; beating coin but not this means "stocks go up")
//   gauss-clim  Phi formula with expanding FULL-HISTORY vol (ablation: the
//               Gaussian machinery without the EWMA layer)
//   gauss-ewma  Phi formula with TODAY'S EWMA vol (the candidate)
//
// Scoring — proper scoring rules only (Brier 1950; Gneiting & Raftery 2007),
// which reward honest probabilities and punish both overconfidence and
// hedging:
//   Brier    mean (p - outcome)^2          0 = perfect, 0.25 = coin
//   log-loss mean -[o*ln p + (1-o)*ln(1-p)] (p clamped to [0.01, 0.99])
//   BSS      1 - Brier(model)/Brier(climatology): skill vs the base rate.
//            Positive = adds information beyond "stocks drift up".
// Plus a pooled calibration table: bucket the candidate's stated
// probabilities, compare stated vs realized up-rate.
//
// Pre-committed ship rule (written before the first run): the probability
// layer reaches the UI only if (a) gauss-ewma's Brier is <= climatology's on
// a majority of tickers at the 1w and 1m horizons, and (b) the pooled
// calibration table is roughly monotone (stated 55% happens more often than
// stated 50%). If it's WORSE than climatology, the vol layer stays out and
// any UI probability is labeled as the plain base rate. Either way the UI
// label must say "mostly base rate" — this is honest packaging, not alpha.

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');
const { logReturns, ewmaVolSeries, DEFAULT_BASKET } = require('./vol');

const HORIZONS = [
  { label: '1w', days: 5 },
  { label: '1m', days: 21 },
  { label: '3m', days: 63 },
  { label: '1y', days: 252 },
];
const WARMUP = 756; // ~3 years of daily bars before the first forecast

// Standard normal CDF via the Abramowitz & Stegun (1964, eq. 7.1.26) erf
// approximation — max absolute error ~1.5e-7, far below anything that
// matters for a two-decimal probability.
function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return 0.5 * (1 + (x < 0 ? -erf : erf));
}

const clamp = (p) => Math.min(0.99, Math.max(0.01, p));
const logLoss = (p, o) => -(o * Math.log(clamp(p)) + (1 - o) * Math.log(1 - clamp(p)));

// One ticker, one horizon: walk forward, emit a row per forecast day.
// Everything expanding-window; each quantity is updated AFTER use so day t's
// forecast never sees day t+1.
function analyzeHorizon(closes, returns, ewma, h) {
  const rows = [];
  // Expanding drift/vol accumulators over daily log returns.
  let sumR = 0, sumR2 = 0, nR = 0;
  // Expanding count of RESOLVED h-day windows for climatology. A window
  // starting at day s resolves at day s+h, so at day t we may count starts
  // s <= t-h. `nextStart` is the first start not yet counted.
  let up = 0, resolved = 0, nextStart = 0;

  for (let t = 1; t < closes.length; t++) {
    // Resolve every window whose end has arrived (start s = t - h).
    while (nextStart + h <= t) {
      if (closes[nextStart + h] > closes[nextStart]) up++;
      resolved++;
      nextStart++;
    }

    if (t >= WARMUP && t < closes.length - h && ewma[t] !== null && resolved > 0 && nR > 1) {
      const mu = sumR / nR;
      const sigmaFull = Math.sqrt(Math.max(sumR2 / nR - mu * mu, 1e-12));
      const z = (sigma) => (mu * h) / (sigma * Math.sqrt(h));
      rows.push({
        outcome: closes[t + h] > closes[t] ? 1 : 0,
        clim: up / resolved,
        gaussClim: normCdf(z(sigmaFull)),
        gaussEwma: normCdf(z(ewma[t])),
      });
    }

    sumR += returns[t]; sumR2 += returns[t] * returns[t]; nR++; // update AFTER use
  }
  return rows;
}

function scoreRows(rows, key) {
  let brier = 0, ll = 0;
  for (const r of rows) {
    const p = key === 'coin' ? 0.5 : r[key];
    brier += (p - r.outcome) ** 2;
    ll += logLoss(p, r.outcome);
  }
  return { brier: brier / rows.length, logLoss: ll / rows.length };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const adjusted = rawArgs.includes('--adjust');
  const lambdaArg = rawArgs.find(s => s.startsWith('--lambda='));
  const lambda = lambdaArg ? parseFloat(lambdaArg.split('=')[1]) : 0.94;
  const basket = rawArgs.filter(a => !a.startsWith('--')).map(t => t.toUpperCase());
  const tickers = basket.length ? basket : DEFAULT_BASKET;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const data = [];
  const warnings = [];
  for (const t of tickers) {
    const cached = isCached(t, adjusted);
    const h = await loadWithThrottle(t, adjusted);
    const stale = stalenessWarning(h);
    if (stale) warnings.push(stale);
    const closes = h.days.map(d => d.close);
    const returns = logReturns(closes);
    data.push({ ticker: t, closes, returns, ewma: ewmaVolSeries(returns, lambda) });
    process.stderr.write(`  ${t} done${cached ? ' (cached)' : ''}\n`);
    if (!cached) await sleep(8500);
  }

  console.log(`\n=== Up/down probability calibration — drift + EWMA(lambda=${lambda}) vol vs base rates ===`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN' : 'split-adjusted only (--adjust for total return)'}.`);
  console.log(`Brier score: 0 = perfect, 0.25 = coin flip. BSS = skill vs climatology (positive = beats base rate).\n`);

  for (const { label, days: h } of HORIZONS) {
    const perTicker = data.map(d => {
      const rows = analyzeHorizon(d.closes, d.returns, d.ewma, h);
      return {
        ticker: d.ticker,
        n: rows.length,
        baseRate: rows.reduce((s, r) => s + r.outcome, 0) / rows.length,
        rows,
        coin: scoreRows(rows, 'coin'),
        clim: scoreRows(rows, 'clim'),
        gaussClim: scoreRows(rows, 'gaussClim'),
        gaussEwma: scoreRows(rows, 'gaussEwma'),
      };
    });

    console.log(`--- Horizon ${label} (${h} trading days) ---`);
    console.log(
      `  ${'ticker'.padEnd(7)}${'days'.padStart(6)}${'up-rate'.padStart(9)}${'coin'.padStart(8)}` +
      `${'clim'.padStart(8)}${'g-clim'.padStart(8)}${'g-ewma'.padStart(8)}${'BSS'.padStart(9)}`
    );
    for (const a of perTicker) {
      const bss = 1 - a.gaussEwma.brier / a.clim.brier;
      console.log(
        `  ${a.ticker.padEnd(7)}${String(a.n).padStart(6)}${(a.baseRate * 100).toFixed(0).padStart(8)}%` +
        `${a.coin.brier.toFixed(4).padStart(8)}${a.clim.brier.toFixed(4).padStart(8)}` +
        `${a.gaussClim.brier.toFixed(4).padStart(8)}${a.gaussEwma.brier.toFixed(4).padStart(8)}` +
        `${((bss >= 0 ? '+' : '') + (bss * 100).toFixed(2) + '%').padStart(9)}`
      );
    }

    const n = perTicker.length;
    const beats = (key) => perTicker.filter(a => a[key].brier < a.clim.brier).length;
    const beatsLL = (key) => perTicker.filter(a => a[key].logLoss < a.clim.logLoss).length;
    const bssList = perTicker.map(a => 1 - a.gaussEwma.brier / a.clim.brier).sort((x, y) => x - y);
    console.log(`  Scoreboard: clim beats coin ${perTicker.filter(a => a.clim.brier < a.coin.brier).length}/${n} | ` +
      `g-clim beats clim ${beats('gaussClim')}/${n} | g-ewma beats clim ${beats('gaussEwma')}/${n} ` +
      `(log-loss: ${beatsLL('gaussEwma')}/${n}) | median BSS ${(bssList[Math.floor(n / 2)] * 100).toFixed(2)}%`);

    // Pooled calibration for the candidate: fixed absolute bins, because
    // calibration is an absolute claim ("60% means 60%"), unlike vol.js's
    // per-ticker deciles which measured relative ordering.
    const bins = [
      { lo: 0.00, hi: 0.50, label: '  <50%' },
      { lo: 0.50, hi: 0.55, label: '50-55%' },
      { lo: 0.55, hi: 0.60, label: '55-60%' },
      { lo: 0.60, hi: 0.65, label: '60-65%' },
      { lo: 0.65, hi: 0.70, label: '65-70%' },
      { lo: 0.70, hi: 1.01, label: ' >=70%' },
    ].map(b => ({ ...b, sumP: 0, sumO: 0, n: 0 }));
    for (const a of perTicker) {
      for (const r of a.rows) {
        const b = bins.find(b => r.gaussEwma >= b.lo && r.gaussEwma < b.hi);
        b.sumP += r.gaussEwma; b.sumO += r.outcome; b.n++;
      }
    }
    console.log(`  Calibration (pooled, g-ewma): ` + bins
      .filter(b => b.n > 0)
      .map(b => `${b.label.trim()} said ${(b.sumP / b.n * 100).toFixed(0)}→was ${(b.sumO / b.n * 100).toFixed(0)} (n=${b.n})`)
      .join(' | '));
    console.log('');
  }

  if (warnings.length) console.log(`  ${warnings.join('\n  ')}`);
  console.log(`  Caveats:`);
  console.log(`  - Overlapping windows: at the 1y horizon neighboring rows share 251 of 252 days —`);
  console.log(`    the effective sample there is ~20 independent observations per ticker, not ~4,000.`);
  console.log(`    Treat long-horizon scoreboard counts as suggestive, never significant.`);
  console.log(`  - A positive BSS here would mean better PACKAGING of known facts (drift + vol),`);
  console.log(`    not a directional edge. Nothing in this script picks stocks or times entries.`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { normCdf, analyzeHorizon, HORIZONS };
