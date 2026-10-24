// contributors-repo — who may write to Dewey by email (dewey@siftersearch.com): the users row behind an address, with the
// Dewey whitelist flag (users.dewey_access, user migration 8) and tier. Plus the email allowlist (dewey_allowlist, user migration 11): pre-approved addresses get dewey_access=1 once VERIFIED. Callers: routes/dewey-mail.js, routes/auth.js, routes/ops-reports.js. Deps: db (user DB).
import { userQuery, userQueryOne } from '../db.js';

/** The account for this email address (case-insensitive) → { id, email, name, tier, dewey_access } | null. */
export async function userByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return null;
  return (await userQueryOne('SELECT id, email, name, tier, dewey_access FROM users WHERE LOWER(email) = ? LIMIT 1', [e], 'contributors:by-email')) || null;
}

const changed = (r) => Number(r?.rows?.[0]?.changes ?? r?.changes ?? 0);
const norm = (email) => String(email || '').trim().toLowerCase();

/** Grant Dewey (dewey_access only; no tier/approval change) to the account behind an allowlisted address, if verified. → true if now granted. */
export async function grantIfAllowed(email) {
  const e = norm(email);
  if (!e) return false;
  const r = await userQuery(
    `UPDATE users SET dewey_access = 1 WHERE LOWER(email) = ? AND email_verified = 1 AND COALESCE(dewey_access, 0) != 1
       AND EXISTS (SELECT 1 FROM dewey_allowlist WHERE email = ?)`, [e, e], 'contributors:grant-if-allowed');
  return changed(r) > 0;
}

/** Called after any sign-in/signup/me: returns user with dewey_access reflecting the allowlist (idempotent, verified emails only). */
export async function applyAllowlist(user) {
  if (!user?.email || user.tier === 'banned' || Number(user.dewey_access) === 1 || !Number(user.email_verified ?? 1)) return user;
  try { if (await grantIfAllowed(user.email)) return { ...user, dewey_access: 1 }; } catch { /* allowlist must never block sign-in */ }
  return user;
}

/** Add an address (and grant at once if an account exists and is verified). → { email, granted } */
export async function allow(email, note = null, addedBy = 'ops') {
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+$/.test(e)) throw new Error('invalid email');
  await userQuery(
    `INSERT INTO dewey_allowlist (email, note, added_by, added_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET note = COALESCE(excluded.note, note)`, [e, note, addedBy], 'contributors:allow');
  return { email: e, granted: await grantIfAllowed(e) };
}

/** Remove an address. Access already granted stays unless revoke=true. */
export async function disallow(email, revoke = false) {
  const e = norm(email);
  await userQuery('DELETE FROM dewey_allowlist WHERE email = ?', [e], 'contributors:disallow');
  let revoked = false;
  if (revoke) {
    const r = await userQuery(`UPDATE users SET dewey_access = 0 WHERE LOWER(email) = ? AND tier NOT IN ('admin','superadmin')`, [e], 'contributors:revoke');
    revoked = changed(r) > 0;
  }
  return { email: e, removed: true, revoked };
}

export async function isAllowed(email) {
  return !!(await userQueryOne('SELECT 1 AS x FROM dewey_allowlist WHERE email = ?', [norm(email)], 'contributors:is-allowed'));
}

/** Allowlist with account status per address. */
export async function list() {
  const r = await userQuery(
    `SELECT a.email, a.note, a.added_by, a.added_at, u.id AS user_id, u.email_verified, u.dewey_access
       FROM dewey_allowlist a LEFT JOIN users u ON LOWER(u.email) = a.email ORDER BY a.added_at DESC`, [], 'contributors:list');
  return r?.rows || [];
}
