/**
 * Library Watcher Service
 *
 * Background service that manages library document ingestion with two mechanisms:
 *
 * 1. HOURLY SCAN (Primary Ingestion):
 *    - Scans library every hour for stable files
 *    - Files must be at least 4 hours old (not actively edited)
 *    - Files must be newer than the last scan (not already processed)
 *    - This prevents database thrashing during active editing/syncing
 *
 * 2. FILE WATCHER (Delete/Move Detection):
 *    - Watches for real-time file delete events
 *    - Detects file moves via body_hash matching
 *    - DELETEs are held for 60s to detect ADD with matching content (move)
 *    - ADD events also checked against 4h cooldown for immediate ingestion
 *
 * This architecture is stable for Dropbox sync where edits can trigger
 * multiple file events over hours/days.
 */

import { watch } from 'chokidar';
import { readFile, access, stat, readdir } from 'fs/promises';
import { relative, dirname, basename, join } from 'path';
import { ingestDocument, removeDocument, purgeOldDeletedContent, getDocumentByPath, getMovedDocumentByBodyHash, hashContent, parseMarkdownFrontmatter } from './ingester.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { getDb, query, queryOne } from '../lib/db.js';
import { getMeili, INDEXES } from '../lib/search.js';
import { invalidateCache, getAuthority } from '../lib/authority.js';

// Configuration
const DEBOUNCE_MS = 1000;  // Wait for file writes to complete
const ADD_BATCH_MS = 2000;  // Batch ADDs for 2s before processing
const DELETE_DELAY_MS = 60000;  // Hold deletes for 60s waiting for matching ADDs
const REINGEST_COOLDOWN_MS = 4 * 60 * 60 * 1000;  // 4 hours - files must be stable this long before ingestion
const ORPHAN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // Check for orphans every 5 minutes
const LIBRARY_SCAN_INTERVAL_MS = 60 * 60 * 1000;  // Scan library for stable files every hour
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
let libraryScanTimer = null;
let watcherStats = {
  startedAt: null,
  filesIngested: 0,
  filesRemoved: 0,
  filesMoved: 0,
  orphansRemoved: 0,
  metaYamlUpdates: 0,
  reingests: 0,
  errors: 0,
  lastEvent: null,
  lastOrphanCleanup: null,
  lastLibraryScan: null,
  lastScanFilesFound: 0,
  lastScanFilesIngested: 0
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
 * Get the timestamp of the last successful library scan from app_config
 */
async function getLastScanTimestamp() {
  try {
    const result = await queryOne(
      `SELECT value FROM app_config WHERE key = 'library_last_scan'`
    );
    if (result?.value) {
      return new Date(result.value).getTime();
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'No last scan timestamp found');
  }
  return 0; // Return 0 to process all stable files on first run
}

/**
 * Save the timestamp of the last successful library scan to app_config
 */
async function setLastScanTimestamp(timestamp) {
  const isoString = new Date(timestamp).toISOString();
  await query(
    `INSERT OR REPLACE INTO app_config (key, value, updated_at)
     VALUES ('library_last_scan', ?, datetime('now'))`,
    [isoString]
  );
}

/**
 * Recursively scan a directory for .md files
 * Returns array of { absolutePath, relativePath, mtime }
 */
async function scanDirectoryForMarkdown(dirPath, basePath, results = []) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      // Check if path should be ignored
      const shouldIgnore = IGNORED_PATTERNS.some(pattern => {
        if (typeof pattern === 'function') return pattern(fullPath);
        return pattern.test(fullPath);
      });

      if (shouldIgnore) continue;

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        await scanDirectoryForMarkdown(fullPath, basePath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const fileStat = await stat(fullPath);
          results.push({
            absolutePath: fullPath,
            relativePath: relative(basePath, fullPath),
            mtime: fileStat.mtimeMs
          });
        } catch (statErr) {
          logger.debug({ path: fullPath, err: statErr.message }, 'Failed to stat file');
        }
      }
    }
  } catch (err) {
    logger.debug({ path: dirPath, err: err.message }, 'Failed to read directory');
  }

  return results;
}

/**
 * Hourly library scan - finds stable files (>4h old) that need ingestion
 *
 * This is the primary ingestion mechanism. Files must be:
 * 1. At least 4 hours old (stable, not being actively edited)
 * 2. Modified since the last scan (new or changed)
 */
