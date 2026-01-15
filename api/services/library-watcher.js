/**
 * Library Watcher Service
 *
 * Background service that watches library directories for file changes
 * and automatically triggers document ingestion/removal.
 *
 * Move Detection Strategy:
 * - ADDs are processed immediately (with body_hash lookup to detect moves)
 * - DELETEs are held in a pending queue for DELETE_DELAY_MS
 * - If an ADD arrives with matching body_hash, the pending delete is cancelled
 * - After the delay, remaining deletes are processed
 *
 * This handles Dropbox sync where DELETE and ADD events can be 30+ seconds apart.
 */

import { watch } from 'chokidar';
import { readFile } from 'fs/promises';
import { relative, dirname, basename } from 'path';
import { ingestDocument, removeDocument, getDocumentByPath, getMovedDocumentByBodyHash, hashContent, parseMarkdownFrontmatter } from './ingester.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { getDb } from '../lib/db.js';
import { getMeili, INDEXES } from '../lib/search.js';
import { invalidateCache, getAuthority } from '../lib/authority.js';

// Configuration
const DEBOUNCE_MS = 1000;  // Wait for file writes to complete
const ADD_BATCH_MS = 2000;  // Batch ADDs for 2s before processing
const DELETE_DELAY_MS = 60000;  // Hold deletes for 60s waiting for matching ADDs
const IGNORED_PATTERNS = [
  // Ignore dotfiles/dotfolders EXCEPT .religion/ and .collection/ (metadata folders)
  (path) => {
    // Allow .religion and .collection folders
    if (/[/\\]\.religion([/\\]|$)/.test(path)) return false;
    if (/[/\\]\.collection([/\\]|$)/.test(path)) return false;
    // Ignore other dotfiles/dotfolders
    return /(^|[/\\])\./.test(path);
  },
  /node_modules/,
  /\.git/,
  /\.DS_Store/
];

let watcher = null;
let isEnabled = false;
let watcherStats = {
  startedAt: null,
  filesIngested: 0,
  filesRemoved: 0,
  filesMoved: 0,
  metaYamlUpdates: 0,
  errors: 0,
  lastEvent: null
};

// Pending ADD events (short batch window)
const pendingAdds = new Map();  // relativePath -> { filePath, eventType }
let addBatchTimer = null;

// Pending DELETE events (long delay for move detection)
// bodyHash -> { relativePath, filePath, docId, timestamp, timerId }
const pendingDeletes = new Map();

/**
 * Convert absolute file path to relative path from library basePath
 */
function toRelativePath(absolutePath) {
  return relative(config.library.basePath, absolutePath);
}

/**
 * Queue an ADD event - processed quickly in batches
 */
function queueAddEvent(filePath, eventType) {
  if (!filePath.endsWith('.md')) return;

  const relativePath = toRelativePath(filePath);
  pendingAdds.set(relativePath, { filePath, eventType });

  watcherStats.lastEvent = { type: eventType, path: filePath, at: new Date().toISOString() };

  // Schedule batch processing
  if (addBatchTimer) clearTimeout(addBatchTimer);
  addBatchTimer = setTimeout(processAddBatch, ADD_BATCH_MS);
}

/**
 * Queue a DELETE event - held for longer to detect moves
 */
