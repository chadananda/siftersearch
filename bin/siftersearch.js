#!/usr/bin/env node
/**
 * SifterSearch CLI Entry Point
 *
 * Usage:
 *   npx siftersearch start     # Start the API server
 *   npx siftersearch dev       # Start in development mode
 *   npx siftersearch migrate   # Run database migrations
 *   npx siftersearch index     # Index the library
 *   npx siftersearch status    # Show PM2 status
 *   npx siftersearch logs      # Show logs
 *   npx siftersearch update    # Check for and apply updates
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const command = process.argv[2] || 'help';
const args = process.argv.slice(3);

/**
 * Run an npm script
 */
function runNpm(script, extraArgs = []) {
  const allArgs = ['run', script, ...extraArgs];
  const result = spawn('npm', allArgs, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true
  });

  result.on('close', (code) => {
    process.exit(code);
  });
}

/**
 * Run a node script directly
 */
function runNode(scriptPath, extraArgs = []) {
  const result = spawn('node', [scriptPath, ...extraArgs], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
  });

  result.on('close', (code) => {
    process.exit(code);
  });
}

/**
 * Run PM2 command
 */
function runPm2(pm2Command, extraArgs = []) {
  const result = spawn('pm2', [pm2Command, ...extraArgs], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true
  });

  result.on('close', (code) => {
    process.exit(code);
  });
}

/**
 * Get version
 */
function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
SifterSearch v${getVersion()} - AI-powered interfaith library search

Usage: siftersearch <command> [options]

Commands:
  start           Start the API server (production mode)
  dev             Start in development mode (API + UI with hot reload)
  stop            Stop all PM2 processes
  restart         Restart the API server
  status          Show PM2 process status
  logs            Show API logs (follow mode)
  migrate         Run database migrations
  index           Index/re-index the library
  update          Check for and apply git updates
  tunnel          Start Cloudflare tunnel
  version, -v     Show version

PM2 Commands:
  pm2:start       Start all services via PM2 (API + Meilisearch + Watchdog)
  pm2:stop        Stop all PM2 services
  pm2:restart     Restart all PM2 services
  pm2:reload      Reload API with zero downtime

Examples:
  siftersearch start            # Start server
  siftersearch dev              # Development mode
  siftersearch pm2:start        # Start with PM2 process manager
  siftersearch logs             # View logs
  siftersearch update --dry-run # Check for updates without applying

For more info: https://siftersearch.com/docs
`);
}

// Command router
switch (command) {
  case 'start':
    runNode(join(PROJECT_ROOT, 'api/index.js'), args);
    break;

  case 'dev':
    runNpm('dev', args);
    break;

  case 'stop':
    runPm2('stop', ['all']);
    break;

  case 'restart':
    runPm2('restart', ['siftersearch-api']);
    break;

  case 'status':
    runPm2('status');
    break;

  case 'logs':
    runPm2('logs', ['siftersearch-api', '--lines', '100']);
    break;

  case 'migrate':
    runNpm('migrate', args);
    break;

  case 'index':
    runNpm('index', args);
    break;

  case 'update':
    runNode(join(PROJECT_ROOT, 'scripts/update-server.js'), args);
    break;

  case 'tunnel':
    runNpm('tunnel', args);
    break;

  case 'pm2:start':
    runPm2('start', [join(PROJECT_ROOT, 'ecosystem.config.js'), '--env', 'production']);
    break;

  case 'pm2:stop':
    runPm2('stop', ['all']);
    break;

  case 'pm2:restart':
    runPm2('restart', ['all']);
    break;

  case 'pm2:reload':
    runPm2('reload', ['siftersearch-api']);
    break;

  case 'version':
  case '-v':
  case '--version':
    console.log(`siftersearch v${getVersion()}`);
    break;

  case 'help':
  case '-h':
  case '--help':
    showHelp();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "siftersearch help" for usage information.');
    process.exit(1);
}
