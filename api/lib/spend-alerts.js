// Out-of-credit alarm (Chad 10-10: "I need to know the moment we run out of tokens on Jev, Gemini etc."). Any provider
// error that means "no credit / quota used up" sends ONE immediate email per provider per 6 h, to the hourly digest's
// recipient, subject flagged [ACTION REQUIRED]. A per-minute rate limit is NOT exhaustion (it clears by itself).
// Dedup is a stamp file per provider (ALERT_DIR), so the API, the worker and scripts never send duplicates.
// Deps: services/email.js (sendEmail), logger.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

const QUIET_MS = 6 * 3600 * 1000;
const alertDir = () => process.env.ALERT_DIR || '/tank/sifter/alerts';

// What "out of credit" looks like, per vendor wording (checked 10-10). Rate limits per minute are excluded below.
const EXHAUSTED = [
  /insufficient[_ ]?(balance|quota|funds|credit)/i,          // DeepSeek "Insufficient Balance", OpenAI insufficient_quota
  /exceeded your current quota/i,                             // OpenAI, Gemini billing
  /credit balance is too low/i,                               // Anthropic
  /(prepaid )?credits? (are |is )?(depleted|exhausted|used up)|out of credits?/i,
  /check your (plan and )?billing|billing (account|details)|payment required/i,
  /quota exceeded.*(per[ _]day|per[ _]month|daily|monthly)|RESOURCE_EXHAUSTED.*(day|month|billing|credit)/i,
  /(daily|free) (neuron )?allocation|exceeded.*allocation/i,  // Cloudflare Workers AI
];
const RATE_ONLY = /per[ _]minute|requests per min|rate limit(?!.*(day|month|billing|credit|balance))/i;

/** Is this error the provider telling us we have no credit left? Pure. */
export function isExhaustion({ status = null, message = '' } = {}) {
  const m = String(message || '');
  if (status === 402) return true;
  if (RATE_ONLY.test(m) && !/billing|credit|balance|day|month/i.test(m)) return false;
  return EXHAUSTED.some((re) => re.test(m));
}

/**
 * Note a failed provider call; if it is exhaustion, send the alert (at most once per provider per 6 h).
 * Never throws and never blocks the caller. Returns true when an alert was sent.
 */
export async function noteProviderError(provider, err = {}, deps = {}) {
  try {
    if (!isExhaustion(err)) return false;
    if (process.env.VITEST && !deps.sendEmail) return false;   // a test run never mails Chad
    const dir = deps.dir || alertDir();
    const stamp = join(dir, `${String(provider).replace(/[^a-z0-9_-]/gi, '_')}.json`);
    const now = deps.now ?? Date.now();
    if (existsSync(stamp)) {
      try { if (now - JSON.parse(readFileSync(stamp, 'utf8')).at < QUIET_MS) return false; } catch { /* resend */ }
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(stamp, JSON.stringify({ at: now, status: err.status ?? null, message: String(err.message || '').slice(0, 500) }));
    const to = deps.to || process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL;
    if (!to) { logger.error({ provider }, 'OUT OF CREDIT and no alert recipient (set DIGEST_EMAIL)'); return false; }
    const send = deps.sendEmail || (await import('../services/email.js')).sendEmail;
    const msg = String(err.message || '').slice(0, 800);
    await send({
      to,
      subject: `[ACTION REQUIRED] SifterSearch: ${provider} is out of credit`,
      text: `${provider} refused a call because the account has no credit or quota left.\n\n`
        + `Status: ${err.status ?? 'n/a'}\nProvider message: ${msg}\nTime: ${new Date(now).toISOString()}\n\n`
        + `Work that depends on ${provider} is failing until the account is topped up. This alert repeats at most every 6 hours.`,
      html: `<p><strong>${provider}</strong> refused a call because the account has no credit or quota left.</p>`
        + `<p>Status: ${err.status ?? 'n/a'}<br>Provider message: <code>${msg.replace(/</g, '&lt;')}</code><br>Time: ${new Date(now).toISOString()}</p>`
        + `<p>Work that depends on ${provider} is failing until the account is topped up. This alert repeats at most every 6 hours.</p>`,
    });
    logger.error({ provider, status: err.status }, 'OUT OF CREDIT — alert sent');
    return true;
  } catch (e) {
    logger.warn({ err: e.message, provider }, 'spend alert failed');
    return false;
  }
}
