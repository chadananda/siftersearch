// Anis strikes + hidden tarpit. Strikes are SERVER-side, keyed by a hash of the participant (or IP) — a counter the
// client sends is trivially bypassed. Two strikes in 24h → tarpit: templates only, no classifier, no LLM. A tarpit an
// attacker can recognise is an oracle, so its replies come from the normal pools and arrive at the normal pace
// (refusal speed for refusals, research speed for "nothing found"). In-process state: a restart forgives (acceptable;
// the gate re-strikes on the next attack). Pure apart from the Map. Deps: canned.js.
import { createHash } from 'node:crypto';
import { cannedReply, nothingFound } from './canned.js';

const DAY = 24 * 3600 * 1000;
export const TARPIT_AFTER = 2;

export function makeStrikes({ now = () => Date.now() } = {}) {
  const hits = new Map();   // key → [timestamps]
  const key = (who) => createHash('sha256').update(`anis-strike:${who}`).digest('hex').slice(0, 24);
  const recent = (k) => (hits.get(k) || []).filter((t) => now() - t < DAY);
  return {
    strike(who) { const k = key(who); const r = [...recent(k), now()]; hits.set(k, r); return r.length; },
    count: (who) => recent(key(who)).length,
    inTarpit: (who) => recent(key(who)).length >= TARPIT_AFTER,
    size: () => hits.size,
  };
}

// Latency the real paths show (ms): refusals ~0.4–0.9s, research "nothing found" ~2.5–6s. Drawn, not fixed.
export function tarpitResponse(message, { name = 'Anís', random = Math.random } = {}) {
  const refusal = random() < 0.5;
  const seed = `${message}:${new Date().toISOString().slice(0, 10)}`;
  return refusal
    ? { text: cannedReply('refuse', { name, seed }), delayMs: 400 + random() * 500, looksLike: 'refusal' }
    : { text: nothingFound(seed), delayMs: 2500 + random() * 3500, looksLike: 'research' };
}

export const strikes = makeStrikes();
