// Re-link every book's claims with the CURRENT binder (api/lib/rag/entities/link.js) and score the change.
// DRY by default: nothing written; reports old→new per claim, with encounter targets scored by the same classifier
// as /server/claim-target-audit (ok / wrong-kind / none), so "what it fixes" and "what correct links it loses" are
// both counted before anything is applied. --write applies via the single writer and first saves a rollback file.
// Usage (via POST /api/admin/server/entity-relink): node scripts/entity-relink.mjs [--write] [--doc=ID] [--limit=N]
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DOC = Number((args.find((a) => a.startsWith('--doc=')) || '').split('=')[1]) || null;
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || null;

const { queryAll } = await import('../api/lib/db.js');
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
  subject: {}, target: {}, encounterTarget: {}, errors: [], samples: {} };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const sample = (k, c) => { const s = (report.samples[k] ||= []); if (s.length < 10) s.push({ id: c.id, statement: c.statement, old: idx.people.get(c.oldT)?.name ?? c.oldT, new: idx.people.get(c.newT)?.name ?? c.newT }); };
const rollback = [];

let n = 0;
for (const { doc_id: docId } of todo) {
  try {
    // Dry pass first even in write mode: the rollback row must be saved before its write.
    const r = await link({ docId, write: false, diff: true });
    report.claims += r.claims;
    for (const c of r.changes) {
      report.changed++;
      bump(report.subject, `${subjectVerdict(c.statement, c.oldS)}->${subjectVerdict(c.statement, c.newS)}`);
      bump(report.target, `${c.oldT == null ? 'none' : 'set'}->${c.newT == null ? 'none' : 'set'}`);
      if (ENC.has(c.relation) && c.oldT !== c.newT) {
        const k = `${targetVerdict(c.statement, c.oldT)}->${targetVerdict(c.statement, c.newT)}`;
        bump(report.encounterTarget, k); sample(k, c);
      }
      rollback.push({ id: c.id, entity_id: c.oldS, target_entity_id: c.oldT });
    }
    if (WRITE && r.changes.length) {
      writeFileSync(`logs/entity-relink-rollback-${stamp}.json`, JSON.stringify(rollback));
      await link({ docId, write: true });
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
