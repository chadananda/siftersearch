#!/usr/bin/env node
/**
 * SifterSearch Preflight Check
 *
 * Validates the complete production environment:
 * - Required system tools (meilisearch, node, npm, git)
 * - Optional tools (ollama, pandoc, tesseract, ffmpeg, poppler)
 * - Environment variables (.env-secrets, .env-public)
 * - Network connectivity (Meilisearch, Turso, APIs)
 * - File system permissions (data dirs, logs)
 *
 * Run: node scripts/preflight.js
 * Or:  npx siftersearch preflight
 */

import { execSync, spawn } from 'child_process';
import { existsSync, accessSync, constants, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load environment files
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

// ANSI colors
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

// Track results
const results = {
  passed: [],
  warnings: [],
  failed: [],
  skipped: [],
  instructions: []
};

// Detect platform
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const platform = isMac ? 'mac' : 'arch'; // Default to arch for Linux

// Installation instructions for Mac (Homebrew) and Arch Linux
const INSTALL_INSTRUCTIONS = {
  // System tools
  'node': {
    mac: 'brew install node',
    arch: 'sudo pacman -S nodejs npm',
    note: 'Or use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && nvm install 20'
  },
  'npm': {
    mac: 'brew install node',
    arch: 'sudo pacman -S npm',
    note: 'Included with nodejs package'
  },
  'git': {
    mac: 'brew install git',
    arch: 'sudo pacman -S git'
  },
  'meilisearch': {
    mac: 'brew install meilisearch',
    arch: 'yay -S meilisearch-bin',
    note: 'Or download from https://github.com/meilisearch/meilisearch/releases'
  },
  'ollama': {
    mac: 'brew install ollama && brew services start ollama',
    arch: 'yay -S ollama-bin',
    note: 'Mac: ollama serve (or brew services). Linux: systemctl --user enable --now ollama'
  },
  'pandoc': {
    mac: 'brew install pandoc',
    arch: 'sudo pacman -S pandoc'
  },
  'tesseract': {
    mac: 'brew install tesseract tesseract-lang',
    arch: 'sudo pacman -S tesseract tesseract-data-eng',
    note: 'Mac includes all languages. Arch: add tesseract-data-ara, tesseract-data-fas, etc.'
  },
  'ffmpeg': {
    mac: 'brew install ffmpeg',
    arch: 'sudo pacman -S ffmpeg'
  },
  'pdftotext': {
    mac: 'brew install poppler',
    arch: 'sudo pacman -S poppler',
    note: 'Provides pdftotext, pdfinfo, pdfimages'
  },
  'pm2': {
    mac: 'npm install -g pm2',
    arch: 'npm install -g pm2',
    note: 'Then: pm2 startup (follow instructions)'
  },
  'cloudflared': {
    mac: 'brew install cloudflared',
    arch: 'yay -S cloudflared-bin',
    note: 'Then: cloudflared tunnel login'
  },

  // Environment setup
  'JWT_SECRET': {
    note: 'Generate with: openssl rand -hex 64',
    file: '.env-secrets',
    example: 'JWT_SECRET=<your-64-char-hex-string>'
  },
  'MEILI_MASTER_KEY': {
    note: 'Generate with: openssl rand -hex 32',
    file: '.env-secrets',
    example: 'MEILI_MASTER_KEY=<your-32-char-hex-string>'
  },
  'OPENAI_API_KEY': {
    note: 'Get from https://platform.openai.com/api-keys',
    file: '.env-secrets',
    example: 'OPENAI_API_KEY=sk-...'
  },
  'ANTHROPIC_API_KEY': {
    note: 'Get from https://console.anthropic.com/settings/keys',
    file: '.env-secrets',
    example: 'ANTHROPIC_API_KEY=sk-ant-...'
  },
  'ELEVENLABS_API_KEY': {
    note: 'Get from https://elevenlabs.io/app/settings/api-keys',
    file: '.env-secrets',
    example: 'ELEVENLABS_API_KEY=...'
  },
  'SENDGRID_API_KEY': {
    note: 'Get from https://app.sendgrid.com/settings/api_keys',
    file: '.env-secrets',
    example: 'SENDGRID_API_KEY=SG...'
  },

  // Directories
  'data': {
    note: 'mkdir -p data logs'
  },
  'logs': {
    note: 'mkdir -p data logs'
  },
  '.env-secrets': {
    note: 'cp .env-secrets.example .env-secrets && $EDITOR .env-secrets'
  },

  // Services
  'meilisearch-service': {
    mac: 'brew services start meilisearch',
    arch: 'systemctl --user enable --now meilisearch',
    note: 'Or run manually: meilisearch --db-path ./data/meilisearch'
  }
};

/**
 * Check if a command exists
 */
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get command version
 */
function getVersion(cmd, versionFlag = '--version') {
  try {
    const output = execSync(`${cmd} ${versionFlag} 2>&1`, { stdio: 'pipe' }).toString().trim();
    // Extract version number from output
    const match = output.match(/(\d+\.\d+\.?\d*)/);
    return match ? match[1] : output.split('\n')[0].substring(0, 50);
  } catch {
    return null;
  }
}

/**
 * Check network connectivity
 */
async function checkUrl(url, timeout = 5000) {
  const controller = new globalThis.AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: 'GET'
    });
    clearTimeout(timeoutId);
    return { ok: response.ok, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, error: err.message };
  }
}

