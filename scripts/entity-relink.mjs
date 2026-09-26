// Re-link every book's claims with the CURRENT binder (api/lib/rag/entities/link.js) and score the change.
// DRY by default: nothing written; reports old→final per claim (policy below), with encounter targets scored by the same classifier
// as /server/claim-target-audit (ok / wrong-kind / none), so "what it fixes" and "what correct links it loses" are
// both counted before anything is applied. --write applies via the single writer and first saves a rollback file.
// Usage (via POST /api/admin/server/entity-relink): node scripts/entity-relink.mjs [--write] [--doc=ID] [--limit=N]
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DOC = Number((args.find((a) => a.startsWith('--doc=')) || '').split('=')[1]) || null;
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || null;

const { queryAll, transaction } = await import('../api/lib/db.js');
const { link } = await import('../api/lib/rag/entities/link.js');
const { getEncounterIndex, ENCOUNTER_RELATIONS, namedBy, fold } = await import('../api/lib/encounters.js');
const { classify } = await import('../api/lib/claim-target-audit.js');

const idx = await getEncounterIndex();
const ENC = new Set(ENCOUNTER_RELATIONS);
const { LIVE_SQL } = await import('../api/lib/entity-live.js');
const live = new Set((await queryAll(`SELECT id FROM graph_entities WHERE ${LIVE_SQL()}`)).map((r) => r.id));
// A target outside the person index is either a live place/group/event (fine) or a merged-away tombstone (wrong).
const other = (id) => (live.has(id) ? 'non_person' : 'dead');
const targetVerdict = (st, tid) => {
  if (tid == null) return 'none';
  if (!idx.people.has(tid)) return other(tid);
  const k = classify({ st, tid }, idx).kind;
  return k === 'ok' ? 'ok' : k === 'pronoun_object' ? 'unsure' : 'wrong';
};
const subjectVerdict = (st, eid) => {
  if (eid == null) return 'none';
  const p = idx.people.get(eid);
  if (!p) return other(eid);
  return namedBy(fold(String(st).split(' — ')[0]), p, { anyForm: true }) ? 'ok' : 'other';
};

const docs = DOC ? [{ doc_id: DOC }] : await queryAll(`SELECT doc_id FROM entity_claims WHERE doc_id IS NOT NULL GROUP BY doc_id ORDER BY doc_id`);
const todo = LIMIT ? docs.slice(0, LIMIT) : docs;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

const report = { mode: WRITE ? 'write' : 'dry', started: new Date().toISOString(), docs: todo.length, claims: 0, changed: 0,
  subject: {}, target: {}, encounterTarget: {}, lostTargetWhy: {}, lostSubjectWhy: {}, errors: [], samples: {} };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const sample = (k, c) => { const s = (report.samples[k] ||= []); if (s.length < 10) s.push({ id: c.id, why: c.why, statement: c.statement, old: idx.people.get(c.oldT)?.name ?? c.oldT, new: idx.people.get(c.newT)?.name ?? c.newT }); };
const rollback = [];

// FILL AND CORRECT, NEVER ERASE. Dry runs 1-3 showed the name binder cannot SEE many existing bindings (made by
// coreference in the sequential-reading pipeline, not by a same-paragraph name), so replaying it would unbind
// thousands of correct links. A new binding is written; where it finds none, the old one stands unless the audit
// PROVES it wrong (a place typed as a person, the object naming someone else, a merged-away entity).
const PROVEN_WRONG = new Set(['place_object', 'names_other', 'target_not_live']);
const finalOf = (c) => {
  const s = c.newS ?? (c.oldS != null && live.has(c.oldS) ? c.oldS : null);
  let t = c.newT;
  if (t == null && c.oldT != null) t = live.has(c.oldT) && !PROVEN_WRONG.has(classify({ st: c.statement, tid: c.oldT }, idx).kind) ? c.oldT : null;
  return { s, t };
};

let n = 0;
for (const { doc_id: docId } of todo) {
  try {
    const r = await link({ docId, write: false, diff: true });
    report.claims += r.claims;
    const writes = [];
    for (const c of r.changes) {
      const f = finalOf(c);
      if (f.s === c.oldS && f.t === c.oldT) { report.keptOld = (report.keptOld || 0) + 1; continue; }
      report.changed++;
      const fc = { ...c, newS: f.s, newT: f.t };
      bump(report.subject, `${subjectVerdict(c.statement, c.oldS)}->${subjectVerdict(c.statement, f.s)}`);
      bump(report.target, `${c.oldT == null ? 'none' : 'set'}->${f.t == null ? 'none' : 'set'}`);
      if (ENC.has(c.relation) && c.oldT !== f.t) {
        const k = `${targetVerdict(c.statement, c.oldT)}->${targetVerdict(c.statement, f.t)}`;
        bump(report.encounterTarget, k); sample(k, fc);
      }
      rollback.push({ id: c.id, entity_id: c.oldS, target_entity_id: c.oldT });
      writes.push({ sql: 'UPDATE entity_claims SET entity_id=?, target_entity_id=? WHERE id=?', args: [f.s, f.t, c.id] });
    }
    if (WRITE && writes.length) {
      writeFileSync(`logs/entity-relink-rollback-${stamp}.json`, JSON.stringify(rollback));   // before its writes
      for (let i = 0; i < writes.length; i += 200) await transaction(writes.slice(i, i + 200), 'entity-relink');
    }
  } catch (err) { report.errors.push({ docId, error: err.message }); }
  if (++n % 50 === 0) console.log(`progress ${n}/${todo.length} docs · ${report.claims} claims · ${report.changed} changed`);
}
report.finished = new Date().toISOString();
writeFileSync(`logs/entity-relink-${report.mode}-${stamp}.json`, JSON.stringify(report, null, 1));
const { samples, ...summary } = report;
console.log(`REPORT logs/entity-relink-${report.mode}-${stamp}.json`);
console.log(JSON.stringify(summary));
process.exit(report.errors.length ? 1 : 0);
