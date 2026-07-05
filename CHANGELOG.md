# Changelog

All notable changes to this project will be documented here.

---

## [0.9.9] - 2026-07-05
### Added
- **RSI/MACD research digest** (`docs/research/rsi-macd.md`, 12 verified citations): both indicators are practitioner inventions with no founding academic evidence; the dashboard's exact MACD(12/26/9) rule showed no predictability in any of five developed markets (Chong, Ng & Liew 2014, verified against the primary PDF — including the 4-vs-2 significant-cell count); RSI's mean-reversion ancestor never lived in mega-caps and has decayed since 1995. Proposes the next harness test: `--strategy=macdcross` (long when MACD > signal line, else cash), with a pre-committed prediction of ~0/18 total-return wins

### Notes
- Docs-only release: digest drafted by a parallel research agent, then reviewed against the Chong-Ng-Liew primary source (two corrections: the misattributed 10-day-window caveat, the 45-cell count)

---

## [0.9.8] - 2026-07-05
### Added
- **Portfolio-mode simulator core** (`server/harness/portfolio.js`): multi-ticker date alignment, dollar-position simulation with rebalance-to-target-weights, costs charged per traded dollar (generalizes the single-ticker per-switch model), equal-weight buy-and-hold + equal-weight rebalanced benchmarks, and a seeded random-picks baseline. Deliberately the same engine Phase 6's paper trading will run forward
- **Momentum experiment runner** (`server/harness/momentum.js`): the momentum digest's §5 rule — 12-2 relative momentum, top-3, monthly, vs equal-weighted basket buy-and-hold — with `--adjust`, `--cost=`, `--top=`, and `--skip=0` (the 12-1 ablation), plus rebound-window and crisis-window checks

### Measured
- **The momentum verdict (momentum.md §7): the specced rule adds nothing over holding the basket — no relative-strength rank ships.** Total-return after costs: 20.0% CAGR vs 19.4% equal-weight buy-and-hold (+0.6pp, noise), worse Sharpe (0.80 vs 0.87), worse drawdown (−60% vs −52%), 48.0% monthly hit rate on 227 months (coin-flip band ±6.6pp); loses outright on price-only data. The 12-1 ablation beat 12-2 (opposite of Jegadeesh 1990) — verified by hand not to be a bug: 85% shared picks, gap driven by a few NVDA-surge months, i.e. the digest's 18-name-noise warning demonstrated from inside

### Changed
- `crisisStats` accepts custom windows (reused for the momentum rebound test); `mulberry32` exported from backtest.js; the rate-limit-throttled history loader moved from sweep.js into data.js (`loadWithThrottle`, `isCached`) so all runners share it

---

## [0.9.7] - 2026-07-05
### Added
- **Momentum research digest** (`docs/research/momentum.md`, 13 verified citations): cross-sectional momentum is real and pervasive but heavily caveated (short-side profits, turnover costs, momentum crashes, ~58% post-publication decay); realistic long-only large-cap edge ~1–3%/yr. Proposes the next harness test: **12-2 relative momentum, top-3, monthly** vs equal-weighted basket buy-and-hold — needs a portfolio-mode harness extension that doubles as Phase 6's simulator core. NOT yet run
- **Congressional-trading research digest** (`docs/research/congressional-trading.md`, 7 verified citations): the pre-2012 "Congress beats the market" result did not survive re-analysis (Eggers & Hainmueller 2013); post-STOCK-Act studies unanimously find no edge (House buys −26 bps at 6 months, Belmont et al. 2022); copy-congress ETFs (NANC/KRUZ) ≈ SPY before fees. Phase 5e reshaped as a transparency + honest-measurement feature with pre-committed method, ≥20-trade minimums, matched-random baselines, and a best-of-N null for the leaderboard

### Notes
- Docs-only release: both digests drafted by parallel research agents, citations verified via web search, reviewed and linked from `docs/research/README.md`

---

## [0.9.6] - 2026-07-05
### Added
- **12-month TSMOM strategy** (`tsmomSignalSeries` in `strategies.js`, `--strategy=tsmom`): long/cash time-series momentum — at month-end, in if the trailing 12-month return is positive, else cash. Completes the digest's three-variant test set; strategy selection in `analyze.js` is now a proper map (`ma`/`faber`/`tsmom`)

