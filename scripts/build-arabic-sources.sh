#!/bin/bash
# Build the finished derived source for one Arabic work (Chad, 2026-09-30): corrected pagination (OpenITI page numbers
# + edition paragraphs) → semantic breaks for over-long paragraphs (if a batch result exists, matched by text) →
# sentence markers at the text's own punctuation (punctuated works only) → finalize (flags + EXACT letter/diacritic
# check against the original). Never splits by length.
# usage: build-arabic-sources.sh <doc> <mode: paginate|convert|asis> <punct: 1|0> <scratch dir> <backup dir>
set -euo pipefail
d=$1; mode=$2; punct=$3; SP=$4; BK=$5
plan="$SP/converted/plan.json"
src=$(python3 -c "import json;print(json.load(open('$plan'))['$d']['source'])")
oiti=$(python3 -c "import json;print(json.load(open('$plan'))['$d']['openiti'])")
orig="$BK/${src//\//__}"
out="$SP/final4"; mkdir -p "$out"
case $mode in
  paginate) python3 scripts/openiti-paginate.py "$SP/oiti/$oiti" "$orig" "$out/$d.a.md" >/dev/null ;;
  convert)  python3 scripts/openiti-convert.py "$SP/oiti/$oiti" "$orig" "$out/$d.a.md" >/dev/null ;;
  asis)     cp "$orig" "$out/$d.a.md" ;;
esac
step="$out/$d.a.md"
if [ -f "$SP/sem/$d.json.starts.json" ]; then
  python3 scripts/semantic-paragraphs.py apply "$SP/sem/$d.json" "$out/$d.s.md" --onto "$step"
  step="$out/$d.s.md"
fi
if [ "$punct" = 1 ]; then
  python3 scripts/mark-sentences.py "$step" "$out/$d.m.md" >/dev/null; step="$out/$d.m.md"
  python3 scripts/finalize-source.py "$step" "$orig" "$out/$d.md" "openiti=$oiti"
else
  extra=(); [ "$mode" != asis ] && extra=("openiti=$oiti")
  python3 scripts/finalize-source.py "$step" "$orig" "$out/$d.md" --defer-sentences ${extra[@]+"${extra[@]}"}
fi
