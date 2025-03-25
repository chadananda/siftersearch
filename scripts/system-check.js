#!/usr/bin/env node

/**
 * SifterSearch - System Check
 * --------------------------
 * 
 * Comprehensive system check that verifies all core components are working correctly:
 * - Environment variables
 * - Persistent storage for Manticore and LibSQL
 * - Manticore Search
 * - API endpoints
 * - Data files
 * 
 * This script is designed to run both in development and production environments
 * to validate system health and diagnose issues. It automatically runs when starting
 * the development environment with `npm run dev` and can be run manually at any time.
 * 
 * Usage:
 *   npm run system:check             - Run system check
 * 
 * Exit Codes:
 *   0 - All systems operational
 *   1 - One or more systems failed
 */

import { ApiClient, IndexApi, SearchApi, UtilsApi } from 'manticoresearch';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@libsql/client';
import { PUBLIC, SECRETS, isDev, isProd } from '../config/config.js';

const IS_DEV = isDev;

// Required environment variables by category with descriptions and source (PUBLIC or SECRETS)
const REQUIRED_ENV_VARS = {
  core: [
    // Add any core PUBLIC variables here if needed
  ],
  auth: [
    { name: 'CLERK_SECRET_KEY', description: 'Secret key for Clerk authentication service', source: 'SECRETS' },
    { name: 'CLERK_PERISHABLE_KEY', description: 'Perishable key for Clerk authentication service', source: 'SECRETS' },
    { name: 'JWT_SECRET', description: 'Secret key for JWT token generation and validation', source: 'SECRETS' }
  ],
  database: [
    { name: 'TURSO_TOKEN', description: 'Authentication token for Turso/LibSQL database', source: 'SECRETS' }
  ],
  public: [
    { name: 'TURSO_DATABASE_URL', description: 'URL for Turso/LibSQL database', source: 'PUBLIC' },
    { name: 'MANTICORE_HOST', description: 'Hostname for Manticore Search', source: 'PUBLIC' },
    { name: 'MANTICORE_HTTP_PORT', description: 'HTTP port for Manticore Search', source: 'PUBLIC' }
  ]
};

// Utility functions for printing
const printInfo = (message) => console.log(`ℹ ${message}`);
const printSuccess = (message) => console.log(`✓ ${chalk.green(message)}`);
const printWarning = (message) => console.log(`⚠ ${chalk.yellow(message)}`);
const printError = (message) => console.log(`✗ ${chalk.red(message)}`);
const printVerbose = (message) => console.log(`  ${message}`);

/**
 * Print a header
 */
