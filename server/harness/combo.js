// combo.js — Phase 5c: does a FITTED combination of the dashboard's signals
// (MA state, RSI, MACD, EWMA vol) produce up/down probabilities better than
// the plain base rate?
//
//   node combo.js               # default 18-ticker basket, cached data
//   node combo.js --adjust      # total-return prices
//   flags: --ridge=0.01         L2 penalty on standardized weights
//          --train=5 --test=1   walk-forward window sizes in years
//          --anchored           growing training window instead of sliding
//
// Why this needs walk-forward when prob.js didn't: prob.js had zero fitted
// parameters, so its whole history was honestly out-of-sample. Here the
// WEIGHTS are chosen from data — the exact situation walkforward.js exists
// for. Every fit sees only its training window; only stitched test-segment
// probabilities are scored (everything after the first fold's testStart is
// out-of-sample by construction).
//
// The model — deliberately the smallest thing that can express "weighted
// multi-signal" (docs/research/multi-signal.md; one spec, no menu to snoop
// over): ridge-regularized logistic regression from 4 standardized features
// to P(price higher in h days), h = 5/21/63 (1w/1m/3m; 1y is skipped — ~20
// years holds only ~20 independent 1y windows, not enough to fit on).
//
//   ma    displayed BUY/HOLD/SELL as +1/0/-1     (measured: no timing info)
//   rsi   (RSI14 - 50)/50                        (measured: reversal dead)
//   macd  above/below signal line as +1/-1       (measured: no timing info)
//   vol   ln(EWMA sigma), z-scored per fold      (measured: forecasts swing
//         size; as a FIXED-formula direction input it fired backwards —
//         high-vol moments are rebound moments. A fitted weight is free to
//         learn that positive sign; whether it survives out-of-sample is the
//         one genuinely open question here.)
//
// The intercept is unpenalized and learns the training-window base rate, so
// the model nests climatology: features must add information BEYOND "stocks
// drift up" to beat the baseline. Fitting is IRLS/Newton — deterministic,
// no randomness anywhere in this script.
//
// Scoring: proper rules only (Brier, log-loss), per prob.js/calibration.md,
// against expanding-window climatology evaluated on the same test days, plus
// a pooled calibration table and a per-fold coefficient report (do the folds
// even agree on a SIGN for any feature?).
//
// Pre-committed ship rule (written before the first run): the combined
// probability reaches the UI only if (a) the model's Brier beats
// climatology's for a MAJORITY of tickers (>=10/18) at BOTH 1w and 1m,
// (b) the verdict survives --adjust and a 10x/÷10 change of --ridge, and
// (c) the pooled calibration table is roughly monotone. Anything less:
// nothing ships, the null goes in the legend next to the other honest nulls,
// and no weighted score appears anywhere in the UI (the standing rule from
// calibration.md: never show a P(up) that isn't the base rate unless a model
// beats climatology out-of-sample first).

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');
const { logReturns, ewmaVolSeries, DEFAULT_BASKET } = require('./vol');
const { maSignalSeries, rsiSeries, macdCrossSignalSeries } = require('./strategies');
const { walkForward } = require('./walkforward');

const HORIZONS = [
  { label: '1w', days: 5 },
  { label: '1m', days: 21 },
  { label: '3m', days: 63 },
];
const FEATURE_NAMES = ['ma', 'rsi', 'macd', 'vol'];
const LAMBDA = 0.94; // EWMA decay — the RiskMetrics constant, as everywhere else

// ---------- features ----------

