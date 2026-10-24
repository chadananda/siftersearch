#!/usr/bin/env bash
# fetch-weights.sh weights.tsv DEST — each line: dir<TAB>hf-path<TAB>file<TAB>sha256. A mismatch fails the build.
set -euo pipefail
tsv=$1; dest=$2
while IFS=$'\t' read -r dir base file sha; do
  [ -z "$dir" ] && continue
  mkdir -p "$dest/$dir"
  curl -fsSL --retry 5 -o "$dest/$dir/$file" "https://huggingface.co/$base/$file"
  got=$(sha256sum "$dest/$dir/$file" | cut -d' ' -f1)
  [ "$got" = "$sha" ] || { echo "SHA MISMATCH $dir/$file $got" >&2; exit 3; }
  echo "ok $dir/$file"
done < "$tsv"
