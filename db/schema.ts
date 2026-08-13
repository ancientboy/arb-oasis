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
