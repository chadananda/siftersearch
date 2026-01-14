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
import { relative } from 'path';
import { ingestDocument, removeDocument, getDocumentByPath, getMovedDocumentByBodyHash, hashContent, parseMarkdownFrontmatter } from './ingester.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

// Configuration
const DEBOUNCE_MS = 1000;  // Wait for file writes to complete
const ADD_BATCH_MS = 2000;  // Batch ADDs for 2s before processing
const DELETE_DELAY_MS = 60000;  // Hold deletes for 60s waiting for matching ADDs
const IGNORED_PATTERNS = [
  /(^|[/\\])\../,  // dotfiles
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
    .on('add', path => queueAddEvent(path, 'add'))
    .on('change', path => queueAddEvent(path, 'change'))
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
