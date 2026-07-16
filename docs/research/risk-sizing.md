# Risk and sizing: measuring pain, and the one honest use of a vol forecast

*Digest written 2026-07-15 alongside the Phase 5d measurement (`voltarget.js`). 5d is
deliberately different from 5b/5c: it makes no directional claim at all. The question
is not "which way will price go" (measured unpredictable, repeatedly) but "given that
you hold something, how much should you hold, and how do you honestly report the
risk you took?"*

## In one paragraph

Phase 5d has two halves. The *reporting* half is settled arithmetic: Sharpe (1966,
1994) divides return by total volatility; Sortino (Sortino & van der Meer 1991)
divides by *downside* volatility only, since nobody complains about upside surprises;
max drawdown measures the pain that actually makes people abandon strategies. These
join the harness as standard outputs. The *sizing* half has real theory behind it:
Kelly (1956) proved there is an optimal bet fraction for growing wealth — roughly
edge over variance, f\* ≈ μ/σ² — and Thorp carried it from blackjack to markets. Two
honest readings for us: first, with our measured directional edge of zero, the Kelly
numerator is base-rate drift and nothing more — Kelly is a *risk ceiling*, not a tip;
second, the σ² in the denominator is the one input we can actually forecast (EWMA
vol, 0.59 rank correlation, [volatility.md](volatility.md)). That points at the
industry's parameter-free cousin of Kelly: **volatility targeting** — hold less when
forecast vol is above normal, so the *risk* you carry stays level even though you
can't predict direction. Moreira & Muir (2017) report it raises Sharpe on factor
portfolios; Harvey et al. (2018) find more modest but real benefits, mostly a tamer
left tail; Cederburg et al. (2020) — the field's Welch & Goyal — show the gains are
fragile out-of-sample for many portfolios. So 5d tests it our way: one pre-committed,
nothing-fitted spec on our 18 tickers, against buy-and-hold *and* a matched
constant-exposure control that separates "taking less risk always" from "taking less
risk at the right times."

## 1. The reporting half: three numbers, three kinds of honesty

- **Sharpe ratio** (Sharpe 1966; revisited 1994): mean excess return over the
  standard deviation of returns, annualized. The universal per-unit-of-risk score.
  Its known blind spot: it punishes upside volatility exactly as hard as downside.
- **Sortino ratio** (Sortino & van der Meer 1991): same numerator, but the
  denominator is the *downside deviation* — the root-mean-square of only the negative
  daily returns. A strategy that lurches upward but falls gently scores better on
  Sortino than Sharpe; one that grinds up and crashes scores worse. Added to
  `metrics.js` with the same conventions as our Sharpe (daily, annualized ×√252,
  0% risk-free).
- **Max drawdown**: already the harness's most-used number, because it's the one
  measured to matter for our signals (the MA family's only surviving virtue). It is
  also the number Kelly-style theory warns about: full-Kelly betting produces
  gut-wrenching drawdowns *by design* (MacLean, Thorp & Ziemba 2010).

## 2. Kelly: what it actually licenses, and what it doesn't

Kelly (1956) answered "what fraction of wealth to bet, repeatedly, to maximize
long-run growth": for a stock modeled as drift μ over cash with variance σ², the
growth-optimal constant fraction is approximately

    f* ≈ μ / σ²

Thorp (2006) is the canonical bridge from information theory to markets. Three
properties matter for us (MacLean, Thorp & Ziemba 2010): full Kelly maximizes
long-run growth, full Kelly's path is violently volatile (half-Kelly gives up ~25%
of the growth rate for roughly half the variance), and *overbetting* past Kelly is
strictly dominated — more risk, less growth. Samuelson's (1979) famous objection —
maximizing expected log wealth is not everyone's utility — is why the practical
literature treats Kelly as a **ceiling** to stay under, not a target to hit.

The honest application here is limited and worth stating precisely. Our measured μ
is just base-rate drift (5b/5c: nothing we tested shifts it), estimated over ~19
years with enormous error bars — Kelly sizing driven by *estimated* μ is exactly the
overbetting trap. But σ² is different: it's the one quantity this project has
measured itself able to forecast. Hold μ at "whatever the long-run drift is" and let
the denominator move, and Kelly's advice collapses to something parameter-free:
**when variance doubles, halve the position.** That is volatility targeting.

## 3. Volatility targeting: the literature's claim and its counterclaim

