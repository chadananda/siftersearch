#!/bin/bash
# Full NER Extraction Pipeline
# Runs Stage 1 (spaCy), Stage 2 (gazetteer), Stage 3 (multilingual) sequentially
# Usage: nohup bash scripts/run-full-extraction.sh > logs/full-extraction.log 2>&1 &

set -e
cd ~/sifter/siftersearch
source .venv-ner/bin/activate

echo "=== Full NER Extraction Pipeline ==="
echo "Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo

# Stage 1: spaCy (English NER) — ~21 minutes
echo ">>> Stage 1: spaCy en_core_web_lg"
python scripts/run-ner.py --stage 1 --workers 72 --batch-size 500
echo

# Stage 2: Gazetteer (religious entities) — ~2-3 minutes
echo ">>> Stage 2: Gazetteer religious entity extraction"
python scripts/run-gazetteer.py --standalone --workers 72 --batch-size 5000
echo

# Stage 3: Multilingual NER (Hebrew, Arabic, Farsi) — ~1-2 minutes
echo ">>> Stage 3: Multilingual NER (xx_ent_wiki_sm)"
python scripts/run-ner-multilingual.py --workers 40
echo

echo "=== All stages complete ==="
echo "Finished: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# Final count
echo
sqlite3 data/sifter.db "SELECT COUNT(*) || ' content_objects rows' FROM content_objects;"
sqlite3 data/sifter.db "SELECT object_pipeline_version, COUNT(*) FROM content_objects GROUP BY object_pipeline_version;"
