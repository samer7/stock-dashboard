# Congressional stock trading: what the literature says

*Digest written 2026-07-05. Companion to the dashboard's House-disclosure feature and
design input for Phase 5e (per-member track records). Roadmap reminder: congressional
transparency is a project goal in itself — the feature earns its place even if the
predictive value turns out to be zero.*

## In one paragraph

The famous result — U.S. Senators' stock picks beating the market by ~12% a year —
comes from data ending in 1998, and it did not survive scrutiny. A careful 2013
re-analysis found congressional portfolios actually *lag* index funds, and every
credible study of trades made after the STOCK Act of 2012 (which mandated the 45-day
disclosures our dashboard ingests) finds **no abnormal returns at all**; if anything,
members' buys slightly underperform. The real-world test agrees: ETFs that copy
congressional disclosures (NANC/KRUZ, launched 2023) have roughly tracked the S&P 500
before their 8× higher fees, NANC's edge explained by a tech tilt, not political
insight. So for our data — House only, up to 45 days late, amounts in wide dollar
bands — the honest prior is that per-member track records will mostly measure luck.
Phase 5e should be built as a **transparency and honest-measurement feature**, with
explicit guards against the one guaranteed failure mode: with hundreds of filers,
some will look brilliant by chance alone.

## 1. The pre-STOCK-Act evidence: the Ziobrowski studies

**Ziobrowski, Cheng, Boyd & Ziobrowski (2004)** hand-collected Senators' disclosed
trades for 1993–1998 and measured *abnormal returns* — returns above what the stock's
market risk alone would predict. A portfolio mimicking Senators' buys beat the market
by roughly 85 basis points a month (a basis point is 0.01%, so ~12% a year), and
stocks they sold underperformed afterward. Timing that good normally implies
non-public information; this paper is the origin of the "Congress beats the market"
belief and, after heavy press coverage, a direct cause of the STOCK Act.
**Ziobrowski, Boyd, Cheng & Ziobrowski (2011)** repeated the method for the House,
1985–2001 (~16,000 trades by ~300 members): buys beat the market by ~55 basis points
a month (~6% a year) — half the Senate effect, but still large.

Note what both studies are *not*: tests of copying disclosures. They measure from the
**trade date**, which only the member could act on; in their era disclosures appeared
annually on paper, so an outsider could not have followed along.

## 2. The rebuttal: Capitol Losses

**Eggers & Hainmueller (2013)** re-examined the same ground and reversed the verdict.
Re-analyzing the 1985–2001 trade data, they found the Ziobrowski results fragile —
sensitive to methodological choices such as how a "calendar-time portfolio" weights
many small trades. Their own analysis of 2004–2008 disclosures, including the first
look at members' *holdings* (not just trades), found the average member of Congress
would have earned **more in a passive index fund**. Mediocre, not prescient.

The lesson for us is less about Congress than about method: two teams, same public
disclosures, opposite headline — aggregation and weighting choices can manufacture or
erase an "edge" in noisy trade data. Phase 5e must pre-commit its method before
looking at the leaderboard.

## 3. After the STOCK Act (2012): the edge is gone

The STOCK Act (April 2012) affirmed that insider-trading law applies to Congress and
created the periodic transaction reports (PTRs) — filed within 30–45 days of a trade —
that this dashboard parses. Studies of the post-2012 era:

- **Belmont, Sacerdote, Sehgal & Van Hoek (2022)** — the most comprehensive test: all
  disclosed Senate and House trades, January 2012–December 2020. **No evidence of
  superior performance**, in aggregate or for the specific Senators publicly accused
  of informed trading (e.g. around COVID briefings). Stocks House members bought
  went on to *underperform* by ~26 basis points over the next six months on average;
  sells underperformed by ~11 bps. Members trade like retail investors, not insiders.
