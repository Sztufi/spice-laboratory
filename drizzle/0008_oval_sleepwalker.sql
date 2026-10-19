CREATE TABLE `payment_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`checkout_id` text NOT NULL,
	`charge_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`succeeded_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`checkout_id`) REFERENCES `payment_checkouts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `refund_checkout` ON `payment_refunds` (`checkout_id`);--> statement-breakpoint
CREATE INDEX `refund_success_date` ON `payment_refunds` (`succeeded_at`,`id`);--> statement-breakpoint
CREATE TABLE `withdrawal_throttle` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `withdrawal_throttle_expiry` ON `withdrawal_throttle` (`expires_at`);--> statement-breakpoint
CREATE TABLE `customer_withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`order_reference` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`email_status` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_request` ON `customer_withdrawals` (`request_id`);--> statement-breakpoint
CREATE INDEX `withdrawal_date` ON `customer_withdrawals` (`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `payment_checkouts` ADD `payment_intent_id` text;