#!/bin/bash
# Forced command for tower's key on boss (authorized_keys: command="~/media-asr/asr-gate.sh",from="<tower>",restrict).
# Boss's Zen 5 CPU runs Whisper ~6x faster than tower's Xeons (measured 10-21: RTF 0.06 vs 0.36), so the media pipeline
# sends ASR here. Audio arrives on stdin; the result JSON leaves on stdout. Only these verbs:
#   probe|langid|transcribe|diarize <ext> [--opt value …]   run media_tool.py on the uploaded audio (attached: killed when
#                                                          the caller's ssh session goes)
#   start <ext> <job> [--opt value …]                       a DETACHED transcription (survives the caller's restarts):
#   poll <job> · fetch <job> · cancel <job>                 its state · its transcript JSON · stop it
#   install-tool                                            replace media_tool.py with stdin (kept in sync from the repo)
set -euo pipefail
cd "$HOME/media-asr"
read -r -a A <<< "${SSH_ORIGINAL_COMMAND:-}"
verb="${A[0]:-}"
if [[ "$verb" == "install-tool" ]]; then cat > media_tool.py.new && mv media_tool.py.new media_tool.py && echo '{"installed":true}'; exit 0; fi
[[ "$verb" =~ ^(probe|langid|transcribe|diarize|start|poll|fetch|cancel)$ ]] || { echo '{"error":"verb not allowed"}'; exit 2; }

# ── detached jobs: ~/media-asr/jobs/<job>/ (in.<ext>, out.json, pid, err.txt); kept two days ──
if [[ "$verb" =~ ^(poll|fetch|cancel)$ ]]; then
  id="${A[1]:-}"; [[ "$id" =~ ^[a-z0-9-]{4,120}$ ]] || { echo '{"error":"bad job"}'; exit 2; }
  d="jobs/$id"; [[ -d "$d" ]] || { echo '{"state":"missing"}'; exit 0; }
  pid=$(cat "$d/pid" 2>/dev/null || echo 0)
  alive=0; [[ "$pid" != 0 ]] && kill -0 "$pid" 2>/dev/null && alive=1
  if [[ "$verb" == "cancel" ]]; then [[ $alive == 1 ]] && kill "$pid"; echo '{"cancelled":true}'; exit 0; fi
  if [[ "$verb" == "fetch" ]]; then cat "$d/out.json"; exit 0; fi
  if [[ $alive == 1 ]]; then echo '{"state":"running"}'
  elif [[ -s "$d/out.json" ]]; then echo '{"state":"done"}'
  else printf '{"state":"failed","error":%s}\n' "$(tail -c 400 "$d/err.txt" 2>/dev/null | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"; fi
  exit 0
fi

ext="${A[1]:-}"; [[ "$ext" =~ ^[a-z0-9]{2,5}$ ]] || { echo '{"error":"bad ext"}'; exit 2; }
rest=("${A[@]:2}")
if [[ "$verb" == "start" ]]; then id="${rest[0]:-}"; [[ "$id" =~ ^[a-z0-9-]{4,120}$ ]] || { echo '{"error":"bad job"}'; exit 2; }; rest=("${rest[@]:1}"); fi
args=()
for a in "${rest[@]}"; do [[ "$a" =~ ^[A-Za-z0-9_.,:=+/-]*$ ]] || { echo '{"error":"bad arg"}'; exit 2; }; args+=("$a"); done
# the prompt travels base64 (spaces and diacritics), decoded here
prompt=""
for i in "${!args[@]}"; do if [[ "${args[$i]}" == --prompt-b64=* ]]; then prompt=$(printf '%s' "${args[$i]#--prompt-b64=}" | base64 -d); unset 'args[i]'; fi; done

if [[ "$verb" == "start" ]]; then
  find jobs -mindepth 1 -maxdepth 1 -type d -mtime +2 -exec rm -rf {} + 2>/dev/null || true
  d="jobs/$id"; rm -rf "$d"; mkdir -p "$d"
  cat > "$d/in.$ext"
  nohup setsid nice -n 10 venv/bin/python media_tool.py transcribe "$d/in.$ext" --output "$d/out.json" --models "$HOME/media-asr/models" --prompt "$prompt" "${args[@]}" >"$d/summary.json" 2>"$d/err.txt" </dev/null &
  echo $! > "$d/pid"
  printf '{"job":"%s","started":true}\n' "$id"
  exit 0
fi

job=$(mktemp -d /tmp/media-asr.XXXXXX); trap 'rm -rf "$job"' EXIT
cat > "$job/in.$ext"
# attached work runs in the background and is killed when the caller's ssh session goes away (tower stopped it for a
# drain) — it must never keep burning boss's CPU for a result nobody will read
watch_parent() { local sshd=$PPID; while kill -0 "$1" 2>/dev/null; do kill -0 "$sshd" 2>/dev/null || { kill "$1" 2>/dev/null; return; }; sleep 2; done; }
if [[ "$verb" == "transcribe" ]]; then
  nice -n 10 venv/bin/python media_tool.py transcribe "$job/in.$ext" --output "$job/out.json" --models "$HOME/media-asr/models" --prompt "$prompt" "${args[@]}" >"$job/summary.json" &
  py=$!; watch_parent "$py" & wait "$py"
  cat "$job/out.json"
else
  nice -n 10 venv/bin/python media_tool.py "$verb" "$job/in.$ext" --models "$HOME/media-asr/models" --prompt "$prompt" "${args[@]}" >"$job/res.txt" &
  py=$!; watch_parent "$py" & wait "$py"
  tail -1 "$job/res.txt"
fi
