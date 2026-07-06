# Glossary — the project's measurement vocabulary, in plain language

Every term below is used in the research digests, the harness reports, or the
CHANGELOG. Definitions lean on *this project's own results* as examples, because a
concrete number beats an abstract definition.

**Where the measured results live**, if you want to re-read any verdict:

- [README.md](README.md) (this folder) — the running summary: every topic, every
  harness verdict, in one place. Start here.
- Each digest's final sections — the pre-committed test and what it found:
  [ma-timing.md](ma-timing.md) §6–7, [momentum.md](momentum.md) §7,
  [rsi-macd.md](rsi-macd.md) §7–8, [congressional-trading.md](congressional-trading.md).
- [CHANGELOG.md](../../CHANGELOG.md) — the same story in build order, version by version.
- The reports themselves are reproducible: every `node sweep.js` / `momentum.js` /
  `rsievent.js` / `wfma.js` run prints the full tables again, byte-for-byte identical
  (frozen data + seeded randomness).

---

## Measuring performance

**Backtest** — replay history day by day, follow a rule's instructions with no
knowledge of the future, and track what a portfolio obeying it would have been worth.
A backtest is a simulation of the *past*; the project treats it as evidence only when
the honesty checks below are all in place.

**Buy-and-hold (B&H)** — buy on day one, never touch it. The benchmark that matters
most, because it's what someone who ignores the dashboard entirely gets for free.
"Beat buy-and-hold" is the minimum bar for any timing rule; almost nothing we tested
cleared it.

**CAGR (compound annual growth rate)** — the single "average yearly return" number.
$10,000 growing to $20,000 in 5 years ≈ 14.9% CAGR regardless of the path taken.

**Sharpe ratio** — return per unit of day-to-day bumpiness (volatility). Two
strategies with the same CAGR aren't equal if one got there smoothly and one via
stomach-churning swings; the smooth one has the higher Sharpe. Rule of thumb: below
~0.5 is unremarkable, above ~1 is rare for simple strategies.

**Max drawdown (maxDD)** — the worst peak-to-bottom fall along the way, e.g. −50%
means at some point you'd have watched half your money vanish. This is the one metric
where our trend rules genuinely beat buy-and-hold (16/18 tickers for the dashboard
rule) — the "risk dampener" finding.

**Total return / `--adjust`** — prices with dividends reinvested. Plain price charts
silently drop dividends, which makes dividend payers (KO, T, XOM…) look worse as
buy-and-hold than they really were — flattering any strategy that sits in cash a lot.
Every verdict in this project had to survive the `--adjust` rerun; several got
*stronger* (AT&T: −2.1% price-only vs +3.5%/yr total-return B&H).

**Transaction costs (`--cost`)** — every switch between stock and cash pays a fee
(default 0.1% of the portfolio, standing in for commission + slippage). Frequent
traders die by a thousand cuts: the MACD rule traded 364–438 times per ticker, the
heaviest "whipsaw bill" of anything we tested.

**Time-in-market** — the fraction of days a strategy is invested rather than in cash
(~58% for the dashboard MA rule). In a market that mostly rises, more time in the
market mechanically earns more — which is why fair baselines must match it (see
*matched random baseline*).

## The honesty checks

**Lookahead bias** — accidentally using information you couldn't have had yet; the #1
way backtests lie. Our fix is structural: a signal computed from today's close trades
*tomorrow* (**next-day execution**), and the walk-forward engine's `fit()` function
physically cannot see test data.

**Base rate** — the market's normal odds, e.g. "this stock was higher one month later
on 58% of ALL days." A BUY signal followed by gains 58% of the time told you nothing.
Every hit-rate table in the harness prints the base rate next to the signal's rate for
exactly this reason.

**Hit rate** — how often a signal was "right" (stock up after a BUY, down after a
SELL) at a given horizon (1 week / 1 month / 3 months / 1 year). Meaningless without
the base rate beside it. Our recurring result "hit rates = base rates" is the precise
form of "the timing carries no information."

**Pooling** — combining raw counts across all 18 tickers before computing a rate,
so a ticker with 2,000 signal-days weighs 1,000× more than one with 2 (averaging
per-ticker percentages instead would weight them equally). "934 pooled recross
events" means all tickers' events thrown into one pot.

**Event test / flip / transition** — scoring only the *moments a signal changes*
(HOLD→BUY) instead of every day it stays on. A BUY that stays lit for six months is
one decision, not 126 independent ones (**autocorrelated samples** — repeated rows
that all echo the same decision and inflate your confidence). The flip is also what a
dashboard user actually reacts to. Verdict here: after ~3,700 flips to BUY, the
market behaved like it does after any random day.

**Random baseline** — 1,000 simulated "monkeys" that switch between stock and cash
the same *number* of times as the strategy but on random days. If the strategy can't
beat most monkeys, its timing logic added nothing.

**Matched random baseline (beat-matched)** — the stricter version: shuffle the
strategy's *own* holding periods in place — same number of trades AND same total
time-in-market, only the *placement* randomized. The dashboard rule scored in the
34th percentile against its own shuffles: its actual placement was slightly *worse*
than random placements of the identical pattern.

