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
   **→ Measured 2026-07-25 in §6: the band is well calibrated (68.8% vs 68.3%
   theory), and the parenthetical above is wrong about where fat tails bite — see
   §6.3. This falsifier is retained for the forward test, but the historical prior
   is now strong.**
2. **GARCH(1,1) fitted per ticker via `walkforward.js`** materially beating EWMA
   out-of-sample on this basket would justify the added complexity. The literature
   predicts a modest gain at most; test before believing.
3. **Horizon creep**: nothing here licenses volatility forecasts beyond ~1–2 months
   (Poon & Granger's forecastability horizon). If a future feature wants quarterly
   bands, re-run `vol.js --horizon=63` first and expect worse.

## 6. Is the band the right *size*? (2026-07-25, `volband.js`)

§3 established that EWMA **orders** calm months ahead of wild ones (0.59 median rank
correlation, beating both baselines 18/18). That is a claim about ranking, and it says
nothing about whether the number we print is the right size. Yet the UI and §4 both
assert "about 2 months in 3 land inside the band" — a *calibration* claim that went
out untested. `server/harness/volband.js` tests it, with the method and the
change-the-UI rule pre-committed in the file's header before the first run.

### 6.1 Method

For every day with an EWMA value and a resolvable outcome (252-day warmup, matching
`vol.js`), take the band the UI would have printed that day — `ewma[t] × √21` — and
ask whether the next 21 trading days' move landed inside it. Nothing is fitted:
λ = 0.94 is J.P. Morgan's 1996 constant and each day's band uses only prior returns,
so there is no in-sample to leak (the same argument §3 makes).

The headline uses **non-overlapping** samples — every 21st day only. Consecutive days
share 20 of their 21 outcome days, so overlapping windows are massively autocorrelated
and would overstate precision by roughly 21×. Realized moves are reported both in log
terms (internally consistent with the log-return vol estimate) and simple terms (what
a reader actually understands "±7%" to mean); they agree to within 0.1pp throughout.

### 6.2 Verdict: the claim is accurate

Pooled over **4,068 non-overlapping ticker-months** (18 tickers, ~19 years each):

| | measured | normal theory |
| --- | --- | --- |
| inside ±1σ | **68.8%** | 68.3% |
| inside ±2σ | 94.0% | 95.4% |

Per-ticker median 69.5%, range 60.2%–73.0%; **17 of 18 tickers land inside the
pre-committed 63–73% acceptance range**, AAPL being the lone exception at 60.2%.
Robust to every ablation tried: 68.4% on total-return prices, 70.3% at a 1-week
horizon, 70.6% at λ = 0.97.

Per the pre-committed rule, the UI sentence stands exactly as written — the first time
a pre-committed check in this project has come back "no action needed." Worth stating
plainly: this is a **confirmation of a shipped number**, not a new edge. It says the
band is honest, not that it is profitable.

### 6.3 Correction to §5.1

§5.1 named fat tails as the first suspect if coverage came in low, on the reasoning
that fat tails make ±1σ under-cover. The data says that diagnosis was aimed at the
wrong place. At ±1σ the band is essentially perfect (68.8% vs 68.3%); the deviation
appears only at ±2σ, which covers 94.0% against 95.4% expected. So the fat tails are
real, but they live in the **extremes** and are invisible at the 1σ band the UI
actually displays.

The general point is worth keeping: for a symmetric fat-tailed distribution, mass
concentrates near zero while rare extremes inflate σ, so ±1σ tends to **over**-cover
while ±2σ **under**-covers. The measured 68.8% / 94.0% pair is exactly that signature,
mild enough at 1σ to be invisible. Anyone extending this work to wider quantiles
should expect the normal approximation to degrade as they go out, not improve.

### 6.4 What this does and doesn't license

Nothing here extends the horizon (§5.3 still binds — no quarterly bands without
re-running the test), and nothing here says anything about direction. It licenses
exactly one sentence: the ±1σ monthly band we display is the size we say it is. The
Phase 6 forward test in the UI still runs as pre-registered — a historical measurement,
however large its sample, is not a live one.

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
