// Export download links as stateless HMAC-signed tokens: any siftersearch-api instance can verify one (11-03: N pm2
// instances — an in-process Map made a link minted on one instance a 401 on the next). Deps: node:crypto.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TOKEN_TTL_MS = 15 * 60 * 1000;
const mac = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

/** Token carrying { documentId, format, options }, valid for TTL from `now`. Pure over (args, secret, now). */
export function signDownloadToken({ documentId, format, options = {} }, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ d: documentId, f: format, o: options, x: now + TOKEN_TTL_MS })).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

/** { documentId, format, options } or null (bad signature, expired, malformed, no secret). Pure over (token, secret, now). */
export function readDownloadToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body, secret)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!(p.x > now)) return null;
    return { documentId: p.d, format: p.f, options: p.o || {} };
  } catch { return null; }
}
