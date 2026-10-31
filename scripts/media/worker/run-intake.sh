#!/bin/bash
# Donor-intake sampler on tower's LAN queue (planning/donor-intake-plan-20261030.md step 5). Lives beside env-lan on a home host
# (aorus ~/sifter-queue, boss ~/sifter-whole-home). Restart: kill -TERM the agent (it finishes jobs in hand), rerun.
# IMAGE=<worker image> [ROOT=/data/sifter-queue] ./run-intake.sh [--talks 1] [--books 2] [--can intake-book]
cd "$(dirname "$0")"
set -a; . ./env-lan; set +a
exec nohup node bin/intake-agent.mjs --host "$(hostname)-intake" --root "${ROOT:-/data/sifter-queue}" --image "${IMAGE}" "$@" >> intake.log 2>&1 < /dev/null
