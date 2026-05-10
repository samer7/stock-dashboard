# Signal Logic Design

This document explains how BUY / HOLD / SELL signals are currently calculated, why the current approach has limitations, and how Phase 4 will address them.

---

## Current approach (Phase 2)

Signals are based entirely on **moving average position** — where the current price sits relative to its MA20, MA50, and MA200.

| Moving average | Period | What it reflects |
|---|---|---|
| MA20 | 20-day | Short-term trend — reacts quickly to recent price action |
| MA50 | 50-day | Medium-term trend — a common momentum benchmark |
| MA200 | 200-day | Long-term trend — price above MA200 is broadly considered bullish |

**Signal rules (current):**
- **BUY** — price is above MA20, MA50, and MA200 (bullish alignment across all timeframes)
- **HOLD** — mixed positioning across the three MAs (no clear directional edge)
- **SELL** — price is below MA20 and MA50 (bearish short-term trend)

---

## The core limitation

Moving averages are **lagging indicators** — they are computed from past prices, so they confirm trends that are already underway rather than predicting what comes next.

A stock can be above all three moving averages and still reverse sharply. Trend-following alone doesn't answer:

- Is the stock overextended and due for a pullback?
- Is momentum accelerating or fading?
- Is the market narrative shifting in ways not yet reflected in price?
- Are informed participants (institutional funds, congress members) buying or selling?

Because of this, Phase 2 signals should be treated as **rough directional hints**, not actionable recommendations. The in-app disclaimer reflects this.

---

## Phase 4 plan: weighted scoring system

Phase 4 will replace the binary MA rule with a **weighted voting model**. Each input independently assesses the stock and casts a directional vote (bullish / neutral / bearish), weighted by how reliable that signal type tends to be. The final BUY / HOLD / SELL comes from the aggregate score.

### Inputs and their roles

**Moving averages (MA20, MA50, MA200)**
Already implemented. Establishes the baseline trend direction. Useful as a foundation but insufficient alone — see limitation above.

**RSI (Relative Strength Index)**
Measures whether a stock is overbought or oversold on a 0–100 scale. RSI above ~70 suggests the stock may be overextended even if trend is up; RSI below ~30 suggests potential undervaluation even if trend is down. This directly compensates for the core limitation of MA-only signals.

**MACD (Moving Average Convergence Divergence)**
Measures momentum — specifically whether the short-term trend is accelerating or fading relative to the longer-term trend. A bullish MA alignment with weakening MACD is a warning sign; MACD crossing upward adds conviction to a BUY signal.

**News sentiment**
Captures narrative shifts before they fully appear in price. A stock trending up alongside negative earnings reports or regulatory news is a different risk profile than the same uptrend with neutral or positive coverage. Source: Finnhub news feed with AI-powered sentiment classification.

**Congressional trade activity**
STOCK Act disclosures require members of Congress to report trades within 45 days. While not insider trading in the legal sense, committee members often have relevant policy visibility. Consistent congressional buying in a sector can be a soft signal worth weighing. Source: Quiver Quantitative.

**Institutional holdings**
Tracks what large, research-backed funds are doing — increasing or decreasing positions. Institutional accumulation alongside a bullish trend adds conviction; institutional distribution alongside a high price is a caution flag. Source: SEC EDGAR 13F filings.

### Weighting (proposed, to be refined with back-testing)

| Input | Proposed weight | Rationale |
|---|---|---|
| Moving averages | 30% | Foundational trend direction |
| RSI | 20% | Direct overbought/oversold correction |
| MACD | 20% | Momentum confirmation |
| News sentiment | 15% | Forward-looking narrative signal |
| Congressional activity | 10% | Soft informed-participant signal |
| Institutional holdings | 5% | Lagging but high-conviction signal |

Weights are a starting point and will be adjusted based on back-testing results against historical data.

### Back-testing plan

Once the scoring model is implemented, signals will be run against historical price data to measure:
- What % of BUY signals were followed by positive returns over 30/60/90 days
- What % of SELL signals were followed by negative returns
- Whether any individual input is adding or diluting signal quality

This gives an empirical basis for adjusting weights rather than relying on intuition alone.

---

## What this does not solve

Even with Phase 4 improvements, this system remains a **quantitative screening tool**, not a prediction engine. It does not account for:

- Macro events (rate decisions, geopolitical shocks)
- Earnings surprises
- Black swan events
- Individual risk tolerance or portfolio context

Signals are for informational purposes only and are not financial advice.
