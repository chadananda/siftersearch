# SifterSearch API

Fastify-based REST API for the SifterSearch interfaith library search platform.

## Directory Structure

```
api/
├── index.js          # Entry point - env loading, server startup
├── server.js         # Fastify configuration, plugins, route registration
├── agents/           # AI agent implementations (multi-agent system)
├── data/             # Static data files (e.g., religion configs)
├── lib/              # Core libraries and utilities
├── migrations/       # Database migration SQL files
├── routes/           # API route handlers
├── services/         # Business logic and external service integrations
└── workers/          # Background worker processes
```

## Key Files

### index.js
Application entry point. Loads environment variables, validates configuration, starts services (Meilisearch), runs migrations, and launches the Fastify server.

### server.js
Fastify server configuration including:
- CORS with configurable origins
- Cookie handling for refresh tokens
- Rate limiting
- Request/response logging
- Auto-update version checking
- Route registration for all API modules

## Starting the Server

```bash
# Development
npm run dev

# Production
npm start
# or with PM2
pm2 start api/index.js --name siftersearch-api
```

## Environment Variables

See `.env-public` for defaults and `.env-secrets` for sensitive values:

| Variable | Description |
|----------|-------------|
| API_PORT | Server port (default: 3000) |
| JWT_ACCESS_SECRET | Access token signing key |
| JWT_REFRESH_SECRET | Refresh token signing key |
| MEILI_HOST | Meilisearch URL |
| MEILI_MASTER_KEY | Meilisearch admin key |
| DEPLOY_SECRET | Internal API authentication key |

## API Routes

| Prefix | Module | Description |
|--------|--------|-------------|
| /api/auth | auth.js | Login, register, refresh tokens |
| /api/search | search.js | Library search endpoints |
| /api/session | session.js | User session management |
| /api/user | user.js | User profile and settings |
| /api/admin | admin.js | Admin dashboard and server management |
| /api/documents | documents.js | Document retrieval and metadata |
| /api/services | services.js | AI services (TTS, translation) |
| /api/anonymous | anonymous.js | Rate-limited anonymous access |
| /api/librarian | librarian.js | Library management for curators |
| /api/library | library.js | Library browsing and navigation |
| /api/v1 | public-api.js | Public API with key authentication |
| /api/deploy | deploy.js | Deployment webhooks |
| /api/forum | forum.js | Community forum endpoints |
| /api/donations | donations.js | Stripe donation handling |

## Documentation

- [Admin API Reference](../docs/api-admin.md) - Server management endpoints
- [Agent Architecture](../docs/agents/README.md) - Multi-agent AI system
- [AI Services](../docs/ai-services.md) - TTS, translation, embeddings
