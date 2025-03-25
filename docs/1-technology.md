# 1. Technology Stack

## Code Organization Philosophy

SifterSearch is built as a pure **JavaScript ES6 Module** project (not CommonJS). The codebase follows these principles:

- **Terse, Modern JavaScript**: Leverage ES6+ features including optional chaining, nullish coalescing, array/object destructuring, and modern APIs
- **Horizontal Over Vertical**: Express operations in single lines where possible without sacrificing readability
- **Judicious Method Chaining**: Use fluent interfaces and method chaining when possible
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
- **Docker Containers**: Manticore search engine and SvelteKit application run in separate Docker containers with a docker-compose.yml for production and a small docker-compose.dev.yml with just overrides for development

### Key Components:

1. **SvelteKit** (`/src`)
   - Handles all UI routes
   - Provides API routes under the `/api` prefix
   - Uses adapter-node for production builds
   - Server-side rendering (SSR) for all pages

2. **Manticore Search Engine**
   - Provides both BM25 (keyword-based) and vector search capabilities
   - Runs in its own Docker container
   - Stores index data in a mapped volume for persistence
   - Communicates with the SvelteKit application via HTTP

3. **LibSQL Database**
   - Local read-only copy for development and fast queries
   - Remote write-only source of truth at Turso
   - Stores all content, metadata, and user information
   - Provides SQL interface for complex queries
   - In development, the local copy is read/write whereas in production, writes go straight to Turso and are synchronized back down

4. **S3-Compatible Storage**
   - **Backblaze B2**: (file storage) Primary file storage for both private content and a public CDN
   - **Scaleway**: (archive storage) Secondary storage for backups and archives (cheaper but slower)
     - Stores original documents, media files, and backups
   - Both providers are accessed via standard S3 API

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Environment                     │
│                                                         │
│  ┌─────────────────┐          ┌─────────────────────┐  │
│  │                 │          │                     │  │
│  │  Manticore      │          │  SvelteKit App      │  │
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
│                  External Services                      │
│                                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐    │
│  │                     │    │                     │    │
│  │  LibSQL/Turso       │    │  S3 Storage         │    │
│  │  (Content Store)    │    │  (File Storage)     │    │
│  │                     │    │                     │    │
│  └─────────────────────┘    └─────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Core Technologies

### 1. SvelteKit

SvelteKit is the foundation of the SifterSearch application, providing both the frontend UI and public API functionality.

#### Key Features:
- **Server-side rendering (SSR)** for easier auth management
- **API routes** for private and public API (accepts both JWT and API keys)
- **File-based routing** for simplified navigation
- **Svelte components** for reactive UI elements
- **Adapter-node** for deployment in Docker containers
- **Chat Web-component** Voice-chat component deployed as static JS

### 2. Manticore Search

Manticore Search provides powerful search capabilities with support for combined keyword-based (BM25) and vector-based semantic search.

#### Key Features:
- **Hybrid search** combining BM25 and vector search
- **Real-time indexing** for immediate content availability (via watching for synced changes from Turso, possibly by the app pushing updates to Manticore)
- **HTTP API** for simple integration
- **Configurable relevance scoring** to balance keyword and semantic results
  - _we may add AI relevance sorting in the app layer later_
- **Docker container** for simplified deployment

### 3. LibSQL/Turso

LibSQL provides a local SQLite-compatible database with synchronization to a remote Turso instance for durability and scalability.

#### Key Features:
- **Local read-only copy** for fast queries (13x faster than local Postgres)
- **Remote write-only source of truth** for data durability and versioned backups
- **SQL interface** for complex indexed queries
- **Schema migrations** for version control
- **Lightweight footprint** for efficient resource usage

### 4. S3-Compatible Storage

SifterSearch uses multiple S3-compatible storage providers to optimize for both performance and cost.

#### Key Features:
- **Backblaze B2** for primary file storage and CDN
  - _images served through optimizer/cache service like imgix.net_
  - _later to connect CDN files to global cache provider like cloudflare_
- **Scaleway** for cheaper archival storage
- **Standard S3 API** for compatibility
- **Configurable storage policies** for different content types
- **Backup and restore functionality** for data protection

## Frontend Technologies

1. **Svelte 5**
   - Reactive component framework using Runes syntax
   - Fine-grained reactivity with signals
   - Minimal runtime overhead
   - Excellent TypeScript support

2. **TailwindCSS**
   - Utility-first CSS framework
   - Consistent design system
   - Responsive layouts
   - Dark mode support via derived variables and CSS light-dark() function

3. **Chart.js**
   - Interactive data visualizations
   - Responsive charts
   - Animation support
   - Extensive customization options

4. **Marked**
   - Markdown parsing and rendering
   - Extensible with custom renderers
   - Support for GitHub Flavored Markdown
   - Sanitization for security

5. **KaTeX**
   - Mathematical equation rendering, especially for chat
   - Fast and lightweight
   - Support for LaTeX syntax
   - Server-side rendering compatible

6. **qrcode-svg**
   - QR code generation in SVG format for generated documents
   - Custom styling support
   - Logo integration

## Backend Technologies

1. **Node.js**
   - JavaScript runtime
   - Asynchronous I/O
   - ES modules support
   - Strong ecosystem

2. **Fastify**
   - High-performance web framework
   - Plugin architecture
   - Schema validation
   - Logging and error handling

3. **JWT**
   - Secure authentication
   - Stateless tokens
   - Role-based access control
   - Expiration and refresh mechanisms

4. **AWS SDK for JavaScript**
   - S3 client for storage operations
   - Consistent API across providers
   - Streaming uploads and downloads
   - Retry and error handling

5. **Manticore Search Client**
   - Official client for Manticore Search
   - Query building
   - Index management
   - Connection pooling

6. **LibSQL Client**
   - Read-only database access in production
   - Transaction support for writes in development
   - Prepared statements for simplification of common tasks
   - Connection management to fix or replace missing or broken tables

## Deployment Technologies

1. **Docker**
   - Container runtime
   - Consistent environments
   - Resource isolation
   - Simplified deployment

2. **Docker Compose**
   - Multi-container orchestration
   - Environment variable management
   - Volume mounting
   - Network configuration

3. **DigitalOcean/Vultr**
   - Cloud hosting providers
   - Virtual machines for Docker deployment
   - Managed databases (optional)
   - Global CDN (optional)

4. **Backblaze B2**
   - S3-compatible object storage
   - Cost-effective primary storage
   - CDN integration
   - Lifecycle policies

5. **Scaleway**
   - S3-compatible object storage
   - Low-cost archival storage
   - European data centers
   - Pay-per-use pricing

6. **Turso**
   - Distributed SQLite database
   - Edge-optimized performance
   - Replication and synchronization
   - Backup and restore

## Development Tools

1. **npm**
   - Package management
   - Script running
   - Dependency resolution
   - Version control

2. **Vite**
   - Fast development server
   - Hot module replacement
   - Build optimization
   - Plugin ecosystem

3. **Vitest**
   - Testing framework
   - Fast parallel execution
   - Watch mode
   - Coverage reporting

4. **ESLint**
   - Code linting
   - Style enforcement
   - Error prevention
   - Automatic fixing

5. **Prettier**
   - Code formatting
   - Consistent style
   - Editor integration
   - Pre-commit hooks

6. **Git**
   - Version control
   - Branching and merging
   - Collaboration
   - History tracking