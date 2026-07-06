// rsievent.js — the RSI(14) 30-recross event test, exactly as specced in
// docs/research/rsi-macd.md §6 check #2 (with the check #3 subperiod split).
//
//   node rsievent.js              # default 18-ticker basket, cached data
//   node rsievent.js AAPL MSFT    # custom basket
//   flags: --adjust               total-return prices (dividends reinvested)
//
// The hypothesis under test is REVERSAL, not trend: after RSI(14) has been
// below 30 ("oversold") and crosses back UP through it, does the price rise
// over the next week/month more often — or by more — than after any random
// day? The post-2000 large-cap literature (digest §3) predicts no.
//
// Deliberately an EVENT test, not a strategy backtest: a recross is a moment,
// not an in/out state, so there is no equity curve, no costs, no Sharpe —
// just forward returns from the event days versus two nulls:
//   1. the any-day base rate / any-day average return over the same period
//      (computed by transitionStats, which sees each recross as a flip→BUY
//      because the pseudo-signal below is BUY only on recross days), and
//   2. a matched-random baseline: 1000 trials that each draw the SAME NUMBER
//      of random days per ticker and pool them the same way — where does the
//      real events' pooled average land in that distribution?
// Only if a 1w/1m bump beats both nulls, survives --adjust, AND doesn't
// evaporate in the 2017+ half does the digest allow speccing a tradable rule.

const { loadWithThrottle, isCached, stalenessWarning } = require('./data');
const { rsiSeries } = require('./strategies');
const { transitionStats, mulberry32, HORIZONS } = require('./backtest');

// Same basket as sweep.js — same survivorship caveat. Note digest check #4:
// mega-caps are where the reversal literature says the effect is WEAKEST, so
// a null here closes the question for THIS dashboard, not for RSI everywhere.
const DEFAULT_BASKET = [
  'SPY', 'QQQ', 'IWM',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
  'KO', 'PG', 'JNJ', 'JPM', 'XOM',
  'INTC', 'T', 'F', 'BA', 'PFE',
];

const LEVEL = 14;            // RSI period — matches the dashboard's RSI(14)
const OVERSOLD = 30;         // Wilder's classic oversold line
const SPLIT_DATE = '2017-01-01'; // check #3: Khandani & Lo predict any edge shrinks after this

// The pseudo-signal that lets transitionStats do all the work: 'BUY' only on
// the recross day itself (RSI was < 30 yesterday, ≥ 30 today), 'HOLD' on
// every other defined day. Every recross is then a flip→BUY, and the HOLD
// days supply the any-day base rates over exactly the same span.
function recrossSignals(closes) {
  const rsi = rsiSeries(closes, LEVEL);
  return closes.map((_, i) => {
    if (i === 0 || rsi[i] === null || rsi[i - 1] === null) return null;
    return rsi[i - 1] < OVERSOLD && rsi[i] >= OVERSOLD ? 'BUY' : 'HOLD';
  });
}

// Pool transitionStats rows across tickers, one accumulator per horizon.
function poolInto(pool, stats) {
  stats.forEach((t, h) => {
    const p = pool[h] || (pool[h] = { label: t.label, days: t.days, buyFlips: 0, buyUps: 0, buyRetSum: 0, allDays: 0, allUps: 0, allRetSum: 0 });
    p.buyFlips += t.buyFlips; p.buyUps += t.buyUps; p.buyRetSum += t.buyRetSum;
    p.allDays += t.allDays; p.allUps += t.allUps; p.allRetSum += t.allRetSum;
  });
}

// Matched-random baseline, pooled: each trial draws, per ticker, as many
// random defined days as that ticker had real recrosses (drawn with
// replacement — the real events cluster inside crashes, which no uniform
// draw can mimic, so this null is "same N, random timing"), then pools the
// forward returns exactly like the real events. Returns the sorted array of
// 1000 pooled average returns per horizon. Seeded — same answer every run.
function matchedRandom(perTicker, horizonIdx, trials = 1000) {
  const { days } = HORIZONS[horizonIdx];
  const rand = mulberry32(1234 + horizonIdx);
  // Per ticker: forward returns of every day transitionStats would count.
  const universes = perTicker.map(({ closes, signals, events }) => {
    const rets = [];
    for (let i = 1; i < closes.length - days; i++) {
      if (signals[i] === null || signals[i - 1] === null) continue;
      rets.push(closes[i + days] / closes[i] - 1);
    }
    return { rets, n: events[horizonIdx] };
  });
  const finals = [];
  for (let t = 0; t < trials; t++) {
    let sum = 0, n = 0;
    for (const u of universes) {
      for (let k = 0; k < u.n; k++) {
        sum += u.rets[Math.floor(rand() * u.rets.length)];
        n++;
      }
    }
    finals.push(n ? sum / n : 0);
  }
  return finals.sort((a, b) => a - b);
}

