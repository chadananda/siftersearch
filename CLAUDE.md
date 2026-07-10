# SifterSearch Project Guidelines

> **Full coding principles**: See [planning/coding-principles-guide.md](planning/coding-principles-guide.md)

## Quick Reference

### Color System (Critical)

Colors are centrally defined in `src/styles/global.css`. Components use **semantic Tailwind classes only**.

```html
<!-- ✅ DO: Semantic classes -->
<div class="bg-surface-1 text-primary border-border">
<span class="text-accent hover:text-accent-hover">

<!-- ❌ DON'T: Arbitrary values -->
<div class="bg-[var(--surface-1)] text-[var(--text-primary)]">
```

### Key Color Tokens

| Token | Usage |
|-------|-------|
| `surface-0` to `surface-3` | Backgrounds |
| `primary`, `secondary`, `muted` | Text |
| `border`, `border-subtle` | Borders |
| `accent`, `accent-hover` | Actions |
| `success`, `warning`, `error`, `info` | Semantic |

### Svelte 5

- Use runes: `$state`, `$derived`, `$effect`
- Use `onclick` not `on:click`
- Prefer `{#snippet}` over slots

### JavaScript

- ES6+: `const`/`let`, arrow functions, destructuring
- Async/await over `.then()` chains
- Optional chaining: `obj?.property ?? 'default'`

### File Structure

- Components: `src/components/`
- Styles: `src/styles/global.css`
- API: `api/routes/`, `api/agents/`
- Docs: `docs/` (content source)
- Tests: `tests/`

### Testing

```bash
npm test        # Run all tests
npm run build   # Build (must pass)
```

### Architecture & Deployment

The system runs across **two surfaces** — keep this distinction in mind for every change:

**Surface 1: tower-nas (origin / data plane)**
- Fastify API at `localhost:7839`, exposed publicly via Cloudflare Tunnel as `api.siftersearch.com`
- SQLite content DB at `~/sifter/siftersearch/data/sifter.db` (the source of truth — no D1, no Turso for content)
- PM2 processes (live): `siftersearch-api`, `siftersearch-worker` (single writer, hosts `/write` :7849), `siftersearch-embedding`, `siftersearch-deep-research`, `siftersearch-library-watcher`, `siftersearch-updater`, `cloudflared-tunnel`
- RETIRED 2026-07-10 (pm2-stopped, superseded by the unified enrichment pipeline — see below): `siftersearch-enrichment`, `siftersearch-enrichment-api`, `siftersearch-graph-extractor/promoter/resolver/validator`. Do not restart.
- **Enrichment pipeline (v2):** ONE gated, ordered, idempotent orchestrator (DISAMBIGUATE→{HyPE∥EXTRACT}→RECONCILE, per-book, DeepSeek) replaces the six retired pollers. State in `doc_pipeline`; code in `api/lib/pipeline/` + `scripts/pipeline/`. Full design: `docs/architecture/unified-enrichment-pipeline.md`.
- Meilisearch + Dropbox + boss vLLM (boss is a separate machine for local LLM inference)
- **Deploy path:** push to GitHub → `siftersearch-updater` polls, pulls, restarts PM2 within ~5 min. No build step; runs raw JS.

**Surface 2: Cloudflare Pages + Workers (frontend / edge)**
- Static Astro build (`output: 'server'`) deployed to Cloudflare Pages at `siftersearch.com`
- SSR layer runs as Cloudflare Workers at the edge (via `@astrojs/cloudflare` adapter)
- Workers fetch dynamic content from `api.siftersearch.com` at request time (Live Content Collections)
- Cloudflare edge cache holds responses per `Cache-Control` headers (typical: `s-maxage=300, stale-while-revalidate=86400`)
- **Deploy path:** `git commit` triggers pre-commit hook → `npm run build` → `wrangler pages deploy ./dist`. Frontend changes ONLY land via this hook.

**Cloudflare's role (no application logic):** edge cache, R2 (object storage for uploads), Tunnel (exposes tower-nas API publicly), DNS.

**The pre-commit hook (`.git/hooks/pre-commit`)** does, in order:
1. lint (`npm run lint`) — fail aborts commit
2. tests (`npm run test`) — fail aborts commit
3. server-imports check
4. version bump (`bump-version.js patch`)
5. build (`npm run build`)
6. Cloudflare Pages deploy (`wrangler pages deploy ./dist`)
- `SKIP_CHECKS=1 git commit` skips steps 1-3 but still builds + deploys (use when lint has pre-existing unrelated errors)
- `git commit --no-verify` skips the ENTIRE hook — frontend changes will NOT reach the live site

**Three deploy paths in practice:**

| Change type | How it ships | Time to live |
|---|---|---|
| API/backend code | regular commit + push → updater pulls | ~5 min |
| Frontend (.astro, .svelte, layouts) | regular commit triggers pre-commit → CF Pages deploy | ~2-3 min after commit |
| DB content (`doc_pages`, conversations, etc.) | admin API PUT (no commit needed) | edge cache TTL (~5 min) |

**Editing site content without deploying code:**
- Docs and conversations live in `doc_pages` and `published_conversations` tables (migration 53)
- Admin CRUD at `/api/v1/admin/pages/:slug` requires `X-Admin-Key: $INTERNAL_API_KEY` header
- Updates take effect within edge-cache TTL — no rebuild, no deploy
- See `docs/content-architecture.md` for the full pattern

**Production server:** `tower-nas` (Dell Xeon 80-core, 188GB RAM) via Tailscale

```bash
# SSH to server
ssh chad@tower-nas

# Application directory
cd ~/sifter/siftersearch

# Deploy updates
git pull && pm2 restart siftersearch-api

# Check logs
pm2 logs siftersearch-api --lines 50 --nostream

# Check all processes
pm2 list
```

**PM2 Process Names (live):**
- `siftersearch-api` - Main API server (read-only DB access)
- `siftersearch-worker` - Unified worker (`unified-worker.js`; single writer + all Meili sync cycles; hosts `/write` :7849)
- `siftersearch-embedding` - Embedding generation + propagation
- `siftersearch-deep-research` - Deep-research worker
- `siftersearch-library-watcher` - Library file watcher + ingest
- `siftersearch-updater` - Auto-update service (won't revive pm2-stopped workers)
- `cloudflared-tunnel` - Cloudflare tunnel

**Retired 2026-07-10 (pm2-stopped; superseded by the unified enrichment pipeline — do not restart):** `siftersearch-enrichment`, `siftersearch-enrichment-api`, `siftersearch-graph-extractor`, `siftersearch-graph-promoter`, `siftersearch-graph-resolver`, `siftersearch-graph-validator`. (`sync-processor.js` is a dead duplicate of `unified-worker.js`; `siftersearch-db` is defined in ecosystem but not running.)

**External Services:**
- `meilisearch` - Runs as systemd user service (not PM2)
- `dropbox` - Runs as systemd user service, syncs to `/tank/dropbox`

**Database:** `~/sifter/siftersearch/data/sifter.db`

**Storage Layout:**
- `/tank/dropbox/` - Dropbox sync (symlinked from `~/Dropbox`), includes Ocean Library
- `/fast/` - NVMe+SSD ZFS pool for indexes and databases
- `/tank/` - 20TB ZFS pool for bulk storage and backups

**AI Server:** `boss` (Strix Halo, 128GB + GPU) — runs vLLM only, accessed via Tailscale

> Full migration guide: [docs/server-migration.md](docs/server-migration.md)
