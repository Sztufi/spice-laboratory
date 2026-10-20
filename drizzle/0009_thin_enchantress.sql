CREATE TABLE `store_inventory_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`generation` text,
	`source_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `store_smartbill_stock` (
	`product_id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`source_key` text NOT NULL,
	`quantity` integer,
	`unit` text NOT NULL,
	`status` text NOT NULL,
	`generation` text NOT NULL,
	`checked_at` text NOT NULL,
	`stock_date` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `store_stock_movements` ADD `sku` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `store_stock_movements` ADD `smartbill_confirmed_at` text;--> statement-breakpoint
ALTER TABLE `store_stock_movements` ADD `smartbill_document` text;