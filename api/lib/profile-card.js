// Profile card — a person as a chooser needs them: names the texts use (titles, original script), dates, family,
// places, roles. Built DETERMINISTICALLY from claims + mention surfaces + the curated summary (no model call), by
// MAJORITY: a record still holding a minority of someone else's facts is described by its own. What Jev chooses
// between when it links a name occurrence (planning/jev-system1.md, extraction §1). Deps: db (injected).
export const CARD_VERSION = 'card-v1';

const KIN = ['son-of', 'daughter-of', 'father-of', 'mother-of', 'wife-of', 'husband-of', 'brother-of', 'sister-of'];
const PLACE_REL = ['resided-in', 'participated-in', 'visited', 'born-in', 'died-in'];
const DEATH = ['died', 'martyred'];
const SURE = new Set(['stated', 'pin']);

const tally = (xs) => { const m = new Map(); for (const x of xs) if (x) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const year = (v) => { const m = /(\d{3,4})/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };
const tail = (statement, relation) => String(statement || '').split(' — ').slice(1).join(' — ').replace(new RegExp(`^${relation}\\s*`), '').trim();

/** Facts → the card's parts. Pure. `claims`: [{relation, statement, tv, tb, tname, ttype}] · `surfaces`: [[surface, n]]. */
export function factsFrom({ name, summary = '', aliases = [], surfaces = [], claims = [] }) {
  const names = [...new Set([...surfaces.filter(([s, n]) => n >= 2 && s !== name && s.length > 2 && !/^(he|she|him|his|her|i|we|they)$/i.test(s)).map(([s]) => s), ...aliases])].slice(0, 10);
  // A relative stated ONCE is kept only when the record has little family data at all: on a contaminated record the
  // one-off relatives are the other person's ("mother of the Báb" on the Prophet's daughter, 2026-09-28).
  const kinT = tally(claims.filter((c) => KIN.includes(c.relation) && c.tname).map((c) => `${c.relation.replace('-of', ' of')} ${c.tname}`));
  const kinTotal = kinT.reduce((n, [, k]) => n + k, 0);
  const kin = kinT.filter(([, n]) => n >= 2 || kinTotal <= 3).slice(0, 4).map(([k]) => k);
  const places = tally(claims.filter((c) => PLACE_REL.includes(c.relation) && c.tname && c.ttype !== 'person').map((c) => c.tname)).slice(0, 5).map(([p]) => p);
  const roles = tally(claims.filter((c) => ['characterized-as', 'has-title', 'appointed'].includes(c.relation)).map((c) => tail(c.statement, c.relation))
    .filter((t) => t && t.split(/\s+/).length <= 6)).filter(([, n]) => n >= 2).slice(0, 4).map(([r]) => r);
  const deaths = tally(claims.filter((c) => DEATH.includes(c.relation) && SURE.has(c.tb)).map((c) => year(c.tv)));
  const years = claims.filter((c) => SURE.has(c.tb)).map((c) => year(c.tv)).filter((y) => y && y > 1000).sort((a, b) => a - b);
  const active = years.length >= 3 ? [years[Math.floor(years.length * 0.1)], years[Math.floor(years.length * 0.9)]] : null;
  return { name, summary: String(summary || '').trim(), names, kin, places, roles, died: deaths[0]?.[0] ?? null, active };
}

/** The card text (≤ ~600 chars). Pure. */
export function renderCard(f) {
  const parts = [f.name];
  if (f.names.length) parts.push(`also called: ${f.names.join(' · ')}`);
  const when = [f.active ? `active c. ${f.active[0]}${f.active[1] !== f.active[0] ? `–${f.active[1]}` : ''}` : '', f.died ? `died ${f.died}` : ''].filter(Boolean).join(', ');
  if (when) parts.push(when);
  if (f.kin.length) parts.push(f.kin.join('; '));
  if (f.places.length) parts.push(`places: ${f.places.join(', ')}`);
  if (f.roles.length) parts.push(`described as: ${f.roles.join('; ')}`);
  const head = parts.join(' | ');
  return f.summary ? `${head} | ${f.summary.slice(0, Math.max(120, 600 - head.length))}` : head;
}

/** Gather one record's facts from the database. */
export async function cardFor(id, db) {
  const ge = await db.queryOne(`SELECT ge.canonical_name cn, ge.entity_type et, er.summary, er.aliases FROM graph_entities ge
      LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name AND er.entity_type = ge.entity_type WHERE ge.id = ?`, [id]);
  if (!ge) return null;
  let aliases = []; try { const a = JSON.parse(ge.aliases || '[]'); if (Array.isArray(a)) aliases = a.map(String); } catch { /* none */ }
  const surfaces = (await db.queryAll(`SELECT surface, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id = ? GROUP BY surface ORDER BY n DESC LIMIT 30`, [id])).map((r) => [r.surface, r.n]);
  const claims = await db.queryAll(`SELECT c.relation, c.statement, c.time_value tv, c.time_basis tb, t.canonical_name tname, t.entity_type ttype
      FROM entity_claims c LEFT JOIN graph_entities t ON t.id = c.target_entity_id WHERE c.entity_id = ? AND (c.status IS NULL OR c.status = 'supported') LIMIT 5000`, [id]);
  const facts = factsFrom({ name: ge.cn, summary: ge.summary, aliases, surfaces, claims });
  return { id, type: ge.et, facts, card: renderCard(facts) };
}