async function queueDeleteEvent(filePath) {
  if (!filePath.endsWith('.md')) return;

  const relativePath = toRelativePath(filePath);

  // If there's a pending add for the same path, ignore the delete
  if (pendingAdds.has(relativePath)) {
    logger.debug({ filePath }, 'Delete ignored: pending add for same path');
    return;
  }

  watcherStats.lastEvent = { type: 'unlink', path: filePath, at: new Date().toISOString() };

  // Get document info before it might be removed
  try {
    const doc = await getDocumentByPath(relativePath);
    if (!doc) {
      logger.debug({ filePath }, 'Delete: document not found in database');
      return;
    }

    if (!doc.body_hash) {
      // No body_hash, can't detect moves - delete immediately
      logger.info({ filePath, docId: doc.id }, 'Delete: no body_hash, removing immediately');
      await removeDocument(doc.id);
      watcherStats.filesRemoved++;
      return;
    }

    // Check if we already have a pending delete for this body_hash
    if (pendingDeletes.has(doc.body_hash)) {
      logger.debug({ filePath, bodyHash: doc.body_hash }, 'Delete already pending for this content');
      return;
    }

    // Queue the delete with a delay
    const timerId = setTimeout(() => processPendingDelete(doc.body_hash), DELETE_DELAY_MS);

    pendingDeletes.set(doc.body_hash, {
      relativePath,
      filePath,
      docId: doc.id,
      timestamp: Date.now(),
      timerId
    });

    logger.info({
      filePath,
      docId: doc.id,
      bodyHash: doc.body_hash.substring(0, 16) + '...',
      delayMs: DELETE_DELAY_MS
    }, 'Delete queued - waiting for possible move');

  } catch (err) {
    watcherStats.errors++;
    logger.error({ err: err.message, filePath }, 'Failed to queue delete');
  }
}

/**
 * Process a pending delete after the delay
 */
async function processPendingDelete(bodyHash) {
  const pending = pendingDeletes.get(bodyHash);
  if (!pending) return;

  pendingDeletes.delete(bodyHash);

  try {
    // Final check: does this content exist at a different path now?
    const movedDoc = await getMovedDocumentByBodyHash(bodyHash, pending.relativePath);
    if (movedDoc) {
      watcherStats.filesMoved++;
      logger.info({
        oldPath: pending.relativePath,
        newPath: movedDoc.file_path,
        documentId: movedDoc.id
      }, 'Delete cancelled: content found at new path (move detected)');
      return;
    }

    // Content truly deleted - remove it
    await removeDocument(pending.docId);
    watcherStats.filesRemoved++;
    logger.info({
      filePath: pending.filePath,
      documentId: pending.docId
    }, 'File removed after delay, document deleted');

  } catch (err) {
    watcherStats.errors++;
    logger.error({ err: err.message, filePath: pending.filePath }, 'Failed to process pending delete');
  }
}

/**
 * Process batch of ADD events
 */
async function processAddBatch() {
  addBatchTimer = null;

  const adds = new Map(pendingAdds);
  pendingAdds.clear();

  if (adds.size === 0) return;

  logger.info({ count: adds.size }, 'Processing ADD batch');

  for (const [relativePath, { filePath, eventType }] of adds) {
    try {
      const content = await readFile(filePath, 'utf-8');

      // Compute body hash to check for pending deletes
      const { content: bodyContent } = parseMarkdownFrontmatter(content);
      const bodyHash = hashContent(bodyContent);

      // Check if there's a pending delete with this body_hash - it's a MOVE!
      const pendingDelete = pendingDeletes.get(bodyHash);
      if (pendingDelete) {
        // Cancel the pending delete
        clearTimeout(pendingDelete.timerId);
        pendingDeletes.delete(bodyHash);

        watcherStats.filesMoved++;
        logger.info({
          oldPath: pendingDelete.relativePath,
          newPath: relativePath,
          documentId: pendingDelete.docId,
          bodyHash: bodyHash.substring(0, 16) + '...'
        }, 'Move detected via pending delete - cancelling delete');
      }

      // Ingest document (will find existing by body_hash if moved)
      const result = await ingestDocument(content, {}, relativePath);

      if (result.skipped) {
        logger.debug({ filePath, eventType }, 'File unchanged, skipped');
      } else if (result.status === 'moved') {
        watcherStats.filesMoved++;
        logger.info({
          filePath,
          eventType,
          documentId: result.documentId,
          oldPath: result.oldPath,
          newPath: result.newPath
        }, 'File moved (detected by ingester)');
      } else {
        watcherStats.filesIngested++;
        logger.info({
          filePath,
          eventType,
          documentId: result.documentId,
          paragraphs: result.paragraphCount
        }, 'File ingested');
      }
    } catch (err) {
      watcherStats.errors++;
      logger.error({ err: err.message, filePath, eventType }, 'Failed to process file');
    }
  }
}

