# RSI and MACD: what the literature says

*Digest written 2026-07-05. Fourth topic in the workstream (see [README.md](README.md)).
Context: the dashboard already computes and displays RSI(14) and MACD(12/26/9) server-side
(`/api/history`). This digest exists to answer one question before Phase 5c decides whether
those indicators enter a weighted multi-signal score: does published research say they
predict anything? Companion to [ma-timing.md](ma-timing.md) — MACD is mathematically a
member of the MA family that digest already closed.*

## In one paragraph

RSI and MACD are practitioner inventions from the late 1970s — Wilder (1978) published RSI
in a trading book, Appel introduced MACD in a newsletter — and neither came with academic
evidence; they spread because they were plausible and easy to compute, not because anyone
had shown they worked. The academic literature that tests them directly is surprisingly
thin, and what exists is not encouraging: the friendliest studies (Chong & Ng 2008; Chong,
Ng & Liew 2014) find profits in *some* markets and not others, with the dashboard's exact
MACD(12/26/9) rule predicting nothing in any of five developed markets; data-snooping-
corrected studies (Marshall, Cahan & Cahan 2008, and the whole apparatus surveyed in Park &
Irwin 2007) find nothing that survives. The one version of RSI with a genuine academic
foundation is as a *short-horizon oversold gauge* — the short-term reversal effect of
Jegadeesh (1990) and Lehmann (1990) — but that effect lived mostly in small caps, is best
understood as a market-maker's payment for providing liquidity (Da, Liu & Schaumburg 2014),
and decayed by roughly an order of magnitude between 1995 and 2007 (Khandani & Lo 2007).
The honest prior for a large-cap watchlist in 2026: RSI and MACD are **descriptions of
recent price action, not forecasts** — the same reframing the MA signal already got — and
that prior should be confirmed or refuted by one cheap harness test, not assumed.

## 1. What the indicators actually compute (and where they came from)

**RSI(14)** — Wilder (1978), a book by a mechanical-engineer-turned-trader, not a
peer-reviewed test. Take the last 14 days; average the up-moves and the down-moves
separately (Wilder's smoothing: each day's average = (13 × yesterday's average + today's
move) / 14, an exponential decay). Then RSI = 100 − 100/(1 + avgGain/avgLoss). RSI 50
means gains and losses have been balanced; RSI 70 means average gains ran ~2.3× average
losses; RSI 30 the reverse. Wilder's claim — asserted, never tested — was that >70 is
"overbought" and <30 "oversold," with a reversal imminent. So RSI is a normalized answer
to "how one-sided were the last three weeks?"

