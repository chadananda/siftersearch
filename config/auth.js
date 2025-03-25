/**
 * Authentication Configuration
 * 
 * This file centralizes all authentication-related configuration.
 * It imports both PUBLIC and SECRETS from the central config module.
 */

import { PUBLIC, SECRETS } from './config.js';

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'production';
const isDev = NODE_ENV === 'development';

// Clerk authentication configuration
const clerkConfig = {
  // Sensitive values from SECRETS only
  secretKey: SECRETS.CLERK_SECRET_KEY,
  perishableKey: SECRETS.CLERK_PERISHABLE_KEY,
  // Non-sensitive value from PUBLIC
  publishableKey: PUBLIC.CLERK_PUBLISHABLE_KEY,
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
  email: SECRETS.ROOT_SUPERUSER_EMAIL,
  password: SECRETS.ROOT_SUPERUSER_PASSWORD,
};

// API key configuration for programmatic access
const apiKeyConfig = {
  // For development testing
  testKey: isDev ? 'test-api-key-for-development' : '',
  // Production keys should be stored in the database
};

// Combined authentication configuration
const authConfig = {
  clerk: clerkConfig,
  jwt: jwtConfig,
  superAdmin: superAdminConfig,
  apiKey: apiKeyConfig,
  isDevelopment: isDev
};

export default authConfig;
