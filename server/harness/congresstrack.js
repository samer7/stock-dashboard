// congresstrack.js — Phase 5e: per-member congressional track records, with
// every guardrail from docs/research/congressional-trading.md §6 built in.
//
//   node congresstrack.js               # full corpus, cached data
//   flags: --minbuys=20     minimum scored buys before a member gets a row
//          --trials=1000    matched-random trials per member (seeded)
//          --seed=42
//          --maxfetch=600   cap on NEW price fetches this run (Twelve Data
//                           free tier is ~800 credits/day; cached tickers are
//                           free). Unpriced trades are counted, not hidden.
//          --export         print the CONGRESS_RECORDS constant for index.html
//
// METHOD — pre-committed before the first run (per the digest, whose §6 was
// itself written before any of this data was collected):
//
//   Clock     starts at the DISCLOSURE date (the PTR's filing date from the
//             Clerk's index) — the first day an outsider could know. Entry at
//             the first trading close STRICTLY AFTER the filing date (the
//             harness's usual next-day discipline); trades whose entry lands
//             more than 10 calendar days after filing are unscoreable (data
//             gap: delisted, halted, or pre-IPO data) and are COUNTED as such.
//   Horizons  1m/3m/6m/12m = 21/63/126/252 trading days. 6m is the ranking
//             horizon (the literature's focal point; Belmont et al. find
//             House buys ~ -26bps there).
//   Score     excess return = ticker's h-day return minus SPY's h-day return
//             from the same entry date (both total-return series). Equal
//             weight per trade — PTR dollar bands are too wide for anything
//             else (stated in the UI).
//   Aggregate FIRST: pooled buys (and sells, diagnostic) across all members —
//             the robust, literature-comparable stat. Per-member rows are the
//             transparency layer under it.
//   Baseline  per member: 1000 matched-random portfolios — same tickers, same
//             trade count, entry dates drawn uniformly from that ticker's
//             eligible days inside the corpus window (2014+, resolvable at
//             the ranking horizon), seeded mulberry32. The member's score is
//             the percentile of their actual mean excess in that null.
//   Best-of-N per trial, the max mean-excess across all qualifying members —
//             the actual best member is judged against the distribution of
//             those maxima (the White/Sullivan reality-check logic): with N
//             members someone HAS to top the leaderboard.
//   Split     rank members on buys disclosed before the corpus's median
//             disclosure date, then re-score the in-sample top decile on the
//             second half (>=20 scored buys in each half to qualify).
//
// SHIP RULE (pre-committed): 5e is a transparency feature — per-member rows
// ship REGARDLESS of whether anyone "wins," but only under these conditions:
// every displayed record carries its luck percentile; no row under
// --minbuys scored buys; the UI states the coverage honestly (unpriced
// trades, skipped scanned PTRs, equal-weight caveat). Any "this member shows
// skill" framing requires BOTH the best-of-N test and the split-sample test
// to pass — the literature predicts neither will.

const { loadWithThrottle, isCached } = require('./data');
const { loadCorpus } = require('./congressdata');
const { mulberry32 } = require('./backtest');
const fs = require('fs');
const path = require('path');

const HORIZONS = [
  { label: '1m', days: 21 },
  { label: '3m', days: 63 },
  { label: '6m', days: 126 },
  { label: '12m', days: 252 },
];
const RANK_DAYS = 126; // 6m — the pre-committed ranking horizon
const CORPUS_START = '2014-01-01';
const MISSING_FILE = path.join(__dirname, 'cache', 'congress', 'missing-tickers.json');

// Negative cache: tickers Twelve Data has no data for (delisted, foreign,
// mutual-fund symbols). Remembering failures keeps reruns free and
// deterministic; delete the file to retry them.
function loadMissing() {
  try { return new Set(JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function saveMissing(set) {
  fs.mkdirSync(path.dirname(MISSING_FILE), { recursive: true });
  fs.writeFileSync(MISSING_FILE, JSON.stringify([...set].sort()));
}

// First index whose date is strictly after `dateIso`, or -1.
function firstIndexAfter(dates, dateIso) {
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= dateIso) lo = mid + 1; else hi = mid;
  }
  return lo < dates.length ? lo : -1;
}

// First index whose date is at or after `dateIso`, or -1 (lower bound).
function firstIndexAtOrAfter(dates, dateIso) {
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < dateIso) lo = mid + 1; else hi = mid;
  }
  return lo < dates.length ? lo : -1;
}

