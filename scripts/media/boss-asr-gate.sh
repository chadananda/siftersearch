#!/bin/bash
# Forced command for tower's key on boss (authorized_keys: command="~/media-asr/asr-gate.sh",from="<tower>",restrict).
# Boss's Zen 5 CPU runs Whisper ~6x faster than tower's Xeons (measured 10-21: RTF 0.06 vs 0.36), so the media pipeline
# sends ASR here. Audio arrives on stdin; the result JSON leaves on stdout. Only these verbs:
#   probe|langid|transcribe <ext> [--opt value …]   run media_tool.py on the uploaded audio
#   install-tool                                  replace media_tool.py with stdin (kept in sync from the repo)
set -euo pipefail
cd "$HOME/media-asr"
read -r -a A <<< "${SSH_ORIGINAL_COMMAND:-}"
verb="${A[0]:-}"
if [[ "$verb" == "install-tool" ]]; then cat > media_tool.py.new && mv media_tool.py.new media_tool.py && echo '{"installed":true}'; exit 0; fi
[[ "$verb" =~ ^(probe|langid|transcribe)$ ]] || { echo '{"error":"verb not allowed"}'; exit 2; }
ext="${A[1]:-}"; [[ "$ext" =~ ^[a-z0-9]{2,5}$ ]] || { echo '{"error":"bad ext"}'; exit 2; }
args=()
for a in "${A[@]:2}"; do [[ "$a" =~ ^[A-Za-z0-9_.,:=+/-]*$ ]] || { echo '{"error":"bad arg"}'; exit 2; }; args+=("$a"); done
job=$(mktemp -d /tmp/media-asr.XXXXXX); trap 'rm -rf "$job"' EXIT
cat > "$job/in.$ext"
# the prompt travels base64 (spaces and diacritics), decoded here
prompt=""; if [[ -n "${MEDIA_PROMPT_B64:-}" ]]; then prompt=$(printf '%s' "$MEDIA_PROMPT_B64" | base64 -d); fi
for i in "${!args[@]}"; do if [[ "${args[$i]}" == --prompt-b64=* ]]; then prompt=$(printf '%s' "${args[$i]#--prompt-b64=}" | base64 -d); unset 'args[i]'; fi; done
if [[ "$verb" == "transcribe" ]]; then
  nice -n 10 venv/bin/python media_tool.py transcribe "$job/in.$ext" --output "$job/out.json" --models "$HOME/media-asr/models" --prompt "$prompt" "${args[@]}" >"$job/summary.json"
  cat "$job/out.json"
else
  nice -n 10 venv/bin/python media_tool.py "$verb" "$job/in.$ext" --prompt "$prompt" "${args[@]}" | tail -1
fi
