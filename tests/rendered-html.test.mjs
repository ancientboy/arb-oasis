import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  const dashboard = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(dashboard, /Carry by Session/);
  assert.match(dashboard, /Venue Reliability/);
  assert.match(dashboard, /Depth &amp; Capacity Curve|Depth & Capacity Curve/);
  assert.match(dashboard, /跨所资金分布/);
  assert.match(dashboard, /策略指挥中心/);
  assert.match(dashboard, /可执行路线/);
  assert.match(dashboard, /市场观察/);
  assert.match(dashboard, /这不是预测涨跌/);
  assert.match(dashboard, /equityChart/);
});
