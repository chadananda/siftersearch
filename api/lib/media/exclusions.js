// Speakers never imported, processed or published (Chad 10-23: "I'm trying to bring in people with a historical
// perspective" — UHJ members of the newer generation are out). WHO: data/media-speaker-people.json, each excluded person
// `exclude: <rule id>` with `exclude_match` (their speaker label) and `exclude_title` (a title naming them) — both need a
// GIVEN NAME (Chad 10-23: "spelling is not trustworthy"); a surname alone (`exclude_surname` label, `exclude_surname_title`)
// only lands on the UNSURE list for Chad, never excluded; `exclude_keep` (e.g. Raḥmatu'lláh) never matches. WHY:
// data/media-exclusions.json (the rule's reason). Pure match + a cached loader.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');
let cached = null;
/** → [{ id, reason, people: [{ name, key, uhj_elected, sre, tre }] }] */
export function loadExclusions({ rulesFile = join(DATA, 'media-exclusions.json'), peopleFile = join(DATA, 'media-speaker-people.json') } = {}) {
  const isDefault = rulesFile === join(DATA, 'media-exclusions.json') && peopleFile === join(DATA, 'media-speaker-people.json');
  if (isDefault && cached) return cached;
  const rules = (JSON.parse(readFileSync(rulesFile, 'utf8')).rules || []).map((r) => ({ ...r, people: [] }));
  for (const p of JSON.parse(readFileSync(peopleFile, 'utf8')).people || []) {
    if (!p.exclude) continue;
    const r = rules.find((x) => x.id === p.exclude);
    if (!r) throw new Error(`media exclusions: ${p.key} names an unknown rule '${p.exclude}'`);
    const re = (k) => (p[k] ? new RegExp(p[k], 'i') : null);
    r.people.push({ name: p.name, key: p.key, uhj_elected: p.uhj_elected ?? null, sre: re('exclude_match'), tre: re('exclude_title'),
      ure: re('exclude_surname'), utre: re('exclude_surname_title'), kre: re('exclude_keep') });
  }
  if (isDefault) cached = rules;
  return rules;
}

const kept = (p, ...xs) => p.kre && xs.some((x) => x && p.kre.test(x));
/** The rule + person a talk falls under (given name present), with the evidence, or null. fields: { speaker, title, sourceTitle } */
export function excludedBy({ speaker = '', title = '', sourceTitle = '' } = {}, rules = loadExclusions()) {
  for (const r of rules) for (const p of r.people) {
    if (kept(p, speaker, title, sourceTitle)) continue;
    const hit = (field, text, re) => (text && re?.test(text) ? { rule: r.id, reason: r.reason, person: p.name, evidence: `${field}: ${String(text).slice(0, 120)}` } : null);
    const m = hit('speaker', speaker, p.sre) || hit('title', title, p.tre) || hit('source title', sourceTitle, p.tre);
    if (m) return m;
  }
  return null;
}

/** A SURNAME-only match (no given name, not excluded): who it might be + the evidence, or null — the unsure list for Chad. */
export function unsureBy({ speaker = '', title = '', sourceTitle = '' } = {}, rules = loadExclusions()) {
  if (excludedBy({ speaker, title, sourceTitle }, rules)) return null;
  for (const r of rules) for (const p of r.people) {
    if (kept(p, speaker, title, sourceTitle)) continue;
    const hit = (field, text, re) => (text && re?.test(text) ? { rule: r.id, person: p.name, evidence: `${field} (surname only): ${String(text).slice(0, 120)}` } : null);
    const m = hit('speaker', speaker, p.ure) || hit('title', title, p.utre) || hit('source title', sourceTitle, p.utre);
    if (m) return m;
  }
  return null;
}
