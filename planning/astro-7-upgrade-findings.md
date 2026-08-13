# Astro 7 upgrade — what actually blocks it (researched 2026-08-13)

Branch: `wt/astro-7-upgrade` (f702e62d) holds the in-progress work. `main` runs the tested
Astro 5.16.4 tree. This file exists so the next attempt starts from evidence, not from scratch.

## Two blockers I first reported were WRONG

**1. "@vite-pwa/astro pins astro ≤5, so finishing means dropping PWA (a product decision)."**
False framing. `@vite-pwa/astro@1.2.0` is indeed the latest release and its peer range stops at
`astro ^5.0.0` — but **this project does not use PWA at all**. `astro.config.mjs`: "No PWA — SSR
+ Cloudflare edge caching + browser prefetch handles performance", and `grep` finds zero
references in any source file. It is a dead devDependency. Deleting it removes the ERESOLVE
outright; there is no product decision.
*(If PWA is ever wanted on Astro 7: use `vite-plugin-pwa` directly in `vite.plugins` — it peers
on vite `^3–^8`, not on astro, so the abandoned wrapper is unnecessary. Confirmed on the registry.)*

**2. "@sveltejs/vite-plugin-svelte 7 needs vite ^8 but astro 7 resolves vite 6.4.1."**
An artifact of the branch's stale astro 7.1.3 lockfile. `astro@7.2.1` depends on `vite ^8.0.13`
and `@astrojs/svelte@9.0.1` wants `@sveltejs/vite-plugin-svelte ^7.1.0` + `vite ^8.0.13` — they
agree. With the PWA dep removed, `npm install` of astro 7.2.1 / @astrojs/cloudflare 14.2.1 /
@astrojs/svelte 9.0.1 succeeds.

## THE REAL BLOCKER: the v14 adapter bundles wrangler's `main`

`wrangler.jsonc` sets `"main": "worker/index.js"` — our single-origin edge worker, which proxies
`/api/*`, `/widget*`, `/health` to the tunnel and delegates everything else to Astro SSR. It does
that by importing the build's own output:

    import astro from '../dist/_worker.js/index.js';

`@astrojs/cloudflare` **v12 ignored wrangler's main**; **v14 reads it and bundles that entry during
`astro build`**, at which point `dist/` does not exist yet:

    [UNRESOLVED_IMPORT] Could not resolve '../dist/_worker.js/index.js' in worker/index.js

**A lazy `await import()` does NOT fix it.** It appears to work only because a previous build left
`dist/` on disk; on a clean build (`rm -rf dist`) rolldown resolves dynamic imports too and fails
identically. Verified both ways.

## Two viable paths (a decision, not a chore)

1. **Move the proxy into Astro middleware** (`src/middleware.js`) and let the adapter own the worker
   entry — drop `main` from wrangler.jsonc. Idiomatic for Astro 7 + adapter v14. Cost: the /api,
   /widget, /health proxy and its edge-cache logic get rewritten on the site's most critical path,
   so it needs real verification (SSE streaming through the proxy especially — chat rides it).
2. **Keep the wrapper, hide it from the adapter** — build in two passes so `astro build` never sees
   `main` (e.g. a deploy-only wrangler config, or set `main` after the astro build). Preserves the
   current architecture and the migration seam; costs a slightly more complex build.

Path 1 is cleaner long-term; path 2 is lower risk today. Either way the request path must be
verified end to end, including SSE, before it ships — which is why this was not completed
unattended at 07:00.

## State

- `main`: astro 5.16.4, installable (`npm ci` clean), builds, deployed and healthy.
- `wt/astro-7-upgrade`: astro 7.1.3 + adapter 14 + the Workers `createRequire` shim + its lockfile.
  Note the shim: Astro 7's rolldown output emits `createRequire(import.meta.url)`, which is undefined
  in the Workers runtime — that fix is still needed and is preserved there.
