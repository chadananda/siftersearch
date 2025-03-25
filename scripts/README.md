# SifterSearch Scripts

This directory contains utility scripts for managing and maintaining the SifterSearch application. These scripts have been streamlined to focus on essential functionality, aligning with the project's configuration principles.

## Available Scripts

### `clear-cache.js`

**Purpose**: Utility for clearing build artifacts and cache.

**Features**:
- Removes temporary build files
- Clears application cache
- Helps resolve issues related to stale builds

**Usage**:
```bash
npm run clean:cache
# or directly
node scripts/clear-cache.js
```

### `system-check.js`

**Purpose**: Comprehensive system health check tool.

**Features**:
- Verifies environment variables
- Checks connectivity to Manticore Search
- Validates storage configuration
- Tests database access
- Ensures all required services are running

**Usage**:
```bash
# Basic check
npm run system:check

# Verbose output with detailed information
npm run system:check:verbose

# Attempt to fix common issues
npm run system:check:fix

# Verbose check with automatic fixes
npm run system:check:all

# Or directly
node scripts/system-check.js [--verbose] [--fix]
```

### `deploy.js`

**Purpose**: Simplified deployment utility for SifterSearch.

**Features**:
- Runs the build process to ensure no build errors
- Runs all tests to ensure test coverage
- If everything passes, deploys to the production branch
- Provides clear feedback at each step of the process

**Usage**:
```bash
npm run deploy
# or directly
node scripts/deploy.js
```

## Configuration Principles

The SifterSearch project follows these configuration principles:

1. **Environment-Based Configuration**:
   - `.env-public`: Contains all non-sensitive configuration (checked into git)
   - `.env-secrets`: Contains all sensitive values (not in git)

2. **Unified Configuration Module**:
   - Configuration is centralized in the `/config` directory
   - Clear separation between public and secret values
   - Early detection of missing configuration values

3. **Security Boundaries**:
   - PUBLIC values only have PUBLIC fallbacks
   - SECRETS are never used as fallbacks for PUBLIC values
   - API keys and sensitive information are only in SECRETS

4. **Simplified Docker Setup**:
   - Docker configuration is streamlined
   - Manticore configuration is in the config directory

## Best Practices

1. **Always run system-check.js first** when troubleshooting issues
2. **Use the deploy script** for reliable production deployments
3. **Clear cache** when experiencing unexpected behavior
4. **Follow the configuration principles** when adding new features
