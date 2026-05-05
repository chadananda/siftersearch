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
import yaml from 'yaml';

import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { query, queryOne, queryAll, getSiteDb } from '../lib/db.js';
import { aiService } from '../lib/ai-services.js';
// content.js exports a single named object `content` and re-exports as
// default. Use the named export so `content.deleteParagraphsByDoc` resolves;
// `import * as content` would land in the wrong namespace.
import { content } from '../lib/content.js';
import {
  hashNormalized as normalizedHash,
  hashContent as fileHashOf
} from '../lib/text-normalize.js';

const EMBEDDING_MODEL = config.ai.embeddings.model;
const REINGEST_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h — match watcher

// ─── Site-config discovery ──────────────────────────────────────────────
// Single registry at <library_base>/-sites/sites.yaml — see that file for
// the schema. A repo default lives at config/sites.example.yaml in case the
// operational copy is ever lost.

async function loadSitesRegistry(basePath) {
  const path = join(basePath, '-sites', 'sites.yaml');
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = yaml.parse(raw) || {};
    return parsed.sites || {};
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Sites registry missing: ${path} (copy from config/sites.example.yaml)`);
    }
    throw err;
  }
}

// Apply sensible defaults so a sparse sites.yaml entry still works. The
// defaults are conservative: scope='supplemental' (not site-only), hype_policy
// 'never' (no enrichment cost). meili_index_prefix derives from the site
// hostname if absent.
function withDefaults(siteId, cfg) {
  const scope = cfg.scope || 'supplemental';
  // meili_index_prefix:
  //   - explicit value wins
  //   - site-only sites MUST have one (used for DB filename + index); compute
  //     a sane default from siteId if absent
  //   - supplementals without an explicit prefix → null, meaning "share the
  //     primary `paragraphs` index" (OceanLibrary's existing pattern — its
  //     data is already there and shouldn't be split)
  let prefix = cfg.meili_index_prefix;
  if (prefix === undefined || prefix === null) {
    prefix = scope === 'site-only'
      ? siteId.replace(/\.[a-z]+$/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16)
      : null;
  }
  return {
    id: siteId,
    adapter: cfg.adapter,
    scope,
    authority_default: typeof cfg.authority_default === 'number' ? cfg.authority_default : 5,
    encumbered: cfg.encumbered === true,
    hype_policy: cfg.hype_policy || 'never',
    meili_index_prefix: prefix,
    cadence_minutes: typeof cfg.cadence_minutes === 'number' ? cfg.cadence_minutes : 360,
    supersession_threshold: cfg.supersession_threshold ?? 0.80,
    religion_map: cfg.religion_map || null,
    // Optional absolute path. When set, ingestSite walks this path instead
    // of <library>/-sites/<siteId>. Required for crawler trees outside the
    // Dropbox library so Dropbox doesn't try to sync 1 GB+ of MD.
    site_root: cfg.site_root || null,
    notes: cfg.notes || ''
  };
}

async function loadSiteConfig(basePath, siteId) {
  const registry = await loadSitesRegistry(basePath);
  const cfg = registry[siteId];
  if (!cfg) throw new Error(`Site '${siteId}' not in -sites/sites.yaml`);
  return withDefaults(siteId, cfg);
}

async function loadAdapter(adapterName) {
  const mod = await import(`./site-adapters/${adapterName}.js`);
  if (typeof mod.parseDoc !== 'function' || typeof mod.detectSupersedee !== 'function') {
    throw new Error(`Adapter '${adapterName}' missing required exports parseDoc / detectSupersedee`);
  }
  return mod;
}

// ─── Hash helpers ───────────────────────────────────────────────────────
// Delegated to api/lib/text-normalize.js (imported at the top of this file)
// so the regex used to dedup paragraphs cannot drift between this service,
// the ingester, and the indexer.

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
  // The original implementation joined content+docs in a single query, which
  // confused SQLite's planner — even with idx_content_normalized_hash present,
  // the JOIN pushed it into a near-full content scan (50s on 3.5M rows).
  //
  // Split into two phases:
  //   1. Hash lookup on content alone — tiny, hits the index, returns
  //      doc_id + match count in milliseconds.
  //   2. Filter to candidate doc_ids and load metadata from docs table —
  //      handful of rows, fast lookup by primary key.
  //
  // Chunk size: 100 (down from 500). Smaller chunks distribute work more
  // evenly so any single cold-cache I/O doesn't dominate. Total query count
  // is higher but each query stays in the warm-cache regime once primed.
  const CHUNK = 100;
  const accum = new Map();
  for (let i = 0; i < incomingHashes.length; i += CHUNK) {
    const chunk = incomingHashes.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT doc_id, COUNT(DISTINCT normalized_hash) AS matched
         FROM content
        WHERE normalized_hash IN (${placeholders})
          AND deleted_at IS NULL
        GROUP BY doc_id`,
      chunk
    );
    for (const r of rows) {
      accum.set(r.doc_id, (accum.get(r.doc_id) || 0) + r.matched);
    }
  }
  if (accum.size === 0) return [];

  // Take the top N doc_ids by aggregate hash overlap, then look up metadata
  // and filter out any that are themselves source-site imports or already
  // marked as duplicates.
  const sorted = [...accum.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit * 4);
  const docIds = sorted.map(([id]) => id);
  const placeholders = docIds.map(() => '?').join(',');
  const docs = await queryAll(
    `SELECT id, title, author, paragraph_count, source_site, duplicate_of, deleted_at
       FROM docs WHERE id IN (${placeholders})`,
    docIds
  );
  const docMap = new Map(docs.map(d => [d.id, d]));

  const out = [];
  for (const [docId, matched] of sorted) {
    const d = docMap.get(docId);
    if (!d) continue;
    if (d.deleted_at) continue;
    if (d.source_site) continue;       // skip other imports
    if (d.duplicate_of) continue;      // skip already-superseded docs
    out.push({
      doc_id: d.id,
      doc_title: d.title,
      doc_author: d.author,
      doc_paragraph_count: d.paragraph_count || 0,
      matched_count: matched
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Metadata-based candidate finder ────────────────────────────────────
// Catches the case where OUR copy and the incoming external copy are the
// same work but with different paragraph segmentation OR per-paragraph
// formatting (e.g., our corpus has `[aN]` reference-prefix markers that
// break normalized_hash matching). Title + author normalization is much
// more forgiving than hash equality.
//
// Strategy:
//   1. Pull a small candidate set from docs by exact normalized title.
//   2. If empty, fall back to a substring match on title + same author.
//   3. Filter out source-site, deleted, and already-superseded docs.

function normalizeForCandidate(s) {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')           // strip diacritics
    .replace(/[\u2018\u2019\u02bc\u02bb`'']/g, "'")  // unify apostrophes
    .replace(/[^a-z0-9' ]/g, ' ')              // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

async function findMetadataCandidates(incomingTitle, incomingAuthor, limit = 5) {
  const normTitle = normalizeForCandidate(incomingTitle);
  const normAuthor = normalizeForCandidate(incomingAuthor);
  if (!normTitle || !normAuthor) return [];

  // Pull all non-source-site, non-deleted, non-superseded docs by the same
  // canonical author. Authors are constrained (Bahá'u'lláh, 'Abdu'l-Bahá,
  // Shoghi Effendi, etc.) so this candidate set is small per author.
  // Then JS-side filter for title overlap. A pure-SQL LIKE on stripped-
  // accented title would be cleaner, but SQLite's LIKE doesn't normalize
  // diacritics — we'd miss "Bahá'u'lláh" matching "Bahaullah".
  const rows = await queryAll(
    `SELECT id, title, author, paragraph_count
       FROM docs
      WHERE deleted_at IS NULL
        AND source_site IS NULL
        AND duplicate_of IS NULL`
  );

  const out = [];
  for (const r of rows) {
    const rTitle = normalizeForCandidate(r.title);
    const rAuthor = normalizeForCandidate(r.author);
    if (!rTitle || !rAuthor) continue;
    // Author must be a substring match either way (handles "John E. Esslemont"
    // vs "Esslemont" etc.).
    const authorClose = rAuthor === normAuthor || rAuthor.includes(normAuthor) || normAuthor.includes(rAuthor);
    if (!authorClose) continue;
    // Title: substring either way OR small Levenshtein.
    const titleClose = rTitle === normTitle || rTitle.includes(normTitle) || normTitle.includes(rTitle);
    if (!titleClose) continue;
    out.push({
      doc_id: r.id,
      doc_title: r.title,
      doc_author: r.author,
      doc_paragraph_count: r.paragraph_count || 0,
      matched_count: 0  // metadata path — overlap unknown / not used
    });
    if (out.length >= limit) break;
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

async function upsertDoc(docFields, fileHash, bodyHash, scope = 'primary') {
  const now = new Date().toISOString();
  // db.js's runQuery treats writes via .run() and ignores RETURNING output.
  // For ON CONFLICT DO UPDATE, lastInsertRowid is unreliable (no insert occurred).
  // Do the upsert, then SELECT by file_path to get the canonical id.
  await query(`
    INSERT INTO docs
      (file_path, file_hash, body_hash, title, author, religion, collection,
       language, description, paragraph_count,
       source_site, source_url, external_id, scope,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      scope = excluded.scope,
      duplicate_of = NULL,
      deleted_at = NULL,
      updated_at = excluded.updated_at
  `, [
    docFields.file_path, fileHash, bodyHash,
    docFields.title, docFields.author, docFields.religion, docFields.collection || '',
    docFields.language || 'en', docFields.description || '', docFields.paragraph_count || 0,
    docFields.source_site || null, docFields.source_url || null, docFields.external_id || null,
    scope,
    now, now
  ]);
  const row = await queryOne('SELECT id FROM docs WHERE file_path = ?', [docFields.file_path]);
  if (!row) throw new Error(`upsertDoc: post-upsert SELECT returned no row for ${docFields.file_path}`);
  return Number(row.id);
}

// ─── Site-only DB ops ───────────────────────────────────────────────────
// Site-only sites (e.g. bahaiteachings.org) live in their own SQLite at
// data/sites/<prefix>.db with a strict subset of the primary schema. These
// helpers write to that DB directly via the better-sqlite3 connection so we
// don't have to fork the entire content.js helper layer.
//
// The connection is instrumented (slow-query log auto-tags `db: 'site-<prefix>'`)
// and migrations run on first connect (see api/lib/migrations/site.js).

async function siteDbFindDoc(siteDb, filePath) {
  return siteDb
    .prepare('SELECT id, file_hash FROM docs WHERE file_path = ? AND deleted_at IS NULL')
    .get(filePath) || null;
}

async function siteDbUpsertDoc(siteDb, docFields, fileHash, bodyHash) {
  const now = new Date().toISOString();
  siteDb.prepare(`
    INSERT INTO docs
      (file_path, file_hash, body_hash, title, author, religion, collection,
       language, description, paragraph_count,
       source_site, source_url, external_id, encumbered,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      encumbered = excluded.encumbered,
      deleted_at = NULL,
      updated_at = excluded.updated_at
  `).run(
    docFields.file_path, fileHash, bodyHash,
    docFields.title, docFields.author, docFields.religion, docFields.collection || '',
    docFields.language || 'en', docFields.description || '', docFields.paragraph_count || 0,
    docFields.source_site || null, docFields.source_url || null, docFields.external_id || null,
    docFields.encumbered ? 1 : 0,
    now, now
  );
  const row = siteDb.prepare('SELECT id FROM docs WHERE file_path = ?').get(docFields.file_path);
  if (!row) throw new Error(`siteDbUpsertDoc: post-upsert SELECT returned no row for ${docFields.file_path}`);
  return Number(row.id);
}

function siteDbReplaceContent(siteDb, docId, paragraphs) {
  const txn = siteDb.transaction((rows) => {
    siteDb.prepare('DELETE FROM content WHERE doc_id = ?').run(docId);
    const stmt = siteDb.prepare(`
      INSERT INTO content
        (doc_id, paragraph_index, text, normalized_hash,
         heading, blocktype, language, embedding, embedding_model,
         external_para_id, pdf_page,
         synced, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const p of rows) {
      stmt.run(
        docId, p.paragraphIndex, p.text, p.normalizedHash,
        p.heading || '', p.blocktype || 'paragraph', p.language || 'en',
        p.embedding, p.embedding ? p.embeddingModel : null,
        p.external_para_id || null,
        typeof p.pdf_page === 'number' ? p.pdf_page : null,
        now, now
      );
    }
  });
  txn(paragraphs);
}

// ─── Ingest a single file ───────────────────────────────────────────────

async function ingestOneFile({ adapter, siteConfig, siteRoot, basePath, absPath, threshold, force = false }) {
  const scope = siteConfig.scope || 'supplemental';
  const isSiteOnly = scope === 'site-only';
  const siteDb = isSiteOnly ? await getSiteDb(siteConfig.id, siteConfig.meili_index_prefix) : null;

  const relPath = relative(basePath, absPath);
  const text = await readFile(absPath, 'utf-8');
  const fileHash = fileHashOf(text);

  // Skip if file is too fresh (Dropbox might still be syncing)
  if (!force) {
    const st = await stat(absPath);
    if (Date.now() - st.mtimeMs < REINGEST_COOLDOWN_MS) {
      return { status: 'skipped_cooldown', file: relPath, scope };
    }
  }

  // Skip if unchanged — query the right DB based on scope.
  const existing = isSiteOnly
    ? await siteDbFindDoc(siteDb, relPath)
    : await queryOne('SELECT id, file_hash FROM docs WHERE file_path = ? AND deleted_at IS NULL', [relPath]);
  if (!force && existing && existing.file_hash === fileHash) {
    return { status: 'unchanged', file: relPath, scope };
  }

  // Parse via the site adapter — pass siteConfig so the adapter can look up
  // its religion_map / format hints / etc. without reading config files.
  const { docFields, paragraphs } = await adapter.parseDoc(relPath, text, { siteRoot, siteConfig });
  docFields.file_path = relPath;
  if (siteConfig.encumbered) docFields.encumbered = true;

  if (paragraphs.length === 0) {
    return { status: 'empty', file: relPath, scope };
  }

  // Compute hashes for cache lookup. Always harvest from main `content`
  // table — the embedding cache is cross-corpus, so a paragraph appearing in
  // both bahaiteachings.org and primary reuses the existing embedding.
  const hashes = paragraphs.map(p => normalizedHash(p.text));
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

  // Supersession runs ONLY for scope=primary external sources (currently just
  // OceanLibrary — its content IS the canonical proofread version, and its
  // ingest marks our copies as duplicate_of OL via detectSupersedee).
  //
  // Supplementals (bahai-library, oceanoflights) are additive — they NEVER
  // replace primary, so the candidate queries are pure waste. Skipping them
  // saves ~300-500ms per file × 60K files ≈ 5-9 hours on a full bahai-library
  // ingest. site2rag adapter's detectSupersedee returns null anyway.
  //
  // Site-only DBs are structurally isolated from primary — no supersession
  // possible. Already covered by isSiteOnly above.
  let supersedes = null;
  if (siteConfig.scope === 'primary' && !existing) {
    const [hashCandidates, metaCandidates] = await Promise.all([
      findSupersessionCandidates(hashes),
      findMetadataCandidates(docFields.title, docFields.author)
    ]);
    const decision = adapter.detectSupersedee(
      { title: docFields.title, author: docFields.author, paragraph_count: paragraphs.length },
      hashCandidates,
      metaCandidates,
      { threshold }
    );
    supersedes = decision.supersedes;
    if (supersedes) {
      logger.info({ file: relPath, supersedes, reason: decision.reason }, 'Sites-ingester: supersession detected');
    } else if (metaCandidates.length > 0 || hashCandidates.length > 0) {
      logger.debug({ file: relPath, hash_n: hashCandidates.length, meta_n: metaCandidates.length, reason: decision.reason }, 'Sites-ingester: candidates inspected, no supersession');
    }
  }

  // Build the bulk-insert rows. Same shape regardless of target DB; the
  // site-DB writer just ignores enrichment fields.
  let newIdx = 0;
  const bulkParagraphs = paragraphs.map((p, i) => {
    const bundle = bundles.get(hashes[i]);
    const emb = bundle ? bundle.embedding : newEmbeddings[newIdx++];
    // emb may arrive as Float32Array (from cache) or plain Array<number>
    // (from OpenAI). Buffer.from(plainArray) misinterprets each element as
    // a byte — coerce to Float32Array so the ArrayBuffer is correctly sized.
    let embeddingBlob = null;
    if (emb) {
      const f32 = emb instanceof Float32Array ? emb : Float32Array.from(emb);
      embeddingBlob = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
    }
    return {
      paragraphIndex: p.paragraph_index,
      text: p.text,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      language: p.language || 'en',
      normalizedHash: hashes[i],
      embedding: embeddingBlob,
      embeddingModel: emb ? EMBEDDING_MODEL : null,
      hyp_thesis: bundle?.hyp_thesis || null,
      hyp_questions: bundle?.hyp_questions || null,
      context: bundle?.context || null,
      context_model: bundle?.context_model || null,
      external_para_id: p.external_para_id || null,
      pdf_page: typeof p.pdf_page === 'number' ? p.pdf_page : null
    };
  });

  const bodyHash = fileHashOf(text.replace(/^---\n[\s\S]*?\n---\n/, ''));

  let docId;
  if (isSiteOnly) {
    docId = await siteDbUpsertDoc(siteDb, docFields, fileHash, bodyHash);
    siteDbReplaceContent(siteDb, docId, bulkParagraphs);
  } else {
    docId = await upsertDoc(docFields, fileHash, bodyHash, scope);
    await content.deleteParagraphsByDoc(docId);
    await content.bulkInsertParagraphs(docId, bulkParagraphs);
    if (supersedes) await markSuperseded(supersedes, docId);
  }

  return {
    status: existing ? 're-ingested' : 'new',
    file: relPath,
    doc_id: docId,
    scope,
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

  const siteConfig = await loadSiteConfig(basePath, siteId);
  // site_root override: when set in sites.yaml, the ingester walks that
  // absolute path instead of `<basePath>/-sites/<siteId>`. Used for crawler-
  // produced trees that live OUTSIDE the Dropbox library (e.g. /tank/site2rag/
  // websites_md/<site>) — Dropbox would otherwise try to sync 1 GB+ of MD.
  // Default = the in-library convention, preserved for OceanLibrary.
  const siteRoot = siteConfig.site_root || join(basePath, '-sites', siteId);

  const adapter = await loadAdapter(siteConfig.adapter || siteId);
  const threshold = opts.threshold ?? siteConfig.supersession_threshold ?? 0.80;

  logger.info({ siteId, adapter: siteConfig.adapter || siteId, threshold }, 'Sites-ingester: starting');

  // Pre-warm the supersession index. Run a tiny no-op query against
  // idx_content_norm_active so SQLite pages it into memory before the
  // first real supersession query (which would otherwise pay 50s+ of
  // cold-cache I/O). Cheap: a single index probe with a never-matching
  // hash pulls in the index pages we'll need.
  try {
    const t0 = Date.now();
    await queryAll(
      `SELECT doc_id FROM content WHERE normalized_hash = ? AND deleted_at IS NULL LIMIT 1`,
      ['__warm_cache__']
    );
    logger.info({ ms: Date.now() - t0 }, 'Sites-ingester: index pre-warm complete');
  } catch (err) {
    logger.warn({ err: err.message }, 'Sites-ingester: pre-warm failed (non-fatal)');
  }

  let files = await walkSite(siteRoot);
  // Optional subset for validation runs.
  if (typeof opts.limit === 'number' && opts.limit > 0 && files.length > opts.limit) {
    files = files.slice(0, opts.limit);
    logger.info({ siteId, limit: opts.limit }, 'Sites-ingester: subset run');
  }
  logger.info({ siteId, files: files.length }, 'Sites-ingester: discovered files');

  const stats = { new: 0, re_ingested: 0, unchanged: 0, skipped_cooldown: 0, empty: 0, errors: 0, supersedes: 0 };
  const errors = [];

  for (const abs of files) {
    try {
      const result = await ingestOneFile({
        adapter, siteConfig, siteRoot, basePath, absPath: abs,
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

  // Soft-delete + auto-restore for files that disappeared.
  // Skip reconciliation when running a subset — would falsely soft-delete the
  // 525 books we didn't process this run.
  const reconcile = (typeof opts.limit === 'number' && opts.limit > 0)
    ? { deleted: 0, restored: 0, skipped: 'subset run' }
    : await reconcileDeletes(siteId, basePath, files);

  logger.info({ siteId, stats, reconcile }, 'Sites-ingester: complete');
  return { siteId, stats, reconcile, errors };
}

// ─── Convenience: discover and run all sites ────────────────────────────

// Public registry helpers. Used by the search-scope registry (Phase E) and
// by tests. `loadAllSiteConfigs` returns a map siteId → normalized config
// (with defaults applied), so consumers don't need to call withDefaults
// themselves.
export async function loadAllSiteConfigs() {
  const basePath = config.library.basePath;
  const registry = await loadSitesRegistry(basePath);
  const out = {};
  for (const [siteId, cfg] of Object.entries(registry)) {
    out[siteId] = withDefaults(siteId, cfg);
  }
  return out;
}

export { loadSiteConfig, withDefaults as _normalizeSiteConfig };

export async function ingestAllSites(opts = {}) {
  // Iterate the sites.yaml registry, NOT the -sites/ directory listing.
  // Crawler-derived sites set `site_root` to an absolute path OUTSIDE the
  // Dropbox library (so Dropbox doesn't sync 1 GB+ of MD), and therefore
  // have no directory inside `<library>/-sites/`. Walking the directory
  // would silently skip them.
  //
  // Each site is wrapped in its own try/catch — one site failing does NOT
  // block the others. Errors are logged + reported in the result object.
  let configs;
  try {
    configs = await loadAllSiteConfigs();
  } catch (err) {
    logger.warn({ err: err.message }, 'Sites-ingester: registry not loadable, skipping tick');
    return { sites: [] };
  }
  const results = [];
  for (const siteId of Object.keys(configs)) {
    try {
      const r = await ingestSite(siteId, opts);
      results.push(r);
    } catch (err) {
      logger.error({ siteId, err: err.message }, 'Sites-ingester: site failed');
      results.push({ siteId, error: err.message });
    }
  }
  return { sites: results };
}
