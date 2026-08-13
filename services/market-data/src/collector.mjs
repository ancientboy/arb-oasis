import { SOURCES, sourceVenue } from "./sources.mjs";

const now = () => Date.now();

export class MarketCollector {
  constructor({
    sources = SOURCES,
    fetchFn = globalThis.fetch,
    timeoutMs = 12_000,
    logger = console,
  } = {}) {
    this.sources = sources;
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.state = new Map();
    this.timers = new Map();
    this.running = false;
    for (const source of Object.keys(sources)) this.state.set(source, emptyState());
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await Promise.allSettled(Object.keys(this.sources).map((source) => this.refresh(source)));
    for (const [source, config] of Object.entries(this.sources)) {
      const timer = setInterval(() => void this.refresh(source), config.intervalMs);
      timer.unref?.();
      this.timers.set(source, timer);
    }
  }

  stop() {
    this.running = false;
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }

  async refresh(source) {
    const config = this.sources[source];
    const current = this.state.get(source);
    if (!config || current?.inFlight) return current;
    const startedAt = now();
    this.state.set(source, { ...current, inFlight: true, lastAttemptAt: startedAt });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(config.url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "ArbOasis-MarketData/0.1" },
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      JSON.parse(body);
      const updated = {
        body,
        contentType: response.headers.get("content-type") || "application/json",
        fetchedAt: now(),
        latencyMs: now() - startedAt,
        lastAttemptAt: startedAt,
        lastError: "",
        failures: 0,
        inFlight: false,
      };
      this.state.set(source, updated);
      return updated;
    } catch (error) {
      const updated = {
        ...this.state.get(source),
        latencyMs: now() - startedAt,
        lastAttemptAt: startedAt,
        lastError: error instanceof Error ? error.message : "fetch failed",
        failures: (current?.failures || 0) + 1,
        inFlight: false,
      };
      this.state.set(source, updated);
      this.logger.warn?.(`[market-data] ${source}: ${updated.lastError}`);
      return updated;
    } finally {
      clearTimeout(timer);
    }
  }

  get(source) {
    if (!this.sources[source]) return null;
    const state = this.state.get(source);
    return state?.body ? { ...state, source } : null;
  }

  health() {
    const timestamp = now();
    const sources = Object.fromEntries([...this.state].map(([source, state]) => {
      const intervalMs = this.sources[source].intervalMs;
      const ageMs = state.fetchedAt ? timestamp - state.fetchedAt : null;
      return [source, {
        ok: Boolean(state.body) && ageMs <= Math.max(intervalMs * 5, 30_000),
        venue: sourceVenue(source),
        fetchedAt: state.fetchedAt || null,
        ageMs,
        latencyMs: state.latencyMs || null,
        failures: state.failures || 0,
        lastError: state.lastError || null,
      }];
    }));
    const venues = {};
    for (const venue of ["binance", "bitget", "gate"]) {
      const items = Object.entries(sources).filter(([, value]) => value.venue === venue);
      venues[venue] = { ok: items.some(([, value]) => value.ok), sources: items.length };
    }
    const readySources = Object.values(sources).filter((source) => source.ok).length;
    return {
      status: readySources === Object.keys(sources).length ? "ok" : readySources ? "degraded" : "unavailable",
      timestamp,
      readySources,
      totalSources: Object.keys(sources).length,
      venues,
      sources,
    };
  }
}

function emptyState() {
  return { body: "", contentType: "application/json", fetchedAt: 0, latencyMs: 0, lastAttemptAt: 0, lastError: "", failures: 0, inFlight: false };
}
