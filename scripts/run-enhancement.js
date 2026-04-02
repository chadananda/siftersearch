#!/usr/bin/env node
/**
 * Run RAG enhancement on priority documents.
 * :arch: Standalone script — calls enhancement-ai functions directly against local LLM.
 * :why: Manual control over which documents get enhanced first, with progress logging.
 *
 * Usage: node scripts/run-enhancement.js [--entity-only] [--disambig-only] [--hype-only] [--doc-id=N] [--limit=N]
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { content } from '../api/lib/content.js';
import { callLocalLLM, localLLMHealthCheck, buildDisambiguationPrompt, buildHyPEPrompt, buildEntityPrompt, parseDisambiguationResponse, parseHyPEResponse, parseEntityResponse } from '../api/lib/enhancement-ai.js';
import { logger } from '../api/lib/logger.js';

// Priority document IDs — can be overridden with --collection flag
const PRIORITY_DOC_IDS = [
  8645,  // The Dawn-Breakers (Nabil's Narrative) — 1,741 paragraphs
  8635,  // God Passes By — 1,148 paragraphs
  8303,  // Memorials of the Faithful — 597 paragraphs
  516,   // The Priceless Pearl — 1,364 paragraphs
  426,   // The Child of the Covenant — 1,972 paragraphs
  8295,  // The Advent of Divine Justice — 195 paragraphs
  8302,  // The Promised Day is Come — 363 paragraphs
  296,   // Century of Light — 646 paragraphs
  16277, // The World Order of Bahá'u'lláh — 471 paragraphs
  420,   // The Life of the Báb (Mazandarani) — 73 paragraphs
  11322, // The Life of Bahá'u'lláh (Mazandarani) — 75 paragraphs
  1464,  // Mazandarani in the United States — 1,399 paragraphs
  10062, // Portals to Freedom — 575 paragraphs
  10093, // Memories of Nine Years in 'Akka — 1,686 paragraphs
  12470, // My Memories of Bahá'u'lláh (Salmani) — 363 paragraphs
];

const args = process.argv.slice(2);
const entityOnly = args.includes('--entity-only');
const disambigOnly = args.includes('--disambig-only');
const hypeOnly = args.includes('--hype-only');
const specificDocId = args.find(a => a.startsWith('--doc-id='))?.split('=')[1];
const collectionArg = args.find(a => a.startsWith('--collection='))?.split('=')[1];
const religionArg = args.find(a => a.startsWith('--religion='))?.split('=')[1];
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const batchLimit = parseInt(limitArg) || 9999;

async function main() {
  console.log('=== RAG Enhancement Runner ===\n');

  // Health check
  const healthy = await localLLMHealthCheck();
  if (!healthy) {
    console.error('ERROR: Local LLM not available. Check LOCAL_LLM in .env-secrets');
    process.exit(1);
  }
  console.log('✓ Local LLM connected\n');

  let docIds;
  if (specificDocId) {
    docIds = [parseInt(specificDocId)];
  } else if (collectionArg) {
    const collections = collectionArg.split(',');
    const placeholders = collections.map(() => '?').join(',');
    let sql = `SELECT id FROM docs WHERE deleted_at IS NULL AND collection IN (${placeholders})`;
    const params = [...collections];
    if (religionArg) { sql += ' AND religion = ?'; params.push(religionArg); }
    sql += ' ORDER BY id';
    const rows = await queryAll(sql, params);
    docIds = rows.map(r => r.id);
    console.log(`Collections: ${collections.join(', ')} → ${docIds.length} documents\n`);
  } else {
    docIds = PRIORITY_DOC_IDS;
  }

  for (const docId of docIds) {
    const doc = await queryOne('SELECT id, title, author, religion, collection, year, language, description, paragraph_count FROM docs WHERE id = ? AND deleted_at IS NULL', [docId]);
    if (!doc) { console.log(`⚠ Doc ${docId} not found, skipping`); continue; }

    console.log(`\n━━━ ${doc.title} by ${doc.author} (${doc.paragraph_count} paragraphs) ━━━`);

    // Step 1: Entity extraction
    if (!hypeOnly && !disambigOnly) {
      await runEntityExtraction(doc);
    }

    // Step 2: Disambiguation
    if (!entityOnly && !hypeOnly) {
      await runDisambiguation(doc, batchLimit);
    }

    // Step 3: HyPE
    if (!entityOnly && !disambigOnly) {
      await runHyPE(doc, batchLimit);
    }
  }

  console.log('\n=== Enhancement complete ===');
  process.exit(0);
}

async function runEntityExtraction(doc) {
  const existing = await content.getDocEntities(doc.id);
  if (existing) {
    console.log(`  ✓ Entities already extracted`);
    return;
  }

  console.log(`  ⏳ Extracting entities...`);
  // Get first ~3000 chars of document
  const firstParas = await queryAll(
    'SELECT text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT 15',
    [doc.id]
  );
  const docText = firstParas.map(p => p.text).join('\n\n');
  const { systemPrompt, userPrompt } = buildEntityPrompt(docText, doc);

  const response = await callLocalLLM(systemPrompt, userPrompt, { maxTokens: 300, temperature: 0.2 });
  if (!response) { console.log(`  ✗ Entity extraction failed (no response)`); return; }

  const entities = parseEntityResponse(response);
  if (!entities) { console.log(`  ✗ Entity extraction failed (unparseable): ${response.slice(0, 100)}`); return; }

  await content.upsertDocEntities(doc.id, JSON.stringify(entities), 'local-qwen3-32b');
  console.log(`  ✓ Entities: ${entities.people?.length || 0} people, ${entities.concepts?.length || 0} concepts`);
}

async function runDisambiguation(doc, batchLimit) {
  const entities = await content.getDocEntities(doc.id);
  const entityData = entities ? JSON.parse(entities.entities) : {};

  // Get undisambiguated paragraphs for this doc
  const paras = await queryAll(
    'SELECT id, paragraph_index, text FROM content WHERE doc_id = ? AND context IS NULL AND deleted_at IS NULL ORDER BY paragraph_index LIMIT ?',
    [doc.id, batchLimit]
  );

  if (paras.length === 0) {
    console.log(`  ✓ All paragraphs disambiguated`);
    return;
  }

  // Get all paragraphs for the sliding window
  const allParas = await queryAll(
    'SELECT paragraph_index, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index',
    [doc.id]
  );

  console.log(`  ⏳ Disambiguating ${paras.length} paragraphs...`);
  let done = 0;
  let failed = 0;

  let totalCached = 0, totalPrompt = 0;
  const callTimes = [];
  for (const para of paras) {
    const { systemPrompt, userPrompt } = buildDisambiguationPrompt(doc, entityData, allParas, para.paragraph_index);
    const result = await callLocalLLM(systemPrompt, userPrompt, { maxTokens: 80, temperature: 0.2, returnUsage: true });
    const response = result?.content ?? result;
    const usage = result?.usage;
    if (usage) {
      totalCached += usage.cachedTokens || 0;
      totalPrompt += usage.promptTokens || 0;
      callTimes.push(usage.callMs || 0);
    }
    const parsed = parseDisambiguationResponse(response);

    if (parsed) {
      await content.updateContextOnly(para.id, parsed, 'local-qwen3-32b');
      done++;
    } else {
      failed++;
    }

    // Progress every 10 — include timing stats
    if ((done + failed) % 10 === 0) {
      const avgMs = callTimes.length > 0 ? Math.round(callTimes.reduce((a, b) => a + b, 0) / callTimes.length) : 0;
      const firstMs = callTimes[0] || 0;
      const recentMs = callTimes.length > 1 ? Math.round(callTimes.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, callTimes.length - 1)) : 0;
      process.stdout.write(`  ... ${done + failed}/${paras.length} (${failed} fail, avg:${avgMs}ms, first:${firstMs}ms, recent:${recentMs}ms)\r`);
    }
  }
  const avgMs = callTimes.length > 0 ? Math.round(callTimes.reduce((a, b) => a + b, 0) / callTimes.length) : 0;
  const firstMs = callTimes[0] || 0;
  const lastMs = callTimes.length > 1 ? callTimes[callTimes.length - 1] : 0;
  const speedup = firstMs > 0 && lastMs > 0 ? (firstMs / lastMs).toFixed(1) : '?';
  console.log(`  ✓ Disambiguated ${done}/${paras.length} (${failed} failed, avg:${avgMs}ms, first:${firstMs}ms→last:${lastMs}ms, ${speedup}x speedup)            `);
  console.log(`  ✓ Disambiguated ${done}/${paras.length} (${failed} failed)            `);
}

async function runHyPE(doc, batchLimit) {
  const paras = await queryAll(
    'SELECT id, paragraph_index, text, context FROM content WHERE doc_id = ? AND hyp_questions IS NULL AND context IS NOT NULL AND deleted_at IS NULL ORDER BY paragraph_index LIMIT ?',
    [doc.id, batchLimit]
  );

  if (paras.length === 0) {
    console.log(`  ✓ All paragraphs have HyPE questions`);
    return;
  }

  console.log(`  ⏳ Generating HyPE for ${paras.length} paragraphs...`);
  let done = 0;
  let failed = 0;

  for (const para of paras) {
    const { systemPrompt, userPrompt } = buildHyPEPrompt(para, para.context, doc);
    const response = await callLocalLLM(systemPrompt, userPrompt, { maxTokens: 150, temperature: 0.5 });
    const questions = parseHyPEResponse(response);

    if (questions && questions.length > 0) {
      await content.updateHypQuestions(para.id, JSON.stringify(questions));
      done++;
    } else {
      failed++;
    }

    if ((done + failed) % 10 === 0) {
      process.stdout.write(`  ... ${done + failed}/${paras.length} (${failed} failed)\r`);
    }
  }
  console.log(`  ✓ HyPE generated for ${done}/${paras.length} (${failed} failed)            `);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