function printHeader() {
  console.log('\n═══════════════════════════════════════════');
  console.log(`  SifterSearch System Check (${IS_DEV ? 'development' : 'production'})`);
  console.log('═══════════════════════════════════════════\n');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Environment: ${IS_DEV ? 'development' : 'production'}\n`);
}

/**
 * Print a section header
 */
function printSection(title) {
  console.log(`\n▶ ${title}`);
}

/**
 * Print status
 */
function printStatus(name, ok) {
  if (ok) {
    printSuccess(`${name}: OK`);
  } else {
    printError(`${name}: FAILED`);
  }
}

/**
 * Check if .env-secrets file exists
 */
function checkEnvSecretsFile() {
  const envSecretsPath = path.resolve(process.cwd(), '.env-secrets');
  const envSecretsExamplePath = path.resolve(process.cwd(), '.env-secrets-example');
  
  if (!fs.existsSync(envSecretsPath)) {
    printWarning('.env-secrets file not found');
    
    if (fs.existsSync(envSecretsExamplePath)) {
      printInfo('You need to create a .env-secrets file based on .env-secrets-example');
      printInfo('Run the following command to create it:');
      printInfo(`cp ${envSecretsExamplePath} ${envSecretsPath}`);
      printInfo('Then edit the file to add your actual secret values');
    }
    
    return false;
  }
  
  return true;
}

/**
 * Check environment variables
 */
async function checkEnv() {
  printSection('Checking Environment Variables');
  
  const missingVars = {};
  let allVarsPresent = true;
  
  // Check if .env-secrets file exists in development mode
  if (IS_DEV) {
    const envSecretsExists = checkEnvSecretsFile();
    if (!envSecretsExists) {
      printInfo('This might explain missing secret environment variables');
    }
  }
  
  // Check each category of environment variables
  for (const category in REQUIRED_ENV_VARS) {
    const vars = REQUIRED_ENV_VARS[category];
    if (vars.length === 0) continue;
    
    const missing = vars.filter(varObj => {
      // Check in the appropriate source (PUBLIC or SECRETS)
      const source = varObj.source === 'SECRETS' ? SECRETS : PUBLIC;
      return !source[varObj.name];
    });
    
    if (missing.length > 0) {
      missingVars[category] = missing;
      allVarsPresent = false;
      
      printWarning(`Missing ${category} environment variables:`);
      missing.forEach(varObj => {
        printVerbose(`- ${varObj.name}: ${varObj.description} (from ${varObj.source})`);
      });
    } else {
      printSuccess(`All ${category} environment variables are set`);
    }
  }
  
  // If any variables are missing, print a summary
  if (!allVarsPresent) {
    const totalMissing = Object.values(missingVars).flat().length;
    printError(`Missing ${totalMissing} environment variables`);
    
    if (IS_DEV) {
      printInfo('In development mode, you can create a .env-secrets file with the missing variables');
      printInfo('Example values for missing variables:');
      
      Object.values(missingVars).flat().forEach(varObj => {
        if (varObj.source === 'SECRETS') {
          printVerbose(`${varObj.name}="your-${varObj.name.toLowerCase().replace(/_/g, '-')}-here"`);
        } else {
          printVerbose(`${varObj.name}="default-${varObj.name.toLowerCase().replace(/_/g, '-')}-value"`);
        }
      });
      
      // In development mode, we can continue even with missing environment variables
      return true;
    } else {
      printInfo('Check your .env files and make sure all required variables are set');
      return false;
    }
  }
  
  printSuccess('All required environment variables are set');
  return true;
}

/**
 * Check persistent storage for Manticore and LibSQL
 */
async function checkPersistentStorage() {
  printSection('Checking Persistent Storage');
  
  // Check Manticore data directory
  const manticoreDataDir = path.resolve(process.cwd(), 'data/manticore');
  printInfo(`Checking Manticore data directory: ${manticoreDataDir}`);
  
  try {
    if (!fs.existsSync(manticoreDataDir)) {
      fs.mkdirSync(manticoreDataDir, { recursive: true });
      printSuccess('Created Manticore data directory');
    }
    
    // Check if directory is writable
    fs.accessSync(manticoreDataDir, fs.constants.W_OK);
    printSuccess('Manticore data directory is writable');
  } catch (error) {
    printError(`Manticore data directory is not writable: ${error.message}`);
    printInfo('Try running the following command to fix permissions:');
    printInfo(`mkdir -p ${manticoreDataDir} && chmod 755 ${manticoreDataDir}`);
    return false;
  }
  
  // Check LibSQL data directory
  const libsqlDataDir = path.resolve(process.cwd(), 'data/libsql');
  printInfo(`Checking LibSQL data directory: ${libsqlDataDir}`);
  
  try {
    if (!fs.existsSync(libsqlDataDir)) {
      fs.mkdirSync(libsqlDataDir, { recursive: true });
      printSuccess('Created LibSQL data directory');
    }
    
    // Check if directory is writable
    fs.accessSync(libsqlDataDir, fs.constants.W_OK);
    printSuccess('LibSQL data directory is writable');
  } catch (error) {
    printError(`LibSQL data directory is not writable: ${error.message}`);
    printInfo('Try running the following command to fix permissions:');
    printInfo(`mkdir -p ${libsqlDataDir} && chmod 755 ${libsqlDataDir}`);
    return false;
  }
  
  // Check LibSQL connection
  printInfo('Checking LibSQL connection');
  
  try {
    let client;
    
    // Determine connection method based on environment variables
    const useEmbedded = PUBLIC.LIBSQL_USE_EMBEDDED === 'true';
    
    if (useEmbedded || IS_DEV) {
      const localDbPath = PUBLIC.LIBSQL_LOCAL_PATH || path.resolve(process.cwd(), 'data/libsql/local.db');
      printInfo(`Using local SQLite database at ${localDbPath}`);
      
      // Create an empty database file if it doesn't exist in development mode
      if (!fs.existsSync(localDbPath)) {
        fs.writeFileSync(localDbPath, '');
        printSuccess('Created empty SQLite database file');
      }
      
      client = createClient({
        url: `file:${localDbPath}`
      });
    } else {
      const dbUrl = PUBLIC.TURSO_DATABASE_URL;
      const authToken = SECRETS.TURSO_TOKEN;
      
      if (!dbUrl) {
        printError('TURSO_DATABASE_URL is not set in PUBLIC config');
        return false;
      }
      
      if (!authToken) {
        printError('TURSO_TOKEN is not set in SECRETS config');
        return false;
      }
      
      printInfo(`Connecting to remote LibSQL database at ${dbUrl}`);
      
      client = createClient({
        url: dbUrl,
        authToken: authToken
      });
    }
    
    // Test connection with a simple query
    await client.execute('SELECT 1');
    printSuccess('Successfully connected to LibSQL database');
    
    return true;
  } catch (error) {
    // In development mode, we can continue even if LibSQL connection fails
    if (IS_DEV) {
      printWarning(`LibSQL connection failed: ${error.message}`);
      printInfo('This is acceptable in development mode');
      return true;
    } else {
      printError(`Failed to connect to LibSQL database: ${error.message}`);
      printInfo('Check your database configuration and TURSO_TOKEN');
      return false;
    }
  }
}

/**
 * Check Manticore Search connection
 */
async function checkManticoreSearch() {
  printSection('Checking Manticore Search');
  
  const manticoreHost = PUBLIC.MANTICORE_HOST || 'localhost';
  const manticorePort = PUBLIC.MANTICORE_HTTP_PORT || 9308;
  const manticoreUrl = `http://${manticoreHost}:${manticorePort}`;
  
  printInfo(`Checking Manticore connection at ${manticoreUrl}`);
  
  try {
    // Check if Manticore container is running
    const containerName = IS_DEV ? 'siftersearch-manticore' : 'siftersearch-manticore-production';
    
    try {
      const { stdout } = await execPromise(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`);
      
      if (stdout.trim()) {
        printSuccess('Manticore container is running');
      } else {
        printError('Manticore container is not running');
        
        if (IS_DEV) {
          printInfo('In development mode, run the following command to start Manticore:');
          printInfo('npm run dev');
        } else {
          printInfo('Make sure Manticore is running with the appropriate Docker command');
        }
        
        // In development mode, we can continue even if the Manticore container isn't running yet
        if (IS_DEV) {
          printInfo('In development mode, this will be handled by the dev script');
          return true;
        }
        
        return false;
      }
    } catch (error) {
      printError(`Failed to check Manticore container: ${error.message}`);
      
      // In development mode, we can continue even if we can't check the container
      if (IS_DEV) {
        printInfo('In development mode, this will be handled by the dev script');
        return true;
      }
      
      return false;
    }
    
    // Connect to Manticore API
    try {
      const client = new ApiClient();
      client.basePath = manticoreUrl;
      
      const utilsApi = new UtilsApi(client);
      
      // Check if Manticore API is responsive
      await utilsApi.status();
      printSuccess('Successfully connected to Manticore Search API');
      
      return true;
    } catch (error) {
      // In development mode, we can continue even if Manticore API connection fails
      // as the container might still be starting up
      if (IS_DEV) {
        printWarning(`Manticore API connection failed: ${error.message}`);
        printInfo('The Manticore API may still be starting up');
        printInfo('Wait a few seconds and try again, or continue with development');
        return true;
      } else {
        printError(`Failed to connect to Manticore Search API: ${error.message}`);
        return false;
      }
    }
  } catch (error) {
    printError(`Failed to check Manticore Search: ${error.message}`);
    
    // In development mode, we can continue even if the check fails
    if (IS_DEV) {
      printInfo('In development mode, this will be handled by the dev script');
      return true;
    }
    
    return false;
  }
}

/**
 * Check data files
 */
async function checkDataFiles() {
  printSection('Checking Data Files');
  
  const dataDir = path.resolve(process.cwd(), 'data');
  
  try {
    if (!fs.existsSync(dataDir)) {
      printError(`Data directory does not exist: ${dataDir}`);
      printInfo('Creating data directory...');
      fs.mkdirSync(dataDir, { recursive: true });
      printSuccess('Data directory created');
    }
    
    // Recursively get all files in the data directory
    const getFiles = (dir) => {
      const files = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          files.push(...getFiles(fullPath));
        } else {
          files.push(fullPath);
        }
      }
      
      return files;
    };
    
    const files = getFiles(dataDir);
    
    // Filter out README.md files
    const dataFiles = files.filter(file => !file.endsWith('README.md'));
    
    printSuccess(`Found ${dataFiles.length} files in data directory`);
    
    // Only show file list in development mode
    if (IS_DEV && dataFiles.length > 0) {
      const relativeFiles = dataFiles.map(file => path.relative(dataDir, file));
      printInfo(`Files: ${relativeFiles.join(', ')}`);
    }
    
    return true;
  } catch (error) {
    printError(`Failed to check data files: ${error.message}`);
    return false;
  }
}

/**
 * Check API endpoints
 */
async function checkApiEndpoints() {
  printSection('Checking API Endpoints');
  
  // Get API host and port from environment variables or config
  const apiHost = PUBLIC.API_HOST || 'localhost';
  const apiPort = PUBLIC.API_PORT || 3000;
  const apiUrl = `http://${apiHost}:${apiPort}`;
  
  // Check health endpoint
  const healthUrl = `${apiUrl}/health`;
  printInfo(`Checking Health Check endpoint: ${healthUrl}`);
  
  let healthOk = false;
  
  try {
    const response = await fetch(healthUrl);
    
    if (response.ok) {
      const data = await response.json();
      printSuccess(`Health Check endpoint is responsive: ${JSON.stringify(data)}`);
      healthOk = true;
    } else {
      printError(`Health Check endpoint returned status: ${response.status}`);
    }
  } catch (error) {
    printWarning(`Failed to connect to Health Check endpoint: ${error.message}`);
    
    if (IS_DEV) {
      printInfo('For local development, this is expected if the API server is not running yet');
    }
  }
  
  // Check API status endpoint
  const statusUrl = `${apiUrl}/api/v1/status`;
  printInfo(`Checking API Status endpoint: ${statusUrl}`);
  
  let statusOk = false;
  
  try {
    const response = await fetch(statusUrl);
    
    if (response.ok) {
      const data = await response.json();
      printSuccess(`API Status endpoint is responsive: ${JSON.stringify(data)}`);
      statusOk = true;
    } else {
      printError(`API Status endpoint returned status: ${response.status}`);
    }
  } catch (error) {
    printWarning(`Failed to connect to API Status endpoint: ${error.message}`);
    
    if (IS_DEV) {
      printInfo('For local development, this is expected if the API server is not running yet');
    }
  }
  
  // In development mode, we don't fail the check if the API server isn't running yet
  // since it will be started by the dev script after this check
  if (IS_DEV) {
    return true;
  }
  
  return healthOk || statusOk;
}

/**
 * Main function
 */
async function main() {
  printHeader();
  
  // Run checks sequentially and bail out on first failure
  try {
    // Check environment variables
    if (!await checkEnv()) {
      printError('\n▶ System Check Failed: Environment variables check failed');
      process.exit(1);
    }
    
    // Check persistent storage
    if (!await checkPersistentStorage()) {
      printError('\n▶ System Check Failed: Persistent storage check failed');
      process.exit(1);
    }
    
    // Check Manticore Search
    if (!await checkManticoreSearch()) {
      printError('\n▶ System Check Failed: Manticore Search check failed');
      process.exit(1);
    }
    
    // Check data files
    if (!await checkDataFiles()) {
      printError('\n▶ System Check Failed: Data files check failed');
      process.exit(1);
    }
    
    // Check API endpoints
    if (!await checkApiEndpoints()) {
      printError('\n▶ System Check Failed: API endpoints check failed');
      process.exit(1);
    }
    
    // All checks passed
    printSuccess('\n▶ System Check Passed');
    printInfo('All required systems are operational');
    process.exit(0);
  } catch (error) {
    printError(`\n▶ System Check Failed: Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Error running system check:', error);
  process.exit(1);
});
