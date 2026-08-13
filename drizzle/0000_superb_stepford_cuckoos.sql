CREATE TABLE `funding_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_id` text NOT NULL,
	`symbol` text NOT NULL,
	`asset_class` text NOT NULL,
	`long_venue` text NOT NULL,
	`short_venue` text NOT NULL,
	`hourly_bps` real NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `funding_route_time_idx` ON `funding_observations` (`route_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `funding_symbol_time_idx` ON `funding_observations` (`symbol`,`observed_at`);--> statement-breakpoint
CREATE TABLE `opportunity_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_id` text NOT NULL,
	`symbol` text NOT NULL,
	`asset_class` text NOT NULL,
	`long_venue` text NOT NULL,
	`short_venue` text NOT NULL,
	`spread_bps` real NOT NULL,
	`funding_hourly_bps` real,
	`net_edge_bps` real NOT NULL,
	`capacity_usdt` real NOT NULL,
	`score` integer NOT NULL,
	`eligible` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opportunity_route_time_idx` ON `opportunity_snapshots` (`route_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `opportunity_symbol_time_idx` ON `opportunity_snapshots` (`symbol`,`observed_at`);