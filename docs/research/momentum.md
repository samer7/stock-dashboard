# Momentum: what the literature says

*Digest written 2026-07-05. Second topic in the workstream (see [README.md](README.md)).
Important context: the harness ALREADY tested 12-month **time-series** momentum as a
long/cash rule on single tickers (`--strategy=tsmom`: 3/18 price-only, 0/6 total-return,
timing ≈ random). That is NOT this digest's subject. The academic anomaly is
**cross-sectional** (relative) momentum: rank stocks against *each other*, hold the recent
relative winners.*

## In one paragraph

"Momentum" is the finding that stocks which beat their peers over the past ~3–12 months
tend to keep beating them for the next few months. First documented rigorously by Jegadeesh
& Titman (1993), it survived a real out-of-sample retest (2001), became a standard
asset-pricing factor (Carhart 1997), and shows up in nearly every country and asset class
(Asness, Moskowitz & Pedersen 2013) — arguably the best-documented return anomaly in
finance. But the fine print is heavy: the headline ~1%/month is a *gross, long/short,
thousands-of-stocks, pre-cost* number. High turnover lets trading costs eat a large share
(Korajczyk & Sadka 2004; Novy-Marx & Velikov 2016); rare, violent "momentum crashes" hit
when markets rebound (Daniel & Moskowitz 2016); and the edge shrank substantially after
publication (McLean & Pontiff 2016). For a long-only watchlist of ~18 large-cap US tickers,
the realistic expectation is that a relative-momentum tilt is *real in principle but
probably too small and too noisy to detect on a basket this size* — and the harness should
be allowed to say so.

## 1. The founding evidence

**Jegadeesh & Titman (1993)** ranked NYSE/AMEX stocks by their past 3–12 month returns,
bought the top decile ("winners") and shorted the bottom decile ("losers"), and found the
winner-minus-loser portfolio earned about **1% per month** over the next 3–12 months
(1965–1989). This is a *relative* bet — it says nothing about whether the market goes up,
only that recent outperformers keep beating recent laggards for a while. Two built-in
details matter: the signal separates the top ~10% from the bottom ~10% of *thousands* of
stocks (most of the spread lives in the extremes), and part of the first-year winner
premium *reverses* over the following two years — momentum is a months-scale drift, not a
durable quality of a stock.

**Jegadeesh & Titman (2001)** is why momentum is taken more seriously than most anomalies:
re-running the 1993 strategy on the *new* data that had accumulated (the 1990s), the
profits persisted at similar magnitude — not data snooping. Contrast MA timing
([ma-timing.md](ma-timing.md)), where the classic result *failed* its out-of-sample decade.

**The 12-2 convention.** Modern practice measures momentum as the return from 12 months
ago to 1 month ago, *skipping the most recent month*, because of **Jegadeesh (1990)**:
individual stocks show strong *short-term reversal* — last month's return negatively
predicts next month's — so including the latest month mixes a positive signal with a
negative one. Any implementation here should skip the last month too.

## 2. Momentum as a factor

- **Carhart (1997)** added a one-year momentum factor (now called UMD, "up minus down") to
  the Fama–French three-factor model: mutual-fund "hot hands" turned out to be mostly
  holdings riding the Jegadeesh–Titman effect, not skill. Momentum has been a standard
  benchmark factor ever since; Fama & French's own data library publishes a UMD series.
- **Fama & French (2008, 2012)** — the intellectual fathers of efficient markets — concede
  the anomaly is "pervasive": all size groups in US data (2008), and internationally in
  North America, Europe, and Asia-Pacific (2012; Japan is the famous exception). Notably
  for this project, momentum spreads *shrink* from small to big stocks.
- **Israel & Moskowitz (2013)** decomposed the factor: momentum shows no reliable relation
  with firm size (unlike value, which dies among large caps) — good news for a large-cap
  basket — but roughly **half of long/short momentum profits come from the short side**,
  which a long-only dashboard cannot touch.
