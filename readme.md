# SifterSearch

SifterSearch is a modern document management and search system with powerful RAG (Retrieval-Augmented Generation) capabilities. It provides an intuitive admin interface and robust API for managing document libraries, performing advanced searches, and integrating with AI assistants.

## Reference Documentation:

* **[1. Technology Stack](/docs/1-technology.md)** - Core technologies and architecture
* **[2. Core Concepts](/docs/2-concepts.md)** - Key design principles and concepts
* **[3. File Organization](/docs/3-files.md)** - Project structure and file layout
* **[4. API Organization](/docs/4-api.md)** - API endpoints and integration
* **[5. SifterChat Web Component](/docs/5-sifterchat.md)** - Chat interface component
* **[6. Admin UI](/docs/6-admin-ui.md)** - Admin interface design
* **[7. Containers](/docs/7-containers.md)** - Docker container configuration
* **[8. Storage](/docs/8-storage.md)** - Storage configuration and management

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

1. **SvelteKit Application**: The main application deployed directly to Vultr App Platform
2. **Manticore Search Engine**: Deployed as a standalone Docker container on Vultr for powerful search capabilities
3. **LibSQL Database**: Uses embedded mode for maximum performance with sync to Turso cloud
4. **Dual S3-Compatible Storage**: 
   - **Backblaze B2**: Primary storage for original documents, media, and public content
   - **Scaleway**: Cheaper, slower storage for backups and archives
5. **Imgix**: Image transformation and optimization service connected to S3 storage

This architecture separates the SvelteKit application from containerized services where appropriate, while using embedded mode for LibSQL to maximize performance.

---

## Project Structure

```
siftersearch/
├── config/               # Centralized configuration files
│   ├── config.js         # Main configuration module
│   ├── index.js          # Unified export of all configuration
│   ├── auth.js           # Authentication configuration
│   ├── site.js           # Site-specific configuration
│   ├── manticore.conf    # Manticore search configuration
│   └── ...               # Other domain-specific configs
├── data/                 # Data storage directory
├── docs/                 # Documentation files
├── scripts/              # Utility scripts
│   ├── clear-cache.js    # Cache clearing utility
│   ├── deploy.js         # Deployment script
│   ├── system-check.js   # System health check tool
│   └── README.md         # Scripts documentation
├── src/                  # Source code
│   ├── lib/              # Library code
│   │   ├── api/          # API routes
│   │   ├── components/   # UI components
│   │   ├── db/           # Database access
│   │   ├── search/       # Search functionality
│   │   └── ...
│   ├── routes/           # SvelteKit routes
│   └── ...
├── static/               # Static assets
├── .env-public           # Non-sensitive environment variables (in git)
├── .env-secrets          # Sensitive environment variables (not in git)
├── package.json          # Node.js dependencies
├── svelte.config.js      # SvelteKit configuration
└── vite.config.js        # Vite configuration
```

---

## Configuration Approach

SifterSearch follows a streamlined configuration pattern:

1. **Environment-Based Configuration**:
   - `.env-public`: Contains all non-sensitive configuration (checked into git)
   - `.env-secrets`: Contains all sensitive values (not in git)
   - Application loads both files (secrets only in development)

2. **Unified Configuration Module**:
   - `config/config.js` dynamically loads and processes all environment variables
   - Exports both `PUBLIC` and `SECRETS` objects
   - No default values for configuration to ensure missing values are detected

3. **Security Boundaries**:
   - PUBLIC values only have PUBLIC fallbacks
   - SECRETS are never used as fallbacks for PUBLIC values
   - API keys and sensitive information are only in SECRETS

4. **Configuration Organization**:
   - `config/index.js` exports a unified configuration object
   - Domain-specific config files for specialized settings
   - Build tool configs moved to config directory

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ and npm
- Git

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/siftersearch.git
   cd siftersearch
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   - Copy `.env-public.example` to `.env-public` (if not already present)
   - Create `.env-secrets` with your sensitive configuration values

4. **Start development server**:
   ```bash
   # Start Manticore in Docker and the SvelteKit dev server
   npm run dev
   ```

5. **Run system check**:
   ```bash
   npm run system:check
   ```

### Deployment

SifterSearch uses a branch-based deployment strategy:

1. **Development Workflow**:
   - Development work happens on the `main` branch
   - Changes are tested locally before being committed

2. **Deployment Process**:
   ```bash
   # Run the deployment script
   npm run deploy
   ```

   This script:
   - Builds the application to ensure no build errors
   - Runs all tests to ensure test coverage
   - If everything passes, pushes to the `production` branch
   - Vultr automatically deploys from the `production` branch

3. **System Architecture**:
   - SvelteKit application with embedded LibSQL deployed to Vultr
   - Manticore Search Engine deployed as a Docker container
   - Environment variables configured in Vultr dashboard

This approach ensures that only properly tested code makes it to production, while maintaining a clear separation between development and production environments.

---

## Utility Scripts

SifterSearch includes several utility scripts to help with development and maintenance:

1. **clear-cache.js**: Utility for clearing build artifacts and cache
   ```bash
   npm run clean:cache
   ```

2. **system-check.js**: Comprehensive system health check tool
   ```bash
   npm run system:check
   npm run system:check:verbose  # For detailed output
   npm run system:check:fix      # To attempt fixing issues
   ```

3. **deploy.js**: Simplified deployment script
   ```bash
   npm run deploy
   ```

For more details on these scripts, see the [scripts/README.md](scripts/README.md) file.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