async function scanLibraryForIngestion() {
  const scanStartTime = Date.now();
  logger.info('Starting hourly library scan for stable files');

  try {
    const basePath = config.library.basePath;
    if (!basePath) {
      logger.warn('No library basePath configured, skipping scan');
      return;
    }

    // Get timestamp of last successful scan
    const lastScanTimestamp = await getLastScanTimestamp();
    const stableThreshold = scanStartTime - REINGEST_COOLDOWN_MS;

    logger.debug({
      lastScan: lastScanTimestamp ? new Date(lastScanTimestamp).toISOString() : 'never',
      stableThreshold: new Date(stableThreshold).toISOString()
    }, 'Scan parameters');

    // Scan all .md files in the library
    const allFiles = await scanDirectoryForMarkdown(basePath, basePath);
    watcherStats.lastScanFilesFound = allFiles.length;

    // Filter to files that:
    // 1. Are stable (mtime > 4h ago)
    // 2. Were modified after the last scan
    const filesToProcess = allFiles.filter(file => {
      const isStable = file.mtime < stableThreshold;
      const isNew = file.mtime > lastScanTimestamp;
      return isStable && isNew;
    });

    logger.info({
      totalFiles: allFiles.length,
      stableAndNew: filesToProcess.length,
      lastScan: lastScanTimestamp ? new Date(lastScanTimestamp).toISOString() : 'never'
    }, 'Library scan found files to process');

    let ingestedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const file of filesToProcess) {
      try {
        const content = await readFile(file.absolutePath, 'utf-8');
        const { content: bodyContent } = parseMarkdownFrontmatter(content);
        const bodyHash = hashContent(bodyContent);

        // Check if document exists and content changed
        const existingDoc = await getDocumentByPath(file.relativePath);
        if (existingDoc && existingDoc.body_hash === bodyHash) {
          skippedCount++;
          continue;
        }

        // Ingest the document with file mtime for accurate "added" vs "modified" tracking
        const result = await ingestDocument(content, { file_mtime: new Date(file.mtime).toISOString() }, file.relativePath);

        if (result.skipped) {
          skippedCount++;
        } else {
          ingestedCount++;
          watcherStats.filesIngested++;
          logger.info({
            filePath: file.relativePath,
            documentId: result.documentId,
            status: existingDoc ? 're-ingested' : 'new'
          }, 'Library scan: document ingested');
        }

      } catch (err) {
        errorCount++;
        watcherStats.errors++;
        logger.error({
          err: err.message,
          filePath: file.relativePath
        }, 'Library scan: failed to ingest file');
      }
    }

    // Update last scan timestamp to the start time of this scan
    // This ensures files modified during the scan are picked up next time
    await setLastScanTimestamp(scanStartTime);

    watcherStats.lastLibraryScan = new Date().toISOString();
    watcherStats.lastScanFilesIngested = ingestedCount;

    const durationMs = Date.now() - scanStartTime;
    logger.info({
      durationMs,
      totalFiles: allFiles.length,
      processed: filesToProcess.length,
      ingested: ingestedCount,
      skipped: skippedCount,
      errors: errorCount
    }, 'Library scan complete');

  } catch (err) {
    watcherStats.errors++;
    logger.error({ err: err.message }, 'Library scan failed');
  }
}

/**
 * Process batch of ADD events
 * - ALL documents: Check file mtime - skip if modified less than 4 hours ago (debounce editing)
 * - MOVED documents: ingest immediately (just updating path reference)
 * - NEW/UPDATED documents: Only ingest if file is at least 4 hours old
 */
async function processAddBatch() {
  addBatchTimer = null;

  const adds = new Map(pendingAdds);
  pendingAdds.clear();

  if (adds.size === 0) return;

  logger.info({ count: adds.size }, 'Processing ADD batch');

  for (const [relativePath, { filePath, eventType }] of adds) {
    try {
      // Check file modification time - skip if modified less than 4 hours ago
      // This prevents thrashing during active editing/syncing sessions
      const fileStat = await stat(filePath);
      const timeSinceModification = Date.now() - fileStat.mtimeMs;
      if (timeSinceModification < REINGEST_COOLDOWN_MS) {
        const hoursRemaining = Math.round((REINGEST_COOLDOWN_MS - timeSinceModification) / (60 * 60 * 1000));
        logger.info({
          filePath: relativePath,
          hoursRemaining,
          lastModified: fileStat.mtime.toISOString()
        }, 'Skipping ingestion: file modified within 4 hours');
        continue;
      }

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

        // Process move immediately (just updating the path reference)
        const result = await ingestDocument(content, { file_mtime: fileStat.mtime.toISOString() }, relativePath);
        if (result.status === 'moved') {
          logger.info({
            documentId: result.documentId,
            oldPath: result.oldPath,
            newPath: result.newPath
          }, 'Document path updated');
        }
        continue;
      }

      // Check if document already exists at this path
      const existingDoc = await getDocumentByPath(relativePath);

      if (existingDoc) {
        // Compute file_hash (full content including frontmatter)
        const fileHash = hashContent(content);

        // Check if BOTH body and file are unchanged - truly skip
        if (existingDoc.body_hash === bodyHash && existingDoc.file_hash === fileHash) {
          logger.debug({ filePath, eventType }, 'File unchanged (same body_hash and file_hash), skipped');
          continue;
        }

        // If body unchanged but file changed → frontmatter-only update (call ingester, it handles this)
        // If body changed → full re-ingest
        const changeType = existingDoc.body_hash === bodyHash ? 'frontmatter-only' : 'content';
        logger.info({
          filePath: relativePath,
          documentId: existingDoc.id,
          changeType
        }, changeType === 'frontmatter-only'
          ? 'Re-ingesting document (frontmatter changed, file stable for 4h)'
          : 'Re-ingesting document (content changed, file stable for 4h)');
      }

      // NEW or UPDATED document - ingest (file already passed 4h mtime check)
      const result = await ingestDocument(content, { file_mtime: fileStat.mtime.toISOString() }, relativePath);

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
        }, 'New file ingested');
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

      // Start hourly library scan for stable files
      libraryScanTimer = setInterval(scanLibraryForIngestion, LIBRARY_SCAN_INTERVAL_MS);
      // Run initial scan after 30 seconds (let system stabilize)
      setTimeout(scanLibraryForIngestion, 30000);
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

    // Clear library scan timer
    if (libraryScanTimer) {
      clearInterval(libraryScanTimer);
      libraryScanTimer = null;
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
    cooldownHours: Math.round(REINGEST_COOLDOWN_MS / (60 * 60 * 1000)),
    scanIntervalMinutes: Math.round(LIBRARY_SCAN_INTERVAL_MS / (60 * 1000)),
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

/**
 * Manually trigger library scan for stable files
 * Useful for admin/maintenance
 */
export async function triggerLibraryScan() {
  logger.info('Manual library scan triggered');
  await scanLibraryForIngestion();
  return {
    success: true,
    lastScan: watcherStats.lastLibraryScan,
    filesFound: watcherStats.lastScanFilesFound,
    filesIngested: watcherStats.lastScanFilesIngested
  };
}
