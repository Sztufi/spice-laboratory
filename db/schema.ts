import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(), email: text('email').notNull(), fullName: text('full_name').notNull().default(''),
  phone: text('phone').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
});
export const addresses = sqliteTable('customer_addresses', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => customers.id), kind: text('kind').notNull(),
  recipient: text('recipient').notNull().default(''), company: text('company').notNull().default(''), taxId: text('tax_id').notNull().default(''),
  country: text('country').notNull().default('HU'), line1: text('line1').notNull().default(''), line2: text('line2').notNull().default(''),
  city: text('city').notNull().default(''), postalCode: text('postal_code').notNull().default(''), updatedAt: text('updated_at').notNull()
}, table => [uniqueIndex('address_user_kind').on(table.userId, table.kind)]);
export const favorites = sqliteTable('customer_favorites', {
  userId: text('user_id').notNull().references(() => customers.id), productId: text('product_id').notNull(), createdAt: text('created_at').notNull()
}, table => [primaryKey({ columns: [table.userId, table.productId] })]);
export const orders = sqliteTable('customer_orders', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => customers.id), requestId: text('request_id').notNull(),
  number: text('number').notNull(), kind: text('kind').notNull().default('demo'), status: text('status').notNull(),
  totalMinor: integer('total_minor').notNull(), currency: text('currency').notNull(), itemsJson: text('items_json').notNull(), createdAt: text('created_at').notNull()
}, table => [uniqueIndex('order_user_request').on(table.userId, table.requestId)]);
export const invoices = sqliteTable('customer_invoices', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => customers.id), orderId: text('order_id').references(() => orders.id),
  number: text('number').notNull(), issuedAt: text('issued_at').notNull(), totalMinor: integer('total_minor').notNull(),
  currency: text('currency').notNull(), objectKey: text('object_key').notNull(), createdAt: text('created_at').notNull()
});
export const accountRequests = sqliteTable('customer_account_requests', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => customers.id), kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'), createdAt: text('created_at').notNull()
});
