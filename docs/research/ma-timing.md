# Moving-average timing rules: what the literature says

*Digest written 2026-07-05. Companion to the harness results recorded in
[README.md](README.md) (18-ticker sweep, `--adjust`/`--cost` robustness checks, and the
signal-transition event test).*

## In one paragraph

Moving-average (MA) timing rules — "be in the market when price is above its average,
out when below" — looked genuinely predictive in a famous 1992 study of 90 years of
Dow data. That result then failed every serious follow-up test: correcting for
*data snooping* (trying many rules and reporting the winner), adding realistic
transaction costs, and simply re-running the rules on post-1986 data all erase the
excess return. The modern consensus, including from firms that trade these strategies
for a living, is that MA/trend rules are **not** a reliable way to beat buy-and-hold
on a single equity market after costs — but they *do* reliably cut exposure during
long declines, so their robust residual benefit is **shallower drawdowns and lower
volatility**, bought at the price of roughly matching-or-lagging returns. That is
exactly what this project's harness measured.

## 1. The classic pro-MA evidence

**Brock, Lakonishok & LeBaron (1992)** tested 26 simple rules (MA crossovers and
trading-range breaks) on the Dow Jones Industrial Average, 1897–1986. Buy signals were
followed by higher and less volatile returns than sell signals, and bootstrap tests
rejected the idea that random-walk-like models could produce those patterns. This is
*the* paper that made technical rules academically respectable, and it is why an
MA-based signal is a reasonable thing for a dashboard to display at all.

Two built-in caveats the authors themselves noted: no transaction costs were charged,
and the rules were "well known" — meaning they were popular partly *because* they had
worked, which is a selection bias.

## 2. The rebuttals: data snooping, costs, and out-of-sample decay

How big is this literature? **Park & Irwin (2007)** surveyed it whole: ~40 "early"
studies plus 95 "modern" (post-1988) studies of technical trading rules. 56 of the 95
found positive results — but the survey's own conclusion is that most positives suffer
data-snooping bias, ignore transaction costs, or never test out-of-sample. That is why
this digest doesn't cite studies by the dozen: the field's problem is an oversupply of
weak positive results, and the handful of papers below are the ones that corrected for
exactly those flaws (and each aggregates enormous evidence itself — Sullivan et al.
alone tested ~7,800 rules over 100 years).

- **Sullivan, Timmermann & White (1999)** applied a "reality check" bootstrap to
  ~7,800 candidate rules on 100 years of Dow data. Idea: if you search thousands of
  rules, the best one looks great by luck alone, so judge the winner against the luck
  of the whole search. The BLL-era results survive in-sample — but the best rule's
  edge **disappears in the post-1986 out-of-sample decade**.
- **Ready (2002)** showed the BLL profits were fragile even mechanically: executing a
  day after the signal (as any real trader must — and as our harness does) loses much
  of the paper profit, and the rules' discriminating power "declined dramatically"
  in the 1990s.
- **Bajgrowicz & Scaillet (2012)** used false-discovery-rate methods on the same rule
  universe: an investor could never have picked *ex ante* which rule would work next,
  and even in-sample the profits are "completely offset" by low transaction costs.
- **Fang, Jacobsen & Qin (2014)** ran the exact best BLL rules on genuinely fresh
  1987–2011 data: no predictive power.
- **Zakamulin (2014, 2018)** re-tested MA and momentum timing out-of-sample with
  costs and dividends: the advertised outperformance is mostly data-mining bias; over
  long horizons the timing strategies land close to (often below) buy-and-hold in
  return, while showing lower volatility and drawdown.

Why did rules that "worked" for 90 years stop? The two candidate stories are (a) the
market adapted once the rules were published, or (b) the historical result was partly
an artifact all along (selection among rules, ignoring costs and execution lag).
Fang et al. lean toward (b). Either way, the return edge is not there to harvest now.

## 3. The modern reframing: trend following as risk management

- **Faber (2007)** popularized the 10-month SMA rule (monthly close vs. its 10-month
  average; hold the asset above, hold cash below) across stocks, bonds, REITs, and
  commodities. Read carefully, his own headline is not "more return" — it is
  "equity-like returns with **bond-like volatility and drawdown**." The timing model's
  U.S.-stock return is roughly similar to buy-and-hold; the improvement is in risk.
- **Moskowitz, Ooi & Pedersen (2012)** documented *time-series momentum* — an asset's
  own past 12-month return predicts its next month — across 58 futures markets. This
  is the strongest academic support for trend following, but note the shape of the
  claim: the profits come from a **diversified portfolio across dozens of markets**,
  not from timing one stock. On any single asset the signal is weak and noisy.
