CREATE TABLE `contract_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`venue` text NOT NULL,
	`symbol` text NOT NULL,
	`venue_symbol` text NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`asset_class` text NOT NULL,
	`funding_interval_hours` real,
	`taker_fee_bps` real,
	`maker_fee_bps` real,
	`multiplier` real,
	`source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contract_symbol_venue_idx` ON `contract_metadata` (`symbol`,`venue`);--> statement-breakpoint
CREATE TABLE `funding_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`venue` text NOT NULL,
	`symbol` text NOT NULL,
	`funding_rate` real NOT NULL,
	`settled_at` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `funding_settlement_symbol_time_idx` ON `funding_settlements` (`symbol`,`venue`,`settled_at`);--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`venue` text NOT NULL,
	`symbol` text NOT NULL,
	`bid` real,
	`ask` real,
	`bid_qty` real,
	`ask_qty` real,
	`mark` real,
	`index_price` real,
	`funding` real,
	`funding_indicative` real,
	`next_funding_time` integer,
	`open_interest` real,
	`volume_quote` real,
	`source` text NOT NULL,
	`quality_ok` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `market_symbol_venue_time_idx` ON `market_snapshots` (`symbol`,`venue`,`observed_at`);--> statement-breakpoint
CREATE TABLE `shadow_trade_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trade_id` text NOT NULL,
	`event` text NOT NULL,
	`symbol` text NOT NULL,
	`long_venue` text NOT NULL,
	`short_venue` text NOT NULL,
	`notional` real NOT NULL,
	`net_pnl` real,
	`details` text NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shadow_trade_time_idx` ON `shadow_trade_observations` (`trade_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `venue_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`venue` text NOT NULL,
	`ok` integer NOT NULL,
	`mode` text NOT NULL,
	`quote_count` integer NOT NULL,
	`latency_ms` integer,
	`error` text,
	`observed_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `venue_health_time_idx` ON `venue_health` (`venue`,`observed_at`);