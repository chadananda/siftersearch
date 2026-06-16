#!/usr/bin/env node
// Insert-only repair for OceanLibrary docs whose list items + footnotes were
// silently dropped by the old adapter bug (api/services/site-adapters/oceanlibrary.js,
// fixed 2026-06-16). Re-parses each OL source with the FIXED adapter, diffs
// against what's already in `content` by external_para_id (the source's
// `{id="para_NNNN" …}` is stable and matches the DB), and INSERTS ONLY the
// paragraphs that are missing. Existing rows are never rewritten — their text,
// id, embedding, and synced flag are untouched; only `paragraph_index` is
// renumbered to keep reading order correct (a metadata update that does NOT set
// synced=0, so Meili only re-ingests the newly-inserted rows).
//
// This avoids a full --force re-ingest (which would replace + re-sync all
// ~237K OL paragraphs). Only the ~73K missing rows are embedded + synced.
//
// DRY-RUN by default — writes NOTHING. Review the numbers, then run --apply.
//
// Usage (on tower-nas, AFTER the adapter fix is deployed, with the same env the
// sites-ingester runs under so writes route through the single-writer):
//   node scripts/patch-ol-missing-paragraphs.mjs                      # dry-run, all OL docs
//   node scripts/patch-ol-missing-paragraphs.mjs --file Dawn-Breakers # dry-run, one doc (substring match)
//   node scripts/patch-ol-missing-paragraphs.mjs --apply              # perform the inserts
//   node scripts/patch-ol-missing-paragraphs.mjs --apply --file Dawn-Breakers  # apply to one doc first

