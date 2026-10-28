#!/usr/bin/env bash
# Run a node service inside the capped bulk slice (Chad 10-24: bulk work must never starve search and the site, whatever code runs in it).
# pm2 uses this as the INTERPRETER:  interpreter: scripts/ops/in-slice.sh   script: api/workers/media-worker.js
# ~/.config/systemd/user/sifter-bulk.slice caps the tree (children inherit): CPUQuota 2000 % of 8000 %, CPUWeight 20, MemoryMax 56G.
# SIFTER_SLICE picks the slice (default sifter-bulk = TIER 2; sifter-index = TIER 1 indexing); SIFTER_OOM_ADJ (default 500: bulk dies first).
# If the user systemd manager is not reachable the service still starts (uncapped) and says so: a service that cannot start is worse.
NODE=${SIFTER_NODE:-$(command -v node)}
U=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$U} DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$U/bus}
if [ -S "/run/user/$U/bus" ] && command -v systemd-run >/dev/null 2>&1 && [ -f "$HOME/.config/systemd/user/${SIFTER_SLICE:-sifter-bulk.slice}" ] \
   && systemd-run --user --scope --quiet --collect --slice=${SIFTER_SLICE:-sifter-bulk.slice} true >/dev/null 2>&1; then
  exec systemd-run --user --scope --quiet --collect --expand-environment=no --slice=${SIFTER_SLICE:-sifter-bulk.slice} /bin/sh -c 'echo "${SIFTER_OOM_ADJ:-500}" > /proc/self/oom_score_adj 2>/dev/null; exec "$0" "$@"' "$NODE" "$@"
fi
echo "[in-slice] WARNING: the bulk slice is unavailable — running uncapped" >&2
exec "$NODE" "$@"
