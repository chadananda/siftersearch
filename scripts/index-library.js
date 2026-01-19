#!/usr/bin/env node

/**
 * Ocean Library Indexer
 *
 * Indexes markdown documents from a directory into Meilisearch.
 * Supports file watching for continuous sync.
 *
 * Usage:
 *   node scripts/index-library.js <path> [options]
 *
 * Options:
 *   --dry-run       Show what would be indexed without actually indexing
 *   --limit=N       Only index first N documents
 *   --religion=X    Filter by religion folder (e.g., Baha'i, Islam)
 *   --skip-existing Skip documents that are already indexed
 *   --watch         Watch for changes and re-index modified files
 *   --debounce=N    Debounce time in ms for watch mode (default: 1000)
 */

// Load environment FIRST - must happen before any imports that use config
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Import services (config.js will now see env vars)
import { indexDocumentFromText, getIndexingStatus, removeDocument } from '../api/services/indexer.js';
import { ingestDocument } from '../api/services/ingester.js';
import { getMeili, initializeIndexes, INDEXES } from '../api/lib/search.js';
import { logger } from '../api/lib/logger.js';
import { queryOne } from '../api/lib/db.js';
import { config } from '../api/lib/config.js';
import { ensureServicesRunning } from '../api/lib/services.js';
import { startImportBatch, updateImportProgress, clearImportBatch } from '../api/services/progress.js';
import { startLibraryWatcher, stopLibraryWatcher } from '../api/services/library-watcher.js';

// Get existing document from database by file path
async function getExistingDocument(filePath) {
  const basePath = config.library.basePath;
  const relativePath = path.relative(basePath, filePath);
  return queryOne('SELECT id, file_hash, body_hash FROM docs WHERE file_path = ? AND deleted_at IS NULL', [relativePath]);
}

// Parse CLI arguments
const args = process.argv.slice(2);
// Use CLI path, or fall back to configured library paths
const cliPath = args.find(arg => !arg.startsWith('--'));
const libraryPaths = cliPath ? [cliPath] : config.library.paths;
const dryRun = args.includes('--dry-run');
const watchMode = args.includes('--watch');
const skipExisting = watchMode || args.includes('--skip-existing'); // Default true in watch mode
const clearIndex = args.includes('--clear');
const limitArg = args.find(arg => arg.startsWith('--limit='));
// Allow INDEX_LIMIT env var as default, CLI arg overrides
const envLimit = process.env.INDEX_LIMIT ? parseInt(process.env.INDEX_LIMIT, 10) : Infinity;
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : envLimit;
const religionArg = args.find(arg => arg.startsWith('--religion='));
const religionFilter = religionArg ? religionArg.split('=')[1] : null;
const authorArg = args.find(arg => arg.startsWith('--author='));
const authorFilter = authorArg ? authorArg.split('=')[1] : null;
// Store file hashes to detect actual changes (used during initial indexing)
const fileHashes = new Map();

// Helper to compute file content hash
async function getFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('md5').update(content).digest('hex');
  } catch {
    return null;
  }
}

