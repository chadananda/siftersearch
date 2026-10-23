#!/bin/bash
# Forced command for tower's key on boss (authorized_keys: command="~/media-asr/asr-gate.sh",from="<tower>",restrict).
# Boss's Zen 5 CPU runs Whisper ~6x faster than tower's Xeons (measured 10-21: RTF 0.06 vs 0.36), so the media pipeline
# sends ASR here. Audio arrives on stdin; the result JSON leaves on stdout. Only these verbs:
#   probe|langid|transcribe|diarize <ext> [--opt value …]   run media_tool.py on the uploaded audio (attached: killed when
#                                                          the caller's ssh session goes)
#   start <ext> <job> [--opt value …]                       a DETACHED transcription (survives the caller's restarts):
#   poll <job> · fetch <job> · cancel <job>                 its state · its transcript JSON · stop it
#   start <ext> <job> --verb diarize|grade|dfn             the same, for a diarization, a quality grade or a DeepFilterNet copy
#   fetch-file <job>                                        a detached job's output FILE (the DeepFilterNet audio)
# The same script serves every compute host (boss: CPU; aorus: CUDA): it runs from its own directory, with that host's venv
# (venv/, venv-dfn/ for DeepFilterNet) and models (models/). Every model is local; nothing here reaches the internet.
#   install-tool                                            replace media_tool.py with stdin (kept in sync from the repo)
#   short · install-renderer                                an audiogram short (tar in, MP4 out) · replace render_short.py
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
export PATH="$HOME/.local/bin:$PATH"   # user-space tools (aorus: a static ffmpeg/ffprobe)
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
read -r -a A <<< "${SSH_ORIGINAL_COMMAND:-}"
verb="${A[0]:-}"
watch_parent() { local sshd=$PPID; while kill -0 "$1" 2>/dev/null; do kill -0 "$sshd" 2>/dev/null || { kill "$1" 2>/dev/null; return; }; sleep 2; done; }
if [[ "$verb" == "install-tool" ]]; then cat > media_tool.py.new && mv media_tool.py.new media_tool.py && echo '{"installed":true}'; exit 0; fi
if [[ "$verb" == "install-renderer" ]]; then cat > render_short.py.new && mv render_short.py.new render_short.py && echo '{"installed":true}'; exit 0; fi
# an audiogram SHORT: a tar (spec.json, audio.m4a, captions.ass, portrait.jpg?, qr.png) in, the MP4 out; fixed recipes only;
# killed when the caller's ssh session goes (same watcher as the ASR verbs)
if [[ "$verb" == "short" ]]; then
  job=$(mktemp -d /tmp/media-short.XXXXXX); trap 'rm -rf "$job"' EXIT
  tar -C "$job" -xf - --no-same-owner 2>/dev/null
  for f in "$job"/* "$job"/.[!.]*; do [[ -e "$f" ]] || continue; [[ "$(basename "$f")" =~ ^(spec\.json|audio\.m4a|captions\.ass|portrait\.jpg|qr\.png)$ ]] || { echo '{"error":"unexpected file"}' >&2; exit 2; }; done
  SHORT_THREADS=12 nice -n 10 python3 render_short.py "$job" >&2 &
  py=$!; watch_parent "$py" & wait "$py"
  cat "$job/out.mp4"; exit 0
fi
[[ "$verb" =~ ^(probe|langid|transcribe|diarize|start|poll|fetch|fetch-file|cancel)$ ]] || { echo '{"error":"verb not allowed"}'; exit 2; }

# ── detached jobs: ~/media-asr/jobs/<job>/ (in.<ext>, out.json, pid, err.txt); kept two days ──
if [[ "$verb" =~ ^(poll|fetch|fetch-file|cancel)$ ]]; then
  id="${A[1]:-}"; [[ "$id" =~ ^[a-z0-9-]{4,120}$ ]] || { echo '{"error":"bad job"}'; exit 2; }
  d="jobs/$id"; [[ -d "$d" ]] || { echo '{"state":"missing"}'; exit 0; }
  pid=$(cat "$d/pid" 2>/dev/null || echo 0)
  alive=0; [[ "$pid" != 0 ]] && kill -0 "$pid" 2>/dev/null && alive=1
  if [[ "$verb" == "cancel" ]]; then [[ $alive == 1 ]] && kill "$pid"; echo '{"cancelled":true}'; exit 0; fi
  if [[ "$verb" == "fetch" ]]; then cat "$d/out.json"; exit 0; fi
  if [[ "$verb" == "fetch-file" ]]; then cat "$d/out.file"; exit 0; fi
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
args=(${args[@]+"${args[@]}"})   # re-pack: the unset above leaves a hole, and a hole read under set -u is 'unbound variable'

if [[ "$verb" == "start" ]]; then
  find jobs -mindepth 1 -maxdepth 1 -type d -mtime +2 -exec rm -rf {} + 2>/dev/null || true
  d="jobs/$id"; rm -rf "$d"; mkdir -p "$d"
  cat > "$d/in.$ext"
  # a detached job is a transcription, or (--verb diarize) a diarization; both survive the caller's restarts
  tool=transcribe; rest2=()
  for ((k=0; k<${#args[@]}; k++)); do if [[ "${args[$k]:-}" == "--verb" ]]; then tool="${args[$((k+1))]:-}"; k=$((k+1)); else rest2+=("${args[$k]:-}"); fi; done
  [[ "$tool" =~ ^(transcribe|diarize|grade|dfn)$ ]] || { echo '{"error":"bad verb"}'; exit 2; }
  export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1   # every model is local: no internet in the compute lane
  if [[ "$tool" == "grade" ]]; then
    # the grade's JSON is its last stdout line: out.json is written when it ends
    nohup setsid bash -c 'nice -n 10 venv/bin/python media_tool.py grade "$1" --models "$2" "${@:4}" > "$3.tmp" && tail -1 "$3.tmp" > "$3" && rm -f "$3.tmp"' _ "$d/in.$ext" "$PWD/models" "$d/out.json" ${rest2[@]+"${rest2[@]}"} 2>"$d/err.txt" </dev/null &
  elif [[ "$tool" == "dfn" ]]; then
    [[ -x venv-dfn/bin/python ]] || { echo '{"error":"no DeepFilterNet venv on this host"}'; exit 2; }
    nohup setsid bash -c 'nice -n 10 venv-dfn/bin/python media_tool.py dfn "$1" --output "$2" "${@:5}" > "$3" && echo "{\"done\":true}" > "$3.ok" && mv "$3.ok" "$4"' _ "$d/in.$ext" "$d/out.file" "$d/summary.json" "$d/out.json" ${rest2[@]+"${rest2[@]}"} 2>"$d/err.txt" </dev/null &
  elif [[ "$tool" == "diarize" ]]; then
    nohup setsid nice -n 10 venv/bin/python media_tool.py diarize "$d/in.$ext" --output "$d/out.json" --models "$PWD/models" ${rest2[@]+"${rest2[@]}"} >"$d/summary.json" 2>"$d/err.txt" </dev/null &
  else
    nohup setsid nice -n 10 venv/bin/python media_tool.py transcribe "$d/in.$ext" --output "$d/out.json" --models "$PWD/models" --prompt "$prompt" ${rest2[@]+"${rest2[@]}"} >"$d/summary.json" 2>"$d/err.txt" </dev/null &
  fi
  echo $! > "$d/pid"
  printf '{"job":"%s","started":true}\n' "$id"
  exit 0
fi

export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1   # every model is local: no internet in the compute lane
job=$(mktemp -d /tmp/media-asr.XXXXXX); trap 'rm -rf "$job"' EXIT
cat > "$job/in.$ext"
# attached work runs in the background and is killed when the caller's ssh session goes away (tower stopped it for a
# drain) — it must never keep burning boss's CPU for a result nobody will read
if [[ "$verb" == "transcribe" ]]; then
  nice -n 10 venv/bin/python media_tool.py transcribe "$job/in.$ext" --output "$job/out.json" --models "$PWD/models" --prompt "$prompt" ${args[@]+"${args[@]}"} >"$job/summary.json" &
  py=$!; watch_parent "$py" & wait "$py"
  cat "$job/out.json"
else
  nice -n 10 venv/bin/python media_tool.py "$verb" "$job/in.$ext" --models "$PWD/models" --prompt "$prompt" ${args[@]+"${args[@]}"} >"$job/res.txt" &
  py=$!; watch_parent "$py" & wait "$py"
  tail -1 "$job/res.txt"
fi
