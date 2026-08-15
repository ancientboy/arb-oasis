# ArbOasis Product Specification

## 1. Product Definition

ArbOasis is a market-neutral alpha research and execution platform focused on finding structural return opportunities across multiple trading venues and asset wrappers.

The system does **not** primarily predict whether BTC, ETH, stocks, commodities or other assets will rise or fall. Its core task is to identify situations where the same or economically equivalent risk is priced differently across venues, contracts or funding mechanisms, and to determine whether the difference remains profitable after realistic costs and risk buffers.

Primary opportunity families:

1. **Cross-Venue Spread Alpha** — same underlying, different venues, executable price dislocation.
2. **Funding Carry Alpha** — funding-rate differences that remain positive after normalization by settlement interval and transaction costs.
3. **TradFi / RWA Dislocation Alpha** — crypto perpetual representations of stocks, ETFs, commodities and other traditional assets versus other crypto venues and eventually traditional-market fair value.
4. **Relative Value Alpha** — future pair/basket residual and statistical-arbitrage opportunities.
5. **Liquidity / Yield Alpha** — future extension for liquidity pools, rebates, fee yield and hedgeable yield opportunities.

## 2. Current Product Scope

Current v1 research scope:

- Binance USDⓈ-M perpetuals
- Bitget USDT perpetuals
- Gate USDT perpetuals
- Dynamic universe discovery
- Any symbol listed on at least two supported venues may enter the scan
- Three-venue common universe is retained as a separate view
- Crypto and TradFi/RWA classification
- Bid/ask based executable spread calculation
- Funding-rate normalization by actual funding interval
- Funding carry horizon calculation
- Trading-fee assumptions
- Risk buffer
- BBO capacity filter
- Mark/index deviation filter
- Data freshness / venue health
- Opportunity score
- Local research history
- Funding persistence statistics
- Automatic and manual Paper trading only
- Strategy status, open positions, equity, drawdown and PnL attribution dashboard
- Per-venue Paper capital accounts with pre-positioned funds, dual-leg margin locks,
  fee/maintenance buffers, capital-blocked signals and simulated rebalancing
- Explainable opportunity cards: executable routes are separated from market watch
  routes, and each route shows direction, spread, Funding contribution, cost,
  capacity and per-venue Paper capital required

The browser build must never store live trading credentials or send real orders.
The current automatic Paper strategy runs only while the dashboard is open; a future
always-on runner belongs in the independent server-side strategy service.

### 2.1 What the current Paper strategy does — and does not do

The scanner evaluates both directions for every shared venue pair. It may find a
positive Funding component with a negative entry spread, or the reverse. A route is
eligible for automatic Paper entry only when the **combined net Edge** is positive
after executable bid/ask, the configured funding horizon, round-trip fees and the
risk buffer, and it also passes capacity, data-quality, score and per-venue capital
checks.

The current performance card represents positions opened in the active browser
session. It is not a historical backtest and it is not a claim that every scanned
route was traded. The Backtest Lab is a separate future product milestone.

## 3. User Jobs

ArbOasis should help the user answer four questions quickly:

### 3.1 Where is the opportunity now?

Show the best executable long/short venue combination after costs, not merely the largest displayed price difference.

### 3.2 Is the opportunity persistent?

For Funding and Carry, show whether the current observation is a one-off spike or part of a repeatable pattern.

Required statistics include:

- current funding differential
- normalized funding differential per hour
- current simple annualized carry
- historical mean carry
- positive carry persistence
- funding sign reversals
- P10 / P90 or comparable distribution statistics
- observation count

### 3.3 Can the opportunity actually be traded?

The system must account for:

- executable bid/ask
- order-book capacity
- estimated slippage
- fees
- funding interval
- data freshness
- mark/index divergence
- venue health
- position size
- expected exit cost

### 3.4 What is the real risk?

Market-neutral does not mean risk-free. ArbOasis should make venue, execution and leverage risk visible.

Risk dimensions:

- legging risk
- partial fills
- spread widening
- funding reversal
- mark-price divergence
- liquidation asymmetry
- insufficient free margin
- capital fragmentation between venues
- API / WebSocket outages
- venue counterparty risk
- withdrawal / transfer interruptions
- traditional-market open/closed state for TradFi assets

## 4. Core Product Views

### Primary View — Strategy Command Center

The default landing view shows whether the Paper strategy is running, current equity,
today/total PnL, drawdown, open positions, next signals, venue health, risk usage and
the decision log. Research statistics are secondary to operational clarity.

The long-term front end should converge toward four desks rather than one giant table.

### Desk A — Spread

Ranks opportunities by executable spread after cost.

### Desk B — Funding Carry

Ranks opportunities by expected normalized carry, persistence and risk-adjusted return.

### Desk C — TradFi / RWA

Focuses on stocks, ETFs, metals, commodities and other traditional underlyings represented as crypto perpetuals.

Future fair-value references may include traditional-market feeds such as IBKR / exchange-index data when available.

### Desk D — Research / History

Shows persistence, distributions, historical opportunity frequency, paper-trade performance and regime behavior.

## 5. Product Principles

1. **Source of truth is GitHub `ancientboy/arb-oasis`, branch `main`.**
2. Public UI may use public market data only.
3. Real trading credentials belong only in a server-side execution service.
4. Do not call a displayed spread an arbitrage profit until costs and execution assumptions are included.
5. Do not annualize funding before normalizing by actual funding interval.
6. Do not treat market-neutral as risk-free.
7. Do not use last price as the main executable price.
8. Prefer deterministic code for live signal, risk and execution decisions.
9. AI may assist research, diagnostics and hypothesis generation but must not be the real-time execution authority.
10. Any future live-trading mode must have explicit hard risk limits and kill switches.

## 6. Relation to the Previous Liquidity Pools Product

The previous Liquidity Pools product demonstrated a useful research pattern that ArbOasis should retain:

- rank assets by historical funding yield
- show current / next funding information
- distinguish historical realized funding from forecasts
- compare mark/index basis
- make settlement schedule visible
- inspect actual account-level funding receipts when available
- separate persistent carry from one-off annualization
- evaluate whether a hedge remains economically useful after fees, spread and basis

ArbOasis generalizes this idea from a funding-income dashboard into a unified market-neutral opportunity platform.

## 7. Non-Goals for Current Phase

Not in current production scope:

- autonomous live trading
- high-frequency market making
- latency-sensitive colocated arbitrage
- directional CTA signals
- discretionary AI trade calls
- user-facing promises of expected returns

These may be researched later but must not dilute the current Market-Neutral / Carry focus.