// Helper to extract metadata from filename and path
// ALWAYS compute relativePath from canonical basePath for deterministic IDs
function extractMetadataFromPath(filePath, basePath) {
  // Use canonical basePath for ID generation - this ensures portable, consistent IDs
  const canonicalBase = config.library.basePath;
  const canonicalRelativePath = path.relative(canonicalBase, filePath);

  // For metadata extraction (religion/collection), use the provided basePath
  const relativePath = path.relative(basePath, filePath);
  const parts = relativePath.split(path.sep);

  // Known religions for inference
  const knownReligions = ["Baha'i", "Islam", "Christianity", "Judaism", "Buddhism", "Hinduism", "Zoroastrianism", "Sikhism", "General"];
  // Known collections for inference
  const knownCollections = ["Pilgrim Notes", "Core Publications", "Core Tablets", "Core Talks", "Core Tablet Translations",
    "Essays", "Baha'i Essays", "Baha'i Books", "Baha'i Talks", "Administrative", "Compilations", "Constitutions",
    "Historical", "Legal", "News", "Press", "Reference", "Studies Papers", "Study Guides", "Prayers", "Tablets", "Translations"];

  const basePathParts = basePath.split(path.sep);

  // Infer religion from base path
  let inferredReligion = null;
  let inferredCollection = null;
  for (let i = 0; i < basePathParts.length; i++) {
    const part = basePathParts[i];
    if (!inferredReligion && knownReligions.includes(part)) {
      inferredReligion = part;
    } else if (inferredReligion && !inferredCollection && knownCollections.includes(part)) {
      inferredCollection = part;
    }
  }

  // If collection not found in known list, use last folder in basePath as collection
  if (inferredReligion && !inferredCollection) {
    const lastFolder = basePathParts[basePathParts.length - 1];
    if (lastFolder !== inferredReligion) {
      inferredCollection = lastFolder;
    }
  }

  // Determine final religion and collection
  // If basePath already includes religion/collection, use those
  // Otherwise fall back to parts from relativePath
  let religion = inferredReligion;
  let collection = inferredCollection;

  // If no religion inferred from basePath, try from relativePath
  if (!religion) {
    religion = knownReligions.includes(parts[0]) ? parts[0] : 'General';
    collection = parts[1] || 'General';
  }

  // If no collection inferred, try from relativePath (but not if it's the filename)
  if (!collection) {
    const firstPart = parts[0] || '';
    const looksLikeFilename = firstPart.endsWith('.md') || /^\d{4}/.test(firstPart) || firstPart.includes(',');
    collection = looksLikeFilename ? 'General' : (parts[0] || 'General');
  }

  const filename = parts[parts.length - 1].replace('.md', '');

  // Try to parse various filename formats
  let year = null;
  let author = 'Unknown';
  let title = filename;

  // Pattern 1: "YYYY, Author Name, Title" or "n.d., Author Name, Title"
  const yearAuthorTitleMatch = filename.match(/^(\d{4}|n\.d\.|unknown),\s*([^,]+),\s*(.+)$/i);
  if (yearAuthorTitleMatch) {
    const [, yearPart, authorPart, titlePart] = yearAuthorTitleMatch;
    year = yearPart.match(/\d{4}/) ? parseInt(yearPart, 10) : null;
    author = authorPart.trim();
    title = titlePart.trim();
  }
  // Pattern 2: "YYYY-MM-DD Title" (date-prefixed documents)
  else if (/^\d{4}-\d{2}-\d{2}\s+/.test(filename)) {
    const match = filename.match(/^(\d{4})-\d{2}-\d{2}\s+(.+)$/);
    if (match) {
      year = parseInt(match[1], 10);
      title = match[2].trim();
      // Try to infer author from collection (e.g., "Baha'i International Community" → "BIC")
      const lastPart = parts[parts.length - 2];
      if (lastPart && lastPart !== religion) {
        author = lastPart;
      }
    }
  }
  // Pattern 3: "Author Name - Title" (most common format)
  else if (filename.includes(' - ')) {
    const dashParts = filename.split(' - ');
    if (dashParts.length === 2) {
      author = dashParts[0].trim();
      title = dashParts[1].trim();
    }
  }
  // Pattern 4: "Author Name, Title" (no year)
  else {
    const authorTitleMatch = filename.match(/^([^,]+),\s*(.+)$/);
    if (authorTitleMatch) {
      // Check if first part looks like a name (contains spaces, not too long)
      const possibleAuthor = authorTitleMatch[1].trim();
      if (possibleAuthor.includes(' ') && possibleAuthor.length < 50) {
        author = possibleAuthor;
        title = authorTitleMatch[2].trim();
      }
    }
  }

  // Pattern 5: Check if parent folder is an author subfolder
  // e.g., Baha'i/Core Tablets/The Báb/001-Address.md → author = "The Báb"
  if (author === 'Unknown' && parts.length > 1) {
    const parentFolder = parts[parts.length - 2];
    // Known author subfolders (Central Figures, prominent authors)
    const knownAuthors = [
      'The Báb', "Báb", 'Bab',
      "Bahá'u'lláh", 'Bahaullah', "Baha'u'llah",
      "'Abdu'l-Bahá", 'Abdul-Baha', "Abdu'l-Baha",
      'Shoghi Effendi',
      'Universal House of Justice', 'UHJ',
      'Muhammad', 'Prophet Muhammad',
      'Buddha', 'Gautama Buddha',
      'Jesus', 'Christ',
      'Rumi', 'Hafiz', 'Saadi',
      'Compilations'
    ];

    // Check if parent folder matches a known author
    const matchedAuthor = knownAuthors.find(a =>
      a.toLowerCase() === parentFolder.toLowerCase() ||
      parentFolder.toLowerCase().includes(a.toLowerCase())
    );

    if (matchedAuthor) {
      // Use the canonical form from knownAuthors
      author = matchedAuthor;
    } else if (
      // Or if parent folder looks like an author name (has spaces, isn't the collection)
      parentFolder.includes(' ') &&
      parentFolder !== collection &&
      !knownCollections.includes(parentFolder) &&
      parentFolder.length < 40
    ) {
      author = parentFolder;
    }
  }

  // Generate unique ID from CANONICAL relative path (ensures consistent IDs)
  const id = canonicalRelativePath
    .replace(/\.md$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .substring(0, 100);

  return {
    id,
    relativePath: canonicalRelativePath,  // Store for ingester
    title,
    author,
    religion,
    collection,
    year,
    // Don't set language here - let frontmatter take precedence
    // language detection happens in indexer.js from frontmatter
    description: `From ${canonicalRelativePath}`
  };
}

// Recursively find all markdown files
async function findMarkdownFiles(dir, basePath = dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip hidden directories
      if (entry.name.startsWith('.')) continue;

      // Apply religion filter
      if (religionFilter && dir === basePath && entry.name !== religionFilter) {
        continue;
      }

      const subFiles = await findMarkdownFiles(fullPath, basePath);
      files.push(...subFiles);
    } else if (entry.name.endsWith('.md') && !entry.name.endsWith('.backup.md')) {
      files.push({
        path: fullPath,
        metadata: extractMetadataFromPath(fullPath, basePath)
      });
    }
  }

  return files;
}

