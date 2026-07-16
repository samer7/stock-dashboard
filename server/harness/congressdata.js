// congressdata.js — the multi-year House PTR corpus for Phase 5e, with a disk
// cache. The live server (server.js) fetches only the CURRENT year's
// disclosures; a track record needs every digital year, so this module
// downloads and parses 2014–2026 once and freezes the result — same
// reproducibility contract as the price cache in data.js.
//
//   node congressdata.js            # fetch/refresh any missing years
//   node congressdata.js --year=2019  # one year
//   node congressdata.js --refresh   # refetch everything (rude; avoid)
//
// Provenance: the House Clerk publishes {year}FD.zip (a tab-separated index
// of every filing) and one PDF per filing. Digital PTRs (docId >= 20,000,000,
// which begin in 2014 — 2013 has zero) parse cleanly; scanned/paper ones
// don't and are skipped, exactly like server.js. Survey (2026-07-15): ~5,850
// digital PTRs total, 58–106 distinct filers per year.
//
// ⚠️ The transaction regex is a COPY of parseTransactions in server.js — keep
// them in sync (same [OP]/[CT] exclusions, same optional-ticker form). One
// deliberate difference: we ALSO keep each filing's FILING DATE from the
// index. Phase 5e's clock starts at the disclosure date — the first day an
// outsider could know — never the trade date (congressional-trading.md §6.2).
//
// Amendments: members refile PTRs, so the same trade can appear in two
// filings. We dedupe on (member, ticker, txDate, type, band-floor) and keep
// the EARLIEST filing date (the first public disclosure).

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');

const CACHE_DIR = path.join(__dirname, 'cache', 'congress');
const YEARS = Array.from({ length: 13 }, (_, i) => 2014 + i); // 2014..2026
const PDF_CONCURRENCY = 5;
const SKIPPED_ASSET_TAGS = new Set(['OP', 'CT']); // options mislead, crypto collides

// Member-name normalization. The Clerk's index writes the same filer many
// ways — "Marjorie Taylor Greene" / "Marjorie Taylor Mrs Greene", "W. Greg
// Steube" / "Greg Steube", "Neal Patrick MD, Facs Dunn" — which would split
// one member's record into several thin ones. Surveyed 2026-07-15: 16 variant
// groups; 15 are honorific/initial noise, and one (John vs. Debbie Dingell,
// same state + surname) proves merging must REQUIRE the first given name to
// match. The key is state|first|last after stripping junk tokens and any
// leading single-letter initial. ⚠️ index.html re-implements memberKey() for
// feed-name lookups — keep the two in sync.
const JUNK_NAME_TOKENS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'hon', 'honorable', 'md', 'facs', 'jr', 'sr', 'ii', 'iii', 'iv']);

function cleanNameTokens(name) {
  const toks = name.split(/\s+/)
    .map(t => t.replace(/[.,]+$/g, ''))
    .filter(t => t && !JUNK_NAME_TOKENS.has(t.toLowerCase().replace(/\./g, '')));
  while (toks.length > 2 && /^[A-Za-z]\.?$/.test(toks[0])) toks.shift(); // "C. Scott" -> "Scott"
  return toks;
}

function memberKey(name, district) {
  const toks = cleanNameTokens(name);
  if (toks.length === 0) return name.toLowerCase();
  const state = (district || '').slice(0, 2).toUpperCase();
  return `${state}|${toks[0].toLowerCase()}|${toks[toks.length - 1].toLowerCase()}`;
}

const mdyToIso = (mdy) => {
  const [m, d, y] = mdy.split('/').map(Number);
  if (!m || !d || !y) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// The corpus spans two PDF generations, so this parser is DELIBERATELY wider
// than parseTransactions in server.js (which only ever sees current-year
// PDFs) — surveyed 2026-07-15 against 2014/2017/2019 samples:
//   2014–~2018   "Asset Name (TICKER)s12/26/201312/30/2013$15,001 - $50,000"
//                — no [XX] asset tag, type letter often lowercase, dates
//                sometimes unpadded ("10/1/2014").
//   ~2019–now    the server.js form, with " [ST]" between ticker and type.
// Small-caps PDF fonts extract as mixed case ("SoNo", "NTDoY", "HIl"), so the
// ticker class accepts lowercase and we uppercase afterwards.
// Old-format rows carry no [OP] tag to exclude options with, so untagged rows
// whose preceding asset name mentions options/calls/puts/warrants are skipped
// — showing a bought put as a plain "Buy" would mislead (same reasoning as
// the server's [OP] exclusion).
function parseTransactions(text) {
  const flat = text.replace(/\s+/g, ' ');
  const re = /\(([A-Za-z.]{1,5})\)\s*(?:\[([A-Z]{2})\]\s*)?(P|S|E)(?:\s*\(partial\))?\s*(\d{1,2}\/\d{1,2}\/\d{4})(\d{1,2}\/\d{1,2}\/\d{4})\$([\d,]+)\s*-\s*\$?([\d,]+)?/gi;
  const trades = [];
  let m;
  while ((m = re.exec(flat)) !== null) {
    const [, rawTicker, rawAsset, rawType, txDate] = m;
    const asset = rawAsset ? rawAsset.toUpperCase() : null;
    const typeCode = rawType.toUpperCase();
    if (asset && SKIPPED_ASSET_TAGS.has(asset)) continue;
    if (typeCode === 'E') continue;
    if (!asset) {
      // Old format: peek at the asset name just before "(TICKER)".
      const before = flat.slice(Math.max(0, m.index - 80), m.index);
      if (/\b(option|call|put|warrant)s?\b/i.test(before)) continue;
    }
    trades.push({
      ticker: rawTicker.toUpperCase(),
      asset: asset || 'ST',
      type: typeCode === 'P' ? 'Buy' : 'Sell',
      lo: parseInt(m[6].replace(/,/g, ''), 10),
      txDate: mdyToIso(txDate),
    });
  }
  return trades;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function fetchYear(year) {
  const zipUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`;
  const zipResp = await fetch(zipUrl);
  if (!zipResp.ok) throw new Error(`${year} index returned ${zipResp.status}`);
  const zip = new AdmZip(Buffer.from(await zipResp.arrayBuffer()));
  const txtEntry = zip.getEntries().find(e => e.entryName.endsWith('.txt'));
  if (!txtEntry) throw new Error(`${year}: no index .txt in ZIP`);
  const rows = txtEntry.getData().toString('latin1').split('\n');

  // Columns: Prefix, Last, First, Suffix, FilingType, StateDst, Year, FilingDate, DocID
  const filings = [];
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r].split('\t');
    if (c.length < 9) continue;
    if (c[4] !== 'P') continue;
    const docId = c[8].trim();
    if (!/^\d+$/.test(docId) || Number(docId) < 20_000_000) continue; // digital only
    const filed = mdyToIso(c[7].trim());
    if (!filed) continue;
    filings.push({
      docId,
      member: `${c[2].trim()} ${c[1].trim()}`.replace(/\s+/g, ' ').trim(),
      district: c[5].trim(),
      filed,
    });
  }

  let parsed = 0, failed = 0;
  const trades = [];
  await mapWithConcurrency(filings, PDF_CONCURRENCY, async (f) => {
    const pdfUrl = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${f.docId}.pdf`;
    try {
      const resp = await fetch(pdfUrl);
      if (!resp.ok) { failed++; return; }
      const text = (await pdfParse(Buffer.from(await resp.arrayBuffer()))).text;
      for (const t of parseTransactions(text)) {
        if (!t.txDate) continue;
        trades.push({ ...t, member: f.member, district: f.district, filed: f.filed, docId: f.docId });
      }
      parsed++;
    } catch {
      failed++;
    }
    if ((parsed + failed) % 100 === 0) {
      process.stderr.write(`  ${year}: ${parsed + failed}/${filings.length} PDFs\n`);
    }
  });

  return { year, filings: filings.length, parsed, failed, trades, fetchedAt: new Date().toISOString() };
}