- **Hurst, Ooi & Pedersen (2017)** (AQR) extended that to 67 markets back to 1880:
  positive in every decade, and — the risk-management point — performed well in 8 of
  the 10 biggest equity crises. Trend rules shine precisely when markets grind down
  for months, because that is the one thing an MA rule mechanically must catch.
- **Moreira & Muir (2017)** found that simply scaling exposure down when *volatility*
  is high improves risk-adjusted returns — evidence that "take less risk in bad
  regimes" is the real, robust phenomenon, of which MA timing is one crude
  implementation.

So the surviving, well-supported claim is narrow: trend/MA rules are a **drawdown and
volatility dampener**, most valuable in prolonged bear markets and across many assets
at once. The claim that an MA rule beats buy-and-hold on a single liquid stock, after
costs, is not supported post-1990.

## 4. Transaction costs and dividends

Two accounting details flip marginal results, and both matter to this project:

- **Costs and execution lag.** MA rules on daily data can flip often ("whipsaw" —
  rapid in/out switches in choppy markets). Bajgrowicz & Scaillet and Ready show even
  small per-switch costs and a one-day execution delay erase the historical edge. Our
  harness charges 0.1%/switch and executes next-day for exactly this reason.
- **Dividends.** A timing strategy is out of the market part of the time, so it
  misses part of the dividend stream. Studies (and backtests) built on price-only
  series therefore flatter timing relative to buy-and-hold. Zakamulin makes this
  point explicitly; our `--adjust` flag exists because we hit the same bias (T looked
  like -2.1% price-only but was +3.5% with dividends).

## 5. How this lines up with our harness

The harness verdict matches the literature almost point for point:

| Literature claim | Our measurement |
| --- | --- |
| No return edge over buy-and-hold after costs, post-1990 | Beat buy-and-hold 1/18 price-only; **0/6 total-return** |
| Timing carries no forecast information out-of-sample | Pooled BUY hit rates = base rates at every horizon; signal *flips* predict nothing either |
| Robust residual = shallower drawdowns via reduced exposure | Max drawdown shallower in **16/18**, from being invested only ~58% of the time |
| Works best on long sideways/declining series | The single return win was Ford, exactly that profile |
| Price-only data flatters timing | Confirmed via `--adjust` (verdict strengthened) |

Nothing in our data contradicts the published consensus, and nothing in the consensus
suggests our rule is broken — it is behaving the way 30 years of studies say MA rules
behave. This is why the UI legend should say "historically reduced drawdowns; did not
beat buy-and-hold," not "BUY = profit."

## 6. What would change our mind

Falsifiable follow-ups, runnable in the harness:

1. **Faber's 10-month monthly SMA** (fewer whipsaws than daily MA20/50/200). If it
   beat buy-and-hold total-return on most of the 18 tickers after costs, that would
   contradict Zakamulin and our verdict. Prediction from the literature: it won't
   beat on return, but should keep the drawdown benefit with fewer switches.
   → **Tested 2026-07-05 (`--strategy=faber`): prediction held.** 5/18 on CAGR
   price-only and 0/6 total-return; drawdown shallower 15/18 with 4–8× fewer
   trades; median matched-shuffle percentile 47% (timing ≈ random placement).
2. **12-month time-series momentum** (Moskowitz et al.) as an alternative rule —
   same prediction.
   → **Tested 2026-07-05 (`--strategy=tsmom`, long/cash variant): prediction
   held.** 3/18 on CAGR price-only and 0/6 total-return; drawdown shallower
   16/18 with the fewest trades of all (13–41 per ~19y); median matched-shuffle
   percentile 34%. Note this does NOT contradict Moskowitz et al. — their
   profits come from a diversified long/short portfolio across ~58 futures
   markets, and they never claim single-stock timing works. One instructive
   detail: crisis protection scales with reaction speed. In the fast COVID
   crash the daily rule won 17/18, Faber's 10-month rule 13/18, and 12-month
   TSMOM only 11/18 (median −26.1% vs −30.7% — barely better than holding),
   because a 12-month lookback stays "positive" well into a 5-week crash. In
   the slow 2008 grind all three variants won near-unanimously (18/18 for
   TSMOM). Slow rules protect against slow declines; only fast rules catch
   fast ones — and fast rules pay for it in whipsaws.
3. **A crisis-window test**: measure the strategies only over 2000–02, 2008–09,
   2020, 2022. The literature predicts the MA rule *should* clearly win those
   windows; if it doesn't, even the drawdown-dampening story fails for our rule.
   → **Tested 2026-07-05 (`crisisStats`): prediction held, decisively.** The
   daily rule beat buy-and-hold in 49/54 ticker-windows (17/18 financial
   crisis, median −9.5% vs −50.5%; 17/18 COVID; 15/18 2022). Faber's monthly
   rule won 47/54, weakest in COVID (13/18) — a monthly cadence exits too
   slowly for a 23-day crash. (2000–02 uncovered: free-tier history starts
   mid-2007.) The drawdown-dampening story survives its falsification test.
