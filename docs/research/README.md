# Research notes

This folder is the project's "source of truth" workstream: plain-language digests of
published quantitative-finance research, with citations, each tied to something this
project implements and measures.

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
- **Momentum** — the most robust return anomaly in the academic literature
  (Jegadeesh & Titman 1993 and hundreds of follow-ups).
  **Digest: [momentum.md](momentum.md)** (2026-07-05, 13 verified citations):
  cross-sectional momentum (ranking stocks against each other — distinct from
  the time-series variant the harness already rejected) is real and pervasive,
  but the caveats stack: half the profit is on the short side, turnover costs
  eat much of the rest, it crashes in market rebounds, and it decays ~58%
  post-publication. Realistic long-only after-cost edge on large caps: ~1–3%/yr
  of relative edge, and momentum spreads are smallest among mega-caps — exactly
  our basket. **Proposed harness test (not yet run): 12-2 relative momentum,
  top-3, monthly** — rank the 18-ticker basket by `close[t−21d]/close[t−252d] − 1`
  at month-end, hold the top 3 equal-weighted, benchmark vs equal-weighted
  buy-and-hold of the same basket, with next-day execution, costs, and
  `--adjust`. Needs a small portfolio-mode harness extension (which doubles as
  Phase 6's simulator core). Literature's prediction: within a few points of
  the basket either side, ~52–55% monthly hit rate — likely indistinguishable
  from coin-flip on ~230 months.
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

Digests so far: [ma-timing.md](ma-timing.md), [momentum.md](momentum.md),
[congressional-trading.md](congressional-trading.md). Other entries land here
as the topics are researched.
