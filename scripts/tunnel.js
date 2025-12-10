#!/usr/bin/env node
/**
 * Start Cloudflare Tunnel for SifterSearch API
 *
 * Routes api.siftersearch.com -> localhost:3000
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';

const CONFIG_PATH = `${process.env.HOME}/.cloudflared/config-siftersearch.yml`;
const TUNNEL_NAME = 'siftersearch-api';

// Check if config exists
if (!existsSync(CONFIG_PATH)) {
  console.error('❌ Tunnel config not found:', CONFIG_PATH);
  console.error('\nTo set up the tunnel, run:');
  console.error('  cloudflared tunnel login');
  console.error('  cloudflared tunnel create siftersearch-api');
  console.error('  cloudflared tunnel route dns siftersearch-api api.siftersearch.com');
  process.exit(1);
}

console.log('🚇 Starting Cloudflare Tunnel...');
console.log('   Routing: api.siftersearch.com → localhost:3000');

const tunnel = spawn('cloudflared', [
  'tunnel',
  '--config', CONFIG_PATH,
  'run', TUNNEL_NAME
], {
  stdio: 'inherit'
});

tunnel.on('error', (err) => {
  console.error('❌ Failed to start tunnel:', err.message);
  process.exit(1);
});

tunnel.on('close', (code) => {
  console.log(`\n🚇 Tunnel exited with code ${code}`);
  process.exit(code);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping tunnel...');
  tunnel.kill('SIGINT');
});
