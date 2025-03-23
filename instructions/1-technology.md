# 1. Technology Stack

## Code Organization Philosophy

SifterSearch is built as a pure **JavaScript ES6 Module** project (not CommonJS). The codebase follows these principles:

- **Terse, Modern JavaScript**: Leverage ES6+ features including optional chaining, nullish coalescing, array/object destructuring, and modern APIs
- **Horizontal Over Vertical**: Express operations in single lines where possible without sacrificing readability
- **Judicious Method Chaining**: Use fluent interfaces and method chaining when appropriate
- **Minimal Abstraction Layers**: Avoid unnecessary separation of concerns that adds complexity
- **Clear Documentation**: Each function includes JSDoc headers with parameters, return values, and examples
- **Flat Directory Structure**: Minimize nesting and fragmentation of related functionality
- **Self-Documenting Code**: Use descriptive variable names and clear structure over excessive comments

Example coding style:
```javascript
/**
 * Processes document content and extracts key metadata
 * @param {Uint8Array} content - Raw document content
 * @param {Object} options - Processing options
 * @param {boolean} options.extractMetadata - Whether to extract metadata
 * @param {string} options.defaultLanguage - Fallback language if detection fails
 * @returns {Object} Processed document with metadata
 */
export const processDocument = (content, { extractMetadata = true, defaultLanguage = 'en' } = {}) =>
  detectFormat(content)
    .then(format => extractors[format]?.(content) ?? extractors.fallback(content))
    .then(extracted => extractMetadata ? enrichWithMetadata(extracted) : extracted)
    .then(doc => ({ ...doc, language: doc.language ?? detectLanguage(doc.text) ?? defaultLanguage }));
```

## Project Architecture

SifterSearch uses a **simplified architecture** that streamlines development, deployment, and maintenance:

- **Single Package.json**: All dependencies are managed in one root package.json
- **Single Node_modules**: One dependency tree for the entire application
- **Single .env File**: All environment variables are managed in one place
- **Docker Container**: Both Manticore search engine and SvelteKit application run in a single container

### Key Components:

1. **SvelteKit** (`/site`)
   - Handles all UI routes
   - Provides API routes under the `/api` prefix
   - Uses adapter-node for production builds
   - Server-side rendering (SSR) for all pages

2. **Manticore Search Engine**
   - Provides both BM25 (keyword-based) and vector search capabilities
   - Handles document indexing and retrieval
   - Supports multilingual search with proper highlighting
   - Direct integration with Cloudflare R2 for document storage

### Container Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Container                      │
│                                                         │
│  ┌─────────────────┐          ┌─────────────────────┐  │
│  │                 │          │                     │  │
│  │  Manticore      │◄────────►│  SvelteKit          │  │
│  │  Search Engine  │          │  (UI + API)         │  │
│  │                 │          │                     │  │
│  └─────────┬───────┘          └─────────────────────┘  │
│            │                            ▲               │
│            │                            │               │
└────────────┼────────────────────────────┼───────────────┘
             │                            │
             ▼                            ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                  Cloudflare Services                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │  Cloudflare R2 Storage                          │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Development Workflow

- Run `npm run dev` to start the SvelteKit dev server
- Local Manticore instance for development (via Docker)
- SQLite database for local development (compatible with Cloudflare D1)

### Production Deployment

- Docker container with both SvelteKit and Manticore
- Cloudflare R2 for document storage and backups
- Cloudflare D1 (SQLite-compatible) for database
- Local build process for thorough testing before deployment

#### Deployment Steps

```bash
# Build the Docker image locally
docker build -t siftersearch:latest .

# Test locally
docker run -p 3000:3000 -p 9308:9308 siftersearch:latest

# Tag for deployment
docker tag siftersearch:latest registry.cloudflare.com/account-id/siftersearch:latest

# Push to Cloudflare registry
docker push registry.cloudflare.com/account-id/siftersearch:latest
```

This architecture maintains clean separation of concerns while eliminating the complexity of managing multiple services, dependency trees, and environment configurations.

## Unicode and Internationalization

As a multilingual system handling diverse scripts (including Arabic, Farsi, and other RTL languages), SifterSearch:

- Uses **UTF-8 encoding exclusively** for all text storage and processing
- Employs **Unicode-aware text segmentation** via `Intl.Segmenter`
- Implements **bidirectional text handling** with appropriate markup
- Leverages **grapheme cluster** awareness for string operations
- Maintains **normalization forms** consistency (NFC) throughout the pipeline
- Uses **ICU collation** for language-aware sorting and comparison

