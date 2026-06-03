# Changelog

All notable changes to this project will be documented here.

---

## [0.4.0] - 2026-06-03
### Added
- RSI (14) and MACD (12/26/9) technical indicators, computed server-side in `GET /api/history/:ticker` from the daily closes already fetched for moving averages — no extra API calls
- "Technical indicators" section in the detail panel showing RSI and MACD with color-coded labels (Overbought/Oversold/Neutral; Bullish/Bearish/Flat)

### Notes
- RSI uses Wilder's smoothing and MACD uses EMAs, so values match canonical sources; validated against Twelve Data's own `/rsi` and `/macd` endpoints (AAPL: RSI 73.6 vs 73.58, MACD 9.91 vs 9.914)
- Computed locally rather than via Twelve Data's indicator endpoints to avoid extra rate-limited calls and external dependency — scales better and costs nothing per request

---

## [0.3.0] - 2026-05-31
### Added
- Backend deployed to Render; frontend now consumes it for real data
- Live prices for the whole watchlist (Finnhub via `GET /api/quote/:ticker`)
- Real MA-based signals: `GET /api/history/:ticker` computes MA20/MA50/MA200 from Twelve Data daily closes and derives BUY/HOLD/SELL with reason text
- Real 30-day sparklines drawn from actual closing prices
- Real 52-week high/low and volume in the detail panel (computed from the same Twelve Data history)

### Changed
- Signals and sparklines are no longer hardcoded/simulated
- Banner and legend updated to reflect real signal computation
- Removed the market cap metric rather than show a stale mock value (it needs share-count data we don't fetch yet) — fixes the case where a real price exceeded a hardcoded 52w high

### Notes
- Twelve Data added for historical data because Finnhub's free tier blocks candle data
- Finnhub free-tier prices run ~2% off the official close; accuracy review deferred

---

## [0.2.0] - 2025-05-09
### Added
- Watchlist grid with multi-ticker support
- Signal badges (BUY / HOLD / SELL) per card
- Signal change indicators (e.g. HOLD → BUY)
- 7-day sparkline charts per ticker card
- Congressional trade activity layer (simulated)
- Signal history log per ticker
- Expandable detail view with key metrics
- Persistent watchlist via localStorage

---

## [0.1.0] - 2025-05-09
### Added
- Initial stock lookup dashboard
- Single ticker search with price and key stats
- Moving average signal logic (MA20, MA50, MA200)
- Interactive price chart with range toggles (1W, 1M, 3M, 6M, 1Y)
- News headlines with AI-powered sentiment classification