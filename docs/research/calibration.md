# Calibrated probabilities: when the best forecast is the base rate

*Digest written 2026-07-11 alongside the Phase 5b probability measurement (`prob.js`).
Compact like the volatility digest: the scoring theory is settled (it comes from
weather forecasting), the one interesting hypothesis was tested the day this was
written, and the verdict was unambiguous.*

## In one paragraph

Phase 5b's goal was to replace bare BUY/HOLD/SELL labels with honest probabilities:
"P(higher in 1 month): 62%." The theory of *scoring* such statements is settled —
proper scoring rules (Brier 1950; Gneiting & Raftery 2007) reward saying your true
probability and punish both bluffing and hedging, and the mandatory baseline is
**climatology**, the plain historical base rate (Murphy 1973 — a forecaster gets zero
credit for "rain is rare in July"). The one live hypothesis was from Christoffersen &
Diebold (2006): even when returns are unpredictable, return *signs* can be slightly
forecastable, because P(up) = Φ(drift/vol) moves when volatility moves — and our EWMA
vol forecast is measured to work (0.59 rank correlation, [volatility.md](volatility.md)).
We tested exactly that, pre-committed, on 18 tickers × 4 horizons: **the vol layer
made the probabilities worse at every horizon** (beat the base rate on Brier score in
1/18, 0/18, 2/18, 8/18 tickers at 1w/1m/3m/1y; same on total-return prices). The
failure is instructive, not mysterious: high-vol moments are disproportionately
rebound moments, so shrinking P(up) toward 50% in storms fires at exactly the wrong
times. What ships is the honest winner: per-ticker base rates per horizon, labeled as
base rates — plus the measured fact that they were the *best* probability we could
produce. The vol forecast keeps doing the one job it's measured to do: swing size,
never direction.

## 1. Proper scoring rules, or: how to keep a probability honest

A probability forecast can't be graded "right/wrong" on one outcome — saying 60% and
seeing a down month is not an error. The fix, invented for weather forecasts, is a
**proper scoring rule**: a penalty function with the property that your expected
penalty is minimized by stating your true belief (Gneiting & Raftery 2007). We use the
two standard ones:

- **Brier score** (Brier 1950): mean of (p − outcome)², outcome ∈ {0,1}. 0 is perfect;
  always saying 50% scores exactly 0.25.
- **Log-loss**: mean of −ln(probability assigned to what happened). Punishes confident
  wrongness brutally — which is the point.

Neither means anything alone; skill is *relative to climatology* (Murphy 1973): the
**Brier skill score** BSS = 1 − Brier(model)/Brier(climatology). Stocks drift up —
"up in 3 months" is true ~65–75% of the time for most of our basket — so a model must
beat *that*, not a coin. This is the same discipline the harness has applied to every
signal (base rates, matched baselines), now in probability form.

**Calibration** is the second, separate virtue: of all the times you said 60%, did it
happen 60% of the time? A forecast can be calibrated but useless (always say the base
rate) or sharp but dishonest (bold and wrong). Proper scores reward both at once;
calibration tables show where the honesty breaks.

## 2. The one hypothesis worth testing

Christoffersen & Diebold (2006) made the clean theoretical point: suppose returns have
a small positive drift μ and time-varying volatility σ_t, and nothing else is
predictable. Then

    P(up over h days) = Φ( μ·h / (σ_t·√h) )

is *itself* time-varying — when σ_t is forecastable (it is; that's our one positive
result), sign probabilities inherit a little forecastability with zero directional
information anywhere. High current vol → drift drowns in noise → P(up) sinks toward
50%; calm → P(up) rises toward the drift-implied rate. This was the project's best
remaining shot at probabilities better than base rates, using only parts we already
own: expanding-window drift (base rate material) + the EWMA vol layer. Nothing fitted,
everything causal — so no walk-forward machinery was needed; there is no in-sample to
leak.

## 3. The pre-committed test and its verdict (2026-07-11, `prob.js`)

**Design** (written into the script header before the first run): 18 tickers, ~4,200
forecast days each after a 3-year warmup, horizons 1w/1m/3m/1y. Four forecasters —
coin (0.5), **climatology** (expanding historical up-rate at that horizon), the
Christoffersen–Diebold formula with expanding full-history vol (`gauss-clim`, ablation),
and with current EWMA vol (`gauss-ewma`, the candidate). Ship rule, pre-committed: the
vol layer reaches the UI only if it beats climatology on Brier for a majority of
tickers at 1w and 1m, with a roughly monotone calibration table. Scored on Brier and
log-loss; identical runs on split-adjusted and total-return prices.

