# SEO foundation for SplitShorts marketing routes

## Environment
Set `NEXT_PUBLIC_SITE_URL` to your production origin (for example `https://splitshorts.com`).

Why this matters:
- `metadataBase` depends on this value for canonical URLs.
- OpenGraph/Twitter image URLs become absolute and stable.
- `robots.ts` and `sitemap.ts` output correct production URLs.

## What is implemented
- Marketing metadata defaults in `src/app/(marketing)/layout.tsx`
- Programmatic metadata per use-case page via `generateMetadata`
- `src/app/sitemap.ts` for public marketing pages only
- `src/app/robots.ts` with disallow rules for private routes
- JSON-LD components under `src/components/seo`
- Homepage SoftwareApplication schema + use-case FAQPage schema

## Verify locally
1. Run app in production mode if possible:
```bash
npm run build && npm run start
```
2. Check these URLs:
- `/sitemap.xml`
- `/robots.txt`
- `/use-cases`
- `/use-cases/<slug>`

3. Validate page source includes:
- canonical link
- OG/Twitter metadata
- FAQ JSON-LD that exactly matches visible FAQ content

## Search Console readiness
After deploy, submit `https://your-domain.com/sitemap.xml` in Google Search Console.

## FAQ schema rule
Do not add Q/A in structured data unless the exact same Q/A is visible on that page.
