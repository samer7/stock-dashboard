# Multi-signal combination: do fitted weights buy anything?

*Digest written 2026-07-15 alongside the Phase 5c measurement (`combo.js`). This is
the phase the roadmap calls "weighted multi-signal model." The honest prior going in:
every component signal this project has tested carries zero timing information on its
own, so the burden of proof is on the combination — and the literature says that
burden is heavy.*

## In one paragraph

Phase 5c asks whether *combining* the dashboard's signals — MA state, RSI, MACD, and
the EWMA volatility forecast — with weights *fitted to data* produces up/down
probabilities better than the plain base rate. Forecast-combination theory says
combining genuinely independent forecasts helps (Bates & Granger 1969), but fifty
years of follow-up added two brutal caveats: estimated "optimal" weights usually lose
to naive equal weights because weight-estimation error eats the gain (Timmermann
2006), and in equity return prediction specifically, almost nothing beats the
historical average out-of-sample at all (Welch & Goyal 2008; Campbell & Thompson
2008). Where combination *does* eke out measurable gains, it's by heavy shrinkage of
many weak predictors toward the mean (Rapach, Strauss & Zhou 2010), and where machine
learning finds real predictability, it lives mostly in small, illiquid stocks — not
mega-caps like our basket (Gu, Kelly & Xiu 2020). Layer on the data-snooping problem
(White 2000; Sullivan, Timmermann & White 1999) — testing many rules and keeping the
best one manufactures fake edges — and the design writes itself: **one** pre-committed
model (ridge-regularized logistic regression), fitted only inside `walkforward.js`
training windows, scored only on stitched test segments, against climatology, with the
ship rule written before the first run. The one genuinely open question: `prob.js`
found that high-volatility moments are *rebound* moments — a fixed-formula vol layer
fired backwards, but a **fitted** weight is free to learn the positive sign. Whether
that survives out-of-sample is exactly what this experiment measures.

## 1. What the combination literature actually promises

- **Combining helps when components carry independent information.** Bates & Granger
  (1969) showed a weighted average of two unbiased forecasts has lower error variance
  than either alone unless they're perfectly correlated. This is the theoretical
  charter for "weighted multi-signal" — but note the premise: the components must each
  carry *some* information. Ours are measured at zero (MA timing: `ma-timing.md`;
  RSI and MACD: `rsi-macd.md`). A weighted sum of zeros is zero unless the fit finds
  conditioning or interaction effects the single-signal tests couldn't see.
- **The forecast combination puzzle.** Timmermann's (2006) survey of decades of
  evidence: theoretically optimal estimated weights routinely lose to equal weights
  out-of-sample, because the weights are themselves estimates with error. Moral for
  us: keep the model tiny and regularized; distrust any weight the folds don't agree
  on.
- **Equity premium prediction is where predictors go to die.** Welch & Goyal (2008)
  re-tested every popular predictor of the U.S. equity premium and found essentially
  none beat the recursive historical mean out-of-sample. Campbell & Thompson (2008)
  rescued only tiny gains (monthly out-of-sample R² on the order of half a percent)
  and only after imposing sign restrictions. Our climatology baseline is exactly
  their "historical average" benchmark, in probability form.
- **What works is shrinkage, not selection.** Rapach, Strauss & Zhou (2010) got
  robust (small) out-of-sample gains by *averaging* many weak forecasts — a
  poor-man's ridge — rather than picking winners. Consistent with our own v0.10.0
  result: picking the best-backtested MA pair was worthless; selection is the enemy.
- **ML finds real cross-sectional signal — mostly where we can't trade.** Gu, Kelly &
  Xiu (2020) ran the full ML toolkit over 30,000 stocks: genuine predictability
  exists, regularization is what makes it work, and the economic gains concentrate in
  small/illiquid names. For large liquid names (our 18-ticker basket is mega-cap by
  construction) the measurable edge mostly evaporates.
- **The best-of-N rule is a lie unless you correct for N.** White (2000) formalized
  the "reality check": test enough rules and the best one looks great by chance.
  Sullivan, Timmermann & White (1999) applied it to 7,846 technical rules on 90 years
  of the Dow — the apparent winners lost significance after the correction. Our
  defense is structural: 5c tests exactly ONE model spec, pre-committed here, and the
  ship rule was written before the first run.