/**
 * Handle meta.yaml changes - update authority for all docs in that religion/collection
 * @param {string} filePath - Absolute path to the changed meta.yaml
 */
async function handleMetaYamlChange(filePath) {
  const relativePath = toRelativePath(filePath);

  // Parse path to determine if this is .religion or .collection meta.yaml
  // Examples:
  //   Bahai Faith/.religion/meta.yaml -> religion: "Bahai Faith"
  //   Bahai Faith/Writings of Abdu'l-Baha/.collection/meta.yaml -> religion: "Bahai Faith", collection: "Writings of Abdu'l-Baha"

  const parts = relativePath.split('/');
  const metaFolderIndex = parts.findIndex(p => p === '.religion' || p === '.collection');

  if (metaFolderIndex < 0) {
    logger.debug({ filePath }, 'meta.yaml path does not contain .religion or .collection');
    return;
  }

  const metaFolder = parts[metaFolderIndex];
  const religion = parts[0];
  const collection = metaFolder === '.collection' ? parts[metaFolderIndex - 1] : null;

  logger.info({ religion, collection, metaFolder }, 'meta.yaml changed - updating document authorities');

  // Invalidate authority cache so new values are loaded
  invalidateCache();

  try {
    const db = await getDb();
    const meili = getMeili();

    // Build query based on scope (religion-wide or collection-specific)
    let query, params;
    if (collection) {
      // Collection meta.yaml changed - update docs in this collection
      query = `SELECT id, file_path, author, religion, collection, authority FROM docs WHERE religion = ? AND collection = ?`;
      params = [religion, collection];
    } else {
      // Religion meta.yaml changed - update all docs in this religion that inherit from religion default
      // (docs with explicit collection authority won't be affected)
      query = `SELECT id, file_path, author, religion, collection, authority FROM docs WHERE religion = ?`;
      params = [religion];
    }

    const result = await db.execute({ sql: query, args: params });
    const docs = result.rows;

    if (docs.length === 0) {
      logger.info({ religion, collection }, 'No documents found to update');
      return;
    }

    logger.info({ religion, collection, docCount: docs.length }, 'Recalculating authority for documents');

    // Batch updates for SQLite and Meilisearch
    const sqliteUpdates = [];
    const meiliDocUpdates = [];
    const meiliParaUpdates = [];

    for (const doc of docs) {
      // Check if document has explicit authority override in frontmatter
      // If so, skip it - explicit overrides should not be affected by meta.yaml changes
      try {
        const docFilePath = `${config.library.basePath}/${doc.file_path}`;
        const content = await readFile(docFilePath, 'utf-8');
        const { metadata } = parseMarkdownFrontmatter(content);

        // Skip if document has explicit authority override
        if (metadata.authority !== undefined && metadata.authority !== null) {
          logger.debug({ docId: doc.id, explicitAuthority: metadata.authority }, 'Skipping doc with explicit authority');
          continue;
        }
      } catch (err) {
        // File not readable, skip this document
        logger.debug({ docId: doc.id, err: err.message }, 'Could not read doc file, skipping');
        continue;
      }

      // Calculate new authority using the refreshed cache
      const newAuthority = getAuthority({
        author: doc.author,
        religion: doc.religion,
        collection: doc.collection,
        authority: null  // Pass null to get calculated value (not explicit override)
      });

      // Only update if authority has changed
      if (doc.authority !== newAuthority) {
        sqliteUpdates.push({ id: doc.id, authority: newAuthority });
        meiliDocUpdates.push({ id: doc.id, authority: newAuthority });
      }
    }

    if (sqliteUpdates.length === 0) {
      logger.info({ religion, collection }, 'No authority changes needed');
      return;
    }

    // Update SQLite (batch with transaction)
    const updateStmt = `UPDATE docs SET authority = ?, updated_at = ? WHERE id = ?`;
    const now = new Date().toISOString();

    for (const update of sqliteUpdates) {
      await db.execute({ sql: updateStmt, args: [update.authority, now, update.id] });
    }

    // Update Meilisearch documents
    if (meiliDocUpdates.length > 0) {
      await meili.index(INDEXES.DOCUMENTS).updateDocuments(meiliDocUpdates);
    }

    // Update Meilisearch paragraphs (they also have authority field)
    for (const update of sqliteUpdates) {
      const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `doc_id = ${update.id}`,
        limit: 10000,
        attributesToRetrieve: ['id']
      });

      if (parasResult.hits.length > 0) {
        const paraUpdates = parasResult.hits.map(p => ({
          id: p.id,
          authority: update.authority
        }));
        meiliParaUpdates.push(...paraUpdates);
      }
    }

    // Batch update paragraphs in chunks of 1000
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < meiliParaUpdates.length; i += CHUNK_SIZE) {
      const chunk = meiliParaUpdates.slice(i, i + CHUNK_SIZE);
      await meili.index(INDEXES.PARAGRAPHS).updateDocuments(chunk);
    }

    watcherStats.metaYamlUpdates++;
    watcherStats.lastEvent = { type: 'meta.yaml', path: filePath, at: new Date().toISOString() };

    logger.info({
      religion,
      collection,
      docsUpdated: sqliteUpdates.length,
      paragraphsUpdated: meiliParaUpdates.length
    }, 'Authority updated from meta.yaml change');

  } catch (err) {
    watcherStats.errors++;
    logger.error({ err: err.message, filePath, religion, collection }, 'Failed to handle meta.yaml change');
  }
}