- **Asness, Moskowitz & Pedersen (2013)** found momentum premia in US/UK/European/Japanese
  equities, country indexes, bonds, currencies, and commodities, all co-moving. That
  breadth is the strongest argument momentum is real and not an artifact — but the
  *harvestable* version is a widely diversified portfolio, not a bet on a handful of names.

## 3. The costs and the crashes

- **Turnover and trading costs.** A 12-2 winner portfolio changes composition constantly.
  **Korajczyk & Sadka (2004)**, using intraday price-impact estimates: momentum profits
  shrink with portfolio size, and only cost-aware weighting keeps them alive at scale.
  **Novy-Marx & Velikov (2016)** place momentum among the *high-turnover* anomalies — the
  group where net-of-cost profits mostly vanish unless the strategy is redesigned to trade
  less. Gross ≈ 1%/month; net, for a naive implementation, plausibly half or less.
- **Momentum crashes.** **Daniel & Moskowitz (2016)**: the long/short strategy occasionally
  collapses — losing on the order of three-quarters of its value within a few months in
  1932 and 2009. Crashes happen in "panic states": after big declines, when volatility is
  high and the market *rebounds*, the beaten-down "losers" rocket back. A long-only version
  escapes the worst (the crash is concentrated in the short side) but still lags badly in
  rebounds, because the winners it holds are the defensive names that bounce least.
  Momentum's return distribution is negatively skewed: steady small gains, rare big losses.
- **Post-publication decay.** **McLean & Pontiff (2016)**, across 97 published predictors:
  returns are ~26% lower out-of-sample and **~58% lower post-publication**. Momentum is
  among the most famous, most arbitraged anomalies in existence; the honest prior for 2026
  is half or less of the historical published spread.

Compounding all three: the published spread is long/short (long-only halves it again per
Israel & Moskowitz), gross of costs, and pre-decay. A realistic long-only after-cost
expectation for large caps is on the order of **1–3%/year of relative edge with high
tracking error** — real over decades if it shows up, small against mega-cap noise.

## 4. Cross-sectional vs time-series — and what our harness already measured

**Time-series** momentum (Moskowitz, Ooi & Pedersen 2012) asks "is this asset's own
12-month return positive?" — in or out. Already tested here as `tsmom` (3/18, 0/6
total-return, placement ≈ random), consistent with the literature: its profits need ~58
diversified futures markets, not one stock. **Cross-sectional** momentum (Jegadeesh &
Titman) asks "which of these did best *relative to the others*?" — hold the leaders. Not
yet tested here, and it's the version with the strong record. So our negative TSMOM result
does **not** condemn cross-sectional momentum — but both are portfolio-average effects the
literature never claims work reliably on a handful of names.

**The 18-ticker problem.** Jegadeesh–Titman deciles span thousands of stocks; we have 18.
Top-3-of-18 compares the 83rd percentile to the average, not the 95th to the 5th, on a
sample where single-stock idiosyncratic noise (earnings, product news) dwarfs the factor.
Fama–French (2012) adds that momentum spreads are smallest among the biggest stocks — our
basket. And one bias is baked in: the basket is survivor-selected (we watch AAPL and MSFT
*because* they won), which flatters any past-winner rule in backtest. Honest prior: even if
momentum is real, an 18-mega-cap basket is close to the worst place to measure it.

## 5. How this could apply to this dashboard

One concrete, deterministic, harness-testable rule — **12-2 relative momentum, top-3,
monthly**:

- On the last trading day of each month, compute each basket ticker's **12-2 return**:
  `close[t − 21 trading days] / close[t − 252 trading days] − 1` (past year, skipping the
  most recent month per Jegadeesh 1990). Tickers with under 13 months of history sit out.
- Rank the basket; hold the **top 3, equal-weighted**, for the next month. No shorting, no
  cash — it's a *relative* bet, so the benchmark is **equal-weighted buy-and-hold of the
  full basket** (same 18 names, same period), not SPY.
