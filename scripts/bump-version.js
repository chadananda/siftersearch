#!/usr/bin/env node

/**
 * Version bump script for SifterSearch
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major]
 *
 * Default is 'patch' which increments the last number (0.0.40 -> 0.0.41)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagePath = join(__dirname, '..', 'package.json');

// Read current package.json
const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
const currentVersion = pkg.version;

// Parse version
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Get bump type from args (default: patch)
const bumpType = process.argv[2] || 'patch';

let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// Update package.json
pkg.version = newVersion;
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Version bumped: ${currentVersion} -> ${newVersion}`);

// Output the new version (useful for scripts)
process.stdout.write(newVersion);
