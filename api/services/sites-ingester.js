// Sites ingester — drives external-source content (OceanLibrary, etc.) into
// our corpus. Walks `-sites/<siteId>/`, applies the per-site adapter, embeds
// paragraphs (reusing the content-table cache so verbatim paragraphs inherit
// HyPE / disambig from existing rows), inserts docs + content, and runs
// supersession detection so OUR copies of works that an external source has a
// proofed version of get marked `duplicate_of`.
//
// This service is intentionally NOT wired into the live watcher — sites are
// staged in `-sites/` outside the religion-root whitelist, so the watcher
// ignores them. This service is invoked manually (CLI) or on a schedule
// (PM2 + setInterval inside the long-lived process).
//
// Lifecycle handling per file:
//   - new on disk → ingest, run supersession, mark our copy duplicate if matched
//   - changed (file_hash differs) → re-ingest paragraphs (cache fires for unchanged
//     text, carries enrichment forward)
//   - removed from disk → soft-delete the import doc, AND auto-restore any of
//     our docs whose duplicate_of pointed at it

import { readFile, readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import yaml from 'yaml';

import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { query, queryOne, queryAll } from '../lib/db.js';
import { aiService } from '../lib/ai-services.js';
import * as content from '../lib/content.js';

const EMBEDDING_MODEL = config.ai.embeddings.model;
const REINGEST_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h — match watcher

// ─── Site-config discovery ──────────────────────────────────────────────

async function loadSiteConfig(siteRoot) {
  const metaPath = join(siteRoot, '.site', 'meta.yaml');
  try {
    const raw = await readFile(metaPath, 'utf-8');
    return yaml.parse(raw) || {};
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Site config missing: ${metaPath}`);
    }
    throw err;
  }
}

async function loadAdapter(adapterName) {
  const mod = await import(`./site-adapters/${adapterName}.js`);
  if (typeof mod.parseDoc !== 'function' || typeof mod.detectSupersedee !== 'function') {
    throw new Error(`Adapter '${adapterName}' missing required exports parseDoc / detectSupersedee`);
  }
  return mod;
}

// ─── Hash helpers ───────────────────────────────────────────────────────

const HTML_RE = /<[^>]+>/g;
const NON_WORD_RE = /[^\p{L}\p{N}\s]/gu;
function normalizeForEmbedding(t) {
  return t.replace(HTML_RE, '').replace(/\s+/g, ' ').replace(NON_WORD_RE, '').toLowerCase().trim();
}
function normalizedHash(text) {
  return createHash('md5').update(normalizeForEmbedding(text)).digest('hex');
}
function fileHashOf(text) {
  return createHash('md5').update(text).digest('hex');
}

// ─── Walk a site for .md files ──────────────────────────────────────────

async function walkSite(siteRoot, results = []) {
  let entries;
  try { entries = await readdir(siteRoot, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const full = join(siteRoot, entry.name);
    if (entry.isDirectory()) {
      // Skip metadata folders inside the site root
      if (entry.name === '.site' || entry.name === '.bridge') continue;
      if (entry.name.startsWith('.')) continue;
      await walkSite(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// ─── Cache lookup with sidecar harvest ──────────────────────────────────
// Same logic as indexer.getCachedEmbeddings(globalLookup) but without the
// per-doc fast path (sites-ingester docs are new, so no per-doc rows yet).

async function harvestBundles(normalizedHashes) {
  if (normalizedHashes.length === 0) return new Map();
  const placeholders = normalizedHashes.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT normalized_hash,
            MAX(embedding) AS embedding,
            MAX(embedding_model) AS embedding_model,
            MAX(hyp_thesis) AS hyp_thesis,
            MAX(hyp_questions) AS hyp_questions,
            MAX(context) AS context,
            MAX(context_model) AS context_model
       FROM content
      WHERE normalized_hash IN (${placeholders})
        AND embedding IS NOT NULL
        AND embedding_model = ?
      GROUP BY normalized_hash`,
    [...normalizedHashes, EMBEDDING_MODEL]
  );
  const out = new Map();
  for (const r of rows) {
    if (r.embedding && r.embedding.length > 0) {
      out.set(r.normalized_hash, {
        embedding: new Float32Array(r.embedding.buffer || r.embedding),
        embedding_model: r.embedding_model,
        hyp_thesis: r.hyp_thesis,
        hyp_questions: r.hyp_questions,
        context: r.context,
        context_model: r.context_model
      });
    }
  }
  return out;
}

// ─── Supersession candidate query ───────────────────────────────────────
// Find existing docs that share the most normalized_hash with the incoming
// paragraphs. Returns top N candidates with paragraph counts, ordered DESC
// by overlap. Excludes docs already marked source_site (we don't supersede
// imports with imports — only ours-vs-theirs).

async function findSupersessionCandidates(incomingHashes, limit = 5) {
  if (incomingHashes.length === 0) return [];
  // To avoid huge IN clauses on giant docs, chunk if needed.
  const CHUNK = 500;
  const accum = new Map(); // doc_id -> matched_count
  for (let i = 0; i < incomingHashes.length; i += CHUNK) {
    const chunk = incomingHashes.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT c.doc_id, COUNT(DISTINCT c.normalized_hash) AS matched
         FROM content c
         JOIN docs d ON d.id = c.doc_id
        WHERE c.normalized_hash IN (${placeholders})
          AND c.deleted_at IS NULL
          AND d.deleted_at IS NULL
          AND d.source_site IS NULL
          AND d.duplicate_of IS NULL
        GROUP BY c.doc_id`,
      chunk
    );
    for (const r of rows) {
      accum.set(r.doc_id, (accum.get(r.doc_id) || 0) + r.matched);
    }
  }
  if (accum.size === 0) return [];
  const sorted = [...accum.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  // Hydrate doc metadata
  const out = [];
  for (const [docId, matched] of sorted) {
    const d = await queryOne(
      'SELECT id, title, author, paragraph_count FROM docs WHERE id = ?',
      [docId]
    );
    if (!d) continue;
    out.push({
      doc_id: d.id,
      doc_title: d.title,
      doc_author: d.author,
      doc_paragraph_count: d.paragraph_count || 0,
      matched_count: matched
    });
  }
  return out;
}

// ─── Mark / unmark a supersession ───────────────────────────────────────

async function markSuperseded(oldDocId, newDocId) {
  await query('UPDATE docs SET duplicate_of = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newDocId, oldDocId]);
  // Propagate to paragraphs so search/enrichment filters respect it without a join
  await query('UPDATE content SET is_duplicate = 1, synced = 0 WHERE doc_id = ?', [oldDocId]);
}

async function clearSupersedeesOf(deletedDocId) {
  // When a source-site doc is removed, restore any of our docs we'd marked as
  // duplicate_of it: clear the FK, flip is_duplicate=0, mark dirty for re-sync.
  const restored = await queryAll(
    'SELECT id FROM docs WHERE duplicate_of = ?',
    [deletedDocId]
  );
  for (const row of restored) {
    await query('UPDATE docs SET duplicate_of = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    await query('UPDATE content SET is_duplicate = 0, synced = 0 WHERE doc_id = ?', [row.id]);
    logger.info({ restored_doc_id: row.id, after_delete_of: deletedDocId }, 'Sites-ingester: restored superseded doc');
  }
  return restored.length;
}

// ─── Doc upsert (used for both new and re-ingest) ───────────────────────

async function upsertDoc(docFields, fileHash, bodyHash) {
  const now = new Date().toISOString();
  const r = await query(`
    INSERT INTO docs
      (file_path, file_hash, body_hash, title, author, religion, collection,
       language, description, paragraph_count,
       source_site, source_url, external_id,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      file_hash = excluded.file_hash,
      body_hash = excluded.body_hash,
      title = excluded.title,
      author = excluded.author,
      religion = excluded.religion,
      collection = excluded.collection,
      language = excluded.language,
      description = excluded.description,
      paragraph_count = excluded.paragraph_count,
      source_site = excluded.source_site,
      source_url = excluded.source_url,
      external_id = excluded.external_id,
      duplicate_of = NULL,
      deleted_at = NULL,
      updated_at = excluded.updated_at
    RETURNING id
  `, [
    docFields.file_path, fileHash, bodyHash,
    docFields.title, docFields.author, docFields.religion, docFields.collection || '',
    docFields.language || 'en', docFields.description || '', docFields.paragraph_count || 0,
    docFields.source_site || null, docFields.source_url || null, docFields.external_id || null,
    now, now
  ]);
  return Number(r.rows?.[0]?.id || r.lastInsertRowid);
}

// ─── Ingest a single file ───────────────────────────────────────────────

async function ingestOneFile({ adapter, siteRoot, basePath, absPath, threshold, force = false }) {
  const relPath = relative(basePath, absPath);
  const text = await readFile(absPath, 'utf-8');
  const fileHash = fileHashOf(text);

  // Skip if file is too fresh (Dropbox might still be syncing)
  if (!force) {
    const st = await stat(absPath);
    if (Date.now() - st.mtimeMs < REINGEST_COOLDOWN_MS) {
      return { status: 'skipped_cooldown', file: relPath };
    }
  }

  // Skip if unchanged
  const existing = await queryOne(
    'SELECT id, file_hash FROM docs WHERE file_path = ? AND deleted_at IS NULL',
    [relPath]
  );
  if (!force && existing && existing.file_hash === fileHash) {
    return { status: 'unchanged', file: relPath };
  }

  // Parse via the site adapter
  const { docFields, paragraphs } = await adapter.parseDoc(relPath, text, { siteRoot });
  docFields.file_path = relPath;

  if (paragraphs.length === 0) {
    return { status: 'empty', file: relPath };
  }

  // Compute hashes for supersession lookup + cache
  const hashes = paragraphs.map(p => normalizedHash(p.text));

  // Cache lookup (sidecar harvest)
  const bundles = await harvestBundles([...new Set(hashes)]);

  // Generate embeddings for misses
  const missIndices = paragraphs
    .map((_, i) => i)
    .filter(i => !bundles.has(hashes[i]));

  let newEmbeddings = [];
  if (missIndices.length > 0) {
    const missTexts = missIndices.map(i => paragraphs[i].text);
    newEmbeddings = await aiService('embedding').embed(missTexts, { caller: 'sites-ingester' });
  }

  // Supersession detection (only for fresh inserts — re-ingest of an existing
  // import doesn't re-evaluate, since the original mapping was already settled)
  let supersedes = null;
  if (!existing) {
    const candidates = await findSupersessionCandidates(hashes);
    const decision = adapter.detectSupersedee(
      { title: docFields.title, author: docFields.author, paragraph_count: paragraphs.length },
      candidates,
      { threshold }
    );
    supersedes = decision.supersedes;
    if (supersedes) {
      logger.info({ file: relPath, supersedes, reason: decision.reason }, 'Sites-ingester: supersession detected');
    }
  }

  // Upsert doc
  const bodyHash = fileHashOf(text.replace(/^---\n[\s\S]*?\n---\n/, ''));
  const docId = await upsertDoc(docFields, fileHash, bodyHash);

  // Replace content (delete-then-insert via content API)
  await content.deleteParagraphsByDoc(docId);
  let newIdx = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const bundle = bundles.get(hashes[i]);
    const emb = bundle ? bundle.embedding : newEmbeddings[newIdx++];
    const embeddingBlob = emb ? Buffer.from(emb.buffer || emb) : null;

    await content.insertParagraph(docId, {
      paragraphIndex: p.paragraph_index,
      text: p.text,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      embedding: embeddingBlob,
      embeddingModel: emb ? EMBEDDING_MODEL : null,
      hyp_thesis: bundle?.hyp_thesis || null,
      hyp_questions: bundle?.hyp_questions || null,
      context: bundle?.context || null,
      context_model: bundle?.context_model || null,
      external_para_id: p.external_para_id || null
    });
  }

  // Mark supersession
  if (supersedes) await markSuperseded(supersedes, docId);

  return {
    status: existing ? 're-ingested' : 'new',
    file: relPath,
    doc_id: docId,
    paragraphs: paragraphs.length,
    cache_hits: bundles.size,
    new_embeddings: newEmbeddings.length,
    supersedes
  };
}

// ─── Soft-delete docs whose files vanished from disk ─────────────────────

async function reconcileDeletes(siteId, basePath, diskPaths) {
  const onDisk = new Set(diskPaths);
  const inDb = await queryAll(
    `SELECT id, file_path FROM docs WHERE source_site = ? AND deleted_at IS NULL`,
    [siteId]
  );
  let deleted = 0, restored = 0;
  for (const row of inDb) {
    const abs = join(basePath, row.file_path);
    if (onDisk.has(abs)) continue;
    // File gone — soft-delete + auto-restore any docs we'd marked superseded
    await query('UPDATE docs SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    await query('UPDATE content SET deleted_at = CURRENT_TIMESTAMP, synced = 0 WHERE doc_id = ?', [row.id]);
    deleted++;
    restored += await clearSupersedeesOf(row.id);
    logger.info({ doc_id: row.id, file_path: row.file_path }, 'Sites-ingester: file gone, soft-deleted import');
  }
  return { deleted, restored };
}

// ─── Public API: run a single site through the full pipeline ────────────

export async function ingestSite(siteId, opts = {}) {
  const basePath = config.library.basePath;
  if (!basePath) throw new Error('library.basePath not configured');
  const siteRoot = join(basePath, '-sites', siteId);

  const siteConfig = await loadSiteConfig(siteRoot);
  const adapter = await loadAdapter(siteConfig.adapter || siteId);
  const threshold = opts.threshold ?? siteConfig.supersession_threshold ?? 0.80;

  logger.info({ siteId, adapter: siteConfig.adapter || siteId, threshold }, 'Sites-ingester: starting');

  const files = await walkSite(siteRoot);
  logger.info({ siteId, files: files.length }, 'Sites-ingester: discovered files');

  const stats = { new: 0, re_ingested: 0, unchanged: 0, skipped_cooldown: 0, empty: 0, errors: 0, supersedes: 0 };
  const errors = [];

  for (const abs of files) {
    try {
      const result = await ingestOneFile({
        adapter, siteRoot, basePath, absPath: abs,
        threshold, force: !!opts.force
      });
      stats[result.status] = (stats[result.status] || 0) + 1;
      if (result.supersedes) stats.supersedes++;
    } catch (err) {
      stats.errors++;
      errors.push({ file: relative(basePath, abs), error: err.message });
      logger.error({ file: relative(basePath, abs), err: err.message }, 'Sites-ingester: file failed');
    }
  }

  // Soft-delete + auto-restore for files that disappeared
  const reconcile = await reconcileDeletes(siteId, basePath, files);

  logger.info({ siteId, stats, reconcile }, 'Sites-ingester: complete');
  return { siteId, stats, reconcile, errors };
}

// ─── Convenience: discover and run all sites ────────────────────────────

export async function ingestAllSites(opts = {}) {
  const basePath = config.library.basePath;
  const sitesRoot = join(basePath, '-sites');
  let entries = [];
  try { entries = await readdir(sitesRoot, { withFileTypes: true }); } catch { return { sites: [] }; }
  const results = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    try {
      const r = await ingestSite(e.name, opts);
      results.push(r);
    } catch (err) {
      logger.error({ siteId: e.name, err: err.message }, 'Sites-ingester: site failed');
      results.push({ siteId: e.name, error: err.message });
    }
  }
  return { sites: results };
}
