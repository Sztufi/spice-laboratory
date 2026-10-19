declare namespace Cloudflare {
  interface Env {
    ADMIN_EMAILS?: string;
    STRIPE_ENABLED?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_WEBHOOK_READY?: string;
    STRIPE_MODE?: string;
    MERCHANT_PRICES_APPROVED?: string;
    SHIPPING_METHODS_JSON?: string;
    OMNISEND_API_KEY?: string;
    OMNISEND_ENABLED?: string;
    OMNISEND_ORDER_EVENTS_ENABLED?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