**MACD(12/26/9)** — Gerald Appel, late 1970s, in his *Systems and Forecasts* newsletter
(founded 1973); the fullest primary source is his 2005 book. MACD = EMA12 − EMA26 of
closes (two exponentially smoothed prices, fast minus slow, in dollars); the *signal line*
is a 9-day EMA of MACD itself; the histogram is the gap between them. Two things follow
directly from the algebra. First, MACD > 0 is *literally* an EMA12/EMA26 crossover — a
fast/slow moving-average rule, the family our harness and [ma-timing.md](ma-timing.md)
already tested to death. Second, the MACD-vs-signal-line cross (the "crossover" the
dashboard's UI describes) is a smoothed change-of-trend detector: it fires earlier and far
more often than MA20/50/200. Neither indicator contains information that isn't already in
recent closes — they are transformations, not new data.

Both origins matter for calibration: these are the two most-displayed indicators in retail
charting software, and their founding evidence is zero published tests. Chong, Ng & Liew
(2014) themselves note the pair has been "much neglected in the academic literature."

## 2. What the academic tests found

The direct tests are few, and the pattern across them is the one Park & Irwin (2007)
documented for technical rules generally: positive results cluster in older data, smaller
or less-developed markets, and studies without data-snooping corrections (see
[ma-timing.md](ma-timing.md) §2 for that machinery — Sullivan et al.'s reality check,
Bajgrowicz & Scaillet's false-discovery rates — all of which applies here unchanged).

- **Chong & Ng (2008)** is the pro-RSI/MACD citation: on monthly FT30 data 1935–1994,
  MACD and RSI rules beat buy-and-hold. Caveats: a 4-page letters-journal note, a price
  index (no dividends — the bias our `--adjust` flag exists for), data ending three
  decades ago, no data-snooping correction.
- **Chong, Ng & Liew (2014)** re-ran the same rules on five developed markets (Milan,
  S&P/TSX, DAX 30, Dow Jones Industrials, Nikkei 225; daily closes 1976–2002) — and it
  reads like a controlled demonstration of noise. MACD(12,26,0) worked in Milan and
  Canada only. **MACD(12,26,9) — the dashboard's exact rule — showed "no predictability"
  in any market and was significantly *harmful* in the DAX (−0.94% per buy/sell pair).**
  RSI(21,50) worked in Milan and Canada; RSI(14,30/70)'s buy leg beat the Dow's average
  10-day return (1.02% vs 0.33%) but its buy−sell spread wasn't significant; in the
  Nikkei, *nothing* beat buy-and-hold. Across the paper's 45 rule-market cells (9 rules ×
  5 markets), more are significantly negative at the 5% level than positive (4 vs 2) — the
  signature of
  multiple comparisons on noise, not of a working tool. The authors' own conclusion:
  the rules are "not robust to the choice of market."
- **Marshall, Cahan & Cahan (2008)** tested 7,846 popular technical rules (RSI/MACD-type
  oscillators included) on S&P 500 ETF data with two bootstrap methodologies: **none
  profitable after data-snooping bias is accounted for.** Their data is intraday (out of
  our scope), but the lesson is horizon-independent: with thousands of candidate rules,
  the best one always looks good in-sample.

No study we could verify shows classic RSI-30/70 or MACD-crossover rules beating
buy-and-hold on large-cap US equities after costs in post-1990 data. The best available
result is one leg of one rule on one index over 1976–2002, unadjusted for search.

## 3. The one real anomaly behind RSI: short-term reversal

"Oversold bounces" are not pure fiction — there is a genuine, heavily-cited anomaly
underneath. **Jegadeesh (1990)**: a stock's return in one month *negatively* predicts the
next (extreme-decile spread ~2.49%/month, 1934–1987). **Lehmann (1990)**: weekly winners
and losers reverse the following week, with apparent profits surviving plausible costs.
This is the academic reason the momentum digest's 12-2 rule skips the most recent month,
and it is the intellectual basis for RSI-as-oversold-gauge and for the practitioner RSI(2)
strategies of **Connors & Alvarez (2008)** — buy 2-day-oversold dips in uptrends —
whose backtests report 70–85% win rates (a practitioner book: no peer review, and the
seductive win-rate stat mostly reflects rare trades with small gains, not high CAGR).

But three findings gut its usefulness for this project:

- **It's a liquidity-provision payment.** Da, Liu & Schaumburg (2014) decompose reversal
  profits: the part that survives is compensation for absorbing fire sales — a
  market-maker's return, earned by trading *into* panics at speed. A retail rule executing
  next-day (as our harness rightly forces) is late to that trade by construction.
- **It never lived in mega-caps.** Khandani & Lo (2007) simulated the classic one-day
  contrarian strategy by size decile: in the *largest* decile — our entire basket — the
  average daily return was ~0.04% even in 1995, against 3.57% in the smallest.
- **It has decayed.** The same simulation's all-stock return fell from 1.38%/day (1995)
  to 0.44% (2000) to 0.13% (Jan–Aug 2007), *before* costs — competed away as markets got
  more liquid and quant capital crowded in. That's two decades of further decay ago.

So the reversal literature gives RSI a real ancestor but no live inheritance for 18
large-cap tickers at weekly+ horizons with next-day execution.

## 4. What this means next to our own measurements

The harness has already convicted this indicator family once. MACD is a fast EMA
crossover, and the MA verdict (1/18 price-only, 0/6 total-return, timing = base rates,
drawdown dampening the only survivor) is the measured behavior of exactly this kind of
rule — with the cross-variant finding that *faster* rules whipsaw more and pay more in
costs. The literature adds nothing that predicts MACD(12/26/9) will do better, and one
direct test (Chong, Ng & Liew) that predicts it will do nothing. RSI's mean-reversion leg
is the one genuinely *different* hypothesis — it bets on reversal where every rule we've
tested bets on continuation — which is precisely why it's worth one cheap falsification
run rather than a verdict by analogy.

## 5. How this could apply to this dashboard

One concrete, deterministic, harness-testable rule — **the displayed MACD crossover as a
long/cash strategy** (`--strategy=macdcross`), because it tests exactly what the UI shows
and needs no new machinery:

- Compute MACD = EMA12 − EMA26 of daily closes and signal = EMA9 of MACD, identical to
  `server.js` (the harness copy must stay in sync, as `strategies.js` already requires).
- **Long when the MACD line is above its signal line at day *i*'s close, cash otherwise**;
  position applies to day *i+1* per the `signalsToPositions` convention.
- Run the standard 18-ticker sweep: buy-and-hold benchmark, `--cost=0.001` and doubled,
  `--adjust` for the verdict, pooled hit rates at 1w/1m/3m/1y, matched-random shuffles
  (same time-in-market), and the crisis windows.

**The literature's honest prediction:** far more trades than any rule tested so far
(signal-line crosses fire constantly), so a visible cost drag; ~0/18 total-return CAGR
wins; pooled BUY hit rates = base rates; matched-shuffle percentile ≈ random. Being the
fastest rule yet, it may show decent crisis-window protection (the speed-vs-whipsaw
trade-off from ma-timing §6), bought with the worst whipsaw bill. If that's what comes
out, RSI and MACD stay in the UI as what they already are — descriptive context in the
detail panel — and the legend gets one added sentence saying they were tested and carry
no timing information. They do not enter Phase 5c scoring.

## 6. What would change our mind

1. **Run the §5 rule.** Pre-committed criterion: if MACD(12/26/9) long/cash beats
   buy-and-hold on total-return CAGR after costs on a majority of the 18 tickers, or its
   matched-shuffle percentile lands consistently above ~90%, the literature's null is
   contradicted and MACD earns Phase 5c consideration. Prediction: it won't.
2. **The RSI oversold event test** (reversal hypothesis, run on the existing
   event-analysis machinery): pool every moment RSI(14) crosses back *up* through 30, and
   compare forward 1w/1m returns against base rates and the matched-random baseline. The
   post-2000 large-cap literature predicts no bump. A real, repeated bump at 1w/1m that
   survives `--adjust` would revive the mean-reversion leg — then, and only then, spec a
   tradable rule (e.g. enter on the 30-recross, exit at RSI ≥ 50 or after 21 trading
   days) and demand it survive `--cost=0.002`.
3. **Subperiod split on check #2** (2007–2016 vs 2017–2026): Khandani & Lo predict any
   reversal edge shrinks in the later half. An edge that *grows* would be surprising
   enough to suspect a bug before believing it.
4. **A small/illiquid-ticker basket** is where the reversal literature says the effect
   lives. If someone extends the watchlist beyond mega-caps, rerun check #2 there before
   concluding "RSI is dead" in general — though for *this* dashboard's basket the
   mega-cap result is the one that matters.

## 7. Harness verdict (2026-07-05, v0.9.10)

The §5 rule ran as `--strategy=macdcross` (`macdCrossSignalSeries` in `strategies.js`,
mirroring server.js's MACD math exactly) over the standard 18-ticker sweep, ~19.7 years
per ticker. **Check #1's pre-committed criterion: decisively not met.** Total-return,
0.1% cost: the rule beat buy-and-hold on CAGR in **1/18** (Ford — the same sideways
history every trend rule "wins") and Sharpe in 2/18; median matched-shuffle percentile
**43%** — its placement of holding periods did slightly worse than random placements of
the identical pattern. Pooled BUY hit rates equal base rates at every horizon (e.g.
61.3% vs 61.4% base at 3 months, ~45,000 signal-days), and the ~3,570 pooled flips to
BUY were followed by exactly any-day returns. Price-only numbers are the same shape
(1/18, 1/18, median 53%).

Two predicted signatures showed up on cue. **The whipsaw bill is the heaviest of any
rule tested**: 364–438 trades per ticker (~2× the daily MA rule, ~10–20× the monthly
rules). And **crisis protection is the best yet** — 16/18 in the financial crisis,
**18/18 in the COVID crash** (median −2.9% vs −30.7%), 15/18 in 2022 — completing the
speed-vs-whipsaw spectrum from ma-timing.md: COVID protection now reads
MACD 18/18 > daily MA 17/18 > Faber 13/18 > TSMOM 11/18, with return deficit ordered
the same way. The fastest trend rule buys the most protection and pays the most for it.

**Bottom line: MACD's crossover carries no timing information; it is the MA family's
fastest, most expensive member, and it does not enter Phase 5c scoring.** The UI keeps
MACD (and RSI) as descriptive context, and the legend can now say this variant was
tested too. The RSI(14) 30-recross event test (check #2) remains open — it is the one
reversal-flavored hypothesis left, and the machinery for it already exists.

## References

- Wilder, J.W. (1978). *New Concepts in Technical Trading Systems*. Trend Research.
  (Practitioner book — origin of RSI, the 14-day default, and the 30/70 levels.)
- Appel, G. (2005). *Technical Analysis: Power Tools for Active Investors*. FT Press.
  (Practitioner book by MACD's inventor; MACD originated in his *Systems and Forecasts*
  newsletter in the late 1970s.)
- Brock, W., Lakonishok, J. & LeBaron, B. (1992). "Simple Technical Trading Rules and the
  Stochastic Properties of Stock Returns." *Journal of Finance* 47(5), 1731–1764.
- Park, C.-H. & Irwin, S.H. (2007). "What Do We Know About the Profitability of Technical
  Analysis?" *Journal of Economic Surveys* 21(4), 786–826.
- Chong, T.T.-L. & Ng, W.-K. (2008). "Technical Analysis and the London Stock Exchange:
  Testing the MACD and RSI Rules Using the FT30." *Applied Economics Letters* 15(14),
  1111–1114.
- Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). "Revisiting the Performance of MACD
  and RSI Oscillators." *Journal of Risk and Financial Management* 7(1), 1–12.
- Marshall, B.R., Cahan, R.H. & Cahan, J.M. (2008). "Does Intraday Technical Analysis in
  the U.S. Equity Market Have Value?" *Journal of Empirical Finance* 15(2), 199–210.
- Jegadeesh, N. (1990). "Evidence of Predictable Behavior of Security Returns." *Journal
  of Finance* 45(3), 881–898.
- Lehmann, B.N. (1990). "Fads, Martingales, and Market Efficiency." *Quarterly Journal of
  Economics* 105(1), 1–28.
- Da, Z., Liu, Q. & Schaumburg, E. (2014). "A Closer Look at the Short-Term Return
  Reversal." *Management Science* 60(3), 658–674.
- Khandani, A.E. & Lo, A.W. (2007). "What Happened to the Quants in August 2007?"
  *Journal of Investment Management* 5(4).
- Connors, L. & Alvarez, C. (2008). *Short Term Trading Strategies That Work*.
  TradingMarkets Publishing. (Practitioner book — RSI(2) mean-reversion backtests; not
  peer-reviewed.)
