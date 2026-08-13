type Observation = {
  id?: string; symbol?: string; assetClass?: string; longVenue?: string;
  shortVenue?: string; fundingHourlyBps?: number; spreadBps?: number;
  netEdgeBps?: number; capacity?: number; score?: number; eligible?: boolean;
  observedAt?: number;
};

type ContractRecord = Record<string, unknown>;
type MarketRecord = Record<string, unknown>;
type HealthRecord = Record<string, unknown>;
type SettlementRecord = Record<string, unknown>;
type PaperRecord = Record<string, unknown>;

const DAY = 86_400_000;
const MAX_BATCH = 250;
type D1Statement = { bind: (...values: unknown[]) => D1Statement };
type D1DatabaseLike = {
  prepare: (query: string) => D1Statement & { all: <T>() => Promise<{ results?: T[] }> };
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

function getDatabase() {
  const database = (globalThis as typeof globalThis & { __ARB_OASIS_DB?: D1DatabaseLike }).__ARB_OASIS_DB;
  if (!database) throw new Error("D1 binding DB is unavailable");
  return database;
}
const finite = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const nullableFinite = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const clean = (value: unknown, max = 80) => String(value ?? "").trim().slice(0, max);

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function signReversals(values: number[]) {
  let last = 0, reversals = 0;
  for (const value of values) {
    const sign = value > 0 ? 1 : value < 0 ? -1 : 0;
    if (last && sign && sign !== last) reversals += 1;
    if (sign) last = sign;
  }
  return reversals;
}

function streaks(values: number[]) {
  let currentSign = 0, currentLength = 0, maxPositive = 0, maxNegative = 0;
  for (const value of values) {
    const sign = value > 0 ? 1 : value < 0 ? -1 : 0;
    if (!sign) continue;
    if (sign === currentSign) currentLength += 1;
    else { currentSign = sign; currentLength = 1; }
    if (sign > 0) maxPositive = Math.max(maxPositive, currentLength);
    else maxNegative = Math.max(maxNegative, currentLength);
  }
  return { currentSign, currentLength, maxPositive, maxNegative };
}

function sessionName(timestamp: unknown) {
  const hour = new Date(finite(timestamp)).getUTCHours();
  if (hour < 8) return "Asia";
  if (hour < 13) return "Europe";
  if (hour < 21) return "US";
  return "Overnight";
}

async function ensureSchema() {
  const db = getDatabase();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS funding_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, route_id TEXT NOT NULL,
      symbol TEXT NOT NULL, asset_class TEXT NOT NULL, long_venue TEXT NOT NULL,
      short_venue TEXT NOT NULL, hourly_bps REAL NOT NULL,
      observed_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS funding_route_time_idx ON funding_observations (route_id, observed_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS opportunity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, route_id TEXT NOT NULL,
      symbol TEXT NOT NULL, asset_class TEXT NOT NULL, long_venue TEXT NOT NULL,
      short_venue TEXT NOT NULL, spread_bps REAL NOT NULL, funding_hourly_bps REAL,
      net_edge_bps REAL NOT NULL, capacity_usdt REAL NOT NULL, score INTEGER NOT NULL,
      eligible INTEGER NOT NULL, observed_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS opportunity_route_time_idx ON opportunity_snapshots (route_id, observed_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS contract_metadata (
      id TEXT PRIMARY KEY, venue TEXT NOT NULL, symbol TEXT NOT NULL, venue_symbol TEXT NOT NULL,
      base TEXT NOT NULL, quote TEXT NOT NULL, asset_class TEXT NOT NULL, funding_interval_hours REAL,
      taker_fee_bps REAL, maker_fee_bps REAL, multiplier REAL, source TEXT NOT NULL,
      observed_at INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS contract_symbol_venue_idx ON contract_metadata (symbol, venue)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venue TEXT NOT NULL, symbol TEXT NOT NULL,
      bid REAL, ask REAL, bid_qty REAL, ask_qty REAL, mark REAL, index_price REAL, funding REAL,
      funding_indicative REAL, next_funding_time INTEGER, open_interest REAL, volume_quote REAL,
      source TEXT NOT NULL, quality_ok INTEGER NOT NULL, observed_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS market_symbol_venue_time_idx ON market_snapshots (symbol, venue, observed_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS venue_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venue TEXT NOT NULL, ok INTEGER NOT NULL, mode TEXT NOT NULL,
      quote_count INTEGER NOT NULL, latency_ms INTEGER, error TEXT, observed_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS venue_health_time_idx ON venue_health (venue, observed_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS funding_settlements (
      id TEXT PRIMARY KEY, venue TEXT NOT NULL, symbol TEXT NOT NULL, funding_rate REAL NOT NULL,
      settled_at INTEGER NOT NULL, observed_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS funding_settlement_symbol_time_idx ON funding_settlements (symbol, venue, settled_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS shadow_trade_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, trade_id TEXT NOT NULL, event TEXT NOT NULL,
      symbol TEXT NOT NULL, long_venue TEXT NOT NULL, short_venue TEXT NOT NULL,
      notional REAL NOT NULL, net_pnl REAL, details TEXT NOT NULL, observed_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS shadow_trade_time_idx ON shadow_trade_observations (trade_id, observed_at)`),
  ]);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { observations?: Observation[]; contracts?: ContractRecord[]; markets?: MarketRecord[]; venueHealth?: HealthRecord[]; settlements?: SettlementRecord[]; paperEvents?: PaperRecord[] };
    const observations = (payload.observations ?? []).slice(0, MAX_BATCH);
    const contracts = (payload.contracts ?? []).slice(0, 500), markets = (payload.markets ?? []).slice(0, 100);
    const health = (payload.venueHealth ?? []).slice(0, 10), settlements = (payload.settlements ?? []).slice(0, 100), paperEvents = (payload.paperEvents ?? []).slice(0, 20);
    if (![observations, contracts, markets, health, settlements, paperEvents].some(items=>items.length)) return Response.json({ error: "history payload is empty" }, { status: 400 });
    await ensureSchema();
    const db = getDatabase();
    const statements = [];
    for (const item of observations) {
      const routeId = clean(item.id), symbol = clean(item.symbol, 32);
      const longVenue = clean(item.longVenue, 24), shortVenue = clean(item.shortVenue, 24);
      if (!routeId || !symbol || !longVenue || !shortVenue) continue;
      const observedAt = Math.min(Date.now() + 60_000, Math.max(0, finite(item.observedAt, Date.now())));
      const assetClass = clean(item.assetClass, 24) || "crypto";
      const funding = finite(item.fundingHourlyBps, Number.NaN);
      statements.push(db.prepare(`INSERT INTO opportunity_snapshots
        (route_id, symbol, asset_class, long_venue, short_venue, spread_bps,
         funding_hourly_bps, net_edge_bps, capacity_usdt, score, eligible, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(routeId, symbol, assetClass, longVenue, shortVenue, finite(item.spreadBps),
          Number.isFinite(funding) ? funding : null, finite(item.netEdgeBps),
          Math.max(0, finite(item.capacity)), Math.round(finite(item.score)), item.eligible ? 1 : 0, observedAt));
      if (Number.isFinite(funding)) statements.push(db.prepare(`INSERT INTO funding_observations
        (route_id, symbol, asset_class, long_venue, short_venue, hourly_bps, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(routeId, symbol, assetClass, longVenue, shortVenue, funding, observedAt));
    }
    for (const item of contracts) {
      const venue=clean(item.venue,24),symbol=clean(item.symbol,32);if(!venue||!symbol)continue;
      statements.push(db.prepare(`INSERT INTO contract_metadata
        (id,venue,symbol,venue_symbol,base,quote,asset_class,funding_interval_hours,taker_fee_bps,maker_fee_bps,multiplier,source,observed_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET venue_symbol=excluded.venue_symbol,base=excluded.base,quote=excluded.quote,
        asset_class=excluded.asset_class,funding_interval_hours=excluded.funding_interval_hours,
        taker_fee_bps=excluded.taker_fee_bps,maker_fee_bps=excluded.maker_fee_bps,multiplier=excluded.multiplier,
        source=excluded.source,observed_at=excluded.observed_at,updated_at=CURRENT_TIMESTAMP`)
        .bind(`${venue}:${symbol}`,venue,symbol,clean(item.venueSymbol,40)||symbol,clean(item.base,32),clean(item.quote,16)||"USDT",clean(item.assetClass,24)||"crypto",
          nullableFinite(item.fundingIntervalHours),nullableFinite(item.takerFeeBps),nullableFinite(item.makerFeeBps),nullableFinite(item.multiplier),clean(item.source,24)||"exchange",finite(item.observedAt,Date.now())));
    }
    for (const item of markets) {
      const venue=clean(item.venue,24),symbol=clean(item.symbol,32);if(!venue||!symbol)continue;
      statements.push(db.prepare(`INSERT INTO market_snapshots
        (venue,symbol,bid,ask,bid_qty,ask_qty,mark,index_price,funding,funding_indicative,next_funding_time,open_interest,volume_quote,source,quality_ok,observed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(venue,symbol,finite(item.bid),finite(item.ask),finite(item.bidQty),finite(item.askQty),finite(item.mark),finite(item.index),finite(item.funding),finite(item.fundingIndicative),finite(item.nextFundingTime),finite(item.openInterest),finite(item.volumeQuote),clean(item.source,16)||"unknown",item.qualityOk?1:0,finite(item.observedAt,Date.now())));
    }
    for (const item of health) {
      const venue=clean(item.venue,24);if(!venue)continue;
      statements.push(db.prepare(`INSERT INTO venue_health (venue,ok,mode,quote_count,latency_ms,error,observed_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(venue,item.ok?1:0,clean(item.mode,16)||"unknown",Math.max(0,Math.round(finite(item.quoteCount))),Math.max(0,Math.round(finite(item.latencyMs))),clean(item.error,200)||null,finite(item.observedAt,Date.now())));
    }
    for (const item of settlements) {
      const venue=clean(item.venue,24),symbol=clean(item.symbol,32),settledAt=finite(item.settledAt);if(!venue||!symbol||!settledAt)continue;
      statements.push(db.prepare(`INSERT OR IGNORE INTO funding_settlements (id,venue,symbol,funding_rate,settled_at,observed_at) VALUES (?,?,?,?,?,?)`)
        .bind(`${venue}:${symbol}:${settledAt}`,venue,symbol,finite(item.fundingRate),settledAt,finite(item.observedAt,Date.now())));
    }
    for (const item of paperEvents) {
      const tradeId=clean(item.tradeId,80),symbol=clean(item.symbol,32),event=clean(item.event,16);if(!tradeId||!symbol||!event)continue;
      statements.push(db.prepare(`INSERT INTO shadow_trade_observations (trade_id,event,symbol,long_venue,short_venue,notional,net_pnl,details,observed_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(tradeId,event,symbol,clean(item.longVenue,24),clean(item.shortVenue,24),Math.max(0,finite(item.notional)),Number.isFinite(Number(item.netPnl))?finite(item.netPnl):null,JSON.stringify(item.details??{}).slice(0,4000),finite(item.observedAt,Date.now())));
    }
    if (!statements.length) return Response.json({ error: "no valid observations" }, { status: 400 });
    for(let index=0;index<statements.length;index+=100)await db.batch(statements.slice(index,index+100));
    return Response.json({ stored: statements.length, observedAt: Date.now() }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "history write failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const db = getDatabase();
    const url = new URL(request.url);
    const requestedWindow = url.searchParams.get("window") ?? "7d";
    const metric = url.searchParams.get("metric") ?? "funding";
    const days = requestedWindow === "24h" ? 1 : requestedWindow === "30d" ? 30 : requestedWindow === "90d" ? 90 : 7;
    const since = Date.now() - days * DAY;
    if(metric==="health"){
      const {results=[]}=await db.prepare(`SELECT venue,ok,mode,quote_count,latency_ms,error,observed_at FROM venue_health WHERE observed_at>=? ORDER BY observed_at ASC LIMIT 20000`).bind(since).all<Record<string,unknown>>();
      const venues=["binance","bitget","gate"].map(venue=>{const rows=results.filter(row=>row.venue===venue),last=rows.at(-1);return {venue,count:rows.length,uptimeRate:rows.length?rows.filter(row=>finite(row.ok)===1).length/rows.length:0,avgLatencyMs:rows.length?rows.reduce((sum,row)=>sum+finite(row.latency_ms),0)/rows.length:0,lastMode:last?.mode??null,lastError:last?.error??null,lastTs:last?.observed_at??null};});
      return Response.json({metric,window:requestedWindow,since,venues,generatedAt:Date.now()});
    }
    if(metric==="settlements"){
      const {results=[]}=await db.prepare(`SELECT venue,symbol,funding_rate,settled_at,observed_at FROM funding_settlements WHERE settled_at>=? ORDER BY settled_at DESC LIMIT 1000`).bind(since).all<Record<string,unknown>>();
      return Response.json({metric,window:requestedWindow,since,settlements:results,generatedAt:Date.now()});
    }
    if(metric==="contracts"){
      const {results=[]}=await db.prepare(`SELECT venue,symbol,venue_symbol,base,quote,asset_class,funding_interval_hours,taker_fee_bps,maker_fee_bps,multiplier,source,observed_at FROM contract_metadata ORDER BY symbol,venue LIMIT 5000`).all<Record<string,unknown>>();
      return Response.json({metric,contracts:results,generatedAt:Date.now()});
    }
    if(metric==="market"){
      const symbol=clean(url.searchParams.get("symbol"),32);if(!symbol)return Response.json({error:"symbol is required"},{status:400});
      const {results=[]}=await db.prepare(`SELECT venue,symbol,bid,ask,bid_qty,ask_qty,mark,index_price,funding,next_funding_time,open_interest,volume_quote,source,quality_ok,observed_at FROM market_snapshots WHERE symbol=? AND observed_at>=? ORDER BY observed_at ASC LIMIT 10000`).bind(symbol,since).all<Record<string,unknown>>();
      return Response.json({metric,symbol,window:requestedWindow,since,snapshots:results,generatedAt:Date.now()});
    }
    if (metric === "opportunity") {
      const { results = [] } = await db.prepare("SELECT route_id, symbol, asset_class, long_venue, short_venue, net_edge_bps, capacity_usdt, eligible, observed_at FROM opportunity_snapshots WHERE observed_at >= ? ORDER BY route_id ASC, observed_at ASC LIMIT 50000")
        .bind(since).all<Record<string, unknown>>();
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const row of results) {
        const key = String(row.route_id), rows = grouped.get(key) ?? [];
        rows.push(row); grouped.set(key, rows);
      }
      const routes = [...grouped.entries()].map(([id, rows]) => {
        const edges = rows.map((row) => finite(row.net_edge_bps));
        const capacities = rows.map((row) => finite(row.capacity_usdt));
        const last = rows.at(-1)!;
        return {
          id, symbol: last.symbol, assetClass: last.asset_class,
          longVenue: last.long_venue, shortVenue: last.short_venue,
          count: rows.length,
          eligibleRate: rows.filter((row) => finite(row.eligible) === 1).length / rows.length,
          avgNetEdgeBps: edges.reduce((sum, value) => sum + value, 0) / edges.length,
          maxNetEdgeBps: Math.max(...edges),
          avgCapacityUsdt: capacities.reduce((sum, value) => sum + value, 0) / capacities.length,
          lastNetEdgeBps: edges.at(-1),
          lastTs: last.observed_at,
        };
      }).sort((a, b) => b.eligibleRate - a.eligibleRate || b.avgNetEdgeBps - a.avgNetEdgeBps);
      return Response.json({ metric, window: requestedWindow, since, routes, generatedAt: Date.now() });
    }
    const { results = [] } = await db.prepare(`SELECT route_id, symbol, asset_class,
      long_venue, short_venue, hourly_bps, observed_at FROM funding_observations
      WHERE observed_at >= ? ORDER BY route_id ASC, observed_at ASC LIMIT 50000`)
      .bind(since).all<Record<string, unknown>>();
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const row of results) {
      const key = String(row.route_id), rows = grouped.get(key) ?? [];
      rows.push(row); grouped.set(key, rows);
    }
    const routes = [...grouped.entries()].map(([id, rows]) => {
      const values = rows.map((row) => finite(row.hourly_bps));
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const last = rows.at(-1)!;
      const streak = streaks(values);
      const sessionGroups = new Map<string, number[]>();
      for (const row of rows) {
        const name = sessionName(row.observed_at), group = sessionGroups.get(name) ?? [];
        group.push(finite(row.hourly_bps)); sessionGroups.set(name, group);
      }
      const sessions = [...sessionGroups].map(([name, group])=>({name,count:group.length,avgHourlyBps:group.reduce((sum,value)=>sum+value,0)/group.length,positiveRate:group.filter(value=>value>0).length/group.length}));
      return { id, symbol: last.symbol, assetClass: last.asset_class,
        longVenue: last.long_venue, shortVenue: last.short_venue, count: values.length,
        avgHourlyBps: mean, medianHourlyBps: quantile(values, .5),
        p10HourlyBps: quantile(values, .1), p90HourlyBps: quantile(values, .9),
        positiveRate: values.filter((value) => value > 0).length / values.length,
        reversals: signReversals(values), annualizedPct: mean * 24 * 365 / 100,
        currentStreakSign: streak.currentSign, currentStreakLength: streak.currentLength,
        maxPositiveStreak: streak.maxPositive, maxNegativeStreak: streak.maxNegative, sessions,
        lastHourlyBps: values.at(-1), lastTs: last.observed_at };
    }).sort((a, b) => b.annualizedPct - a.annualizedPct);
    return Response.json({ metric, window: requestedWindow, since, routes, generatedAt: Date.now() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "history query failed" }, { status: 500 });
  }
}
