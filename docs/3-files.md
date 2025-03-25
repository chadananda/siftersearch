# 3. File Organization

## 1. Overview

SifterSearch follows a streamlined architecture with a single SvelteKit application that handles both UI and API routes. The project structure is organized to support this unified approach while maintaining clear separation of concerns.

### Key Principles

1. **Centralized Configuration**: All configuration is centralized in the `/config` directory
2. **Environment-Based Configuration**: 
   - `.env-public` for non-sensitive configuration (checked into git)
   - `.env-secrets` for sensitive values (not in git)
3. **Clear Security Boundaries**: Strict separation between PUBLIC and SECRETS values
4. **Simplified Scripts**: Minimal, focused utility scripts for essential operations
5. **Branch-Based Deployment**: Clean separation between development and production branches
6. **Docker-Based Services**: Containerized services like Manticore with configuration in the config directory
7. **S3-Compatible Storage**: Backblaze B2 for primary storage/CDN and Scaleway for backups/archives

---

## 2. Directory Structure

```
/siftersearch/                  # Project root
│
├── config/                     # Centralized configuration files
│   ├── config.js               # Main configuration module
│   ├── index.js                # Unified export of all configuration
│   ├── auth.js                 # Authentication configuration
│   ├── site.js                 # Site-specific configuration
│   ├── manticore.conf          # Manticore search configuration
│   └── ...                     # Other domain-specific configs
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
├── scripts/                    # Utility scripts
│   ├── clear-cache.js          # Cache clearing utility
│   ├── deploy.js               # Deployment script
│   ├── system-check.js         # System health check tool
│   └── README.md               # Scripts documentation
│
├── docs/                       # Documentation
│   ├── 1-technology.md         # Technology stack documentation
│   ├── 2-concepts.md           # Core concepts documentation
│   ├── 3-files.md              # File organization documentation (this file)
│   └── ...                     # Other documentation
│
├── data/                       # Data storage directory
│
├── .env-public                 # Non-sensitive environment variables (in git)
├── .env-secrets                # Sensitive environment variables (not in git)
├── .env-public.example         # Example public environment variables
├── package.json                # Project dependencies and scripts
├── svelte.config.js            # SvelteKit configuration
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind CSS configuration
└── README.md                   # Project documentation
```

---

## 3. Configuration Approach

### Configuration Philosophy

SifterSearch follows a streamlined configuration pattern with clear separation between:

1. **Environment-Based Configuration**:
   - `.env-public`: Contains all non-sensitive configuration (checked into git)
   - `.env-secrets`: Contains all sensitive values (not in git)
   - Application loads both files (secrets only in development)

2. **Unified Configuration Module**:
   - `config/config.js` dynamically loads and processes all environment variables
   - Exports both `PUBLIC` and `SECRETS` objects
   - No default values for configuration to ensure missing values are detected
   - Provides helper methods like isDev() and isProd()

3. **Security Boundaries**:
   - PUBLIC values only have PUBLIC fallbacks
   - SECRETS are never used as fallbacks for PUBLIC values
   - API keys, tokens, and secrets are only in SECRETS
   - Public keys and non-sensitive URLs are in PUBLIC

4. **Configuration Organization**:
   - `config/index.js` exports a unified configuration object
   - Domain-specific config files for specialized settings
   - Build tool configs moved to config directory

### Environment Variables

The environment variables are strictly separated:

```
# .env-public (checked into git)
PUBLIC_SITE_NAME=SifterSearch
PUBLIC_API_URL=https://api.siftersearch.com
PUBLIC_MANTICORE_URL=http://localhost:9308
PUBLIC_MANTICORE_INDEX=siftersearch

# .env-secrets (not in git)
BACKBLAZE_KEY_ID=your_backblaze_key_id
BACKBLAZE_APP_KEY=your_backblaze_app_key
SCALEWAY_ACCESS_KEY=your_scaleway_access_key
SCALEWAY_SECRET_KEY=your_scaleway_secret_key
AUTH_SECRET=your_auth_secret
```

### Configuration Structure

SifterSearch uses a centralized configuration approach:

- **`config/config.js`**: Main configuration module
  - Dynamically loads environment variables
  - Processes and validates configuration
  - Exports PUBLIC and SECRETS objects

- **`config/index.js`**: Unified export of all configuration
  - Combines all domain-specific configurations
  - Provides a single import point for configuration

- **Domain-specific config files**:
  - `config/auth.js`: Authentication configuration
  - `config/site.js`: Site-specific configuration
  - `config/storage.js`: Storage configuration
  - And others as needed

- **`config/manticore.conf`**: Manticore search configuration
  - Centralized configuration for Manticore search
  - Used by Docker container for Manticore

---

## 4. Deployment Strategy

SifterSearch uses a branch-based deployment strategy:

1. **Development Workflow**:
   - Development work happens on the `main` branch
   - Changes are tested locally before being committed

2. **Deployment Process**:
   ```bash
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

---

## 5. Utility Scripts

SifterSearch includes several utility scripts to help with development and maintenance:

1. **`scripts/clear-cache.js`**: Utility for clearing build artifacts and cache
   ```bash
   npm run clean:cache
   ```

2. **`scripts/system-check.js`**: Comprehensive system health check tool
   ```bash
   npm run system:check
   npm run system:check:verbose  # For detailed output
   npm run system:check:fix      # To attempt fixing issues
   ```

3. **`scripts/deploy.js`**: Simplified deployment script
   ```bash
   npm run deploy
   ```

For more details on these scripts, see the [scripts/README.md](/scripts/README.md) file.