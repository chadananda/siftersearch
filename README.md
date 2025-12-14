# SifterSearch

AI-powered interfaith library search system combining semantic search with traditional keyword search to explore sacred texts and scholarly works.

## Features

- **Hybrid Search** - Meilisearch-powered combination of vector embeddings and keyword search
- **AI-Powered** - Tiered AI providers (Ollama local, OpenAI, Anthropic Claude)
- **Offline-First PWA** - Instant load times with service worker caching
- **Mobile-First** - Responsive design optimized for all devices
- **User Tiers** - Verified, Approved, Patron, Institutional, Admin levels
- **JWT Auth** - Secure authentication with refresh token rotation

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Astro 5 + Svelte 5 |
| Styling | Tailwind CSS 4 |
| Backend | Fastify 5 |
| Database | Turso (libsql) |
| Search | Meilisearch |
| AI | OpenAI, Anthropic, Ollama |
| PWA | @vite-pwa/astro + Workbox |

## Quick Start

```bash
# Install dependencies
npm install

# Create secrets file from template
cp .env-secrets.example .env-secrets
# Edit .env-secrets with your API keys and secrets

# Run database migrations
npm run migrate

# Start development servers
npm run dev
```

The app will be available at:
- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000

## Project Structure

```
siftersearch/
├── api/                  # Fastify backend
│   ├── index.js          # Entry point
│   ├── server.js         # Fastify setup
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── lib/              # Utilities
│   └── workers/          # Background jobs
│
├── src/                  # Astro frontend
│   ├── pages/            # Page routes
│   ├── layouts/          # Layout components
│   ├── components/       # Svelte components
│   ├── styles/           # Global styles
│   └── lib/              # Client utilities
│
├── scripts/              # CLI tools
│   ├── dev.js            # Dev orchestrator
│   └── migrate.js        # DB migrations
│
├── migrations/           # SQL migrations
├── tests/                # Test suites
└── static/               # Static assets
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development servers |
| `npm run dev:api` | API server only (with watch) |
| `npm run dev:ui` | Astro dev server only |
| `npm run build` | Production build |
| `npm run start` | Start production API |
| `npm run test` | Run tests |
| `npm run test:api` | API tests only |
| `npm run test:e2e` | End-to-end tests |
| `npm run migrate` | Run database migrations |
| `npm run migrate:create <name>` | Create new migration |

## Configuration

Configuration uses a layered approach (highest priority first):

1. **`.env-secrets`** - API keys and secrets (gitignored)
2. **`config.yaml`** - Optional overrides (gitignored)
3. **`.env-public`** - Defaults (checked into git)

### Development Mode

By default, `DEV_MODE=true` uses **remote AI APIs** (OpenAI, Anthropic) for laptop development without needing local GPU/Ollama.

For production, set `DEV_MODE=false` to use **local Ollama** for cost savings.

```bash
# .env-public (default)
DEV_MODE=true   # Uses OpenAI/Anthropic APIs

# Production server
DEV_MODE=false  # Uses local Ollama
```

### Secrets (`.env-secrets`)

Copy from `.env-secrets.example`:

```bash
# Required
JWT_ACCESS_SECRET=your-64-char-random-string
JWT_REFRESH_SECRET=another-64-char-random-string

# AI Providers (required for dev mode)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Production database
TURSO_AUTH_TOKEN=your-turso-token
```

### Optional Overrides (`config.yaml`)

Create `config.yaml` to override specific settings:

```yaml
# Override AI providers
ai:
  chat:
    provider: anthropic
    model: claude-sonnet-4-20250514
  search:
    provider: openai
    model: gpt-4o-mini

# Override rate limits
rateLimit:
  verified: 5
  patron: 200
```

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login, get tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Revoke tokens |
| GET | `/api/auth/me` | Get current user |

### Search
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search` | Hybrid search (keyword + semantic) |
| GET | `/api/search/quick?q=` | Fast keyword-only search |
| GET | `/api/search/stats` | Index statistics |
| GET | `/api/search/health` | Search health check |

## User Tiers

| Tier | Description | AI Access |
|------|-------------|-----------|
| verified | Email confirmed | Ollama (local) |
| approved | Admin approved | Ollama (local) |
| patron | Paid supporter | Claude Sonnet |
| institutional | Organization | Claude Sonnet |
| admin | Full access | All providers |

## Development

### Prerequisites
- Node.js 20.3+
- Meilisearch (for search features)
- Ollama (optional, for local AI)

### Database Migrations

```bash
# Run pending migrations
npm run migrate

# Create a new migration
npm run migrate:create add_new_table
```

### Testing

```bash
# Unit and integration tests
npm run test

# API tests only
npm run test:api

# E2E tests with Playwright
npm run test:e2e

# Coverage report
npm run test:coverage
```

## Deployment

### Architecture

| Component | Technology | Description |
|-----------|------------|-------------|
| Client | Cloudflare Pages | Auto-deploys on git commit |
| API | PM2 + Fastify | Self-updating via git polling |
| Search | Meilisearch | Managed by PM2 |
| Database | Turso (libsql) | Managed cloud SQLite |
| Tunnel | Cloudflare Tunnel | Secure API exposure |

### Quick Start (Production)

```bash
# Install globally
npm install -g siftersearch

# Or run directly
npx siftersearch start

# Or with PM2 (recommended)
npx siftersearch pm2:start
```

### CLI Commands

```bash
siftersearch start        # Start API server
siftersearch dev          # Development mode (API + UI)
siftersearch pm2:start    # Start all services via PM2
siftersearch pm2:stop     # Stop all services
siftersearch status       # Show PM2 status
siftersearch logs         # View API logs
siftersearch migrate      # Run database migrations
siftersearch update       # Check for and apply git updates
```

### Full Production Setup

```bash
# 1. Clone repository
git clone https://github.com/chadananda/siftersearch.git
cd siftersearch

# 2. Install dependencies
npm ci

# 3. Configure secrets
cp .env-secrets.example .env-secrets
# Edit with your API keys and secrets

# 4. Run migrations
npm run migrate

# 5. Start all services with PM2
npm run prod:start

# 6. Save PM2 state (auto-restart on reboot)
pm2 save
pm2 startup  # Follow instructions to enable boot startup

# 7. Set up auto-updates (optional)
crontab -e
# Add: */5 * * * * cd /path/to/siftersearch && node scripts/update-server.js >> logs/update.log 2>&1
```

### PM2 Services

The `ecosystem.config.cjs` manages three processes:

| Service | Description |
|---------|-------------|
| `siftersearch-api` | Fastify API server |
| `meilisearch` | Search engine |
| `siftersearch-watchdog` | Health monitor (auto-restarts failed services) |

### npm Scripts

| Script | Description |
|--------|-------------|
| `npm run prod:start` | Start all services with PM2 |
| `npm run prod:stop` | Stop all services |
| `npm run prod:restart` | Restart all services |
| `npm run prod:reload` | Zero-downtime API reload |
| `npm run prod:logs` | View API logs |
| `npm run prod:status` | Show service status |

### Deployment Workflow

1. **Commit code** → Git push to main
2. **Client** → Automatically builds and deploys to Cloudflare Pages
3. **Server** → Auto-updates within 5 minutes (or manually via `siftersearch update`)
4. **Health** → Watchdog monitors and restarts failed services

## License

MIT © Chad Jones

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request