// One row of raw (pre-standardization) features per day, or null while any
// component is still warming up (MA200 is the long pole at 200 days).
// Everything is causal: each series uses only closes up to day i.
function featureMatrix(closes) {
  const ma = maSignalSeries(closes);
  const rsi = rsiSeries(closes, 14);
  const macd = macdCrossSignalSeries(closes);
  const vol = ewmaVolSeries(logReturns(closes), LAMBDA);
  return closes.map((_, i) => {
    if (ma[i] === null || rsi[i] === null || macd[i] === null || vol[i] === null) return null;
    return [
      ma[i] === 'BUY' ? 1 : ma[i] === 'SELL' ? -1 : 0,
      (rsi[i] - 50) / 50,
      macd[i] === 'BUY' ? 1 : -1,
      Math.log(vol[i]),
    ];
  });
}

// ---------- ridge logistic regression (deterministic IRLS) ----------

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Solve the symmetric linear system A x = b by Gaussian elimination with
// partial pivoting. A is tiny here (5x5), so clarity beats cleverness.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null; // singular — caller falls back
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

// Minimize  (1/n) Σ logistic-loss  +  (ridge/2) Σ_{j>=1} w_j²  by Newton
// steps (IRLS). Column 0 of X is the intercept and is never penalized —
// it's free to learn the base rate. Deterministic: fixed start, fixed
// iteration cap, convergence on step size.
function fitRidgeLogit(X, y, ridge) {
  const n = X.length, d = X[0].length;
  let w = new Array(d).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    const grad = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < n; i++) {
      const p = sigmoid(X[i].reduce((s, x, j) => s + x * w[j], 0));
      const err = p - y[i], wt = Math.max(p * (1 - p), 1e-6);
      for (let j = 0; j < d; j++) {
        grad[j] += err * X[i][j] / n;
        for (let k = j; k < d; k++) H[j][k] += wt * X[i][j] * X[i][k] / n;
      }
    }
    for (let j = 1; j < d; j++) { grad[j] += ridge * w[j]; H[j][j] += ridge; }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    const step = solve(H, grad);
    if (step === null) return null;
    let maxStep = 0;
    for (let j = 0; j < d; j++) { w[j] -= step[j]; maxStep = Math.max(maxStep, Math.abs(step[j])); }
    if (maxStep < 1e-10) break;
  }
  return w;
}

// ---------- walk-forward fit/apply for one horizon ----------

// fit: sees ONLY the training slice. Recomputes features inside the slice
// (the first ~200 days are warmup and yield no rows — that's lost data, not
// leakage), keeps rows whose h-day outcome resolves INSIDE the slice, learns
// per-feature mean/std there, and fits the ridge logit on standardized rows.
function makeFit(h, ridge) {
  return (trainCloses) => {
    const feats = featureMatrix(trainCloses);
    const rows = [], ys = [];
    for (let t = 0; t < trainCloses.length - h; t++) {
      if (feats[t] === null) continue;
      rows.push(feats[t]);
      ys.push(trainCloses[t + h] > trainCloses[t] ? 1 : 0);
    }
    if (rows.length < 300) return null; // not enough to fit honestly
    const d = FEATURE_NAMES.length;
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / rows.length;
    for (const r of rows) for (let j = 0; j < d; j++) std[j] += (r[j] - mean[j]) ** 2 / rows.length;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1; // constant feature -> weight 0 anyway
    const X = rows.map(r => [1, ...r.map((v, j) => (v - mean[j]) / std[j])]);
    const w = fitRidgeLogit(X, ys, ridge);
    if (w === null) return null;
    return { w, mean, std, nTrain: rows.length, trainBase: ys.reduce((a, b) => a + b, 0) / ys.length };
  };
}

// apply: gets the full prefix (features warm up on real pre-test history,
// exactly as a live model would), standardizes with the TRAIN-frozen
// mean/std, and emits a probability per day. Only the test segment of the
// output is kept by the engine.
function makeApply() {
  return (model, prefixCloses) => {
    const feats = featureMatrix(prefixCloses);
    return feats.map(f => {
      if (f === null) return null;
      let z = model.w[0];
      for (let j = 0; j < f.length; j++) z += model.w[j + 1] * (f[j] - model.mean[j]) / model.std[j];
      return sigmoid(z);
    });
  };
}

