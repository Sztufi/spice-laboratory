import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(), email: text('email').notNull(), fullName: text('full_name').notNull().default(''),
  phone: text('phone').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
});
export const googleSessions = sqliteTable('google_customer_sessions', {
  tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>customers.id),expiresAt:integer('expires_at').notNull(),createdAt:integer('created_at').notNull()
},table=>[index('google_sessions_expiry').on(table.expiresAt)]);
export const googleChallenges = sqliteTable('google_login_challenges', {
  tokenHash:text('token_hash').primaryKey(),nonce:text('nonce').notNull(),expiresAt:integer('expires_at').notNull()
},table=>[index('google_challenges_expiry').on(table.expiresAt)]);
export const googleThrottle = sqliteTable('google_login_throttle', {
  id:text('id').primaryKey(),attempts:integer('attempts').notNull().default(1),expiresAt:integer('expires_at').notNull()
},table=>[index('google_throttle_expiry').on(table.expiresAt)]);
export const emailIdentities=sqliteTable('email_login_identities',{
 email:text('email').primaryKey(),userId:text('user_id').notNull().references(()=>customers.id)
});
export const emailLinks=sqliteTable('email_login_links',{
 tokenHash:text('token_hash').primaryKey(),email:text('email').notNull(),userId:text('user_id').notNull(),
 browserHash:text('browser_hash').notNull(),expiresAt:integer('expires_at').notNull(),ready:integer('ready').notNull().default(0)
},table=>[index('email_links_expiry').on(table.expiresAt)]);
export const emailSessions=sqliteTable('email_customer_sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>customers.id),expiresAt:integer('expires_at').notNull(),createdAt:integer('created_at').notNull()
},table=>[index('email_sessions_expiry').on(table.expiresAt)]);
export const emailThrottle=sqliteTable('email_login_throttle',{
 id:text('id').primaryKey(),attempts:integer('attempts').notNull().default(1),expiresAt:integer('expires_at').notNull()
},table=>[index('email_throttle_expiry').on(table.expiresAt)]);
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
  shippingJson:text('shipping_json'),discountJson:text('discount_json'),
  number: text('number').notNull(), kind: text('kind').notNull().default('demo'), status: text('status').notNull(),
  totalMinor: integer('total_minor').notNull(), currency: text('currency').notNull(), itemsJson: text('items_json').notNull(), createdAt: text('created_at').notNull()
}, table => [uniqueIndex('order_user_request').on(table.userId, table.requestId),index('orders_analytics_date').on(table.createdAt,table.id),index('orders_analytics_scope').on(table.kind,table.status,table.createdAt)]);
export const invoices = sqliteTable('customer_invoices', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => customers.id), orderId: text('order_id').references(() => orders.id),
  number: text('number').notNull(), issuedAt: text('issued_at').notNull(), totalMinor: integer('total_minor').notNull(),
  currency: text('currency').notNull(), objectKey: text('object_key').notNull(), createdAt: text('created_at').notNull()
});
export const accountRequests = sqliteTable('customer_account_requests', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => customers.id), kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'), createdAt: text('created_at').notNull()
});

export const checkouts = sqliteTable('payment_checkouts', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => customers.id), requestId: text('request_id').notNull(),
  fingerprint: text('fingerprint').notNull(), itemsJson: text('items_json').notNull(), totalMinor: integer('total_minor').notNull(),
  currency: text('currency').notNull(), mode: text('mode').notNull(), status: text('status').notNull().default('creating'),
  sessionId: text('session_id'), paymentIntentId:text('payment_intent_id'), sessionUrl: text('session_url'), expiresAt: integer('expires_at'),
  shippingJson:text('shipping_json'),discountJson:text('discount_json'),
  customerJson: text('customer_json'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
}, table => [uniqueIndex('checkout_user_request').on(table.userId,table.requestId),uniqueIndex('checkout_session').on(table.sessionId)]);
export const paymentEvents = sqliteTable('payment_events', {
  id:text('id').primaryKey(), checkoutId:text('checkout_id').notNull().references(()=>checkouts.id), type:text('type').notNull(), createdAt:text('created_at').notNull()
});
export const refunds=sqliteTable('payment_refunds',{
 id:text('id').primaryKey(),checkoutId:text('checkout_id').notNull().references(()=>checkouts.id),chargeId:text('charge_id').notNull(),
 amountMinor:integer('amount_minor').notNull(),currency:text('currency').notNull(),mode:text('mode').notNull(),status:text('status').notNull(),
 reason:text('reason'),createdAt:text('created_at').notNull(),succeededAt:text('succeeded_at'),updatedAt:text('updated_at').notNull()
},table=>[index('refund_checkout').on(table.checkoutId),index('refund_success_date').on(table.succeededAt,table.id)]);
export const withdrawals=sqliteTable('customer_withdrawals',{
 id:text('id').primaryKey(),requestId:text('request_id').notNull(),name:text('name').notNull(),email:text('email').notNull(),
 orderReference:text('order_reference').notNull(),content:text('content').notNull(),createdAt:text('created_at').notNull(),
 emailStatus:text('email_status').notNull().default('pending'),status:text('status').notNull().default('pending')
},table=>[uniqueIndex('withdrawal_request').on(table.requestId),index('withdrawal_date').on(table.createdAt,table.id)]);
export const withdrawalThrottle=sqliteTable('withdrawal_throttle',{
 id:text('id').primaryKey(),attempts:integer('attempts').notNull().default(1),expiresAt:integer('expires_at').notNull()
},table=>[index('withdrawal_throttle_expiry').on(table.expiresAt)]);
export const marketingPreferences = sqliteTable('marketing_preferences', {
  userId:text('user_id').primaryKey().references(()=>customers.id), email:text('email').notNull(), status:text('status').notNull(),
  consentVersion:text('consent_version').notNull(), changedAt:text('changed_at').notNull(), syncStatus:text('sync_status').notNull(),
  revision:text('revision').notNull(), syncedAt:text('synced_at')
});
export const marketingEvents = sqliteTable('marketing_events', {
  id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>customers.id), orderId:text('order_id').notNull().references(()=>orders.id),
  payloadJson:text('payload_json').notNull(), status:text('status').notNull().default('pending'), createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull()
}, table=>[uniqueIndex('marketing_order').on(table.orderId)]);

