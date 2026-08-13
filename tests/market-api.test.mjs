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
    assert.equal(String(input), "https://fapi.binance.com/fapi/v1/ticker/bookTicker");
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
