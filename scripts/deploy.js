/**
 * Deployment Script
 * Handles the production deployment with Cloudflare Tunnel
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import runDeployPrerequisites from './deploy-prerequisites.js';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function deploy() {
  console.log('🚀 Starting deployment process...');
  
  try {
    // 1. Run deployment prerequisites
    console.log('\n🔍 Running deployment prerequisites...');
    const prerequisitesPass = await runDeployPrerequisites();
    if (!prerequisitesPass) {
      throw new Error('Deployment prerequisites failed');
    }
    
    // 2. Generate Cloudflare Tunnel configuration
    console.log('\n☁️ Generating Cloudflare Tunnel configuration...');
    execSync('node scripts/cloudflare-tunnel-config.js', { 
      stdio: 'inherit',
      cwd: rootDir
    });
    
    // 3. Check if Cloudflare Tunnel token is set
    if (!process.env.CLOUDFLARE_TUNNEL_TOKEN) {
      console.error('❌ CLOUDFLARE_TUNNEL_TOKEN environment variable is not set');
      console.error('Please set it before deploying with Cloudflare Tunnel');
      throw new Error('Missing Cloudflare Tunnel token');
    }
    
    // 4. Set production environment variables
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      ADAPTER: 'cloudflare',
      APP_COMMAND: 'npm run start',
      RESTART_POLICY: 'always'
    };
    
    // 5. Build and start the production containers
    console.log('\n🏗️ Building and starting production containers...');
    execSync('docker-compose --profile production up -d --build', {
      stdio: 'inherit',
      cwd: rootDir,
      env
    });
    
    console.log('\n✅ Deployment successful!');
    console.log('Your application is now running with Cloudflare Tunnel');
    
    // 6. Display Cloudflare Tunnel information
    console.log('\n📋 Cloudflare Tunnel Information:');
    console.log('Domain: ' + (process.env.PUBLIC_DOMAIN || 'siftersearch.com'));
    console.log('API Domain: api.' + (process.env.PUBLIC_DOMAIN || 'siftersearch.com'));
    console.log('Manticore Admin: manticore.' + (process.env.PUBLIC_DOMAIN || 'siftersearch.com'));
    
    return true;
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    return false;
  }
}

// Execute if run directly
if (import.meta.url === import.meta.main) {
  const result = await deploy();
  process.exit(result ? 0 : 1);
}

export default deploy;
