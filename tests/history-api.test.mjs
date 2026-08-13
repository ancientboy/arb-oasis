import assert from "node:assert/strict";
import test from "node:test";

test("history API reports unavailable D1 without crashing the worker", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("history-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/history?window=7d"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.match(payload.error, /D1 binding DB is unavailable/);
});

test("history API accepts the extended persistent research payload", async () => {
  const batches = [];
  const database = {
    prepare(query) {
      return { query, values: [], bind(...values) { this.values = values; return this; }, async all() { return { results: [] }; } };
    },
    async batch(statements) { batches.push(statements); },
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("history-extended-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      contracts: [{ venue: "binance", symbol: "BTCUSDT", venueSymbol: "BTCUSDT", base: "BTC", quote: "USDT", assetClass: "crypto", source: "exchange" }],
      markets: [{ venue: "binance", symbol: "BTCUSDT", bid: 100, ask: 101, source: "WS", qualityOk: true }],
      venueHealth: [{ venue: "binance", ok: true, mode: "WS", quoteCount: 1 }],
      settlements: [{ venue: "binance", symbol: "BTCUSDT", fundingRate: 0.0001, settledAt: Date.now() }],
      paperEvents: [{ tradeId: "paper-1", event: "open", symbol: "BTCUSDT", longVenue: "binance", shortVenue: "bitget", notional: 10000 }],
    }) }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: database },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).stored, 5);
  assert.ok(batches.length >= 2);
});
