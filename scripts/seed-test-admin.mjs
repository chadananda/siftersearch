// Idempotent seeder for the QA/test admin user. Mirrors auth.seedAdminUser but env-driven for a dedicated
// test account (tier=admin, email_verified=1) so every authenticated surface is reachable for QA.
// Creds come from env at run time (TEST_ADMIN_EMAIL / TEST_ADMIN_PASS) — never committed. Writes route
// through the single writer (SIFTER_WRITER_URL from .env-secrets). Re-run any time; safe to delete the row.
//   TEST_ADMIN_EMAIL=… TEST_ADMIN_PASS=… node scripts/seed-test-admin.mjs
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { query, queryOne } = await import('../api/lib/db.js');
const { hashPassword } = await import('../api/lib/auth.js');

const email = (process.env.TEST_ADMIN_EMAIL || '').toLowerCase().trim();
const pass = process.env.TEST_ADMIN_PASS || '';
if (!email || !pass) {
  console.error('seed-test-admin: set TEST_ADMIN_EMAIL and TEST_ADMIN_PASS');
  process.exit(1);
}

const existing = await queryOne('SELECT id, tier, email_verified FROM users WHERE email = ?', [email]);
const passwordHash = await hashPassword(pass);

if (existing) {
  await query('UPDATE users SET password_hash = ?, tier = ?, email_verified = 1 WHERE id = ?',
    [passwordHash, 'admin', existing.id]);
  console.log(JSON.stringify({ action: 'updated', id: existing.id, email, tier: 'admin', email_verified: 1 }));
} else {
  const now = new Date().toISOString();
  const result = await query(
    'INSERT INTO users (email, password_hash, name, tier, email_verified, approved_at) VALUES (?, ?, ?, ?, 1, ?) RETURNING id',
    [email, passwordHash, 'QA Test Admin', 'admin', now]);
  console.log(JSON.stringify({ action: 'created', id: result.rows[0].id, email, tier: 'admin', email_verified: 1 }));
}
process.exit(0);