All Markdown documents and database text fields must maintain strict UTF-8 encoding to ensure consistent handling of all scripts and languages.

## Core Backend

1. **Node.js v20+**
   - Runtime environment using ES modules
   - Leveraging latest JavaScript features and performance improvements
   - Native fetch API for HTTP requests
   - Native `crypto` module for hashing and security

2. **SvelteKit latest (v2.19+)**
   - Server-side rendering capabilities
   - API route handling
   - Built-in development server with hot reloading
   - Form handling and validation
   - Svelte 5+ with Runes syntax

3. **Manticore Search**
   - High-performance search engine
   - Combined BM25 and vector search capabilities
   - Built-in highlighting and relevance scoring
   - Multilingual support

4. **Drizzle ORM**
   - Type-safe database queries
   - SQLite compatibility for local development
   - Seamless integration with Cloudflare D1
   - Migration management

## Frontend

1. **SvelteKit**
   - Server-side rendering capabilities
   - Built-in development server with hot reloading
   - Routing and form handling
   - API route handling

2. **Svelte 5**
   - Using new runes system for state management
   - Fine-grained reactivity model
   - Efficient DOM updates
   - Lightweight bundle size

3. **Tailwind CSS v4**
   - Utility-first CSS framework
   - Container queries and parent selectors
   - RTL support for bidirectional interfaces
   - Consistent design system

4. **D3.js v7**
   - Data visualization library for knowledge graphs
   - Force-directed layouts
   - Interactive visualizations
   - SVG manipulation

5. **CodeMirror 6**
   - Modern text/code editor component
   - RTL and bidirectional text support
   - Markdown editing capabilities
   - Extension system for customization

## Authentication

**Clerk**
   - One-tap social authentication
   - User management across tenants
   - Session handling and security
   - Role-based access control

## Storage

**Cloudflare S3**
   - S3-compatible object storage
   - Cost-effective for documents and assets
   - Used for document storage and backups
   - Direct integration with Manticore

## Document Processing

1. **tesseract.js v4**
   - OCR processing with worker threads
   - Multi-language support with specific training for Arabic/Farsi
   - High accuracy text extraction
   - Unicode-aware output

2. **pdf-lib**
   - Modern PDF manipulation
   - Unicode text support
   - Metadata handling

3. **mammoth.js** (ESM version)
   - DOCX processing and conversion
   - Style preservation
   - Unicode support for international documents

4. **MDsveX**
   - Markdown processor with Svelte integration
   - Frontmatter support
   - Unicode-aware processing

5. **sharp**
   - High-performance image processing
   - Format conversion
   - Optimization

6. **qrcode-svg**
   - QR code generation in SVG format
   - Custom styling support
   - Logo integration

7. **Playwright**
   - Headless browser for PDF generation
   - Screenshot capabilities
   - DOM manipulation
   - Unicode and RTL rendering support

## Website Crawling

1. **Native fetch** (Node.js 18+)
   - HTTP requests with streaming
   - Headers and response handling
   - Modern request management

2. **cheerio v1.0.0-rc.12**
   - Fast HTML parsing
   - jQuery-like syntax
   - DOM traversal
   - Unicode handling

## Deployment

1. **Docker**
   - Containerization of the entire application
   - Includes both Manticore and SvelteKit
   - Consistent environments across development and production

2. **Cloudflare**
   - Global distribution network
   - S3-compatible storage
   - D1 database (SQLite-compatible)
   - Monitoring and logging

Deployment uses a custom script that:
1. Runs all tests to verify build quality
2. Builds the Docker container
3. Deploys to Cloudflare
4. Performs a database backup

## Docker Implementation

The Docker implementation uses a multi-stage build process to create a single container with both Manticore and the SvelteKit application:

```dockerfile
# Base stage with common dependencies
FROM node:18-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build stage for SvelteKit
FROM base AS build
COPY . .
RUN npm run build

# Final stage with Manticore and SvelteKit
FROM manticoresearch/manticore:6.0.4

# Install Node.js
RUN apt-get update && apt-get install -y nodejs npm

# Copy SvelteKit build
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

# Copy Manticore configuration
COPY manticore.conf /etc/manticoresearch/manticore.conf

# Startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000 9308

ENTRYPOINT ["/docker-entrypoint.sh"]
```

The entrypoint script starts both Manticore and the SvelteKit application:

```bash
#!/bin/bash
# Start Manticore in the background
searchd -c /etc/manticoresearch/manticore.conf &

# Start SvelteKit
cd /app && node build/index.js
```

This unified container approach simplifies deployment and ensures consistent behavior across environments.