CREATE TABLE `restock_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`cancel_token` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restock_product_email` ON `restock_requests` (`product_id`,`email`);--> statement-breakpoint
CREATE INDEX `restock_waiting` ON `restock_requests` (`status`,`created_at`);