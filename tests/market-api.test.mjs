import assert from "node:assert/strict";
import test from "node:test";

test("market proxy rejects sources outside its fixed allowlist", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("market-test", String(process.pid) + "-" + Date.now());
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/market?source=https://example.com"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: undefined },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "unsupported market source" });
});

test("market proxy returns an allowlisted upstream payload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /^https:\/\/fapi(?:[1-4])?\.binance\.com\/fapi\/v1\/ticker\/bookTicker$/);
    return new Response('[{"symbol":"BTCUSDT","bidPrice":"100","askPrice":"101"}]', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("market-success-test", String(process.pid) + "-" + Date.now());
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/api/market?source=binance-bbo"),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: undefined },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-arboasis-source"), "binance-bbo");
    assert.deepEqual(await response.json(), [{ symbol: "BTCUSDT", bidPrice: "100", askPrice: "101" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("market proxy prefers the configured collector service", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.__ARB_OASIS_MARKET_SERVICE_URL = "https://market.example.test/";
  globalThis.__ARB_OASIS_MARKET_SERVICE_TOKEN = "secret";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://market.example.test/v1/source/bitget-tickers");
    assert.equal(init.headers.authorization, "Bearer secret");
    return new Response('{"data":[]}', { headers: { "content-type": "application/json" } });
  };
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("market-collector-test", String(process.pid) + "-" + Date.now());
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/api/market?source=bitget-tickers"),
      {
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
        DB: undefined,
        MARKET_SERVICE_URL: "https://market.example.test/",
        MARKET_SERVICE_TOKEN: "secret",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-arboasis-cache"), "COLLECTOR");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__ARB_OASIS_MARKET_SERVICE_URL;
    delete globalThis.__ARB_OASIS_MARKET_SERVICE_TOKEN;
  }
});

test("market proxy turns a cold upstream failure into a retryable response instead of a route crash", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("upstream blocked");
  };
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("market-unavailable-test", String(process.pid) + "-" + Date.now());
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/api/market?source=gate-tickers"),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: undefined },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "gate-tickers temporarily unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
