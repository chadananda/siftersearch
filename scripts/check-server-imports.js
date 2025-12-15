#!/usr/bin/env node
/**
 * Verify server imports work (catches missing dependencies)
 * Used by pre-commit hook to prevent deploying broken code
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

async function checkImports() {
  const modules = [
    '../api/server.js',
    '../api/lib/config.js',
    '../api/lib/db.js',
    '../api/lib/search.js',
    '../api/lib/ai-services.js',
    '../api/services/indexer.js',
    '../api/services/ingester.js',
    '../api/agents/agent-analyzer.js',
    '../api/agents/agent-librarian.js',
    '../api/agents/agent-narrator.js',
    '../api/agents/agent-researcher.js',
    '../api/agents/agent-transcriber.js',
    '../api/routes/deploy.js'
  ];

  for (const mod of modules) {
    try {
      await import(mod);
    } catch (err) {
      console.error(`❌ Failed to import ${mod}:`);
      console.error(`   ${err.message}`);
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        const match = err.message.match(/Cannot find package '([^']+)'/);
        if (match) {
          console.error(`\n   💡 Fix: npm install ${match[1]}`);
        }
      }
      process.exit(1);
    }
  }

  console.log('✅ All server imports OK');
  process.exit(0);
}

checkImports();
