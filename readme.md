# SifterSearch

SifterSearch is a modern document management and search system with powerful RAG (Retrieval-Augmented Generation) capabilities. It provides an intuitive admin interface and robust API for managing document libraries, performing advanced searches, and integrating with AI assistants.

## Reference Documentation:

* **[1. Technology Stack](/instructions/1-technology.md)** - Core technologies and architecture
* **[2. Core Concepts](/instructions/2-concepts.md)** - Key design principles and concepts
* **[3. File Organization](/instructions/3-files.md)** - Project structure and file layout
* **[4. API Organization](/instructions/4-api.md)** - API endpoints and integration
* **[5. SifterChat Web Component](/instructions/5-sifterchat.md)** - Chat interface component
* **[6. Admin UI](/instructions/6-admin-ui.md)** - Admin interface design

**Read all documentation files above** before starting development.

---

## Core Features

SifterSearch provides these essential features:

1. **Intelligent Content Library**: Building and maintaining high-quality document collections across multiple knowledge domains
2. **Research Tool**: Providing advanced search and retrieval capabilities for scholars and researchers
3. **Knowledge Graph**: Visualizing relationships between topics, authors, and concepts
4. **Agent-Friendly API Platform**: Serving as a backend for AI assistants like SifterChat
5. **Content Improvement Environment**: Providing tools for librarians to enhance and organize information

---

## Architecture Overview

SifterSearch uses a simplified, more scalable architecture with the following key components:

1. **Unified Docker Container**: Both Manticore search engine and the SvelteKit application run in a single Docker container
2. **Cloudflare Deployment**: Production hosted on Cloudflare for global distribution and performance
3. **Cloudflare D1 Database**: Primary content store for contextually-upgraded markdown blocks
4. **Cloudflare R2 Storage**: Storage for original documents, media, and backups
5. **Manticore Search Engine**: Hybrid search capabilities with both BM25 and vector search, indexing content from D1
6. **Drizzle ORM**: Database abstraction layer for seamless development-to-production workflow
7. **SvelteKit**: Unified application handling both frontend UI and API routes with role-based access control

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
│  ┌─────────────────────┐    ┌─────────────────────┐    │
│  │                     │    │                     │    │
│  │  Cloudflare D1 DB   │    │  Cloudflare R2      │    │
│  │  (Content Store)    │    │  (File Storage)     │    │
│  │                     │    │                     │    │
│  └─────────────────────┘    └─────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js v18+**
- **Docker** and **Docker Compose**
- **Git**

### Initial Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/siftersearch.git
   cd siftersearch
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file based on the `.env.example` template:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration values
   ```

4. **Start the development environment**:
   ```bash
   # This will start the Docker container with both SvelteKit and Manticore
   npm run dev
   ```

5. **Access the application**:
   - UI: `http://localhost:5173/`
   - API: `http://localhost:3000/api/`
   - Manticore Admin: `http://localhost:9308/`

---

## Development Workflow

### Local Development

The development environment uses Docker to run both SvelteKit and Manticore in a unified container:

```bash
# Start the development environment
npm run dev

# Run only the SvelteKit dev server (requires Manticore to be running separately)
npm run dev:local

# Build the Docker containers without starting them
npm run docker:build

# Stop the development environment
npm run docker:down

# Clean up Docker resources (volumes, networks, etc.)
npm run docker:clean
```

### Cloudflare Development with Wrangler

SifterSearch uses Cloudflare's Wrangler CLI for local development with D1 and R2:

```bash
# Install Wrangler globally (already included as a project dependency)
npm install -g wrangler

# Login to Cloudflare
npx wrangler login

# Create a local D1 database for development
npx wrangler d1 create siftersearch-local

# Create local tables from schema
npx wrangler d1 execute siftersearch-local --local --file=./schema.sql

# Start local development with Wrangler
npx wrangler dev --local

# Simulate R2 storage locally
npx wrangler r2 bucket create siftersearch-local
```

For local development with Cloudflare services:

1. Create a `wrangler.toml` file in the project root:
   ```toml
   name = "siftersearch"
   main = "build/index.js"
   compatibility_date = "2023-01-01"
   
   [[d1_databases]]
   binding = "DB"
   database_name = "siftersearch-local"
   database_id = "local"
   
   [[r2_buckets]]
   binding = "STORAGE"
   bucket_name = "siftersearch-local"
   ```

2. Use environment variables to switch between local SQLite and Cloudflare D1/R2:
   ```
   # In .env for local development with Wrangler
   USE_CLOUDFLARE_LOCAL=true
   ```

3. Update your database and storage services to use the appropriate bindings based on the environment.

### Building and Testing

```bash
# Run tests
npm test

# Build the SvelteKit application
npm run build

# Preview the built application
npm run preview

# Run deployment prerequisites (tests, build, Manticore check)
npm run deploy:prerequisites
```