// Load every cached year, fetching missing ones. Returns the deduped flat
// trade list plus corpus stats for the honesty box.
async function loadCorpus({ refresh = false, onlyYear = null } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const years = onlyYear ? [onlyYear] : YEARS;
  const perYear = [];
  for (const y of years) {
    const file = path.join(CACHE_DIR, `${y}.json`);
    if (!refresh && fs.existsSync(file)) {
      perYear.push(JSON.parse(fs.readFileSync(file, 'utf8')));
      continue;
    }
    process.stderr.write(`Fetching ${y} corpus...\n`);
    const data = await fetchYear(y);
    fs.writeFileSync(file, JSON.stringify(data));
    process.stderr.write(`  ${y}: ${data.parsed} PDFs parsed, ${data.failed} failed, ${data.trades.length} trades\n`);
    perYear.push(data);
  }

  // Canonicalize member names: variants of one filer share a memberKey; the
  // most-traded cleaned variant becomes the display name for all of them.
  const variantCounts = new Map(); // key -> Map(cleanedName -> count)
  for (const y of perYear) {
    for (const t of y.trades) {
      const key = memberKey(t.member, t.district);
      const cleaned = cleanNameTokens(t.member).join(' ');
      if (!variantCounts.has(key)) variantCounts.set(key, new Map());
      const vc = variantCounts.get(key);
      vc.set(cleaned, (vc.get(cleaned) || 0) + 1);
    }
  }
  const canonical = new Map();
  for (const [key, vc] of variantCounts) {
    canonical.set(key, [...vc.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }

  // Dedupe amendment copies across ALL years: keep the earliest disclosure.
  const byKey = new Map();
  let dupes = 0;
  for (const y of perYear) {
    for (const t of y.trades) {
      const mKey = memberKey(t.member, t.district);
      const key = `${mKey}|${t.ticker}|${t.txDate}|${t.type}|${t.lo}`;
      const prev = byKey.get(key);
      const row = { ...t, member: canonical.get(mKey), memberKey: mKey };
      if (!prev) byKey.set(key, row);
      else {
        dupes++;
        if (row.filed < prev.filed) byKey.set(key, row);
      }
    }
  }
  const trades = [...byKey.values()].sort((a, b) => (a.filed < b.filed ? -1 : 1));
  return {
    trades,
    stats: {
      years: perYear.map(y => ({ year: y.year, filings: y.filings, parsed: y.parsed, failed: y.failed, trades: y.trades.length })),
      dupesRemoved: dupes,
      total: trades.length,
    },
  };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const refresh = rawArgs.includes('--refresh');
  const yearArg = rawArgs.find(a => a.startsWith('--year='));
  const onlyYear = yearArg ? parseInt(yearArg.split('=')[1], 10) : null;
  const { trades, stats } = await loadCorpus({ refresh, onlyYear });
  console.log(`\nCorpus: ${stats.total} deduped trades (${stats.dupesRemoved} amendment dupes removed)`);
  for (const y of stats.years) {
    console.log(`  ${y.year}: ${y.parsed}/${y.filings} PDFs parsed (${y.failed} failed) -> ${y.trades} trades`);
  }
  const members = new Set(trades.map(t => t.member));
  const tickers = new Set(trades.map(t => t.ticker));
  const buys = trades.filter(t => t.type === 'Buy').length;
  console.log(`  ${members.size} members, ${tickers.size} distinct tickers, ${buys} buys / ${trades.length - buys} sells`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { loadCorpus, parseTransactions, memberKey, cleanNameTokens, YEARS };
