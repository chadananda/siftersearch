# SifterSearch API Documentation

This directory contains the SifterSearch API implementation, which provides access to the RAG (Retrieval-Augmented Generation) library management system.

## API Structure

The API is organized into the following sections:

### Public API

These endpoints are accessible with an API key and don't require user authentication:

- `/api/public/v1/search` - Search across document collections
- `/api/health` - API health check endpoint

### Admin API

These endpoints require Clerk authentication and appropriate user roles:

- `/api/keys` - API key management
- `/api/analytics` - Analytics and usage statistics
- `/api/sites` - Site management

## Authentication

### Public API Authentication

Public API endpoints require an API key to be passed in the `x-api-key` header:

```http
GET /api/public/v1/search?q=example
x-api-key: sk_your_api_key_here
```

API keys can be created and managed through the admin interface or via the API key management endpoints.

### Admin API Authentication

Admin API endpoints require Clerk authentication. The authentication token should be passed in the `Authorization` header:

```http
GET /api/keys
Authorization: Bearer your_clerk_token_here
```

## Vector Search

SifterSearch uses libSQL/Turso with vector search capabilities for semantic search. The search API supports both:

1. **Basic text search** - Simple keyword-based search
2. **Vector search** - Semantic search using vector embeddings

## Getting Started

1. Initialize the database:
   ```
   npm run init-db
   ```

2. Generate API documentation:
   ```
   npm run generate-api-docs
   ```

3. Access the API documentation at `/api-docs/`

## Database Structure

The API uses multiple databases:

- `app.db` - Stores user data, API keys, and usage logs
- `library.db` - Stores document metadata and content
- `index_{collection}.db` - Collection-specific databases for vector search

## Creating API Keys

API keys can be created through:

1. The admin interface at `/keys`
2. The API key management endpoint:

```http
POST /api/keys
Content-Type: application/json
Authorization: Bearer your_clerk_token_here

{
  "name": "My API Key",
  "site_id": "site_123"
}
```

## Example Search Query

```http
GET /api/public/v1/search?q=example&limit=10
x-api-key: sk_your_api_key_here
```

For advanced search with vector embeddings:

```http
POST /api/public/v1/search
Content-Type: application/json
x-api-key: sk_your_api_key_here

{
  "vector": [0.1, 0.2, 0.3, ...],
  "filters": {
    "category": "history"
  },
  "limit": 10
}
```
