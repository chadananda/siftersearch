#!/usr/bin/env node

/**
 * SifterSearch - Development Environment Setup
 * -------------------------------------------
 * 
 * This script sets up the development environment for SifterSearch:
 * 1. Sets NODE_ENV to 'dev'
 * 2. Cleans up Docker containers, volumes, and build cache
 * 3. Starts the Manticore Search container
 * 4. Runs system checks to verify all components are working
 * 5. Starts the Vite development server
 * 
 * Usage:
 *   node scripts/dev.js
 */

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

// Set environment variables
process.env.NODE_ENV = 'dev';

// Import configuration after setting NODE_ENV
import { PUBLIC, SECRETS, isDev } from '../config/config.js';

// Configuration
const MANTICORE_HTTP_PORT = PUBLIC.MANTICORE_HTTP_PORT || 9308;
const MANTICORE_SQL_PORT = PUBLIC.MANTICORE_SQL_PORT || 9306;
const MANTICORE_CONTAINER_NAME = 'siftersearch-manticore';
const MANTICORE_IMAGE = 'manticoresearch/manticore:7.4.6';
const MANTICORE_CONFIG_PATH = path.resolve(process.cwd(), 'config/manticore.conf');
const MANTICORE_VOLUME_NAME = 'manticore-data';

// Utility functions for logging
const log = {
  // Only use for critical information, keep to minimum
  info: (message) => console.log(`ℹ ${message}`),
  
  // Success with green checkmark, very compact
  success: (message) => console.log(`${chalk.green('✓')} ${chalk.green(message)}`),
  
  // Warning with yellow triangle
  warning: (message) => console.log(`${chalk.yellow('⚠')} ${chalk.yellow(message)}`),
  
  // Error with red X, very prominent
  error: (message) => console.log(`\n${chalk.red.bold('✗ ERROR:')} ${chalk.red(message)}\n`),
  
  // Section header, minimal
  header: (message) => console.log(`\n${chalk.blue('▶')} ${chalk.bold(message)}`),
  
  // Title for major sections
  title: (message) => console.log(chalk.blue(`\n╔════════════════════════════════════════════╗\n║ ${message} ║\n╚════════════════════════════════════════════╝\n`)),
};

/**
 * Execute a command and return its output
 */
function exec(command, options = {}) {
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    return { success: true, output };
  } catch (error) {
    if (!options.ignoreError) {
      log.error(`Command failed: ${command}`);
      log.error(error.message);
    }
    return { success: false, error };
  }
}

/**
 * Clean up Docker resources
 */
async function cleanDocker() {
  log.header('Cleaning Docker Resources');
  
  // Check if Manticore container is running and stop it
  const containerCheck = exec(`docker ps -a --filter "name=${MANTICORE_CONTAINER_NAME}" --format "{{.Names}}"`, { silent: true });
  if (containerCheck.success && containerCheck.output.trim() === MANTICORE_CONTAINER_NAME) {
    exec(`docker stop ${MANTICORE_CONTAINER_NAME}`, { silent: true });
    exec(`docker rm ${MANTICORE_CONTAINER_NAME}`, { silent: true });
    log.success('Container removed');
  }
  
  // Remove Manticore volume
  exec(`docker volume rm ${MANTICORE_VOLUME_NAME}`, { silent: true, ignoreError: true });
  
  // Clean up Docker resources
  exec('docker system prune -f', { silent: true });
  log.success('Docker cleanup completed');
}

/**
 * Clean build cache
 */
async function cleanCache() {
  log.header('Cleaning Build Cache');
  try {
    exec('node scripts/clear-cache.js');
    log.success('Cache cleanup completed');
  } catch (error) {
    log.error(`Failed to clean cache: ${error.message}`);
  }
}

/**
 * Check Manticore health
 */
async function checkManticoreHealth() {
  try {
    // Use curl to check if Manticore is responding
    const healthCheck = exec(
      `curl -s http://localhost:${MANTICORE_HTTP_PORT}/sql -d 'mode=raw&query=SHOW STATUS'`, 
      { silent: true }
    );
    
    // Check for successful response that includes expected content
    if (healthCheck.success && healthCheck.output.includes('total')) {
      return true;
    }
    
    // If we got a response but not the expected content
    if (healthCheck.success) {
      return false;
    }
    
    return false;
  } catch (error) {
    // Silently fail - this is expected during initialization
    return false;
  }
}

/**
 * Run system checks
 */
