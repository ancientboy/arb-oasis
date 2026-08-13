# ArbOasis

Cross-venue USDT perpetual arbitrage research dashboard for Binance, Bitget and Gate.

## v0 scope

- Discover the live intersection of USDT perpetual contracts across Binance, Bitget and Gate.
- Scan both directions for every venue pair.
- Use executable bid/ask prices, not last price.
- Add funding differential, configurable trading fees and a risk buffer to estimate net edge.
- Filter by shared contracts, liquidity, data freshness and net edge.
- Paper-trading only. No exchange API keys and no live order placement.

## Safety boundary

This repository is a research and monitoring tool. The browser build never stores trading credentials and never sends live orders. Live execution should be implemented later as a server-side service with isolated API keys, explicit risk limits and kill switches.

## Data sources

Public market-data endpoints from Binance USD-M Futures, Bitget USDT Futures and Gate USDT Perpetual Futures.

## Run

Open `index.html` from a static host. For local development, serve the directory with any static web server, e.g. `python3 -m http.server 8080`.
