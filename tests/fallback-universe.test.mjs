import assert from "node:assert/strict";
import test from "node:test";
import { fallbackContractUniverse } from "../src/exchanges.js";

test("fallback universe immediately provides a two-venue live-stream seed", () => {
  const seed = fallbackContractUniverse({ binance: "blocked" });
  assert.equal(seed.degraded, true);
  assert.ok(seed.universe.length >= 50);
  assert.ok(seed.universe.every((item) => item.venues.length >= 2));
  assert.ok(seed.meta.binance.has("BTCUSDT"));
  assert.ok(seed.tradfiCount > 0);
});
