import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const fundingObservations = sqliteTable(
  "funding_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    routeId: text("route_id").notNull(),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    longVenue: text("long_venue").notNull(),
    shortVenue: text("short_venue").notNull(),
    hourlyBps: real("hourly_bps").notNull(),
    observedAt: integer("observed_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("funding_route_time_idx").on(table.routeId, table.observedAt),
    index("funding_symbol_time_idx").on(table.symbol, table.observedAt),
  ],
);

export const opportunitySnapshots = sqliteTable(
  "opportunity_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    routeId: text("route_id").notNull(),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    longVenue: text("long_venue").notNull(),
    shortVenue: text("short_venue").notNull(),
    spreadBps: real("spread_bps").notNull(),
    fundingHourlyBps: real("funding_hourly_bps"),
    netEdgeBps: real("net_edge_bps").notNull(),
    capacityUsdt: real("capacity_usdt").notNull(),
    score: integer("score").notNull(),
    eligible: integer("eligible", { mode: "boolean" }).notNull(),
    observedAt: integer("observed_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("opportunity_route_time_idx").on(table.routeId, table.observedAt),
    index("opportunity_symbol_time_idx").on(table.symbol, table.observedAt),
  ],
);

export const contractMetadata = sqliteTable(
  "contract_metadata",
  {
    id: text("id").primaryKey(), venue: text("venue").notNull(), symbol: text("symbol").notNull(),
    venueSymbol: text("venue_symbol").notNull(), base: text("base").notNull(), quote: text("quote").notNull(),
    assetClass: text("asset_class").notNull(), fundingIntervalHours: real("funding_interval_hours"),
    takerFeeBps: real("taker_fee_bps"), makerFeeBps: real("maker_fee_bps"), multiplier: real("multiplier"),
    source: text("source").notNull(), observedAt: integer("observed_at").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("contract_symbol_venue_idx").on(table.symbol, table.venue)],
);

export const marketSnapshots = sqliteTable(
  "market_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }), venue: text("venue").notNull(),
    symbol: text("symbol").notNull(), bid: real("bid"), ask: real("ask"), bidQty: real("bid_qty"),
    askQty: real("ask_qty"), mark: real("mark"), indexPrice: real("index_price"), funding: real("funding"),
    fundingIndicative: real("funding_indicative"), nextFundingTime: integer("next_funding_time"),
    openInterest: real("open_interest"), volumeQuote: real("volume_quote"), source: text("source").notNull(),
    qualityOk: integer("quality_ok", { mode: "boolean" }).notNull(), observedAt: integer("observed_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("market_symbol_venue_time_idx").on(table.symbol, table.venue, table.observedAt)],
);

export const venueHealth = sqliteTable(
  "venue_health",
  {
    id: integer("id").primaryKey({ autoIncrement: true }), venue: text("venue").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(), mode: text("mode").notNull(),
    quoteCount: integer("quote_count").notNull(), latencyMs: integer("latency_ms"), error: text("error"),
    observedAt: integer("observed_at").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("venue_health_time_idx").on(table.venue, table.observedAt)],
);

export const fundingSettlements = sqliteTable(
  "funding_settlements",
  {
    id: text("id").primaryKey(), venue: text("venue").notNull(), symbol: text("symbol").notNull(),
    fundingRate: real("funding_rate").notNull(), settledAt: integer("settled_at").notNull(),
    observedAt: integer("observed_at").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("funding_settlement_symbol_time_idx").on(table.symbol, table.venue, table.settledAt)],
);

export const shadowTradeObservations = sqliteTable(
  "shadow_trade_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }), tradeId: text("trade_id").notNull(),
    event: text("event").notNull(), symbol: text("symbol").notNull(), longVenue: text("long_venue").notNull(),
    shortVenue: text("short_venue").notNull(), notional: real("notional").notNull(), netPnl: real("net_pnl"),
    details: text("details").notNull(), observedAt: integer("observed_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("shadow_trade_time_idx").on(table.tradeId, table.observedAt)],
);
