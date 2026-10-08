#!/usr/bin/env bash
# Window classifier evaluation (runs ON tower): hand gold (speaker + quotes) and the three compilations whose official
# bahai.org edition is a fair speaker check. Defaults = v10. Usage: scripts/authorship/window-eval.sh <tag> [window-classify switches]
set -euo pipefail
cd "$(dirname "$0")/../.."
TAG=$1; shift
OUT=/tank/sifter/authorship/eval-$TAG
node scripts/authorship/window-classify.mjs "$OUT/gold" --gold planning/authorship-gold-20261008.json "$@" 2>&1 | grep '^{"total' | sed "s/^/gold $TAG /"
node scripts/authorship/window-classify.mjs "$OUT/heldout" --gold planning/authorship-gold-heldout-20261008.json "$@" 2>&1 | grep '^{"total' | sed "s/^/HELDOUT $TAG /"
node scripts/authorship/window-classify.mjs "$OUT/blind" --gold planning/authorship-gold-blind-20261008.json "$@" 2>&1 | grep '^{"total' | sed "s/^/BLIND $TAG /"
node scripts/authorship/window-classify.mjs "$OUT/official" 945899 945921 945907 "$@" 2>&1 | grep '^{"total' | sed "s/^/official $TAG /"
