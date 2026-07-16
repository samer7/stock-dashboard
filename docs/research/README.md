# Research notes

This folder is the project's "source of truth" workstream: plain-language digests of
published quantitative-finance research, with citations, each tied to something this
project implements and measures.

New to the vocabulary (base rates, drawdowns, walk-forward, whipsaws…)? Start with
the **[glossary](glossary.md)** — every term is defined against this project's own
measured results, and it lists where each verdict is written up.

The loop for every topic:

1. **Digest** — survey the published research and summarize it here, with citations.
2. **Implement** — where the research describes a testable rule, code it as a
   deterministic signal (`server/harness/strategies.js`).
3. **Verify** — backtest it out-of-sample in the harness (`server/harness/run.js`) and
   record what *our* data shows next to what the literature claims.

Queued topics (in order):

- **Moving-average timing rules** — the dashboard already displays an MA20/50/200
  signal; does the literature (and our harness) say rules like it beat buy-and-hold?
  **Harness result (2026-07, 18-ticker sweep, ~19 years each — `node sweep.js`):**
  the rule beat buy-and-hold on return in **1 of 18** tickers (Ford — a long
  sideways/declining history, exactly where trend-following theory says exiting
  helps) and on Sharpe in 1 of 18, but produced a **shallower max drawdown in 16
  of 18**. Median "beat random switching" percentile: 39% — the *timing* carries
  no information. The pooled hit rates make this vivid: BUY days were followed by
  gains at almost exactly the base rate at every horizon (e.g. 61.4% vs 61.2%
  base at 3 months, across ~35,000 signal-days), and SELL days likewise. The
  drawdown reduction comes purely from being in the market only ~58% of the
  time, not from picking *which* days. Conclusion so far: the signal is a
  risk-dampener, not a return generator — consistent with the post-1990s
  academic consensus on MA rules after costs. **Formal digest with citations:
  [ma-timing.md](ma-timing.md)** (2026-07-05) — the literature corroborates the
  harness verdict point for point, and its "what would change our mind" section
  queues the next falsifiable tests (Faber 10-month SMA, 12-month TSMOM,
  crisis-window analysis).
  **Crisis-window test (2026-07-05, `crisisStats` — the direct test of the
  drawdown claim):** inside the S&P peak-to-trough windows the rule is
  supposed to win, it does, decisively — financial crisis: 17/18 tickers,
  median −9.5% vs −50.5% buy-and-hold; COVID crash: 17/18, −4.8% vs −30.7%;
  2022 bear: 15/18, −7.6% vs −25.8%. 49 of 54 ticker-windows. The
  risk-dampener story survives its own falsification test: the rule's whole
  full-period return deficit is the premium it pays (via whipsaws and missed
  recoveries) for genuinely large protection in prolonged declines.
  **Faber 10-month SMA (2026-07-05, `--strategy=faber`):** the literature's
  favorite variant behaves exactly as predicted — still loses to buy-and-hold
  on return (5/18 price-only, 0/6 total-return on the dividend names), timing
  still indistinguishable from random placement (median matched percentile
  47%), but keeps the drawdown benefit (15/18) with 4–8× fewer trades (21–60
  per ~19y vs 150–233 for the daily rule) and wins the crisis windows
  (17/18, 13/18, 17/18 — slightly weaker in COVID, where a monthly cadence
  exits too slowly for a 23-day crash). Two variants, one conclusion.
  **12-month TSMOM (2026-07-05, `--strategy=tsmom`, long/cash):** third
  variant, same verdict — 3/18 on CAGR price-only, 0/6 total-return, matched
  percentile 34%, drawdown shallower 16/18 on the fewest trades yet (13–41
  per ~19y). The cross-variant pattern is the real finding: crisis protection
  scales with reaction speed (COVID crash: daily rule 17/18, Faber 13/18,
  TSMOM 11/18 — a 12-month lookback stays bullish through a 5-week crash),
  while all three win the slow 2008 grind near-unanimously. Slow rules
  protect against slow declines; fast rules catch fast ones and pay in
  whipsaws. Three variants, one conclusion — the MA topic is closed.
  **Robustness checks (same date):** with dividends reinvested (`--adjust`,
  total-return prices) the verdict *strengthens* — 0/6 on both CAGR and Sharpe
  across the dividend-heavy names (T/KO/PG/JNJ/XOM/SPY); price-only data had
  been understating buy-and-hold (e.g. T: -2.1% price-only vs +3.5% total
  return). And the result is insensitive to the cost assumption: AAPL strategy
  CAGR is 14.5%/13.3%/12.2% at 0/0.1%/0.2% per-switch cost vs 25.1% buy-and-hold
  in all cases.
  **Event test (2026-07-05, signal-transition analysis):** the pooled hit rates
  above count every signal-*day*, but a BUY that stays on for months is one
  decision counted hundreds of times (autocorrelated samples). The sharper test
  looks only at the ~3,700 days the signal *flipped* to BUY (and ~3,840 flips
  to SELL) across the 18-ticker basket: even at the moment of flipping, the
  signal carries no information. After a flip to BUY, the up-rate matches the
  any-day base at every horizon (e.g. 54.1% vs 54.7% at 1 week; 67.9% vs 68.4%
  at 1 year), and the average forward return is actually slightly *below* the
  any-day average at every horizon (13.9% vs 15.4% at 1 year). Flips to SELL
  likewise: the market rose at the normal rate and by the normal amount after
  them. Total-return prices on the six dividend names (~1,330 flips) show the
  same pattern. So the earlier conclusion survives its toughest framing: not
  only are BUY days no better than ordinary days, the *moment the signal turns*
  — the thing a dashboard user actually reacts to — predicts nothing.
  **Matched random baseline (same date):** the original random baseline matched
  trade count but not time-in-market (random flips average ~50% invested vs the
  strategy's ~58%), which slightly flattered the strategy in rising markets.
  The fairer test shuffles the strategy's own holding periods in place — same
  switches, same total days invested, only the placement randomized. Median
  percentile across the basket: **34%** (vs 39% under the old baseline; AAPL
  falls from 74% to 58%). Below 50% means the rule's actual placement of its
  holding periods did slightly *worse* than random placements of the identical
  pattern — fully consistent with the flip-level finding above.
  **Walk-forward postscript (2026-07-05, `wfma.js`): optimizing the MA lengths
  adds nothing — measured out-of-sample.** Refit yearly from the prior 5y over
  8 SMA crossover pairs, trade the winner forward, ~15 folds per ticker: the
  training winner's test-year rank averaged 4.67/8 (no-information mean 4.50),
  its 9.4% median training CAGR shrank to 1.8% realized, and the re-picked rule
  lost to an untuned 50/200 golden cross in 14/18 tickers — tuning cost money.
  0/18 vs buy-and-hold either way; robust to `--adjust`, Sharpe-selection, and
  anchored windows. Full postscript in [ma-timing.md](ma-timing.md) §7.
- **Momentum** — the most robust return anomaly in the academic literature
  (Jegadeesh & Titman 1993 and hundreds of follow-ups).
  **Digest: [momentum.md](momentum.md)** (2026-07-05, 13 verified citations):
  cross-sectional momentum (ranking stocks against each other — distinct from
  the time-series variant the harness already rejected) is real and pervasive,
  but the caveats stack: half the profit is on the short side, turnover costs
  eat much of the rest, it crashes in market rebounds, and it decays ~58%
  post-publication. Realistic long-only after-cost edge on large caps: ~1–3%/yr
  of relative edge, and momentum spreads are smallest among mega-caps — exactly
  our basket. **Harness verdict (2026-07-05, `node momentum.js`, on the new
  portfolio-mode simulator):** the digest's proposed rule — 12-2 relative
  momentum, top-3, monthly — was run over 227 months (2007–2026) and landed
  almost exactly on the literature's prediction. Total-return, after costs:
  20.0% CAGR vs the equal-weight basket's 19.4% (+0.6pp — noise), but a WORSE
  Sharpe (0.80 vs 0.87), worse max drawdown (−60% vs −52%), and a monthly hit
  rate of 48.0% — a coin. Price-only it lost outright. The 12-1 ablation came
  out *better* than 12-2 (the opposite of Jegadeesh 1990) — investigated, not
  a bug: 85% of picks are shared and the gap is a handful of NVDA-surge months,
  i.e. the 18-name noise problem demonstrated from inside. It lagged the 2009
  rebound as real momentum should, but not 2020's (tech led that one — basket
  artifact), and lost more than the basket in every crisis window (no cash
  exit). Pre-committed criterion (beat on CAGR *and* Sharpe): **not met — no
  relative-strength rank ships.** Full verdict in [momentum.md](momentum.md) §7.
