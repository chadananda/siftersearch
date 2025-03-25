#!/usr/bin/env node
/**
 * clear-cache.js
 * 
 * This script clears specific build caches to resolve
 * dependency and build issues.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Directories to clear
const cacheDirs = [
  path.join(rootDir, 'build'),
  path.join(rootDir, '.vite')
];

console.log('🧹 Clearing build cache artifacts...');

// Clear cache directories
cacheDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`Removing ${path.relative(rootDir, dir)}...`);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`✅ Successfully removed ${path.relative(rootDir, dir)}`);
    } catch (err) {
      console.error(`❌ Error removing ${path.relative(rootDir, dir)}: ${err.message}`);
    }
  } else {
    console.log(`Directory ${path.relative(rootDir, dir)} does not exist, skipping.`);
  }
});

console.log('\n🚀 Cache cleared! You can now restart your development server.');
