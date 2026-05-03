# src — Astro frontend (server-rendered)

Astro 5 + Svelte 5 + Tailwind 4. Server-rendered (`output: 'server'`) and
deployed to Cloudflare Pages + Workers. Frontend pulls live data from
`api.siftersearch.com` at request time (Live Content Collections were
tried; reverted to direct fetch() because of Workers runtime issues).

## Subdirectories
- `pages/` — Astro routes. File-based routing.
- `components/` — Svelte 5 components (use runes: `$state`, `$derived`, `$effect`). Server + client islands.
- `layouts/` — Astro page layouts. `BaseLayout.astro`, etc.
- `lib/` — frontend utilities + the API client.
- `styles/` — global CSS (Tailwind 4 + custom tokens).
- `content/` — Astro content collections (dialogs, agent docs).

## Top-level
- `content.config.ts` — Astro content-collection schemas (dialogs, agents).

## Architectural invariants (frontend)
- **Color tokens** — defined in `src/styles/global.css` as CSS variables; Tailwind classes are semantic (`bg-surface-1`, `text-primary`). NEVER use arbitrary values like `bg-[var(--surface-1)]`. See project root CLAUDE.md.
- **Svelte 5 runes** — use `$state`, `$derived`, `$effect`. `onclick` not `on:click`. `{#snippet}` over slots.
- **Pre-commit deploy** — every commit runs `npm run build` + `wrangler pages deploy ./dist`. Frontend changes ONLY land via the pre-commit hook.

## Refactor status (2026-05)
- `components/ChatInterface.svelte` (5,371 lines) — split deferred. No automated tests; manual browser verification required.
- `components/library/DocumentPresentation.svelte` (3,314 lines) — split deferred.
- See `docs/refactor.md` for goals + methodology.
