#!/usr/bin/env node
/**
 * Systemd Service Setup for SifterSearch
 *
 * This script sets up PM2 to run as a systemd service that starts at boot,
 * BEFORE any user login. This ensures the API is always available.
 *
 * Usage:
 *   npm run setup:systemd          # Interactive setup
 *   npm run setup:systemd -- --yes # Non-interactive (auto-confirm)
 *
 * What it does:
 *   1. Detects the Node.js path (works with mise, nvm, system node)
 *   2. Generates a systemd service file with proper dependencies
 *   3. Installs it to /etc/systemd/system/ (requires sudo)
 *   4. Saves current PM2 process list
 *   5. Enables and starts the service
 *
 * The generated service includes:
 *   - After=network.target local-fs.target (wait for network and filesystems)
 *   - RequiresMountsFor=/home/<user> (ensure home directory is mounted)
 *   - ConditionPathExists (only start if PM2 dump exists)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ANSI colors
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function log(msg) { console.log(msg); }
function success(msg) { console.log(green(`  ${msg}`)); }
function warn(msg) { console.log(yellow(`  ${msg}`)); }
function error(msg) { console.log(red(`  ${msg}`)); }
function info(msg) { console.log(cyan(`  ${msg}`)); }

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
    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      cwd: PROJECT_ROOT
    });
    return { success: true, output: result?.trim() };
  } catch (err) {
    if (throwOnError) throw err;
    return { success: false, error: err.message, output: err.stdout?.trim() };
  }
}

function runSilent(cmd) {
  return run(cmd, { silent: true, throwOnError: false });
}

function getUsername() {
  return process.env.USER || process.env.USERNAME || execSync('whoami', { encoding: 'utf8' }).trim();
}

function getNodePath() {
  // Get the actual node binary path
  const nodePath = process.execPath;
  return nodePath;
}

function getPm2Path() {
  // Find PM2 relative to current node
  const nodeDir = dirname(getNodePath());
  const possiblePaths = [
    `${nodeDir}/../lib/node_modules/pm2/bin/pm2`,
    `${nodeDir}/pm2`,
    `${homedir()}/.local/share/mise/installs/node/*/lib/node_modules/pm2/bin/pm2`,
  ];

  // Try to find PM2 using which
  const result = runSilent('which pm2');
  if (result.success && result.output) {
    // Resolve symlinks to get actual path
    const realPath = runSilent(`realpath ${result.output}`);
    if (realPath.success) return realPath.output;
    return result.output;
  }

  // Check possible paths
  for (const p of possiblePaths) {
    if (existsSync(p)) return p;
  }

  throw new Error('PM2 not found. Please install it: npm install -g pm2');
}

function buildPath() {
  // Build a PATH that includes node's directory
  const nodeDir = dirname(getNodePath());
  const systemPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/bin';
  return `${nodeDir}:${systemPath}`;
}

function generateServiceFile(username, pm2Path, nodePath) {
  const home = homedir();
  const pathEnv = buildPath();

  return `[Unit]
Description=PM2 process manager for SifterSearch
Documentation=https://pm2.keymetrics.io/
After=network.target local-fs.target
RequiresMountsFor=${home}
ConditionPathExists=${home}/.pm2/dump.pm2

[Service]
Type=forking
User=${username}
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=${pathEnv}
Environment=PM2_HOME=${home}/.pm2
Environment=HOME=${home}
PIDFile=${home}/.pm2/pm2.pid
Restart=on-failure
RestartSec=5

ExecStart=${pm2Path} resurrect
ExecReload=${pm2Path} reload all
ExecStop=${pm2Path} kill

