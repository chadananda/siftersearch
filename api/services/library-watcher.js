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
import { ingestDocument, removeDocument, getDocumentByPath } from './ingester.js';
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
  const basePath = config.library.basePath;
  if (absolutePath.startsWith(basePath)) {
    // Remove basePath and leading slash
    let relative = absolutePath.slice(basePath.length);
    if (relative.startsWith('/')) {
      relative = relative.slice(1);
    }
    return relative;
  }
  // Already relative or different base - return as-is
  return absolutePath;
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

  try {
    // Read file content
    const content = await readFile(filePath, 'utf-8');

    // Convert absolute path to relative path for consistent document IDs
    const relativePath = toRelativePath(filePath);

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

/**
 * Handle file delete event
 */
async function handleFileDelete(filePath) {
  // Only process markdown files
  if (!filePath.endsWith('.md')) {
    return;
  }

  watcherStats.lastEvent = { type: 'unlink', path: filePath, at: new Date().toISOString() };

  try {
    // Convert absolute path to relative path for consistent lookup
    const relativePath = toRelativePath(filePath);

    // Get document by path to find its ID
    const doc = await getDocumentByPath(relativePath);

    if (doc) {
      await removeDocument(doc.id);
      watcherStats.filesRemoved++;
      logger.info({ filePath, documentId: doc.id }, 'File removed, document deleted');
    } else {
      logger.debug({ filePath }, 'File removed but no matching document found');
    }
  } catch (err) {
    watcherStats.errors++;
    logger.error({ err: err.message, filePath }, 'Failed to process file deletion');
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