- **Congressional trading** — Ziobrowski et al. (2004, 2011) found large excess
  returns pre-STOCK Act; post-2012 studies find the edge much smaller or gone.
  **Digest: [congressional-trading.md](congressional-trading.md)** (2026-07-05,
  7 verified citations): the pre-2012 "Congress beats the market" result did
  not survive re-analysis (Eggers & Hainmueller 2013 found members *lag* index
  funds), post-STOCK-Act studies unanimously find no edge (House buys
  underperform ~26 bps at 6 months, Belmont et al. 2022), and the live
  copy-congress ETFs (NANC/KRUZ) have roughly tracked SPY before fees. Honest
  prior for Phase 5e: per-member records will mostly measure luck — build it
  as a transparency + honest-measurement feature with pre-committed method,
  ≥20-trade minimums, matched-random-trade baselines, and a best-of-N null
  for the leaderboard (with hundreds of filers, someone always looks brilliant
  by chance).

- **RSI and MACD** — the two indicators the dashboard already displays
  (RSI(14), MACD(12/26/9)) but has never tested.
  **Digest: [rsi-macd.md](rsi-macd.md)** (2026-07-05, 12 verified citations):
  both are practitioner inventions with zero founding academic evidence
  (Wilder's 1978 book; Appel's newsletter), and MACD > 0 is literally an
  EMA12/EMA26 crossover — the MA family the harness already closed. The
  direct academic tests find noise: the dashboard's exact MACD(12/26/9) rule
  showed "no predictability" in any of five developed markets and was
  significantly harmful in the DAX (Chong, Ng & Liew 2014, read from the
  primary source); nothing survives data-snooping correction (Marshall et
  al. 2008). RSI's one real ancestor — short-term reversal — never lived in
  mega-caps and has decayed an order of magnitude since 1995 (Khandani & Lo
  2007), and its surviving profit is a liquidity-provision payment a
  next-day-execution retail rule can't capture (Da, Liu & Schaumburg 2014).
  **Harness verdict (2026-07-05, `--strategy=macdcross`): prediction
  confirmed.** Total-return: 1/18 on CAGR (Ford again), 2/18 Sharpe, matched
  percentile 43%, pooled hit rates = base rates at every horizon on ~45,000
  signal-days, on the heaviest trade counts yet (364–438 per ~19.7y). Crisis
  protection is the best of any variant (18/18 COVID, median −2.9% vs −30.7%),
  completing the speed-vs-whipsaw spectrum: MACD 18/18 > daily MA 17/18 >
  Faber 13/18 > TSMOM 11/18. No timing information; stays descriptive UI
  context, does not enter 5c scoring. Full verdict in [rsi-macd.md](rsi-macd.md) §7.
  **RSI recross verdict (2026-07-05, `rsievent.js`): reversal is dead here
  too.** 934 pooled RSI(14) 30-recross events (oversold is rare — 2.8% of
  mega-cap ticker-days): at 1 week the up-rate is below base (53.0% vs 54.8%)
  and the average forward return lands at the 1st percentile of 1,000
  matched-random draws — slightly worse than random days; 1 month the same
  (5th percentile); identical on total-return prices; no subperiod shows a
  bump (2017+ turns the 1-week return negative, as Khandani & Lo predict).
  The pre-committed 1w/1m criterion is decisively unmet — no tradable rule
  specced. (A 94th-percentile blip at 3 months is examined and declined in
  §8: wrong horizon for the hypothesis, crash-clustered events, tiny raw
  gap.) Both displayed indicators are now tested end-to-end; both stay
  descriptive. Full verdict in [rsi-macd.md](rsi-macd.md) §8.

