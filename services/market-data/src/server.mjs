import { createServer } from "node:http";
import { MarketCollector } from "./collector.mjs";

const port = positiveInt(process.env.PORT, 8787);
const host = process.env.HOST || "0.0.0.0";
const apiToken = process.env.MARKET_SERVICE_TOKEN || "";
const collector = new MarketCollector({ timeoutMs: positiveInt(process.env.UPSTREAM_TIMEOUT_MS, 12_000) });

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "OPTIONS") return send(response, 204, "", corsHeaders());
  if (url.pathname === "/health" || url.pathname === "/ready") {
    const health = collector.health();
    return json(response, health.status === "unavailable" ? 503 : 200, health);
  }
  if (!authorized(request, apiToken)) return json(response, 401, { error: "unauthorized" });
  if (request.method !== "GET") return json(response, 405, { error: "method not allowed" });
  if (url.pathname === "/v1/snapshot") return json(response, 200, collector.health());
  if (url.pathname.startsWith("/v1/source/")) {
    const source = decodeURIComponent(url.pathname.slice("/v1/source/".length));
    const entry = collector.get(source);
    if (!entry) return json(response, 404, { error: "source unavailable", source });
    return send(response, 200, entry.body, {
      ...corsHeaders(),
      "content-type": entry.contentType,
      "cache-control": "no-store",
      "x-arboasis-source": source,
      "x-arboasis-fetched-at": String(entry.fetchedAt),
      "x-arboasis-cache": "COLLECTOR",
    });
  }
  return json(response, 404, { error: "not found" });
});

await collector.start();
server.listen(port, host, () => console.log(`[market-data] listening on http://${host}:${port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    collector.stop();
    server.close(() => process.exit(0));
  });
}

function authorized(request, token) {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

function json(response, status, value) {
  return send(response, status, JSON.stringify(value), { ...corsHeaders(), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function corsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "authorization, content-type" };
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
