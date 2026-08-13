# ArbOasis Architecture

## 1. Source of Truth

The canonical codebase is:

- Repository: `ancientboy/arb-oasis`
- Branch: `main`

All Work / Codex / ChatGPT sessions must treat GitHub `main` as the authoritative source. Do not maintain a separate long-lived copy in a Work or Site that is not synchronized back to GitHub.

## 2. Current Architecture

Current v1 is a browser-based research dashboard using public market-data APIs.

```text
Binance public market data
Bitget public market data
Gate public market data
          │
          ▼
Market adapters / normalizer
          │
          ▼
Cross-venue opportunity engine
          │
          ├── Spread metrics
          ├── Funding normalization
          ├── Carry metrics
          ├── TradFi/RWA classification
          ├── Cost assumptions
          └── Risk/data-quality filters
          │
          ▼
Research history + Paper Trading
          │
          ▼
Browser dashboard
```

Current important modules:

- `src/config.js` — venues, endpoints, defaults, TradFi hints
- `src/exchanges.js` — contract universe, REST normalization
- `src/streams.js` — public WebSocket market feeds
- `src/engine.js` — cross-venue opportunity calculations
- `src/history.js` — local research history and funding statistics
- `src/app.js` — application state and UI wiring
- `index.html` / `styles.css` — browser dashboard

## 3. Current Data Model

Normalize exchange-specific fields into one internal quote representation.

Minimum quote fields:

```text
venue
symbol
bid
ask
bidQty
askQty
last
mark
index
funding
fundingIndicative
nextFundingTime
openInterest
volumeQuote
timestamp
source
```

Minimum contract metadata:

```text
symbol
base
quote
fundingIntervalHours
takerFeeBps
makerFeeBps
multiplier
assetClass / RWA metadata
venue-specific symbol
```

The strategy/research layer should never need to understand raw exchange response formats.

## 4. Target Architecture

The browser-only build is suitable for research and demonstration, but long-term historical research requires a server-side data layer.

Target architecture:

```text
                  Public Exchanges
      Binance       Bitget        Gate
          │            │            │
          └──────┬─────┴─────┬──────┘
                 ▼           ▼
          Market Data Collectors
                 │
                 ▼
          Normalization Layer
                 │
        ┌────────┴────────┐
        ▼                 ▼
 Time-series Storage   Live State Cache
        │                 │
        └────────┬────────┘
                 ▼
        Research / Alpha APIs
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
    Spread     Carry     TradFi
    Engine     Engine    Fair Value
       └─────────┼─────────┘
                 ▼
          Risk / Quality Layer
                 │
                 ▼
            Web Dashboard
```

## 5. Proposed Repository Structure

As the project grows, migrate toward:

```text
/apps
  /web

/services
  /collector
  /api

/packages
  /market-model
  /opportunity-engine
  /risk-model
  /exchange-adapters

/docs

/data or migrations
```

Do not perform a large refactor only for aesthetics. Migrate when backend persistence is introduced.

## 6. Historical Storage Requirements

The backend should eventually persist at least:

### Market snapshots

- timestamp
- venue
- symbol
- bid/ask
- best sizes
- depth/VWAP snapshots for configured notionals
- mark/index
- funding / indicative funding
- funding interval
- next settlement
- open interest
- volume

### Opportunity snapshots

- route
- asset class
- spread
- normalized funding difference
- current carry APR comparison
- estimated cost
- net edge
- capacity
- risk state
- score

### Paper/shadow outcomes

- signal timestamp
- route
- expected entry
- observed entry
- observed exit
- fees/cost assumptions
- realized spread movement
- funding during holding period
- research PnL
- reason for exit

## 7. TradFi Fair Value Layer

Future TradFi/RWA support should be separated from crypto-venue adapters.

Target inputs:

- crypto perpetual venue data
- traditional-market reference data
- market-session calendar/state
- FX where relevant
- corporate-action/contract metadata where relevant

The fair-value layer should expose a normalized reference instead of leaking broker-specific payloads into the opportunity engine.

## 8. Reliability Requirements

Research outputs should expose data quality explicitly.

Required concepts:

- quote age
- source status
- WebSocket reconnect state
- REST fallback state
- contract metadata age
- missing field handling
- sequence / book integrity where full-depth books are used

A missing field should degrade confidence or eligibility, not silently become a valid zero when that would change economic meaning.

## 9. Security Boundary

The current public browser application uses no private exchange credentials.

Any future private account integration must be isolated from the static front end and should use server-side credential storage, restricted permissions, audit logs and explicit environment separation.

## 10. Deployment Model

Preferred workflow:

```text
Research / requirement decision
→ implementation
→ validation
→ GitHub main
→ Site deployment from main
```

The deployed Site is an output artifact. GitHub `main` remains the source of truth.