// Check if document exists in index
async function documentExists(filePath) {
  // Check SQLite docs table by file_path (not Meilisearch)
  // SQLite stores relative paths, so convert absolute to relative
  const canonicalBase = config.library.basePath;
  const relativePath = path.relative(canonicalBase, filePath);
  try {
    const doc = await queryOne("SELECT id FROM docs WHERE file_path = ?", [relativePath]);
    return !!doc;
  } catch {
    return false;
  }
}

// Index a single file
async function indexFile(filePath, basePath, force = false) {
  const metadata = extractMetadataFromPath(filePath, basePath);

  // Check if content actually changed
  const currentHash = await getFileHash(filePath);
  if (!currentHash) {
    console.log(`⚠️  Cannot read file: ${filePath}`);
    return { success: false, error: 'Cannot read file' };
  }

  const previousHash = fileHashes.get(filePath);
  if (!force && previousHash === currentHash) {
    return { success: true, skipped: true, reason: 'unchanged' };
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    if (content.length < 100) {
      console.log(`⚠️  SKIP: ${metadata.title} (too short: ${content.length} chars)`);
      return { success: true, skipped: true, reason: 'too_short' };
    }

    // Apply author filter (check frontmatter for author)
    if (authorFilter) {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let docAuthor = metadata.author || '';
      if (frontmatterMatch) {
        const authorMatch = frontmatterMatch[1].match(/^author:\s*(.+)$/m);
        if (authorMatch) docAuthor = authorMatch[1].trim();
      }
      // Case-insensitive partial match (e.g., "Bab" matches "The Báb")
      if (!docAuthor.toLowerCase().includes(authorFilter.toLowerCase())) {
        return { success: true, skipped: true, reason: 'author_filter' };
      }
    }

    // If document exists, remove it first (re-indexing)
    const exists = await documentExists(filePath);
    if (exists) {
      await removeDocument(metadata.id);
    }

    // Index document
    const result = await indexDocumentFromText(content, metadata);
    fileHashes.set(filePath, currentHash);

    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Setup file watcher using library-watcher service
// This provides proper batch processing: ADDs first (detect moves), then DELETEs
function setupWatcher(basePath) {
  console.log('');
  console.log('👀 Watching for changes...');
  console.log('   Press Ctrl+C to stop');
  console.log('');

  // Use the library-watcher service which has proper move detection
  // It batches events for 10s, processes ADDs first (body_hash lookup for moves),
  // then processes DELETEs (skips if content moved to new location)
  startLibraryWatcher(basePath);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('');
    console.log('🛑 Stopping watcher...');
    await stopLibraryWatcher();
    process.exit(0);
  });
}

