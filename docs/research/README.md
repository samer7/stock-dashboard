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
  academic consensus on MA rules after costs. (Formal digest with citations
  still to be written.)
  **Robustness checks (same date):** with dividends reinvested (`--adjust`,
  total-return prices) the verdict *strengthens* — 0/6 on both CAGR and Sharpe
  across the dividend-heavy names (T/KO/PG/JNJ/XOM/SPY); price-only data had
  been understating buy-and-hold (e.g. T: -2.1% price-only vs +3.5% total
  return). And the result is insensitive to the cost assumption: AAPL strategy
  CAGR is 14.5%/13.3%/12.2% at 0/0.1%/0.2% per-switch cost vs 25.1% buy-and-hold
  in all cases.
- **Momentum** — the most robust return anomaly in the academic literature
  (Jegadeesh & Titman 1993 and hundreds of follow-ups).
- **Congressional trading** — Ziobrowski et al. (2004, 2011) found large excess
  returns pre-STOCK Act; post-2012 studies find the edge much smaller or gone.

No digest is written yet — entries land here as the topics are researched.