- Next-day execution and `--cost` per position change, as the harness already does;
  `--adjust` (total-return) for the final verdict.
- Implementation note: this needs a *portfolio* mode holding several tickers at once
  (current strategies are single-ticker in/out) — which is Phase 6's simulator core anyway,
  so the work is not wasted.

**The literature's honest prediction:** the top-3 portfolio's after-cost CAGR lands within
a few points of equal-weight buy-and-hold, either side — the spread is positive-but-tiny on
average and statistically indistinguishable from zero on ~230 monthly observations of one
noisy series. Max drawdown will be *worse* than the basket (no cash exit, 3-name
concentration, rebound lag). The key measurable is the **monthly hit rate**: does the top-3
beat the basket in more than ~50% of months? The literature predicts maybe 52–55%, which on
230 months may not separate from coin-flip. If it wins big, suspect basket survivorship
before believing it.

## 6. What would change our mind

1. **Run the rule above.** If top-3 12-2 beats equal-weight basket buy-and-hold on
   total-return CAGR *and* Sharpe after costs, momentum earns a place in Phase 5c scoring —
   displayed as a *relative-strength rank*, never a BUY.
2. **Skip-month ablation:** run 12-1 (no skip) alongside 12-2. Jegadeesh (1990) predicts
   12-1 is worse; if it isn't, suspect a bug. This doubles as a sanity check.
3. **Rebound windows** (2009, 2020 recoveries): momentum should *lag* the basket there
   (Daniel & Moskowitz). If it outperforms in rebounds, our rule isn't measuring momentum.
4. **Basket-dependence:** repeat on a different 18 names. If the verdict flips with the
   basket, the 18-ticker noise problem is confirmed — and the result shouldn't drive UI
   features either way.

## References

- Jegadeesh, N. (1990). "Evidence of Predictable Behavior of Security Returns." *Journal of Finance* 45(3), 881–898.
- Jegadeesh, N. & Titman, S. (1993). "Returns to Buying Winners and Selling Losers: Implications for Stock Market Efficiency." *Journal of Finance* 48(1), 65–91.
- Carhart, M.M. (1997). "On Persistence in Mutual Fund Performance." *Journal of Finance* 52(1), 57–82.
- Jegadeesh, N. & Titman, S. (2001). "Profitability of Momentum Strategies: An Evaluation of Alternative Explanations." *Journal of Finance* 56(2), 699–720.
- Korajczyk, R.A. & Sadka, R. (2004). "Are Momentum Profits Robust to Trading Costs?" *Journal of Finance* 59(3), 1039–1082.
- Fama, E.F. & French, K.R. (2008). "Dissecting Anomalies." *Journal of Finance* 63(4), 1653–1678.
- Fama, E.F. & French, K.R. (2012). "Size, Value, and Momentum in International Stock Returns." *Journal of Financial Economics* 105(3), 457–472.
- Moskowitz, T., Ooi, Y.H. & Pedersen, L.H. (2012). "Time Series Momentum." *Journal of Financial Economics* 104(2), 228–250.
- Asness, C.S., Moskowitz, T.J. & Pedersen, L.H. (2013). "Value and Momentum Everywhere." *Journal of Finance* 68(3), 929–985.
- Israel, R. & Moskowitz, T.J. (2013). "The Role of Shorting, Firm Size, and Time on Market Anomalies." *Journal of Financial Economics* 108(2), 275–301.
- Daniel, K. & Moskowitz, T.J. (2016). "Momentum Crashes." *Journal of Financial Economics* 122(2), 221–247.
- McLean, R.D. & Pontiff, J. (2016). "Does Academic Research Destroy Stock Return Predictability?" *Journal of Finance* 71(1), 5–32.
- Novy-Marx, R. & Velikov, M. (2016). "A Taxonomy of Anomalies and Their Trading Costs." *Review of Financial Studies* 29(1), 104–147.
