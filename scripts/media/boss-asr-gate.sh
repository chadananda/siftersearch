#!/bin/bash
# Forced command for tower's key on boss (authorized_keys: command="~/media-asr/asr-gate.sh",from="<tower>",restrict).
# Boss's Zen 5 CPU runs Whisper ~6x faster than tower's Xeons (measured 10-21: RTF 0.06 vs 0.36), so the media pipeline
# sends ASR here. Audio arrives on stdin; the result JSON leaves on stdout. Only these verbs:
#   probe|langid|transcribe|diarize <ext> [--opt value …]   run media_tool.py on the uploaded audio (attached: killed when
#                                                          the caller's ssh session goes)
#   start <ext> <job> [--opt value …]                       a DETACHED transcription (survives the caller's restarts):
#   poll <job> · fetch <job> · cancel <job>                 its state · its transcript JSON · stop it
#   start <ext> <job> --verb diarize|grade|dfn|encode             the same, for a diarization, a quality grade or a DeepFilterNet copy
#   fetch-file <job>                                        a detached job's output FILE (the DeepFilterNet audio)
#   running <tool>                                          the ids of the live detached jobs of that kind
#   clean <job>                                             remove a finished job's folder (tower has fetched its result)
#   df                                                      free space where the jobs live (+ the jobs' own size)
# JANITOR (on 'start', at most every 10 min): job folders older than MEDIA_JOB_KEEP_HOURS (6) and not running are removed,
# then the oldest finished ones until the jobs use ≤ MEDIA_JOB_CAP_GB (60). 10-23 16:09: aorus's 234 GB disk filled with
# 1,484 job folders (169 GB) — nothing ever removed them — and every enhance/transcribe/diarize failed "No space left".
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
[[ "$verb" =~ ^(probe|langid|transcribe|diarize|start|poll|fetch|fetch-file|cancel|running|clean|df)$ ]] || { echo '{"error":"verb not allowed"}'; exit 2; }