- **Moreira & Muir (2017)**: scaling factor-portfolio exposure by 1/σ² (previous
  month's realized variance) raised Sharpe ratios and utility for the market factor
  and most others — the provocative result being that it works *despite* the
  risk-return tradeoff intuition (you're holding less exactly when expected returns
  are allegedly highest).
- **Harvey, Hoyle, Korgaonkar, Rattray, Sargaison & van Hemert (2018)**: the
  practitioner-grade study, 1/σ scaling to a constant vol target across assets since
  1926: Sharpe gains are real but modest for equities, and the robust benefit is
  **tail-taming** — vol-targeted equity portfolios have materially shallower left
  tails and drawdowns, because vol clusters (calm forecasts calm, storm forecasts
  storm) and crashes live in the storm cluster.
- **Cederburg, O'Doherty, Wang & Yan (2020)**: the skeptical replication across
  103 portfolios — direct trading-strategy gains are statistically fragile
  out-of-sample for most of them, with real-time implementation (estimation lag,
  turnover) eating much of the paper edge. The now-familiar lesson: expect the tail
  story to survive and the Sharpe story to shrink.

Note what vol targeting is *not*: market timing. The scaler never says "down move
coming" (it can't; direction is unpredictable — our own 5b result showed high-vol
moments actually lean *up*). It says "whatever happens next, it will be bigger than
usual, so hold less of it." Return give-up in rebounds is expected and priced in;
the question is whether the risk saved exceeds the return lost, per unit.

## 4. The pre-committed test (ship rule written before the first run)

**Spec** (one spec, ablations for robustness only — the 5c discipline): exposure to
the stock during day *t* is

    w_t = min(1, (targetVol_{t-1} / ewmaVol_{t-1})^p),   p = 1 primary

with `ewmaVol` the same λ=0.94 series shipped in the UI, and `targetVol` the
**expanding median** of that ticker's own EWMA vol history — "this ticker's normal
weather," fully causal, nothing fitted (the median is a convention, pre-committed
here). Cap at 1: long-only, no leverage (the deliberately-boring retail version —
levering calm markets is where the literature's Sharpe gains partly live, and where
margin costs and multi-user problems we don't want live too). A 5-percentage-point
rebalance band limits turnover; 0.1% cost on traded volume; next-day information
discipline throughout (day *t*'s weight uses day *t−1*'s close). Warmup 252 days.

**Benchmarks:** buy-and-hold, and — the important one — a **matched constant-exposure
control**: the same average exposure as the strategy (computed ex post), held every
day. Any always-partially-in-cash portfolio mechanically has lower vol and shallower
drawdowns than buy-and-hold; the control gets that for free, so beating it isolates
the *timing* of the de-risking, exactly as the matched-random shuffles did in 5a.

**Ablations:** `--adjust` (total-return), `--power=2` (Moreira-Muir-style 1/σ²),
`--band=0/0.10`, `--lambda=0.90/0.97`.

**Pre-committed ship rule:** a vol-sizing number reaches the UI only if, on BOTH
price sets, the vol-targeted portfolio beats the matched constant-exposure control
on **Sharpe** for a majority of tickers (≥10/18) AND shallows max drawdown vs
buy-and-hold for a majority. (Beating buy-and-hold on raw CAGR is *not* required —
holding less stock earns less in a rising market; the claim under test is
per-unit-of-risk and tail damage, and the UI label must say exactly that.) The
Sortino and crisis-window numbers are reported as diagnostics either way.

## 5. Verdict (2026-07-15, `voltarget.js`)

**The ship rule passes on both price sets, robustly — the project's second
measured-positive result, and its first that's a strategy rather than a forecast.**

- **Sharpe:** the vol-targeted portfolio beats its matched constant-exposure control
  in **12/18** tickers on plain prices and **16/18** on total-return (median Sharpe
  0.66 vs 0.57 for both control and buy-and-hold on total-return). Beating the
  control is the hard test: same average exposure, so the entire gain is *when* the
  de-risking happened, not that it happened.
- **Drawdown:** shallower than buy-and-hold in **18/18** tickers on both price sets —
  median worst drop **−37% vs −59%** (total-return), with ~85% median average
  exposure and ~2 rebalances' worth of turnover per year.
- **Crisis windows:** lost less than buy-and-hold in 18/18 (financial crisis, median
  −35% vs −50%), 17/18 (COVID), 15/18 (2022). Unlike the MA family — which got this
  protection by paying a return-and-Sharpe penalty over 19 years — the vol scaler
  gets it while *improving* per-unit-of-risk return.
- **Robust to everything we threw at it:** power 2 (12/18), band 0 (13/18) and 0.10
  (16/18), λ 0.90 (11/18) and 0.97 (16/18), double costs (13/18) — the Sharpe
  majority holds in every ablation and the 18/18 drawdown result never moves.
- **The honest cost, stated plainly:** median raw CAGR gives up ~2.4pp/yr vs
  buy-and-hold (8.7% vs 11.1% total-return) — that's what holding ~85% on average of
  a rising asset costs. The claim is and must stay per-unit-of-risk and tail damage,
  never "more money."
- **Where it fails, it fails for the measured reason:** the laggards (XOM, INTC, PG,
  T) are the tickers where high-vol stretches resolved upward most often — the
  rebound effect from `calibration.md` collecting its due. Vol targeting is a trade:
  it pays rebound participation for storm protection; on 2/18 to 6/18 of tickers
  (depending on price set) that trade ran negative.

Why this worked when every directional rule failed: it never asks the unanswerable
question. Direction is unpredictable (5a–5c, six ways); *swing size* is the one
thing measured predictable here (0.59 rank correlation), and sizing is the one
decision that consumes a swing-size forecast without needing a direction. Moreira &
Muir's Sharpe claim and Harvey et al.'s tail-taming claim both replicate on our
basket in the no-leverage version; Cederburg et al.'s fragility warning is why the
Phase 6 forward test gets the final word.

**What ships:** the report card gains a per-ticker "sizing by calm/storm" line —
this ticker's measured normal swing (the expanding-median target, frozen from the
harness), the live vol-scaled exposure implied by comparing today's EWMA forecast to
that norm, and the ticker's own measured backtest pair (Sharpe and worst drop, vol-
targeted vs buy-and-hold) — labeled as a risk illustration, never advice, never a
direction call.

