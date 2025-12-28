# API Core Libraries

Shared utilities and core functionality for the SifterSearch API.

## Files

### ai.js
Base AI client configuration for OpenAI and Anthropic APIs. Provides unified interface for model access.

### ai-services.js
Higher-level AI service wrappers including:
- Chat completion with streaming
- Text embeddings generation
- Model selection and fallback logic

### anonymous.js
Anonymous user tracking with rate limiting. Manages fingerprint-based session tracking for unauthenticated users.

### auth.js
Authentication and authorization utilities:
- `hashPassword()` / `verifyPassword()` - Bcrypt password handling
- `createAccessToken()` / `verifyAccessToken()` - JWT operations
- `createRefreshToken()` / `verifyRefreshToken()` - Refresh token management
- `authenticate` - Fastify preHandler hook for protected routes
- `optionalAuthenticate` - Sets user if token valid, continues if not
- `requireTier(...tiers)` - Tier-based authorization
- `requireAdmin` - Admin-only routes
- `requireInternal` - Server-to-server auth (X-Internal-Key or admin JWT)
- `seedAdminUser()` - Creates/updates admin from env credentials

### authority.js
Collection authority scoring for search result ranking. Maps religions and collections to authority weights.

### config.js
Centralized configuration using environment variables with defaults. Provides structured access to:
- Server settings (port, cors, rate limiting)
- Database paths
- API keys and secrets
- Feature flags

### db.js
SQLite database client using libsql/turso:
- `query()` - Execute SQL with parameters
- `queryOne()` - Get single row
- `queryAll()` - Get all rows

### env-check.js
Environment validation on startup. Checks for required variables and logs warnings for missing optional ones.

### errors.js
Custom error classes and Fastify error handlers:
- `ApiError` - Base error with status codes
- `errorHandler` - Fastify error handler
- `notFoundHandler` - 404 handler

### logger.js
Pino logger configuration for structured JSON logging.

### migrations.js
Database migration system:
- `runMigrations()` - Apply pending migrations
- Tracks applied migrations in `migrations` table
- Migrations defined in `api/migrations/` folder

### parallel-analyzer.js
Parallel document analysis for search result re-ranking. Batches AI calls for efficiency.

### search-cache.js
In-memory search result caching with TTL expiration.

### search.js
Meilisearch integration:
- Index management (documents, paragraphs)
- Search with faceting and filtering
- Stats and health checks

### services.js
Service lifecycle management for Meilisearch:
- `ensureServicesRunning()` - Start required services
- `cleanupServices()` - Graceful shutdown
- `getServicesStatus()` - Health checks

### storage.js
File storage utilities for user uploads and generated content.
