#!/usr/bin/env node

/**
 * Git Hooks Installation Script for SifterSearch
 *
 * This script installs the custom git hooks from scripts/hooks/
 * into the .git/hooks/ directory.
 *
 * Usage:
 *   node scripts/install-hooks.js
 *   npm run setup:hooks
 */

import { copyFileSync, chmodSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const hooksSourceDir = join(__dirname, 'hooks');
const hooksTargetDir = join(rootDir, '.git', 'hooks');

// Colors for output
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const NC = '\x1b[0m';

console.log(`${YELLOW}[install-hooks]${NC} Installing git hooks...`);

// Check if .git directory exists
if (!existsSync(join(rootDir, '.git'))) {
  console.error(`${RED}[install-hooks]${NC} Error: .git directory not found. Are you in a git repository?`);
  process.exit(1);
}

// Check if hooks source directory exists
if (!existsSync(hooksSourceDir)) {
  console.error(`${RED}[install-hooks]${NC} Error: scripts/hooks/ directory not found.`);
  process.exit(1);
}

// Get list of hooks to install
const hooks = readdirSync(hooksSourceDir).filter(f => !f.endsWith('.sample'));

if (hooks.length === 0) {
  console.log(`${YELLOW}[install-hooks]${NC} No hooks found in scripts/hooks/`);
  process.exit(0);
}

// Install each hook
let installed = 0;
for (const hook of hooks) {
  const source = join(hooksSourceDir, hook);
  const target = join(hooksTargetDir, hook);

  try {
    // Copy the hook
    copyFileSync(source, target);

    // Make it executable
    chmodSync(target, 0o755);

    console.log(`${GREEN}[install-hooks]${NC} Installed: ${hook}`);
    installed++;
  } catch (err) {
    console.error(`${RED}[install-hooks]${NC} Failed to install ${hook}: ${err.message}`);
  }
}

console.log(`${GREEN}[install-hooks]${NC} Successfully installed ${installed}/${hooks.length} hooks`);
console.log(`\n${YELLOW}Workflow:${NC}`);
console.log('  1. Make changes to code');
console.log('  2. Stage files: git add .');
console.log('  3. Commit: git commit -m "feat: your message"');
console.log('     → pre-commit: bumps version, updates changelog');
console.log('     → post-commit: builds and deploys');
console.log(`\n${YELLOW}Skip deployment:${NC} SKIP_DEPLOY=1 git commit -m "..."`);
console.log(`${YELLOW}Skip all hooks:${NC} git commit --no-verify -m "..."`);
