#!/bin/bash
# DB SHIP — snapshot on the SSD, history on /tank (Chad 10-21: "super fast backup followed by migration off SSD"; the same
# procedure for the 4 TB /faster drive: `db-ship.sh faster/<ds> tank/backups/<ds>`). Every 15 min, cron (SHIP_KEEP_RECENT=96).
#   1. zfs snapshot <src>@ship-YYYYMMDD-HHMM — instant, copy-on-write: no pause, no I/O burst for the live DB
#   2. zfs send -i <previous ship> | zfs recv <dest> — only the hour's changed blocks leave the SSD, at nice 19
#   3. the SSD keeps ONE snapshot (the base for the next increment); every older one — ours and zfs-auto-snap's — is destroyed
#   4. history lives on /tank: the newest 24 hourly + the first of each day for 14 days
# `db-ship.sh keep [hourly] [days]` / `db-ship.sh ssd-drop <new>` read snapshot names on stdin and print those /tank or the SSD
# would destroy (tested).
set -u
keep() {   # stdin: names …@ship-YYYYMMDD-HHMM oldest→newest; stdout: names to destroy
  awk -v H="${1:-24}" -v D="${2:-14}" '/@ship-[0-9]{8}-[0-9]{4}$/ { n[++c] = $0 }
    END { days = 0
      for (i = c; i >= 1; i--) {
        d = substr(n[i], index(n[i], "@ship-") + 6, 8)
        if (c - i < H) continue   # newest H kept
        first = (i == 1) || substr(n[i-1], index(n[i-1], "@ship-") + 6, 8) != d   # first of its day
        if (first && !(d in kept) && days < D) { kept[d] = 1; days++; continue }
        print n[i] } }'
}
# stdin: the SSD's snapshots; stdout: those to destroy — OUR older ships and zfs-auto-snap's; any other (the 03:00 backup's,
# held while it copies from it; a person's) is never touched
ssd_drop() { grep -E '@(ship-|zfs-auto-snap_)' | grep -v "@$1\$"; }
if [ "${1:-}" = keep ]; then shift; keep "$@"; exit 0; fi
if [ "${1:-}" = ssd-drop ]; then ssd_drop "$2"; exit 0; fi

SRC=${1:-fast/siftersearch-db}
DEST=${2:-tank/backups/siftersearch-db}
Z="sudo -n zfs"
log() { echo "$(date -u +%FT%TZ) $*"; }
NOW=ship-$(date -u +%Y%m%d-%H%M)
PREV=$($Z list -t snapshot -H -o name -s creation "$SRC" 2>/dev/null | grep '@ship-' | tail -1)
$Z snapshot "$SRC@$NOW" || { log "FAIL snapshot $SRC@$NOW"; exit 1; }
# the /tank copy is ours alone: it inherits tank's com.sun:auto-snapshot (10-21: zfs-auto-snap 'frequent' landed on it every
# 15 min), and a snapshot there newer than our base breaks the next incremental — so none are taken, and any found are dropped
if $Z list "$DEST" >/dev/null 2>&1; then
  $Z set com.sun:auto-snapshot=false "$DEST"
  $Z list -t snapshot -H -o name "$DEST" | grep '@zfs-auto-snap_' | while read -r s; do $Z destroy "$s" && log "tank: dropped $s"; done
fi
# incremental only from a base /tank also holds; otherwise a full send (first run, or after a broken chain)
if [ -n "$PREV" ] && $Z list -t snapshot "$DEST@${PREV##*@}" >/dev/null 2>&1; then
  nice -n 19 $Z send -i "$PREV" "$SRC@$NOW" | $Z recv -u -F "$DEST" || { log "FAIL incremental ${PREV##*@} → $NOW"; $Z destroy "$SRC@$NOW"; exit 1; }
  log "shipped ${PREV##*@} → $NOW"
else
  $Z list "$DEST" >/dev/null 2>&1 && { log "FAIL $DEST exists without a common base — needs a person (zfs destroy -r $DEST to restart the chain)"; $Z destroy "$SRC@$NOW"; exit 1; }
  nice -n 19 $Z send "$SRC@$NOW" | $Z recv -u -o mountpoint=none -o com.sun:auto-snapshot=false "$DEST" || { log "FAIL full send $NOW"; $Z destroy "$SRC@$NOW"; exit 1; }
  log "full send $NOW"
fi
# the SSD keeps only the new base
$Z list -t snapshot -H -o name -s creation "$SRC" | ssd_drop "$NOW" | while read -r s; do $Z destroy "$s" && log "ssd: destroyed $s"; done
# every 15 min since db-write-path-20261023 (cron: SHIP_KEEP_RECENT=96 → the newest 24 h at 15-min steps, then daily)
$Z list -t snapshot -H -o name -s creation "$DEST" | keep "${SHIP_KEEP_RECENT:-24}" "${SHIP_KEEP_DAYS:-14}" | while read -r s; do $Z destroy "$s" && log "tank: pruned $s"; done
