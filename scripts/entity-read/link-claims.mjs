// link-claims — CLI wrapper. THE LOGIC LIVES IN api/lib/rag/entities/link.js.
//
//   DRY:   node scripts/entity-read/link-claims.mjs                  (legacy seed batches: db-v2, gpb-v2)
//   DOC:   DOC=426 node scripts/entity-read/link-claims.mjs          (scope to one book — preferred)
//   WRITE: WRITE=1 DOC=426 node scripts/entity-read/link-claims.mjs
//
// ── READ THIS BEFORE EDITING ────────────────────────────────────────────────────────────────────────────
// This file used to CONTAIN the binding logic, and run-grounding.js invoked it by execSync. That meant the
// `link` stage — the one that makes the entity graph traversable — returned nothing to the pipeline: no
// result, no telemetry, no error detail. It ran for two books, stopped, and nothing noticed until
// entity_claims was measured months later at 9% target coverage. See backlog 0043.
//
// The logic now lives in a module that the pipeline calls directly and whose result it emits. This wrapper
// exists ONLY so a human can run the same code by hand for one book. If you are about to add logic here,
// add it to the module instead — otherwise the two paths drift and the CLI silently stops matching
// production, which is how this went wrong the first time.
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

const { link } = await import('../../api/lib/rag/entities/link.js');

const WRITE = process.env.WRITE === '1';
const DOC = process.env.DOC ? Number(process.env.DOC) : null;

const r = await link({ docId: DOC, write: WRITE });

console.log(
  `${r.dry ? 'DRY' : 'WROTE'} — ${r.claims} claims: ${r.subjectBound} subject-bound ` +
  `(${r.viaFallback} via doc-unambiguous fallback), ${r.targetBound} target-bound (${r.updated} updated)`
);
if (r.dry && r.samples.length) console.log('  fallback samples: ' + r.samples.join(' ; '));
process.exit(0);