/**
 * Add installation instruction
 */
function addInstruction(key, required = false) {
  const inst = INSTALL_INSTRUCTIONS[key];
  if (inst && !results.instructions.find(i => i.key === key)) {
    results.instructions.push({
      key,
      required,
      ...inst
    });
  }
}

/**
 * Log result
 */
function log(status, category, message, detail = '', instructionKey = null) {
  const icons = {
    pass: `${c.green}✓${c.reset}`,
    warn: `${c.yellow}!${c.reset}`,
    fail: `${c.red}✗${c.reset}`,
    skip: `${c.dim}○${c.reset}`,
    info: `${c.blue}ℹ${c.reset}`
  };

  const detailStr = detail ? ` ${c.dim}(${detail})${c.reset}` : '';
  console.log(`  ${icons[status]} ${category}: ${message}${detailStr}`);

  if (status === 'pass') results.passed.push(category);
  else if (status === 'warn') {
    results.warnings.push({ category, message });
    if (instructionKey) addInstruction(instructionKey, false);
  }
  else if (status === 'fail') {
    results.failed.push({ category, message });
    if (instructionKey) addInstruction(instructionKey, true);
  }
  else if (status === 'skip') results.skipped.push(category);
}

/**
 * Section header
 */
function section(title) {
  console.log(`\n${c.bold}${c.cyan}▸ ${title}${c.reset}`);
}

// ============================================
// CHECKS
// ============================================

async function checkSystemTools() {
  section('System Tools');

  // Required tools
  const required = [
    { cmd: 'node', name: 'Node.js', minVersion: '20.0.0' },
    { cmd: 'npm', name: 'npm' },
    { cmd: 'git', name: 'Git' },
    { cmd: 'meilisearch', name: 'Meilisearch' }
  ];

  for (const tool of required) {
    if (commandExists(tool.cmd)) {
      const version = getVersion(tool.cmd);
      if (tool.minVersion && version) {
        const [major] = version.split('.').map(Number);
        const [minMajor] = tool.minVersion.split('.').map(Number);
        if (major < minMajor) {
          log('warn', tool.name, `v${version}`, `v${tool.minVersion}+ recommended`, tool.cmd);
        } else {
          log('pass', tool.name, `v${version}`);
        }
      } else {
        log('pass', tool.name, version || 'installed');
      }
    } else {
      log('fail', tool.name, 'not found', 'required', tool.cmd);
    }
  }

  // Optional tools
  const optional = [
    { cmd: 'ollama', name: 'Ollama', note: 'local LLM' },
    { cmd: 'pandoc', name: 'Pandoc', note: 'document conversion' },
    { cmd: 'tesseract', name: 'Tesseract', note: 'OCR' },
    { cmd: 'ffmpeg', name: 'FFmpeg', note: 'audio processing' },
    { cmd: 'pdftotext', name: 'Poppler', note: 'PDF text extraction' },
    { cmd: 'pm2', name: 'PM2', note: 'process manager' },
    { cmd: 'cloudflared', name: 'Cloudflared', note: 'tunnel' }
  ];

  for (const tool of optional) {
    if (commandExists(tool.cmd)) {
      const version = getVersion(tool.cmd);
      log('pass', tool.name, version || 'installed', tool.note);
    } else {
      log('skip', tool.name, 'not installed', tool.note, tool.cmd);
    }
  }
}

