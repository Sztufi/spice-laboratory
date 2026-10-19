# Webshop speed and image pipeline

Implemented 19 October 2026. Measurements below are file bytes, not browser load-time or conversion measurements.

| Asset set | Original | Largest generated WebP | Reduction |
| --- | ---: | ---: | ---: |
| Homepage mascot | 721,875 B | 68,522 B | 90.5% |
| Mascot + ten product photos | 921,488 B | 265,080 B | 71.2% |
| Sample product photo, 320 px server variant | 21,854 B source | 12,264 B | 43.9% |

Individual product WebPs are not always smaller than their already compressed JPEG originals at full size. Responsive mobile variants and the large PNG replacement provide the main image-byte savings. Originals remain in the repository. The total stored asset directory is larger because it now contains multiple variants.

## Automatic processing

- Existing local images: `scripts/optimize-images.mjs` runs on every production build, uses Sharp WebP quality 82 and generates 160/320/640/960-width files. Source aspect ratio and transparency are preserved; small originals are not enlarged. Filenames contain a source/settings hash.
- New admin uploads: the browser accepts up to 25 MB, normalizes orientation and reduces the longest edge to 1600 px before upload, encoding WebP at quality 86. The server accepts up to 5 MB compressed input and validates the actual file header and pixel dimensions before decoding. Its maximum is 3 million pixels.
- Server processing uses Photon for resizing/cropping and jSquash/libwebp for lossy WebP encoding at quality 82. This second processing step can introduce additional compression loss. Inspect packaging text after upload; retain full-resolution originals separately for print and future editing.
- Each upload creates one natural-aspect master plus four exact-size variants. Product variants use square canvases; recipe-editor uploads use 16:9 canvases. Widths: 160, 320, 640 and 960 px. Small source pixels are not enlarged: unused canvas space stays transparent.
- The editor's “Automatikus képkivágás” setting preserves the full image by default. Choose “Középre vágás a képhelyhez” for a centered crop. Verify the preview after upload; automatic center cropping cannot identify label text or a food subject reliably.
- Finished WebPs are stored once in R2 and served as immutable media. They are not transformed again on every customer request. Image processing is owner-only through the existing admin upload route. One upload per Worker isolate is processed at a time to bound memory use; an overlapping upload returns a retry message.
- No Cloudflare Images subscription or new external image service was activated. The codecs are bundled with the existing Worker. Existing legacy media links continue to work. Older uploaded media are not silently reprocessed; upload them again to generate the new variants.
- External image URLs are not proxied or downloaded by the optimizer. Upload them through the admin to obtain local variants. Media-library uploads default to the product profile; upload from a recipe editor to get the recipe profile.

## Delivery and loading

Server-rendered images and client-rendered product cards use `srcset` and `sizes`, so the browser can select an appropriate file for viewport width and pixel density. Existing image dimensions reserve layout space. Main product/homepage images retain high fetch priority; below-page images retain lazy loading. The decorative mascot preserves its transparent background.

The Google Fonts CSS `@import` chain was replaced with an explicit stylesheet and preconnect hints. Fonts still use `display=swap`; this work does not self-host them. Recipe/product/home-specific stylesheets are now requested only on applicable page types. An unnecessary shipping-settings database query was removed from storefront page rendering by using settings already read with the catalogue.

Personalized HTML remains private/non-cacheable because it can contain owner-specific navigation. Do not apply blanket public HTML caching to the admin, account, checkout or APIs. Hash-named static optimized assets declare a one-year immutable cache policy in `_headers`; uploaded R2 media already receive this policy in the serving route. The hosting layer can add its own cache behaviour, so verify production response headers after deployment.

## Verification and remaining measurements

Automated tests exercise real encoders, exact decoded dimensions, crop/contain and recipe profiles, invalid files and oversized pixel headers. A separate workerd check imports the actual built WASM modules and resizes/encodes a real source photo successfully. Existing shop and admin DOM checks cover cart, navigation, product pages and SEO editing.

No browser Lighthouse/PageSpeed run or real-user Core Web Vitals result is claimed. The first read-only production HEAD check returned HTTP 200 and private/no-store HTML; that individual request is not a repeatable speed baseline. A live mobile waterfall and field data remain necessary to quantify LCP/INP/CLS and end-to-end improvement. Browser visual QA was unavailable in the current Sites environment.

Current Google good-experience thresholds: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 at the 75th percentile. These are targets, not achieved measurements for this site.

## Primary references checked

- [Google/web.dev: responsive images, formats and sizing](https://web.dev/learn/images/)
- [Google/web.dev: Fetch Priority](https://web.dev/articles/fetch-priority)
- [Google/web.dev: font best practices](https://web.dev/articles/font-best-practices)
- [Google/web.dev: Web Vitals](https://web.dev/articles/vitals)
- [jSquash project: codecs and Cloudflare Workers support](https://github.com/jamsinclair/jSquash)
- [Photon Worker package and usage](https://github.com/fineshopdesign/cf-wasm/tree/main/packages/photon)

The Photon 0.4.0 and jSquash WebP 1.5.0 package sources/types were also checked locally. The Cloudflare Images binding documentation was reviewed; that optional paid service is not part of this implementation.
