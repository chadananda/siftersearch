#!/bin/bash
# Boss screening driver: start screen.py only while >= 7 GB RAM is free (5 GB floor + its ~2 GB); it exits itself under
# 3 GB and is restarted here when RAM is back (per-file results are cached). Hard deadline 6 h. Usage: run_screen.sh <clip ...>
cd /mnt/data4tb/remaster-rnd
export TMPDIR=$PWD/tmp PYTHONPATH=$PWD/pylib TORCH_HOME=$PWD/torch EMB_MODEL=$HOME/media-asr/models/wespeaker_en_voxceleb_resnet34_LM.onnx SCREEN_THREADS=4 SCREEN_QUALITY=0
end=$(( $(date +%s) + 6*3600 ))
while [ "$(date +%s)" -lt "$end" ]; do
  avail=$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)
  if [ "$avail" -ge 7 ]; then
    nice -n 15 ionice -c3 $HOME/media-asr/venv/bin/python screen.py $PWD "$@" && { echo SCREEN_DONE; exit 0; }
  fi
  sleep 30
done
echo SCREEN_TIMEOUT
