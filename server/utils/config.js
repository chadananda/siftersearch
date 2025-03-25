/**
 * Configuration Utility
 * 
 * This module provides a unified interface for accessing configuration
 * throughout the application. It loads the appropriate configuration
 * based on the current environment.
 */

import config from '../../config/index.js';

// Export the entire configuration
export default config;

// Helper function to get environment-specific configuration
export function getEnvConfig(envName) {
  const env = envName || process.env.NODE_ENV || 'development';
  return {
    ...config,
    env,
    isDev: env === 'development',
  };
}

// Helper function to validate required configuration
export function validateConfig(requiredKeys = []) {
  const missingKeys = [];
  
  // Check for missing required configuration
  for (const key of requiredKeys) {
    const parts = key.split('.');
    let current = config;
    
    for (const part of parts) {
      if (current && current[part] !== undefined) {
        current = current[part];
      } else {
        missingKeys.push(key);
        break;
      }
    }
    
    // Check if the final value is empty
    if (current === '' || current === null) {
      missingKeys.push(key);
    }
  }
  
  if (missingKeys.length > 0) {
    console.error('❌ Missing required configuration:', missingKeys.join(', '));
    return false;
  }
  
  return true;
}

// Helper function to get a specific configuration value
export function getConfigValue(path, defaultValue = null) {
  const parts = path.split('.');
  let current = config;
  
  for (const part of parts) {
    if (current && current[part] !== undefined) {
      current = current[part];
    } else {
      return defaultValue;
    }
  }
  
  return current !== undefined ? current : defaultValue;
}

// Helper to check if a feature is enabled
export function isFeatureEnabled(featureName) {
  return getConfigValue(`app.features.${featureName}`, false) === true;
}

// Helper to get API configuration
export function getApiConfig() {
  return config.api;
}

// Helper to get storage configuration
export function getStorageConfig() {
  return config.storage;
}

// Helper to get Manticore configuration
export function getManticoreConfig() {
  return config.manticore;
}

// Helper to get authentication configuration
export function getAuthConfig() {
  return config.auth;
}

// Helper to get AI service configuration
export function getAiConfig() {
  return config.ai;
}

// Helper to get database configuration
export function getDbConfig() {
  return config.db;
}
