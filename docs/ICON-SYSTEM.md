# Storefront icon system

The approved direction is solid, black, slightly asymmetric and robust, matching the account page icons. Shared SVG silhouettes live in `public/brand-icons.mjs`; use `brandIcon(name, size, className)` for new controls. Reuse the same shape for the same action.

Scope: header, mobile menu, account tiles and panels, favorites, product cards, search and filters, quantity controls, cart, checkout, image zoom/close, directional CTA glyphs, recipe/category links, footer and admin panel controls. FAQ plus/minus uses the same solid asymmetric treatment in CSS. Native form controls and third-party sign-in branding remain owned by their respective platform/provider.

Icons inherit foreground color so they remain legible on dark buttons and the black marquee. Black is the default on light surfaces. Favorite state keeps its distinct pink button background and existing aria-pressed state. Decorative SVGs are hidden from assistive technology; existing button labels and keyboard interactions are preserved.

`styleIcons` formats legacy markup at server rendering and HTML insertion boundaries, without a document-wide mutation observer. It does not modify scripts, styles, textarea values, attributes, numerical multiplication or analytics charts. It is idempotent. Newly added SVGs should use the explicit shared helper instead of relying on legacy recognition.

Mobile-first is the default for future changes. Preserve the existing touch target dimensions and explicit icon sizes, and verify small-screen layout before calling a change mobile-tested. Current automated checks cover server markup, client DOM interactions, functional regression tests and build/type checks. Mobile viewport browser emulation is unavailable in the current browser interface; do not claim mobile visual verification.
