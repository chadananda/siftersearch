import { createReadStream } from 'fs';
import { readdir, mkdir, rename, unlink, writeFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import B2 from 'b2-sdk';

// Configuration
const config = {
  archiveAgeDays: 30,
  dbPatterns: ['app.db', 'library.db', 'core_content.db', 'index_*.db'],
  b2: {
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
    bucket: process.env.B2_BUCKET,
    archiveBucket: process.env.B2_ARCHIVE_BUCKET
  }
};

// Initialize B2
const b2 = new B2(config.b2);

// Utility functions
const ensureDir = async dir => await mkdir(dir, { recursive: true }).catch(() => {});
const isFileOlderThan = async filePath => {
  const stats = await stat(filePath);
  const fileDate = new Date(stats.mtime);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.archiveAgeDays);
  return fileDate < cutoffDate;
};

/**
 * Move file to B2 archive storage and delete local copy
 * @param {string} filePath Local file path
 * @param {string} fileName Remote file name
 */
const moveToB2Archive = async (filePath, fileName) => {
  try {
    await b2.authorize();
    
    // Upload to archive bucket
    const { uploadUrl, authorizationToken } = await b2.getUploadUrl({ 
      bucketId: config.b2.archiveBucket 
    });
    
    await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName,
      data: createReadStream(filePath)
    });

    // Delete from primary bucket if exists
    try {
      const { files } = await b2.listFileNames({
        bucketId: config.b2.bucket,
        prefix: fileName,
        maxFileCount: 1
      });
      
      if (files.length) {
        await b2.deleteFileVersion({
          fileId: files[0].fileId,
          fileName: files[0].fileName
        });
      }
    } catch (err) {
      console.error(`Failed to delete from primary bucket: ${fileName}`, err);
    }

    // Delete local file
    await unlink(filePath);
    console.log(`Archived to B2: ${fileName}`);
  } catch (err) {
    console.error(`B2 archive failed for ${fileName}:`, err);
  }
};

/**
 * Move file to local archive directory
 * @param {string} filePath File path to archive
 * @param {string} libraryId Optional library ID
 */
const moveToLocalArchive = async (filePath, libraryId = '') => {
  const fileName = basename(filePath);
  const archiveDir = join(process.cwd(), 'libraries/archive', libraryId);
  const archivePath = join(archiveDir, fileName);

  await ensureDir(archiveDir)
    .then(() => rename(filePath, archivePath))
    .then(() => console.log(`Archived locally: ${fileName}`))
    .catch(err => console.error(`Local archive failed for ${fileName}:`, err));
};

/**
 * Archive old backups for a specific database
 * @param {string} dbFile Database file name
 * @param {string} libraryId Optional library ID for index DBs
 */
const archiveOldBackups = async (dbFile, libraryId = '') => {
  const backupDir = join(process.cwd(), 'libraries/backups', libraryId);
  const pattern = new RegExp(`^${dbFile.replace('.db', '')}_.*\\.db$`);

  try {
    const backups = await readdir(backupDir)
      .then(files => files.filter(f => pattern.test(f)))
      .then(files => files.map(f => join(backupDir, f)));

    for (const backupPath of backups) {
      if (await isFileOlderThan(backupPath)) {
        const fileName = basename(backupPath);
        const remoteFileName = libraryId ? `${libraryId}/${fileName}` : fileName;
        
        // Archive to B2 first, then local
        await moveToB2Archive(backupPath, remoteFileName)
          .then(() => moveToLocalArchive(backupPath, libraryId));
      }
    }
  } catch (err) {
    console.error(`Failed to process backups for ${dbFile}:`, err);
  }
};

/**
 * Main archive function that handles all database files
 */
const runArchive = async () => {
  console.log('Starting backup archival process...');

  try {
    // Get all library IDs
    const libraries = await readdir(join(process.cwd(), 'libraries'))
      .then(files => files.filter(f => !f.includes('.')))
      .catch(() => []);

    // Archive main DBs
    await Promise.all(config.dbPatterns
      .filter(pattern => !pattern.includes('index_'))
      .map(dbFile => archiveOldBackups(dbFile)));

    // Archive library-specific index DBs
    await Promise.all(libraries.flatMap(libraryId => 
      config.dbPatterns
        .filter(pattern => pattern.includes('index_'))
        .map(pattern => archiveOldBackups(pattern, libraryId))
    ));

    // Create manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      libraries,
      archived: config.dbPatterns.map(pattern => ({
        pattern,
        status: 'checked'
      }))
    };

    await writeFile(
      join(process.cwd(), 'libraries/archive/manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    console.log('Archive process completed successfully');
  } catch (error) {
    console.error('Archive process failed:', error);
    process.exit(1);
  }
};

// Run archive if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runArchive();
}

export { runArchive, archiveOldBackups };