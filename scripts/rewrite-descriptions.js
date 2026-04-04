#!/usr/bin/env node
/**
 * Rewrite Document Descriptions (Two-Pass)
 *
 * Pass 1 (--clean): Rule-based + Haiku light rewrite of existing descriptions.
 *   - Strip "This document/essay/article..." filler
 *   - Remove author names (shown separately in UI)
 *   - Remove source/provenance info
 *   - Fix garbled URLs
 *   - Uses gray-matter to read/write YAML frontmatter in source files
 *   - Only sends the existing description to Haiku (minimal tokens)
 *
 * Pass 2 (--regenerate): For docs where description doesn't describe content.
 *   - Haiku reads first ~10 paragraphs and writes a new description
 *   - Only runs on docs flagged by pass 1 or explicitly selected
 *
 * Usage:
 *   node scripts/rewrite-descriptions.js --clean                # Dry run pass 1
 *   node scripts/rewrite-descriptions.js --clean --execute      # Apply pass 1
 *   node scripts/rewrite-descriptions.js --regenerate           # Dry run pass 2
 *   node scripts/rewrite-descriptions.js --regenerate --execute # Apply pass 2
 *   node scripts/rewrite-descriptions.js --clean --execute --ids 123,456
 */

import '../api/lib/config.js';
import { query, queryAll } from '../api/lib/db.js';
import { logger } from '../api/lib/logger.js';
import Anthropic from '@anthropic-ai/sdk';
import matter from 'gray-matter';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const EXECUTE = process.argv.includes('--execute');
const CLEAN = process.argv.includes('--clean');
const REGENERATE = process.argv.includes('--regenerate');
const idsFlag = process.argv.indexOf('--ids');
const SPECIFIC_IDS = idsFlag >= 0 ? process.argv[idsFlag + 1]?.split(',').map(Number) : null;

const LIBRARY_BASE = join(process.env.HOME, 'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library');
const CONCURRENCY = 5;

const anthropic = new Anthropic();

// ─── Rule-based cleanup ────────────────────────────────────────────────────

function isGarbled(desc) {
  if (!desc) return true;
  if (desc.includes('https:') || desc.includes('bahai-library.com')) return true;
  if (desc.startsWith('Document from ') || desc.startsWith('"Document from ')) return true;
  return false;
}

function needsClean(desc) {
  if (!desc || desc.trim() === '') return 'empty';
  const d = desc.trim();
  if (isGarbled(d)) return 'garbled';
  if (/^This (document|essay|article|letter|book|tablet|work|is|text) /i.test(d)) return 'filler';
  if (/^Abstract:/i.test(d)) return 'abstract';
  return null;
}

/**
 * Try rule-based fixes first. Returns cleaned description or null if AI needed.
 */
function ruleBasedClean(desc) {
  if (!desc) return null;
  let d = desc.trim();

  // Strip "Abstract: "
  if (/^Abstract:\s*/i.test(d)) {
    d = d.replace(/^Abstract:\s*/i, '');
    if (d.length > 10) return d;
  }

  return null; // Needs AI
}

// ─── Haiku calls ───────────────────────────────────────────────────────────

async function callHaiku(system, user, maxTokens = 200) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      // System prompt with cache_control — identical across all calls, so cached after first
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }]
    });
    return response.content[0]?.text?.trim() || null;
  } catch (err) {
    logger.warn({ err: err.message }, 'Haiku call failed');
    return null;
  }
}

const CLEAN_SYSTEM = `You rewrite document descriptions for a search engine. Output ONLY the rewritten description, nothing else.

Rules:
- 1-2 sentences, max 200 characters preferred
- Describe WHAT the document contains — topics, arguments, themes
- NEVER include the author name (it's shown separately in the UI)
- NEVER mention the source, collection, website, or where it was published
- NEVER start with "This document/essay/article/letter/book/tablet/work..."
- NEVER start with "A document/essay/article..."
- Start with active verbs: "Explores...", "Addresses...", "Discusses...", "Outlines..."
- For letters: mention the recipient and topic
- For prayers/devotional texts: describe the spiritual themes
- If the input is garbled or contains no useful description, respond with exactly: NEEDS_REGENERATION`;

