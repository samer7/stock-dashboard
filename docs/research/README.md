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
  Early harness result (2026-07): on AAPL and SPY over ~19 years, the dashboard's rule
  underperforms buy-and-hold on total return and doesn't reliably beat random
  switching — consistent with the post-1990s academic consensus on MA rules.
- **Momentum** — the most robust return anomaly in the academic literature
  (Jegadeesh & Titman 1993 and hundreds of follow-ups).
- **Congressional trading** — Ziobrowski et al. (2004, 2011) found large excess
  returns pre-STOCK Act; post-2012 studies find the edge much smaller or gone.

No digest is written yet — entries land here as the topics are researched.
