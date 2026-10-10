#!/bin/bash
# Hourly (cron) keyword catch-up: new library + supplemental paragraphs → Qdrant `paragraphs_kw` (BM25, no AI spend).
# Until the sync worker writes Qdrant itself (planning/meili-retirement-map.md item 10) nothing else does: the 42 OL books
# restored 10-08 had 0 points on 10-09. Resumes from each scope's checkpoint; flock: never two runs at once.
cd "$HOME/sifter/siftersearch" || exit 1
exec 9>/tmp/siftersearch-keyword-catchup.lock
flock -n 9 || exit 0
for scope in library supplemental; do
  LOG_LEVEL=warn nice -n 10 /usr/bin/node scripts/phrase-index/keyword-index.mjs --scope "$scope" 2>&1 | grep -E '"phase":"done"|rror' | tail -2
done
