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
- **Congressional trading** — Ziobrowski et al. (2004, 2011) found large excess
  returns pre-STOCK Act; post-2012 studies find the edge much smaller or gone.

Digests so far: [ma-timing.md](ma-timing.md). Other entries land here as the
topics are researched.