/**
 * Start the library watcher
 * @param {string|string[]} libraryPaths - Path(s) to watch
 */
export function startLibraryWatcher(libraryPaths) {
  if (watcher) {
    logger.warn('Library watcher already running');
    return;
  }

  if (!libraryPaths || (Array.isArray(libraryPaths) && libraryPaths.length === 0)) {
    logger.info('No library paths configured, watcher disabled');
    return;
  }

  const paths = Array.isArray(libraryPaths) ? libraryPaths : [libraryPaths];

  logger.info({ paths }, 'Starting library watcher');

  watcher = watch(paths, {
    ignored: IGNORED_PATTERNS,
    persistent: true,
    ignoreInitial: true,  // Don't process existing files on startup
    awaitWriteFinish: {
      stabilityThreshold: DEBOUNCE_MS,
      pollInterval: 100
    },
    depth: 10  // Watch up to 10 levels deep
  });

  watcher
    .on('add', path => {
      if (path.endsWith('meta.yaml')) {
        handleMetaYamlChange(path);
      } else {
        queueAddEvent(path, 'add');
      }
    })
    .on('change', path => {
      if (path.endsWith('meta.yaml')) {
        handleMetaYamlChange(path);
      } else {
        queueAddEvent(path, 'change');
      }
    })
    .on('unlink', path => queueDeleteEvent(path))
    .on('error', err => {
      watcherStats.errors++;
      logger.error({ err: err.message }, 'Library watcher error');
    })
    .on('ready', () => {
      isEnabled = true;
      watcherStats.startedAt = new Date().toISOString();
      logger.info({ paths }, 'Library watcher ready');
    });
}

/**
 * Stop the library watcher
 */
export async function stopLibraryWatcher() {
  if (watcher) {
    await watcher.close();
    watcher = null;
    isEnabled = false;

    // Clear pending timers
    if (addBatchTimer) {
      clearTimeout(addBatchTimer);
      addBatchTimer = null;
    }

    // Clear pending deletes and their timers
    for (const [, pending] of pendingDeletes) {
      clearTimeout(pending.timerId);
    }
    pendingDeletes.clear();
    pendingAdds.clear();

    logger.info('Library watcher stopped');
  }
}

/**
 * Get watcher status and stats
 */
export function getWatcherStats() {
  return {
    enabled: isEnabled,
    pendingAdds: pendingAdds.size,
    pendingDeletes: pendingDeletes.size,
    ...watcherStats
  };
}

/**
 * Check if watcher is running
 */
export function isWatcherRunning() {
  return watcher !== null && isEnabled;
}
