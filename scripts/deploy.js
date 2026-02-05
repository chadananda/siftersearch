#!/usr/bin/env node

/**
 * Deploy script for SifterSearch
 *
 * Bumps version, builds, and deploys to Cloudflare Pages.
 * Loads .env-secrets automatically so CLOUDFLARE_API_TOKEN is available.
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Load secrets so wrangler has CLOUDFLARE_API_TOKEN
dotenv.config({ path: join(projectRoot, '.env-secrets') });
dotenv.config({ path: join(projectRoot, '.env-public') });

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: projectRoot, stdio: 'inherit' });
}

run('node scripts/bump-version.js');
run('npm run build');
run('npx wrangler pages deploy ./dist --project-name siftersearch');
