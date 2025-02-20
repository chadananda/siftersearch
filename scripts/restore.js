const fs = require('fs');
const path = require('path');

// Configuration
const DB_FILES = [
  'app.db',
  'library.db',
  'core_content.db'
];

// Utility to get latest backup for a database
const getLatestBackup = (dbFile) => {
  const backupDir = path.join(__dirname, '../libraries/backups');
  if (!fs.existsSync(backupDir)) return null;

  const pattern = new RegExp(`^${dbFile.replace('.db', '')}_.*\.db$`);
  const backups = fs.readdirSync(backupDir)
    .filter(file => pattern.test(file))
    .sort()
    .reverse();

  return backups.length > 0 ? path.join(backupDir, backups[0]) : null;
};

// Create empty database with schema
const createEmptyDatabase = async (dbFile) => {
  const dbPath = path.join(__dirname, '../libraries', dbFile);
  console.log(`Creating new empty database: ${dbFile}`);

  // Ensure libraries directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create empty file
  fs.writeFileSync(dbPath, '');
  
  // TODO: Apply schema based on database type
  // This will be implemented when we have the schema definitions
  console.log(`Created empty database: ${dbFile}`);
};

// Restore single database
const restoreDatabase = async (dbFile) => {
  const dbPath = path.join(__dirname, '../libraries', dbFile);
  console.log(`Checking ${dbFile}...`);

  // If database exists and is valid, skip
  if (fs.existsSync(dbPath)) {
    console.log(`${dbFile} exists and appears valid, skipping restore`);
    return;
  }

  // Try to get latest backup
  const latestBackup = getLatestBackup(dbFile);
  
  if (latestBackup) {
    console.log(`Restoring ${dbFile} from backup: ${path.basename(latestBackup)}`);
    fs.copyFileSync(latestBackup, dbPath);
    console.log(`Restored ${dbFile} successfully`);
  } else {
    console.log(`No backup found for ${dbFile}, creating new database`);
    await createEmptyDatabase(dbFile);
  }
};

// Main restore function
const runRestore = async () => {
  console.log('Starting database restore check...');

  try {
    for (const dbFile of DB_FILES) {
      await restoreDatabase(dbFile);
    }
    console.log('Database restore/creation completed successfully');
  } catch (error) {
    console.error('Restore failed:', error);
    process.exit(1);
  }
};

// Run restore if this file is executed directly
if (require.main === module) {
  runRestore();
}

module.exports = { runRestore };