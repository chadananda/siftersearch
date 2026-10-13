// Signed one-click PAUSE link for the footer of every Anis letter (Chad, 2026-08-12: the control lives in email
// footers). The link carries no personal data — an opaque hash of the address plus an HMAC — so it can be clicked from
// any mail client without signing in, and cannot be forged for someone else's address. Pure. Deps: node:crypto.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => process.env.ANIS_LINK_SECRET || process.env.JWT_ACCESS_SECRET || 'dev-only';
export const emailHash = (email) => createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex').slice(0, 32);
const sig = (h) => createHmac('sha256', secret()).update(`anis-pause:${h}`).digest('hex').slice(0, 32);

/** The opaque token for an address. */
export const pauseToken = (email) => { const h = emailHash(email); return `${h}.${sig(h)}`; };

/** Verify a token → the address hash, or null. */
export function verifyPauseToken(token) {
  const [h, s] = String(token || '').split('.');
  if (!/^[a-f0-9]{32}$/.test(h || '') || !/^[a-f0-9]{32}$/.test(s || '')) return null;
  return timingSafeEqual(Buffer.from(s), Buffer.from(sig(h))) ? h : null;
}

export const pauseUrl = (email, base = process.env.PUBLIC_API_ORIGIN || 'https://api.siftersearch.com') =>
  `${base}/api/v1/anis/pause?t=${pauseToken(email)}`;
