#!/usr/bin/env bash
# One clean re-derive of GPB + DB downstream layers from the (good) disambiguation notes — collapses the mixed-version
# data strata into ONE coherent version on the matured pipeline. Keeps content.context (expensive, done). Run ON tower-nas.
set -uo pipefail; cd ~/sifter/siftersearch
export SIFTER_WRITER_URL=http://127.0.0.1:7849

echo "== 0 clean slate (v2 claims, mention bindings, mention-cluster decisions) =="
node -e "import('./api/lib/db.js').then(async d=>{
  await d.query(\"DELETE FROM entity_claims WHERE import_batch IN ('db-v2','gpb-v2')\");
  await d.query(\"UPDATE entity_mentions_v2 SET entity_id=NULL, resolution_basis='note-deferred', resolution_conf=NULL\");
  await d.query(\"DELETE FROM entity_decisions WHERE target_kind='mention-cluster'\");
  console.log('  cleared'); process.exit(0)})"

for D in 21308 21310; do
  echo "== $D claims (deferred) =="; WRITE=1 CONC=5 DOC=$D node scripts/entity-read/extract-claims-v2.mjs 2>&1 | grep -E "DONE"
  echo "== $D reconcile =="; WRITE=1 MINFREQ=2 CONC=5 DOC=$D node scripts/entity-read/reconcile.mjs 2>&1 | grep -E "DONE"
done

echo "== dup-guard =="; WRITE=1 node scripts/entity-read/resolve-creates.mjs 2>&1 | grep -E "APPLIED"
echo "== apply (create + link) =="; WRITE=1 AUTO=1 KINDS=link,create HICONF=0.9 node scripts/entity-read/apply-decisions.mjs 2>&1 | grep -E "APPLIED"
echo "== propagate variant/singleton bindings =="; WRITE=1 node scripts/entity-read/propagate-bindings.mjs 2>&1 | grep -E "WROTE"
echo "== link claims -> entity =="; WRITE=1 node scripts/entity-read/link-claims.mjs 2>&1 | grep -E "WROTE"
echo "== rebuild lookup index =="; WRITE=1 node scripts/entity-read/build-lookup-index.mjs 2>&1 | grep -E "WROTE"
echo "== REDERIVE DONE =="
