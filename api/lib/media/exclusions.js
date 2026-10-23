// Speakers never imported, processed or published (Chad 10-23: "I'm trying to bring in people with a historical
// perspective" — UHJ members of the newer generation are out). WHO: data/media-speaker-people.json, each excluded person
// `exclude: <rule id>` with `exclude_match` (their speaker label) and `exclude_title` (a title naming them); WHY:
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
    r.people.push({ name: p.name, key: p.key, uhj_elected: p.uhj_elected ?? null, sre: p.exclude_match ? new RegExp(p.exclude_match, 'i') : null, tre: p.exclude_title ? new RegExp(p.exclude_title, 'i') : null });
  }
  if (isDefault) cached = rules;
  return rules;
}

/** The rule + person a talk falls under, or null. fields: { speaker, title, sourceTitle } */
export function excludedBy({ speaker = '', title = '', sourceTitle = '' } = {}, rules = loadExclusions()) {
  for (const r of rules) for (const p of r.people) {
    if (speaker && p.sre?.test(speaker)) return { rule: r.id, reason: r.reason, person: p.name };
    if (p.tre && (p.tre.test(title || '') || p.tre.test(sourceTitle || ''))) return { rule: r.id, reason: r.reason, person: p.name };
  }
  return null;
}
