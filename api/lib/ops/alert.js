// Immediate alert email, one per `key` per quiet window (stamp file in ALERT_DIR), to the hourly digest's recipient.
// Two levels (Chad 10-11: "I want to be able to connect this to an alarm … avoid waking me up on false alarms"):
//   severity 'page'   → "[PAGE] …"   the site is down/degraded AND automation could not fix it. The only level an alarm
//                                    may wake on. Never for a blip the system already recovered from.
//   severity 'action' → "[ACTION] …" a human must act, but it can wait for daylight (credit ran out, deploy blocked…).
// A self-healed event sends nothing (log only). Never throws.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';

const alertDir = () => process.env.ALERT_DIR || '/tank/sifter/alerts';

/** @returns {Promise<boolean>} true when an email went out */
export const SEVERITY_PREFIX = Object.freeze({ page: '[PAGE]', action: '[ACTION]' });
export async function actionRequired({ key, subject, text, html = null, quietMs = 6 * 3600 * 1000, severity = 'action' }, deps = {}) {
  try {
    if (process.env.VITEST && !deps.sendEmail) return false;   // a test run never mails Chad
    const dir = deps.dir || alertDir();
    const stamp = join(dir, `${String(key).replace(/[^a-z0-9_-]/gi, '_')}.json`);
    const now = deps.now ?? Date.now();
    if (existsSync(stamp)) {
      try { if (now - JSON.parse(readFileSync(stamp, 'utf8')).at < quietMs) return false; } catch { /* resend */ }
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(stamp, JSON.stringify({ at: now, subject }));
    const to = deps.to || process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
    if (!to) { logger.error({ key, subject }, 'ACTION REQUIRED and no alert recipient (set DIGEST_EMAIL)'); return false; }
    const send = deps.sendEmail || (await import('../../services/email.js')).sendEmail;
    const prefix = SEVERITY_PREFIX[severity] || SEVERITY_PREFIX.action;
    await send({ to, subject: `${prefix} ${subject}`, text, html: html || `<pre>${String(text).replace(/</g, '&lt;')}</pre>` });
    logger.error({ key, subject, severity }, `${prefix} alert sent`);
    return true;
  } catch (e) {
    logger.warn({ err: e.message, key }, 'action-required alert failed');
    return false;
  }
}

/** Clear a key's stamp — call when the condition has recovered, so the NEXT incident alerts at once. */
export function clearAlert(key, deps = {}) {
  try { unlinkSync(join(deps.dir || alertDir(), `${String(key).replace(/[^a-z0-9_-]/gi, '_')}.json`)); } catch { /* none to clear */ }
}