## 2. What 5c combines — and what it deliberately leaves out

Features, all deterministic, all causal at day *t*, all already displayed or measured
by the dashboard:

| Feature | Encoding | Prior from our own measurements |
| --- | --- | --- |
| MA state | displayed BUY/HOLD/SELL as +1/0/−1 | zero timing information (`ma-timing.md`) |
| RSI(14) | (RSI − 50)/50 | reversal dead at its own horizons (`rsi-macd.md` §8) |
| MACD cross | above/below signal line as +1/−1 | no timing information (`rsi-macd.md` §7) |
| EWMA vol | ln(current EWMA σ), z-scored per training window | forecasts *swing size* well (`volatility.md`); as a fixed-formula direction input it fired *backwards* (`calibration.md`) — a fitted weight may learn the rebound sign |

**Congressional flow is deliberately absent.** The digest verdict
(`congressional-trading.md`) is that post-2012 aggregate flow carries no copyable
edge; our pipeline holds only ~1 year of per-ticker history (nowhere near enough to
fit or score at these horizons); and Phase 5e will measure per-member records on
their own terms with their own guardrails. Wiring a known-null, data-starved feature
into a fitted model would only add noise and a data-snooping surface.

**The model** is the smallest thing that can express "weighted multi-signal":
logistic regression from the 4 standardized features to P(price higher in *h* days),
h ∈ {5, 21, 63} trading days (1w/1m/3m — the 1y horizon is skipped: ~20 years of data
holds only ~20 independent 1-year windows, nowhere near enough to fit on). L2 (ridge)
penalty α = 0.01 on standardized weights, intercept unpenalized — the intercept
learns the training-window base rate, so the features must add information *beyond*
climatology to score better. Fitting is deterministic (IRLS/Newton, fixed iteration
cap, no randomness anywhere).

**The discipline:** every fit sees only its `walkforward.js` training window (5y
sliding, 1y test, the same folds as `wfma.js`); only stitched test-segment
probabilities are scored; the baseline is expanding-window climatology exactly as in
`prob.js`; scoring is Brier + log-loss (proper rules only, per `calibration.md`).

## 3. The pre-committed test (ship rule written before the first run)

From the `combo.js` header, verbatim in substance: the combined probability reaches
the UI only if **(a)** the fitted model beats climatology on Brier score for a
majority of tickers (≥10/18) at BOTH the 1w and 1m horizons, **(b)** the verdict
survives total-return prices (`--adjust`) and a 10×/÷10 change of the ridge strength,
and **(c)** the pooled calibration table is roughly monotone. Anything less: nothing
ships, the null goes in the legend next to the other honest nulls, and no weighted
score appears anywhere in the UI. Secondary diagnostics (not ship criteria): the
fitted coefficients per fold — do the folds even agree on a *sign* for any feature? —
and per-feature ablations if the headline result needs localizing.

## 4. Verdict (2026-07-15, `combo.js`)

**The combination fails everywhere, and the failure has a clean shape: the fitted
weights are pure noise, and the more freedom you give them, the worse they score.**

- **Headline: 0/18 tickers beat climatology on Brier at every horizon** — 1w, 1m, and
  3m — on both split-adjusted and total-return prices, on log-loss as well. Median
  Brier skill scores: −1.2% (1w), −4.2% (1m), −10.2% (3m). 15 walk-forward folds per
  ticker, ~3,700 out-of-sample test days each, 270 independent fits per horizon.
- **The damage grows with horizon.** That's the signature of overfitting, not signal:
  longer horizons have fewer effectively-independent training outcomes (a 63-day
  window overlaps 62/63 with its neighbor), so the fit has more room to memorize
  noise, and pays more for it out-of-sample.
- **The damage shrinks as the ridge tightens.** At 10× the penalty (α = 0.1) the
  median BSS improves to −0.7%/−2.5%/−5.9%; at α = 0.001 it worsens to
  −1.5%/−4.6%/−10.7%. Extrapolate: the best version of this model is the one whose
  weights are shrunk all the way to zero — which *is* climatology. The Timmermann
  (2006) combination puzzle and the Rapach-Strauss-Zhou shrinkage lesson, reproduced
  on our own data in one flag.
