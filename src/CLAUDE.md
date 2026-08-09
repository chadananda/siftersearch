# src — Astro frontend (server-rendered)

Astro 5 + Svelte 5 + Tailwind 4. Server-rendered (`output: 'server'`) and
deployed as a single Cloudflare Worker (SSR + assets + /api proxy; see
`worker/index.js` + `wrangler.jsonc`). Browser code is SAME-ORIGIN
(`PUBLIC_API_URL=''` in prod → relative `/api/*`, proxied at the edge to
the tunnel). SSR fetches use the absolute tunnel origin
(`https://api.siftersearch.com`) — never a bare PUBLIC_API_URL.

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
- **Pre-commit deploy** — every commit runs `npm run build` + `scripts/deploy-worker.sh` (`wrangler deploy`). Frontend changes ONLY land via the pre-commit hook.

## Refactor status (2026-05)
- `components/ChatInterface.svelte` (5,371 lines) — split deferred. No automated tests; manual browser verification required.
- `components/library/DocumentPresentation.svelte` (3,314 lines) — split deferred.
- See `docs/refactor.md` for goals + methodology.
