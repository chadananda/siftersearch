# 3. File Organization

## 1. Overview

SifterSearch follows a simplified architecture with a single SvelteKit application that handles both UI and API routes. The project structure is organized to support this unified approach while maintaining clear separation of concerns.

### Key Principles

1. **Unified Package Management**: A single `package.json` and `node_modules` directory
2. **Single Environment File**: One `.env` file for all configuration
3. **Clear Separation**: UI components, API routes, and services are logically separated
4. **Docker-Based Deployment**: Single container with both SvelteKit and Manticore
5. **Role-Based Access Control**: Authentication at the application level with role-based UI adaptation
6. **Cloudflare Integration**: D1 for content storage and R2 for document storage

---

## 2. Directory Structure

```
/siftersearch/                  # Project root
│
├── src/                        # SvelteKit source directory
│   ├── lib/                    # Shared libraries and components
│   │   ├── components/         # UI components
│   │   │   ├── ui/             # Basic UI elements
│   │   │   ├── layout/         # Layout components
│   │   │   ├── documents/      # Document-related components
│   │   │   └── chat/           # Chat components
│   │   │
│   │   ├── server/             # Server-only code
│   │   │   ├── db/             # Database utilities
│   │   │   ├── manticore/      # Manticore search integration
│   │   │   ├── auth/           # Authentication utilities
│   │   │   └── storage/        # Storage utilities
│   │   │
│   │   ├── stores/             # Svelte stores
│   │   │   ├── theme.js        # Theme store
│   │   │   ├── user.js         # User store
│   │   │   └── documents.js    # Documents store
│   │   │
│   │   └── utils/              # Utility functions
│   │       ├── formatting.js   # Text formatting
│   │       ├── validation.js   # Data validation
│   │       └── helpers.js      # General helpers
│   │
│   ├── routes/                 # SvelteKit routes (both UI and API)
│   │   ├── +layout.svelte      # Root layout (includes navigation based on user role)
│   │   ├── +layout.server.js   # Loads user data for all routes
│   │   ├── +page.svelte        # Home page
│   │   ├── +page.server.js     # Server-side logic for home page
│   │   ├── documents/          # Document management routes
│   │   ├── analytics/          # Analytics dashboard routes
│   │   ├── sites/              # Site management routes
│   │   ├── config/             # Configuration routes
│   │   ├── users/              # User management routes
│   │   └── api/                # API routes
│   │       ├── tools/          # Tool endpoints for LLMs
│   │       ├── content/        # Content management endpoints
│   │       ├── users/          # User management endpoints
│   │       ├── chat/           # Chat endpoints
│   │       └── v1/             # Public API endpoints
│   │
│   ├── app.html                # HTML template
│   ├── app.css                 # Global CSS
│   └── hooks.server.js         # Server hooks for authentication
│
├── static/                     # Static assets
│   ├── favicon.png             # Favicon
│   └── logo.svg                # Logo
│
├── libraries/                  # Database files
│   ├── app.db                  # Application settings
│   ├── library.db              # Document metadata
│   ├── core_content.db         # Core content
│   └── content_blocks.db       # Enhanced markdown blocks (maps to D1)
│
├── scripts/                    # Utility scripts
│   ├── backup.js               # Backup script
│   ├── restore.js              # Restore script
│   ├── deploy.js               # Deployment script
│   ├── deploy-prerequisites.js # Deployment prerequisites
│   ├── init-manticore.js       # Initialize Manticore index
│   ├── test-manticore.js       # Test Manticore connection
│   └── cloudflare-tunnel-config.js # Generate Cloudflare Tunnel config
│
├── docker-compose.yml          # Docker Compose configuration
├── .env.example                # Environment variables template
├── Dockerfile                  # Docker configuration
├── manticore.conf              # Manticore configuration
├── package.json                # Project dependencies and scripts
├── svelte.config.js            # SvelteKit configuration
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind CSS configuration
└── README.md                   # Project documentation
```

---

## 3. Configuration Files

### Docker Configuration

SifterSearch uses Docker for both development and production environments:

- **`docker-compose.yml`**: Defines the services, networks, and volumes for Docker
  - Uses environment variables for flexible configuration
  - Includes profiles for conditional service activation (e.g., Cloudflare Tunnel in production)

- **`Dockerfile`**: Defines the Docker image for the SvelteKit application
  - Single-stage build for simplicity
  - Includes all necessary dependencies

- **`.env.example`**: Template for environment variables
  - Documents all available configuration options
  - Used to create a `.env` file for local development

### SvelteKit Configuration

- **`svelte.config.js`**: Configures SvelteKit
  - Defines adapters (node for development, cloudflare for production)
  - Sets up aliases and other SvelteKit options