### Notes
- **Third variant, same verdict**: 3/18 on CAGR price-only, 0/6 total-return, median matched percentile 34%, drawdown shallower 16/18 on the fewest trades yet (13–41 per ~19y). Does not contradict Moskowitz et al. (2012) — their result is a diversified long/short futures portfolio, not single-stock timing
- **Cross-variant finding — protection scales with reaction speed**: COVID crash wins were 17/18 (daily MA) vs 13/18 (Faber 10-mo) vs 11/18 (TSMOM 12-mo, median −26.1% vs −30.7%), while all three won the slow 2008 grind near-unanimously. Slow rules protect against slow declines; fast rules catch fast ones and pay in whipsaws. All three digest follow-ups now tested; MA topic closed in `docs/research/ma-timing.md`

---

## [0.9.5] - 2026-07-05
### Added
- **Crisis-window test** (`crisisStats` in `backtest.js`, reported in `run.js` + pooled in `sweep.js`): strategy vs buy-and-hold inside S&P peak-to-trough windows (dot-com, financial crisis, COVID crash, 2022 bear) — the direct test of the drawdown-protection claim, with honest partial/no-coverage reporting (free-tier history starts mid-2007, so dot-com is uncovered)
- **Faber (2007) 10-month SMA strategy** (`faberSignalSeries` in `strategies.js`, `--strategy=faber` on both CLIs): month-end close vs 10-month SMA, in/out binary — the literature's favorite MA variant, with 4–8× fewer trades than the daily rule

### Notes
- **The drawdown story survives its falsification test.** The daily MA rule beat buy-and-hold in 49/54 crisis ticker-windows: 17/18 in the financial crisis (median −9.5% vs −50.5%), 17/18 in the COVID crash (−4.8% vs −30.7%), 15/18 in the 2022 bear (−7.6% vs −25.8%). Its full-period return deficit is the premium paid for that protection
- **Faber behaves exactly as the literature predicts**: still loses on return (5/18 price-only, 0/6 total-return), timing still ≈ random placement (median matched percentile 47%), but keeps the drawdown benefit (15/18) and wins crises (47/54; weakest in COVID, 13/18 — monthly cadence is too slow for a 23-day crash). Both digest predictions marked tested in `docs/research/ma-timing.md`

---

## [0.9.4] - 2026-07-05
### Added
- **Signal-transition (event) analysis** in the harness: `transitionStats()` in `backtest.js`, new "Event test" section in `run.js` and pooled across tickers in `sweep.js`. Measures up-rate AND average forward return after the days the signal *flips* to BUY/SELL, against the any-day baseline — because per-day hit rates count one six-month BUY as ~126 autocorrelated samples, while flips are the actual decisions (and what a dashboard user actually sees change)

- **Matched random baseline**: `randomBaselineMatched()` shuffles the strategy's own holding periods in place (seeded Fisher–Yates) — every trial has the same switch count AND the same days-in-market, so only the *placement* of holding periods is tested. Reported alongside the old trade-count-only baseline in `run.js` and as a new sweep column + scoreboard line
- **First formal research digest**: `docs/research/ma-timing.md` — the MA-timing literature from Brock/Lakonishok/LeBaron (1992) through the data-snooping rebuttals (Sullivan/Timmermann/White 1999; Ready 2002; Bajgrowicz & Scaillet 2012; Fang et al. 2014; Zakamulin 2014/2018) to the modern risk-management reframing (Faber 2007; Moskowitz/Ooi/Pedersen 2012; Hurst et al. 2017; Moreira & Muir 2017). 11 verified citations; a table maps each literature claim to our harness measurement (they agree point for point); a "what would change our mind" section queues Faber's 10-month SMA, 12-month TSMOM, and crisis-window tests as the next falsifiable follow-ups