// Expanding-window climatology, same accumulator discipline as prob.js:
// clim[t] is the share of RESOLVED h-day windows (start s <= t-h) that ended
// higher — day t's baseline never peeks past day t.
function climSeries(closes, h) {
  const out = new Array(closes.length).fill(null);
  let up = 0, resolved = 0, nextStart = 0;
  for (let t = 0; t < closes.length; t++) {
    while (nextStart + h <= t) {
      if (closes[nextStart + h] > closes[nextStart]) up++;
      resolved++; nextStart++;
    }
    if (resolved > 0) out[t] = up / resolved;
  }
  return out;
}

// ---------- scoring ----------

const clamp = (p) => Math.min(0.99, Math.max(0.01, p));
const logLoss = (p, o) => -(o * Math.log(clamp(p)) + (1 - o) * Math.log(1 - clamp(p)));

function score(rows, key) {
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
  const flag = (name, dflt) => {
    const a = rawArgs.find(s => s.startsWith(`--${name}=`));
    return a ? parseFloat(a.split('=')[1]) : dflt;
  };
  const adjusted = rawArgs.includes('--adjust');
  const anchored = rawArgs.includes('--anchored');
  const ridge = flag('ridge', 0.01);
  const trainDays = Math.round(flag('train', 5) * 252);
  const testDays = Math.round(flag('test', 1) * 252);
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
    data.push({ ticker: t, closes: h.days.map(d => d.close), dates: h.days.map(d => d.date) });
    process.stderr.write(`  ${t} done${cached ? ' (cached)' : ''}\n`);
    if (!cached) await sleep(8500);
  }

  console.log(`\n=== Multi-signal combination (Phase 5c) — walk-forward ridge logit vs climatology ===`);
  console.log(`Features: MA state, RSI14, MACD cross, ln(EWMA vol). Ridge=${ridge}, ` +
    `${anchored ? 'anchored' : 'sliding'} ${trainDays}d train / ${testDays}d test.`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN' : 'split-adjusted only (--adjust for total return)'}.`);
  console.log(`Brier: 0 = perfect, 0.25 = coin. BSS = skill vs climatology (positive = beats base rate).\n`);

  for (const { label, days: h } of HORIZONS) {
    const perTicker = [];
    const foldWeights = []; // standardized coefficients, pooled across tickers
    for (const d of data) {
      const { signals, folds } = walkForward(d.closes, d.dates, {
        fit: makeFit(h, ridge), apply: makeApply(), trainDays, testDays, anchored,
      });
      for (const f of folds) foldWeights.push(f.model.w);
      const clim = climSeries(d.closes, h);
      const rows = [];
      for (let t = 0; t < d.closes.length - h; t++) {
        if (signals[t] === null || clim[t] === null) continue;
        rows.push({ outcome: d.closes[t + h] > d.closes[t] ? 1 : 0, clim: clim[t], model: signals[t] });
      }
      if (rows.length === 0) continue;
      perTicker.push({
        ticker: d.ticker,
        n: rows.length,
        folds: folds.length,
        baseRate: rows.reduce((s, r) => s + r.outcome, 0) / rows.length,
        rows,
        coin: score(rows, 'coin'),
        clim: score(rows, 'clim'),
        model: score(rows, 'model'),
      });
    }

    console.log(`--- Horizon ${label} (${h} trading days) — out-of-sample test days only ---`);
    console.log(
      `  ${'ticker'.padEnd(7)}${'days'.padStart(6)}${'folds'.padStart(7)}${'up-rate'.padStart(9)}` +
      `${'coin'.padStart(8)}${'clim'.padStart(8)}${'model'.padStart(8)}${'BSS'.padStart(9)}`
    );
    for (const a of perTicker) {
      const bss = 1 - a.model.brier / a.clim.brier;
      console.log(
        `  ${a.ticker.padEnd(7)}${String(a.n).padStart(6)}${String(a.folds).padStart(7)}` +
        `${(a.baseRate * 100).toFixed(0).padStart(8)}%` +
        `${a.coin.brier.toFixed(4).padStart(8)}${a.clim.brier.toFixed(4).padStart(8)}` +
        `${a.model.brier.toFixed(4).padStart(8)}` +
        `${((bss >= 0 ? '+' : '') + (bss * 100).toFixed(2) + '%').padStart(9)}`
      );
    }

    const n = perTicker.length;
    const beats = perTicker.filter(a => a.model.brier < a.clim.brier).length;
    const beatsLL = perTicker.filter(a => a.model.logLoss < a.clim.logLoss).length;
    const bssList = perTicker.map(a => 1 - a.model.brier / a.clim.brier).sort((x, y) => x - y);
    console.log(`  Scoreboard: model beats clim ${beats}/${n} on Brier (${beatsLL}/${n} on log-loss) | ` +
      `median BSS ${(bssList[Math.floor(n / 2)] * 100).toFixed(2)}% | ` +
      `clim beats coin ${perTicker.filter(a => a.clim.brier < a.coin.brier).length}/${n}`);

    // Do the folds even agree on a sign? Standardized scale, so magnitudes
    // are comparable across features.
    const parts = FEATURE_NAMES.map((name, j) => {
      const ws = foldWeights.map(w => w[j + 1]);
      const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
      const sd = Math.sqrt(ws.reduce((s, x) => s + (x - mean) ** 2, 0) / ws.length);
      const pos = ws.filter(x => x > 0).length;
      return `${name} ${mean >= 0 ? '+' : ''}${mean.toFixed(3)}±${sd.toFixed(3)} (${(pos / ws.length * 100).toFixed(0)}% +)`;
    });
    console.log(`  Coefficients over ${foldWeights.length} fits: ${parts.join(' | ')}`);

    // Pooled calibration for the model: absolute bins, same as prob.js.
    const bins = [
      { lo: 0.00, hi: 0.50, label: '<50%' },
      { lo: 0.50, hi: 0.55, label: '50-55%' },
      { lo: 0.55, hi: 0.60, label: '55-60%' },
      { lo: 0.60, hi: 0.65, label: '60-65%' },
      { lo: 0.65, hi: 0.70, label: '65-70%' },
      { lo: 0.70, hi: 1.01, label: '>=70%' },
    ].map(b => ({ ...b, sumP: 0, sumO: 0, n: 0 }));
    for (const a of perTicker) {
      for (const r of a.rows) {
        const b = bins.find(b => r.model >= b.lo && r.model < b.hi);
        b.sumP += r.model; b.sumO += r.outcome; b.n++;
      }
    }
    console.log(`  Calibration (pooled, model): ` + bins
      .filter(b => b.n > 0)
      .map(b => `${b.label} said ${(b.sumP / b.n * 100).toFixed(0)}→was ${(b.sumO / b.n * 100).toFixed(0)} (n=${b.n})`)
      .join(' | '));
    console.log('');
  }

  if (warnings.length) console.log(`  ${warnings.join('\n  ')}`);
  console.log(`  Caveats:`);
  console.log(`  - Overlapping outcome windows: neighboring days share most of their h-day future,`);
  console.log(`    so the effective sample is ~h times smaller than the row count. Read scoreboard`);
  console.log(`    counts across tickers, not per-ticker decimals.`);
  console.log(`  - Training-slice features restart their warmup inside each fold (the fit API sees`);
  console.log(`    only the slice) — that costs ~200 training rows per fold, and is a data loss,`);
  console.log(`    not a leak. Test-day features warm up on the true full prefix, as live would.`);
  console.log(`  - One model spec, pre-committed (see header). If this scores well, the next step is`);
  console.log(`    suspicion (ablations), not shipping.`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { featureMatrix, fitRidgeLogit, climSeries, HORIZONS };
