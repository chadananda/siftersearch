// contributors-repo — who may write to Dewey by email (dewey@siftersearch.com): the users row behind an address, with the
// Dewey whitelist flag (users.dewey_access, user migration 8) and tier. Callers: routes/dewey-mail.js. Deps: db (user DB).
import { userQueryOne } from '../db.js';

/** The account for this email address (case-insensitive) → { id, email, name, tier, dewey_access } | null. */
export async function userByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return null;
  return (await userQueryOne('SELECT id, email, name, tier, dewey_access FROM users WHERE LOWER(email) = ? LIMIT 1', [e], 'contributors:by-email')) || null;
}