**Verdict: the base rate wins; the vol layer is out.**

- `gauss-ewma` beat climatology on Brier in **1/18 (1w), 0/18 (1m), 2/18 (3m), 8/18
  (1y)** tickers (median BSS −0.2% to −2.3%); log-loss the same. Total-return prices:
  1/18, 0/18, 3/18, 8/18. The ship rule fails decisively.
- The ablation shows it's not EWMA's fault alone: `gauss-clim` also loses to plain
  counting (2/18 at 1w and 1m). The Gaussian formula itself is worse packaging than
  the empirical up-rate — daily returns are left-skewed and fat-tailed, so the
  formula's mean-based P(up) systematically understates how often prices end higher.
- The calibration table localizes the damage: whenever `gauss-ewma` said **under 50%**
  (which it only says when current vol is high), prices were actually up **56–79%**
  of the time depending on horizon. High-vol moments — crash bottoms — are
  disproportionately *rebound* moments (the leverage effect plus the equity risk
  premium arriving exactly when risk is highest). Shrinking toward 50% in storms is
  directionally backwards.
- Climatology itself is the quiet winner: it beat the coin in **15/18 (1w), 14/18
  (1m), 13/18 (3m)** tickers (17/16/14 on total-return). At 1y even climatology gets
  shaky (11–13/18) — base rates drift across decades (Ford's 1y up-rate is 43%
  price-only) and ~20 years of data holds only ~20 independent 1-year windows.

The result echoes Christoffersen & Diebold's own caveat: the effect they derive is
largest when drift is large relative to vol *and* vol variation is large — and it can
be swamped in practice. On our data it isn't just swamped; the vol-conditioning is
anti-correlated with outcomes because the model omits exactly what makes crashes
special (skew, risk premium timing). A model that could exploit those would have
fitted parameters — that experiment, if ever run, goes through `walkforward.js`.

## 4. What shipped because of this

The measured winner, honestly labeled: the detail panel's report card now shows each
basket ticker's **historical odds of being higher** at 1w/1m/3m/1y (full-history base
rates, total-return prices, from the same frozen harness cache via `export.js`),
labeled as base rates — "what usually happened, not a forecast of this moment" — with
the measured note that layering our vol forecast onto them scored *worse*. Unmeasured
tickers keep saying "not measured yet." The volatility number keeps its original,
measured job: expected swing size. Direction probabilities and swing size now each
say exactly what they are.

## 5. What would change our mind

1. **A fitted probability model beating climatology out-of-sample.** The candidates
   the literature suggests (logit on vol + skew + kurtosis, per Christoffersen et
   al.'s follow-up work) have parameters, so they must pass through `walkforward.js`
   and beat the base rate on Brier at 1w/1m across the basket. The prior, after this
   result, is low.
2. **Nonstationary base rates biting in Phase 6.** The displayed odds are ~20-year
   averages. If the forward test shows realized up-rates drifting far from them
   (as Ford's did across decades), consider showing a windowed base rate — but only
   with the window choice pre-committed, since window-shopping is fitting in disguise.
3. **Any future urge to show "P(up): 74%" next to a BUY badge.** This digest is the
   receipt that the number would be the base rate wearing a costume. If a signal is
   ever measured to shift probabilities away from base rates out-of-sample, it earns
   the display; nothing has yet.

## References

- Brier, G.W. (1950). "Verification of Forecasts Expressed in Terms of Probability."
  *Monthly Weather Review* 78(1), 1–3.
- Murphy, A.H. (1973). "A New Vector Partition of the Probability Score." *Journal of
  Applied Meteorology* 12(4), 595–600. (Skill relative to climatology; the
  reliability/resolution decomposition.)
- Gneiting, T. & Raftery, A.E. (2007). "Strictly Proper Scoring Rules, Prediction,
  and Estimation." *Journal of the American Statistical Association* 102(477),
  359–378.
- Christoffersen, P.F. & Diebold, F.X. (2006). "Financial Asset Returns,
  Direction-of-Change Forecasting, and Volatility Dynamics." *Management Science*
  52(8), 1273–1287. (The tested hypothesis.)
- Abramowitz, M. & Stegun, I.A. (1964). *Handbook of Mathematical Functions*, eq.
  7.1.26. (The normal-CDF approximation used in `prob.js`.)
- J.P. Morgan / Reuters (1996). *RiskMetrics — Technical Document*, 4th ed. (The EWMA
  vol layer under test; see [volatility.md](volatility.md).)
