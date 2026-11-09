#!/bin/bash
# ZFS REPLICATE — a second disk (vault, 4 TB HDD) for the backups that cost money or time to remake. Root cron 02:00, installed
# as /usr/local/bin/zfs-replicate.sh (copy: `sudo install -m755 scripts/ops/zfs-replicate.sh /usr/local/bin/`).
# 11-09: the old script grepped 'auto-snapshot_daily' (snapshots are zfs-auto-snap_daily-*) and had sent nothing since March;
# it also named all of tank (13 TB), which can never fit vault. Now: a named list, one daily ANCHOR per source, incremental from
# the newest snapshot both sides hold, full send only if it fits. Not replicated: fast (live Qdrant, rebuildable from the
# vectors; a held snapshot there pins a day of segment churn on a 60%-full 1 TB pool); sifter.db (backup-daily.mjs already
# writes daily copies to vault/siftersearch).
# `zfs-replicate.sh anchor` / `zfs-replicate.sh base <dst-names-file>` read snapshot names on stdin (tested).
set -u
PAIRS=(
  "tank/backups/vectors vault/replica/vectors"     # paid phrase/HyPE/concept embeddings (db-ship of faster/vectors)
  "tank/documents vault/replica/documents"
)
KEEP=${REPLICATE_KEEP:-7}   # anchors kept on vault per dataset

# stdin: names oldest→newest; stdout: the newest daily anchor — a zfs-auto-snap_daily, or the FIRST ship of a day (db-ship's
# /tank retention keeps that one 14 days, so tomorrow's incremental still finds it)
anchor() { awk '/@zfs-auto-snap_daily-/ { a = $0 }
  /@ship-[0-9]{8}-[0-9]{4}$/ { d = substr($0, index($0, "@ship-") + 6, 8); if (d != last) { a = $0; last = d } }
  END { if (a) print a }'; }
# stdin: source names; $1: file of destination names; stdout: the newest destination snapshot the source also holds
base() { awk -F@ 'NR == FNR { have[$2] = 1; next } ($2 in have) { b = $0 } END { if (b) print b }' - "$1"; }
if [ "${1:-}" = anchor ]; then anchor; exit 0; fi
if [ "${1:-}" = base ]; then base "$2"; exit 0; fi

Z="zfs"; [ "$(id -u)" = 0 ] || Z="sudo -n zfs"
log() { echo "$(date -u +%FT%TZ) $*"; }
exec 9>/run/lock/zfs-replicate.lock 2>/dev/null || exec 9>/tmp/zfs-replicate.lock
flock -n 9 || { log "skip: a run is still going"; exit 0; }
$Z list vault/replica >/dev/null 2>&1 || $Z create -o mountpoint=none -o com.sun:auto-snapshot=false vault/replica

for pair in "${PAIRS[@]}"; do
  read -r SRC DST <<< "$pair"
  A=$($Z list -H -t snapshot -o name -s creation "$SRC" 2>/dev/null | anchor)
  [ -n "$A" ] || { log "FAIL $SRC: no daily snapshot to send"; continue; }
  if $Z list "$DST@${A##*@}" >/dev/null 2>&1; then continue; fi
  if $Z list "$DST" >/dev/null 2>&1; then
    T=$(mktemp); $Z list -H -t snapshot -o name -s creation "$DST" > "$T"
    B=$($Z list -H -t snapshot -o name -s creation "$SRC" | base "$T"); rm -f "$T"
    [ -n "$B" ] || { log "FAIL $DST has no snapshot in common with $SRC — needs a person (zfs destroy -r $DST restarts the chain)"; continue; }
    nice -n 19 $Z send -i "$SRC@${B##*@}" "$A" | $Z recv -u -F "$DST" && log "sent $SRC ${B##*@} → ${A##*@}" || { log "FAIL incremental $SRC ${B##*@} → ${A##*@}"; continue; }
  else
    NEED=$($Z send -nP "$A" 2>/dev/null | awk '/^size/ { print $2 }'); FREE=$($Z list -Hp -o avail vault)
    [ -n "$NEED" ] && [ "$NEED" -lt $((FREE * 9 / 10)) ] || { log "FAIL $A needs ${NEED:-?} B, vault has $FREE B free"; continue; }
    nice -n 19 $Z send "$A" | $Z recv -u -o mountpoint=none -o com.sun:auto-snapshot=false "$DST" && log "full send $A" || { log "FAIL full send $A"; continue; }
  fi
  $Z list -H -t snapshot -o name -s creation "$DST" | head -n -"$KEEP" | while read -r s; do $Z destroy "$s" && log "vault: pruned $s"; done
done