**Percentile (in these reports)** — "beat X% of the random trials." ~50% =
indistinguishable from luck; consistently above ~90% would be interesting; below 50%
= worse than random.

**Crisis window** — scoring a strategy only inside the big named declines (2008–09
financial crisis, COVID crash, 2022 bear market). This is where a trend rule is
*supposed* to earn its keep, and it's the one test our rules passed decisively
(daily MA rule: median −9.5% vs −50.5% for buy-and-hold through the financial crisis).

**Survivorship bias** — testing only on stocks that survived (or won). Free data
can't fetch bankrupt/delisted tickers at all, and our basket contains AAPL/NVDA
*because* they won — so the basket is survivor-tilted by construction. Practical
consequence: a *win* on this basket is suspect, a *loss* is informative. The reports
say this in their caveats every time.

**Deterministic / seeded randomness** — every harness run gives byte-identical
output: data is served from a frozen disk cache and all "random" trials use a seeded
generator (same seed → same trials). If a number can't be reproduced, it isn't
evidence.

## Fitting and overfitting

**In-sample / out-of-sample** — data a rule was built or tuned on, versus data it
never saw. In-sample performance is a promise; out-of-sample performance is a
measurement. Only the second counts.

**Overfitting** — a rule molded to past data memorizes that data's noise and falls
apart on new data. The wfma experiment made this concrete: parameter picks earned a
median 9.4%/yr in training and 1.8%/yr on the year that followed.

**Data snooping** — overfitting's research-scale cousin: test enough rules on the
same history and *something* always looks great by chance. The academic answer
(Sullivan–Timmermann–White) is to correct for how many rules were tried; our answer
is pre-committed predictions written into each digest *before* the test runs.

**Walk-forward** — the honest way to evaluate anything fitted: fit on a training
window (say 5 years), freeze it, score it on the next unseen year, slide forward,
refit, repeat; stitch only the test years into the record.
The engine is `server/harness/walkforward.js`; anything Phase 5b/5c fits from data
must pass through it. (**Anchored** = the training window grows from day one instead
of sliding.)

**Hindsight-best** — the parameter choice that turns out best over the whole test
span, selectable only by knowing the future. Deliberately reported as the "cheat"
column in wfma.js to show the gap (median 3.6pp of CAGR) between what an in-sample
optimizer *promises* and what operating one *delivers*.

## Strategy jargon

**SMA / EMA** — simple moving average (plain average of the last N closes) /
exponential moving average (same idea, recent days weighted more). The smoothed
trend lines everything here is built from.

**Crossover / golden cross** — be invested when the fast average is above the slow
one, in cash otherwise. The famous 50-day/200-day version is the "golden cross." In
the walk-forward test, this *untuned* pair beat the yearly-re-tuned picks in 14/18
tickers.

**Trend-following** — the whole family of "ride it while it's rising, step aside
when it's falling" rules: the dashboard MA rule, Faber's 10-month rule, TSMOM, and
the MACD cross are all members. Family verdict: no return edge, real crash
protection.

**Whipsaw** — a false alarm: the rule exits on a dip, the market snaps back, the
rule buys back in higher — paying costs both ways. The price of fast reaction; see
next entry.

**Speed-vs-whipsaw spectrum** — our cross-variant finding: the faster a trend rule
reacts, the better it dodges fast crashes and the more whipsaws it pays. COVID-crash
protection ordered exactly by reaction speed: MACD (daily, fastest) 18/18 > daily MA
17/18 > Faber (monthly) 13/18 > TSMOM (monthly, 12-month lookback) 11/18 — and the
return drag orders the same way. Protection is bought, not free.

**Faber 10-month rule** — once a month: invested if the price is above its 10-month
average, else cash. The academic literature's favorite MA variant.

**Time-series momentum (TSMOM)** — "is the market higher than a year ago?" — each
asset judged against *its own past*. Long/cash, decided monthly.

**Cross-sectional momentum** — ranking stocks *against each other* and holding the
recent relative winners. This is the one with real academic support — but the edge
lives in hundreds of small names and half of it is on the short side; in our 18
mega-caps the 12-2 top-3 rule added nothing over holding the basket.

**12-2 (and 12-1)** — momentum lookback notation: rank by the return from 12 months
ago to 2 months ago, skipping the most recent month (short-term reversal makes the
last month misleading — though on our survivor-picked basket the no-skip 12-1 version
happened to win, a documented noise artifact, not a discovery).

**RSI / oversold / recross** — RSI(14) is a 0–100 gauge of recent up-moves vs
down-moves; below 30 is the classic "oversold" zone and crossing back above 30 is
the folklore "the dip is over" buy trigger. Measured: the week after a recross was
slightly *worse* than an average week (1st percentile vs matched random).

**MACD / signal line** — MACD line = EMA12 − EMA26 (a fast-vs-slow gap); signal
line = a 9-day EMA of that gap; "bullish crossover" = MACD line above signal line.
Structurally just another MA crossover — which is exactly how it tested.

**Risk dampener vs return generator** — the project's one-line verdict on all its
trend signals: they don't make more money (return generator: no), they lose less in
crashes by being in cash ~40% of the time (risk dampener: yes, 49/54 crisis
ticker-windows). The UI legend says this in those words.
