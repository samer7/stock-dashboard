# Volatility forecasting: the one thing the literature says IS predictable

*Digest written 2026-07-06 alongside the Phase 5b opening measurement. Deliberately
more compact than the other digests: the core claims here are among the least
controversial in all of quantitative finance (the central one earned a Nobel), and our
own measurement — run before anything shipped — came back unambiguous.*

## In one paragraph

Every directional test this project has run scored zero: which way a price goes next
is, for our purposes, unpredictable. The literature agrees — and has always carved out
one exception. How *much* a price moves (its volatility) is strongly autocorrelated:
calm days cluster, wild days cluster, and this "volatility clustering" has been
documented since Mandelbrot (1963) and modeled since Engle's (1982) Nobel-winning ARCH
work. The practical upshot is that a simple, deterministic estimator — an
exponentially weighted moving average (EWMA) of squared daily returns, the RiskMetrics
(1996) standard with λ = 0.94 — produces a genuinely informative forecast of the next
month's bumpiness. Our harness confirmed it on our own 18 tickers before the number
reached the UI: rank correlation 0.59 between forecast and realized next-21-day
volatility, beating both naive baselines on 18/18 tickers, with a perfectly monotonic
calibration table. This is the dashboard's first — and so far only — measured,
forward-looking forecast, and it forecasts *swing size only*, never direction.

## 1. Why volatility is different from direction

If returns were predictable, traders would trade the prediction away — that arbitrage
pressure is exactly why our directional tests keep coming back empty. Volatility is
different: knowing tomorrow will be turbulent doesn't tell you which way to trade, so
the information can persist without being arbitraged out. Empirically the persistence
is dramatic — squared returns are autocorrelated for months, while returns themselves
are close to white noise. Mandelbrot (1963) put it in one sentence: "large changes
tend to be followed by large changes, of either sign, and small changes tend to be
followed by small changes."

Engle (1982) turned the observation into a model (ARCH: today's variance depends on
recent squared shocks), Bollerslev (1986) generalized it (GARCH), and two decades of
horse races followed. The survey verdict (Poon & Granger 2003, reviewing 93 papers):
volatility is forecastable at horizons up to about a month or two — and simple models
compete surprisingly well with elaborate ones. Andersen & Bollerslev (1998) resolved
the one apparent embarrassment (standard models "explained" little of daily squared
returns) by showing the fault was in the noisy measurement target, not the forecasts:
scored against properly measured realized volatility, standard models do fine.

## 2. The estimator we use, and why this one

RiskMetrics EWMA (J.P. Morgan/Reuters 1996):

    variance_today = λ · variance_yesterday + (1 − λ) · return_today²,   λ = 0.94

Three reasons this is the right choice for this project, in project-principle order:

- **Deterministic, nothing fitted.** λ = 0.94 is a constant published thirty years
  ago for daily data; we adopt it as-is. No parameter is chosen from our data, so
  there is no in-sample to leak and no walk-forward needed (the harness verified the
  verdict is insensitive to λ anyway: 0.90 and 0.97 give the same scoreboard).
- **It is the fair simple baseline the literature itself uses.** GARCH(1,1) adds a
  long-run anchor and would be the natural upgrade, but it requires fitting three
  parameters per ticker — that day, if it comes, goes through `walkforward.js`.
  Poon & Granger's survey says the gain would likely be modest.
- **One line of arithmetic.** The owner can read the entire estimator.

