// vol.js — the Phase 5b opening question: is VOLATILITY actually forecastable
// on our data, the way the literature says it is?
//
//   node vol.js               # default 18-ticker basket, cached data
//   node vol.js --adjust      # total-return prices
//   flags: --lambda=0.94      EWMA decay (RiskMetrics standard)
//          --horizon=21       forecast horizon in trading days (~1 month)
//
// Why this test exists: every directional test this project has run came back
// "no information" — price DIRECTION is close to unpredictable. The academic
// literature agrees, but makes one big exception: volatility. Calm days
// cluster, wild days cluster (Mandelbrot 1963; Engle's ARCH work), so "how
// bumpy will the next month be?" should be genuinely forecastable even though
// "up or down?" is not. This script measures whether that holds here, BEFORE
// any volatility number reaches the UI.
//
// The forecaster under test is EWMA variance with lambda = 0.94 — the
// RiskMetrics (1996) standard:  var_t = lambda*var_{t-1} + (1-lambda)*r_t^2.
// Nothing is fitted to our data (lambda is a published constant chosen by
// J.P. Morgan three decades ago), so this does NOT need walk-forward — there
// is no in-sample to leak. Each day's forecast uses only returns through that
// day; it is then scored against the REALIZED volatility of the next
// `horizon` trading days.
//
// Two honest baselines, so "it works" means "it beats knowing nothing":
//   - climatology: the ticker's average volatility so far (expanding window —
//     no lookahead). The "volatility is always about its usual level" forecast.
//   - persistence: the last `horizon` days' realized volatility. The "next
//     month will be like last month" forecast — the naive cousin EWMA must beat
//     (or at least match) to justify its extra machinery.
//
// Scoring: mean absolute error in annualized vol points, Spearman rank
// correlation (does the forecast ORDER calm vs wild months correctly?), and a
// decile calibration table (when the forecast said "calmest tenth of days",
// what was the realized vol — does realized rise monotonically with forecast?).
// Overlapping windows make neighboring samples heavily autocorrelated, so the
// effective sample is ~horizon-times smaller than the row count; the report
// says so.

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');

const DEFAULT_BASKET = [
  'SPY', 'QQQ', 'IWM',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
  'KO', 'PG', 'JNJ', 'JPM', 'XOM',
  'INTC', 'T', 'F', 'BA', 'PFE',
];

const ANN = Math.sqrt(252); // daily vol -> annualized

// Daily log returns (log so that vol math composes cleanly across days).
function logReturns(closes) {
  const r = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) r[i] = Math.log(closes[i] / closes[i - 1]);
  return r;
}

// EWMA daily volatility series: out[i] is the forecast of NEXT-day vol using
// returns through day i. Seeded with the plain variance of the first 63
// returns (a quarter), then rolled forward.
function ewmaVolSeries(returns, lambda) {
  const out = new Array(returns.length).fill(null);
  const seedN = 63;
  if (returns.length < seedN + 2) return out;
  let variance = 0;
  for (let i = 1; i <= seedN; i++) variance += returns[i] * returns[i];
  variance /= seedN;
  out[seedN] = Math.sqrt(variance);
  for (let i = seedN + 1; i < returns.length; i++) {
    variance = lambda * variance + (1 - lambda) * returns[i] * returns[i];
    out[i] = Math.sqrt(variance);
  }
  return out;
}

// Realized daily vol over returns[from..to] (inclusive), zero-mean convention
// (standard in the vol literature — daily means are noise at this scale).
function realizedVol(returns, from, to) {
  let sum = 0, n = 0;
  for (let i = from; i <= to; i++) { sum += returns[i] * returns[i]; n++; }
  return Math.sqrt(sum / n);
}