- **`vite.config.js`**: Configures Vite
  - Sets up plugins and build options
  - Configures server options

- **`tailwind.config.js`**: Configures Tailwind CSS
  - Defines theme, colors, and plugins
  - Sets up content paths for purging unused CSS

---

## 4. Deployment Scripts

SifterSearch includes several scripts for deployment and maintenance:

- **`scripts/deploy.js`**: Main deployment script
  - Runs deployment prerequisites
  - Generates Cloudflare Tunnel configuration
  - Starts the Docker container with production settings
  - Enables the Cloudflare Tunnel service

- **`scripts/deploy-prerequisites.js`**: Checks prerequisites before deployment
  - Runs tests
  - Builds the application
  - Tests Manticore connection
  - Validates Cloudflare configuration

- **`scripts/test-manticore.js`**: Tests Manticore connectivity
  - Ensures Manticore is running and accessible
  - Verifies search functionality

- **`scripts/init-manticore.js`**: Initializes Manticore index
  - Creates the search index if it doesn't exist
  - Sets up fields and properties

- **`scripts/cloudflare-tunnel-config.js`**: Generates Cloudflare Tunnel configuration
  - Creates the configuration file for Cloudflare Tunnel
  - Sets up routing for the application

- **`scripts/backup.js`**: Creates backups of databases
  - Backs up all database files
  - Uploads backups to Cloudflare R2

- **`scripts/restore.js`**: Restores databases from backups
  - Downloads backups from Cloudflare R2
  - Restores database files

---

## 5. NPM Scripts

The `package.json` file includes several scripts for development, testing, and deployment:

```json
{
  "scripts": {
    "test": "vitest run",
    "dev": "docker-compose up",
    "dev:local": "node scripts/init-manticore.js && vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node build",
    "deploy:prerequisites": "node scripts/deploy-prerequisites.js",
    "deploy": "node scripts/deploy.js",
    "deploy:stop": "NODE_ENV=production docker-compose down",
    "docker:build": "docker-compose build",
    "docker:down": "docker-compose down",
    "docker:clean": "docker-compose down -v && docker system prune -f"
  }
}
```

- **Development Scripts**:
  - `npm run dev`: Start the development environment with Docker
  - `npm run dev:local`: Start only the SvelteKit dev server (requires Manticore to be running separately)
  - `npm run build`: Build the SvelteKit application
  - `npm run preview`: Preview the built application

- **Deployment Scripts**:
  - `npm run deploy:prerequisites`: Run deployment prerequisites
  - `npm run deploy`: Deploy the application
  - `npm run deploy:stop`: Stop the production deployment

- **Docker Scripts**:
  - `npm run docker:build`: Build the Docker containers
  - `npm run docker:down`: Stop the Docker containers
  - `npm run docker:clean`: Clean up Docker resources

- **Testing Scripts**:
  - `npm test`: Run tests

---

## 6. Cloudflare Integration with Wrangler

SifterSearch uses Cloudflare's Wrangler CLI for local development and deployment with Cloudflare services:

### Wrangler Configuration

The project includes Wrangler (already in `package.json` dependencies) for local development with Cloudflare D1 and R2:

1. **`wrangler.toml`**: Configuration file for Wrangler
   ```toml
   name = "siftersearch"
   main = "build/index.js"
   compatibility_date = "2023-01-01"
   
   [[d1_databases]]
   binding = "DB"
   database_name = "siftersearch"
   database_id = "${CLOUDFLARE_D1_DATABASE_ID}"
   
   [[r2_buckets]]
   binding = "STORAGE"
   bucket_name = "${CLOUDFLARE_R2_BUCKET}"
   ```

2. **Local Development with Wrangler**:
   ```bash
   # Login to Cloudflare
   npx wrangler login
   
   # Create a local D1 database for development
   npx wrangler d1 create siftersearch-local
   
   # Create local tables from schema
   npx wrangler d1 execute siftersearch-local --local --file=./schema.sql
   
   # Create a local R2 bucket for development
   npx wrangler r2 bucket create siftersearch-local
   
   # Start local development with Wrangler
   npx wrangler dev --local
   ```

3. **Database Operations**:
   ```bash
   # Execute SQL on local D1 database
   npx wrangler d1 execute siftersearch-local --local --command="SELECT * FROM content_blocks LIMIT 10"
   
   # Import data to local D1 database
   npx wrangler d1 execute siftersearch-local --local --file=./seed-data.sql
   
   # Export schema from local D1 database
   npx wrangler d1 execute siftersearch-local --local --command=".schema" > schema.sql
   ```