- **Karadas (2019)** — 2004–2010, buy-minus-sell portfolios of "powerful" politicians
  (leadership/key committees) earned large abnormal returns at short holding periods
  (35%+ annualized for powerful Republicans at a one-week hold), but **the abnormal
  returns disappear after the STOCK Act**. Note the shape of the pre-2012 effect:
  short horizons, small powerful subgroup — not broad stock-picking skill.
- **Karadas (2018)** — spouses' portfolios (2004–2010) showed 12%+ annualized
  abnormal returns at short holds, again concentrated among powerful members — and
  again **underperforming the market in 2011–2014**. Relevant because PTR lines are
  tagged spouse/dependent: the one subgroup the older literature flagged.

Consensus: whatever informational edge existed pre-2012, the combination of legal
exposure and public scrutiny shrank it below detectability in the disclosure data.

## 4. The copy-trading reality check: NANC and KRUZ

Two ETFs launched February 2023 do exactly what "follow Congress" implies: **NANC**
buys what Democratic members (and spouses/dependents) disclose, **KRUZ** follows
Republicans — necessarily *after* the up-to-45-day lag, charging 0.75%/year (vs
~0.09% for an S&P 500 fund). Through mid-2026: NANC has roughly
matched-to-slightly-beaten SPY (~24.4% vs ~23.2% annualized over three years, though
it lagged in 2025) and KRUZ has lagged. Analysts attribute NANC's showing to its
heavy tech/NVDA tilt during an AI bull market — a sector bet, not political
information; a 2025 *Economics Letters* analysis of both funds concludes the same.
Three years proves little, but the live experiment matches the post-2012 studies:
**after the delay and fees, copying disclosures has been an expensive index fund.**
The lag matters independently: Karadas found pre-2012 abnormal returns concentrated
at ~one-week holds, so an informed trade is mostly spent before the PTR is public.
Only a slow, months-scale edge could survive the lag — exactly the ~6–12 month
horizon Phase 5e measures, and where Belmont et al. find slight *under*performance.

## 5. Pitfalls specific to our data

Things the literature (and our parser) says will bite a naive track-record ranking:

- **Dollar bands, not amounts.** PTRs report ranges ($1,001–$15,000, …), so a $1,050
  dabble and a $14,900 conviction buy look identical. Track records must be
  per-*trade* (equal-weighted), stated as such.
- **Spouse/dependent trades** appear under the member — often a spouse's advisor
  rebalancing, with no plausible information content, diluting everything.
- **Amendments and late filings.** PTRs get amended and sometimes filed months late
  (our feed already filters future-dated typos). Measure from **disclosure date**,
  never trade date, for anything framed as "copyable."
- **Our parser's blind spot.** ~10% of PTRs are scanned images we skip; options and
  crypto are excluded by design; Senate is absent. Track records describe
  "machine-readable House disclosures," not "Congress."
- **Small samples and member survivorship.** Most members file a handful of tickered
  trades a year; members leave office mid-sample. A 7-for-9 record is noise.
- **The multiple-comparisons trap** — the big one. Rank hundreds of filers on a noisy
  statistic and the top of the leaderboard is *guaranteed* to look spectacular even
  if every member trades randomly (flip 435 coins ten times each: several score 8+
  heads). A per-member ranking shown without a luck baseline is misinformation.

## 6. How this shapes Phase 5e

Design guidance, all testable in the existing harness (daily closes, ~20y/ticker):

1. **Frame as transparency + measurement, not tips.** The headline stat is "what
   happened after this member's disclosed buys" — descriptive, like the MA legend's
   "did not beat buy-and-hold" reframe. Expected finding: most members ≈ market,
   none reliably above it.
2. **Clock starts at disclosure date** (filing date from the PTR index) — the
   earliest a user could know. Optionally show trade-date returns separately,
   labeled "not copyable," to display the cost of the lag.
3. **Fixed horizons, decided now:** forward return at 1m/3m/6m/12m from disclosure,
   vs two baselines — SPY over the same window, and **matched random trades** (same
   ticker universe, same trade count, random dates), reusing the harness's
   matched-shuffle machinery. A member's score is a percentile against their own
   randomized trades, exactly like the MA rule's 34%-percentile verdict.
