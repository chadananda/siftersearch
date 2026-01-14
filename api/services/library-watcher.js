/**
 * Library Watcher Service
 *
 * Background service that watches library directories for file changes
 * and automatically triggers document ingestion/removal.
 *
 * Integrated with API server - starts automatically on server startup.
 */

import { watch } from 'chokidar';
import { readFile } from 'fs/promises';
import { relative } from 'path';
import { ingestDocument, removeDocument, getDocumentByPath, getDocumentByBodyHash } from './ingester.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

// Configuration
const DEBOUNCE_MS = 1000;  // Wait for file writes to complete
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
  errors: 0,
  lastEvent: null
};

/**
 * Convert absolute file path to relative path from library basePath
 */
function toRelativePath(absolutePath) {
  return relative(config.library.basePath, absolutePath);
}

/**
 * Handle file add or change event
 */
async function handleFileChange(filePath, eventType) {
  // Only process markdown files
  if (!filePath.endsWith('.md')) {
    return;
  }

  watcherStats.lastEvent = { type: eventType, path: filePath, at: new Date().toISOString() };

  // Convert path early to check for pending deletes
  const relativePath = toRelativePath(filePath);

  // Cancel any pending delete for this path (file reappeared)
  cancelPendingDelete(relativePath);

  try {
    // Read file content
    const content = await readFile(filePath, 'utf-8');

    // Ingest document (will handle both new and updated files)
    const result = await ingestDocument(content, {}, relativePath);

    if (result.skipped) {
      logger.debug({ filePath, eventType }, 'File unchanged, skipped');
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
    logger.error({ err: err.message, filePath, eventType }, 'Failed to process file change');
  }
}

// Pending deletes - allows cancellation if file was actually moved
const pendingDeletes = new Map();
const DELETE_GRACE_PERIOD_MS = 2000;  // Wait 2s before deleting (allows move detection)

/**
 * Handle file delete event
 * Uses a grace period to avoid deleting files that are being moved
 */
async function handleFileDelete(filePath) {
  // Only process markdown files
  if (!filePath.endsWith('.md')) {
    return;
  }

  watcherStats.lastEvent = { type: 'unlink', path: filePath, at: new Date().toISOString() };
  const relativePath = toRelativePath(filePath);

  // Schedule deletion after grace period
  // If the file reappears (add event), cancel the pending delete
  const timeoutId = setTimeout(async () => {
    pendingDeletes.delete(relativePath);

    try {
      // Re-fetch document to ensure it wasn't moved during grace period
      const doc = await getDocumentByPath(relativePath);

      if (doc) {
        // Check if this content exists at a different path (file was moved, not deleted)
        // This handles the case where add event updated the doc's path before delete fires
        if (doc.body_hash) {
          const movedDoc = await getDocumentByBodyHash(doc.body_hash);
          if (movedDoc && movedDoc.file_path !== relativePath) {
            logger.info({
              filePath,
              newPath: movedDoc.file_path,
              documentId: movedDoc.id
            }, 'File moved to new location, skipping delete');
            return;
          }
        }

        await removeDocument(doc.id);
        watcherStats.filesRemoved++;
        logger.info({ filePath, documentId: doc.id }, 'File removed, document deleted');
      } else {
        // No doc with old path - check if it was moved by body_hash (ingester already updated path)
        logger.debug({ filePath }, 'File removed but no matching document found (possibly moved)');
      }
    } catch (err) {
      watcherStats.errors++;
      logger.error({ err: err.message, filePath }, 'Failed to process file deletion');
    }
  }, DELETE_GRACE_PERIOD_MS);

  pendingDeletes.set(relativePath, timeoutId);
  logger.debug({ filePath }, 'File delete scheduled (grace period)');
}

/**
 * Cancel pending delete (called when file reappears at same path)
 */
function cancelPendingDelete(relativePath) {
  const timeoutId = pendingDeletes.get(relativePath);
  if (timeoutId) {
    clearTimeout(timeoutId);
    pendingDeletes.delete(relativePath);
    logger.debug({ relativePath }, 'Pending delete cancelled (file reappeared)');
    return true;
  }
  return false;
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
    .on('add', path => handleFileChange(path, 'add'))
    .on('change', path => handleFileChange(path, 'change'))
    .on('unlink', path => handleFileDelete(path))
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
    logger.info('Library watcher stopped');
  }
}

/**
 * Get watcher status and stats
 */
export function getWatcherStats() {
  return {
    enabled: isEnabled,
    ...watcherStats
  };
}

/**
 * Check if watcher is running
 */
export function isWatcherRunning() {
  return watcher !== null && isEnabled;
}
