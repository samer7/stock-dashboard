# Changelog

All notable changes to this project will be documented here.

---

## [0.7.1] - 2026-07-04
### Added
- Unattributed-disclosure aggregate: the parser now counts every transaction row it does NOT surface as a trade (no clean ticker, options, crypto, exchanges) by asset-type tag. `/api/congress/recent` returns it as `unattributed`, and the feed footer renders one honest line: "Not shown: 410 more disclosed transactions with no clean stock ticker — mostly U.S. treasuries (244), corporate bonds (36), other assets (32)." Without this, a member moving millions in treasuries looked inactive

### Fixed
- Asset labels corrected against the official code list (fd.house.gov/reference/asset-type-codes.aspx): `[AB]` is Asset-Backed Securities (previous "LP units" gloss was wrong — the AllianceBernstein sample was a ticker/tag coincidence), `[RS]` is Restricted Stock Units, `[OI]`/`[OL]` are ownership interests

---

## [0.7.0] - 2026-07-04
### Added
- Trade-size band breakdown per ticker: `/api/congress/:ticker` now returns `bands` — buy/sell counts per disclosure dollar band ($1K–$15K … $50M+), computed over ALL of the ticker's trades in the window — plus `total` (the uncapped trade count). The detail panel renders it as thin green/red meters with counts written in text (buys always the left segment, so meaning never rests on color alone; the green/red pair was validated for colorblind separation)
- Feed summary rows now carry a size cue: "mostly $1K–$15K" / exact band / "mixed sizes"
- Ticker capture widened from `[ST]`-only to any asset-type tag, with the tag passed through as `asset` and labeled in the UI (e.g. "Buy · restricted"). Two tags are excluded deliberately: `[OP]` options (a bought put is bearish on the underlying — a plain "Buy" would mislead) and `[CT]` crypto (symbols collide with real stock tickers: `(ETH)` the coin vs. Ethan Allen, NYSE: ETH)

### Notes
- Surveyed the full 2026 PTR corpus before implementing: the `[EF]` ETF tag occurs ZERO times — filers tag ETFs `[ST]`, so ETFs were already captured and the roadmap's original assumption was wrong. The widening actually adds the rarer tickered types: `[OT]` 6, `[PS]` 2, `[RS]` 2, `[AB]` 1 rows this year (e.g. a $5M–$25M restricted-stock buy previously invisible). One `NYSEARCA: DIA`-format row exists corpus-wide; deliberately not parsed (a rule for one row would be overfitting)
- `abbreviateDollars` now renders band floors cleanly ($1,000,001 → "$1M", not "$1.0M")
- PTRs disclose ranges, never exact amounts — the band distribution is the most honest size view possible, and the UI says "this year" to match the actual window

---

## [0.6.0] - 2026-07-04
### Added
- "Recent House activity" feed: a new `GET /api/congress/recent` endpoint serving the newest 100 disclosed trades across ALL tickers and members, built from the same parsed index as the per-ticker data (no extra PDF work). Rendered as a panel below the watchlist, independent of which tickers you track
- The UI groups feed rows by member + day: one member rebalancing a portfolio can file dozens of same-day trades (verified live — 16 Cisneros trades on one day filled the entire ungrouped feed), so bulk days collapse to a summary row ("10 buys, 6 sells") with a ticker preview, keeping other members visible

### Fixed
- Future-dated transaction dates (filer typos, e.g. a trade dated 12/26/2026 in a PDF filed early 2026) are excluded from the feed — sorted newest-first, they would otherwise pin themselves to the top for months

### Notes
- The literal `/api/congress/recent` route must stay registered before `/api/congress/:ticker` — Express matches in definition order, and "recent" would otherwise parse as a ticker symbol
- Verified end-to-end in headless Chrome against a local backend: loading state → 12 grouped rows across 7+ members, backend-unreachable → clean error message, empty watchlist → feed still loads

---

## [0.5.2] - 2026-07-04
### Fixed
- User-added tickers no longer vanish on reload. The watchlist persisted correctly in `localStorage`, but on page load only the six hardcoded mock tickers ever rendered — anything you'd added yourself was silently skipped. Every persisted ticker now renders and fetches its real data
- Down days now show a minus sign on the dollar change (was `$31.85 (-7.49%)`, now `-$31.85 (-7.49%)`)

### Changed
- Removed all remaining mock data from the frontend (~150 lines): the hardcoded `STOCKS` blob, the seeded random-walk sparkline fallback, the fabricated signal history logs, and the random fake numbers `addTicker` invented for unknown tickers
- Cards now show an honest loading state (grey badge, "Loading live quote…") until each fetch resolves — which matters on Render's free-tier ~30s cold start — and a clear error state for invalid tickers instead of fake prices
- The signal history section says "not tracked yet" instead of displaying an invented log; signal-change logging is planned for a later phase
- Detail-panel metrics render an em dash while loading instead of `$0.00`

### Notes
- Verified end-to-end in headless Chrome: initial loading state, live hydration, add ticker → reload → ticker persists and hydrates, invalid ticker (`ZZZZZZ`) shows the error state, remove → reload stays removed

---

## [0.5.1] - 2026-06-14
### Changed
- Widened House congressional coverage: the disclosure-parse window grows from 120 to 365 days, and the per-ticker trade cap sent to the UI grows from 10 to 25 — more history surfaces per ticker
- Corrected the README "Honest state" section to reflect what's actually shipped: RSI/MACD, real House congressional trades, real sparkline data, and real volume/52w high/low are no longer listed as simulated (only the signal history log remains hand-written)

### Notes
- The 365-day window is bounded by the current-year disclosure feed: the build only downloads this calendar year's ZIP and PDFs, so early in the year the effective window is "Jan 1 → today" rather than a true rolling 12 months. Spanning the prior year's feed is deferred (it would roughly double the cold-start PDF count early in the year). Verified locally on 2026-06-14: AAPL returns the full 25-trade cap and the cold index build stays fast (~2s) precisely because it's still single-year data

---

## [0.5.0] - 2026-06-13
### Added
- Real congressional trading data (U.S. House) via a new `GET /api/congress/:ticker` endpoint, replacing the simulated congress data in the detail panel and card pills
- Source is the official U.S. House Clerk financial-disclosure feed — free, no API key. The backend downloads the yearly disclosure ZIP, parses each recent Periodic Transaction Report (PTR) PDF with `pdf-parse`, and buckets stock trades by ticker (cached 12h)
- New backend dependencies: `adm-zip` (read the disclosure ZIP) and `pdf-parse` (extract PDF text)

### Changed
- Watchlist sparkline now colors by the 30-day trend (first vs. last close) instead of today's price change, so the line color matches the shape it draws

### Notes
- House only for now. The Senate uses a separate system (eFD) behind a click-through agreement — deferred
- Only ~90% of recent PTRs are filed electronically and yield machine-readable text; scanned/handwritten filings (~10%) are skipped. We also keep only trades with a clean ticker (the "(AAPL) [ST]" form), skipping bonds/options/untagged assets, to avoid mis-attributing trades
- Paid sources were all rejected for the free-tier requirement: FMP gates congress data to its Ultimate plan, Finnhub's congress endpoint is premium, and Quiver has no free API tier. The popular "stock-watcher" community datasets are abandoned (last updated 2021)
- First request after a cold start is slow (it builds the disclosure index by reading many PDFs); the frontend shows a loading state

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