async function checkDirectories() {
  section('File System');

  const dirs = [
    { path: 'data', required: true, write: true },
    { path: 'logs', required: true, write: true },
    { path: 'data/meilisearch', required: false, write: true },
    { path: 'data/audio', required: false, write: true },
    { path: 'data/translations', required: false, write: true }
  ];

  for (const dir of dirs) {
    const fullPath = join(PROJECT_ROOT, dir.path);

    if (!existsSync(fullPath)) {
      if (dir.required) {
        try {
          mkdirSync(fullPath, { recursive: true });
          log('pass', dir.path, 'created');
        } catch (err) {
          log('fail', dir.path, `cannot create: ${err.message}`);
        }
      } else {
        log('skip', dir.path, 'not created', 'optional');
      }
    } else {
      if (dir.write) {
        try {
          accessSync(fullPath, constants.W_OK);
          log('pass', dir.path, 'exists, writable');
        } catch {
          log('fail', dir.path, 'exists but not writable');
        }
      } else {
        log('pass', dir.path, 'exists');
      }
    }
  }

  // Check config files
  const configs = [
    { path: '.env-secrets', required: true },
    { path: '.env-public', required: true },
    { path: 'ecosystem.config.js', required: false }
  ];

  for (const cfg of configs) {
    const fullPath = join(PROJECT_ROOT, cfg.path);
    if (existsSync(fullPath)) {
      log('pass', cfg.path, 'exists');
    } else if (cfg.required) {
      log('fail', cfg.path, 'missing', 'required', cfg.path);
    } else {
      log('skip', cfg.path, 'missing', 'optional');
    }
  }
}

async function checkEnvironmentVars() {
  section('Environment Variables');

  // Core required
  const required = [
    { key: 'JWT_ACCESS_SECRET', name: 'JWT Access Secret', aliases: ['JWT_SECRET'] },
    { key: 'JWT_REFRESH_SECRET', name: 'JWT Refresh Secret', aliases: ['JWT_SECRET'] },
    { key: 'MEILI_MASTER_KEY', name: 'Meilisearch Key', aliases: ['MEILISEARCH_KEY'] }
  ];

  for (const v of required) {
    let value = process.env[v.key];
    if (!value && v.aliases) {
      for (const alias of v.aliases) {
        if (process.env[alias]) {
          value = process.env[alias];
          break;
        }
      }
    }

    if (value) {
      const masked = value.length > 8 ? value.substring(0, 4) + '****' : '****';
      log('pass', v.name, masked);
    } else {
      log('fail', v.name, 'not set', v.key);
    }
  }

  // AI providers
  const ai = [
    { key: 'OPENAI_API_KEY', name: 'OpenAI API', note: 'embeddings, TTS' },
    { key: 'ANTHROPIC_API_KEY', name: 'Anthropic API', note: 'Claude chat' },
    { key: 'ELEVENLABS_API_KEY', name: 'ElevenLabs API', note: 'voice' }
  ];

  let hasAnyAI = false;
  for (const v of ai) {
    if (process.env[v.key]) {
      hasAnyAI = true;
      log('pass', v.name, 'configured', v.note);
    } else {
      log('skip', v.name, 'not set', v.note);
    }
  }

  if (!hasAnyAI) {
    log('warn', 'AI Providers', 'no AI API keys configured');
  }

  // Cloud storage
  const storage = [
    { key: 'B2_APPLICATION_KEY_ID', name: 'Backblaze B2' },
    { key: 'SCALEWAY_ACCESS_KEY', name: 'Scaleway S3' },
    { key: 'AWS_ACCESS_KEY_ID', name: 'AWS S3' }
  ];

  let hasStorage = false;
  for (const v of storage) {
    if (process.env[v.key]) {
      hasStorage = true;
      log('pass', v.name, 'configured');
      break;
    }
  }

  if (!hasStorage) {
    log('skip', 'Cloud Storage', 'no S3-compatible storage configured');
  }

  // Email
  const emailProvider = process.env.EMAIL_PROVIDER || 'console';
  if (emailProvider === 'console') {
    log('skip', 'Email', 'using console (dev mode)');
  } else {
    const emailKey = `${emailProvider.toUpperCase()}_API_KEY`;
    if (process.env[emailKey] || process.env.SENDGRID_API_KEY) {
      log('pass', 'Email', `${emailProvider} configured`);
    } else {
      log('warn', 'Email', `${emailProvider} selected but API key missing`);
    }
  }
}

