CREATE TABLE `newsletter_subscribers` (
	`email` text PRIMARY KEY NOT NULL,
	`consent_version` text NOT NULL,
	`consent_text` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `newsletter_throttle` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_order_operations` (
	`order_id` text PRIMARY KEY NOT NULL,
	`fulfillment_status` text DEFAULT 'processing' NOT NULL,
	`tracking_url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`revision` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_stock_movements` (
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`order_id`, `product_id`)
);
--> statement-breakpoint
CREATE TABLE `store_stock_reservations` (
	`checkout_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`checkout_id`, `product_id`)
);
--> statement-breakpoint
CREATE TABLE `store_admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_records` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`kind`, `id`)
);
