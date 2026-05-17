#!/usr/bin/env node
// Reads config/doc-tier-priority.json and populates docs.doc_priority column.
// Run once after migration 72, then after any config change.
// Also used at extraction worker startup to refresh priorities.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { queryAll, query } from '../api/lib/db.js';
import { logger } from '../api/lib/logger.js';
import { runMigrations } from '../api/lib/migrations/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../config/doc-tier-priority.json');

function matchesLayer(doc, match) {
  if (match.title && doc.title !== match.title) return false;
  if (match.title_contains && !doc.title?.includes(match.title_contains)) return false;
  if (match.author_contains && !doc.author?.includes(match.author_contains)) return false;
  if (match.religion && doc.religion !== match.religion) return false;
  if (match.authority_gte !== undefined && (doc.authority ?? 0) < match.authority_gte) return false;
  return true;
}

export async function applyDocPriority() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const allLayers = [
    ...(config.bahai_layers ?? []),
    ...(config.other_layers ?? []),
  ].sort((a, b) => b.priority - a.priority);

  const docs = await queryAll(`SELECT id, title, author, religion, authority FROM docs WHERE deleted_at IS NULL`);
  let updated = 0;

  for (const doc of docs) {
    let priority = 100; // default
    for (const layer of allLayers) {
      if (matchesLayer(doc, layer.match)) {
        priority = layer.priority;
        break;
      }
    }
    await query(`UPDATE docs SET doc_priority = ? WHERE id = ?`, [priority, doc.id]);
    updated++;
  }

  logger.info({ updated, layers: allLayers.length }, 'Doc priorities applied');
  return updated;
}

// Run standalone
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMigrations();
  const count = await applyDocPriority();
  console.log(`Updated ${count} docs with priority scores.`);
}
