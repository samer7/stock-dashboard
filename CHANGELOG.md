# Changelog

All notable changes to this project will be documented here.

---

## [0.19.0] - 2026-07-25
### Added
- **The snapshot-grading report — the forward test starts scoring itself.** A new panel that takes the `snap` records Phase 6a has been storing with every paper trade and the 6b auto-follow account's rebalance log, and grades them against what prices actually did next, at 1w/1m/3m/6m. Three claims, each with the falsifier its research digest pre-registered: the **volatility band** (realized 1-month move should land inside ±1σ about 2 months in 3 — `volatility.md` §5.1), the **signal label** (expected to show *nothing*; a confirmed null is the honest outcome — `ma-timing.md` §7), and the **vol-sizing rule** (must give up return *and* deliver lower vol plus a shallower drop, or the sizing display comes back out — `risk-sizing.md` §6.1)
- **The grading rules were pre-committed today, while the accounts were 7 days old and not one horizon had matured** — written into the `renderGrade` header block and `docs/research/README.md` before any result was visible, which is the only thing that stops thresholds being tuned to flatter the outcome. Minimum samples below which the panel shows numbers but refuses a verdict: 20 matured snapshots for band coverage, 30 per signal bucket, 126 trading days for the sizing account's risk stats
- `GET /api/closes/:ticker?from=YYYY-MM-DD` — dated closes, oldest-first, 6h cache bucketed by window size so trades on nearby dates share one entry. Kept separate from `/api/history` deliberately: every card calls that endpoint on load, and attaching ~250 dated entries to it would multiply the payload for every ticker to serve one panel most page loads never render
- The 6b rebalance log now stores post-trade `cash`/`shares`, making the account's daily value path replay exactly; older entries fall back to re-running the rule's arithmetic from the display-rounded exposure

### Notes
- **Returns are measured close-to-close from a single price source, not from the recorded execution price.** The free-tier quote feed runs ~2% off the official close; at a 1-week horizon that gap is larger than the move being measured, so the graded return deliberately isn't the account's exact P&L
- Rate-limit exhaustion is reported as "not scored yet — reload in a minute", never as missing data. Twelve Data's free tier allows 8 requests/minute, and a grading pass shares that budget with the offline harness scripts — during development this run visibly rate-limited a concurrent `congresstrack.js` fetch
- Verified in headless Chrome against a local backend with seeded aged trades: band coverage, per-label buckets, the risk table and its verdict, small-n refusals, pending-horizon tracking with a next-maturity date, the empty state, and the legacy log-replay path; no console errors, 6a/6b panels unaffected

---

## [0.18.0] - 2026-07-18
### Added
- **Phase 6b: the auto-follow account — the measured sizing rule, running itself.** A second fake-money account that mechanically holds SPY at `min(1, normal vol / forecast vol)` — the exact rule `voltarget.js` measured positive — with the same parameters as the backtest (5pp rebalance band, 0.1% cost on traded dollars, the frozen ±3.9% SPY target, live EWMA forecast from `/api/history/SPY`). No human decisions: the rule is evaluated on page load, at most once per calendar day (honestly documented — a static site has no scheduler, and the measured turnover is ~2 rebalances/year, so visit-driven checking loses almost nothing). It can only ever de-risk; the panel says plainly to expect it to trail 100%-SPY in calm markets and earn its keep in storms — the forward run is the rule's real exam
- Rebalance log ("exposure 0% → 100% @ $743 · forecast ±3.7% vs norm ±3.9%"), value vs an always-100%-SPY benchmark, reset with confirmation. Buy-side sizing caps at available cash so fees never overdraw
- Verified in headless Chrome against the live backend: initial position taken correctly (no negative cash, exactly one log entry), same-day reloads idempotent, 6a panel unaffected, reset works, no console errors

### Notes
- **Phase 6 is now feature-complete for its first iteration** (6a manual + 6b auto-follow); what remains is time — the snapshot-grading report lands once trades have aged past their horizons

---