const REGEN_SYSTEM = `You write short descriptions for documents in a search engine. Output ONLY the description, nothing else.

Rules:
- 1-2 sentences, max 200 characters preferred
- Describe WHAT the document contains — topics, arguments, themes
- NEVER include the author name (it's shown separately in the UI)
- NEVER mention the source, collection, website, or publication info
- Start with active verbs: "Explores...", "Addresses...", "Discusses...", "Outlines..."
- For letters: mention the recipient and topic
- For prayers/devotional texts: describe the spiritual themes`;

// ─── Source file helpers ───────────────────────────────────────────────────

function getSourcePath(filePath) {
  return join(LIBRARY_BASE, filePath);
}

async function updateSourceDescription(filePath, newDescription) {
  const sourcePath = getSourcePath(filePath);
  if (!existsSync(sourcePath)) return false;

  const raw = await readFile(sourcePath, 'utf-8');
  const parsed = matter(raw);

  parsed.data.description = newDescription;

  // gray-matter stringify preserves body and rewrites frontmatter
  const output = matter.stringify(parsed.content, parsed.data);
  await writeFile(sourcePath, output, 'utf-8');
  return true;
}

// ─── Pass 1: Clean existing descriptions ───────────────────────────────────

async function cleanDescriptions() {
  console.log('=== Pass 1: Clean Existing Descriptions ===\n');

  let docs;
  if (SPECIFIC_IDS) {
    docs = await queryAll(`
      SELECT id, title, author, description, file_path
      FROM docs WHERE deleted_at IS NULL AND id IN (${SPECIFIC_IDS.map(() => '?').join(',')})
    `, SPECIFIC_IDS);
  } else {
    docs = await queryAll(`
      SELECT id, title, author, description, file_path
      FROM docs WHERE deleted_at IS NULL
      ORDER BY id
    `);
    docs = docs.filter(d => needsClean(d.description));
  }

  console.log(`${docs.length} documents need cleaning\n`);

  if (!EXECUTE) {
    for (const doc of docs.slice(0, 20)) {
      const reason = needsClean(doc.description);
      console.log(`  [${reason}] id=${doc.id} "${doc.title?.slice(0, 55)}"`);
      console.log(`    ${(doc.description || '(empty)').slice(0, 100)}`);
    }
    if (docs.length > 20) console.log(`  ... and ${docs.length - 20} more`);
    console.log('\nUse --execute to apply changes.');
    return;
  }

  let updated = 0;
  let needsRegen = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const batch = docs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (doc) => {
      // Try rule-based first
      const ruleCleaned = ruleBasedClean(doc.description);
      if (ruleCleaned) {
        await query('UPDATE docs SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [ruleCleaned, doc.id]);
        if (doc.file_path) await updateSourceDescription(doc.file_path, ruleCleaned).catch(() => {});
        updated++;
        if (updated <= 10 || updated % 100 === 0) {
          console.log(`[${updated}] id=${doc.id} RULE: ${ruleCleaned.slice(0, 80)}`);
        }
        return;
      }

      // AI rewrite of existing description
      if (isGarbled(doc.description) || !doc.description?.trim()) {
        // No usable description — needs full regeneration in pass 2
        needsRegen++;
        return;
      }

      const userPrompt = `Document title: "${doc.title}"
Author: ${doc.author || 'Unknown'}

Current description to rewrite:
${doc.description}

Rewrite this description:`;

      const newDesc = await callHaiku(CLEAN_SYSTEM, userPrompt, 150);
      if (!newDesc || newDesc === 'NEEDS_REGENERATION') {
        needsRegen++;
        return;
      }

      // Clean up quotes
      const cleaned = newDesc.replace(/^["']|["']$/g, '').trim();
      if (cleaned.length < 10) { needsRegen++; return; }

      await query('UPDATE docs SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cleaned, doc.id]);
      if (doc.file_path) await updateSourceDescription(doc.file_path, cleaned).catch(() => {});
      updated++;

      if (updated <= 20 || updated % 50 === 0) {
        console.log(`[${updated}] id=${doc.id}`);
        console.log(`  OLD: ${doc.description.slice(0, 90)}`);
        console.log(`  NEW: ${cleaned.slice(0, 90)}`);
      }
    }));

    // Progress
    if (i > 0 && i % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`--- ${i + batch.length}/${docs.length} processed, ${updated} updated, ${needsRegen} need regen, ${elapsed}s ---`);
    }
  }

  console.log(`\n=== Pass 1 Done ===`);
  console.log(`Updated: ${updated}, Needs regeneration: ${needsRegen}, Failed: ${failed}`);
  console.log(`Time: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
}

// ─── Pass 2: Regenerate from content ───────────────────────────────────────

async function regenerateDescriptions() {
  console.log('=== Pass 2: Regenerate Descriptions from Content ===\n');

  let docs;
  if (SPECIFIC_IDS) {
    docs = await queryAll(`
      SELECT id, title, author, religion, collection, year, description, file_path
      FROM docs WHERE deleted_at IS NULL AND id IN (${SPECIFIC_IDS.map(() => '?').join(',')})
    `, SPECIFIC_IDS);
  } else {
    // Find docs with garbled, empty, or very short descriptions
    docs = await queryAll(`
      SELECT id, title, author, religion, collection, year, description, file_path
      FROM docs WHERE deleted_at IS NULL
        AND (description IS NULL OR description = '' OR LENGTH(description) < 15
             OR description LIKE '%https:%' OR description LIKE '%bahai-library.com%'
             OR description LIKE 'Document from %' OR description LIKE '"Document from %')
      ORDER BY id
    `);
  }

  console.log(`${docs.length} documents need regeneration\n`);

  if (!EXECUTE) {
    for (const doc of docs.slice(0, 20)) {
      console.log(`  id=${doc.id} "${doc.title?.slice(0, 55)}"`);
      console.log(`    ${(doc.description || '(empty)').slice(0, 80)}`);
    }
    if (docs.length > 20) console.log(`  ... and ${docs.length - 20} more`);
    console.log('\nUse --execute to apply changes.');
    return;
  }

  let updated = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const batch = docs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (doc) => {
      // Get first ~10 paragraphs from DB
      const rows = await queryAll(
        `SELECT text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT 10`,
        [doc.id]
      );
      const contentText = rows.map(r => r.text).join('\n\n');
      if (!contentText || contentText.length < 50) { skipped++; return; }

      const userPrompt = `Title: "${doc.title}"
Religion: ${doc.religion || 'Unknown'} / ${doc.collection || 'Unknown'}
${doc.year ? `Year: ${doc.year}` : ''}

Content (first paragraphs):
${contentText.slice(0, 2000)}

Write the search result description:`;

      const newDesc = await callHaiku(REGEN_SYSTEM, userPrompt, 150);
      if (!newDesc || newDesc.length < 10) { skipped++; return; }

      const cleaned = newDesc.replace(/^["']|["']$/g, '').trim();

      await query('UPDATE docs SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cleaned, doc.id]);
      if (doc.file_path) await updateSourceDescription(doc.file_path, cleaned).catch(() => {});
      updated++;

      if (updated <= 20 || updated % 50 === 0) {
        console.log(`[${updated}] id=${doc.id} "${doc.title?.slice(0, 50)}"`);
        console.log(`  NEW: ${cleaned.slice(0, 100)}`);
      }
    }));

    if (i > 0 && i % 100 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`--- ${i + batch.length}/${docs.length} processed, ${updated} updated, ${elapsed}s ---`);
    }
  }

  console.log(`\n=== Pass 2 Done ===`);
  console.log(`Updated: ${updated}, Skipped: ${skipped}`);
  console.log(`Time: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  if (!CLEAN && !REGENERATE) {
    console.log('Usage:');
    console.log('  --clean       Pass 1: Rewrite existing descriptions (strip filler, author, provenance)');
    console.log('  --regenerate  Pass 2: Generate new descriptions from content (for garbled/empty)');
    console.log('  --execute     Apply changes (default is dry run)');
    console.log('  --ids N,N,N   Process specific document IDs only');
    return;
  }

  console.log(EXECUTE ? '*** EXECUTE MODE ***\n' : '*** DRY RUN ***\n');

  if (CLEAN) await cleanDescriptions();
  if (REGENERATE) await regenerateDescriptions();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
