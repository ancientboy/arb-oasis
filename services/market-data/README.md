# ArbOasis Market Data Service

Continuously warms and serves a last-known-good cache for the eight public Binance,
Bitget and Gate sources used by the dashboard. This service belongs on an always-on
host with reliable exchange connectivity; the Sites worker then reads it through
`MARKET_SERVICE_URL` instead of depending on exchange access from the edge runtime.

## Run

```sh
docker build -t arb-oasis-market-data services/market-data
docker run -d --restart unless-stopped -p 127.0.0.1:8787:8787 \
  -e MARKET_SERVICE_TOKEN='replace-me' \
  --name arb-oasis-market-data arb-oasis-market-data
curl http://127.0.0.1:8787/health
```

Put an HTTPS reverse proxy in front of the service, then configure the Site with:

- `MARKET_SERVICE_URL=https://your-market-host.example`
- `MARKET_SERVICE_TOKEN` matching the collector token

Endpoints:

- `GET /health` — source and venue health, no authentication required
- `GET /v1/snapshot` — authenticated health snapshot
- `GET /v1/source/:source` — authenticated last-known-good exchange payload

The token is optional for local development but should always be set in production.
