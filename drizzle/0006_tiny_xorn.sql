CREATE TABLE `google_login_challenges` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `google_challenges_expiry` ON `google_login_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `google_customer_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `google_sessions_expiry` ON `google_customer_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `google_login_throttle` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `google_throttle_expiry` ON `google_login_throttle` (`expires_at`);