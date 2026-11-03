CREATE TABLE `order_tracking_links` (
	`order_id` text PRIMARY KEY NOT NULL,
	`tracking_token` text NOT NULL UNIQUE,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `customer_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `gls_shipments` ADD `status_json` text;
--> statement-breakpoint
ALTER TABLE `gls_shipments` ADD `status_checked_at` text;
--> statement-breakpoint
CREATE TABLE `order_email_log` (
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`order_id`,`kind`),
	FOREIGN KEY (`order_id`) REFERENCES `customer_orders`(`id`) ON UPDATE no action ON DELETE no action
);
