#!/usr/bin/env bash
# Window classifier evaluation (runs ON tower): hand gold (speaker + quotes) and the three compilations whose official
# bahai.org edition is a fair speaker check. Usage: scripts/authorship/window-eval.sh <tag> [extra window-classify args]
set -euo pipefail
cd "$(dirname "$0")/../.."
TAG=$1; shift
OUT=/tank/sifter/authorship/eval-$TAG
node scripts/authorship/window-classify.mjs "$OUT/gold" --gold planning/authorship-gold-20261008.json "$@" 2>&1 | grep '^{"total' | sed "s/^/gold $TAG /"
node scripts/authorship/window-classify.mjs "$OUT/official" 945899 945921 945907 "$@" 2>&1 | grep '^{"total' | sed "s/^/official $TAG /"
