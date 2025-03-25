#!/usr/bin/env node

/**
 * SifterSearch - Simple Production Deployment Script
 * -------------------------------------------------
 * 
 * This script handles the deployment process to production:
 * 1. Runs the build process to ensure no build errors
 * 2. Runs all tests to ensure test coverage
 * 3. If everything passes, deploys to the production branch
 * 
 * Usage:
 *   npm run deploy
 */

import { execSync } from 'child_process';

console.log('🚀 Starting deployment process...');

try {
  // Step 1: Build the application
  console.log('📦 Building application...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Step 2: Run tests
  console.log('🧪 Running tests...');
  execSync('npm test', { stdio: 'inherit' });
  
  // Step 3: Deploy to production branch
  console.log('🚢 Deploying to production branch...');
  execSync('git push origin HEAD:production -f', { stdio: 'inherit' });
  
  console.log('✅ Deployment successful!');
  console.log('   Vultr should now automatically deploy the changes.');
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
