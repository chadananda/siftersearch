/**
 * Library Watcher Service
 *
 * Background service that watches library directories for file changes
 * and automatically triggers document ingestion/removal.
 *
 * Uses batch processing: collect events, process ADDs first (to detect moves),
 * then process DELETEs (skip if content moved to new location).
 */

import { watch } from 'chokidar';
import { readFile } from 'fs/promises';
import { relative } from 'path';
import { ingestDocument, removeDocument, getDocumentByPath, getMovedDocumentByBodyHash, hashContent, parseMarkdownFrontmatter } from './ingester.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

// Configuration
const DEBOUNCE_MS = 1000;  // Wait for file writes to complete
const BATCH_WINDOW_MS = 2000;  // Collect events for 2s before processing
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

// Event queue for batch processing
const eventQueue = {
  adds: new Map(),      // path -> { filePath, eventType }
  deletes: new Map(),   // path -> { filePath }
  processing: false
};
let batchTimer = null;

/**
 * Convert absolute file path to relative path from library basePath
 */
function toRelativePath(absolutePath) {
  return relative(config.library.basePath, absolutePath);
}

/**
 * Queue an add/change event for batch processing
 */
function queueAddEvent(filePath, eventType) {
  if (!filePath.endsWith('.md')) return;

  const relativePath = toRelativePath(filePath);

  // Add to queue (overwrites if already queued)
  eventQueue.adds.set(relativePath, { filePath, eventType });

  // Remove from deletes if present (file reappeared)
  eventQueue.deletes.delete(relativePath);

  watcherStats.lastEvent = { type: eventType, path: filePath, at: new Date().toISOString() };

  scheduleBatchProcessing();
}

/**
 * Queue a delete event for batch processing
 */
function queueDeleteEvent(filePath) {
  if (!filePath.endsWith('.md')) return;

  const relativePath = toRelativePath(filePath);

  // Only queue delete if there's no pending add for same path
  if (!eventQueue.adds.has(relativePath)) {
    eventQueue.deletes.set(relativePath, { filePath });
  }

  watcherStats.lastEvent = { type: 'unlink', path: filePath, at: new Date().toISOString() };

  scheduleBatchProcessing();
}

/**
 * Schedule batch processing after quiet period
 */
function scheduleBatchProcessing() {
  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  batchTimer = setTimeout(processBatch, BATCH_WINDOW_MS);
}

/**
 * Process queued events: ADDs first (detect moves), then DELETEs
 */
async function processBatch() {
  if (eventQueue.processing) {
    // Already processing, reschedule
    scheduleBatchProcessing();
    return;
  }

  eventQueue.processing = true;
  batchTimer = null;

  // Snapshot current queues and clear them
  const adds = new Map(eventQueue.adds);
  const deletes = new Map(eventQueue.deletes);
  eventQueue.adds.clear();
  eventQueue.deletes.clear();

  const totalEvents = adds.size + deletes.size;
  if (totalEvents === 0) {
    eventQueue.processing = false;
    return;
  }

  logger.info({ adds: adds.size, deletes: deletes.size }, 'Processing file event batch');

  // Track body hashes of added files (to detect moves)
  const addedBodyHashes = new Set();

  // PHASE 1: Process ADDs first (this handles moves via body_hash lookup in ingester)
  for (const [relativePath, { filePath, eventType }] of adds) {
    try {
      const content = await readFile(filePath, 'utf-8');

      // Compute body hash to track for move detection
      const { content: bodyContent } = parseMarkdownFrontmatter(content);
      const bodyHash = hashContent(bodyContent);
      addedBodyHashes.add(bodyHash);

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
        }, 'File moved');
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

  // PHASE 2: Process DELETEs (skip if content exists elsewhere - was moved)
  for (const [relativePath, { filePath }] of deletes) {
    try {
      const doc = await getDocumentByPath(relativePath);

      if (!doc) {
        // Document not found at old path - likely already updated by move
        logger.debug({ filePath }, 'Delete: no document at path (likely moved)');
        continue;
      }

      // Check if this content exists at ANY other path in the database
      // This catches moves even across batch boundaries or from different processes
      if (doc.body_hash) {
        const movedDoc = await getMovedDocumentByBodyHash(doc.body_hash, relativePath);
        if (movedDoc) {
          logger.info({
            filePath,
            newPath: movedDoc.file_path,
            documentId: movedDoc.id
          }, 'Delete skipped: content exists at different path (moved)');
          continue;
        }
      }

      // Content truly deleted - remove document
      await removeDocument(doc.id);
      watcherStats.filesRemoved++;
      logger.info({ filePath, documentId: doc.id }, 'File removed, document deleted');

    } catch (err) {
      watcherStats.errors++;
      logger.error({ err: err.message, filePath }, 'Failed to process file deletion');
    }
  }

  eventQueue.processing = false;

  // Check if more events queued during processing
  if (eventQueue.adds.size > 0 || eventQueue.deletes.size > 0) {
    scheduleBatchProcessing();
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

    // Clear any pending batch
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    eventQueue.adds.clear();
    eventQueue.deletes.clear();

    logger.info('Library watcher stopped');
  }
}

/**
 * Get watcher status and stats
 */
export function getWatcherStats() {
  return {
    enabled: isEnabled,
    pendingAdds: eventQueue.adds.size,
    pendingDeletes: eventQueue.deletes.size,
    ...watcherStats
  };
}

/**
 * Check if watcher is running
 */
export function isWatcherRunning() {
  return watcher !== null && isEnabled;
}
