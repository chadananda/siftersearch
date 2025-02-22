import { ROOT_SUPERUSER_EMAIL, ROOT_SUPERUSER_PASSWORD } from '$env/static/private';
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export async function POST({ request }) {
  try {
    const { email } = await request.json();

    // Verify if the email matches ROOT_SUPERUSER_EMAIL
    if (email !== ROOT_SUPERUSER_EMAIL) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure libraries directory exists
    const librariesDir = path.join(process.cwd(), 'libraries');
    if (!fs.existsSync(librariesDir)) {
      fs.mkdirSync(librariesDir, { recursive: true });
    }

    // Initialize app.db if it doesn't exist
    const appDbPath = path.join(librariesDir, 'app.db');
    const appDb = new Database(appDbPath);

    // Create superadmin table if it doesn't exist
    appDb.exec(`
      CREATE TABLE IF NOT EXISTS superadmins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS libraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        domain TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check if superadmin exists, if not create one
    const existingSuperadmin = appDb.prepare('SELECT * FROM superadmins WHERE email = ?').get(ROOT_SUPERUSER_EMAIL);
    
    if (!existingSuperadmin) {
      // In production, you'd want to use a proper password hashing library
      const stmt = appDb.prepare('INSERT INTO superadmins (email, password_hash) VALUES (?, ?)');
      stmt.run(ROOT_SUPERUSER_EMAIL, ROOT_SUPERUSER_PASSWORD);
    }

    appDb.close();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Initialization error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}