#!/bin/bash
# Keep only the newest 3 DAILY and 6 HOURLY ZFS snapshots of the database on /fast (Chad 10-20: "keep only the last 3 daily
# snapshots on /fast"; then "Keep 6 hourly DB snapshots" when 24 hourlies pinned 62 GB of churned blocks and /fast hit 90%).
# Full daily DB copies live on /tank. The system zfs-auto-snapshot job keeps 31 dailies / 24 hourlies on every dataset —
# on the small /fast pool that is too much for a database that churns GBs per hour. Cron, hourly.
set -u
DS=fast/siftersearch-db
prune() {   # $1 = kind (daily|hourly), $2 = how many to keep
  local D N
  D=$(zfs list -t snapshot -H -o name -s creation -r "$DS" | grep "_$1-")
  N=$(printf '%s\n' "$D" | grep -c . || true)
  [ "$N" -le "$2" ] && return 0
  printf '%s\n' "$D" | head -n $((N - $2)) | while read -r s; do sudo -n zfs destroy "$s" && echo "$(date -u +%FT%TZ) pruned $s"; done
}
prune daily 3
prune hourly 6