const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

async function main() {
  const rawArgs = process.argv.slice(2);
  const flag = (name, dflt) => {
    const a = rawArgs.find(s => s.startsWith(`--${name}=`));
    return a ? parseFloat(a.split('=')[1]) : dflt;
  };
  const minBuys = flag('minbuys', 20);
  const trials = flag('trials', 1000);
  const seed = flag('seed', 42);
  const maxFetch = flag('maxfetch', 600);
  const doExport = rawArgs.includes('--export');

  // ---- 1. Corpus ----
  const { trades, stats } = await loadCorpus();
  const scannedSkipped = stats.years.reduce((s, y) => s + (y.filings - y.parsed), 0);

  // ---- 2. Prices: cached tickers free; new fetches by trade count, capped ----
  const counts = new Map();
  for (const t of trades) counts.set(t.ticker, (counts.get(t.ticker) || 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const missing = loadMissing();
  const prices = new Map(); // ticker -> {dates, closes, dateIdx}
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let fetched = 0;
  const spy = await loadWithThrottle('SPY', true);
  for (const [ticker] of byCount) {
    if (missing.has(ticker)) continue;
    const cached = isCached(ticker, true);
    if (!cached && fetched >= maxFetch) continue;
    try {
      const h = await loadWithThrottle(ticker, true);
      prices.set(ticker, { dates: h.days.map(d => d.date), closes: h.days.map(d => d.close) });
    } catch {
      missing.add(ticker);
      saveMissing(missing);
    }
    if (!cached) {
      fetched++;
      if (fetched % 25 === 0) process.stderr.write(`  prices: ${fetched} new fetches (${prices.size} tickers loaded)\n`);
      await sleep(8500);
    }
  }
  const spyDates = spy.days.map(d => d.date);
  const spyCloses = spy.days.map(d => d.close);

  // ---- 3. Score every trade ----
  // A scored trade: entry index in its ticker + SPY entry index + per-horizon
  // excess returns (null where unresolved). Unscoreable reasons are tallied.
  const scored = [];
  const unscoreable = { noPrices: 0, dataGap: 0 };
  for (const t of trades) {
    const p = prices.get(t.ticker);
    if (!p) { unscoreable.noPrices++; continue; }
    const ei = firstIndexAfter(p.dates, t.filed);
    if (ei === -1 || daysBetween(t.filed, p.dates[ei]) > 10) { unscoreable.dataGap++; continue; }
    const si = firstIndexAfter(spyDates, t.filed);
    if (si === -1) { unscoreable.dataGap++; continue; }
    const excess = {};
    for (const { label, days } of HORIZONS) {
      if (ei + days < p.dates.length && si + days < spyDates.length) {
        excess[label] = (p.closes[ei + days] / p.closes[ei] - 1) - (spyCloses[si + days] / spyCloses[si] - 1);
      } else {
        excess[label] = null;
      }
    }
    scored.push({ ...t, excess });
  }

  // ---- 4. Pooled aggregate (the headline) ----
  console.log(`\n=== Congressional track records (Phase 5e) — machine-readable House PTRs, 2014–2026 ===`);
  console.log(`Corpus: ${stats.total} deduped trades from ${new Set(trades.map(t => t.member)).size} members ` +
    `(${stats.dupesRemoved} amendment dupes removed; ${scannedSkipped} scanned/unfetchable PTRs skipped).`);
  console.log(`Scored: ${scored.length}/${trades.length} trades (${(scored.length / trades.length * 100).toFixed(0)}%). ` +
    `Unscoreable: ${unscoreable.noPrices} no price data (delisted/foreign/fund symbols), ${unscoreable.dataGap} data-gap.`);
  console.log(`Clock: entry at first close AFTER the disclosure (filing) date; excess vs SPY, total-return, equal-weight per trade.\n`);

  const pool = (type, label) => {
    const xs = scored.filter(s => s.type === type && s.excess[label] !== null).map(s => s.excess[label]);
    if (!xs.length) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const pos = xs.filter(x => x > 0).length / xs.length;
    return { n: xs.length, mean, pos };
  };
  console.log(`  Pooled (excess vs SPY):`);
  for (const type of ['Buy', 'Sell']) {
    const parts = HORIZONS.map(({ label }) => {
      const p = pool(type, label);
      return p ? `${label} ${(p.mean * 100).toFixed(2)}% (n=${p.n}, ${(p.pos * 100).toFixed(0)}% +)` : `${label} —`;
    });
    console.log(`    ${type.padEnd(5)} ${parts.join(' | ')}`);
  }
  console.log(`    (Belmont et al. 2022 predict buys ≈ -0.26% at 6m; a big positive here means CHECK FOR BUGS first.)\n`);

  // ---- 5. Per-member records at the ranking horizon ----
  const byMember = new Map();
  const keyOf = new Map(); // display name -> normalized memberKey (for export)
  for (const s of scored) {
    if (s.type !== 'Buy' || s.excess['6m'] === null) continue;
    if (!byMember.has(s.member)) byMember.set(s.member, []);
    byMember.get(s.member).push(s);
    keyOf.set(s.member, s.memberKey);
  }
  const qualifying = [...byMember.entries()]
    .filter(([, arr]) => arr.length >= minBuys)
    .map(([member, arr]) => ({
      member,
      n: arr.length,
      trades: arr,
      mean: arr.reduce((a, s) => a + s.excess['6m'], 0) / arr.length,
    }))
    .sort((a, b) => b.mean - a.mean);

  // Eligible random-entry days per ticker: inside the corpus era, resolvable
  // at the ranking horizon. Precomputed once.
  const eligible = new Map();
  for (const [ticker, p] of prices) {
    const startIdx = firstIndexAtOrAfter(p.dates, CORPUS_START);
    const endIdx = p.dates.length - RANK_DAYS - 1;
    if (startIdx !== -1 && endIdx > startIdx) eligible.set(ticker, { startIdx, endIdx });
  }

  // Matched-random trials: same tickers, same count, random disclosure-era
  // entry days. SPY is aligned to the random entry's calendar date. One RNG
  // for everything -> reproducible.
  const rand = mulberry32(seed);
  const trialMeansByMember = new Map(); // member -> Float64Array(trials)
  for (const q of qualifying) {
    const means = new Float64Array(trials);
    for (let tr = 0; tr < trials; tr++) {
      let sum = 0, n = 0;
      for (const s of q.trades) {
        const el = eligible.get(s.ticker);
        if (!el) continue;
        const p = prices.get(s.ticker);
        const idx = el.startIdx + Math.floor(rand() * (el.endIdx - el.startIdx + 1));
        const sEntry = firstIndexAtOrAfter(spyDates, p.dates[idx]);
        if (sEntry === -1 || sEntry + RANK_DAYS >= spyDates.length || idx + RANK_DAYS >= p.dates.length) continue;
        sum += (p.closes[idx + RANK_DAYS] / p.closes[idx] - 1) - (spyCloses[sEntry + RANK_DAYS] / spyCloses[sEntry] - 1);
        n++;
      }
      means[tr] = n ? sum / n : 0;
    }
    trialMeansByMember.set(q.member, means);
  }
  const pctlOf = (means, value) => {
    let below = 0;
    for (const m of means) if (m < value) below++;
    return Math.round((below / means.length) * 100);
  };

  console.log(`  Per-member records (>=${minBuys} scored buys at 6m; percentile = vs ${trials} matched-random portfolios,`);
  console.log(`  same tickers + same trade count at random ${CORPUS_START.slice(0, 4)}+ dates; 50 = pure luck):`);
  console.log(`  ${'member'.padEnd(30)}${'buys'.padStart(6)}${'6m excess'.padStart(11)}${'pctl'.padStart(6)}`);
  const records = [];
  for (const q of qualifying) {
    const pctl = pctlOf(trialMeansByMember.get(q.member), q.mean);
    records.push({ member: q.member, n: q.n, mean: q.mean, pctl });
    console.log(`  ${q.member.padEnd(30)}${String(q.n).padStart(6)}${((q.mean >= 0 ? '+' : '') + (q.mean * 100).toFixed(2) + '%').padStart(11)}${String(pctl).padStart(6)}`);
  }
  const luckyN = records.filter(r => r.pctl >= 95).length;
  console.log(`  ${records.length} members qualify; ${luckyN} score >=95th percentile ` +
    `(chance alone predicts ~${Math.round(records.length * 0.05)}).\n`);

  // ---- 6. Best-of-N reality check ----
  if (records.length > 0) {
    const best = records[0]; // qualifying[] is sorted by mean desc
    const maxima = new Float64Array(trials);
    for (let tr = 0; tr < trials; tr++) {
      let mx = -Infinity;
      for (const q of qualifying) {
        const m = trialMeansByMember.get(q.member)[tr];
        if (m > mx) mx = m;
      }
      maxima[tr] = mx;
    }
    const bestPctl = pctlOf(maxima, best.mean);
    console.log(`  Best-of-N check: the leaderboard's top member (${best.member}, ` +
      `${(best.mean * 100).toFixed(2)}%) sits at the ${bestPctl}th percentile of the`);
    console.log(`  "best of ${records.length} random members" distribution ` +
      `(median best-of-N by luck alone: ${(maxima.slice().sort()[Math.floor(trials / 2)] * 100).toFixed(2)}%).`);
    console.log(`  Below ~95 means the whole leaderboard top is indistinguishable from luck.\n`);
  }

  // ---- 7. Split-sample test ----
  const allDates = scored.filter(s => s.type === 'Buy' && s.excess['6m'] !== null).map(s => s.filed).sort();
  const median = allDates[Math.floor(allDates.length / 2)];
  const half = (arr, first) => arr.filter(s => (first ? s.filed < median : s.filed >= median));
  const splitQualifiers = [...byMember.entries()]
    .map(([member, arr]) => ({ member, a: half(arr, true), b: half(arr, false) }))
    .filter(q => q.a.length >= minBuys && q.b.length >= minBuys)
    .map(q => ({
      member: q.member,
      nA: q.a.length, nB: q.b.length,
      meanA: q.a.reduce((s, x) => s + x.excess['6m'], 0) / q.a.length,
      meanB: q.b.reduce((s, x) => s + x.excess['6m'], 0) / q.b.length,
    }))
    .sort((x, y) => y.meanA - x.meanA);
  console.log(`  Split-sample (median disclosure date ${median}; >=${minBuys} scored buys in EACH half):`);
  if (splitQualifiers.length === 0) {
    console.log(`  No member has ${minBuys}+ scored buys in both halves — the per-member samples are too thin`);
    console.log(`  for any skill claim to even be testable. (That is itself the finding.)\n`);
  } else {
    const topDecile = splitQualifiers.slice(0, Math.max(1, Math.ceil(splitQualifiers.length / 10)));
    console.log(`  ${splitQualifiers.length} members qualify; in-sample top decile re-scored out-of-sample:`);
    for (const q of topDecile) {
      console.log(`    ${q.member.padEnd(30)} 1st half ${(q.meanA * 100).toFixed(2)}% (n=${q.nA})  ->  ` +
        `2nd half ${(q.meanB * 100).toFixed(2)}% (n=${q.nB})`);
    }
    console.log('');
  }

  // ---- 8. Honesty box ----
  console.log(`  Caveats (these ship with the UI):`);
  console.log(`  - Equal-weight per trade: PTR dollar bands are too wide to weight by size.`);
  console.log(`  - Machine-readable House disclosures only: Senate absent, ~${scannedSkipped} scanned PTRs skipped,`);
  console.log(`    ${unscoreable.noPrices + unscoreable.dataGap} trades unpriceable (mostly delisted/fund tickers) — records describe`);
  console.log(`    what we can measure, not everything a member did. Delisted exclusions likely flatter records slightly.`);
  console.log(`  - Spouse/dependent trades count toward the member (the disclosure regime's own attribution).`);
  console.log(`  - ${records.length} members ranked -> the best record is EXPECTED to look good by chance; see best-of-N.`);

  // ---- 9. Export for the UI ----
  if (doExport) {
    const poolBuy6m = pool('Buy', '6m');
    console.log(`\n// GENERATED by server/harness/congresstrack.js --export — paste into index.html`);
    console.log(`const CONGRESS_RECORDS = {`);
    console.log(`  generated: '${new Date().toISOString().slice(0, 10)}',`);
    console.log(`  config: 'machine-readable House PTRs 2014+, entry at first close after disclosure, excess vs SPY (total-return), equal-weight',`);
    console.log(`  pooled: { n: ${poolBuy6m.n}, excess6m: ${(poolBuy6m.mean * 100).toFixed(2)} },`);
    console.log(`  coverage: { trades: ${trades.length}, scored: ${scored.length}, minBuys: ${minBuys} },`);
    console.log(`  members: {`);
    for (const r of records) {
      console.log(`    ${JSON.stringify(keyOf.get(r.member))}: { name: ${JSON.stringify(r.member)}, n: ${r.n}, excess6m: ${(r.mean * 100).toFixed(1)}, pctl: ${r.pctl} },`);
    }
    console.log(`  },`);
    console.log(`};`);
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
