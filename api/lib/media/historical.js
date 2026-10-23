// HISTORICAL PERSPECTIVE per speaker (Chad 10-23: "I'm trying to bring in people with a historical perspective"; "We also
// want ITC members before 88"). data/media-speaker-people.json: historical = first-hand (Hands, Knights, those who knew
// the Guardian or ‘Abdu’l-Bahá, ITC Counsellors appointed before 1988) · historian · modern. It ranks the import queue
// (first-hand beside the Hands). A name matches a person only by a FULL name form (given name + surname, initials allowed:
// identity.js compatible) — a surname alone never does. Pure.
import { compatible } from './identity.js';

/** people → name → { key, historical, basis } | null */
export function historicalIndex(people = []) {
  const ps = people.filter((p) => p.historical);
  return (name) => {
    if (!name) return null;
    // file names write "Surname, Given" ("Sabri, I.", "Khamsi, Masud")
    const m = /^\s*([^,]+),\s*([^,]+)$/.exec(String(name));
    const forms = m ? [name, `${m[2]} ${m[1]}`] : [name];
    const hit = ps.filter((p) => [p.name, ...(p.aliases || [])].some((f) => forms.some((n) => compatible(n, f))));
    if (hit.length !== 1) return null;   // none, or more than one person fits the form
    return { key: hit[0].key, historical: hit[0].historical, basis: hit[0].historical_basis || null };
  };
}

/** A queue tier adjusted for the speaker's historical perspective: first-hand rises to the Hands' tier, historian to the
 *  historic-speakers tier, modern drops to the last tier. */
export function historicalTier(tier, historical) {
  if (historical === 'first-hand') return Math.min(tier, 2);
  if (historical === 'historian') return Math.min(tier, 4);
  if (historical === 'modern') return Math.max(tier, 5);
  return tier;
}
