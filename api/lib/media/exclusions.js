// Speakers never imported, processed or published (data/media-exclusions.json; Chad 10-23: "No House members elected
// after '88"). A talk matches on its speaker (any spelling the rule's pattern takes) or, for a bare name in a title, the
// stricter title pattern. Pure match + a cached loader.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'media-exclusions.json');
let cached = null;
export function loadExclusions(file = FILE) {
  if (file === FILE && cached) return cached;
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const rules = (j.rules || []).map((r) => ({ ...r, people: (r.people || []).map((p) => ({ ...p, sre: p.speaker ? new RegExp(p.speaker, 'i') : null, tre: p.title ? new RegExp(p.title, 'i') : null })) }));
  if (file === FILE) cached = rules;
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
