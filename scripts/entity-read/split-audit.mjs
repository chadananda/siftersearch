// Broad cross-name split audit — screens the WHOLE grounded person graph for the error class the count-verify
// and same-name merge miss: one person fragmented across different names/titles/epithets/transliterations.
// Runs the evidence-based dedup-guard (searches the grounded corpus by each entity's DISTINCTIVE FACTS — death,
// kinship, office — never its name; a model confirms same-vs-namesake on the FACTS) over every fact-bearing
// person entity. DRY-RUN by default: proposes reversible merge candidates for review, writes nothing.
//
// Usage:  node scripts/entity-read/split-audit.mjs            # dry-run report (default)
//         node scripts/entity-read/split-audit.mjs --save     # persist proposals to entity_decisions (status=proposed)
//         node scripts/entity-read/split-audit.mjs --limit 100 --cc 6
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const { rag } = await import('../../api/lib/rag-adapter/index.js');

const opt = Object.fromEntries(process.argv.slice(2).flatMap((a, i, A) =>
  a.startsWith('--') ? [[a.slice(2), A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true]] : []));
const CC = Number(opt.cc) || 6;
const LIMIT = opt.limit ? Number(opt.limit) : null;
const DRY = !opt.save;

// Every non-merged person entity that carries facts (dedup-guard resolves BY facts — factless rows can't be screened).
const rows = await queryAll(
  `SELECT ge.id, ge.canonical_name n,
          (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) mentions
     FROM graph_entities ge
    WHERE ge.entity_type='person' AND ge.canonical_name NOT LIKE '%⟨merged%'
      AND EXISTS (SELECT 1 FROM entity_claims c WHERE c.entity_id=ge.id)
    ORDER BY mentions DESC` + (LIMIT ? ` LIMIT ${LIMIT}` : ''));
const ids = rows.map((r) => r.id);
const nameOf = new Map(rows.map((r) => [r.id, r.n]));
console.log(`SPLIT AUDIT — screening ${ids.length} fact-bearing person entities (${DRY ? 'DRY-RUN' : 'SAVE proposals'}, cc=${CC})\n`);

const res = await rag.entities.dedupGuard({ entityIds: ids, dryRun: DRY, concurrency: CC });
const decisions = res.decisions || [];

if (DRY) {
  console.log(`\nPROPOSED cross-name merges: ${decisions.length}   (checked ${res.checked}, fact-searched ${res.searched}, adjudicated ${res.adjudicated}, failed ${res.failed})\n`);
  for (const d of decisions) {
    const [canon, ...merged] = d.targetIds;
    const nm = (id) => `#${id} "${nameOf.get(id) || '?'}"`;
    console.log(`SAME  ${nm(canon)}  ⇐  ${merged.map(nm).join(', ')}   conf=${d.confidence}`);
    console.log(`        ${d.rationale}`);
  }
  console.log('\nReview these, then apply confirmed ones by evidence (or run with --save to persist as proposed decisions).');
} else {
  console.log(`Saved ${res.proposed} proposed merge decisions to entity_decisions (status=proposed) for review.`);
}
process.exit(0);