Two published limitations worth knowing (both fine for our use): plain EWMA has no
mean reversion — after a vol spike it decays back only as fast as λ forgets, while
real volatility tends to revert a bit faster; and it treats up-moves and down-moves
symmetrically, whereas equity volatility rises more after falls (the "leverage
effect", Black 1976). Asymmetric GARCH variants model that; a ±band on a dashboard
doesn't need to.

## 3. The pre-committed test and its verdict (2026-07-06, `vol.js`)

**Design** (all deterministic, run before any UI work): at each day *t*, the EWMA
forecast (seeded with a 63-day variance, warmed 252 days) is scored against the
realized volatility of days *t+1 … t+21*, across the 18-ticker basket, ~4,700
forecast days per ticker. Two baselines it must beat for "forecastable" to mean
anything: **climatology** (the ticker's expanding-window average volatility — "vol is
always about its usual level") and **persistence** (the last 21 days' realized vol —
"next month like last month"). Prediction from the literature: rank correlation
roughly 0.5–0.6, EWMA ≥ both baselines.

**Verdict: confirmed, first positive result in the project.**

- Median Spearman rank correlation, forecast vs realized: **0.59** (per-ticker range
  0.41–0.73). For scale: every directional signal this project tested scored ≈ 0.
- EWMA beat climatology on mean absolute error **18/18** and persistence **18/18**
  (median MAE ~7pp of annualized vol vs ~10pp for climatology).
- Calibration by forecast decile (each ticker ranked against itself, then pooled):
  median realized vol rises monotonically from **14.9%** (calmest decile) to
  **38.4%** (wildest) — every step in between in order.
- Identical on total-return prices; scoreboard unchanged at λ = 0.90/0.97.

Honest caveats: overlapping 21-day windows mean neighboring samples share 20 days, so
the effective sample is ~21× smaller than the row count; and a rank correlation of
0.59 is *ordering* skill, not precision — the forecast says "calmer than usual /
wilder than usual" reliably, not "17.3% exactly."

## 4. What shipped because of this

`/api/history` now returns a `volatility` object (EWMA λ = 0.94 over its ~250 daily
closes, same math as the harness — the two implementations must stay in sync), and
the detail panel shows **"Expected swing: ±X% · typical month"** — one standard
deviation over 21 trading days, i.e. roughly 2 months in 3 should land inside the
band. The legend says exactly what the number is and is not: measured-to-work
bumpiness, zero information about direction. This is Phase 5b's opening piece — the
volatility layer that calibrated probability bands (5b proper) will be built on.

## 5. What would change our mind

1. **A live miss pattern**: if Phase 6's forward test shows realized monthly moves
   landing outside the ±1σ band far more often than ~1 month in 3, the band is
   miscalibrated in practice — investigate before trusting it further (first suspect:
   fat tails, which make ±1σ under-cover; the fix is quoting a wider quantile, not a
   different estimator).
2. **GARCH(1,1) fitted per ticker via `walkforward.js`** materially beating EWMA
   out-of-sample on this basket would justify the added complexity. The literature
   predicts a modest gain at most; test before believing.
3. **Horizon creep**: nothing here licenses volatility forecasts beyond ~1–2 months
   (Poon & Granger's forecastability horizon). If a future feature wants quarterly
   bands, re-run `vol.js --horizon=63` first and expect worse.

## References

- Mandelbrot, B. (1963). "The Variation of Certain Speculative Prices." *Journal of
  Business* 36(4), 394–419.
- Engle, R.F. (1982). "Autoregressive Conditional Heteroscedasticity with Estimates of
  the Variance of United Kingdom Inflation." *Econometrica* 50(4), 987–1007. (ARCH;
  2003 Nobel Memorial Prize, shared with Clive Granger.)
- Bollerslev, T. (1986). "Generalized Autoregressive Conditional Heteroskedasticity."
  *Journal of Econometrics* 31(3), 307–327.
- J.P. Morgan / Reuters (1996). *RiskMetrics — Technical Document*, 4th edition.
  (Source of the EWMA estimator and the λ = 0.94 daily decay constant.)
- Andersen, T.G. & Bollerslev, T. (1998). "Answering the Skeptics: Yes, Standard
  Volatility Models Do Provide Accurate Forecasts." *International Economic Review*
  39(4), 885–905.
- Poon, S.-H. & Granger, C.W.J. (2003). "Forecasting Volatility in Financial Markets:
  A Review." *Journal of Economic Literature* 41(2), 478–539.
- Black, F. (1976). "Studies of Stock Price Volatility Changes." *Proceedings of the
  1976 Meetings of the American Statistical Association, Business and Economics
  Statistics Section*, 177–181. (The leverage-effect asymmetry.)
