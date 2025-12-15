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
import { watch } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Import services (config.js will now see env vars)
import { indexDocumentFromText, getIndexingStatus, removeDocument } from '../api/services/indexer.js';
import { getMeili, initializeIndexes, INDEXES } from '../api/lib/search.js';
import { logger } from '../api/lib/logger.js';
import { config } from '../api/lib/config.js';
import { ensureServicesRunning } from '../api/lib/services.js';

// Parse CLI arguments
const args = process.argv.slice(2);
// Use CLI path, or fall back to configured library paths
const cliPath = args.find(arg => !arg.startsWith('--'));
const libraryPaths = cliPath ? [cliPath] : config.library.paths;
const dryRun = args.includes('--dry-run');
const skipExisting = args.includes('--skip-existing');
const watchMode = args.includes('--watch');
const clearIndex = args.includes('--clear');
const limitArg = args.find(arg => arg.startsWith('--limit='));
// Allow INDEX_LIMIT env var as default, CLI arg overrides
const envLimit = process.env.INDEX_LIMIT ? parseInt(process.env.INDEX_LIMIT, 10) : Infinity;
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : envLimit;
const religionArg = args.find(arg => arg.startsWith('--religion='));
const religionFilter = religionArg ? religionArg.split('=')[1] : null;
const debounceArg = args.find(arg => arg.startsWith('--debounce='));
const debounceMs = debounceArg ? parseInt(debounceArg.split('=')[1], 10) : 1000;

// Store file hashes to detect actual changes
const fileHashes = new Map();

// Pending changes for debouncing
const pendingChanges = new Map();
let debounceTimer = null;

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
function extractMetadataFromPath(filePath, basePath) {
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
  // Pattern 3: "Title - Author Name"
  else if (filename.includes(' - ')) {
    const dashParts = filename.split(' - ');
    if (dashParts.length === 2) {
      title = dashParts[0].trim();
      author = dashParts[1].trim();
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

  // Generate unique ID from path
  const id = relativePath
    .replace(/\.md$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .substring(0, 100);

  return {
    id,
    title,
    author,
    religion,
    collection,
    year,
    language: 'en', // Default to English
    description: `From ${relativePath}`
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
    } else if (entry.name.endsWith('.md')) {
      files.push({
        path: fullPath,
        metadata: extractMetadataFromPath(fullPath, basePath)
      });
    }
  }

  return files;
}

// Check if document exists in index
async function documentExists(id) {
  try {
    const meili = getMeili();
    await meili.index(INDEXES.DOCUMENTS).getDocument(id);
    return true;
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

    // If document exists, remove it first (re-indexing)
    const exists = await documentExists(metadata.id);
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

// Handle file deletion
async function handleFileDelete(filePath, basePath) {
  const metadata = extractMetadataFromPath(filePath, basePath);

  try {
    const exists = await documentExists(metadata.id);
    if (exists) {
      await removeDocument(metadata.id);
      fileHashes.delete(filePath);
      console.log(`🗑️  Removed from index: ${metadata.title}`);
      return { success: true, removed: true };
    }
    return { success: true, removed: false };
  } catch (err) {
    console.error(`❌ Failed to remove: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Process pending changes (debounced)
async function processPendingChanges(basePath) {
  const changes = new Map(pendingChanges);
  pendingChanges.clear();

  for (const [filePath, eventType] of changes) {
    if (eventType === 'delete') {
      await handleFileDelete(filePath, basePath);
    } else {
      console.log(`📝 ${eventType === 'add' ? 'Indexing new' : 'Re-indexing'}: ${path.basename(filePath)}`);
      const result = await indexFile(filePath, basePath);
      if (result.success && !result.skipped) {
        console.log(`   ✅ Indexed ${result.chunks} chunks`);
      } else if (result.error) {
        console.error(`   ❌ Error: ${result.error}`);
      }
    }
  }
}

// Setup file watcher
function setupWatcher(basePath) {
  console.log('');
  console.log('👀 Watching for changes...');
  console.log('   Press Ctrl+C to stop');
  console.log('');

  // Recursively watch directories
  const watchers = [];

  async function watchDir(dir) {
    try {
      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return;

        const fullPath = path.join(dir, filename);

        // Determine change type
        fs.access(fullPath)
          .then(() => {
            const previousHash = fileHashes.get(fullPath);
            pendingChanges.set(fullPath, previousHash ? 'change' : 'add');
          })
          .catch(() => {
            pendingChanges.set(fullPath, 'delete');
          });

        // Debounce processing
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => processPendingChanges(basePath), debounceMs);
      });

      watchers.push(watcher);
    } catch (err) {
      console.error(`Failed to watch ${dir}: ${err.message}`);
    }
  }

  watchDir(basePath);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    console.log('🛑 Stopping watcher...');
    watchers.forEach(w => w.close());
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

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const progress = `[${i + 1}/${filesToProcess.length}]`;

    try {
      // Check if already indexed
      if (skipExisting && !dryRun) {
        const exists = await documentExists(file.metadata.id);
        if (exists) {
          // Store hash for watch mode
          const hash = await getFileHash(file.path);
          if (hash) fileHashes.set(file.path, hash);

          console.log(`${progress} ⏭️  SKIP: ${file.metadata.title} (already indexed)`);
          stats.skipped++;
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
      } else if (result.skipped) {
        console.log(`         ⏭️  Skipped: ${result.reason}`);
        stats.skipped++;
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
    }
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
