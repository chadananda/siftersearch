# SifterSearch Scripts

Utility and maintenance scripts for development, deployment, and operations.

## Categories

Scripts are organized into categories based on their usage pattern:

| Category | Description |
|----------|-------------|
| **Development** | Local development tools and testing |
| **Deployment** | Production deployment and updates |
| **Maintenance** | Library indexing and data maintenance |
| **One-time Fixes** | Data migrations and fixes (run once) |
| **Testing** | Automated UI and integration tests |

---

## Development Scripts

### dev.js
Development server orchestrator. Starts all local services with hot reload.

```bash
npm run dev             # Full preflight + start all services
npm run dev -- --quick  # Skip preflight, quick start
```

**Services started:**
- Meilisearch (if not running)
- API server with nodemon
- Astro dev server

### preflight.js
Environment validation before development or deployment. Checks:
- Required tools (meilisearch, node, npm, git)
- Optional tools (ollama, pandoc, tesseract, ffmpeg)
- Environment variables
- Network connectivity
- File system permissions

```bash
node scripts/preflight.js
```

### benchmark-search.js
Search performance testing. Compares different model configurations.

```bash
node scripts/benchmark-search.js
```

### tunnel.js
Cloudflare tunnel management for exposing local dev to internet.

---

## Deployment Scripts

### update-server.js
Auto-update script for production. Pulls from git, runs migrations, reloads PM2.

```bash
node scripts/update-server.js           # Normal update
node scripts/update-server.js --dry-run # Preview changes
node scripts/update-server.js --daemon  # Background mode
```

**Cron usage (every 5 min):**
```cron
*/5 * * * * cd /path/to/siftersearch && node scripts/update-server.js >> logs/update.log 2>&1
```

### setup-systemd.js
Generate systemd service files for production deployment.

### setup-tunnel.js
Configure Cloudflare Tunnel for production.

### deploy-hooks.js
Git hooks for deployment automation.

### install-hooks.js
Install git hooks to local repository.

### watchdog.js
Health monitor that restarts unresponsive services. Runs as PM2 process.

```bash
pm2 start scripts/watchdog.js --name watchdog
```

---

## Maintenance Scripts

### index-library.js
**Primary indexing script.** Indexes library documents to Meilisearch and libsql.

```bash
# Index all documents
node scripts/index-library.js

# Re-index specific religion
node scripts/index-library.js --religion=Bahai

# Force re-index (even unchanged)
node scripts/index-library.js --force --limit=100
```

**API equivalent:** `POST /api/admin/server/reindex`

### fix-rtl-languages.js
Fix RTL language detection (Arabic, Persian, Hebrew, Urdu).

```bash
node scripts/fix-rtl-languages.js
node scripts/fix-rtl-languages.js --dry-run
node scripts/fix-rtl-languages.js --religion=Islam
```

**API equivalent:** `POST /api/admin/server/fix-languages`

### populate-translations.js
Generate English translations for non-English documents using AI.

```bash
node scripts/populate-translations.js --limit=50
node scripts/populate-translations.js --language=ar
node scripts/populate-translations.js --document=specific-id
```

**API equivalent:** `POST /api/admin/server/populate-translations`

### resegment-oversized.js
Re-segment documents with oversized paragraphs for better search chunking.

### sync-library-nodes.js
Sync library hierarchy to database from markdown files.

### migrate.js
Database migration runner.

```bash
npm run migrate                    # Apply pending migrations
npm run migrate create add_column  # Create new migration file
```

**API equivalent:** `POST /api/admin/server/migrate`

### add-authority-to-index.js
Add authority weights to indexed documents for ranking.

### update-ranking-rules.js
Update Meilisearch ranking rules configuration.

---

## One-Time Fix Scripts

These scripts were created to fix specific data issues. Kept for reference.

### fix-bab-author.js
**Purpose:** Fixed "Unknown" author on Bab documents.
**Status:** Applied December 2024.

### fix-collections.js
**Purpose:** Fixed malformed collection values with " > " separators.
**Status:** Applied December 2024.

---

## Backup & Recovery

### backup-meilisearch.sh
Backup Meilisearch data and snapshots.

```bash
./scripts/backup-meilisearch.sh
```

### upgrade-meilisearch.sh
Safely upgrade Meilisearch with backup and restore.

---

## Infrastructure

### add-custom-domain.sh
Add custom domain to Cloudflare Pages.

### fix-dns-records.sh
Fix DNS configuration for custom domains.

---

## Testing Scripts

Visual and integration tests using Playwright.

| Script | Description |
|--------|-------------|
| test-ui.py | Basic UI functionality |
| test-ui-detailed.py | Detailed UI interaction tests |
| test-dark-mode.py | Dark mode toggle and styling |
| test-expand-card.py | Search result card expansion |
| test-mobile.py | Mobile responsiveness |
| test-paper-fix.py | Paper/document styling |
| test-read-more.py | Read more functionality |
| test_library_headers.py | Library header components |

```bash
# Run all tests
npm test

# Run specific test
python scripts/test-ui.py
```

---

## Utility Scripts

### bump-version.js
Bump version in package.json. Used by deployment.

```bash
node scripts/bump-version.js          # Bump patch version
node scripts/bump-version.js minor    # Bump minor version
```

### generate-changelog.js
Generate changelog from git commits.

### generate-logo.js
Generate logo variations.

### check-server-imports.js
Validate server-side imports for bundling.

---

## Hooks Directory

`scripts/hooks/` contains git hooks:

| Hook | Purpose |
|------|---------|
| pre-commit | Run linting and type checks |
| post-merge | Run migrations after pull |

Install with: `node scripts/install-hooks.js`

---

## Environment Variables

Most scripts load environment from project root:
```javascript
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });
```

Key variables:
- `MEILI_HOST` / `MEILI_MASTER_KEY` - Meilisearch connection
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` - Database connection
- `OPENAI_API_KEY` - For translations and embeddings
- `API_PORT` - Server port (default: 3000)
