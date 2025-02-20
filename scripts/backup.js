const fs = require('fs');
const path = require('path');

// Configuration
const MAX_BACKUPS = 10;
const DB_FILES = [
  'app.db',
  'library.db',
  'core_content.db'
];

// Utility to get timestamp string
const getTimestamp = () => {
  return new Date().toISOString().replace(/[:.]/g, '-');
};

// Create backup of a single database file
const backupFile = async (dbFile) => {
  const dbPath = path.join(__dirname, '../libraries', dbFile);
  
  // Check if source file exists
  if (!fs.existsSync(dbPath)) {
    console.log(`Skipping ${dbFile} - file does not exist`);
    return;
  }

  const timestamp = getTimestamp();
  const backupName = `${dbFile.replace('.db', '')}_${timestamp}.db`;
  const backupPath = path.join(__dirname, '../libraries/backups', backupName);

  // Ensure backup directory exists
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Copy file to backup location
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Created backup: ${backupName}`);

  // Cleanup old backups
  const pattern = new RegExp(`^${dbFile.replace('.db', '')}_.*\.db$`);
  const backups = fs.readdirSync(backupDir)
    .filter(file => pattern.test(file))
    .sort()
    .reverse();

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    toDelete.forEach(file => {
      fs.unlinkSync(path.join(backupDir, file));
      console.log(`Deleted old backup: ${file}`);
    });
  }
};

// Main backup function
const runBackup = async () => {
  console.log('Starting database backup...');
  
  try {
    for (const dbFile of DB_FILES) {
      await backupFile(dbFile);
    }
    
    // Create manifest file
    const manifest = {
      timestamp: new Date().toISOString(),
      backups: DB_FILES.map(db => ({
        database: db,
        status: fs.existsSync(path.join(__dirname, '../libraries', db)) ? 'backed up' : 'skipped'
      }))
    };

    fs.writeFileSync(
      path.join(__dirname, '../libraries/backups/manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    console.log('Backup completed successfully');
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
};

// Run backup if this file is executed directly
if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };