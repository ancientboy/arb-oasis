# ArbOasis Development Roadmap

## Working Rule

`ancientboy/arb-oasis` → `main` is the only long-term source of truth.

Every Work / Codex / ChatGPT session should begin by reading:

1. `README.md`
2. `docs/ARBOASIS_PRODUCT_SPEC.md`
3. `docs/ARBOASIS_ARCHITECTURE.md`
4. `docs/ARBOASIS_ROADMAP.md`

Do not rebuild the project from scratch when continuing development. Inspect the current `main` branch first and extend it.

---

# P0 — Research Scanner Foundation

Status: substantially implemented. REST market access now runs through a same-origin
Sites backend proxy so browser CORS/region restrictions do not blank the scanner.

### Completed / present in current codebase

- Binance market adapter
- Bitget market adapter
- Gate market adapter
- dynamic USDT perpetual universe
- any-two-venue common-symbol universe
- three-venue common-symbol view
- Crypto / TradFi-RWA classification
- executable bid/ask spread calculation
- current funding-rate ingestion
- funding interval normalization
- configurable fees
- risk buffer
- BBO capacity checks
- mark/index deviation checks
- quote freshness / venue status
- opportunity score
- public WebSocket layer
- REST fallback / calibration layer
- browser-local research history
- funding persistence statistics
- paper trading
- static research dashboard

### P0 hardening completed in current Sites build

- same-origin backend market proxy with a fixed upstream allowlist and bounded timeout
- partial-venue degradation: the scanner continues when any two venues remain usable
- Bitget public WebSocket v2 subscription and ticker field normalization
- exponential reconnect/backoff telemetry without duplicate reconnect loops
- explicit missing bid-size, funding, mark and index semantics
- data-source health and degraded-source events in the UI
- API/render smoke coverage in the automated test suite
- symbol additions/removals refresh without a full page reload

### P0 remaining hardening

- verify every exchange WebSocket subscription against current production behavior
- improve contract-symbol equivalence for TradFi aliases
- add full-depth sequence/book integrity validation

---

# P1 — Persistent Historical Data Platform

Priority: highest.

Status: in progress. The first Sites/D1 slice now persists funding observations and
spread/opportunity snapshots, exposes a 7d/30d Carry statistics API, and lets the
dashboard switch between server-backed 7d/30d Carry statistics with a local fallback.
The same APIs now support 24h and 90d windows plus server-backed opportunity
persistence, executable-rate, average/max edge and capacity statistics.

The browser localStorage research history is temporary. The next major milestone is durable historical data.

## Deliverables

### 1. Backend collector service

An always-on independent collector with bounded upstream requests, per-source health,
last-known-good caching and an authenticated Site gateway is implemented under
`services/market-data`. Production server deployment and Site environment binding
remain incomplete.

Collect public market data continuously from Binance, Bitget and Gate.

Capture:

- BBO
- configurable order-book depth
- mark
- index
- funding
- indicative funding where available
- next funding time
- funding interval
- open interest
- quote volume
- contract metadata

### 2. Time-series database

Initial D1 schema implemented for funding observations and opportunity snapshots.
Contract metadata, venue health, settlement history, depth snapshots and shadow
trade observations remain incomplete.

Preferred implementation may use PostgreSQL + TimescaleDB or another suitable time-series store.

Required tables/models:

- contract metadata
- market snapshots
- funding observations
- funding settlements/history
- spread/opportunity snapshots
- venue health
- paper/shadow trade observations

### 3. Historical API

Initial `GET/POST /api/history` implemented for persistent funding observations,
opportunity snapshots, and 7d/30d route Carry statistics.

Expose endpoints for:

- funding history
- spread history
- opportunity persistence
- symbol/route statistics
- capacity history
- session statistics

### 4. UI integration

The Funding Carry Desk now switches between server-backed 24h/7d/30d/90d statistics
and falls back to current/local statistics when the API is unavailable. It includes
Carry Leaders, Persistent Edge, Reversal Risk, TradFi Carry, break-even holding
estimates, Settlement Calendar and research coverage. Richer session breakdowns
remain incomplete.

Replace local-only statistics with server-backed historical windows.

Target windows:

- 24h
- 7d
- 30d
- 90d when enough data exists

---

# P2 — Funding Carry Research Engine

Priority: highest alongside P1.

Status: in progress. Current/mean/median/P10/P90, positive ratio, reversal count,
7d/30d comparison windows, fee-adjusted break-even holding estimates, dedicated
Carry/TradFi/Reversal/Settlement views and sample coverage are implemented.
Positive/negative streak analytics and carry-by-session remain incomplete.

The goal is to distinguish persistent Carry from temporary headline APY.

## Deliverables

For every symbol × long venue × short venue route:

- normalized current funding difference
- mean carry
- median carry
- P10 / P90
- positive observation ratio
- sign reversal frequency
- positive/negative streaks
- settlement-window behavior
- carry by hour/session
- 7d / 30d comparison
- fee-adjusted carry comparison
- estimated break-even holding period

## UI

Create a dedicated **Funding Carry Desk** rather than only a column in the spread table.

Views:

- Carry Leaders
- Persistent Carry
- Reversal Risk
- TradFi Carry
- Settlement Calendar

---

# P3 — TradFi / RWA Fair Value Engine

Priority: high.

This is expected to be one of ArbOasis's main research differentiators.

## Phase 3A — Crypto venue vs crypto venue

Status: initial explicit alias layer added. It preserves GOOG/GOOGL as distinct
share classes and marks unverified mappings such as GOLD→XAU for review rather
than silently treating them as equivalent. The mapping catalog remains incomplete.

Improve identification and mapping of stock/ETF/commodity perpetuals across Binance, Bitget and Gate.

Examples of alias problems to solve:

- GOOGL vs GOOG
- Korean / Hong Kong listings
- leveraged wrappers
- different contract tickers representing related but non-identical exposure

Do not treat related-but-different instruments as identical without an explicit mapping layer.

## Phase 3B — Traditional-market reference

Add a separate fair-value adapter layer for reliable traditional-market data when connectivity is available.

Research outputs should include:

- crypto perp premium/discount
- traditional reference price age
- market open/closed state
- overnight/session flag
- funding
- basis history
- fair-value confidence

## Phase 3C — Session research

Study whether TradFi perpetual dislocations behave differently during:

- US regular session
- US pre/post market
- US overnight
- Asian session
- Korean market hours
- major macro announcement windows

---

# P4 — Depth, Slippage and Capacity Engine

Priority: high before any serious capital-efficiency claims.

BBO size is not enough for realistic position sizing.

## Deliverables

Calculate VWAP-based executable prices for configurable notionals, for example:

- $10k
- $50k
- $100k
- $250k
- $500k
- $1m where liquidity permits

Store:

- entry VWAP
- exit VWAP estimate
- slippage
- available capacity
- capacity decay when the opportunity appears

Output a **Capacity Curve** for each route.

---

# P5 — Research Validation / Backtest Lab

Priority: after enough data exists.

## Deliverables

- event-driven replay of historical snapshots
- realistic fees
- funding settlement accounting
- depth/slippage assumptions
- configurable holding windows
- route-level PnL attribution
- walk-forward evaluation
- parameter sensitivity
- regime segmentation
- TradFi session segmentation

Key questions:

- how often does an apparent edge survive realistic costs?
- how long does it persist?
- how does capacity change as edge increases?
- when does a large spread mean opportunity versus venue risk?
- does current funding predict next settlement funding?
- which routes have the best return/drawdown/capacity trade-off?

---

# P6 — Portfolio and Risk Research

Do not evaluate routes only independently.

## Deliverables

- gross exposure view
- net delta estimate
- per-venue concentration
- per-underlying concentration
- correlated TradFi exposure
- margin stress scenarios
- spread-widening stress
- funding-reversal stress
- venue outage scenario
- configurable research risk budget

This phase remains research/paper focused until separately approved.

---

# P7 — Paper / Shadow Operations

Upgrade current browser Paper Trading into persistent server-backed research operations.

## Deliverables

- paper positions stored centrally
- exact signal snapshot at open
- exact observed market state at close
- spread PnL attribution
- funding attribution
- cost attribution
- missed-opportunity log
- false-positive analysis
- daily/weekly research report

Shadow mode may observe what would have happened under defined execution assumptions without sending orders.

---

# P8 — AI Quant Research Layer

AI is an analyst around the deterministic engine, not the execution authority.

Useful AI tasks:

- explain abnormal spread events
- cluster recurring opportunity regimes
- summarize funding changes
- compare TradFi session behavior
- propose research hypotheses
- review backtest anomalies
- detect exchange-rule changes in documentation
- generate daily research briefs

Future agent roles may include:

- Hypothesis Agent
- Data Quality Agent
- Backtest Review Agent
- Risk Review Agent
- Incident / Postmortem Agent

---

# Front-End Product Direction

The dashboard should evolve into four top-level desks:

1. **Spread**
2. **Funding Carry**
3. **TradFi / RWA**
4. **Research**

A fifth **Portfolio / Risk** desk should be added when persistent paper positions and account-level research are introduced.

Avoid turning the product into a generic charting terminal. Every screen should help answer a market-neutral alpha question.

---

# Deployment Workflow

Preferred development flow:

```text
Read GitHub main
→ implement next Roadmap item
→ validate
→ commit/sync to GitHub main
→ deploy Site from main
→ verify production
```

If a Work creates a Site, the Work must not become a separate source tree. Changes that should persist must be represented in GitHub.

---

# Next Recommended Sprint

The next sprint should focus on **P1 + P2**, not additional visual polish.

Order:

1. backend collector skeleton
2. persistent funding history
3. persistent spread/opportunity history
4. 7d/30d Funding Carry statistics
5. Funding Carry Desk UI
6. initial TradFi alias/mapping layer
7. deploy refreshed Site from GitHub main

This gives ArbOasis real research memory and lets the system answer whether high annualized funding opportunities are persistent rather than merely visible at one instant.
