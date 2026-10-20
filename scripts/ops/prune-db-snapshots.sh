#!/bin/bash
# Keep only the newest 3 DAILY ZFS snapshots of the database on /fast (Chad 10-20: "keep only the last 3 daily snapshots
# on /fast"; full daily DB copies live on /tank). The system zfs-auto-snapshot job keeps 31 dailies on every dataset — on the
# small /fast pool they pinned ~60 GB of churned DB blocks (pool hit 96%). Hourly snapshots are untouched. Cron, daily.
set -u
KEEP=3
DS=fast/siftersearch-db
D=$(zfs list -t snapshot -H -o name -s creation -r "$DS" | grep "_daily-")
N=$(printf '%s\n' "$D" | grep -c . || true)
[ "$N" -le "$KEEP" ] && exit 0
printf '%s\n' "$D" | head -n $((N - KEEP)) | while read -r s; do sudo -n zfs destroy "$s" && echo "$(date -u +%FT%TZ) pruned $s"; done
