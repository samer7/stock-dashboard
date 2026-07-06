# Stock Dashboard

A personal stock market dashboard for tracking trends, technical signals, and congressional trading activity.

> **Status:** Prototype. Everything shown is real data via a deployed backend: **live prices**, **MA-based signals**, **RSI/MACD**, **House congressional trades**, and **news headlines**. Nothing is simulated anymore — the last mock piece (a hand-written signal history log) was removed; that section now honestly says "not tracked yet". See "Honest state" below.

## Project direction (recalibrated 2026-07)

What this project is trying to become, in one sentence: **a free, self-contained, algorithm-only dashboard where every signal is grounded in published research, measured against honest benchmarks, and congressional trading activity gets maximum daylight.**

The principles behind that sentence — these guide every roadmap decision:

1. **Deterministic algorithms only — no AI-model dependency.** Every signal is classical computation (moving averages, statistics, parsed disclosures) that runs on our own server against free data feeds. This is a rigor choice, not just a cost choice: deterministic signals are reproducible, and reproducibility is what makes backtested track records trustworthy. (An LLM-based news-sentiment scorer was considered and deliberately rejected on these grounds.)
2. **Research-grounded, as a source of truth.** The quantitative-finance literature is deep but scattered, and the retail layer on top of it is mostly clickbait. Each signal here should trace back to published research (digested into `docs/research/` with citations) and forward to its own measured live performance. Research → implementation → out-of-sample verification, one topic at a time.
3. **Honest measurement over impressive claims.** No signal is presented as trustworthy until the evaluation harness (Phase 5) has measured it out-of-sample, with costs, against buy-and-hold. The realistic ceiling for any signal is a small, compounding edge (roughly 53–58% hit rates at best — what real quant funds achieve), never near-certainty. If a signal can't beat "just hold an index fund," the dashboard should say exactly that.
4. **Horizons: weekly to long-term.** Day trading is explicitly out of scope. Our data suits longer horizons: moving averages are weeks-to-months tools, and congressional disclosures (up to 45 days delayed) are only plausibly informative at ~6–12 months. Signals will eventually be evaluated and displayed per horizon (1 week / 1 month / 3 months / 1 year).
5. **Congressional transparency "on blast."** STOCK Act disclosures are public but painful to access. Surfacing them in full detail is valuable independent of any predictive power — and the honest caveat is that post-STOCK-Act research finds the predictive edge of congressional trades to be much smaller than the famous pre-2012 studies suggested. Transparency first; alpha only if the harness proves it.
6. **Readable by a novice.** The intended reader knows little about stocks. The UI should teach as it goes and never present an unvalidated number as authoritative.

---

## What it does (today)

