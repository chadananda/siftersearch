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

### Server Deployment

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

**PM2 Process Names:**
- `siftersearch-api` - Main API server (read-only DB access)
- `siftersearch-worker` - Unified worker (single writer: sync + jobs + indexing)
- `siftersearch-updater` - Auto-update service
- `cloudflared-tunnel` - Cloudflare tunnel

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
