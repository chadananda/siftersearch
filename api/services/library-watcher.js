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
import { readFile, access } from 'fs/promises';
import { relative, dirname, basename, join } from 'path';
import { ingestDocument, removeDocument, purgeOldDeletedContent, getDocumentByPath, getMovedDocumentByBodyHash, hashContent, parseMarkdownFrontmatter } from './ingester.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { getDb } from '../lib/db.js';
import { getMeili, INDEXES } from '../lib/search.js';
import { invalidateCache, getAuthority } from '../lib/authority.js';

// Configuration
const DEBOUNCE_MS = 1000;  // Wait for file writes to complete
const ADD_BATCH_MS = 2000;  // Batch ADDs for 2s before processing
const DELETE_DELAY_MS = 60000;  // Hold deletes for 60s waiting for matching ADDs
const ORPHAN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // Check for orphans every 5 minutes
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
let orphanCleanupTimer = null;
let watcherStats = {
  startedAt: null,
  filesIngested: 0,
  filesRemoved: 0,
  filesMoved: 0,
  orphansRemoved: 0,
  metaYamlUpdates: 0,
  errors: 0,
  lastEvent: null,
  lastOrphanCleanup: null
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
 * Check if a file exists on the filesystem
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Periodic cleanup of orphaned documents
 * Removes DB entries for files that no longer exist on the filesystem
 * This catches deletions that weren't detected by file events (e.g., folder deletes via Dropbox)
 * Also purges soft-deleted content older than 30 days
 */
async function cleanupOrphanedDocuments() {
  if (!isEnabled) return;

  logger.debug('Starting orphan cleanup scan');
  const startTime = Date.now();

  try {
    const db = await getDb();
    const basePath = config.library.basePath;

    // Get all ACTIVE documents from DB (exclude already soft-deleted)
    const result = await db.execute('SELECT id, file_path, title FROM docs WHERE deleted_at IS NULL');
    const docs = result.rows;

    let orphansFound = 0;
    const orphanIds = [];

    // Check each document's file existence
    for (const doc of docs) {
      const absolutePath = join(basePath, doc.file_path);
      const exists = await fileExists(absolutePath);

      if (!exists) {
        orphansFound++;
        orphanIds.push(doc.id);
        logger.info({
          docId: doc.id,
          filePath: doc.file_path,
          title: doc.title
        }, 'Orphaned document found - file does not exist');
      }
    }

    // Soft-delete orphaned documents (preserves embeddings for 30 days)
    if (orphanIds.length > 0) {
      for (const docId of orphanIds) {
        try {
          await removeDocument(docId);
          watcherStats.orphansRemoved++;
        } catch (err) {
          logger.error({ err: err.message, docId }, 'Failed to remove orphaned document');
        }
      }

      logger.info({
        orphansFound,
        orphansRemoved: orphanIds.length,
        durationMs: Date.now() - startTime
      }, 'Orphan cleanup complete');
    } else {
      logger.debug({
        docsChecked: docs.length,
        durationMs: Date.now() - startTime
      }, 'Orphan cleanup complete - no orphans found');
    }

    // Purge soft-deleted content older than 30 days (hard delete)
    // This frees up disk space while still allowing embedding reuse for recently deleted content
    try {
      const purgeResult = await purgeOldDeletedContent(30);
      if (purgeResult.contentDeleted > 0 || purgeResult.docsDeleted > 0) {
        logger.info({
          contentDeleted: purgeResult.contentDeleted,
          docsDeleted: purgeResult.docsDeleted
        }, 'Purged old soft-deleted content (30+ days old)');
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to purge old deleted content');
    }

    watcherStats.lastOrphanCleanup = new Date().toISOString();

  } catch (err) {
    watcherStats.errors++;
    logger.error({ err: err.message }, 'Orphan cleanup failed');
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
    // Note: SQLite doesn't store authority - it's calculated from meta.yaml
    // We only need to update Meilisearch where authority is indexed for search ranking
    let query, params;
    if (collection) {
      query = `SELECT id, file_path, author, religion, collection FROM docs WHERE religion = ? AND collection = ?`;
      params = [religion, collection];
    } else {
      query = `SELECT id, file_path, author, religion, collection FROM docs WHERE religion = ?`;
      params = [religion];
    }

    const result = await db.execute({ sql: query, args: params });
    const docs = result.rows;

    if (docs.length === 0) {
      logger.info({ religion, collection }, 'No documents found to update');
      return;
    }

    logger.info({ religion, collection, docCount: docs.length }, 'Recalculating authority for documents');

    // Batch updates for Meilisearch only (SQLite doesn't store authority)
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

      meiliDocUpdates.push({ id: doc.id, authority: newAuthority });
    }

    if (meiliDocUpdates.length === 0) {
      logger.info({ religion, collection }, 'No documents to update in Meilisearch');
      return;
    }

    // Update Meilisearch documents
    await meili.index(INDEXES.DOCUMENTS).updateDocuments(meiliDocUpdates);

    // Update Meilisearch paragraphs (they also have authority field)
    for (const update of meiliDocUpdates) {
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
      docsUpdated: meiliDocUpdates.length,
      paragraphsUpdated: meiliParaUpdates.length
    }, 'Authority updated in Meilisearch from meta.yaml change');

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
    .on('unlinkDir', async (path) => {
      // Directory deleted - trigger immediate orphan cleanup for that path
      const relativePath = toRelativePath(path);
      logger.info({ path: relativePath }, 'Directory deleted - triggering orphan cleanup');
      // Small delay to let any pending file events settle
      setTimeout(() => cleanupOrphanedDocuments(), 5000);
    })
    .on('error', err => {
      watcherStats.errors++;
      logger.error({ err: err.message }, 'Library watcher error');
    })
    .on('ready', () => {
      isEnabled = true;
      watcherStats.startedAt = new Date().toISOString();
      logger.info({ paths }, 'Library watcher ready');

      // Start periodic orphan cleanup
      orphanCleanupTimer = setInterval(cleanupOrphanedDocuments, ORPHAN_CLEANUP_INTERVAL_MS);
      // Run initial cleanup after a short delay
      setTimeout(cleanupOrphanedDocuments, 10000);
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

    // Clear orphan cleanup timer
    if (orphanCleanupTimer) {
      clearInterval(orphanCleanupTimer);
      orphanCleanupTimer = null;
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

/**
 * Manually trigger orphan cleanup
 * Useful for admin/maintenance
 */
export async function triggerOrphanCleanup() {
  logger.info('Manual orphan cleanup triggered');
  await cleanupOrphanedDocuments();
  return { success: true, lastCleanup: watcherStats.lastOrphanCleanup, orphansRemoved: watcherStats.orphansRemoved };
}