## [0.17.0] - 2026-07-18
### Added
- **Phase 6a: the paper portfolio — fake money, real prices, and a memory.** A new panel between the watchlist and the browse section: start with $10,000 of fake cash, buy any ticker by dollar amount at the live quote, sell positions at the live quote, 0.1% fee per trade (the harness's own cost model). Everything persists in localStorage; every reload revalues holdings at live prices against the benchmark of having put the whole pot into SPY on day one (price-only — the footer notes the missing ~1.2%/yr SPY dividend yield flatters the portfolio side)
- **Every trade records what the dashboard said at that moment** — the signal label, the expected swing, the vol-sized exposure — shown in the trade log ("dashboard said: signal HOLD · swing ±7.4% · vol-sized ~96%") and kept in full. This is the point of Phase 6: the shipped Phase-5 numbers face a forward test they can't backfit, and the snapshots are the grading records
- Guardrails: honest "fake money, not advice" footer, reset with confirmation, minimum $10 trade, insufficient-cash and bad-ticker errors, "valuing…" states instead of stale numbers
- Verified end-to-end in headless Chrome against the live backend: start → buy $1,000 AAPL (cash exactly $8,999.00 after the $1 fee) → snapshot logged → reload persistence + revaluation → sell with realized P&L → reset clears storage; no console errors

### Notes
- Phase 6b (auto-follow: a second portfolio mechanically running the measured vol-sizing rule via the portfolio.js engine) is the next step; 6a's manual account and snapshot log come first deliberately — the grading machinery needs trades to grade

---

## [0.16.0] - 2026-07-18
### Added
- **"Browse by category" — a second, lighter tier of stock display.** Below the watchlist cards, compact quote-only rows grouped into Index funds / Big tech / Defensive & dividend / Financials-energy-industrials (the 18-name measured research basket, each tagged "✓ measured") plus **Congress favorites** — the tickers House members actually traded most in the past year, with live buy/sell counts from the new `GET /api/congress/popular` endpoint (same 365-day disclosure index, top 12 by trade count). Rows cost only a cached Finnhub quote each; the expensive data (history/signal/congress/news) loads only when a row is clicked open into the full detail panel — that two-tier design is what lets the page show many stocks without breaking the free-tier rate limits
- Row interactions: tap a row → full detail view (report card, odds, sizing, House trades, news) without adding to the watchlist; **+** button → adds it as a full card (flips to ✓); non-basket tickers keep the honest "not measured yet" report card
- Verified end-to-end in headless Chrome against a local backend: categories render, quotes hydrate, a congress-favorite (IBM) opens with the honest fallback and no phantom card, add-button flow works, no console errors

---

## [0.15.0] - 2026-07-15
### Added
- **Phase 5e: per-member congressional track records — measured with every pre-committed guardrail, shipped as transparency.** `server/harness/congressdata.js` fetches and parses ALL 5,849 digital House PTRs 2014–2026 (dual-format parser for the pre-2019 untagged PDFs, mixed-case small-caps tickers, option-keyword guard; member-name canonicalization that merges Clerk-index variants like "Marjorie Taylor Mrs Greene" without merging the two Dingells; amendment dedupe) → 43,430 trades, 256 members. `server/harness/congresstrack.js` scores them per `congressional-trading.md` §6: clock at DISCLOSURE date, excess vs SPY (total-return) at 1m/3m/6m/12m, equal weight, ≥20-buys display gate, per-member percentile vs 1,000 matched-random portfolios (same tickers, random dates, seeded), best-of-N reality check, split-sample test
- **Member records in the UI**: a grey "Measured:" line under a member's name in the activity feed and per-ticker congress lists (6m excess vs SPY, n, luck percentile), a pooled-verdict footer, coverage caveats. Generated constant via `congresstrack.js --export`

### Measured
- **The post-2012 literature null, reproduced end-to-end.** Pooled disclosed buys: +1.20% vs SPY at 6m (n=7,272 scored buys, 50% hit rate — a coin), against Belmont et al.'s −0.26%; the modest positive is explained by priced-universe survivorship (34% of trades scoreable — the most-traded large-cap slice; delisted losers drop out), stated in the UI. Per-member: 77 qualify, 7 beat the 95th luck percentile (chance predicts ~4), and the best-of-N check fails decisively — the top record (+19.1%, n=31) sits at the 93rd percentile of the best-of-77-random distribution. Split-sample: 2 top-decile members stay positive out-of-sample but neither clears their full-sample random baseline. **No skill claim licensed; no member is endorsed; the feature is honest measurement of public disclosures**

---

## [0.14.0] - 2026-07-15
### Added
- **Phase 5d closed: volatility-targeted sizing — the project's second measured-positive result, and its first that's a strategy rather than a forecast.** New harness experiment (`server/harness/voltarget.js`): hold `w = min(1, normal vol / forecast vol)` of the stock — "normal" being the expanding median of the ticker's own EWMA vol series, forecast being the same λ=0.94 EWMA already shipped in the UI — long-only, no leverage, 5pp rebalance band, 0.1% cost on traded volume, nothing fitted, next-day information discipline, ship rule pre-committed in the header. Benchmarked against buy-and-hold AND a matched constant-exposure control (the strategy's own average weight held constant), so the timing of the de-risking is isolated from the mere fact of holding cash
- **"Sizing by calm vs. storm" line in the signal report card** — each measured ticker shows its normal typical-month swing (the frozen sizing target), the live implied exposure (target ÷ today's forecast from `/api/history`), and its own measured pair (worst drop and Sharpe, vol-targeted vs holding full), labeled a risk illustration, never advice and never a direction call. Legend expander explains the measured trade-off
- **Risk & sizing research digest** (`docs/research/risk-sizing.md`, 10 citations): Kelly (1956) as edge-over-variance and why zero measured edge makes it a ceiling, not a tip; fractional Kelly (MacLean-Thorp-Ziemba 2010; Samuelson 1979); Sharpe (1966/1994) and Sortino (1991); volatility targeting — Moreira & Muir (2017), Harvey et al. (2018), and Cederburg et al. (2020)'s fragility warning, which pre-registers Phase 6's forward test as the final arbiter
- `metrics.js` gains `sortino()` (downside-only denominator, same conventions as `sharpe()`) and `annualVol()`; `backtest.js` gains `simulateWeights()` — fractional exposure with costs on traded volume, generalizing the binary simulator (all-0/1 weights reproduce `simulate()` exactly); `export.js` computes and prints the per-ticker `vt` block

### Measured
- **The ship rule passes on both price sets, robustly.** Sharpe beats the matched constant-exposure control 12/18 (plain) and 16/18 (total-return), median 0.66 vs 0.57; max drawdown shallower than buy-and-hold 18/18 on both price sets (median −37% vs −59%); crisis windows: lost less than buy-and-hold in 18/18 (financial crisis, median −35% vs −50%), 17/18 (COVID), 15/18 (2022) — and unlike the MA family, which bought its crisis protection with 19 years of underperformance, the vol scaler gets it while *improving* per-unit-of-risk return. Robust to `--power=2`, `--band=0/0.10`, `--lambda=0.90/0.97`, and doubled costs (Sharpe majority 11–16/18 throughout). The honest cost: ~2.4pp/yr of raw CAGR at ~85% median average exposure — the claim is per-unit-of-risk and tail damage, never "more money." Laggards (XOM, INTC, PG, T) are the rebound-heavy tickers where storms resolved upward — the `calibration.md` rebound effect pricing the trade. Verified end-to-end in headless Chrome

---

## [0.13.0] - 2026-07-15
### Added
- **Phase 5c closed: the weighted multi-signal model was measured and declined.** New harness experiment (`server/harness/combo.js`): ridge-regularized logistic regression from the dashboard's four signals (MA state, RSI(14), MACD cross, ln EWMA vol — standardized per fold) to P(higher in 1w/1m/3m), with every weight fitted strictly inside `walkforward.js` training windows (5y/1y sliding, deterministic IRLS/Newton, unpenalized intercept so the features must add information *beyond* the base rate), scored on Brier/log-loss against expanding-window climatology on out-of-sample test days only, ship rule pre-committed in the script header before the first run. Congressional flow deliberately excluded (measured-null aggregate, ~1 year of per-ticker history; 5e measures per-member records instead)
- **Multi-signal research digest** (`docs/research/multi-signal.md`, 8 citations): why combination requires components with independent information (Bates & Granger 1969), why estimated weights lose to naive ones (Timmermann 2006), why equity-premium predictors die out-of-sample (Welch & Goyal 2008; Campbell & Thompson 2008), why shrinkage — not selection — is what survives (Rapach-Strauss-Zhou 2010), why ML edges live outside mega-caps (Gu-Kelly-Xiu 2020), and why 5c tested exactly one pre-committed spec (White 2000; Sullivan-Timmermann-White 1999)
- One legend sentence recording the null: no combined "score" exists on the dashboard because the combination was tested and lost to the base rate

### Measured
- **The combination fails everywhere, with the textbook shape of overfitting noise: 0/18 tickers beat climatology on Brier at 1w, 1m, AND 3m** — identical on log-loss and on total-return prices (median BSS −1.2% / −4.2% / −10.2%; 15 walk-forward folds, ~3,700 out-of-sample days per ticker, 270 fits per horizon). Damage grows with horizon (more overlap, more room to memorize noise) and shrinks as the ridge tightens (α 0.001→0.1 improves median 3m BSS from −10.7% to −5.9%) — the best version of the model is the one shrunk back to climatology. No feature achieves better than 65% cross-fold sign agreement; pooled calibration shows stated spreads of 30+ points collapsing to ~3 realized. The `calibration.md` §5 follow-up is answered: a fitted vol weight does lean positive at 3m (the rebound sign the fixed formula got backwards) but buys nothing out-of-sample. Per the pre-committed rule, no weighted score ships anywhere in the UI

---

## [0.12.0] - 2026-07-11
### Added
- **Phase 5b closed: up/down probabilities measured, base rates ship.** New harness experiment (`server/harness/prob.js`): four deterministic forecasters of P(higher in 1w/1m/3m/1y) — coin, expanding-window climatology (the base rate), and the Christoffersen–Diebold drift-over-vol model with full-history vol (ablation) and with the EWMA vol layer (candidate) — scored with proper scoring rules (Brier, log-loss) plus pooled calibration tables, with the ship rule pre-committed in the script header before the first run
- **"Odds of being higher" row in the signal report card** — each measured ticker's detail panel now shows its historical base rate of ending higher at 1w/1m/3m/1y (total-return, ~19y), labeled "what usually happened, not a forecast of this moment," with the measured note that every model tested made these odds worse. Legend expander explains why the vol forecast stays direction-free
- **`export.js` computes the odds** from the same frozen cache and now prints in the exact shape of index.html's constant (one aligned line per ticker), so regenerate-and-paste stays a clean diff
- **Probability-calibration research digest** (`docs/research/calibration.md`, 6 citations): proper scoring rules (Brier 1950; Gneiting & Raftery 2007), skill vs climatology (Murphy 1973), the tested Christoffersen & Diebold (2006) hypothesis, and pre-committed falsifiers (a fitted logit via walkforward.js, base-rate drift in Phase 6)
- `vol.js` helpers (`logReturns`, `ewmaVolSeries`) are now exported and its CLI guarded with `require.main`, so `prob.js` reuses the same math instead of duplicating it

### Measured
- **The vol layer does NOT improve direction probabilities — the base rate is the best probability we can offer.** The candidate beat climatology on Brier in 1/18 (1w), 0/18 (1m), 2/18 (3m), 8/18 (1y) tickers; identical verdict on log-loss and on total-return prices; median BSS −0.2% to −2.3%. Climatology itself beat the coin 15/14/13 of 18 at 1w/1m/3m (17/16/14 total-return). Failure mode localized by the calibration table: when high vol pushed stated P(up) under 50%, prices actually rose 56–79% of the time — turbulence marks rebounds, so shrinking toward 50% in storms is directionally backwards. Per the pre-committed rule, the vol layer stays out; verified end-to-end in headless Chrome (measured ticker shows odds row, unmeasured shows honest fallback, no console errors)

---

## [0.11.0] - 2026-07-06
### Added
- **Phase 5b opens: EWMA volatility, measured then shipped.** New harness experiment (`server/harness/vol.js`): does RiskMetrics EWMA (λ=0.94, published constant, nothing fitted) forecast the next 21 days' realized volatility? Scored vs two baselines (expanding-window climatology, last-month persistence) with rank correlation and decile calibration
- **`/api/history` returns `volatility`** (`ewmaVol` in server.js, math in sync with the harness): `annualPct` and `monthPct` (±1σ typical-month move) from the same ~250 closes it already fetches
- **"Expected swing (EWMA vol)" in the detail panel** — "±X% · typical month" next to RSI/MACD, plus a legend paragraph saying exactly what it is (measured-to-work bumpiness) and is not (direction, which stayed unpredictable in every test)
- **Volatility research digest** (`docs/research/volatility.md`, 7 citations): clustering since Mandelbrot 1963, ARCH/GARCH lineage, the Poon & Granger forecastability consensus, why plain EWMA over fitted GARCH, and pre-committed falsifiers (live band coverage, GARCH-via-walk-forward, horizon limits)

### Measured
- **The project's first positive result: volatility IS forecastable here.** Median rank correlation 0.59 between EWMA forecast and realized next-month vol (range 0.41–0.73 across 18 tickers; every directional signal scored ≈0); beats climatology 18/18 and persistence 18/18 on MAE; decile calibration monotonic from 14.9% (calmest forecast decile) to 38.4% (wildest). Identical on total-return prices; scoreboard unchanged at λ=0.90/0.97. Verified end-to-end in headless Chrome against the local backend

---

## [0.10.2] - 2026-07-06
### Added
- **Signal report card in the UI** — the detail panel now shows the dashboard's own measured backtest for its MA signal on that ticker: signal CAGR vs buy-and-hold CAGR, worst drawdown for both, trade count, and the matched-shuffle timing percentile, with a one-line honest reading (e.g. "underperformed buy-and-hold, but softened the worst crash"). Total-return prices, 0.1% cost/switch, ~19 years. Tickers outside the 18-name research basket say "not measured yet" instead of borrowing a number
- **`server/harness/export.js`** — generates the embedded report-card data from the frozen harness cache (`node export.js`); the constant in index.html carries a generated-by header and regeneration instructions

### Notes
- This closes Phase 5a completely: harness, baselines, event tests, walk-forward machinery, and results surfaced in the UI
- Verified in headless Chrome against the live backend (measured ticker shows numbers; unmeasured ticker shows the honest fallback; no console errors)

---

## [0.10.1] - 2026-07-05
### Added
- **Plain-language glossary** (`docs/research/glossary.md`): every term the digests and harness reports use — performance metrics, the honesty checks (base rates, matched random baselines, event tests, survivorship bias), fitting/overfitting/walk-forward, and strategy jargon — each defined against this project's own measured numbers, with a "where the results live" index. Linked from the research README and the root README

---

## [0.10.0] - 2026-07-05
### Added
- **Walk-forward machinery** (`server/harness/walkforward.js`): the out-of-sample split engine for FITTED strategies — `fit()` sees only the training window (the API makes lookahead impossible rather than discouraged), `apply()` gets the full prefix for indicator warmup, only stitched test segments are scored; sliding or anchored windows. Every rule tested so far had zero fitted parameters; from 5b/5c onward anything chosen from data must pass through this
- **First walk-forward experiment** (`server/harness/wfma.js`): yearly re-pick the best of 8 SMA crossover pairs (fast 10/20/50 × slow 50/100/200) from the prior 5 years, trade it forward, ~15 folds/ticker — vs buy-and-hold, the fixed dashboard rule, an untuned 50/200 golden cross (the "never re-pick" control), and the hindsight-best pair (the in-sample cheat, quantified). Flags: `--adjust`, `--cost=`, `--metric=cagr|sharpe`, `--train=`, `--test=`, `--anchored`

### Measured
- **In-sample MA optimization carries no information — the ma-timing.md §2 decay claim, demonstrated on our own data.** 270 pooled picks: the training winner's test-year rank averaged 4.67/8 (no-information mean 4.50 ± 0.28), repeated as test winner 9% (chance 12.5%), median training CAGR 9.4% shrank to 1.8% realized; 0/18 vs buy-and-hold CAGR and Sharpe; **lost to the untuned golden cross 14/18** — the tuning itself cost money. Robust across `--adjust`, Sharpe-selection, and anchored windows (mean rank 4.44–4.70). Full postscript in ma-timing.md §7. With this, 5a's machinery list is complete (UI surfacing remains)

---

## [0.9.11] - 2026-07-05
### Added
- **RSI(14) 30-recross event test** (`server/harness/rsievent.js` + `rsiSeries` in `strategies.js`, Wilder smoothing verified equal to server.js's `rsi()` to 1e-9): pools every moment RSI crosses back up through 30 as a flip→BUY through the existing `transitionStats` machinery, vs any-day base rates and 1,000 seeded matched-random draws, with the 2006–2016 / 2017+ subperiod split

### Measured
- **The rsi-macd.md §6 check #2, verdict: the reversal hypothesis fails at its own horizons.** 934 pooled recross events (RSI < 30 on just 2.8% of mega-cap ticker-days): 1-week up-rate below base (53.0% vs 54.8%), average forward return at the 1st percentile of matched-random — slightly worse than random days; same at 1 month (5th pct); identical on total-return; 2017+ turns the 1-week return negative. Pre-committed 1w/1m criterion decisively unmet — no tradable rule specced; a 94th-percentile 3-month blip examined and declined (wrong horizon, crash-clustered events). Both displayed indicators (RSI + MACD) are now tested end-to-end and both stay descriptive. Full verdict in rsi-macd.md §8

---

## [0.9.10] - 2026-07-05
### Added
- **`--strategy=macdcross`** (`macdCrossSignalSeries` + `emaSeries` in `strategies.js`, mirroring server.js's MACD(12/26/9) math): long when the MACD line is above its 9-EMA signal line, else cash

### Measured
- **The rsi-macd.md §5 test, verdict as pre-committed: MACD's crossover carries no timing information** — 1/18 CAGR and 2/18 Sharpe on total-return, matched-shuffle percentile 43%, pooled hit rates = base rates on ~45,000 signal-days, on the heaviest trade counts of any rule (364–438 per ~19.7y). Crisis protection best-in-family (18/18 COVID), completing the speed-vs-whipsaw spectrum: MACD 18/18 > daily MA 17/18 > Faber 13/18 > TSMOM 11/18. Does not enter Phase 5c scoring

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