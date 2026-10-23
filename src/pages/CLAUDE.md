# src/pages — Astro file-based routes

File-based routing. Each `.astro` is one route. Server-rendered.

## Top-level pages
- `index.astro` — landing page.
- `library.astro` — library browser entry.
- `about.astro` — about page.
- `404.astro` — not-found.
- `changelog.astro` — generated changelog viewer.
- `contribute.astro`, `referrals.astro`, `support.astro`, `settings.astro`, `profile.astro` — user/community pages.
- `sitemap-dialogue.xml.js` — dialogue sitemap. `sitemap-library.xml.js` (index) + `sitemap-library-[part].xml.js` — library sitemap from GET /api/library/sitemap (reports snapshot), edge-cached.

## Subdirectories
- `library/` — `[religion]/[collection]/[doc-slug].astro` dynamic doc pages, redirects, browse views.
- `dialogue/` — published Jafar conversations. Each dialog is a markdown file in `src/content/dialogs/`; the page reads via Astro content collections.
- `docs/` — runtime-fetched DB-backed docs (architecture, agents, refactor, etc.). Reads from `/api/v1/pages/:slug` at request time.
- `admin/` — admin dashboards (gated behind admin JWT).
- `community/` — forum.
- `print/` — print-friendly layouts.
- `support/` — help center.

## Conventions
- Dynamic routes use direct `fetch()` to api.siftersearch.com (Live Content Collections were tried; reverted).
- Cache-Control headers: `s-maxage=300, stale-while-revalidate=86400` on doc pages.
- Astro content collections schema lives in `src/content.config.ts`.
