import { createWriteStream } from 'fs';
import { readdir, mkdir, copyFile, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import B2 from 'b2-sdk';

// Configuration
const config = {
  dbPatterns: ['app.db', 'library.db', 'core_content.db', 'index_*.db'],
  b2: {
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
    bucket: process.env.B2_BUCKET
  }
};

// Initialize B2
const b2 = new B2(config.b2);

// Utility functions
const fileExists = async path => await access(path).then(() => true).catch(() => false);
const ensureDir = async dir => await mkdir(dir, { recursive: true }).catch(() => {});

/**
 * Get latest backup for a database from local storage
 * @param {string} dbFile Database file name
 * @param {string} libraryId Optional library ID for index DBs
 * @returns {Promise<string|null>} Path to latest backup or null
 */
const getLatestLocalBackup = async (dbFile, libraryId = '') => {
  const backupDir = join(process.cwd(), 'libraries/backups', libraryId);
  const pattern = new RegExp(`^${dbFile.replace('.db', '')}_.*\\.db$`);
  
  return await readdir(backupDir)
    .then(files => files.filter(f => pattern.test(f)).sort().reverse())
    .then(backups => backups.length > 0 ? join(backupDir, backups[0]) : null)
    .catch(() => null);
};

/**
 * Download latest backup from B2
 * @param {string} dbFile Database file name
 * @param {string} libraryId Optional library ID for index DBs
 * @returns {Promise<string|null>} Path to downloaded backup or null
 */
const downloadFromB2 = async (dbFile, libraryId = '') => {
  try {
    await b2.authorize();
    
    // List files in B2 bucket with prefix
    const prefix = libraryId ? `${libraryId}/${dbFile.replace('.db', '')}_` : `${dbFile.replace('.db', '')}_`;
    const { files } = await b2.listFileNames({
      bucketId: config.b2.bucket,
      prefix,
      maxFileCount: 1
    });

    if (!files.length) return null;

    // Download latest backup
    const latestFile = files[0];
    const backupDir = join(process.cwd(), 'libraries/backups', libraryId);
    const backupPath = join(backupDir, latestFile.fileName.split('/').pop());
    
    await ensureDir(backupDir);
    
    const response = await b2.downloadFileById({
      fileId: latestFile.fileId,
      responseType: 'stream'
    });

    await new Promise((resolve, reject) => {
      const writer = createWriteStream(backupPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`Downloaded from B2: ${latestFile.fileName}`);
    return backupPath;
  } catch (err) {
    console.error(`B2 download failed for ${dbFile}:`, err);
    return null;
  }
};

/**
 * Create empty database with schema
 * @param {string} dbFile Database file name
 * @param {string} libraryId Optional library ID for index DBs
 */
const createEmptyDatabase = async (dbFile, libraryId = '') => {
  const dbPath = join(process.cwd(), 'libraries', libraryId, dbFile);
  console.log(`Creating new empty database: ${dbFile}`);

  await ensureDir(dirname(dbPath))
    .then(() => writeFile(dbPath, ''))
    .then(() => console.log(`Created empty database: ${dbFile}`))
    .catch(err => console.error(`Failed to create ${dbFile}:`, err));

  // TODO: Apply schema based on database type when we have schema definitions
};

/**
 * Restore single database
 * @param {string} dbFile Database file name
 * @param {string} libraryId Optional library ID for index DBs
 */
const restoreDatabase = async (dbFile, libraryId = '') => {
  const dbPath = join(process.cwd(), 'libraries', libraryId, dbFile);
  console.log(`Checking ${dbFile}...`);

  // If database exists and is valid, skip
  if (await fileExists(dbPath)) {
    console.log(`${dbFile} exists and appears valid, skipping restore`);
    return;
  }

  // Try to get latest backup (local or B2)
  const latestLocal = await getLatestLocalBackup(dbFile, libraryId);
  const backupPath = latestLocal || await downloadFromB2(dbFile, libraryId);
  
  if (backupPath) {
    await ensureDir(dirname(dbPath))
      .then(() => copyFile(backupPath, dbPath))
      .then(() => console.log(`Restored ${dbFile} successfully`))
      .catch(err => console.error(`Failed to restore ${dbFile}:`, err));
  } else {
    console.log(`No backup found for ${dbFile}, creating new database`);
    await createEmptyDatabase(dbFile, libraryId);
  }
};

/**
 * Main restore function that handles all database files
 */
const runRestore = async () => {
  console.log('Starting database restore check...');

  try {
    // Get all library IDs
    const libraries = await readdir(join(process.cwd(), 'libraries'))
      .then(files => files.filter(f => !f.includes('.')))
      .catch(() => []);

    // Restore main DBs
    await Promise.all(config.dbPatterns
      .filter(pattern => !pattern.includes('index_'))
      .map(dbFile => restoreDatabase(dbFile)));

    // Restore library-specific index DBs
    await Promise.all(libraries.flatMap(libraryId => 
      config.dbPatterns
        .filter(pattern => pattern.includes('index_'))
        .map(pattern => restoreDatabase(pattern, libraryId))
    ));

    console.log('Database restore/creation completed successfully');
  } catch (error) {
    console.error('Restore failed:', error);
    process.exit(1);
  }
};

// Run restore if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runRestore();
}

export { runRestore, restoreDatabase };