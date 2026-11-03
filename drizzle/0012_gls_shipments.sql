CREATE TABLE `gls_shipments` (
	`order_id` text PRIMARY KEY NOT NULL,
	`parcel_number` text NOT NULL DEFAULT '',
	`label_key` text NOT NULL DEFAULT '',
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `customer_orders`(`id`) ON UPDATE no action ON DELETE no action
);