job_alive() { local pid; pid=$(cat "$1/pid" 2>/dev/null || echo 0); [[ "$pid" =~ ^[0-9]+$ && "$pid" != 0 ]] && kill -0 "$pid" 2>/dev/null; }
janitor() {
  mkdir -p jobs; local stamp=jobs/.janitor
  [[ -f "$stamp" && -z "$(find "$stamp" -mmin +10 2>/dev/null)" ]] && return 0
  touch "$stamp"
  local keep_min=$(( ${MEDIA_JOB_KEEP_HOURS:-6} * 60 )) cap_kb=$(( ${MEDIA_JOB_CAP_GB:-60} * 1024 * 1024 )) d
  while IFS= read -r d; do job_alive "$d" || rm -rf "$d"; done < <(find jobs -mindepth 1 -maxdepth 1 -type d -mmin +"$keep_min" 2>/dev/null)
  local used; used=$(du -sk jobs 2>/dev/null | cut -f1)
  if (( ${used:-0} > cap_kb )); then
    while IFS= read -r d; do
      (( ${used:-0} <= cap_kb )) && break
      job_alive "$d" && continue
      local sz; sz=$(du -sk "$d" 2>/dev/null | cut -f1); rm -rf "$d"; used=$(( used - ${sz:-0} ))
    done < <(ls -1dtr jobs/*/ 2>/dev/null | sed 's:/$::')   # oldest first
  fi
}
if [[ "$verb" == "df" ]]; then
  mkdir -p jobs
  read -r size avail pcent < <(df -Pk jobs | awk 'NR==2 {gsub("%","",$5); print $2, $4, $5}')
  printf '{"free_gb":%s,"size_gb":%s,"used_pct":%s,"jobs":%s}\n' "$(( avail / 1048576 ))" "$(( size / 1048576 ))" "$pcent" "$(find jobs -mindepth 1 -maxdepth 1 -type d | wc -l)"
  exit 0
fi
if [[ "$verb" == "clean" ]]; then
  id="${A[1]:-}"; [[ "$id" =~ ^[a-z0-9-]{4,120}$ ]] || { echo '{"error":"bad job"}'; exit 2; }
  d="jobs/$id"; [[ -d "$d" ]] || { echo '{"cleaned":false,"why":"missing"}'; exit 0; }
  job_alive "$d" && { echo '{"cleaned":false,"why":"running"}'; exit 0; }
  rm -rf "$d"; echo '{"cleaned":true}'; exit 0
fi

# ── running <tool>: the ids of this host's LIVE detached jobs of one kind (tower's slot count is checked against it: jobs
# started before a tower restart and not yet re-attached are otherwise invisible to it — 10-23: 3 diarizations on aorus, cap 2)
if [[ "$verb" == "running" ]]; then
  want="${A[1]:-}"; [[ "$want" =~ ^(transcribe|diarize|grade|dfn|encode)$ ]] || { echo '{"error":"bad verb"}'; exit 2; }
  ids=""
  for p in jobs/*/pid; do
    [[ -e "$p" ]] || continue; pid=$(cat "$p" 2>/dev/null || echo 0); [[ "$pid" =~ ^[0-9]+$ && "$pid" != 0 ]] || continue
    kill -0 "$pid" 2>/dev/null || continue
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "media_tool.py $want " || continue
    j=$(basename "$(dirname "$p")"); ids="${ids:+$ids,}\"$j\""
  done
  printf '{"running":[%s]}\n' "$ids"; exit 0
fi

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
  janitor || true
  d="jobs/$id"; rm -rf "$d"; mkdir -p "$d"
  cat > "$d/in.$ext"
  # a detached job is a transcription, or (--verb diarize) a diarization; both survive the caller's restarts
  tool=transcribe; rest2=()
  for ((k=0; k<${#args[@]}; k++)); do if [[ "${args[$k]:-}" == "--verb" ]]; then tool="${args[$((k+1))]:-}"; k=$((k+1)); else rest2+=("${args[$k]:-}"); fi; done
  [[ "$tool" =~ ^(transcribe|diarize|grade|dfn|encode)$ ]] || { echo '{"error":"bad verb"}'; exit 2; }
  export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1   # every model is local: no internet in the compute lane
  if [[ "$tool" == "grade" ]]; then
    # the grade's JSON is its last stdout line: out.json is written when it ends
    nohup setsid bash -c 'nice -n 10 venv/bin/python media_tool.py grade "$1" --models "$2" "${@:4}" > "$3.tmp" && tail -1 "$3.tmp" > "$3" && rm -f "$3.tmp"' _ "$d/in.$ext" "$PWD/models" "$d/out.json" ${rest2[@]+"${rest2[@]}"} 2>"$d/err.txt" </dev/null &
  elif [[ "$tool" == "dfn" ]]; then
    [[ -x venv-dfn/bin/python ]] || { echo '{"error":"no DeepFilterNet venv on this host"}'; exit 2; }
    nohup setsid bash -c 'nice -n 10 venv-dfn/bin/python media_tool.py dfn "$1" --output "$2" "${@:5}" > "$3" && echo "{\"done\":true}" > "$3.ok" && mv "$3.ok" "$4"' _ "$d/in.$ext" "$d/out.file" "$d/summary.json" "$d/out.json" ${rest2[@]+"${rest2[@]}"} 2>"$d/err.txt" </dev/null &
  elif [[ "$tool" == "encode" ]]; then
    # a fixed encode recipe (media_tool.py encode: light chain / ogg / m4a) → out.file, then the out.json marker
    nohup setsid bash -c 'nice -n 10 venv/bin/python media_tool.py encode "$1" --output "$2" "${@:5}" > "$3" && echo "{\"done\":true}" > "$3.ok" && mv "$3.ok" "$4"' _ "$d/in.$ext" "$d/out.file" "$d/summary.json" "$d/out.json" ${rest2[@]+"${rest2[@]}"} 2>"$d/err.txt" </dev/null &
  elif [[ "$tool" == "diarize" ]]; then
    # nice 19: a diarization (CPU) yields to the transcriptions feeding the GPU (10-23: ten on aorus starved its GPU)
    # a host with venv-diar (aorus: sherpa-onnx built for CUDA) diarizes on its GPU, the CUDA libraries from the main venv
    if [[ -x venv-diar/bin/python ]]; then
      NV=$(ls -d "$PWD"/venv/lib/python3*/site-packages/nvidia/*/lib 2>/dev/null | tr '\n' ':')
      LD_LIBRARY_PATH="$NV${LD_LIBRARY_PATH:-}" MEDIA_DIAR_PROVIDER=cuda nohup setsid nice -n 19 venv-diar/bin/python media_tool.py diarize "$d/in.$ext" --output "$d/out.json" --models "$PWD/models" ${rest2[@]+"${rest2[@]}"} --threads 1 >"$d/summary.json" 2>"$d/err.txt" </dev/null &
    else
      nohup setsid nice -n 19 venv/bin/python media_tool.py diarize "$d/in.$ext" --output "$d/out.json" --models "$PWD/models" ${rest2[@]+"${rest2[@]}"} >"$d/summary.json" 2>"$d/err.txt" </dev/null &
    fi
  else
    nohup setsid nice -n 10 venv/bin/python media_tool.py transcribe "$d/in.$ext" --output "$d/out.json" --models "$PWD/models" --prompt "$prompt" ${rest2[@]+"${rest2[@]}"} >"$d/summary.json" 2>"$d/err.txt" </dev/null &
  fi
  echo $! > "$d/pid"
  printf '{"job":"%s","started":true}\n' "$id"
  exit 0
fi

export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1   # every model is local: no internet in the compute lane
mkdir -p tmp; job=$(mktemp -d "$PWD/tmp/media-asr.XXXXXX"); trap 'rm -rf "$job"' EXIT   # on disk: aorus's /tmp is RAM (10-23)
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