4. **Minimum sample before display:** no per-member stat under ~20 scored buys —
   show "n too small" instead (the honest cell). Equal-weight trades; note the
   band-width caveat in the UI.
5. **Multiple-comparisons guard:** judge any standout against how extreme the *best
   of N* members looks under the null — compare the leaderboard's top percentile to
   the maxima across all members' random baselines (the Sullivan et al. "reality
   check" logic from ma-timing.md). Better still, split time: rank members on the
   first half of the window, test only the top decile on the second half.
6. **Report aggregate first.** The pooled "all disclosed House buys vs SPY at 6m"
   number is the robust, literature-comparable statistic (Belmont et al. predict
   roughly −0.3%); per-member rows are the transparency layer beneath it.

## 7. Harness verdict (2026-07-15, `congresstrack.js` — Phase 5e measured)

The §6 design ran as specced: 43,430 deduped trades parsed from all 5,849 digital
House PTRs 2014–2026 (`congressdata.js`; dual-format parser, name-variant
canonicalization, amendment dedupe), 14,762 scored (34% — priced coverage is the
~200 most-traded tickers; the rest are mostly delisted/fund symbols, counted and
disclosed in the UI). Clock at disclosure date, excess vs SPY, equal weight.

- **Pooled: +1.20% vs SPY at 6m (n=7,272), 50% hit rate.** Sells +0.15%. Modestly
  above Belmont et al.'s −0.26%, with two honest deflators: the priced universe is
  the most-traded (large-cap, survivor-tilted) slice, and delisted losers drop out.
  A coin-flip hit rate either way: no exploitable aggregate signal.
- **Per-member: 77 members clear the 20-buy minimum; 7 score ≥95th percentile
  against their own matched-random baseline (chance predicts ~4).** The best-of-N
  reality check settles it: the leaderboard's top record (+19.1% at 6m, n=31) sits
  at the **93rd percentile of the best-of-77-random distribution** — below the bar.
  With 77 records ranked, luck alone routinely manufactures a +14% "star."
- **Split-sample: 13 members qualify (≥20 scored buys in each half); the in-sample
  top decile (2 members) stayed positive out-of-sample** (+8.0%→+5.2%, +5.3%→+2.8%)
  but neither cleared their random baseline over the full sample (95th and 14th
  percentile respectively) — suggestive at most, and exactly what a few lucky
  survivors among 77 should produce.
- **Verdict: no skill claim is licensed; the transparency feature ships.** Every
  displayed record carries its luck percentile and the 20-buy gate; the pooled line
  and coverage caveats ship with it. This is the literature's post-2012 null,
  reproduced on our own pipeline.

### 7.1 Coverage doubled to 69% (2026-07-25) — the deflator, measured

§7 named two deflators for its modestly-positive +1.20%: the priced universe was the
most-traded large-cap slice, and delisted losers drop out. Both were stated as
*reasons to distrust the number*, not as measured quantities. Extending price coverage
turned them into a measurement.

Adding 379 tickers of price history (287 → 666 cached, ~450 new fetches over one
Twelve Data day) moved scored coverage from **34% → 69%** of disclosed trades
(14,762 → 29,804 of 43,430). Nothing else changed: same corpus, same method, same
pre-committed §6 guardrails, no re-specification.

| | at 34% coverage | at 69% coverage |
| --- | --- | --- |
| Pooled buys, 6m excess vs SPY | +1.20% (n=7,272) | **+0.15% (n=14,466)** |
| Buy hit rate at 6m | 50% | 47% |
| Members clearing the 20-buy gate | 77 | 96 |
| Members ≥95th luck percentile | 7 (chance ~4) | 6 (chance ~5) |
| Top record vs best-of-N-random | 93rd percentile | **24th percentile** |