// Spearman rank correlation: correlation of the RANKS, so it measures "does
// the forecast order the months correctly?" without assuming a linear
// relationship. Average-rank tie handling.
function spearman(xs, ys) {
  const rank = (arr) => {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

function analyzeTicker(history, { lambda, horizon }) {
  const closes = history.days.map(d => d.close);
  const returns = logReturns(closes);
  const ewma = ewmaVolSeries(returns, lambda);

  // Build (forecast, realized) pairs plus both baselines, one per day.
  // Start after a 252-day warmup so the expanding climatology has a real
  // history behind it; stop `horizon` days before the end.
  const rows = [];
  let climSum = 0, climN = 0; // expanding sum of squared returns for climatology
  for (let i = 1; i < returns.length; i++) {
    if (i >= 252 && i < returns.length - horizon && ewma[i] !== null) {
      rows.push({
        forecast: ewma[i] * ANN,
        clim: Math.sqrt(climSum / climN) * ANN,
        persist: realizedVol(returns, i - horizon + 1, i) * ANN,
        realized: realizedVol(returns, i + 1, i + horizon) * ANN,
      });
    }
    climSum += returns[i] * returns[i]; climN++; // update AFTER use: no lookahead
  }

  const mae = (key) => rows.reduce((s, r) => s + Math.abs(r[key] - r.realized), 0) / rows.length;
  return {
    ticker: history.ticker,
    n: rows.length,
    corr: spearman(rows.map(r => r.forecast), rows.map(r => r.realized)),
    corrPersist: spearman(rows.map(r => r.persist), rows.map(r => r.realized)),
    maeEwma: mae('forecast'),
    maeClim: mae('clim'),
    maePersist: mae('persist'),
    rows, // kept for the pooled decile table
  };
}

const pctPt = (x, d = 1) => (x * 100).toFixed(d);

async function main() {
  const rawArgs = process.argv.slice(2);
  const adjusted = rawArgs.includes('--adjust');
  const get = (name, dflt) => {
    const a = rawArgs.find(s => s.startsWith(`--${name}=`));
    return a ? parseFloat(a.split('=')[1]) : dflt;
  };
  const lambda = get('lambda', 0.94);
  const horizon = get('horizon', 21);
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
    results.push(analyzeTicker(h, { lambda, horizon }));
    process.stderr.write(`  ${t} done${cached ? ' (cached)' : ''}\n`);
    if (!cached) await sleep(8500);
  }

  console.log(`\n=== Volatility forecastability — EWMA(lambda=${lambda}) vs the next ${horizon} trading days ===`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN' : 'split-adjusted only (--adjust for total return)'}. All vols annualized.`);
  console.log(`Baselines: climatology = expanding average vol (knows nothing recent);`);
  console.log(`           persistence = last ${horizon} days' realized vol (naive "same as last month").\n`);

  console.log(
    `  ${'ticker'.padEnd(7)}${'days'.padStart(6)}${'rank corr'.padStart(10)}${'(persist)'.padStart(10)}` +
    `${'MAE ewma'.padStart(10)}${'MAE clim'.padStart(10)}${'MAE persist'.padStart(12)}`
  );
  for (const a of results) {
    console.log(
      `  ${a.ticker.padEnd(7)}${String(a.n).padStart(6)}${a.corr.toFixed(2).padStart(10)}${a.corrPersist.toFixed(2).padStart(10)}` +
      `${(pctPt(a.maeEwma) + 'pp').padStart(10)}${(pctPt(a.maeClim) + 'pp').padStart(10)}${(pctPt(a.maePersist) + 'pp').padStart(12)}`
    );
  }

  const n = results.length;
  const medCorr = results.map(a => a.corr).sort((x, y) => x - y)[Math.floor(n / 2)];
  const beatClim = results.filter(a => a.maeEwma < a.maeClim).length;
  const beatPersist = results.filter(a => a.maeEwma < a.maePersist).length;
  console.log(`\n  Scoreboard (${n} tickers):`);
  console.log(`    median rank correlation, forecast vs realized: ${medCorr.toFixed(2)}  (0 = knows nothing; directional signals scored ~0.00)`);
  console.log(`    EWMA beats climatology on MAE:  ${beatClim}/${n}`);
  console.log(`    EWMA beats persistence on MAE:  ${beatPersist}/${n}`);

  // Pooled decile calibration: per ticker, split ITS OWN forecasts into
  // deciles (avoids "NVDA is just wilder than KO" leaking across tickers),
  // then pool: median realized vol per forecast decile. If volatility is
  // forecastable, realized should rise monotonically down the table.
  const perDecile = Array.from({ length: 10 }, () => []);
  for (const a of results) {
    const sorted = a.rows.map(r => r.forecast).sort((x, y) => x - y);
    // Decile cutoffs for THIS ticker's forecasts; a row lands in the first
    // decile whose cutoff its forecast doesn't exceed.
    const cuts = Array.from({ length: 9 }, (_, k) => sorted[Math.floor(((k + 1) * sorted.length) / 10)]);
    for (const r of a.rows) {
      let d = 0;
      while (d < 9 && r.forecast >= cuts[d]) d++;
      perDecile[d].push(r.realized);
    }
  }
  console.log(`\n  Calibration by forecast decile (pooled; each ticker ranked against itself):`);
  console.log(`    ${'forecast decile'.padEnd(18)}${'median realized vol'.padStart(21)}${'(n)'.padStart(9)}`);
  const dLabels = ['1 (calmest)', '2', '3', '4', '5', '6', '7', '8', '9', '10 (wildest)'];
  perDecile.forEach((xs, d) => {
    const med = xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    console.log(`    ${dLabels[d].padEnd(18)}${(pctPt(med) + '%').padStart(21)}${String(xs.length).padStart(9)}`);
  });

  if (warnings.length) console.log(`\n  ${warnings.join('\n  ')}`);
  console.log(`\n  Caveats:`);
  console.log(`  - Overlapping ${horizon}-day windows: neighboring rows share ${horizon - 1} days, so the`);
  console.log(`    effective sample is ~${horizon}x smaller than the day count. The rank correlation is`);
  console.log(`    still honest; confidence in small MAE differences is not.`);
  console.log(`  - Forecastable bumpiness is NOT forecastable direction: none of this says which way`);
  console.log(`    the price goes — that question scored zero in every test this project has run.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