// Main indexing function
async function indexLibrary() {
  if (!libraryPaths || libraryPaths.length === 0) {
    console.error('Usage: node scripts/index-library.js [path] [options]');
    console.error('');
    console.error('If no path provided, uses config.library.paths');
    console.error('');
    console.error('Options:');
    console.error('  --dry-run       Show what would be indexed without actually indexing');
    console.error('  --limit=N       Only index first N documents');
    console.error('  --religion=X    Filter by religion folder (e.g., Baha\'i, Islam)');
    console.error('  --skip-existing Skip documents that are already indexed');
    console.error('  --watch         Watch for changes and re-index modified files');
    console.error('  --debounce=N    Debounce time in ms for watch mode (default: 1000)');
    console.error('  --clear         Clear existing index before indexing');
    process.exit(1);
  }

  const resolvedPaths = libraryPaths.map(p => path.resolve(p));

  console.log('');
  console.log('📚 Ocean Library Indexer');
  console.log('========================');
  console.log(`Mode: ${config.isDevMode ? 'DEV' : 'PRODUCTION'}`);
  console.log(`Meilisearch: ${config.search.host}`);
  console.log(`Paths (${resolvedPaths.length}):`);
  resolvedPaths.forEach(p => console.log(`  - ${p}`));
  if (dryRun) console.log('Mode: DRY RUN (no actual indexing)');
  if (watchMode) console.log('Mode: WATCH (continuous sync)');
  if (limit < Infinity) console.log(`Limit: ${limit} documents`);
  if (religionFilter) console.log(`Religion filter: ${religionFilter}`);
  if (authorFilter) console.log(`Author filter: ${authorFilter}`);
  if (skipExisting) console.log('Skipping existing documents');
  if (clearIndex) console.log('⚠️  Will CLEAR existing index first');
  console.log('');

  // Check all paths exist
  for (const resolvedPath of resolvedPaths) {
    try {
      await fs.access(resolvedPath);
    } catch {
      console.error(`Error: Path does not exist: ${resolvedPath}`);
      process.exit(1);
    }
  }

  // Ensure Meilisearch is running and indexes are ready
  if (!dryRun) {
    console.log('🔧 Ensuring Meilisearch is running...');
    await ensureServicesRunning();
    console.log('🔧 Ensuring indexes are ready...');
    await initializeIndexes();
    console.log('✅ Meilisearch and indexes ready');

    // Clear index if requested
    if (clearIndex) {
      console.log('');
      console.log('🗑️  Clearing existing indexes...');
      const meili = getMeili();
      await meili.index(INDEXES.DOCUMENTS).deleteAllDocuments();
      await meili.index(INDEXES.PARAGRAPHS).deleteAllDocuments();
      console.log('✅ Indexes cleared');
    }
    console.log('');
  }

  // Find all markdown files from all paths
  console.log('🔍 Scanning for markdown files...');
  let files = [];
  for (const resolvedPath of resolvedPaths) {
    const pathFiles = await findMarkdownFiles(resolvedPath);
    // Tag each file with its base path for metadata extraction
    pathFiles.forEach(f => f.basePath = resolvedPath);
    files = files.concat(pathFiles);
  }
  console.log(`Found ${files.length} markdown files`);
  console.log('');

  // Apply limit
  const filesToProcess = files.slice(0, limit);

  // Stats
  const stats = {
    total: filesToProcess.length,
    indexed: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  // Process files
  console.log(`📝 Processing ${filesToProcess.length} documents...`);
  console.log('');

  // Start tracking import batch (for API progress reporting)
  if (!dryRun) {
    startImportBatch(filesToProcess.length, 'index-library');
  }

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const progress = `[${i + 1}/${filesToProcess.length}]`;

    try {
      // Check if already indexed
      if (skipExisting && !dryRun) {
        const existingDoc = await getExistingDocument(file.path);
        if (existingDoc) {
          // Compute current file hash and compare with stored hash
          const currentHash = await getFileHash(file.path);
          if (currentHash) fileHashes.set(file.path, currentHash);

          // Compare MD5 hash with stored file_hash (convert to compare first 32 chars)
          // If file hasn't changed, skip. Otherwise re-index to pick up changes.
          const storedHash = existingDoc.file_hash;
          if (storedHash && currentHash) {
            // Different hash algorithm, so just check if file content changed via ingestDocument
            // The ingester handles metadata-only vs full re-index internally
            const content = await fs.readFile(file.path, 'utf-8');
            const result = await ingestDocument(content, { file_mtime: new Date().toISOString() }, file.metadata.relativePath);

            if (result.skipped || result.status === 'unchanged') {
              console.log(`${progress} ⏭️  SKIP: ${file.metadata.title} (unchanged)`);
              stats.skipped++;
              updateImportProgress('skipped');
              continue;
            } else if (result.status === 'moved') {
              console.log(`${progress} 📦 MOVED: ${file.metadata.title}`);
              stats.indexed++;
              updateImportProgress('indexed');
              continue;
            } else {
              console.log(`${progress} 🔄 UPDATED: ${file.metadata.title} (${result.paragraphCount || 0} chunks)`);
              stats.indexed++;
              updateImportProgress('indexed');
              continue;
            }
          }

          console.log(`${progress} ⏭️  SKIP: ${file.metadata.title} (already indexed)`);
          stats.skipped++;
          updateImportProgress('skipped');
          continue;
        }
      }

      if (dryRun) {
        console.log(`${progress} 🔍 WOULD INDEX: ${file.metadata.title}`);
        console.log(`         Author: ${file.metadata.author}`);
        console.log(`         Religion: ${file.metadata.religion}`);
        console.log(`         Collection: ${file.metadata.collection}`);
        stats.indexed++;
        continue;
      }

      // Index document
      console.log(`${progress} 📥 Indexing: ${file.metadata.title}`);
      const result = await indexFile(file.path, file.basePath, true);

      if (result.success && !result.skipped) {
        console.log(`         ✅ Indexed ${result.chunks} chunks`);
        stats.indexed++;
        updateImportProgress('completed');
      } else if (result.skipped) {
        console.log(`         ⏭️  Skipped: ${result.reason}`);
        stats.skipped++;
        updateImportProgress('skipped');
      } else {
        throw new Error(result.error);
      }

      // Brief pause to avoid overwhelming the embedding API
      if (i < filesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (err) {
      console.error(`${progress} ❌ FAILED: ${file.metadata.title}`);
      console.error(`         Error: ${err.message}`);
      stats.failed++;
      stats.errors.push({ file: file.path, error: err.message });
      if (!dryRun) {
        updateImportProgress('failed');
      }
    }
  }

  // Clear import batch tracking
  if (!dryRun) {
    clearImportBatch();
  }

  // Print summary
  console.log('');
  console.log('========================');
  console.log('📊 Summary');
  console.log('========================');
  console.log(`Total processed: ${stats.total}`);
  console.log(`Indexed: ${stats.indexed}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const err of stats.errors.slice(0, 10)) {
      console.log(`  - ${path.basename(err.file)}: ${err.error}`);
    }
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more`);
    }
  }

  if (!dryRun) {
    // Check indexing status
    console.log('');
    console.log('🔄 Checking indexing queue...');
    const status = await getIndexingStatus();
    console.log(`Pending tasks: ${status.pending}`);
  }

  console.log('');
  console.log('✅ Initial indexing done!');

  // Start watcher if requested
  if (watchMode && !dryRun) {
    for (const resolvedPath of resolvedPaths) {
      setupWatcher(resolvedPath);
    }
  }
}

// Run
indexLibrary().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
