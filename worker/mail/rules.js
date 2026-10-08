// Engagement rules for Anís's mail (planning/anis-hyper-engagement-prd.md F9/F11/F12/F15), enforced at the ONE send path.
// Pure: sendDecision(facts, settings) → { ok } or { ok:false, reason }. Two kinds of letter:
//   reply    — answers a message the person sent. Allowed unless they bounced/complained or are ignored; a pause or
//              "stop" does NOT block it (they wrote to us).
//   welcome  — once, to someone added to mail_allowlist (Chad's list = consent); kill switch, pause and caps apply.
//   outreach — Anís writes first. Off unless the switch is on; only to people who have written at least once (D1 hybrid:
//              a relationship they took part in); never after a pause/stop; alpha allowlist; cadence 3·5·12·25·44 days
//              after their last message, then silence.
// Both: per-person and global daily caps. Settings live in D1 mail_settings (no deploy to change them).

export const DEFAULTS = {
  outreach_enabled: 'off',            // global kill switch for anything Anís starts
  outreach_allowlist_only: 'on',      // alpha: outreach only to mail_allowlist
  cadence_days: '3,5,12,25,44',       // nth outreach allowed this many days after their last message; then quiet
  per_person_daily_cap: '3',
  global_daily_cap: '200',
  cadence_unit_minutes: '1440',       // a cadence "day"; set to e.g. 10 to test the whole sequence in an hour
  reviewer_email: 'chadananda@gmail.com', // drafts for approval + the daily digest
};

export const settingsFrom = (rows = []) => ({ ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) });

/**
 * facts: { kind, welcomed, suppressed, ignored, stopped, allowlisted, inboundCount, daysSinceLastInbound,
 *          outreachSinceLastInbound, sentToPersonToday, sentToday }
 */
export function sendDecision(f, s = DEFAULTS) {
  if (f.suppressed) return { ok: false, reason: 'suppressed: this address bounced or complained' };
  if (f.ignored) return { ok: false, reason: `ignored sender (${f.ignored})` };
  if (f.sentToday >= Number(s.global_daily_cap)) return { ok: false, reason: 'global daily cap reached' };
  if (f.sentToPersonToday >= Number(s.per_person_daily_cap)) return { ok: false, reason: 'daily cap for this person reached' };
  if (f.kind === 'welcome') {                  // once, to someone Chad added to the list (the list is the consent)
    if (s.outreach_enabled !== 'on') return { ok: false, reason: 'outreach is switched off' };
    if (f.stopped) return { ok: false, reason: 'this person paused letters or asked to stop' };
    if (!f.allowlisted) return { ok: false, reason: 'welcome only to people added to the list' };
    if (f.welcomed) return { ok: false, reason: 'already welcomed' };
    return { ok: true };
  }
  if (f.kind === 'reply') {
    if (!f.inboundCount) return { ok: false, reason: 'a reply needs a message from this person' };
    return { ok: true };
  }
  if (f.kind !== 'outreach') return { ok: false, reason: `unknown kind '${f.kind}' (reply | welcome | outreach)` };
  if (s.outreach_enabled !== 'on') return { ok: false, reason: 'outreach is switched off' };
  if (f.stopped) return { ok: false, reason: 'this person paused letters or asked to stop' };
  if (!f.inboundCount) return { ok: false, reason: 'outreach only to people who have written to Anís' };
  if (s.outreach_allowlist_only === 'on' && !f.allowlisted) return { ok: false, reason: 'not on the alpha allowlist' };
  const steps = String(s.cadence_days).split(',').map(Number).filter((n) => n > 0);
  const n = f.outreachSinceLastInbound;
  if (n >= steps.length) return { ok: false, reason: 'cadence finished: quiet until they write again' };
  if (f.daysSinceLastInbound < steps[n]) return { ok: false, reason: `too soon: letter ${n + 1} waits until day ${steps[n]} after their last message` };
  return { ok: true };
}

// ── Pause link (footer + List-Unsubscribe). Opaque: a hash of the address + HMAC; no personal data in the URL. ──
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const emailHash = async (email) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email || '').trim().toLowerCase()))).slice(0, 32);
async function sign(h, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`anis-pause:${h}`))).slice(0, 32);
}
export async function pauseToken(email, secret) { const h = await emailHash(email); return `${h}.${await sign(h, secret)}`; }
/** token → the address hash, or null. */
export async function verifyPauseToken(token, secret) {
  const [h, s] = String(token || '').split('.');
  if (!/^[a-f0-9]{32}$/.test(h || '') || !/^[a-f0-9]{32}$/.test(s || '')) return null;
  return (await sign(h, secret)) === s ? h : null;
}
