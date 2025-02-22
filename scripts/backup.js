import { createReadStream } from 'fs';
import { readdir, mkdir, copyFile, unlink, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import B2 from 'b2-sdk';

// Configuration
const config = {
  maxBackups: 10,
  dbPatterns: ['app.db', 'library.db', 'core_content.db', 'index_*.db'],
  b2: {
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
    bucket: process.env.B2_BUCKET
  }
};

// Initialize B2
const b2 = new B2(config.b2);

// Utility functions using modern JS features
const getTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const ensureDir = async dir => await mkdir(dir, { recursive: true }).catch(() => {});
const fileExists = async path => await access(path).then(() => true).catch(() => false);
const getBackupName = (dbFile, timestamp) => dbFile.replace('.db', '') + '_' + timestamp + '.db';

/**
 * Upload file to B2 storage
 * @param {string} filePath Local file path
 * @param {string} fileName Remote file name
 */
const uploadToB2 = async (filePath, fileName) => 
  await b2.authorize()
    .then(() => b2.getUploadUrl({ bucketId: config.b2.bucket }))
    .then(({ uploadUrl, authorizationToken }) => b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName,
      data: createReadStream(filePath)
    }))
    .then(() => console.log(`Uploaded to B2: ${fileName}`))
    .catch(err => console.error(`B2 upload failed for ${fileName}:`, err));

/**
 * Get all library IDs, creating libraries directory if it doesn't exist
 * @returns {Promise<string[]>} List of library IDs
 */
const getLibraries = async () => {
  const librariesDir = join(process.cwd(), 'libraries');
  await ensureDir(librariesDir);
  
  return await readdir(librariesDir)
    .then(files => files.filter(f => !f.includes('.') && f !== 'backups' && f !== 'archive'))
    .catch(() => []);
};

/**
 * Ensure library structure exists
 * @param {string} libraryId Library ID
 */
const ensureLibraryStructure = async (libraryId) => {
  const paths = [
    join(process.cwd(), 'libraries', libraryId),
    join(process.cwd(), 'libraries/backups', libraryId),
    join(process.cwd(), 'libraries/archive', libraryId)
  ];
  
  await Promise.all(paths.map(ensureDir));
};

/**
 * Backup a single database file
 * @param {string} dbFile Database file name
 * @param {string} libraryId Optional library ID for index DBs
 */
const backupFile = async (dbFile, libraryId = '') => {
  // Ensure library structure exists if libraryId is provided
  if (libraryId) {
    await ensureLibraryStructure(libraryId);
  }

  const dbPath = join(process.cwd(), 'libraries', libraryId, dbFile);
  if (!await fileExists(dbPath)) {
    console.log(`Skipping ${dbFile} - file does not exist`);
    return;
  }

  const timestamp = getTimestamp();
  const backupName = getBackupName(dbFile, timestamp);
  const backupDir = join(process.cwd(), 'libraries/backups', libraryId);
  const backupPath = join(backupDir, backupName);

  await ensureDir(backupDir)
    .then(() => copyFile(dbPath, backupPath))
    .then(() => uploadToB2(backupPath, `${libraryId}/${backupName}`))
    .then(() => console.log(`Created backup: ${backupName}`))
    .catch(err => console.error(`Backup failed for ${dbFile}:`, err));

  // Cleanup old backups
  const pattern = new RegExp(`^${dbFile.replace('.db', '')}_.*\\.db$`);
  await readdir(backupDir)
    .then(files => files.filter(f => pattern.test(f)).sort().reverse())
    .then(backups => backups.slice(config.maxBackups))
    .then(toDelete => Promise.all(toDelete.map(file => 
      unlink(join(backupDir, file))
        .then(() => console.log(`Deleted old backup: ${file}`))
    )));
};

/**
 * Main backup function that handles all database files
 */
const runBackup = async () => {
  console.log('Starting database backup...');
  
  try {
    // Get all library IDs
    const libraries = await getLibraries();

    // Ensure base backup and archive directories exist
    await Promise.all([
      ensureDir(join(process.cwd(), 'libraries/backups')),
      ensureDir(join(process.cwd(), 'libraries/archive'))
    ]);

    // Backup main DBs
    await Promise.all(config.dbPatterns
      .filter(pattern => !pattern.includes('index_'))
      .map(dbFile => backupFile(dbFile)));

    // Backup library-specific index DBs
    await Promise.all(libraries.flatMap(libraryId => 
      config.dbPatterns
        .filter(pattern => pattern.includes('index_'))
        .map(pattern => backupFile(pattern, libraryId))
    ));

    // Create manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      libraries,
      backups: config.dbPatterns.map(pattern => ({
        pattern,
        status: 'completed'
      }))
    };

    await writeFile(
      join(process.cwd(), 'libraries/backups/manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    console.log('Backup completed successfully');
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
};

// Run backup if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runBackup();
}

export { runBackup, backupFile, ensureLibraryStructure };