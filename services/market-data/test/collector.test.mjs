import assert from "node:assert/strict";
import test from "node:test";
import { MarketCollector } from "../src/collector.mjs";

test("collector caches a validated JSON source and reports health", async () => {
  const collector = new MarketCollector({
    sources: { "test-bbo": { url: "https://example.test/bbo", intervalMs: 2_000 } },
    fetchFn: async () => new Response('[{"symbol":"BTCUSDT"}]', { headers: { "content-type": "application/json" } }),
    logger: { warn() {} },
  });
  await collector.refresh("test-bbo");
  assert.equal(JSON.parse(collector.get("test-bbo").body)[0].symbol, "BTCUSDT");
  assert.equal(collector.health().status, "ok");
});

test("collector keeps the last good payload when an upstream refresh fails", async () => {
  let fail = false;
  const collector = new MarketCollector({
    sources: { "test-bbo": { url: "https://example.test/bbo", intervalMs: 2_000 } },
    fetchFn: async () => fail ? new Response("blocked", { status: 451 }) : new Response("[]"),
    logger: { warn() {} },
  });
  await collector.refresh("test-bbo");
  fail = true;
  await collector.refresh("test-bbo");
  assert.equal(collector.get("test-bbo").body, "[]");
  assert.equal(collector.health().sources["test-bbo"].lastError, "HTTP 451");
});
