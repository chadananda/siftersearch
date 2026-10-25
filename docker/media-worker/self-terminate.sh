#!/bin/bash
# End this pod: DELETE it through the RunPod API (key and id from the container env). A User-Agent is required (default curl/urllib ones get 403 on some paths).
why="${1:-unspecified}"
pod="${RUNPOD_POD_ID:-$(tr '\0' '\n' < /proc/1/environ | grep '^RUNPOD_POD_ID=' | cut -d= -f2-)}"
key="${RP_TERMINATE_KEY:-$(tr '\0' '\n' < /proc/1/environ | grep '^RP_TERMINATE_KEY=' | cut -d= -f2-)}"
echo "$(date -u +%FT%TZ) terminating pod $pod: $why" >> /workspace/self-terminate.log
[ -n "$pod" ] && [ -n "$key" ] && curl -s -m 30 -X DELETE -A 'sifter-media-worker/1' -H "Authorization: Bearer $key" "https://rest.runpod.io/v1/pods/$pod" >> /workspace/self-terminate.log 2>&1
