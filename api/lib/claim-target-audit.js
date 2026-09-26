// Read-only audit: for claims whose target_entity_id is SET, is that target actually the object the statement names?
// Classifies each disagreement by the binding failure that produces it, per import batch — so the binder that made
// it can be fixed at source rather than the rows patched. Statement shape is "subject — relation object".
// Deps: db, encounters (name forms, place keys, namedBy).
import { queryAll } from './db.js';
import { getEncounterIndex, namedBy, fold, ENCOUNTER_RELATIONS } from './encounters.js';

const PRONOUN = /^(him|her|them|he|she|they|his|hers|their|it|the latter|the former)\b/;

/** Pure: classify one typed claim. idx = encounter index; row {st, tid, rel}. */
export function classify(row, idx) {
  const target = idx.people.get(row.tid);
  if (!target) return { kind: 'target_not_live' };                       // merged away / non-person / deleted
  const hay = fold(row.st);
  if (namedBy(hay, target)) return { kind: 'ok' };
  const obj = fold(String(row.st).split(' — ').slice(1).join(' ').replace(/^[a-z-]+ /i, '')).trim();
  if (!obj) return { kind: 'no_object' };
  if (PRONOUN.test(obj)) return { kind: 'pronoun_object' };               // same-paragraph coreference: may be right
  const objCore = obj.replace(/^(the|a) /, '');
  if (idx.placeKeys.has(objCore) || [...idx.placeKeys].some((p) => p.length > 4 && objCore === p)) return { kind: 'place_object', obj };
  const forms = target.forms.map((f) => f.phrase);
  if (forms.some((f) => (f.length > 4 && objCore.includes(f)) || (objCore.length > 4 && f.includes(objCore)))) return { kind: 'substring', obj };
  // The object names someone else, uniquely → the bind picked the wrong person outright.
  for (const w of new Set(objCore.split(' '))) {
    for (const pid of idx.byWord.get(w) || []) {
      if (pid !== row.tid && namedBy(` ${objCore} `, idx.people.get(pid))) return { kind: 'names_other', obj, other: idx.people.get(pid).name };
    }
  }
  return { kind: 'unexplained', obj };
}

export async function auditClaimTargets({ sample = 8 } = {}) {
  const idx = await getEncounterIndex();
  const rels = ENCOUNTER_RELATIONS.map(() => '?').join(',');
  const rows = await queryAll(`SELECT id, entity_id eid, relation rel, target_entity_id tid, statement st,
      COALESCE(import_batch, '(none)') batch, COALESCE(extractor_version, '(none)') ev
    FROM entity_claims WHERE target_entity_id IS NOT NULL AND relation IN (${rels})
      AND (status IS NULL OR status = 'supported')`, ENCOUNTER_RELATIONS, 'audit:claim-targets');
  const byBatch = {}, samples = {};
  for (const r of rows) {
    const c = classify(r, idx);
    const b = (byBatch[r.batch] ||= { total: 0 });
    b.total++; b[c.kind] = (b[c.kind] || 0) + 1;
    if (c.kind !== 'ok') {
      const k = `${r.batch}:${c.kind}`;
      (samples[k] ||= []).length < sample && samples[k].push({ id: r.id, statement: r.st, typed_as: idx.people.get(r.tid)?.name ?? r.tid, ...(c.other ? { names: c.other } : {}), extractor: r.ev });
    }
  }
  const totals = {};
  for (const b of Object.values(byBatch)) for (const [k, v] of Object.entries(b)) totals[k] = (totals[k] || 0) + v;
  return { typed: rows.length, totals, byBatch, samples };
}