[Install]
WantedBy=multi-user.target
`;
}

function checkPm2Running() {
  const result = runSilent('pm2 list');
  return result.success && !result.output?.includes('PM2 daemon not found');
}

function checkExistingService(serviceName) {
  const result = runSilent(`systemctl status ${serviceName}`);
  return result.success || result.output?.includes('Loaded: loaded');
}

async function main() {
  const autoYes = process.argv.includes('--yes') || process.argv.includes('-y');

  log('\n' + '='.repeat(50));
  log(cyan('  SifterSearch Systemd Service Setup'));
  log('='.repeat(50) + '\n');

  // Gather information
  const username = getUsername();
  const home = homedir();
  const serviceName = `pm2-${username}.service`;
  const serviceFile = `/etc/systemd/system/${serviceName}`;

  log(`  Username:     ${cyan(username)}`);
  log(`  Home:         ${cyan(home)}`);
  log(`  Service:      ${cyan(serviceName)}`);
  log('');

  // Check for Node.js
  let nodePath;
  try {
    nodePath = getNodePath();
    success(`Node.js found: ${nodePath}`);
  } catch (err) {
    error('Node.js not found');
    process.exit(1);
  }

  // Check for PM2
  let pm2Path;
  try {
    pm2Path = getPm2Path();
    success(`PM2 found: ${pm2Path}`);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  // Check if PM2 is running with processes
  if (!checkPm2Running()) {
    warn('PM2 is not running or has no processes');
    log('');
    log('  Please start your PM2 processes first:');
    info('  npm run prod:start');
    log('');

    if (!autoYes) {
      const cont = await ask('  Continue anyway? (y/N): ');
      if (cont.toLowerCase() !== 'y') {
        log('\n  Setup cancelled.\n');
        process.exit(0);
      }
    }
  } else {
    success('PM2 is running');
  }

  // Check for existing service
  const hasExisting = checkExistingService(serviceName);
  if (hasExisting) {
    warn(`Existing service found: ${serviceName}`);
    if (!autoYes) {
      const overwrite = await ask('  Overwrite existing service? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        log('\n  Setup cancelled.\n');
        process.exit(0);
      }
    }
  }

  // Generate service file
  log('');
  log(dim('  Generating service file...'));
  const serviceContent = generateServiceFile(username, pm2Path, nodePath);

  // Show what will be installed
  log('');
  log('  Service file contents:');
  log(dim('  ' + '-'.repeat(46)));
  serviceContent.split('\n').forEach(line => {
    log(dim('  ' + line));
  });
  log(dim('  ' + '-'.repeat(46)));
  log('');

  // Confirm installation
  if (!autoYes) {
    const confirm = await ask('  Install this service? (Y/n): ');
    if (confirm.toLowerCase() === 'n') {
      log('\n  Setup cancelled.\n');
      process.exit(0);
    }
  }

  // Write to temp file
  const tempFile = `/tmp/${serviceName}`;
  writeFileSync(tempFile, serviceContent);

  // Install with sudo
  log('');
  log('  Installing service (requires sudo)...');

  try {
    // Stop existing service if running
    run(`sudo systemctl stop ${serviceName} 2>/dev/null || true`, { silent: true });

    // Copy service file
    run(`sudo cp ${tempFile} ${serviceFile}`, { silent: true });
    run(`sudo chmod 644 ${serviceFile}`, { silent: true });

    // Reload systemd
    run('sudo systemctl daemon-reload', { silent: true });
    success('Service file installed');

    // Save PM2 processes
    log('');
    log('  Saving PM2 process list...');
    const saveResult = run('pm2 save', { silent: true, throwOnError: false });
    if (saveResult.success) {
      success('PM2 processes saved');
    } else {
      warn('Could not save PM2 processes (pm2 save failed)');
    }

    // Enable service
    log('');
    log('  Enabling service to start at boot...');
    run(`sudo systemctl enable ${serviceName}`, { silent: true });
    success('Service enabled');

    // Start service (or restart if already running)
    log('');
    log('  Starting service...');
    run(`sudo systemctl restart ${serviceName}`, { silent: true });
    success('Service started');

    // Clean up temp file
    unlinkSync(tempFile);

    // Verify
    log('');
    log('  Verifying...');
    const status = runSilent(`systemctl is-active ${serviceName}`);
    if (status.output === 'active') {
      success('Service is active and running');
    } else {
      warn(`Service status: ${status.output}`);
    }

  } catch (err) {
    error(`Installation failed: ${err.message}`);
    log('');
    log('  You may need to run with sudo or check permissions.');
    process.exit(1);
  }

  // Success message
  log('');
  log('='.repeat(50));
  success('Systemd service setup complete!');
  log('='.repeat(50));
  log('');
  log('  Your PM2 processes will now start automatically at boot,');
  log('  even without logging in.');
  log('');
  log('  Useful commands:');
  info(`  sudo systemctl status ${serviceName}  # Check status`);
  info(`  sudo systemctl restart ${serviceName} # Restart service`);
  info(`  sudo journalctl -u ${serviceName}     # View logs`);
  log('');
  log('  To update after changing ecosystem.config.cjs:');
  info('  pm2 restart all && pm2 save');
  log('');
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
