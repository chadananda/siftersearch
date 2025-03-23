// scripts/init-db.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Function to create database directory if it doesn't exist
function ensureDbDirectory() {
  const dbDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('Created database directory:', dbDir);
  }
}

// Function to initialize a database with schema
async function initializeDatabase(dbName, schemaFiles) {
  const useLocalDb = process.env.NODE_ENV !== 'production' || process.env.USE_LOCAL_DB === 'true';
  let client;
  
  if (useLocalDb) {
    const dbPath = path.join(rootDir, 'data', `${dbName}.db`);
    client = createClient({
      url: `file:${dbPath}`
    });
    console.log(`Initializing local database: ${dbPath}`);
  } else {
    // For production, use Turso
    const dbUrl = process.env[`TURSO_${dbName.toUpperCase()}_DB_URL`];
    const authToken = process.env.TURSO_AUTH_TOKEN;
    
    if (!dbUrl || !authToken) {
      console.error(`Missing Turso configuration for ${dbName} database`);
      return;
    }
    
    client = createClient({
      url: dbUrl,
      authToken
    });
    console.log(`Initializing Turso database: ${dbName}`);
  }
  
  try {
    // Execute each schema file
    for (const schemaFile of schemaFiles) {
      const schemaPath = path.join(rootDir, 'scripts', 'schema', schemaFile);
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Split the schema into individual statements
      const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      // Execute each statement
      for (const statement of statements) {
        await client.execute({ sql: statement });
      }
      
      console.log(`Applied schema from ${schemaFile} to ${dbName} database`);
    }
    
    console.log(`Successfully initialized ${dbName} database`);
  } catch (err) {
    console.error(`Error initializing ${dbName} database:`, err);
  }
}

// Main function
async function main() {
  try {
    // Ensure database directory exists
    ensureDbDirectory();
    
    // Initialize app database
    await initializeDatabase('app', ['api-tables.sql']);
    
    // Initialize library database (if needed)
    // await initializeDatabase('library', ['library-schema.sql']);
    
    console.log('Database initialization completed successfully');
  } catch (err) {
    console.error('Error during database initialization:', err);
    process.exit(1);
  }
}

// Run the main function
main();