**The deflator was real and it was most of the signal.** Belmont et al. predict
≈ −0.26% for House buys at 6m; at honest coverage we measure +0.15% on 14,466 trades
— a gap of 0.4pp, which is as close to reproducing a published null as this pipeline
can get. Other horizons agree: +0.02% at 1m, +0.07% at 3m, +0.64% at 12m, with hit
rates of 48%/48%/46%. Sells are flat too (−0.04% at 6m).

The best-of-N result is the sharpest change and deserves emphasis. At 34% coverage the
top member sat at the 93rd percentile of the best-of-77-random distribution — below the
95th-percentile bar, but close enough to be interesting. At 69% coverage the top record
(+14.28%) sits at the **24th percentile** of best-of-96-random, whose median is +17.31%.
The leaderboard's best member is now *weaker* than what luck alone typically produces
across a field this size. Split-sample decays in the same direction: the in-sample
top decile fell 19.85% → 10.50%, 11.19% → −1.15%, and 8.00% → 1.04% out-of-sample.

**Methodological lesson worth keeping.** The direction of this move was predicted in
advance — §7 said the positive figure was survivor-tilted and would shrink with
coverage — but the *size* was not: it took roughly 90% of the apparent edge with it.
Any future statistic from this corpus should quote its coverage fraction alongside the
number, because at 34% coverage this dataset said "+1.20%, modestly above the
literature" and at 69% it says "+0.15%, the literature reproduced." The UI now prints
the coverage percentage in the pooled footer for exactly this reason. Residual coverage
gaps still flatter these records, since what remains unpriceable is disproportionately
delisted — so +0.15% should be read as an upper bound, not a point estimate.

## 8. What would change our mind

- **Pooled disclosed buys beating SPY at 6–12m** in our data, out-of-sample and past
  the matched-random baseline, would contradict Belmont et al. — worth a very
  skeptical second look (data error first, discovery second).
- **A member surviving the split-sample test** (top-decile in-sample, still above the
  random baseline out-of-sample, n ≥ 20 in each half) would be the first per-member
  skill evidence our design could accept. The literature predicts no one clears it.
- **Committee/power conditioning:** Karadas found the pre-2012 effect concentrated in
  powerful members. If we ever join member-to-committee data, "powerful members'
  buys" is the one theory-motivated subgroup worth a pre-registered test — chosen in
  advance, not a fishing expedition.
- **NANC/KRUZ diverging from the S&P over 10+ years** (net of fees, beyond their
  sector tilts) would be live evidence that disclosure-copying works after all.

## References

- Ziobrowski, A.J., Cheng, P., Boyd, J.W. & Ziobrowski, B.J. (2004). "Abnormal
  Returns from the Common Stock Investments of the U.S. Senate." *Journal of
  Financial and Quantitative Analysis* 39(4), 661–676.
- Ziobrowski, A.J., Boyd, J.W., Cheng, P. & Ziobrowski, B.J. (2011). "Abnormal
  Returns From the Common Stock Investments of Members of the U.S. House of
  Representatives." *Business and Politics* 13(1), 1–22.
- Eggers, A.C. & Hainmueller, J. (2013). "Capitol Losses: The Mediocre Performance of
  Congressional Stock Portfolios." *Journal of Politics* 75(2), 535–551.
- Belmont, W., Sacerdote, B., Sehgal, R. & Van Hoek, I. (2022). "Do Senators and
  House Members Beat the Stock Market? Evidence from the STOCK Act." *Journal of
  Public Economics* 207, 104602.
- Karadas, S. (2018). "Family Ties and Informed Trading: Evidence from Capitol Hill."
  *Journal of Economics and Finance* 42, 211–248.
- Karadas, S. (2019). "Trading on Private Information: Evidence from Members of
  Congress." *Financial Review* 54(1), 85–131.
- NANC / KRUZ (Unusual Whales Subversive Democratic/Republican Trading ETFs,
  launched Feb 2023) — live performance vs SPY per public fund trackers
  (Morningstar, stockanalysis.com), checked 2026-07; and "U.S. Congress members'
  trading activities: A case of NANC and KRUZ," *Economics Letters* 250 (2025).
