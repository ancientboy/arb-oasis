const UPSTREAMS: Record<string, { urls: string[]; ttlMs: number }> = {
  "binance-contracts": { urls: binanceUrls("/fapi/v1/exchangeInfo"), ttlMs: 600_000 },
  "binance-funding-info": { urls: binanceUrls("/fapi/v1/fundingInfo"), ttlMs: 600_000 },
  "binance-bbo": { urls: binanceUrls("/fapi/v1/ticker/bookTicker"), ttlMs: 2_000 },
  "binance-premium": { urls: binanceUrls("/fapi/v1/premiumIndex"), ttlMs: 2_000 },
  "bitget-contracts": { urls: ["https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES"], ttlMs: 600_000 },
  "bitget-tickers": { urls: ["https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES"], ttlMs: 2_000 },
  "gate-contracts": { urls: ["https://api.gateio.ws/api/v4/futures/usdt/contracts"], ttlMs: 600_000 },
  "gate-tickers": { urls: ["https://api.gateio.ws/api/v4/futures/usdt/tickers"], ttlMs: 2_000 },
};

type CacheEntry = { expiresAt: number; body: string; contentType: string; fetchedAt: number };
const responseCache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source") ?? "";
  const upstream = UPSTREAMS[source];
  if (!upstream) return Response.json({ error: "unsupported market source" }, { status: 400 });
  const cached = responseCache.get(source);
  if (cached && cached.expiresAt > Date.now()) return marketResponse(cached, source, "HIT");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const runtime = globalThis as typeof globalThis & {
      __ARB_OASIS_MARKET_SERVICE_URL?: string;
      __ARB_OASIS_MARKET_SERVICE_TOKEN?: string;
    };
    const serviceBase = runtime.__ARB_OASIS_MARKET_SERVICE_URL?.replace(/\/$/, "");
    const targets = serviceBase ? [`${serviceBase}/v1/source/${encodeURIComponent(source)}`] : upstream.urls;
    const headers = {
        accept: "application/json",
        "user-agent": "ArbOasis/1.0 market-research",
        ...(serviceBase && runtime.__ARB_OASIS_MARKET_SERVICE_TOKEN
          ? { authorization: `Bearer ${runtime.__ARB_OASIS_MARKET_SERVICE_TOKEN}` }
          : {}),
      };
    const { body, contentType } = await fetchFirstJson(targets, headers, controller.signal);
    const entry = {
      body,
      contentType,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + upstream.ttlMs,
    };
    responseCache.set(source, entry);
    return marketResponse(entry, source, serviceBase ? "COLLECTOR" : "MISS");
  } catch (error) {
    if (cached) return marketResponse(cached, source, "STALE");
    return Response.json(
      { error: source + " unavailable", detail: error instanceof Error ? error.message : "fetch failed", backend: serviceBase ? "collector" : "edge-direct" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

function binanceUrls(path: string) {
  return ["fapi.binance.com", "fapi1.binance.com", "fapi2.binance.com", "fapi3.binance.com", "fapi4.binance.com"].map(host=>`https://${host}${path}`);
}

async function fetchFirstJson(targets: string[], headers: Record<string,string>, signal: AbortSignal) {
  const attempts=targets.map(async target=>{
    const response=await fetch(target,{cache:"no-store",signal,headers});
    const body=await response.text();
    if(!response.ok)throw new Error(`${new URL(target).host} HTTP ${response.status}`);
    JSON.parse(body);
    return {body,contentType:response.headers.get("content-type")??"application/json"};
  });
  return Promise.any(attempts);
}

function marketResponse(entry: CacheEntry, source: string, cacheState: string) {
  return new Response(entry.body, {
    headers: {
      "content-type": entry.contentType,
      "cache-control": "private, max-age=0, must-revalidate",
      "x-arboasis-source": source,
      "x-arboasis-fetched-at": String(entry.fetchedAt),
      "x-arboasis-cache": cacheState,
    },
  });
}
