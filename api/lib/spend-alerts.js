// Out-of-credit alarm (Chad 10-10: "I need to know the moment we run out of tokens on Jev, Gemini etc."). Any provider
// error that means "no credit / quota used up" sends ONE immediate email per provider per 6 h, to the hourly digest's
// recipient, subject flagged [ACTION REQUIRED]. A per-minute rate limit is NOT exhaustion (it clears by itself).
// Dedup is a stamp file per provider (ALERT_DIR), so the API, the worker and scripts never send duplicates.
// Deps: services/email.js (sendEmail), logger.
import { actionRequired } from './ops/alert.js';


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
  if (!isExhaustion(err)) return false;
  const msg = String(err.message || '').slice(0, 800);
  const when = new Date(deps.now ?? Date.now()).toISOString();
  return actionRequired({
    key: provider,
    subject: `SifterSearch: ${provider} is out of credit`,
    text: `${provider} refused a call because the account has no credit or quota left.\n\nStatus: ${err.status ?? 'n/a'}\n`
      + `Provider message: ${msg}\nTime: ${when}\n\nWork that depends on ${provider} is failing until the account is topped up. `
      + 'This alert repeats at most every 6 hours.',
  }, deps);
}