- Watchlist of tracked tickers rendered as cards with price, daily change, and a signal badge
- Sparkline per card for quick visual trend, drawn from real 30-day closes and colored by the 30-day trend
- BUY / HOLD / SELL badges with signal-change indicators (e.g. HOLD → BUY)
- Expandable detail view per ticker with 52w high/low, volume, signal reasoning, and recent news headlines
- Congressional trade activity per ticker (real U.S. House STOCK Act disclosures)
- "Recent House activity" feed — the newest disclosed trades across **all** members, grouped by member and day, independent of the watchlist
- Watchlist persists across sessions via `localStorage`
- Loading states while data is fetched (matters on the free-tier backend's ~30s cold start); invalid tickers show a clear error instead of fake numbers

## Honest state of the project

Being upfront about what's real and what isn't, because the line matters:

| Feature | Real | Simulated |
| --- | --- | --- |
| UI / interaction | ✅ | |
| Watchlist persistence | ✅ | |
| Price, change, change % | ✅ live from Finnhub via backend | |
| Moving average signals (MA20/50/200) | ✅ computed server-side from Twelve Data history | |
| RSI (14) / MACD (12/26/9) | ✅ computed server-side from the same closes | |
| Sparkline data | ✅ real 30-day closing prices | |
| Volume, 52w high/low | ✅ from Twelve Data history | |
| Congressional trades (House) | ✅ real U.S. House Clerk disclosures | |
| Signal history log | — not built yet | (was hardcoded; the fake log was removed) |

Price, change, and change % are real (Finnhub via the backend). Signals are real too: the backend pulls ~250 daily closes from Twelve Data, computes MA20/MA50/MA200 plus RSI(14) and MACD(12/26/9), and derives BUY/HOLD/SELL with reason text from the actual price-vs-MA relationships. Sparklines draw real 30-day closing prices, and 52w high/low and volume come from the same history. Congressional trades are real U.S. House STOCK Act disclosures parsed from the House Clerk feed (House only; Senate deferred). Nothing is simulated anymore: cards show a loading state until real data arrives, and the signal history section says "not tracked yet" instead of displaying an invented log. (Note: Finnhub free-tier prices run ~2% off the official regular-session close; data-accuracy review is deferred.)

---

## ⚠️ Disclaimer

This project is for personal research and learning. Nothing it displays is financial advice. Signals shown here are heuristic and lag the market by design. Do not make trades based on this dashboard.

---

## Roadmap

The next phase is the real project. Everything before it is UI scaffolding.

### ✅ Phase 1 — UI shell (done)

- Single-page layout with watchlist grid and detail panel
- Card components: price, change, signal badge, sparkline, congress pill
- Add / remove ticker flow with localStorage persistence
- Detail view with metrics, signal reasoning, congress trades, signal log
- Simulated data for all of the above

### ✅ Phase 2 — Backend + one real data source (done)

The critical phase: real price data flowing end-to-end.

- Minimal backend (Node/Express) deployed to Render free tier — see [`/server`](./server)
- Single endpoint: `GET /api/quote/:ticker` proxying Finnhub, with 60s in-memory cache
- Secure API key handling — keys live server-side, never in client code
- CORS enabled for the frontend origin
- UI wired to consume the real endpoint — started with AAPL, then expanded to the full watchlist

### ✅ Phase 3 — Real signal computation (done)

- Fetch historical daily closes from Twelve Data (Finnhub free tier blocks candle data)
- Compute MA20 / MA50 / MA200 server-side in `GET /api/history/:ticker`
- Generate the "reason" text from actual price-vs-MA relationships
- Render real 30-day sparklines from real closing prices

### 🔸 Phase 4 — Additional data layers (in progress)

- ✅ RSI (14) / MACD (12/26/9) indicators — computed server-side from the closes already fetched for the moving averages (no extra API calls); shown in the detail panel with color-coded labels
- ✅ Real congressional disclosures (House) — built from the official U.S. House Clerk feed (free, no API key), parsing each recent PTR PDF server-side and bucketing stock trades by ticker. Paid options (Quiver, FMP, Finnhub) were all rejected as not-free; the community "stock-watcher" datasets are abandoned (last updated 2021).
- ✅ Sparkline color reflects the 30-day trend rather than today's price change
- ✅ Widen congress coverage: parse window 120 → 365 days; per-ticker display cap 10 → 25 (window is bounded by the current-year disclosure feed — early in a calendar year it effectively spans "Jan 1 → today"; spanning the prior year's feed is deferred)
- ✅ Capture clean tickers on **any** asset type, not just `[ST]`. Surveying the full 2026 corpus corrected the original assumption: the `[EF]` ETF tag never occurs — filers tag ETFs `[ST]`, so ETFs were already covered. What the widening actually adds is the other tickered types (`[OT]` other, `[PS]` non-public, `[RS]` restricted, `[AB]` LP units), each labeled by asset type in the UI. Two tags stay excluded on purpose: `[OP]` options (a bought put is bearish on the underlying — a plain "Buy" label would mislead) and `[CT]` crypto (symbols collide with real tickers, e.g. `(ETH)` the coin vs. Ethan Allen on the NYSE)
- ✅ Surface **untickered** disclosures as an aggregate — the feed's footer now counts every transaction row not shown as a trade (~410/year: U.S. treasuries dominate at ~240, then corporate bonds, ownership interests, private funds, plus the deliberately excluded options/crypto), broken down by official asset-type tag, so a member moving millions in treasuries no longer looks inactive
- ✅ "Recent House activity" feed — a non-ticker-filtered view of the latest disclosures across all active filers, served by `GET /api/congress/recent` from the same parsed index. Trades are grouped by member + day in the UI, because one member rebalancing a portfolio can file dozens of same-day trades that would otherwise flood every row (only ~84 of 435 reps trade individual stocks, and the top 10 are ~29% of filings). Future-dated filer typos are filtered out so they can't pin themselves to the top
- ✅ Trade-size **band breakdown** — per-ticker distribution across the disclosure bands ($1K–$15K … $50M+) computed server-side over ALL of the ticker's trades in the window (not just the 25 shown), rendered as thin buy/sell meters in the detail panel; feed summary rows also carry a size note ("mostly $1K–$15K"). PTRs only disclose ranges, so the band distribution is the most honest size view possible
- ✅ News headlines — `GET /api/news/:ticker` proxies Finnhub's free company-news endpoint (last 7 days, deduplicated, newest 8), rendered as a "Recent news" section in the detail panel with real article links
- ✅ News sentiment classification — **resolved by NOT building it** (2026-07). An LLM scorer (Claude Haiku/Sonnet) was fully costed and a keyword lexicon (Loughran-McDonald) evaluated; both rejected under the no-AI-model / deterministic-only principle — the lexicon's error rate would decorate headlines with confidently wrong labels, and an LLM breaks reproducibility and self-containment. Headlines stay unscored; readers judge them. (A clearly-labeled word-list could be revisited later if the research pipeline finds evidence it helps.)
- 🔲 Senate disclosures — separate eFD system behind a click-through agreement; own mini-project, deferred

### 🔲 Research pipeline (ongoing workstream, starts alongside Phase 5)

The "source of truth" goal, run as a loop — one topic at a time:

1. **Digest** — survey the published research on a topic and write a plain-language summary with citations into `docs/research/`
2. **Implement** — where the research describes a testable rule, code it as a deterministic signal
3. **Verify** — backtest it out-of-sample in the Phase 5 harness and display the live track record next to the citation

First topics queued: moving-average timing rules (we already compute MA20/50/200 — does the literature say crossover strategies beat buy-and-hold?), momentum (the most robust anomaly in the literature), and congressional-trading studies (Ziobrowski's pre-2012 findings vs. the weaker post-STOCK-Act results).

All measured verdicts are collected in [`docs/research/README.md`](docs/research/README.md), and [`docs/research/glossary.md`](docs/research/glossary.md) defines every term the digests and harness reports use (base rates, drawdowns, walk-forward, whipsaws…) in plain language, each tied to this project's own numbers.

### 🔸 Phase 5 — Signal rigor & evaluation harness (in progress)

The honest core of the project. **Goal:** not "predict prices precisely" (not achievable by anyone — even the best quant funds win ~51% of trades), but **quantify uncertainty well and find small, statistically validated edges, measured without self-deception.** "Minimal error" claims almost always come from lookahead bias, overfitting, survivorship bias, or ignoring costs — so the harness comes *before* any fancy model.

- 🔸 **5a — Evaluation harness first:** a portfolio simulator with walk-forward (out-of-sample) testing, transaction costs + slippage, proper error metrics, and baselines to beat (buy-and-hold and a random walk). No strategy is trusted until it beats those out-of-sample. **Multi-horizon by design:** every signal is evaluated separately at 1-week, 1-month, 3-month, and 1-year horizons, matching the project's weekly-to-long-term scope.
  - ✅ First milestone shipped: `server/harness/` — a standalone, deterministic CLI (`node run.js TICKER`) that backtests the dashboard's own MA signal over ~20 years of cached daily closes with next-day execution (no lookahead), 0.1% costs per switch, buy-and-hold comparison, a seeded 1000-trial random-switching baseline, and per-horizon hit rates vs. base rates. Runs are byte-for-byte reproducible (frozen data cache + seeded randomness).
  - ✅ Multi-ticker sweep (`node sweep.js`): the same analysis across a deliberately mixed 18-ticker basket (index ETFs, mega-winners, defensives, long-term strugglers) with rate-limit-aware fetching, a scoreboard, and hit-rate counts pooled across all ~35,000 signal-days.
  - 📊 **First honest result (18 tickers, ~19 years each):** the dashboard's MA rule beat buy-and-hold on return in **1/18** tickers and on Sharpe in **1/18**, but had a shallower max drawdown in **16/18**. Median "beat random switching": 39% — the timing itself carries no information (pooled BUY-day hit rates match base rates almost exactly at every horizon). The signal is a risk-dampener, not a return generator — and the docs now say so with numbers. Details: `docs/research/README.md`.
  - ✅ Robustness options: `--adjust` (total-return prices, dividends reinvested — with it the verdict strengthens to 0/6 on return AND Sharpe across dividend-heavy names), `--cost=X` sensitivity flag (verdict holds from 0% to 0.2% per switch), and a staleness warning when cached data is >30 days old.
  - ✅ Signal-transition (event-based) analysis and the refined random baseline (matching time-in-market, not just trade count) — both landed with the v0.9.4 sweep.
  - ✅ Walk-forward split machinery (`server/harness/walkforward.js`): fit on a training window, freeze, score only unseen days, roll forward — the engine any *fitted* signal (5b calibration, 5c weights) must pass through. Its first experiment (`wfma.js`) measured the point of it: yearly re-picking the "best" MA crossover from the past 5 years produced a training winner whose test-year rank averaged 4.67/8 (chance: 4.5), lost to buy-and-hold in 18/18 tickers, and lost to an *untuned* 50/200 golden cross in 14/18 — in-sample optimization is a random-number generator with extra steps, now demonstrated on our own data.
  - 🔲 Remaining in 5a: surfacing harness results in the UI (the signal legend carries the headline verdict; per-ticker numbers not yet shown).
- **5b — Probabilistic signals:** convert BUY/HOLD/SELL into *calibrated probabilities*; add volatility modeling (GARCH/EWMA — volatility is far more predictable than price); grade with proper scoring rules (Brier score, log-loss).
- **5c — Weighted multi-signal model:** combine MA / RSI / MACD / congressional flow, each weighted by its validated track record (Bayesian or regularized regression; time-series cross-validation only).
- **5d — Risk & sizing:** Sharpe / Sortino / max-drawdown reporting; Kelly-based position sizing.
- **5e — Per-member congressional track records:** apply the harness to disclosure data — "when Rep. X discloses a buy, what happens to that stock over the next 6–12 months?" for every active filer. Deterministic, backtestable, and the deepest form of the congressional-transparency goal; nobody offers this for free.
- Caveat to test, not assume: the congressional signal carries a ~45-day disclosure delay, so its predictive horizon is long (≈6–12 months) and likely weak for short-term moves.

### 🔲 Phase 6 — Paper trading / simulated portfolio ("simulated run")

Hypothetically invest fake money by following the site's suggestions and track the results. Built on the **same simulator core as Phase 5a** — a backtest and a paper-trade are the same engine with a different clock (historical vs. forward). The auto-follow mode is a **live, lookahead-proof forward-test** of the strategy, which is the gold standard for proving signals aren't fooling us.

- **6a — Manual paper portfolio:** start with fake cash, buy/sell at live prices on suggestions, transaction log, value charted **against a buy-and-hold benchmark**. localStorage-backed (single-user). Can ship relatively early as a standalone feature.
- **6b — Auto-follow mode:** the system executes its own signals forward over time = live forward-test, reusing the Phase 5 engine + metrics (return, Sharpe, drawdown).
- Honest caveat: a single run reflects whatever market regime it ran in and accrues slowly — a great gut-check and demo, but a complement to backtesting, not a replacement.

### 🔲 Phase 7 — UI polish (intentionally later)

Deferred until real data is flowing, because much of this changes once the data is real.

### 🔲 Phase 8 — Multi-user (only if scope expands)

Decision point: this only matters if the tool is meant to be used by other people. A personal tool can stay client-only with localStorage. A real database (e.g. Supabase) only enters here.

---

## Tech stack

| Layer | Current | Planned |
| --- | --- | --- |
| Frontend | HTML / CSS / vanilla JS | same |
| Charts | Chart.js | same |
| Hosting | GitHub Pages | same for frontend |
| Backend | Node + Express, deployed to Render | same |
| Data | Finnhub (live quotes + news) + Twelve Data (history/signals) + House Clerk (congress) | same — free, self-contained feeds only; no AI-model APIs |
| Database | localStorage | Supabase (only if Phase 7 happens) |

---

## Local development

**Frontend:**

```
git clone https://github.com/samer7/stock-dashboard.git
cd stock-dashboard
open index.html
```

No build step. Single HTML file. Edit and reload.

**Backend:** see [`/server/README.md`](./server/README.md) for setup and deployment instructions.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)