4. **An index/ETF-heavy basket**: the literature's residual claims are about broad
   markets, not single names; if drawdown reduction vanished on indexes, that would
   weaken the one benefit we currently advertise.

## 7. Walk-forward postscript: optimizing the MA lengths (2026-07-05, v0.10.0)

§2's out-of-sample decay claim — that MA parameters which backtested best keep
failing forward (Zakamulin's out-of-sample tests, Sullivan/Timmermann/White's
data-snooping correction) — got its own harness test when the walk-forward
machinery landed (`walkforward.js` + `wfma.js`). The experiment: every year,
backtest all 8 classic SMA crossover pairs (fast 10/20/50 × slow 50/100/200) on
the previous five years, pick the winner, trade it for the next unseen year,
roll ~15 times, and score only the stitched test years — the honest version of
"optimize the moving averages."

**The selection step carries no information.** Across 270 pooled picks (18
tickers × 15 folds), the training winner's rank on its own test year among the
8 candidates averaged **4.67 of 8** — statistically indistinguishable from the
no-information 4.50 (and on the *worse* side). It repeated as test-year winner
9% of the time (chance: 12.5%). The picked pair's median training CAGR of 9.4%
shrank to 1.8% realized, the median ticker cycled through 6 different "best"
pairs in 15 folds, and the walk-forward record beat buy-and-hold on CAGR in
**0/18** tickers (0/18 Sharpe, matched-shuffle percentile 19%). Sharpest of
all: the yearly-re-picked rule lost to a plain, never-re-picked 50/200 golden
cross in **14/18** tickers — the tuning is not merely useless, it costs money
relative to not tuning. Every number is the same shape on total-return prices,
with Sharpe-based selection, and with anchored (expanding) training windows
(mean rank 4.44–4.70 across all four configurations). The hindsight-best pair
per ticker "earned" a median 3.6pp more CAGR than the walk-forward record —
that gap is the exact size of the illusion an in-sample optimizer sells.

This closes the last loose thread of the MA topic from inside our own data:
not only does the family's timing carry no information (§5), *choosing among
the family's parameters* carries none either. The only reason the outcome
still tracks the family's one honest virtue — 13/18 shallower drawdowns —
is that every candidate in the space is a trend rule; that virtue never
depended on which one you pick.

## References

- Brock, W., Lakonishok, J. & LeBaron, B. (1992). "Simple Technical Trading Rules and
  the Stochastic Properties of Stock Returns." *Journal of Finance* 47(5), 1731–1764.
- Park, C.-H. & Irwin, S.H. (2007). "What Do We Know About the Profitability of
  Technical Analysis?" *Journal of Economic Surveys* 21(4), 786–826.
- Sullivan, R., Timmermann, A. & White, H. (1999). "Data-Snooping, Technical Trading
  Rule Performance, and the Bootstrap." *Journal of Finance* 54(5), 1647–1691.
- Ready, M. (2002). "Profits from Technical Trading Rules." *Financial Management*
  31(3).
- Faber, M. (2007). "A Quantitative Approach to Tactical Asset Allocation."
  *Journal of Wealth Management* 9(4), 69–79.
- Bajgrowicz, P. & Scaillet, O. (2012). "Technical Trading Revisited: False
  Discoveries, Persistence Tests, and Transaction Costs." *Journal of Financial
  Economics* 106(3), 473–491.
- Moskowitz, T., Ooi, Y.H. & Pedersen, L.H. (2012). "Time Series Momentum."
  *Journal of Financial Economics* 104(2), 228–250.
- Fang, J., Jacobsen, B. & Qin, Y. (2014). "Predictability of the Simple Technical
  Trading Rules: An Out-of-Sample Test." *Review of Financial Economics* 23(1), 30–45.
- Zakamulin, V. (2014). "The Real-Life Performance of Market Timing with Moving
  Average and Time-Series Momentum Rules." *Journal of Asset Management* 15, 261–278.
- Zakamulin, V. (2018). "Revisiting the Profitability of Market Timing with Moving
  Averages." *International Review of Finance* 18(2).
- Hurst, B., Ooi, Y.H. & Pedersen, L.H. (2017). "A Century of Evidence on
  Trend-Following Investing." *Journal of Portfolio Management* 44(1), 15–29.
- Moreira, A. & Muir, T. (2017). "Volatility-Managed Portfolios." *Journal of
  Finance* 72(4), 1611–1644.
