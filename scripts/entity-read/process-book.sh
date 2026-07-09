#!/usr/bin/env bash
# process-book.sh — the CANONICAL entity pipeline for ONE book, end to end. Run ON tower-nas.
# Encodes the single source-of-truth sequence so the pipeline is explicit + repeatable (no more version patchwork).
#   DOC=21308 ./scripts/entity-read/process-book.sh              # full run
#   DOC=21308 FROM=mentions ./scripts/entity-read/process-book.sh # resume from a step (skips disambiguation)
#   DOC=21308 DRY=1 ./scripts/entity-read/process-book.sh         # dry-run (no writes)
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DOC:?set DOC=21308|21310|…}"
export SIFTER_WRITER_URL="${SIFTER_WRITER_URL:-http://127.0.0.1:7849}"
W=$([ "${DRY:-0}" = 1 ] && echo "" || echo "WRITE=1")
FROM="${FROM:-structure}"; run=0
step(){ [ "$1" = "$FROM" ] && run=1; [ "$run" = 1 ]; }

# 1 STRUCTURE — verify the <h> TOC parses (chapters/scenes). No writes.
step structure    && { echo "== 1 structure ==";   node scripts/entity-read/chapter-map.mjs "$DOC" | head -1; }
# 2 DISAMBIGUATE — per-paragraph content.context (faithful; cast-seed built in-memory). EXPENSIVE — skip if done.
step disambiguate && { echo "== 2 disambiguate =="; env $W CONC=5 DOC=$DOC node scripts/entity-read/disambiguate-book.mjs; }
# 3 MENTIONS — source-anchored mentions from the notes (entity_id deferred).
step mentions     && { echo "== 3 mentions ==";     env $W DOC=$DOC node scripts/entity-read/build-mentions.mjs; }
# 4 CLAIMS — cited claims from disambiguated paras (proof-gated; entity_id deferred once nullable).
step claims       && { echo "== 4 claims ==";       env $W CONC=5 DOC=$DOC node scripts/entity-read/extract-claims-v2.mjs; }
# 5 RECONCILE — cluster→translit-recall→evidence adjudication→entity_decisions (CLEAR prior for a clean pass).
step reconcile    && { echo "== 5 reconcile ==";    env $W CLEAR=1 MINFREQ=2 CONC=5 DOC=$DOC node scripts/entity-read/reconcile.mjs; }
# 6 DUP-GUARD — exact-name creates→link, groups→other-type.
step dupguard     && { echo "== 6 dup-guard ==";    env $W node scripts/entity-read/resolve-creates.mjs; }
# 7 APPLY — create genuine entities + bind mention clusters (evidence-based).
step apply        && { echo "== 7 apply ==";        env $W AUTO=1 KINDS=link,create HICONF=0.9 node scripts/entity-read/apply-decisions.mjs; }
# 8 PROPAGATE — bind remaining variant/singleton mentions to a decided cluster (deterministic; TODO propagate-bindings.mjs).
step propagate    && { echo "== 8 propagate =="; [ -f scripts/entity-read/propagate-bindings.mjs ] && env $W DOC=$DOC node scripts/entity-read/propagate-bindings.mjs || echo "  (propagate-bindings.mjs pending)"; }
# 9 CLAIMS→ENTITY — claims inherit their subject-mention's entity.
step linkclaims   && { echo "== 9 link-claims ==";  env $W node scripts/entity-read/link-claims.mjs; }
# 10 LOOKUP — rebuild the fast transliteration-invariant lookup index.
step lookup       && { echo "== 10 lookup ==";      env $W node scripts/entity-read/build-lookup-index.mjs; }
echo "== done DOC=$DOC =="