### Notes
- **Result: flips carry no information either.** Across ~3,700 →BUY flips (18 tickers, ~19y each), the up-rate after a flip matches the any-day base at every horizon, and the average forward return is slightly BELOW the any-day average (13.9% vs 15.4% at 1 year). →SELL flips likewise ≈ base. Same pattern on total-return prices (6 dividend names, ~1,330 flips). The strongest framing of the timing question so far, and the same answer. Recorded in `docs/research/README.md`
- **The matched baseline sharpens it further**: median percentile falls from 39% (trade-count-only) to 34% — the rule places its holding periods slightly WORSE than random placement of the identical pattern (AAPL: 74% → 58%)

---

## [0.9.3] - 2026-07-05
### Changed
- **Signal legend reframed to carry the measured result.** The "How are signals computed?" expander is now "How are signals computed — and do they work?" and answers honestly: backtested over ~19 years × 18 tickers, the MA rule did NOT beat buy-and-hold (1/18 price-only, 0/6 with dividends), its timing carried no information (BUY-day hit rates = base rates), and its one virtue is shallower drawdowns (16/18) from being out of the market ~42% of the time. BUY/SELL are framed as a trend description and risk gauge, not trade advice. Verified in headless Chrome (toggle works, no console errors)

---

## [0.9.2] - 2026-07-05
### Added
- `--adjust` flag on `run.js` and `sweep.js`: fetches TOTAL-RETURN prices (splits + dividends reinvested, `adjust=all`), cached separately per ticker. Fixes the one genuinely wrong set of numbers from 0.9.1 — price-only data understated buy-and-hold on dividend payers (AT&T: -2.1% price-only vs +3.5% CAGR total return)
- `--cost=X` flag: sensitivity check on the per-switch cost assumption
- Staleness warning when cached history is older than 30 days (cache still never auto-expires — reproducibility first, but the report now says when its data is old)

### Notes
- Both robustness checks STRENGTHEN the 0.9.1 verdict: with dividends reinvested the MA rule loses to buy-and-hold 0/6 on return and 0/6 on Sharpe across T/KO/PG/JNJ/XOM/SPY; and the AAPL result holds at every cost level from 0% to 0.2% per switch (strategy 14.5%→12.2% CAGR vs 25.1% buy-and-hold throughout)
- In `--adjust` mode, signals are computed on dividend-adjusted closes and can differ slightly from the live dashboard's (split-adjusted) signals — the report's caveats say which mode produced it

---