4. **R2 Storage Operations**:
   ```bash
   # List objects in local R2 bucket
   npx wrangler r2 object list siftersearch-local --local
   
   # Upload a file to local R2 bucket
   npx wrangler r2 object put siftersearch-local/test.pdf --local --file=./test.pdf
   
   # Download a file from local R2 bucket
   npx wrangler r2 object get siftersearch-local/test.pdf --local > test-downloaded.pdf
   ```

### Integration with SvelteKit

SifterSearch integrates Cloudflare services with SvelteKit through:

1. **Adapter Configuration**:
   - Uses `@sveltejs/adapter-cloudflare` for production
   - Configures bindings for D1 and R2 in `svelte.config.js`

2. **Environment Detection**:
   - Uses environment variables to detect whether to use local or production Cloudflare services
   - Provides fallback to SQLite for local development without Wrangler

3. **Service Abstraction**:
   - Database service that works with both SQLite and D1
   - Storage service that works with both local filesystem and R2
   - Seamless switching between development and production environments

### Development-to-Production Workflow

1. **Local Development**:
   - Use SQLite databases and local filesystem for quick iteration
   - Or use Wrangler for local development with D1 and R2 simulation

2. **Testing with Wrangler**:
   - Test with local Wrangler D1 and R2 to ensure compatibility

3. **Deployment to Cloudflare**:
   - Deploy to Cloudflare Workers with D1 and R2 integration
   - Use Cloudflare Tunnels for secure access

---

## 7. Environment Variables

SifterSearch uses environment variables for configuration. These are defined in the `.env` file (based on `.env.example`):

- **Docker Configuration**:
  - `NODE_ENV`: `development` or `production`
  - `ADAPTER`: `node` or `cloudflare`
  - `APP_PORT`: Port for the SvelteKit application
  - `API_PORT`: Port for the API
  - `MANTICORE_PORT`: Port for Manticore
  - `APP_COMMAND`: Command to run in the app container
  - `RESTART_POLICY`: Container restart policy

- **Cloudflare Configuration** (for production):
  - `CLOUDFLARE_TUNNEL_TOKEN`: Token for Cloudflare Tunnel
  - `CLOUDFLARE_TUNNEL_ID`: ID of the Cloudflare Tunnel
  - `CLOUDFLARE_CREDENTIALS_FILE`: Path to Cloudflare credentials file
  - `CLOUDFLARE_OUTBOUND_NAME`: Name of the Cloudflare outbound rule
  - `CLOUDFLARE_D1_DATABASE_ID`: ID of the Cloudflare D1 database
  - `CLOUDFLARE_R2_BUCKET`: Name of the Cloudflare R2 bucket
  - `CLOUDFLARE_R2_ACCESS_KEY_ID`: Access key for Cloudflare R2
  - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`: Secret key for Cloudflare R2

- **Domain Configuration**:
  - `PUBLIC_DOMAIN`: Public domain for the application

---

## 8. Database Structure

SifterSearch uses SQLite databases locally and Cloudflare D1 in production:

- **`app.db`**: Application settings and analytics
  - User preferences
  - Analytics data
  - System settings

- **`library.db`**: Document metadata
  - Collections
  - Documents
  - Tags
  - Authors

- **`core_content.db`**: Core content
  - Pre-loaded content
  - System templates
  - Default configurations

- **`content_blocks.db`**: Enhanced markdown blocks
  - Maps to Cloudflare D1 in production
  - Stores contextually-upgraded markdown
  - Indexed by Manticore for search

---

## 9. Content Processing Pipeline

SifterSearch implements a sophisticated content processing pipeline:

1. **Document Ingestion**:
   - Original documents (PDF, DOCX, HTML, etc.) are uploaded
   - Files are stored in Cloudflare R2 (or local storage in development)
   - Document metadata is recorded in the library database

2. **Content Extraction**:
   - Text and metadata are extracted using specialized tools
   - Different extractors for different file types (tesseract.js, pdf-lib, mammoth.js)
   - Content is normalized and cleaned

3. **Contextual Enhancement**:
   - Content is converted to enhanced markdown
   - Additional context and metadata are added
   - Content is segmented into logical blocks

4. **Block Storage**:
   - Enhanced markdown blocks are stored in Cloudflare D1
   - Each block has metadata, relationships, and vector embeddings
   - Local development uses SQLite with a similar schema

5. **Search Indexing**:
   - Manticore indexes the text blocks
   - Both vector embeddings and BM25 for hybrid search
   - Configurable weights for different search approaches

This pipeline enables:
- Efficient storage of original documents in R2
- Structured, queryable content in D1
- Powerful hybrid search via Manticore
- Contextual awareness for AI assistants