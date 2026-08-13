#!/usr/bin/env bash
# Give a session its OWN worktree. Three sessions sharing one checkout is how (a) a commit swept up another
# session's in-progress Astro upgrade, and (b) every pre-commit build+deploy shipped a stranger's WIP.
# A worktree is a separate directory on its own branch against the SAME repo — cheap, and isolation is total.
#
#   ./scripts/new-worktree.sh <name>        e.g. ./scripts/new-worktree.sh article-writer
set -euo pipefail
NAME="${1:-}"
[ -z "$NAME" ] && { echo "usage: $0 <name>"; exit 1; }
ROOT="$(git rev-parse --show-toplevel)"
DEST="$ROOT/../siftersearch-$NAME"
git -C "$ROOT" worktree add -b "wt/$NAME" "$DEST"
# node_modules is huge and identical; share it rather than reinstalling per worktree.
ln -sfn "$ROOT/node_modules" "$DEST/node_modules"
for f in .env-secrets .env-public; do [ -f "$ROOT/$f" ] && ln -sfn "$ROOT/$f" "$DEST/$f"; done
echo "worktree ready: $DEST (branch wt/$NAME)"
echo "NOTE: the pre-commit hook builds + deploys. From a worktree, commit only when you intend to deploy."