import dotenv from 'dotenv';
import { readFile, readdir, stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { config } = await import(join(ROOT, 'api/lib/config.js'));
const { query, queryAll, queryOne, transaction } = await import(join(ROOT, 'api/lib/db.js'));
const { content } = await import(join(ROOT, 'api/lib/content.js'));
const { parseDoc } = await import(join(ROOT, 'api/services/site-adapters/oceanlibrary.js'));
const { hashNormalized, cleanForEmbedding } = await import(join(ROOT, 'api/lib/text-normalize.js'));
const { aiService } = await import(join(ROOT, 'api/lib/ai-services.js'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
// --skip-empty: only touch docs that already have live content (the "partial"
// list/footnote-drop cases). Docs with 0 live content are a separate problem
// (unsegmented mega-paragraphs / never-ingested) handled in a later phase.
const SKIP_EMPTY = args.includes('--skip-empty');
const fileFilter = (() => { const i = args.indexOf('--file'); return i >= 0 ? args[i + 1] : null; })();
const limit = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : null; })();

const EMBEDDING_MODEL = config.ai.embeddings.model;
const SITE_ID = 'oceanlibrary.com';
const basePath = config.library.basePath;
const siteRoot = join(basePath, '-sites', SITE_ID);

// SAFETY: --apply must route writes through the single-writer (worker on :7849),
// or it will contend with the worker for the SQLite write lock (SQLITE_BUSY — the
// very problem the single-writer exists to prevent). Refuse rather than risk it.
if (APPLY && !process.env.SIFTER_WRITER_URL) {
  console.error('✗ REFUSING --apply: SIFTER_WRITER_URL is not set.');
  console.error('  Writes must route through the single-writer. Re-run e.g.:');
  console.error('    SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/patch-ol-missing-paragraphs.mjs --apply');
  process.exit(2);
}

// ── walk the OL source tree ────────────────────────────────────────────────
async function walk(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// ── embedding cache harvest (same idea as sites-ingester.harvestBundles) ────
async function harvestEmbeddings(hashes) {
  const uniq = [...new Set(hashes)];
  if (!uniq.length) return new Map();
  const out = new Map();
  const CHUNK = 200;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const ph = slice.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT normalized_hash, MAX(embedding) AS embedding
         FROM content
        WHERE normalized_hash IN (${ph}) AND embedding IS NOT NULL AND embedding_model = ?
        GROUP BY normalized_hash`,
      [...slice, EMBEDDING_MODEL]
    );
    for (const r of rows) if (r.embedding && r.embedding.length) out.set(r.normalized_hash, r.embedding);
  }
  return out;
}

function toBlob(emb) {
  if (!emb) return null;
  const f32 = emb instanceof Float32Array ? emb : Float32Array.from(emb);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

// ── per-doc patch (dry-run unless APPLY) ────────────────────────────────────
async function patchDoc(absPath) {
  const relPath = relative(basePath, absPath);
  const text = await readFile(absPath, 'utf-8');
  let parsed;
  try { ({ paragraphs: parsed } = await parseDoc(relPath, text, { siteRoot })); }
  catch (e) { return { relPath, status: 'parse_error', error: e.message }; }

  const doc = await queryOne(
    'SELECT id FROM docs WHERE file_path = ? AND deleted_at IS NULL', [relPath]
  );
  if (!doc) return { relPath, status: 'no_db_doc', parsed: parsed.length };
  const docId = doc.id;

  const existing = await queryAll(
    'SELECT id, external_para_id, normalized_hash FROM content WHERE doc_id = ? AND deleted_at IS NULL',
    [docId]
  );
  if (SKIP_EMPTY && existing.length === 0) return { relPath, docId, status: 'skipped_empty', parsed: parsed.length };

  const existingIds = new Set(existing.filter(r => r.external_para_id).map(r => r.external_para_id));
  const existingHashes = new Set(existing.map(r => r.normalized_hash));

  // Missing = parsed paragraphs whose external_para_id (or, for the rare attr-less
  // block, normalized_hash) is not already present for this doc.
  const missing = parsed.filter(p => {
    if (p.external_para_id) return !existingIds.has(p.external_para_id);
    return !existingHashes.has(hashNormalized(p.text));
  });

  const footnotesMissing = missing.filter(p => p.blocktype === 'footnote').length;
  const result = {
    relPath, docId, status: 'ok',
    existing: existing.length, parsed: parsed.length, missing: missing.length,
    footnotesMissing, listOrProseMissing: missing.length - footnotesMissing,
    sampleMissingIds: missing.slice(0, 6).map(p => p.external_para_id || `(null:${p.text.slice(0, 24)}…)`)
  };
  if (!missing.length) { result.status = 'complete'; return result; }
  if (!APPLY) return result;

  // ── APPLY ──────────────────────────────────────────────────────────────
  // 1. embeddings for the missing paragraphs (cache-reuse, then embed misses)
  const hashes = missing.map(p => hashNormalized(p.text));
  const cached = await harvestEmbeddings(hashes);
  const missIdx = missing.map((_, i) => i).filter(i => !cached.has(hashes[i]));
  let fresh = [];
  if (missIdx.length) {
    const texts = missIdx.map(i => cleanForEmbedding(missing[i].text));
    fresh = await aiService('embedding').embed(texts, { caller: 'patch-ol-missing' });
  }
  let fi = 0;
  const rows = missing.map((p, i) => {
    // Cached embeddings are already stored as exact-size blobs — reuse the Buffer
    // directly (round-tripping through Float32Array(.buffer) can read a pooled
    // ArrayBuffer's wrong slice). Fresh embeddings arrive as Array<number>.
    let embedding = null, embeddingModel = null;
    if (cached.has(hashes[i])) {
      embedding = cached.get(hashes[i]);           // Buffer (2048 bytes = 512×f32)
      embeddingModel = EMBEDDING_MODEL;
    } else {
      const e = fresh[fi++];
      if (e) { embedding = toBlob(e); embeddingModel = EMBEDDING_MODEL; }
    }
    return {
      paragraphIndex: p.paragraph_index,           // position in the FULL fixed parse
      text: p.text,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      embedding,
      embeddingModel,
      external_para_id: p.external_para_id || null
    };
  });

  // 2. renumber EXISTING rows' paragraph_index to the full-parse order so the
  //    inserted rows slot in correctly. This updates ONLY paragraph_index — no
  //    synced change → Meili is NOT asked to re-ingest these rows.
  const parsedIndexById = new Map(parsed.filter(p => p.external_para_id).map(p => [p.external_para_id, p.paragraph_index]));
  const ts = new Date().toISOString();
  const updates = [];
  for (const r of existing) {
    if (!r.external_para_id) continue;
    const newIdx = parsedIndexById.get(r.external_para_id);
    if (newIdx !== undefined) updates.push({ sql: 'UPDATE content SET paragraph_index = ?, updated_at = ? WHERE id = ?', args: [newIdx, ts, r.id] });
  }
  for (let i = 0; i < updates.length; i += 200) await transaction(updates.slice(i, i + 200));

  // 3. insert ONLY the missing rows (synced=0 → Meili picks up just these)
  await content.bulkInsertParagraphs(docId, rows);

  // 4. VERIFY this doc: existing ids all still present + unchanged count; new ids added.
  const after = await queryAll(
    'SELECT external_para_id FROM content WHERE doc_id = ? AND deleted_at IS NULL', [docId]
  );
  const afterIds = new Set(after.filter(r => r.external_para_id).map(r => r.external_para_id));
  const lostExisting = [...existingIds].filter(id => !afterIds.has(id));
  const addedCount = after.length - existing.length;
  result.applied = true;
  result.renumbered = updates.length;
  result.inserted = rows.length;
  result.verify_added = addedCount;
  result.verify_no_existing_lost = lostExisting.length === 0;
  result.verify_lost = lostExisting.slice(0, 10);
  result.verify_ok = (lostExisting.length === 0 && addedCount === rows.length);
  return result;
}

// ── main ────────────────────────────────────────────────────────────────────
let files = await walk(siteRoot);
if (fileFilter) files = files.filter(f => f.includes(fileFilter));
if (limit) files = files.slice(0, limit);

console.log(`${APPLY ? '⚙ APPLY' : '🔍 DRY-RUN'} — OL source: ${siteRoot}`);
console.log(`files to inspect: ${files.length}\n`);

const totals = { docs: 0, affected: 0, existing: 0, parsed: 0, missing: 0, footnotes: 0, inserted: 0, renumbered: 0, verifyFail: 0, noDoc: 0, parseErr: 0, skippedEmpty: 0 };
const failures = [];

for (const abs of files) {
  const r = await patchDoc(abs).catch(e => ({ relPath: relative(basePath, abs), status: 'error', error: e.message }));
  totals.docs++;
  if (r.status === 'skipped_empty') { totals.skippedEmpty++; continue; }
  if (r.status === 'no_db_doc') { totals.noDoc++; continue; }
  if (r.status === 'parse_error' || r.status === 'error') { totals.parseErr++; failures.push(r); console.log(`  ✗ ${r.relPath}: ${r.error}`); continue; }
  if (r.status === 'complete') { totals.existing += r.existing; totals.parsed += r.parsed; continue; }
  totals.affected++;
  totals.existing += r.existing; totals.parsed += r.parsed; totals.missing += r.missing; totals.footnotes += r.footnotesMissing;
  if (r.applied) {
    totals.inserted += r.inserted; totals.renumbered += r.renumbered;
    if (!r.verify_ok) { totals.verifyFail++; failures.push(r); }
    console.log(`  ${r.verify_ok ? '✓' : '✗ VERIFY FAILED'} ${r.relPath} — +${r.inserted} (${r.footnotesMissing} fn) | existing ${r.existing} kept=${r.verify_no_existing_lost}`);
  } else {
    console.log(`  • ${r.relPath} — existing ${r.existing}, parsed ${r.parsed}, MISSING ${r.missing} (${r.footnotesMissing} footnotes) e.g. ${r.sampleMissingIds.join(', ')}`);
  }
}

console.log('\n──────── SUMMARY ────────');
console.log(`docs inspected:        ${totals.docs}`);
console.log(`skipped (empty docs):  ${totals.skippedEmpty}`);
console.log(`docs with no DB row:   ${totals.noDoc}`);
console.log(`parse errors:          ${totals.parseErr}`);
console.log(`affected docs:         ${totals.affected}`);
console.log(`existing paragraphs:   ${totals.existing}`);
console.log(`would-be-complete:     ${totals.parsed} (parsed by fixed adapter)`);
console.log(`MISSING paragraphs:    ${totals.missing}  (${totals.footnotes} footnotes, ${totals.missing - totals.footnotes} list/prose)`);
if (APPLY) {
  console.log(`INSERTED:              ${totals.inserted}`);
  console.log(`paragraph_index renumbered (no re-sync): ${totals.renumbered}`);
  console.log(`verify failures:       ${totals.verifyFail}`);
}
if (failures.length) {
  console.log(`\n⚠ ${failures.length} doc(s) need attention:`);
  for (const f of failures.slice(0, 20)) console.log(`   ${f.relPath}: ${f.error || ('lost ' + JSON.stringify(f.verify_lost))}`);
}
process.exit(failures.length && APPLY ? 1 : 0);