## 6. What would change our mind

1. **Cederburg-style fragility appearing in Phase 6.** If the forward paper-trade
   shows the vol-scaled variant giving up return without the promised vol/drawdown
   reduction, the sizing display comes back out — the forward test is the final
   arbiter for 5d exactly as for every other shipped number.
2. **A better vol forecast.** The scaler inherits its skill entirely from the EWMA
   layer; per `volatility.md`, a GARCH-family model only enters via `walkforward.js`
   and only if it beats EWMA out-of-sample. If one ever does, this experiment reruns
   with it mechanically.
3. **Estimated-μ Kelly.** If some future signal ever earns a measured directional
   edge, the Kelly numerator stops being constant and sizing becomes signal-dependent
   — that version must clear its own walk-forward test before any "suggested size"
   appears. Until then, any Kelly number shown is a ceiling illustration on
   base-rate drift, never advice.

## References

- Kelly, J.L. (1956). "A New Interpretation of Information Rate." *Bell System
  Technical Journal* 35(4), 917–926.
- Thorp, E.O. (2006). "The Kelly Criterion in Blackjack, Sports Betting, and the
  Stock Market." In *Handbook of Asset and Liability Management*, Vol. 1.
- MacLean, L.C., Thorp, E.O. & Ziemba, W.T. (2010). "Long-Term Capital Growth: The
  Good and Bad Properties of the Kelly and Fractional Kelly Criteria." *Quantitative
  Finance* 10(7), 681–687.
- Samuelson, P.A. (1979). "Why We Should Not Make Mean Log of Wealth Big Though
  Years to Act Are Long." *Journal of Banking & Finance* 3(4), 305–307.
- Sharpe, W.F. (1966). "Mutual Fund Performance." *Journal of Business* 39(1),
  119–138. Sharpe, W.F. (1994). "The Sharpe Ratio." *Journal of Portfolio
  Management* 21(1), 49–58.
- Sortino, F.A. & van der Meer, R. (1991). "Downside Risk." *Journal of Portfolio
  Management* 17(4), 27–31.
- Moreira, A. & Muir, T. (2017). "Volatility-Managed Portfolios." *Journal of
  Finance* 72(4), 1611–1644.
- Harvey, C.R., Hoyle, E., Korgaonkar, R., Rattray, S., Sargaison, M. & van Hemert,
  O. (2018). "The Impact of Volatility Targeting." *Journal of Portfolio Management*
  45(1), 14–33.
- Cederburg, S., O'Doherty, M.S., Wang, F. & Yan, X.S. (2020). "On the Performance
  of Volatility-Managed Portfolios." *Journal of Financial Economics* 138(1),
  95–117.
- J.P. Morgan / Reuters (1996). *RiskMetrics — Technical Document*, 4th ed. (The
  EWMA vol layer doing the scaling; see [volatility.md](volatility.md).)
