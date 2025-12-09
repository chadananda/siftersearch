#!/usr/bin/env node
/**
 * Development Server Orchestrator
 * Starts Astro dev server and API server concurrently
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-public' });
dotenv.config({ path: '.env-secrets' });

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const COLORS = {
  api: '\x1b[36m', // cyan
  ui: '\x1b[35m',  // magenta
  reset: '\x1b[0m'
};

function prefixOutput(name, color, stream) {
  stream.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      console.log(`${color}[${name}]${COLORS.reset} ${line}`);
    });
  });
}

async function main() {
  console.log('\n🚀 Starting SifterSearch development servers...\n');

  // Run migrations first
  console.log('📦 Running database migrations...');
  const migrate = spawn('node', ['scripts/migrate.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env }
  });

  await new Promise((resolve, reject) => {
    migrate.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Migration failed with code ${code}`));
    });
  });

  console.log('\n');

  // Start API server
  const api = spawn('node', ['--watch', 'api/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: process.env.API_PORT || '3000' }
  });

  prefixOutput('API', COLORS.api, api.stdout);
  prefixOutput('API', COLORS.api, api.stderr);

  // Start Astro dev server
  const ui = spawn('npx', ['astro', 'dev', '--port', process.env.APP_PORT || '4321'], {
    cwd: ROOT,
    env: { ...process.env }
  });

  prefixOutput('UI', COLORS.ui, ui.stdout);
  prefixOutput('UI', COLORS.ui, ui.stderr);

  // Handle process cleanup
  const cleanup = () => {
    console.log('\n\nShutting down...');
    api.kill();
    ui.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Handle child process errors
  api.on('error', (err) => console.error('API error:', err));
  ui.on('error', (err) => console.error('UI error:', err));

  api.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`API exited with code ${code}`);
    }
  });

  ui.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`UI exited with code ${code}`);
    }
  });
}

main().catch(console.error);
