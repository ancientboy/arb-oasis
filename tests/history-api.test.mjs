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
