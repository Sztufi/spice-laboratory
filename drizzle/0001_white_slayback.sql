CREATE TABLE `payment_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`items_json` text NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`session_id` text,
	`session_url` text,
	`expires_at` integer,
	`customer_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_user_request` ON `payment_checkouts` (`user_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_session` ON `payment_checkouts` (`session_id`);--> statement-breakpoint
CREATE TABLE `marketing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `customer_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_order` ON `marketing_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `marketing_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`consent_version` text NOT NULL,
	`changed_at` text NOT NULL,
	`sync_status` text NOT NULL,
	`revision` text NOT NULL,
	`synced_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`checkout_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`checkout_id`) REFERENCES `payment_checkouts`(`id`) ON UPDATE no action ON DELETE no action
);
