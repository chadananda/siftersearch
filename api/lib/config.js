/**
 * Configuration System
 *
 * Priority (highest to lowest):
 * 1. Environment variables (.env-secrets)
 * 2. config.yaml overrides
 * 3. .env-public defaults
 *
 * Dev mode (DEV_MODE=true) uses remote AI providers for laptop development.
 * Production mode uses local Ollama by default.
 */

import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get project root (2 levels up from api/lib/config.js)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// Load environment files early - before any config reads
// This ensures env vars are available when this module's top-level code runs
// Load secrets first so they override public defaults
// Use absolute paths to ensure it works from any working directory
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

// Load config.yaml if it exists
function loadConfigYaml() {
  const configPath = join(PROJECT_ROOT, 'config.yaml');
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return parseYaml(content) || {};
    } catch (err) {
      console.warn('Warning: Failed to parse config.yaml:', err.message);
      return {};
    }
  }
  return {};
}

const yamlConfig = loadConfigYaml();

/**
 * Get config value with priority: env > yaml > default
 */
function get(key, defaultValue = undefined) {
  // Check environment first
  if (process.env[key] !== undefined) {
    return process.env[key];
  }

  // Check yaml config (supports nested keys like 'ai.chat.provider')
  const yamlValue = key.split('.').reduce((obj, k) => obj?.[k], yamlConfig);
  if (yamlValue !== undefined) {
    return yamlValue;
  }

  return defaultValue;
}

/**
 * Get boolean config value
 */
function getBool(key, defaultValue = false) {
  const val = get(key);
  if (val === undefined) return defaultValue;
  if (typeof val === 'boolean') return val;
  return val === 'true' || val === '1';
}

/**
 * Get integer config value
 */
