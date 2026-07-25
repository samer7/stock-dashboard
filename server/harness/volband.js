// volband.js — is the band we SHOW actually honest?
//
//   node volband.js               # default 18-ticker basket, cached data
//   node volband.js --adjust      # total-return prices
//   flags: --lambda=0.94          EWMA decay (RiskMetrics standard)
//          --horizon=21           trading days in the band (~1 month)
//
// WHAT THIS TESTS, and why it's different from vol.js
//
// vol.js asked "does EWMA ORDER calm months ahead of wild ones?" and answered
// yes (0.59 median rank correlation, beats both baselines 18/18). That is a
// question about ranking. It says nothing about whether the number we print in
// the UI is the right SIZE.
//
// The detail panel shows "expected swing ±X% · typical month", where
// X = daily EWMA vol * sqrt(21) * 100 — one standard deviation over 21 trading
// days (keep in sync with ewmaVol() in server.js). Next to it, the legend and
// docs/research/volatility.md §5.1 both claim "about 2 months in 3 land inside
// the band". THAT claim has never been measured. This script measures it.
//
// Nothing here is fitted: lambda = 0.94 is J.P. Morgan's published constant
// from 1996, and every day's band uses only returns up to that day. So there is
// no in-sample to leak and no need for walk-forward — the same argument vol.js
// makes. This is a measurement, not a search.
//
// METHOD — pre-committed before the first run:
//
//   Sample     every day t with an EWMA value and a resolvable t+horizon, after
//              a 252-day warmup (matching vol.js so the two are comparable).
//   Band       +/- ewma[t] * sqrt(horizon), the exact quantity the UI prints.
//   Realized   the move from close t to close t+horizon. Reported BOTH ways:
//              log (internally consistent with the log-return vol estimate) and
//              simple (what a user actually reads "±7%" as). If those two
//              disagree materially, that is itself a finding worth showing.
//   Headline   NON-OVERLAPPING coverage: every horizon-th day only. Consecutive
//              days share 20 of 21 days of outcome, so overlapping windows are
//              massively autocorrelated and would overstate precision. The
//              overlapping number is printed too, but the non-overlapping one
//              is the one that counts.
//   Also       coverage at +/-2 sigma (normal expectation ~95%) and the median
//              ratio |realized| / band. Together these describe the SHAPE of
//              the miss, not just its direction.
//
// WHAT WOULD CHANGE THE UI (pre-committed):
//   - Pooled non-overlapping 1-sigma coverage inside 63-73%  -> "2 months in 3"
//     stands as written.
//   - Outside that range -> the UI wording changes to the measured frequency.
//     We do NOT change the estimator to hit a target; we change the sentence to
//     match what the estimator actually does.
//
// A NOTE ON THE DIGEST'S STATED DIAGNOSIS. volatility.md §5.1 says a miss would
// mean coverage "far more often" outside the band, with fat tails as the first
// suspect. Worth flagging before seeing the numbers: for a symmetric fat-tailed
// distribution, +/-1 sigma usually OVER-covers, because rare extremes inflate
// sigma while most mass sits nearer zero. So "fat tails" predicts too MANY
// months inside the band, not too few. If this run shows over-coverage, the
// digest's diagnosis needs correcting, not just its number.

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');
const { logReturns, ewmaVolSeries, DEFAULT_BASKET } = require('./vol');