- **The folds can't agree on what the weights should even be.** Across 270 fits per
  horizon, no feature achieves better than 65% sign agreement (a coin gets 50%), and
  every mean coefficient is small against its own cross-fold spread (e.g. 1m: MA
  −0.08±0.27, RSI −0.06±0.24, MACD +0.05±0.19, vol +0.02±0.22). Weights that flip
  sign fold to fold are estimates of nothing.
- **The calibration table repeats prob.js's lesson.** Pooled at 1m, when the model
  said "under 50%" the price rose 58% of the time; said ">70%", it rose 61% — the
  stated spread of 30+ points collapses to a realized spread of ~3. The fit
  manufactures confidence out of noise in both directions.
- **The vol-rebound follow-up is answered.** `calibration.md` §5 asked whether a
  *fitted* vol weight could learn the "high vol → rebound" sign the fixed formula got
  backwards. The fit does try — the vol coefficient leans positive at 3m
  (+0.11±0.39, 65% of folds) — but it buys nothing out-of-sample, and at 1w/1m the
  sign agreement is a coin flip. The rebound pattern is real enough to tilt training
  fits and too weak/unstable to survive them.

Per the pre-committed ship rule: **nothing ships.** No weighted score, no combined
probability, no "model says" anywhere in the UI. The legend gains one sentence
recording the null. The report card's base-rate odds remain the best probability the
project can honestly display — now measured against both a fixed formula (5b) and a
fitted combination (5c).

The learning-project moral, stated once for the record: this is what the literature
said would happen (§1), measured on our own data with our own machinery. The
combination couldn't add information because there was no information in the
components to combine — Bates & Granger's premise was never met. The next candidates
worth harness time are *new information sources* (5e's per-member congressional
records), not new arithmetic over the old ones.

## 5. What would change our mind

1. **A component signal measured to carry real information.** The combination's
   plausibility is bounded by its inputs. If some future signal passes its own
   single-signal test (the way EWMA vol passed for swing size), re-running 5c with it
   included is cheap and pre-authorized — same spec, same ship rule.
2. **Fold-stable coefficients with a story.** Even under a null headline, if the
   folds unanimously agree on (say) a positive vol coefficient with a real Brier gain
   at one horizon, that's the documented follow-up from `calibration.md` §5 knocking —
   it would justify a dedicated single-feature experiment, not a silent ship.
3. **Cross-sectional, not time-series, combination.** Gu-Kelly-Xiu-style predictability
   is about ranking stocks against each other, which our per-ticker time-series test
   can't see. A relative-strength experiment already failed here (`momentum.md` §7),
   but a multi-feature *ranking* model on a survivorship-clean universe would be a
   different (Phase 7+, data-permitting) question.

## References

- Bates, J.M. & Granger, C.W.J. (1969). "The Combination of Forecasts." *Operational
  Research Quarterly* 20(4), 451–468.
- Timmermann, A. (2006). "Forecast Combinations." In *Handbook of Economic
  Forecasting*, Vol. 1, ch. 4. (The forecast combination puzzle.)
- Welch, I. & Goyal, A. (2008). "A Comprehensive Look at the Empirical Performance of
  Equity Premium Prediction." *Review of Financial Studies* 21(4), 1455–1508.
- Campbell, J.Y. & Thompson, S.B. (2008). "Predicting Excess Stock Returns Out of
  Sample: Can Anything Beat the Historical Average?" *Review of Financial Studies*
  21(4), 1509–1531.
- Rapach, D.E., Strauss, J.K. & Zhou, G. (2010). "Out-of-Sample Equity Premium
  Prediction: Combination Forecasts and Links to the Real Economy." *Review of
  Financial Studies* 23(2), 821–862.
- Gu, S., Kelly, B. & Xiu, D. (2020). "Empirical Asset Pricing via Machine Learning."
  *Review of Financial Studies* 33(5), 2223–2273.
- White, H. (2000). "A Reality Check for Data Snooping." *Econometrica* 68(5),
  1097–1126.
- Sullivan, R., Timmermann, A. & White, H. (1999). "Data-Snooping, Technical Trading
  Rule Performance, and the Bootstrap." *Journal of Finance* 54(5), 1647–1691.