- **Volatility forecasting** — the literature's one big exception to "nothing is
  predictable," and Phase 5b's foundation.
  **Digest: [volatility.md](volatility.md)** (2026-07-06, 7 citations): volatility
  clusters (Mandelbrot 1963; Engle's Nobel-winning ARCH), is forecastable at
  horizons up to ~1–2 months (Poon & Granger 2003, 93-paper survey), and simple
  estimators compete well — so we use RiskMetrics EWMA (λ=0.94, published constant,
  nothing fitted).
  **Harness verdict (2026-07-06, `vol.js`): the project's FIRST POSITIVE result.**
  Median rank correlation between EWMA forecast and realized next-21-day vol:
  **0.59** (range 0.41–0.73; directional signals all scored ≈0). Beat climatology
  and persistence baselines on MAE **18/18** each; decile calibration perfectly
  monotonic (14.9% realized in the calmest forecast decile → 38.4% in the wildest).
  Identical on total-return prices, insensitive to λ. Shipped as the detail panel's
  "expected swing ±X%/month" — bumpiness only, never direction.

- **Probability calibration** — Phase 5b proper: can the dashboard state honest
  up/down probabilities, and can the measured vol forecast sharpen them?
  **Digest: [calibration.md](calibration.md)** (2026-07-11, 6 citations): proper
  scoring rules from weather forecasting (Brier 1950; Gneiting & Raftery 2007),
  skill measured against climatology — the base rate — per Murphy (1973), and the
  one live hypothesis: Christoffersen & Diebold (2006) show sign forecastability
  can be inherited from vol dynamics via P(up) = Φ(drift/vol).
  **Harness verdict (2026-07-11, `prob.js`): the base rate wins; the vol layer is
  out.** Pre-committed test, 18 tickers × 4 horizons, ~4,200 forecast days each:
  the drift-over-EWMA-vol model beat expanding-window climatology on Brier in
  **1/18 (1w), 0/18 (1m), 2/18 (3m), 8/18 (1y)** — same on log-loss and on
  total-return prices — while climatology itself beat the coin 15/14/13 of 18 at
  1w/1m/3m. The calibration table localizes the failure: whenever high vol pushed
  the model's P(up) below 50%, prices actually rose 56–79% of the time — crash
  bottoms are rebound moments, so vol-shrinking toward 50% fires backwards. The
  Gaussian ablation with full-history vol *also* lost to plain counting (2/18):
  left-skewed fat-tailed returns make the formula understate up-rates. What ships
  is the measured winner, labeled honestly: per-ticker base-rate odds at each
  horizon in the UI report card. **Phase 5b is closed**; a fitted probability
  model (logit on vol/skew via `walkforward.js`) is the documented
  would-change-our-mind follow-up.

- **Multi-signal combination** — Phase 5c: do *fitted weights* over the dashboard's
  signals (MA state, RSI, MACD, EWMA vol) produce probabilities better than base
  rates?
  **Digest: [multi-signal.md](multi-signal.md)** (2026-07-15, 8 citations):
  combination helps only when components carry independent information (Bates &
  Granger 1969); estimated weights usually lose to naive ones (Timmermann 2006 —
  the "combination puzzle"); equity-premium predictors die out-of-sample (Welch &
  Goyal 2008; Campbell & Thompson 2008); what survives is shrinkage, not selection
  (Rapach-Strauss-Zhou 2010); ML gains live in small caps, not our mega-cap basket
  (Gu-Kelly-Xiu 2020); and best-of-N testing manufactures fake edges (White 2000;
  Sullivan-Timmermann-White 1999) — so 5c tested exactly ONE pre-committed spec.
  **Harness verdict (2026-07-15, `combo.js`): the combination fails everywhere —
  0/18 tickers beat climatology on Brier at 1w, 1m, AND 3m**, identical on
  total-return prices and log-loss (median BSS −1.2%/−4.2%/−10.2%; 15 walk-forward
  folds and ~3,700 out-of-sample days per ticker). The failure's shape is pure
  overfitting: damage grows with horizon, shrinks as the ridge tightens (α 0.001 →
  0.1 moves median 3m BSS from −10.7% to −5.9%; the best model is the one shrunk
  back to climatology), and across 270 fits per horizon no feature reaches better
  than 65% sign agreement. The calibration.md §5 follow-up is answered: a fitted
  vol weight leans positive at 3m (the rebound sign) but buys nothing
  out-of-sample. Per the pre-committed ship rule, **no weighted score ships**; the
  legend records the null. **Phase 5c is closed.**

Digests so far: [ma-timing.md](ma-timing.md), [momentum.md](momentum.md),
[congressional-trading.md](congressional-trading.md), [rsi-macd.md](rsi-macd.md),
[volatility.md](volatility.md), [calibration.md](calibration.md),
[multi-signal.md](multi-signal.md).
Other entries land here as the topics are researched.