function analyzeTicker(history, { lambda, horizon }) {
  const closes = history.days.map(d => d.close);
  const returns = logReturns(closes);
  const ewma = ewmaVolSeries(returns, lambda);
  const scale = Math.sqrt(horizon);

  const rows = [];
  for (let i = 252; i < returns.length - horizon; i++) {
    if (ewma[i] === null) continue;
    const band = ewma[i] * scale;              // 1 sigma over the horizon
    // returns[i] is the return INTO close i, so close i is closes[i].
    const p0 = closes[i], p1 = closes[i + horizon];
    if (!(p0 > 0) || !(p1 > 0)) continue;
    rows.push({
      i,
      band,
      log: Math.log(p1 / p0),
      simple: p1 / p0 - 1,
    });
  }
  if (!rows.length) return null;

  const cover = (subset, mult, key) =>
    subset.filter(r => Math.abs(r[key]) <= r.band * mult).length / subset.length * 100;

  // Non-overlapping: one row per horizon, so no two outcomes share a day.
  const nonOv = rows.filter((_, k) => k % horizon === 0);
  const ratios = nonOv.map(r => Math.abs(r.log) / r.band).sort((a, b) => a - b);

  return {
    ticker: history.ticker,
    n: rows.length,
    nNonOv: nonOv.length,
    cov1Log: cover(nonOv, 1, 'log'),
    cov1Simple: cover(nonOv, 1, 'simple'),
    cov1LogOverlap: cover(rows, 1, 'log'),
    cov2Log: cover(nonOv, 2, 'log'),
    medRatio: ratios[Math.floor(ratios.length / 2)],
    rowsNonOv: nonOv,
  };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const adjusted = rawArgs.includes('--adjust');
  const flag = (name, def) => {
    const hit = rawArgs.find(a => a.startsWith(`--${name}=`));
    return hit ? parseFloat(hit.split('=')[1]) : def;
  };
  const lambda = flag('lambda', 0.94);
  const horizon = flag('horizon', 21);
  const basket = rawArgs.filter(a => !a.startsWith('--'));
  const tickers = basket.length ? basket : DEFAULT_BASKET;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const results = [];
  const warnings = [];
  for (const t of tickers) {
    const cached = isCached(t, adjusted);
    const h = await loadWithThrottle(t, adjusted);
    const stale = stalenessWarning(h);
    if (stale) warnings.push(stale);
    const r = analyzeTicker(h, { lambda, horizon });
    if (r) results.push(r);
    process.stderr.write(`  ${t} done${cached ? ' (cached)' : ''}\n`);
    if (!cached) await sleep(8500);
  }

  console.log(`\n=== Is the displayed band honest? EWMA(lambda=${lambda}) +/-1 sigma over ${horizon} trading days ===`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN' : 'split-adjusted only (--adjust for total return)'}.`);
  console.log(`Claim under test: "about 2 months in 3 (~68%) land inside the band".`);
  console.log(`Headline = NON-OVERLAPPING samples (every ${horizon}th day); overlapping shown for contrast.\n`);

  console.log('ticker    n(non-ov)   inside1sig(log)  (simple)   overlapping   inside2sig   med|move|/band');
  console.log('-'.repeat(96));
  for (const r of results) {
    console.log(
      r.ticker.padEnd(9) +
      String(r.nNonOv).padStart(9) +
      (r.cov1Log.toFixed(1) + '%').padStart(17) +
      (r.cov1Simple.toFixed(1) + '%').padStart(10) +
      (r.cov1LogOverlap.toFixed(1) + '%').padStart(14) +
      (r.cov2Log.toFixed(1) + '%').padStart(13) +
      r.medRatio.toFixed(2).padStart(16));
  }

  // Pooled across every non-overlapping sample from every ticker.
  const all = results.flatMap(r => r.rowsNonOv);
  const pooled = (mult, key) =>
    all.filter(r => Math.abs(r[key]) <= r.band * mult).length / all.length * 100;
  const p1 = pooled(1, 'log'), p1s = pooled(1, 'simple'), p2 = pooled(2, 'log');
  const med = results.map(r => r.cov1Log).sort((a, b) => a - b)[Math.floor(results.length / 2)];

  console.log('-'.repeat(96));
  console.log(`\nPOOLED (${all.length} non-overlapping ticker-months across ${results.length} tickers):`);
  console.log(`  inside +/-1 sigma:  ${p1.toFixed(1)}% (log)   ${p1s.toFixed(1)}% (simple)   [normal theory: 68.3%]`);
  console.log(`  inside +/-2 sigma:  ${p2.toFixed(1)}%                        [normal theory: 95.4%]`);
  console.log(`  per-ticker median:  ${med.toFixed(1)}%   range ${Math.min(...results.map(r => r.cov1Log)).toFixed(1)}%-${Math.max(...results.map(r => r.cov1Log)).toFixed(1)}%`);

  // Pre-committed verdict.
  const inRange = p1 >= 63 && p1 <= 73;
  console.log(`\nVERDICT (rule pre-committed in this file's header):`);
  if (inRange) {
    console.log(`  Coverage ${p1.toFixed(1)}% is inside the 63-73% band. "About 2 months in 3" stands as written.`);
  } else {
    const inN = (100 / p1);
    console.log(`  Coverage ${p1.toFixed(1)}% is OUTSIDE the 63-73% band, so the UI sentence must change`);
    console.log(`  to match: roughly ${p1.toFixed(0)} months in 100, i.e. about 1 in ${inN.toFixed(1)}.`);
    console.log(`  The estimator is NOT retuned to hit 68% — the sentence changes, not the math.`);
  }
  const tailNote = p2 >= 95.4
    ? `  +/-2 sigma covers ${p2.toFixed(1)}% (>= normal's 95.4%) — consistent with a peaked centre.`
    : `  +/-2 sigma covers ${p2.toFixed(1)}% (< normal's 95.4%) — genuine fat tails in the extremes.`;
  console.log(tailNote);

  if (warnings.length) {
    console.log('\nSTALE DATA WARNINGS:');
    for (const w of warnings) console.log('  ' + w);
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { analyzeTicker };