### Production Deployment

The production deployment uses Cloudflare Tunnels to securely expose the application:

1. **Set up Cloudflare Tunnel**:
   - Create a Cloudflare Tunnel in the Cloudflare Zero Trust dashboard
   - Get your tunnel token and set it as `CLOUDFLARE_TUNNEL_TOKEN` in your environment

2. **Deploy the application**:
   ```bash
   # Run deployment with all prerequisites and Cloudflare Tunnel
   npm run deploy
   
   # Stop the production deployment
   npm run deploy:stop
   ```

The deployment script:
- Runs all prerequisite checks (tests, build, Manticore connection)
- Generates the Cloudflare Tunnel configuration
- Starts the Docker container with production settings
- Enables the Cloudflare Tunnel service for secure access

---

## Docker Configuration

SifterSearch uses a single `docker-compose.yml` file with environment variables to control the configuration for both development and production environments:

### Environment Variables

Key environment variables that control the Docker setup:

- `NODE_ENV`: Set to `development` or `production`
- `ADAPTER`: Set to `node` for development or `cloudflare` for production
- `APP_COMMAND`: The command to run in the app container
- `RESTART_POLICY`: Container restart policy
- `CLOUDFLARE_TUNNEL_TOKEN`: Token for Cloudflare Tunnel (production only)

See `.env.example` for all available configuration options.

---

## Content Processing and Storage

SifterSearch processes documents through a sophisticated pipeline:

1. **Document Ingestion**: Original documents (PDF, DOCX, HTML, etc.) are uploaded and stored in Cloudflare R2
2. **Content Extraction**: Text and metadata are extracted using specialized tools (tesseract.js, pdf-lib, mammoth.js)
3. **Contextual Enhancement**: Content is converted to enhanced markdown with additional context and metadata
4. **Block Storage**: The enhanced markdown blocks are stored in Cloudflare D1 database
5. **Search Indexing**: Manticore indexes the text blocks with both vector embeddings and BM25 for hybrid search

This approach provides:
- Efficient storage of original documents in R2
- Structured, queryable content in D1
- Powerful hybrid search capabilities via Manticore

---

## Database Organization

SifterSearch uses SQLite databases locally and Cloudflare D1 in production:

1. **`app.db`**: Application settings, user preferences, and analytics
2. **`library.db`**: Document metadata, collections, and tags
3. **`core_content.db`**: Core content that ships with the application
4. **`content_blocks.db`**: Enhanced markdown blocks (maps to Cloudflare D1 in production)

---

## Backup and Restore

The project includes scripts for database backup and restoration:

- **`scripts/backup.js`**: Creates backups of all databases and uploads them to Cloudflare R2
- **`scripts/restore.js`**: Restores databases from backups in Cloudflare R2
- **`scripts/deploy.js`**: Handles deployment to production environments

---

## User Roles

SifterSearch implements a role-based access control system:

1. **SuperUser**: Full system access, can manage all libraries and users
2. **Librarian**: Can manage content and users within assigned libraries
3. **Editor**: Can edit and upload content but cannot manage users
4. **AuthUser**: Can view content and use search features
5. **AnonUser**: Limited access to public content only

---

## Search Capabilities

SifterSearch leverages Manticore Search for powerful search capabilities:

- **BM25 Search**: Traditional keyword-based search with configurable weight
- **Vector Search**: Semantic search using embeddings with configurable weight
- **Hybrid Search**: Combines BM25 and vector search for optimal results
- **Multilingual Support**: CJK language handling and stemming for multiple languages

The search system indexes content blocks from Cloudflare D1, providing:
- High-performance full-text search
- Semantic understanding of content
- Precise retrieval of relevant information
- Contextual awareness through metadata

---

## API Integration

The API is organized into several categories:

- **`/api/tools`**: Agentic tool endpoints for LLM usage
- **`/api/content`**: Document editing and content management
- **`/api/users`**: User and role management
- **`/api/chat`**: Chat-related endpoints
- **`/api/v1`**: Public endpoints for external developers

---

## Code Style Guidelines

- Use modern JavaScript ES6 modules
- Keep code horizontal and chainable where possible
- Avoid unnecessary abstraction layers
- Maintain clear documentation with JSDoc comments
- Use descriptive variable names
- Follow the project's directory structure
- Keep error logs, remove working logs
- Use SvelteKit's built-in patterns for routing and API endpoints

---

## Testing

Run tests with:
```bash
npm run test
```

The project uses:
- **Vitest** for unit and integration tests
- **Playwright** for end-to-end testing

---

## Deployment

SifterSearch is designed to be deployed as a Docker container on any platform that supports Docker. For production, we recommend:

1. **Cloudflare D1** for content database
2. **Cloudflare R2** for file storage and backups
3. **Any container hosting service** for the Docker container
4. **Cloudflare Tunnels** for secure access to the application

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.