async function checkNetworkConnectivity() {
  section('Network Connectivity');

  // Meilisearch
  const meiliHost = process.env.MEILI_HOST || 'http://localhost:7700';
  const meiliResult = await checkUrl(`${meiliHost}/health`);
  if (meiliResult.ok) {
    log('pass', 'Meilisearch', 'connected', meiliHost);
  } else {
    log('fail', 'Meilisearch', `cannot connect: ${meiliResult.error || meiliResult.status}`, meiliHost);
  }

  // Ollama (optional)
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const ollamaResult = await checkUrl(`${ollamaHost}/api/tags`);
  if (ollamaResult.ok) {
    log('pass', 'Ollama', 'connected', ollamaHost);
  } else {
    log('skip', 'Ollama', 'not running', ollamaHost);
  }

  // Turso database
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    if (tursoUrl.startsWith('file:') || tursoUrl.startsWith('libsql://')) {
      log('pass', 'Database', 'configured', tursoUrl.split('/').pop());
    } else {
      log('warn', 'Database', 'unusual URL format');
    }
  } else {
    log('fail', 'Database', 'TURSO_DATABASE_URL not set');
  }

  // OpenAI API
  if (process.env.OPENAI_API_KEY) {
    const openaiResult = await checkUrl('https://api.openai.com/v1/models', 3000);
    if (openaiResult.status === 401 || openaiResult.ok) {
      log('pass', 'OpenAI API', 'reachable');
    } else {
      log('warn', 'OpenAI API', 'may be unreachable');
    }
  }

  // Anthropic API
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropicResult = await checkUrl('https://api.anthropic.com/v1/messages', 3000);
    if (anthropicResult.status === 401 || anthropicResult.ok || anthropicResult.status === 400) {
      log('pass', 'Anthropic API', 'reachable');
    } else {
      log('warn', 'Anthropic API', 'may be unreachable');
    }
  }
}