## [0.9.1] - 2026-07-05
### Added
- **Multi-ticker sweep** (`node sweep.js [tickers...]`): runs the full backtest across a deliberately mixed default basket of 18 tickers — index ETFs (SPY/QQQ/IWM), mega-winners (AAPL/MSFT/NVDA/GOOGL/AMZN), defensives (KO/PG/JNJ/JPM/XOM), and long-term strugglers (INTC/T/F/BA/PFE) — so the rule is tested on histories it would not have enjoyed, not just stocks we already like. Per-ticker table, a scoreboard (how often the strategy beats buy-and-hold on return / Sharpe / drawdown), and horizon hit rates POOLED across all signal-days rather than averaged per ticker. Fetching is rate-limit aware (spaced under Twelve Data's 8 calls/min, with wait-and-retry)
- Shared `analyze.js` module so `run.js` and `sweep.js` compute identical numbers (refactor verified byte-identical against the pre-refactor report)

### Notes
- **The sweep sharpened the verdict:** across 18 tickers / ~19 years each, the MA rule beat buy-and-hold on CAGR in 1/18 (Ford — a sideways history, where trend-following theory expects exits to help) and on Sharpe in 1/18, but cut max drawdown in 16/18. Median beat-random percentile 39%; pooled BUY-day hit rates equal base rates at every horizon (~35,000 signal-days). Timing adds nothing; the drawdown relief comes from simply being in the market only ~58% of the time. Recorded in `docs/research/README.md`
- Free-data limitation stated in the report: only currently-listed symbols are fetchable, so even a mixed basket is survivor-tilted

---

## [0.9.0] - 2026-07-05
### Added
- **Phase 5a evaluation harness (first milestone)**: `server/harness/` — a standalone, deterministic backtesting CLI (`node run.js TICKER [--refresh]`) that tests the dashboard's own MA signal against ~20 years of daily closes (Twelve Data, one call per ticker, cached to disk for reproducibility). Includes: next-day execution so signals can't trade on information they didn't have yet; 0.1% transaction cost per switch; buy-and-hold benchmark over the identical period; a 1000-trial seeded random-switching baseline (same trade count — answers "is the timing better than luck?"); hit rates at 1-week/1-month/3-month/1-year horizons compared against base up-rates; Sharpe, CAGR, and max drawdown; and a caveats section that prints with every report
- `docs/research/` — home of the research-digest workstream, with the queued topics and the harness's first finding recorded

### Notes
- **First honest result:** the dashboard's MA signal underperforms buy-and-hold on ~19 years of AAPL (13.3% vs 25.1% CAGR) and SPY (2.1% vs 8.6%), and on SPY beats only 31% of random-switching strategies. Its real property is risk reduction: max drawdowns around -35% vs -60% for buy-and-hold. The signal survives as a "sleep at night" heuristic, not a return generator — exactly the kind of thing the harness exists to reveal
- Runs are byte-for-byte reproducible: frozen data cache + seeded randomness (mulberry32), verified by diffing consecutive runs
- The roadmap's recalibrated principles applied: deterministic only, honest measurement, per-horizon evaluation

---

## [0.8.0] - 2026-07-05
### Added
- Recent news headlines per ticker: new `GET /api/news/:ticker` backend endpoint proxying Finnhub's free company-news API (last 7 days, 30-minute cache), returning the newest 8 headlines deduplicated by normalized headline text (aggregators syndicate the same story under near-identical titles). The detail panel renders them as a "Recent news" section — each row is a real article link (http/https URLs only; `target="_blank" rel="noopener"`) with source and date
- Honest states throughout: "Loading headlines…" while fetching, "No recent headlines for this ticker" when Finnhub returns none (its answer for unknown tickers too), and an error line if the backend is unreachable

### Notes
- Sentiment is deliberately NOT scored yet — the section footer says so ("sentiment not scored yet"). Bolting on a crude classifier would undermine the honest-data ethos; scoring is a separate follow-up with its own design decision (transparent word-list vs. LLM call)
- Finnhub's relevance tagging is loose: a ticker's news includes general market stories that merely mention it. Accepted for now — they're real headlines, just broad
- Verified end-to-end in headless Chrome against a local backend: 8 AAPL headlines with working links, invalid ticker shows the error card plus "No recent headlines", second API call serves `cached: true`, over-long ticker gets a 400

---

## [0.7.1] - 2026-07-04
### Added
- Unattributed-disclosure aggregate: the parser now counts every transaction row it does NOT surface as a trade (no clean ticker, options, crypto, exchanges) by asset-type tag. `/api/congress/recent` returns it as `unattributed`, and the feed footer renders one honest line: "Not shown: 410 more disclosed transactions with no clean stock ticker — mostly U.S. treasuries (244), corporate bonds (36), other assets (32)." Without this, a member moving millions in treasuries looked inactive

### Fixed
- Asset labels corrected against the official code list (fd.house.gov/reference/asset-type-codes.aspx): `[AB]` is Asset-Backed Securities (previous "LP units" gloss was wrong — the AllianceBernstein sample was a ticker/tag coincidence), `[RS]` is Restricted Stock Units, `[OI]`/`[OL]` are ownership interests

---

## [0.7.0] - 2026-07-04
### Added
- Trade-size band breakdown per ticker: `/api/congress/:ticker` now returns `bands` — buy/sell counts per disclosure dollar band ($1K–$15K … $50M+), computed over ALL of the ticker's trades in the window — plus `total` (the uncapped trade count). The detail panel renders it as thin green/red meters with counts written in text (buys always the left segment, so meaning never rests on color alone; the green/red pair was validated for colorblind separation)
- Feed summary rows now carry a size cue: "mostly $1K–$15K" / exact band / "mixed sizes"
- Ticker capture widened from `[ST]`-only to any asset-type tag, with the tag passed through as `asset` and labeled in the UI (e.g. "Buy · restricted"). Two tags are excluded deliberately: `[OP]` options (a bought put is bearish on the underlying — a plain "Buy" would mislead) and `[CT]` crypto (symbols collide with real stock tickers: `(ETH)` the coin vs. Ethan Allen, NYSE: ETH)

### Notes
- Surveyed the full 2026 PTR corpus before implementing: the `[EF]` ETF tag occurs ZERO times — filers tag ETFs `[ST]`, so ETFs were already captured and the roadmap's original assumption was wrong. The widening actually adds the rarer tickered types: `[OT]` 6, `[PS]` 2, `[RS]` 2, `[AB]` 1 rows this year (e.g. a $5M–$25M restricted-stock buy previously invisible). One `NYSEARCA: DIA`-format row exists corpus-wide; deliberately not parsed (a rule for one row would be overfitting)
- `abbreviateDollars` now renders band floors cleanly ($1,000,001 → "$1M", not "$1.0M")
- PTRs disclose ranges, never exact amounts — the band distribution is the most honest size view possible, and the UI says "this year" to match the actual window

---

## [0.6.0] - 2026-07-04
### Added
- "Recent House activity" feed: a new `GET /api/congress/recent` endpoint serving the newest 100 disclosed trades across ALL tickers and members, built from the same parsed index as the per-ticker data (no extra PDF work). Rendered as a panel below the watchlist, independent of which tickers you track
- The UI groups feed rows by member + day: one member rebalancing a portfolio can file dozens of same-day trades (verified live — 16 Cisneros trades on one day filled the entire ungrouped feed), so bulk days collapse to a summary row ("10 buys, 6 sells") with a ticker preview, keeping other members visible

### Fixed
- Future-dated transaction dates (filer typos, e.g. a trade dated 12/26/2026 in a PDF filed early 2026) are excluded from the feed — sorted newest-first, they would otherwise pin themselves to the top for months

### Notes
- The literal `/api/congress/recent` route must stay registered before `/api/congress/:ticker` — Express matches in definition order, and "recent" would otherwise parse as a ticker symbol
- Verified end-to-end in headless Chrome against a local backend: loading state → 12 grouped rows across 7+ members, backend-unreachable → clean error message, empty watchlist → feed still loads

---

## [0.5.2] - 2026-07-04
### Fixed
- User-added tickers no longer vanish on reload. The watchlist persisted correctly in `localStorage`, but on page load only the six hardcoded mock tickers ever rendered — anything you'd added yourself was silently skipped. Every persisted ticker now renders and fetches its real data
- Down days now show a minus sign on the dollar change (was `$31.85 (-7.49%)`, now `-$31.85 (-7.49%)`)

### Changed
- Removed all remaining mock data from the frontend (~150 lines): the hardcoded `STOCKS` blob, the seeded random-walk sparkline fallback, the fabricated signal history logs, and the random fake numbers `addTicker` invented for unknown tickers
- Cards now show an honest loading state (grey badge, "Loading live quote…") until each fetch resolves — which matters on Render's free-tier ~30s cold start — and a clear error state for invalid tickers instead of fake prices
- The signal history section says "not tracked yet" instead of displaying an invented log; signal-change logging is planned for a later phase
- Detail-panel metrics render an em dash while loading instead of `$0.00`

### Notes
- Verified end-to-end in headless Chrome: initial loading state, live hydration, add ticker → reload → ticker persists and hydrates, invalid ticker (`ZZZZZZ`) shows the error state, remove → reload stays removed

---

## [0.5.1] - 2026-06-14
### Changed
- Widened House congressional coverage: the disclosure-parse window grows from 120 to 365 days, and the per-ticker trade cap sent to the UI grows from 10 to 25 — more history surfaces per ticker
- Corrected the README "Honest state" section to reflect what's actually shipped: RSI/MACD, real House congressional trades, real sparkline data, and real volume/52w high/low are no longer listed as simulated (only the signal history log remains hand-written)

### Notes
- The 365-day window is bounded by the current-year disclosure feed: the build only downloads this calendar year's ZIP and PDFs, so early in the year the effective window is "Jan 1 → today" rather than a true rolling 12 months. Spanning the prior year's feed is deferred (it would roughly double the cold-start PDF count early in the year). Verified locally on 2026-06-14: AAPL returns the full 25-trade cap and the cold index build stays fast (~2s) precisely because it's still single-year data

---

## [0.5.0] - 2026-06-13
### Added
- Real congressional trading data (U.S. House) via a new `GET /api/congress/:ticker` endpoint, replacing the simulated congress data in the detail panel and card pills
- Source is the official U.S. House Clerk financial-disclosure feed — free, no API key. The backend downloads the yearly disclosure ZIP, parses each recent Periodic Transaction Report (PTR) PDF with `pdf-parse`, and buckets stock trades by ticker (cached 12h)
- New backend dependencies: `adm-zip` (read the disclosure ZIP) and `pdf-parse` (extract PDF text)

### Changed
- Watchlist sparkline now colors by the 30-day trend (first vs. last close) instead of today's price change, so the line color matches the shape it draws

### Notes
- House only for now. The Senate uses a separate system (eFD) behind a click-through agreement — deferred
- Only ~90% of recent PTRs are filed electronically and yield machine-readable text; scanned/handwritten filings (~10%) are skipped. We also keep only trades with a clean ticker (the "(AAPL) [ST]" form), skipping bonds/options/untagged assets, to avoid mis-attributing trades
- Paid sources were all rejected for the free-tier requirement: FMP gates congress data to its Ultimate plan, Finnhub's congress endpoint is premium, and Quiver has no free API tier. The popular "stock-watcher" community datasets are abandoned (last updated 2021)
- First request after a cold start is slow (it builds the disclosure index by reading many PDFs); the frontend shows a loading state

---

## [0.4.0] - 2026-06-03
### Added
- RSI (14) and MACD (12/26/9) technical indicators, computed server-side in `GET /api/history/:ticker` from the daily closes already fetched for moving averages — no extra API calls
- "Technical indicators" section in the detail panel showing RSI and MACD with color-coded labels (Overbought/Oversold/Neutral; Bullish/Bearish/Flat)

### Notes
- RSI uses Wilder's smoothing and MACD uses EMAs, so values match canonical sources; validated against Twelve Data's own `/rsi` and `/macd` endpoints (AAPL: RSI 73.6 vs 73.58, MACD 9.91 vs 9.914)
- Computed locally rather than via Twelve Data's indicator endpoints to avoid extra rate-limited calls and external dependency — scales better and costs nothing per request

---

## [0.3.0] - 2026-05-31
### Added
- Backend deployed to Render; frontend now consumes it for real data
- Live prices for the whole watchlist (Finnhub via `GET /api/quote/:ticker`)
- Real MA-based signals: `GET /api/history/:ticker` computes MA20/MA50/MA200 from Twelve Data daily closes and derives BUY/HOLD/SELL with reason text
- Real 30-day sparklines drawn from actual closing prices
- Real 52-week high/low and volume in the detail panel (computed from the same Twelve Data history)

### Changed
- Signals and sparklines are no longer hardcoded/simulated
- Banner and legend updated to reflect real signal computation
- Removed the market cap metric rather than show a stale mock value (it needs share-count data we don't fetch yet) — fixes the case where a real price exceeded a hardcoded 52w high

### Notes
- Twelve Data added for historical data because Finnhub's free tier blocks candle data
- Finnhub free-tier prices run ~2% off the official close; accuracy review deferred

---

## [0.2.0] - 2025-05-09
### Added
- Watchlist grid with multi-ticker support
- Signal badges (BUY / HOLD / SELL) per card
- Signal change indicators (e.g. HOLD → BUY)
- 7-day sparkline charts per ticker card
- Congressional trade activity layer (simulated)
- Signal history log per ticker
- Expandable detail view with key metrics
- Persistent watchlist via localStorage

---

## [0.1.0] - 2025-05-09
### Added
- Initial stock lookup dashboard
- Single ticker search with price and key stats
- Moving average signal logic (MA20, MA50, MA200)
- Interactive price chart with range toggles (1W, 1M, 3M, 6M, 1Y)
- News headlines with AI-powered sentiment classification