const pct = (x, d = 1) => (x === null || x === undefined ? '  n/a' : ((x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%'));

function report(title, pool) {
  console.log(`\n  ${title}`);
  console.log(`    ${'horizon'.padEnd(10)}${'events'.padStart(7)}${'up-rate'.padStart(9)}${'base'.padStart(8)}${'avg fwd'.padStart(9)}${'any-day'.padStart(9)}`);
  for (const p of pool) {
    const upRate = p.buyFlips ? p.buyUps / p.buyFlips : null;
    const base = p.allDays ? p.allUps / p.allDays : null;
    const avg = p.buyFlips ? p.buyRetSum / p.buyFlips : null;
    const anyDay = p.allDays ? p.allRetSum / p.allDays : null;
    console.log(
      `    ${p.label.padEnd(10)}${String(p.buyFlips).padStart(7)}` +
      `${(upRate === null ? 'n/a' : (upRate * 100).toFixed(1) + '%').padStart(9)}` +
      `${(base === null ? 'n/a' : (base * 100).toFixed(1) + '%').padStart(8)}` +
      `${pct(avg).padStart(9)}${pct(anyDay).padStart(9)}`
    );
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const adjusted = rawArgs.includes('--adjust');
  const basket = rawArgs.filter(a => !a.startsWith('--')).map(t => t.toUpperCase());
  const tickers = basket.length ? basket : DEFAULT_BASKET;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const perTicker = [];
  const warnings = [];
  let oversoldDays = 0, definedDays = 0;

  for (const t of tickers) {
    const cached = isCached(t, adjusted);
    const h = await loadWithThrottle(t, adjusted);
    const stale = stalenessWarning(h);
    if (stale) warnings.push(stale);

    const closes = h.days.map(d => d.close);
    const dates = h.days.map(d => d.date);
    const signals = recrossSignals(closes);
    const rsi = rsiSeries(closes, LEVEL);
    for (const v of rsi) { if (v !== null) { definedDays++; if (v < OVERSOLD) oversoldDays++; } }

    const stats = transitionStats(closes, signals);
    // Real event count per horizon (shrinks slightly at long horizons — an
    // event within `days` of the series end has no forward window to score).
    const events = stats.map(s => s.buyFlips);
    perTicker.push({ ticker: t, closes, dates, signals, stats, events });
    process.stderr.write(`  ${t} loaded (${closes.length} days${cached ? ', cached' : ''}) — ${events[0]} recrosses\n`);
    if (!cached) await sleep(8500);
  }

  // ---------- full-period pool + matched-random ----------
  const poolFull = [];
  for (const pt of perTicker) poolInto(poolFull, pt.stats);

  // ---------- subperiod split (check #3) ----------
  // Signals are computed on the FULL series (so RSI is warmed up everywhere),
  // then closes+signals are sliced at the boundary. Events in the first slice
  // whose forward window crosses the boundary are dropped by transitionStats'
  // own end-of-series guard — standard, and keeps the halves non-overlapping.
  const poolEarly = [], poolLate = [];
  for (const pt of perTicker) {
    const k = pt.dates.findIndex(d => d >= SPLIT_DATE);
    if (k === -1) { poolInto(poolEarly, pt.stats); continue; }
    poolInto(poolEarly, transitionStats(pt.closes.slice(0, k), pt.signals.slice(0, k)));
    poolInto(poolLate, transitionStats(pt.closes.slice(k), pt.signals.slice(k)));
  }

  // ---------- report ----------
  console.log(`\n=== RSI(${LEVEL}) ${OVERSOLD}-recross event test — ${perTicker.length} tickers, pooled ===`);
  console.log(`Prices: ${adjusted ? 'TOTAL RETURN (dividends reinvested)' : 'split-adjusted only — dividends excluded (--adjust for total return)'}`);
  console.log(`Event: RSI(${LEVEL}) < ${OVERSOLD} yesterday, ≥ ${OVERSOLD} today. Forward returns from the event day's close.`);
  console.log(`Oversold is rare here: RSI < ${OVERSOLD} on ${(oversoldDays / definedDays * 100).toFixed(1)}% of ${definedDays.toLocaleString('en-US')} pooled ticker-days.`);

  report('Full period:', poolFull);

  console.log(`\n  vs 1000 matched-random draws (same event count per ticker, random days):`);
  poolFull.forEach((p, h) => {
    if (!p.buyFlips) return;
    const finals = matchedRandom(perTicker, h);
    const actual = p.buyRetSum / p.buyFlips;
    let below = 0;
    for (const f of finals) if (f < actual) below++;
    console.log(`    ${p.label.padEnd(10)} events' avg fwd return beats ${(below / finals.length * 100).toFixed(0)}% of random draws`);
  });

  report(`Subperiod ${perTicker[0]?.dates[0]?.slice(0, 4) ?? ''}–2016 (reversal era per Khandani & Lo):`, poolEarly);
  report(`Subperiod 2017+ (edge should be gone):`, poolLate);

  if (warnings.length) console.log(`\n  ${warnings.join('\n  ')}`);
  console.log(`\n  How to read this: an edge needs the up-rate ABOVE base, the avg forward return`);
  console.log(`  ABOVE any-day, a high matched-random percentile, at BOTH 1w and 1m, in BOTH`);
  console.log(`  subperiods, on --adjust too. Events cluster inside crashes (all ${LEVEL}+ oversold`);
  console.log(`  spells resolve in the same few windows), so the effective sample is far smaller`);
  console.log(`  than the event count — treat small gaps as noise.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
