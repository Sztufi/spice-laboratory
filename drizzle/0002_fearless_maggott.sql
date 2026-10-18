CREATE TABLE `guest_checkout_access` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `payment_checkouts` ADD `shipping_json` text;--> statement-breakpoint
ALTER TABLE `customer_orders` ADD `shipping_json` text;