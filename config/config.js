/**
 * SifterSearch Configuration
 *
 * Centralizes configuration by loading environment variables from appropriate sources:
 * - Public variables from .env-public
 * - Secret variables from .env-secrets (dev) or process.env (production)
 *
 * Maintains clear separation between sensitive and non-sensitive configuration.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Determine environment (production-first approach)
const isDevEnv = process.env.NODE_ENV === 'dev';

/**
 * Load environment variables from a file into a new object
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  try {
    return dotenv.parse(fs.readFileSync(filePath));
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    return {};
  }
}

// Load public variables from .env-public
const publicVarsRaw = loadEnvFile(path.resolve(process.cwd(), '.env-public'));

// Process public variables - add PUBLIC_ prefix for client-side access
const publicVars = {};
Object.entries(publicVarsRaw).forEach(([key, value]) => {
  // Store in publicVars with the original key
  publicVars[key] = value;
  
  // Add to process.env with PUBLIC_ prefix for client-side access
  // Only add the prefix if it doesn't already have it
  const prefixedKey = key.startsWith('PUBLIC_') ? key : `PUBLIC_${key}`;
  process.env[prefixedKey] = value;
});

// Load secret variables from appropriate source based on environment
let secretVars = {};
if (isDevEnv) {
  // In development mode, load from .env-secrets
  const secretsPath = path.resolve(process.cwd(), '.env-secrets');
  secretVars = loadEnvFile(secretsPath);
  
  // Inject secrets into process.env for server-side access
  Object.entries(secretVars).forEach(([key, value]) => {
    process.env[key] = value;
  });
} else {
  // In production, use process.env directly
  secretVars = process.env;
}

// Export PUBLIC and SECRETS directly
export const PUBLIC = {
  IS_DEV: isDevEnv,
  ...publicVars
};

export const SECRETS = process.env; // Always use process.env for SECRETS to ensure consistency

// Helper functions
export const isDev = () => PUBLIC.IS_DEV;
export const isProd = () => !PUBLIC.IS_DEV;
