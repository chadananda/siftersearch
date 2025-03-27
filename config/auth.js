/**
 * Authentication Configuration
 * 
 * This file centralizes all authentication-related configuration.
 * It imports both PUBLIC and SECRETS from the central config module.
 */

import { PUBLIC, SECRETS } from './config.js';

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'production';
const isDev = NODE_ENV === 'dev';
const isProd = !isDev;

// Clerk authentication configuration
const clerkConfig = {
  // Sensitive values from SECRETS only
  secretKey: SECRETS.CLERK_SECRET_KEY,
  perishableKey: SECRETS.CLERK_PERISHABLE_KEY,
  // Non-sensitive value from PUBLIC
  // The PUBLIC_ prefix is already added by config.js for client-side variables
  publishableKey: PUBLIC.CLERK_PUBLISHABLE_KEY || PUBLIC.PUBLIC_CLERK_PUBLISHABLE_KEY,
};

// JWT configuration
const jwtConfig = {
  // Sensitive value from SECRETS only
  secret: SECRETS.JWT_SECRET,
  // Non-sensitive values from PUBLIC
  expiresIn: PUBLIC.JWT_EXPIRES_IN || '7d',
  algorithm: PUBLIC.JWT_ALGORITHM || 'HS256',
};

// SuperAdmin user configuration (all sensitive from SECRETS)
const superAdminConfig = {
  username: SECRETS.SUPERADMIN_USERNAME,
  password: SECRETS.SUPERADMIN_PASSWORD,
};

// API key configuration for programmatic access
const apiKeyConfig = {
  // Sensitive values from SECRETS
  secret: SECRETS.API_KEY_SECRET,
  // Non-sensitive values from PUBLIC
  expiresIn: PUBLIC.API_KEY_EXPIRES_IN || '30d',
};

// Combined auth configuration
const authConfig = {
  clerk: clerkConfig,
  jwt: jwtConfig,
  superAdmin: superAdminConfig,
  apiKey: apiKeyConfig,
  isDevelopment: isDev
};

export {
  clerkConfig,
  jwtConfig,
  superAdminConfig,
  apiKeyConfig,
  isDev,
  isProd,
  authConfig
};

export default authConfig;