function getInt(key, defaultValue = 0) {
  const val = get(key);
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get float config value
 */
function getFloat(key, defaultValue = 0.0) {
  const val = get(key);
  if (val === undefined) return defaultValue;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Computed config values
const isDevMode = getBool('DEV_MODE', true); // Default to dev mode for safety
const isProduction = get('NODE_ENV') === 'production';

// AI Provider configuration
// Dev mode = remote APIs (OpenAI/Anthropic) for laptop development
// Production = local Ollama for cost savings
const aiConfig = {
  // Chat/orchestration provider
  chat: {
    provider: get('CHAT_LLM_PROVIDER', isDevMode ? 'openai' : 'ollama'),
    model: get('CHAT_LLM_MODEL', isDevMode ? 'gpt-4o' : 'qwen2.5:32b'),
    temperature: getFloat('CHAT_LLM_TEMPERATURE', 0.7),
    maxTokens: getInt('CHAT_LLM_MAX_TOKENS', 1000)
  },

  // Search enhancement (query expansion, reranking)
  search: {
    provider: get('SEARCH_LLM_PROVIDER', isDevMode ? 'openai' : 'ollama'),
    model: get('SEARCH_LLM_MODEL', isDevMode ? 'gpt-4o-mini' : 'qwen2.5:14b'),
    temperature: getFloat('SEARCH_LLM_TEMPERATURE', 0.2),
    maxTokens: getInt('SEARCH_LLM_MAX_TOKENS', 500)
  },

  // Document processing (summarization, extraction)
  doc: {
    provider: get('DOC_LLM_PROVIDER', isDevMode ? 'anthropic' : 'ollama'),
    model: get('DOC_LLM_MODEL', isDevMode ? 'claude-3-haiku-20240307' : 'qwen2.5:14b'),
    temperature: getFloat('DOC_LLM_TEMPERATURE', 0.1),
    maxTokens: getInt('DOC_LLM_MAX_TOKENS', 2000)
  },

  // Embeddings (always OpenAI text-embedding-3-large for maximum semantic quality)
  // For a classical religious library, 3072 dimensions capture nuanced spiritual meanings
  embeddings: {
    provider: 'openai',
    model: get('EMBEDDING_MODEL', 'text-embedding-3-large'),
    dimensions: getInt('EMBEDDING_DIMENSIONS', 3072)
  },

  // Provider endpoints
  endpoints: {
    ollama: get('OLLAMA_HOST', 'http://localhost:11434'),
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com'
  }
};

// Database configuration
const dbConfig = {
  url: get('TURSO_DATABASE_URL', 'file:./data/sifter.db'),
  authToken: get('TURSO_AUTH_TOKEN')
};

// Search configuration
// Dev uses port 7701, production uses 7700
const searchConfig = {
  host: get('MEILI_HOST', isDevMode ? 'http://localhost:7701' : 'http://localhost:7700'),
  apiKey: get('MEILISEARCH_KEY') || get('MEILI_MASTER_KEY'),
  maxResults: getInt('SEARCH_MAX_RESULTS', 100),
  snippetSize: getInt('SEARCH_SNIPPET_SIZE', 160),
  timeout: getInt('SEARCH_TIMEOUT_MS', 5000)
};

// Server configuration
const serverConfig = {
  port: getInt('API_PORT', 3000),
  host: get('HOST', '0.0.0.0'),
  frontendUrl: get('APP_URL', 'http://localhost:5173'),
  corsOrigins: get('CORS_ORIGINS', 'http://localhost:5173,http://localhost:4321')
};

// Auth configuration
const authConfig = {
  accessSecret: get('JWT_ACCESS_SECRET'),
  refreshSecret: get('JWT_REFRESH_SECRET'),
  accessExpires: get('JWT_ACCESS_EXPIRES', '15m'),
  refreshExpiresDays: getInt('JWT_REFRESH_EXPIRES_DAYS', 90)
};

// Library paths for indexing
// Dev mode indexes a subset for faster iteration; production indexes full corpus
// Use LIBRARY_PATH env var to override, or defaults based on home directory
const homeDir = process.env.HOME || '/home/chad';
const defaultLibraryBase = `${homeDir}/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library`;

const libraryConfig = {
  // Paths to index - array of directories containing markdown files
  // Structure expected: Religion/Collection/filename.md
  paths: process.env.LIBRARY_PATH
    ? [process.env.LIBRARY_PATH]
    : isDevMode
      ? [
        // Dev: Just a couple collections for testing
        `${defaultLibraryBase}/Baha'i/Core Publications`,
        `${defaultLibraryBase}/Baha'i/Pilgrim Notes`
      ]
      : [
        // Production: Full library
        defaultLibraryBase
      ],
  // Inbox folder for new documents to be processed by Librarian
  inboxPath: process.env.LIBRARY_INBOX_PATH || `${homeDir}/Dropbox/SifterSearch Inbox`
};

// Rate limiting
const rateLimitConfig = {
  enabled: getBool('ENABLE_RATE_LIMITING', true),
  max: getInt('RATE_LIMIT_MAX', 100),
  windowMs: getInt('RATE_LIMIT_WINDOW_MS', 60000),
  byTier: {
    verified: getInt('RATE_LIMIT_VERIFIED', 10),
    approved: getInt('RATE_LIMIT_APPROVED', 60),
    patron: getInt('RATE_LIMIT_PATRON', 100),
    admin: getInt('RATE_LIMIT_ADMIN', 1000)
  }
};

// Public API configuration
// For external applications to access the search API
const publicApiConfig = {
  // Comma-separated list of valid API keys
  // Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  apiKeys: get('PUBLIC_API_KEYS', '').split(',').filter(k => k.length > 0),
  // Rate limit per API key (requests per hour)
  rateLimit: getInt('PUBLIC_API_RATE_LIMIT', 1000),
  // Max results per request
  maxResults: getInt('PUBLIC_API_MAX_RESULTS', 50)
};

export const config = {
  isDevMode,
  isProduction,
  ai: aiConfig,
  db: dbConfig,
  search: searchConfig,
  server: serverConfig,
  auth: authConfig,
  rateLimit: rateLimitConfig,
  library: libraryConfig,
  publicApi: publicApiConfig,
  get,
  getBool,
  getInt,
  getFloat
};

export default config;