async function runSystemCheck() {
  log.header('Running System Checks');
  
  // Check if required files exist
  const requiredFiles = [
    { path: '.env-public', name: 'Public environment variables' },
    { path: 'config/config.js', name: 'Configuration module' },
  ];
  
  let hasErrors = false;
  
  // Check for required files
  for (const file of requiredFiles) {
    if (!fs.existsSync(file.path)) {
      log.error(`Required file not found: ${file.path} (${file.name})`);
      hasErrors = true;
    }
  }
  
  // Check data directory
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // List data files
  const dataFiles = fs.readdirSync(dataDir, { recursive: true });
  log.success(`Data files: ${dataFiles.length} found`);
  
  // Only check API endpoints if explicitly requested
  // We'll skip this in normal startup to avoid errors
  // since the server isn't running yet
  
  if (hasErrors) {
    log.warning('System check found issues that may affect development');
  } else {
    log.success('System check passed');
  }
}

/**
 * Ensure SvelteKit is set up
 */
async function ensureSvelteKitSetup() {
  log.header('Ensuring SvelteKit Setup');
  
  // Check if .svelte-kit directory exists
  const svelteKitDir = path.resolve(process.cwd(), '.svelte-kit');
  
  if (!fs.existsSync(svelteKitDir)) {
    try {
      exec('npx svelte-kit sync');
      log.success('SvelteKit sync completed successfully');
    } catch (error) {
      log.error(`Failed to run svelte-kit sync: ${error.message}`);
      process.exit(1);
    }
  } else {
    log.success('SvelteKit setup is already in place');
  }
}

/**
 * Start Manticore Search container
 */
async function startManticore() {
  log.header('Starting Manticore Search');
  
  // Check if config file exists
  if (!fs.existsSync(MANTICORE_CONFIG_PATH)) {
    log.error(`Manticore config file not found: ${MANTICORE_CONFIG_PATH}`);
    process.exit(1);
  }
  
  // Check if data directory exists and create it if not
  const manticoreDataDir = path.resolve(process.cwd(), 'data/manticore');
  if (!fs.existsSync(manticoreDataDir)) {
    fs.mkdirSync(manticoreDataDir, { recursive: true });
  }
  
  // Start Manticore container
  const command = `docker run -d --name ${MANTICORE_CONTAINER_NAME} \
    -p ${MANTICORE_HTTP_PORT}:9308 \
    -p ${MANTICORE_SQL_PORT}:9306 \
    -v ${MANTICORE_CONFIG_PATH}:/etc/manticoresearch/manticore.conf \
    -v ${MANTICORE_VOLUME_NAME}:/var/lib/manticore \
    ${MANTICORE_IMAGE}`;
  
  const { success, error } = exec(command, { silent: true });
  
  if (!success) {
    log.error(`Failed to start Manticore container: ${error.message}`);
    process.exit(1);
  }
  
  log.success('Manticore container started');
  
  // Wait for Manticore to initialize using polling
  const isReady = await waitForManticore();
  if (isReady) {
    log.success('Manticore search engine initialized successfully');
  }
}

/**
 * Wait for Manticore to be ready with polling
 */
async function waitForManticore(maxAttempts = 20, intervalMs = 1000) {
  // Add initial pause to give Manticore time to initialize
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check Manticore health without verbose logging
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await checkManticoreHealth()) {
      return true;
    }
    
    // Only show warning after several failed attempts
    if (attempt === 5) {
      log.warning('Still waiting for Manticore to initialize...');
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  log.error('Manticore did not become responsive within the timeout period');
  return false;
}

/**
 * Start Vite development server
 */
async function startViteServer() {
  log.header('Starting Vite Development Server');
  
  // Run the Vite development server with SvelteKit
  const viteProcess = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'dev' }
  });
  
  viteProcess.on('error', (error) => {
    log.error(`Failed to start Vite server: ${error.message}`);
    process.exit(1);
  });
  
  // Log success message after a short delay to allow Vite to start
  setTimeout(() => {
    log.success(`Server started at http://localhost:3000`);
  }, 2000);
  
  // Handle process exit
  process.on('SIGINT', () => {
    log.info('Shutting down development environment...');
    viteProcess.kill();
    process.exit(0);
  });
}

/**
 * Main function
 */
async function main() {
  log.title('SifterSearch Development Setup');
  
  try {
    // Clean Docker resources
    await cleanDocker();
    
    // Clean build cache
    await cleanCache();
    
    // Ensure SvelteKit is properly set up
    await ensureSvelteKitSetup();
    
    // Run system checks first to ensure environment is properly configured
    await runSystemCheck();
    
    // Start Manticore Search
    await startManticore();
    
    // Start Vite development server
    await startViteServer();
  } catch (error) {
    log.error(`Development setup failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
