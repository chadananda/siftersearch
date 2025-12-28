# API Routes

Fastify route handlers organized by domain. Each file exports a default async function that registers routes with a Fastify instance.

## Authentication

| File | Prefix | Auth Required | Description |
|------|--------|---------------|-------------|
| auth.js | /api/auth | No | Login, register, password reset, token refresh |
| anonymous.js | /api/anonymous | No | Rate-limited search for unauthenticated users |
| public-api.js | /api/v1 | API Key | Public REST API with key-based auth |

## Core Features

| File | Prefix | Auth Required | Description |
|------|--------|---------------|-------------|
| search.js | /api/search | Yes | Multi-agent search with analysis |
| documents.js | /api/documents | Optional | Document content and metadata |
| library.js | /api/library | Optional | Library browsing and navigation |
| session.js | /api/session | Yes | User session management |
| user.js | /api/user | Yes | Profile, settings, preferences |

## Admin & Management

| File | Prefix | Auth Required | Description |
|------|--------|---------------|-------------|
| admin.js | /api/admin | Admin | Dashboard, user management, server ops |
| librarian.js | /api/librarian | Approved+ | Library curation and ingestion |

## Services

| File | Prefix | Auth Required | Description |
|------|--------|---------------|-------------|
| services.js | /api/services | Yes | TTS, translation, embeddings |
| forum.js | /api/forum | Yes | Community discussions |
| donations.js | /api/donations | No | Stripe payment handling |
| deploy.js | /api/deploy | Secret | Deployment webhooks |

## Route Structure

Each route file follows this pattern:

```javascript
export default async function routeName(fastify) {
  // Optional: Add hooks for all routes in this file
  fastify.addHook('preHandler', authenticate);

  // Register routes
  fastify.get('/endpoint', {
    schema: {
      querystring: {...},
      response: {...}
    }
  }, async (request, reply) => {
    // Handler logic
  });
}
```

## Key Endpoints

### Search
- `POST /api/search` - AI-powered search with agent analysis
- `GET /api/search/quick` - Fast keyword search without AI

### Documents
- `GET /api/documents/:id` - Full document with content
- `GET /api/documents/:id/paragraphs` - Paginated paragraphs

### Library
- `GET /api/library/browse` - Browse library hierarchy
- `GET /api/library/node/:path` - Get specific library node

### Admin
- `GET /api/admin/stats` - Dashboard statistics
- `POST /api/admin/server/reindex` - Trigger library reindex
- `GET /api/admin/server/tasks` - Background task status

See [Admin API Reference](../../docs/api-admin.md) for complete admin documentation.