async function checkNodeModules() {
  section('Dependencies');

  const nodeModulesPath = join(PROJECT_ROOT, 'node_modules');
  if (!existsSync(nodeModulesPath)) {
    log('fail', 'node_modules', 'not installed', 'run: npm install');
    return;
  }

  // Check key dependencies
  const deps = ['fastify', 'meilisearch', '@anthropic-ai/sdk', 'openai', '@libsql/client'];
  let missing = [];

  for (const dep of deps) {
    const depPath = join(nodeModulesPath, dep);
    if (!existsSync(depPath)) {
      missing.push(dep);
    }
  }

  if (missing.length === 0) {
    log('pass', 'Dependencies', 'all installed');
  } else {
    log('warn', 'Dependencies', `missing: ${missing.join(', ')}`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log(`\n${c.bold}════════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}                 SifterSearch Preflight Check${c.reset}`);
  console.log(`${c.bold}════════════════════════════════════════════════════════════════${c.reset}`);

  await checkSystemTools();
  await checkDirectories();
  await checkEnvironmentVars();
  await checkNetworkConnectivity();
  await checkNodeModules();

  // Summary
  console.log(`\n${c.bold}────────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.bold}Summary${c.reset}`);
  console.log(`${c.bold}────────────────────────────────────────────────────────────────${c.reset}`);

  console.log(`  ${c.green}✓ Passed:${c.reset}   ${results.passed.length}`);
  console.log(`  ${c.yellow}! Warnings:${c.reset} ${results.warnings.length}`);
  console.log(`  ${c.red}✗ Failed:${c.reset}   ${results.failed.length}`);
  console.log(`  ${c.dim}○ Skipped:${c.reset}  ${results.skipped.length}`);

  if (results.failed.length > 0) {
    console.log(`\n${c.red}${c.bold}Critical issues that must be resolved:${c.reset}`);
    for (const f of results.failed) {
      console.log(`  ${c.red}• ${f.category}: ${f.message}${c.reset}`);
    }

    // Show installation instructions for failed items
    const requiredInstructions = results.instructions.filter(i => i.required);
    if (requiredInstructions.length > 0) {
      const platformName = isMac ? 'macOS (Homebrew)' : 'Arch Linux';
      console.log(`\n${c.cyan}${c.bold}Installation Instructions (${platformName}):${c.reset}`);
      for (const inst of requiredInstructions) {
        console.log(`\n  ${c.bold}${inst.key}:${c.reset}`);
        const cmd = inst[platform]; // 'mac' or 'arch'
        if (cmd) {
          console.log(`    ${c.green}$ ${cmd}${c.reset}`);
        }
        if (inst.note) {
          console.log(`    ${c.dim}${inst.note}${c.reset}`);
        }
        if (inst.file) {
          console.log(`    ${c.dim}Add to ${inst.file}: ${inst.example}${c.reset}`);
        }
      }
    }

    console.log(`\n${c.bold}════════════════════════════════════════════════════════════════${c.reset}\n`);
    process.exit(1);
  }

  if (results.warnings.length > 0) {
    console.log(`\n${c.yellow}Warnings (non-blocking):${c.reset}`);
    for (const w of results.warnings) {
      console.log(`  ${c.yellow}• ${w.category}: ${w.message}${c.reset}`);
    }
  }

  // Show optional installation instructions if any were skipped
  const optionalInstructions = results.instructions.filter(i => !i.required);
  if (optionalInstructions.length > 0 && process.argv.includes('--verbose')) {
    console.log(`\n${c.cyan}Optional tools you could install:${c.reset}`);
    for (const inst of optionalInstructions) {
      const cmd = inst[platform];
      if (cmd) {
        console.log(`  ${c.dim}${inst.key}: ${cmd}${c.reset}`);
      }
    }
  }

  console.log(`\n${c.green}${c.bold}✓ Preflight check passed - ready to start${c.reset}`);
  console.log(`${c.bold}════════════════════════════════════════════════════════════════${c.reset}\n`);

  process.exit(0);
}

// Export for use by dev.js
export {
  checkUrl,
  commandExists,
  getVersion,
  results,
  INSTALL_INSTRUCTIONS,
  platform,
  isMac,
  c as colors,
  PROJECT_ROOT
};

// Run preflight checks and return results (for programmatic use)
export async function runPreflight(options = {}) {
  const { quiet = false, exitOnFail = true } = options;

  if (!quiet) {
    console.log(`\n${c.bold}════════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}                 SifterSearch Preflight Check${c.reset}`);
    console.log(`${c.bold}════════════════════════════════════════════════════════════════${c.reset}`);
  }

  // Reset results for fresh run
  results.passed = [];
  results.warnings = [];
  results.failed = [];
  results.skipped = [];
  results.instructions = [];

  await checkSystemTools();
  await checkDirectories();
  await checkEnvironmentVars();
  await checkNetworkConnectivity();
  await checkNodeModules();

  if (!quiet) {
    console.log(`\n${c.bold}────────────────────────────────────────────────────────────────${c.reset}`);
    console.log(`${c.bold}Summary${c.reset}`);
    console.log(`${c.bold}────────────────────────────────────────────────────────────────${c.reset}`);
    console.log(`  ${c.green}✓ Passed:${c.reset}   ${results.passed.length}`);
    console.log(`  ${c.yellow}! Warnings:${c.reset} ${results.warnings.length}`);
    console.log(`  ${c.red}✗ Failed:${c.reset}   ${results.failed.length}`);
    console.log(`  ${c.dim}○ Skipped:${c.reset}  ${results.skipped.length}`);
  }

  const success = results.failed.length === 0;

  if (!success && !quiet) {
    console.log(`\n${c.red}${c.bold}Critical issues that must be resolved:${c.reset}`);
    for (const f of results.failed) {
      console.log(`  ${c.red}• ${f.category}: ${f.message}${c.reset}`);
    }

    const requiredInstructions = results.instructions.filter(i => i.required);
    if (requiredInstructions.length > 0) {
      const platformName = isMac ? 'macOS (Homebrew)' : 'Arch Linux';
      console.log(`\n${c.cyan}${c.bold}Installation Instructions (${platformName}):${c.reset}`);
      for (const inst of requiredInstructions) {
        console.log(`\n  ${c.bold}${inst.key}:${c.reset}`);
        const cmd = inst[platform];
        if (cmd) {
          console.log(`    ${c.green}$ ${cmd}${c.reset}`);
        }
        if (inst.note) {
          console.log(`    ${c.dim}${inst.note}${c.reset}`);
        }
        if (inst.file) {
          console.log(`    ${c.dim}Add to ${inst.file}: ${inst.example}${c.reset}`);
        }
      }
    }
    console.log(`\n${c.bold}════════════════════════════════════════════════════════════════${c.reset}\n`);
  }

  if (!success && exitOnFail) {
    process.exit(1);
  }

  if (success && !quiet) {
    console.log(`\n${c.green}${c.bold}✓ Preflight check passed - ready to start${c.reset}`);
    console.log(`${c.bold}════════════════════════════════════════════════════════════════${c.reset}\n`);
  }

  return { success, results };
}

// Only run main when executed directly (not imported)
const isMainModule = process.argv[1]?.endsWith('preflight.js');
if (isMainModule) {
  main().catch(err => {
    console.error(`${c.red}Preflight check failed: ${err.message}${c.reset}`);
    process.exit(1);
  });
}
