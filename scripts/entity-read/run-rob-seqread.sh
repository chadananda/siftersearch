#!/usr/bin/env bash
# Run the full ROB seqread (vols 1-4) sequentially, carrying the cast across the continuous narrative.
# seq-read.mjs is resumable (skips already-written windows) and writes doc-prefixed window files, so this is
# safe to re-launch. Run from repo root on tower-nas: nohup bash scripts/entity-read/run-rob-seqread.sh > log 2>&1 &
set -u
cd "$(dirname "$0")/../.." || exit 1
for d in 429 430 431 432; do
  echo "=== seqread doc $d  $(date -u +%H:%M:%S) ==="
  node scripts/entity-read/seq-read.mjs "$d" 0 9999999 || { echo "doc $d failed"; break; }
  echo "=== done doc $d  $(date -u +%H:%M:%S) ==="
done
echo "ALL ROB SEQREAD DONE $(date -u +%H:%M:%S)"
