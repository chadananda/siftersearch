/**
 * Deploy Prerequisites Script
 * Runs all necessary checks before deployment
 */

import { execSync } from 'child_process';
import testManticoreConnection from './test-manticore.js';

async function runDeployPrerequisites() {
  console.log('🔍 Running deployment prerequisites checks...');
  let allPassed = true;
  
  try {
    // 1. Run unit tests
    console.log('\n📋 Running unit tests...');
    execSync('npm test', { stdio: 'inherit' });
    console.log('✅ Unit tests passed');
    
    // 2. Build the application
    console.log('\n🏗️ Building application...');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build successful');
    
    // 3. Test Manticore connection
    console.log('\n🔌 Testing Manticore connection...');
    const manticoreConnected = await testManticoreConnection();
    if (!manticoreConnected) {
      allPassed = false;
      console.error('❌ Manticore connection test failed');
    }
    
    // 4. Validate Cloudflare configuration
    console.log('\n☁️ Validating Cloudflare configuration...');
    if (!process.env.CLOUDFLARE_TUNNEL_TOKEN) {
      console.warn('⚠️ CLOUDFLARE_TUNNEL_TOKEN not set. Cloudflare Tunnel will not work in production.');
      // Not failing the check, just warning
    } else {
      console.log('✅ Cloudflare configuration valid');
    }
    
    // Final result
    if (allPassed) {
      console.log('\n✅ All deployment prerequisites passed!');
      return true;
    } else {
      console.error('\n❌ Some deployment prerequisites failed. See logs above.');
      return false;
    }
  } catch (error) {
    console.error('\n❌ Deploy prerequisites failed:', error.message);
    return false;
  }
}

// Execute if run directly
if (import.meta.url === import.meta.main) {
  const result = await runDeployPrerequisites();
  process.exit(result ? 0 : 1);
}

export default runDeployPrerequisites;
