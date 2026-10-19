CREATE INDEX `orders_analytics_date` ON `customer_orders` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `orders_analytics_scope` ON `customer_orders` (`kind`,`status`,`created_at`);