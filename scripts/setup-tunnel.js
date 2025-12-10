#!/usr/bin/env node
/**
 * Cloudflare Tunnel Setup for SifterSearch
 *
 * This script helps set up a Cloudflare Tunnel for the API server.
 * It can be run interactively on a local machine or with a token on a headless server.
 *
 * Usage:
 *   Interactive (local): npm run setup:tunnel
 *   Headless (server):   TUNNEL_TOKEN=<token> npm run setup:tunnel
 *
 * To get a tunnel token for headless deployment:
 * 1. Go to Cloudflare Zero Trust Dashboard
 * 2. Access > Tunnels > Create a tunnel
 * 3. Copy the connector install token
 */

import { spawn, execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { createInterface } from 'readline';

const CLOUDFLARED_DIR = `${homedir()}/.cloudflared`;
const CONFIG_PATH = `${CLOUDFLARED_DIR}/config-siftersearch.yml`;
const TUNNEL_NAME = 'siftersearch-api';
const API_HOSTNAME = 'api.siftersearch.com';

// ANSI colors
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

function log(msg) { console.log(msg); }
function success(msg) { console.log(green(`✅ ${msg}`)); }
function warn(msg) { console.log(yellow(`⚠️  ${msg}`)); }
function error(msg) { console.log(red(`❌ ${msg}`)); }

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function run(cmd, { silent = false, throwOnError = true } = {}) {
  try {
    const result = execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
    return { success: true, output: result };
  } catch (err) {
    if (throwOnError) throw err;
    return { success: false, error: err.message };
  }
}

function checkCloudflared() {
  const result = run('which cloudflared', { silent: true, throwOnError: false });
  return result.success;
}

async function installCloudflared() {
  log('\n📦 Installing cloudflared...\n');

  const platform = process.platform;

  if (platform === 'darwin') {
    run('brew install cloudflared');
  } else if (platform === 'linux') {
    // Check architecture
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
    run(`curl -L ${url} -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared`);
  } else {
    error('Unsupported platform. Please install cloudflared manually:');
    log('https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    process.exit(1);
  }

  success('cloudflared installed');
}

async function setupWithToken(token) {
  log('\n🔐 Setting up tunnel with token (headless mode)...\n');

  // For token-based auth, cloudflared runs as a connector
  // The tunnel config is managed in Cloudflare dashboard
  log('Token-based tunnels are managed via Cloudflare Zero Trust dashboard.');
  log('');
  log('To run the tunnel on this server:');
  log(cyan(`  cloudflared service install ${token}`));
  log('');
  log('Or run manually:');
  log(cyan(`  cloudflared tunnel run --token ${token}`));
  log('');
  log('To set up as a systemd service, the install command above will:');
  log('  1. Install cloudflared as a system service');
  log('  2. Configure it to start on boot');
  log('  3. Manage the connection automatically');

  const installNow = await ask('\nInstall as system service now? (y/N): ');
  if (installNow.toLowerCase() === 'y') {
    run(`sudo cloudflared service install ${token}`);
    success('Tunnel installed as system service');
  }
}

async function setupInteractive() {
  log('\n🔐 Interactive tunnel setup...\n');

  // Ensure cloudflared directory exists
  if (!existsSync(CLOUDFLARED_DIR)) {
    mkdirSync(CLOUDFLARED_DIR, { recursive: true });
  }

  // Check if already authenticated
  const certPath = `${CLOUDFLARED_DIR}/cert.pem`;
  if (!existsSync(certPath)) {
    log('Opening browser for Cloudflare authentication...');
    log('(If browser does not open, copy the URL shown)\n');
    run('cloudflared tunnel login');
    success('Authenticated with Cloudflare');
  } else {
    success('Already authenticated (cert.pem exists)');
  }

  // Check for existing tunnel
  const listResult = run('cloudflared tunnel list 2>&1', { silent: true, throwOnError: false });
  const tunnelExists = listResult.output?.includes(TUNNEL_NAME);

  let tunnelId;
  if (tunnelExists) {
    success(`Tunnel "${TUNNEL_NAME}" already exists`);
    // Extract tunnel ID
    const match = listResult.output.match(new RegExp(`(\\S+)\\s+${TUNNEL_NAME}`));
    tunnelId = match?.[1];
  } else {
    log(`\nCreating tunnel "${TUNNEL_NAME}"...`);
    const createOutput = execSync(`cloudflared tunnel create ${TUNNEL_NAME}`, { encoding: 'utf8' });
    success(`Tunnel "${TUNNEL_NAME}" created`);

    // Extract tunnel ID from output
    const match = createOutput.match(/([a-f0-9-]{36})/);
    tunnelId = match?.[1];
  }

  if (!tunnelId) {
    error('Could not determine tunnel ID');
    process.exit(1);
  }

  log(`\nTunnel ID: ${cyan(tunnelId)}`);

  // Create DNS route
  log(`\nSetting up DNS route for ${API_HOSTNAME}...`);
  const routeResult = run(`cloudflared tunnel route dns ${TUNNEL_NAME} ${API_HOSTNAME}`, { throwOnError: false });

  if (routeResult.success) {
    success(`DNS CNAME added: ${API_HOSTNAME} → tunnel`);
  } else {
    warn('DNS route may already exist (this is fine)');
  }

  // Write config file
  const credentialsFile = `${CLOUDFLARED_DIR}/${tunnelId}.json`;
  const config = `tunnel: ${tunnelId}
credentials-file: ${credentialsFile}

ingress:
  - hostname: ${API_HOSTNAME}
    service: http://localhost:3000
  - service: http_status:404
`;

  writeFileSync(CONFIG_PATH, config);
  success(`Config written to ${CONFIG_PATH}`);

  log('\n' + '='.repeat(50));
  success('Tunnel setup complete!\n');
  log('To start the tunnel:');
  log(cyan('  npm run tunnel'));
  log('');
  log('Or manually:');
  log(cyan(`  cloudflared tunnel --config ${CONFIG_PATH} run ${TUNNEL_NAME}`));
  log('');
  log('The API will be accessible at:');
  log(cyan(`  https://${API_HOSTNAME}`));
}

async function main() {
  log('\n🚇 SifterSearch Cloudflare Tunnel Setup');
  log('='.repeat(40) + '\n');

  // Check if cloudflared is installed
  if (!checkCloudflared()) {
    warn('cloudflared not found');
    const install = await ask('Install cloudflared? (Y/n): ');
    if (install.toLowerCase() !== 'n') {
      await installCloudflared();
    } else {
      error('cloudflared is required. Please install it manually.');
      process.exit(1);
    }
  } else {
    success('cloudflared is installed');
  }

  // Check for token-based setup (headless servers)
  const token = process.env.TUNNEL_TOKEN;

  if (token) {
    await setupWithToken(token);
  } else {
    await setupInteractive();
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
