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

2. **Fastify v4+**
   - High-performance web framework
   - Plugin architecture for extensibility
   - Built-in validation and serialization
   - WebSocket support

3. **libSQL/Turso**
   - SQLite-compatible database with vector extensions
   - File-based, easy backup/restore
   - Support for vector similarity search
   - UTF-8 string handling

## Frontend

1. **SvelteKit**
   - Server-side rendering capabilities
   - Built-in development server with hot reloading
   - Routing and form handling
   - Static site generation options

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

1. **Backblaze B2** (Primary)
   - S3-compatible primary storage
   - Cost-effective for active content
   - Used for documents, assets, and current backups

2. **Scaleway Object Storage** (Archival)
   - Lower-cost secondary storage
   - Used for historical backups
   - Longer retention period storage

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

3. **fast-sitemap-parser**
   - Efficient XML sitemap processing
   - Incremental parsing
   - URL extraction

4. **robots-exclusion**
   - Robots.txt parsing and checking
   - Permission verification
   - Crawl delay handling

5. **unified/rehype-remark**
   - HTML to Markdown conversion
   - Content transformation pipeline
   - Plugin ecosystem
   - Unicode preservation

## Language Processing

1. **@xenova/transformers**
   - WASM-powered language models
   - Embedding generation
   - Multilingual support
   - Zero-shot classification

2. **compromise v14**
   - Natural language processing
   - Entity recognition
   - Text normalization
   - Support for multiple languages

3. **Intl.Segmenter**
   - Native text segmentation
   - Language-aware splitting
   - Unicode support
   - Grapheme cluster awareness

4. **bidi-js**
   - Bidirectional text handling for Arabic/Farsi
   - RTL support
   - Direction detection
   - Mirroring capabilities

## Email System

**Mailgun**
   - Email delivery service
   - Unicode email support
   - Template support
   - Delivery tracking
   - Pay-as-you-go pricing

## Utilities

1. **remeda**
   - Functional utilities (modern lodash alternative)
   - Immutable operations
   - Typed interfaces

2. **zod**
   - Schema validation
   - Type inference
   - Custom validators
   - Unicode string validation

3. **@effect/data**
   - Functional error handling
   - Option and Result types
   - Task composition

4. **dotenv-expand**
   - Environment variable management
   - Variable interpolation
   - Configuration by environment

5. **@paralleldrive/cuid2**
   - Collision-resistant ID generation
   - Better than UUID for our purposes
   - Shorter identifiers with high uniqueness

## Testing

1. **vitest**
   - Modern testing framework with ESM support
   - Fast execution
   - Compatible with Jest syntax

2. **supertest**
   - HTTP assertion testing
   - API endpoint validation
   - Response checking

3. **playwright/test**
   - End-to-end testing
   - Browser automation
   - Visual comparison
   - Internationalization testing

## Development and Deployment

### Development Environment

SvelteKit's built-in development server handles frontend development with:
```
npm run dev
```

For backend development, use:
```
npm run server
```

Additional scripts:
```json
"scripts": {
  "dev": "vite dev",
  "server": "node --watch server/index.js",
  "dev:ocean": "cross-env LIBRARY=ocean npm run dev",
  "dev:javascript": "cross-env LIBRARY=javascript npm run dev",
  "build": "vite build",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "deploy": "npm run test && node scripts/deploy.js",
  "backup": "node scripts/backup.js"
}
```

### Deployment Process

Deployment uses a custom script that:
1. Runs all tests to verify build quality
2. Builds optimized assets
3. Connects to production server via SSH
4. Performs a database backup
5. Updates application files
6. Restarts services
7. Verifies deployment success

Credentials are stored in environment variables or a secured `.env.production` file that is not committed to version control.

## Production Infrastructure

1. **DigitalOcean Droplets**
   - NVMe SSD for performance
   - Predictable pricing
   - Straightforward scaling

2. **Nginx**
   - Reverse proxy
   - HTTP/2 support
   - Static file serving
   - Proper UTF-8 configuration

3. **PM2**
   - Process management
   - Auto-restart
   - Load balancing
   - Monitoring

4. **Let's Encrypt**
   - Free SSL certificates
   - Automatic renewal
   - Multiple domain support