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

```bash
# SSH to server
ssh chad@boss

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
- `siftersearch-api` - Main API server
- `siftersearch-jobs` - Background job workers
- `siftersearch-watchdog` - Health monitoring
- `siftersearch-updater` - Auto-update service

**Database:** `~/sifter/siftersearch/data/sifter.db`
