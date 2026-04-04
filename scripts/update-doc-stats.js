#!/usr/bin/env node
/**
 * Update library statistics in documentation files
 *
 * Fetches live stats from the API and updates any markdown files
 * that contain the <!-- LIBRARY_STATS --> marker with current values.
 *
 * Usage:
 *   node scripts/update-doc-stats.js              # Update from live API
 *   node scripts/update-doc-stats.js --local       # Update from local DB
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const LOCAL = process.argv.includes('--local');
const API_URL = 'https://api.siftersearch.com/api/search/stats';

async function getStats() {
  if (LOCAL) {
    const { queryOne, queryAll } = await import('../api/lib/db.js');
    const docs = await queryOne('SELECT COUNT(*) as count FROM docs WHERE deleted_at IS NULL');
    const paras = await queryOne('SELECT COUNT(*) as count FROM content WHERE deleted_at IS NULL');
    const religions = await queryAll('SELECT religion, COUNT(*) as count FROM docs WHERE deleted_at IS NULL GROUP BY religion ORDER BY count DESC');
    const collections = await queryOne('SELECT COUNT(DISTINCT collection) as count FROM docs WHERE deleted_at IS NULL');
    return {
      totalDocuments: docs.count,
      totalPassages: paras.count,
      religions: religions.length,
      collections: collections.count,
      religionCounts: Object.fromEntries(religions.map(r => [r.religion, r.count]))
    };
  }

  const res = await fetch(API_URL);
  return res.json();
}

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`.replace('.0K', 'K');
  return String(n);
}

function buildStatsBlock(stats) {
  const religions = Object.entries(stats.religionCounts || {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} (${count.toLocaleString()})`)
    .join(', ');

  return [
    `<!-- LIBRARY_STATS -->`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Documents | ${stats.totalDocuments.toLocaleString()} |`,
    `| Paragraphs | ${formatNumber(stats.totalPassages)} |`,
    `| Religions | ${stats.religions} |`,
    `| Collections | ${stats.collections} |`,
    ``,
    `Traditions: ${religions}`,
    `<!-- /LIBRARY_STATS -->`
  ].join('\n');
}

async function updateFile(filePath, stats) {
  const content = await readFile(filePath, 'utf-8');
  const marker = /<!-- LIBRARY_STATS -->[\s\S]*?<!-- \/LIBRARY_STATS -->/;

  if (!marker.test(content)) return false;

  const updated = content.replace(marker, buildStatsBlock(stats));
  if (updated === content) return false;

  await writeFile(filePath, updated, 'utf-8');
  return true;
}

async function main() {
  console.log(`Fetching stats from ${LOCAL ? 'local DB' : API_URL}...`);
  const stats = await getStats();

  console.log(`Documents: ${stats.totalDocuments.toLocaleString()}`);
  console.log(`Paragraphs: ${stats.totalPassages.toLocaleString()}`);
  console.log(`Religions: ${stats.religions}, Collections: ${stats.collections}\n`);

  // Update any docs files with the marker
  const { glob } = await import('glob');
  const files = await glob('docs/**/*.md');

  let updated = 0;
  for (const file of files) {
    if (await updateFile(file, stats)) {
      console.log(`  Updated: ${file}`);
      updated++;
    }
  }

  console.log(`\n${updated} files updated.`);
  if (updated === 0) {
    console.log('Add <!-- LIBRARY_STATS --><!-- /LIBRARY_STATS --> markers to docs to enable auto-updating.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