export const guestCheckoutAccess = sqliteTable('guest_checkout_access', {
  tokenHash:text('token_hash').primaryKey(),customerId:text('customer_id').notNull().references(()=>customers.id),
  expiresAt:integer('expires_at').notNull(),createdAt:text('created_at').notNull()
});

export const storeRecords = sqliteTable('store_records', {
  kind:text('kind').notNull(),id:text('id').notNull(),payloadJson:text('payload_json').notNull(),
  status:text('status').notNull().default('draft'),revision:text('revision').notNull(),
  createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},table=>[primaryKey({columns:[table.kind,table.id]})]);
export const storeAudit = sqliteTable('store_admin_audit', {
  id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),
  entity:text('entity').notNull(),entityId:text('entity_id').notNull(),createdAt:text('created_at').notNull()
});
export const orderOperations = sqliteTable('store_order_operations', {
  orderId:text('order_id').primaryKey(),fulfillmentStatus:text('fulfillment_status').notNull().default('processing'),
  trackingUrl:text('tracking_url').notNull().default(''),note:text('note').notNull().default(''),
  revision:text('revision').notNull(),updatedAt:text('updated_at').notNull()
});
export const newsletterSubscribers = sqliteTable('newsletter_subscribers', {
  email:text('email').primaryKey(),consentVersion:text('consent_version').notNull(),consentText:text('consent_text').notNull(),
  status:text('status').notNull().default('pending'),revision:text('revision').notNull(),
  createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
});
export const newsletterThrottle = sqliteTable('newsletter_throttle', {
  id:text('id').primaryKey(),attempts:integer('attempts').notNull().default(1),expiresAt:integer('expires_at').notNull()
});
export const stockMovements = sqliteTable('store_stock_movements', {
  orderId:text('order_id').notNull(),productId:text('product_id').notNull(),quantity:integer('quantity').notNull(),createdAt:text('created_at').notNull(),
  sku:text('sku').notNull().default(''),smartbillConfirmedAt:text('smartbill_confirmed_at'),smartbillDocument:text('smartbill_document')
},table=>[primaryKey({columns:[table.orderId,table.productId]})]);
export const smartbillStock=sqliteTable('store_smartbill_stock',{
 productId:text('product_id').primaryKey(),sku:text('sku').notNull(),sourceKey:text('source_key').notNull(),
 quantity:integer('quantity'),unit:text('unit').notNull(),status:text('status').notNull(),generation:text('generation').notNull(),
 checkedAt:text('checked_at').notNull(),stockDate:text('stock_date').notNull()
});
export const inventorySync=sqliteTable('store_inventory_sync',{
 id:text('id').primaryKey(),leaseToken:text('lease_token'),leaseUntil:integer('lease_until').notNull().default(0),
 nextAttemptAt:integer('next_attempt_at').notNull().default(0),lastAttemptAt:text('last_attempt_at'),lastSuccessAt:text('last_success_at'),
 generation:text('generation'),sourceKey:text('source_key'),status:text('status').notNull().default('pending'),error:text('error')
});
export const stockReservations = sqliteTable('store_stock_reservations', {
  checkoutId:text('checkout_id').notNull(),productId:text('product_id').notNull(),quantity:integer('quantity').notNull(),expiresAt:integer('expires_at').notNull()
},table=>[primaryKey({columns:[table.checkoutId,table.productId]})]);
