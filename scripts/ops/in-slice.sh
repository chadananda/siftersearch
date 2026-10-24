#!/usr/bin/env bash
# Run a node service inside the capped bulk slice (Chad 10-24: bulk work must never starve search and the site, whatever code runs in it).
# pm2 uses this as the INTERPRETER:  interpreter: scripts/ops/in-slice.sh   script: api/workers/media-worker.js
# ~/.config/systemd/user/sifter-bulk.slice caps the tree (children inherit): CPUQuota 2000 % of 8000 %, CPUWeight 20, MemoryMax 56G.
# If the user systemd manager is not reachable the service still starts (uncapped) and says so: a service that cannot start is worse.
NODE=${SIFTER_NODE:-$(command -v node)}
U=$(id -u)
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$U} DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$U/bus}
if [ -S "/run/user/$U/bus" ] && command -v systemd-run >/dev/null 2>&1 && [ -f "$HOME/.config/systemd/user/sifter-bulk.slice" ] \
   && systemd-run --user --scope --quiet --collect --slice=sifter-bulk.slice true >/dev/null 2>&1; then
  exec systemd-run --user --scope --quiet --collect --expand-environment=no --slice=sifter-bulk.slice "$NODE" "$@"
fi
echo "[in-slice] WARNING: the bulk slice is unavailable — running uncapped" >&2
exec "$NODE" "$@"
