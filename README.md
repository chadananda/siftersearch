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

The app is designed to run on a VPS with:
- PM2 for process management
- Cloudflare Pages for static assets
- Cloudflare Tunnel for API exposure

```bash
# Production build
npm run build

# Start with PM2
pm2 start api/index.js --name sifter-api
```

## License

MIT © Chad Jones

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request
