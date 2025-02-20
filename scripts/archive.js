const fs = require('fs');
const path = require('path');

// Configuration
const ARCHIVE_AGE_DAYS = 30; // Archive backups older than 30 days
const DB_FILES = [
  'app.db',
  'library.db',
  'core_content.db'
];

// Utility to check if a file is older than specified days
const isFileOlderThan = (filePath, days) => {
  const stats = fs.statSync(filePath);
  const fileDate = new Date(stats.mtime);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return fileDate < cutoffDate;
};

// Move file to archive directory
const moveToArchive = (filePath) => {
  const fileName = path.basename(filePath);
  const archiveDir = path.join(__dirname, '../libraries/archive');
  const archivePath = path.join(archiveDir, fileName);

  // Ensure archive directory exists
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  // Move file to archive
  fs.renameSync(filePath, archivePath);
  console.log(`Archived: ${fileName}`);
};

// Archive old backups for a specific database
const archiveOldBackups = (dbFile) => {
  const backupDir = path.join(__dirname, '../libraries/backups');
  if (!fs.existsSync(backupDir)) return;

  const pattern = new RegExp(`^${dbFile.replace('.db', '')}_.*\.db$`);
  const backups = fs.readdirSync(backupDir)
    .filter(file => pattern.test(file))
    .map(file => path.join(backupDir, file));

  backups.forEach(backupPath => {
    if (isFileOlderThan(backupPath, ARCHIVE_AGE_DAYS)) {
      moveToArchive(backupPath);
    }
  });
};

// Main archive function
const runArchive = async () => {
  console.log('Starting backup archival process...');

  try {
    for (const dbFile of DB_FILES) {
      archiveOldBackups(dbFile);
    }

    // Update manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      archived: DB_FILES.map(db => ({
        database: db,
        status: 'checked'
      }))
    };

    fs.writeFileSync(
      path.join(__dirname, '../libraries/archive/manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    console.log('Archive process completed successfully');
  } catch (error) {
    console.error('Archive process failed:', error);
    process.exit(1);
  }
};

// Run archive if this file is executed directly
if (require.main === module) {
  runArchive();
}

module.exports = { runArchive };