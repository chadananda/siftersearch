#!/usr/bin/env python3
"""
NER Entity Extraction Pipeline — Stage 1 + 2

Stage 1: spaCy en_core_web_lg (standard NER: people, places, orgs, dates)
Stage 2: GLiNER (zero-shot custom: religious figures, holy texts, concepts)

Runs on tower-nas using all available CPU cores. Processes 3.5M paragraphs
in ~1-2 hours. Results stored in content_objects table for the knowledge graph.

Usage:
    python scripts/run-ner.py                    # process all unextracted
    python scripts/run-ner.py --dry-run           # count only
    python scripts/run-ner.py --workers 40        # limit CPU cores
    python scripts/run-ner.py --batch-size 500    # paragraphs per batch
    python scripts/run-ner.py --doc-id 123        # single document
"""

import argparse
import json
import os
import sqlite3
import time
from multiprocessing import Pool, cpu_count
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data" / "sifter.db"
STATE_FILE = PROJECT_ROOT / "tmp" / "ner-state.json"
MAX_PARAGRAPH_CHARS = 6000
BATCH_SIZE = 500

# GLiNER custom entity types — fewer labels = faster inference
# Each label multiplies inference time, so keep it tight
GLINER_LABELS = [
    "religious figure",
    "sacred text",
    "religious concept",
    "holy place",
    "religious community",
    "prayer",
    "revelation",
    "ceremony"
]

# spaCy → our entity type mapping
SPACY_TYPE_MAP = {
    "PERSON": "people",
    "GPE": "places",      # geopolitical entities (countries, cities)
    "LOC": "places",      # locations
    "FAC": "places",      # facilities
    "ORG": "concepts",    # organizations (mapped to concepts for religious orgs)
    "WORK_OF_ART": "documents",
    "EVENT": "events",
    "DATE": "events",     # dates mapped to events
    "NORP": "concepts",   # nationalities, religious groups
    "LAW": "documents",   # laws, treaties
}

# GLiNER → our entity type mapping
GLINER_TYPE_MAP = {
    "religious figure": "people",
    "prophet": "people",
    "messenger": "people",
    "holy book": "documents",
    "scripture": "documents",
    "sacred text": "documents",
    "religious concept": "concepts",
    "spiritual teaching": "concepts",
    "prayer": "concepts",
    "ritual": "concepts",
    "ceremony": "events",
    "religious community": "concepts",
    "faith tradition": "concepts",
    "temple": "places",
    "shrine": "places",
    "holy place": "places",
    "covenant": "concepts",
    "revelation": "concepts",
    "dispensation": "concepts",
}

# ─── State tracking ─────────────────────────────────────────────────────────

stats = {
    "started": "",
    "stage": "initializing",
    "processed": 0,
    "total": 0,
    "entities_found": 0,
    "errors": 0,
    "rate": 0,
    "percent": 0,
}

def save_state():
    try:
        STATE_FILE.parent.mkdir(exist_ok=True)
        STATE_FILE.write_text(json.dumps(stats, indent=2))
    except Exception:
        pass

# ─── spaCy processing (Stage 1) ─────────────────────────────────────────────

_nlp = None

def init_spacy():
    """Initialize spaCy model in each worker process."""
    global _nlp
    import spacy
    _nlp = spacy.load("en_core_web_lg", disable=["parser", "lemmatizer", "textcat"])

def extract_spacy(texts_with_ids):
    """Extract entities from a batch of (id, doc_id, text) tuples using spaCy."""
    global _nlp
    results = []
    for para_id, doc_id, text in texts_with_ids:
        try:
            doc = _nlp(text[:MAX_PARAGRAPH_CHARS])
            entities = {}
            for ent in doc.ents:
                category = SPACY_TYPE_MAP.get(ent.label_)
                if category:
                    if category not in entities:
                        entities[category] = set()
                    entities[category].add(ent.text.strip())
            # Convert sets to sorted lists of dicts
            result = {
                cat: [{"name": n} for n in sorted(names)]
                for cat, names in entities.items()
            }
            results.append((para_id, doc_id, result))
        except Exception as e:
            results.append((para_id, doc_id, {"_error": str(e)}))
    return results

# ─── GLiNER processing (Stage 2) ─────────────────────────────────────────────

_gliner = None

def init_gliner():
    """Initialize GLiNER model in each worker process."""
    global _gliner
    from gliner import GLiNER
    _gliner = GLiNER.from_pretrained("urchade/gliner_medium-v2.1")

def extract_gliner(texts_with_ids):
    """Extract custom entities from a batch using GLiNER."""
    global _gliner
    results = []
    for para_id, doc_id, text in texts_with_ids:
        try:
            preds = _gliner.predict_entities(
                text[:MAX_PARAGRAPH_CHARS],
                GLINER_LABELS,
                threshold=0.4
            )
            entities = {}
            for pred in preds:
                category = GLINER_TYPE_MAP.get(pred["label"], "concepts")
                if category not in entities:
                    entities[category] = set()
                entities[category].add(pred["text"].strip())
            result = {
                cat: [{"name": n} for n in sorted(names)]
                for cat, names in entities.items()
            }
            results.append((para_id, doc_id, result))
        except Exception as e:
            results.append((para_id, doc_id, {"_error": str(e)}))
    return results

# ─── Merge results ───────────────────────────────────────────────────────────

def merge_entities(spacy_result, gliner_result):
    """Merge entities from spaCy and GLiNER, deduplicating by name."""
    merged = {}
    for category in ["people", "places", "documents", "events", "concepts"]:
        names = set()
        for result in [spacy_result, gliner_result]:
            if result and category in result:
                for ent in result[category]:
                    if isinstance(ent, dict) and "name" in ent:
                        names.add(ent["name"])
        if names:
            merged[category] = [{"name": n} for n in sorted(names)]
        else:
            merged[category] = []
    merged["relations"] = []  # Relations require LLM — Stage 3
    return merged

# ─── Database operations ─────────────────────────────────────────────────────

def get_unprocessed_paragraphs(db_path, doc_id=None, limit=None):
    """Get paragraphs that haven't been NER-processed yet."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    where = """
        WHERE c.deleted_at IS NULL
        AND LENGTH(c.text) > 20
        AND LENGTH(c.text) <= ?
        AND c.id NOT IN (SELECT content_id FROM content_objects)
    """
    params = [MAX_PARAGRAPH_CHARS]

    if doc_id:
        where += " AND c.doc_id = ?"
        params.append(doc_id)

    query = f"""
        SELECT c.id, c.doc_id, c.text
        FROM content c
        {where}
        ORDER BY c.doc_id, c.paragraph_index
    """
    if limit:
        query += f" LIMIT {limit}"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [(r["id"], r["doc_id"], r["text"]) for r in rows]

def store_results(db_path, results):
    """Store merged NER results in content_objects table."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")

    for para_id, doc_id, entities in results:
        if "_error" in entities:
            continue

        rendered = ", ".join(
            ent["name"]
            for cat in ["people", "places", "concepts", "events", "documents"]
            for ent in entities.get(cat, [])
        )

        try:
            conn.execute("""
                INSERT OR REPLACE INTO content_objects
                    (content_id, doc_id, people_json, places_json, documents_json,
                     events_json, concepts_json, relations_json, rendered, object_pipeline_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                para_id, doc_id,
                json.dumps(entities.get("people", [])),
                json.dumps(entities.get("places", [])),
                json.dumps(entities.get("documents", [])),
                json.dumps(entities.get("events", [])),
                json.dumps(entities.get("concepts", [])),
                json.dumps(entities.get("relations", [])),
                rendered,
                "v1-ner"
            ])
        except Exception as e:
            print(f"  DB error for para {para_id}: {e}")

    conn.commit()
    conn.close()

# ─── Main ────────────────────────────────────────────────────────────────────

def chunk_list(lst, n):
    """Split list into chunks of size n."""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def main():
    parser = argparse.ArgumentParser(description="NER Entity Extraction Pipeline")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=max(1, cpu_count() - 4))
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--doc-id", type=int)
    parser.add_argument("--stage", choices=["1", "2", "both"], default="both")
    args = parser.parse_args()

    stats["started"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    stats["stage"] = "loading"
    save_state()

    print("=== NER Entity Extraction Pipeline ===")
    print(f"Workers: {args.workers}, Batch size: {args.batch_size}")
    print(f"Stage: {args.stage}")
    if args.doc_id:
        print(f"Filter: doc_id = {args.doc_id}")
    print()

    # Get work
    paragraphs = get_unprocessed_paragraphs(DB_PATH, doc_id=args.doc_id)
    stats["total"] = len(paragraphs)
    print(f"Paragraphs to process: {len(paragraphs):,}")

    if args.dry_run or len(paragraphs) == 0:
        print("Nothing to do." if len(paragraphs) == 0 else "DRY RUN")
        return

    start_time = time.time()
    batches = list(chunk_list(paragraphs, args.batch_size))
    print(f"Batches: {len(batches)}\n")

    # ── Stage 1: spaCy ──────────────────────────────────────────────────────
    if args.stage in ("1", "both"):
        stats["stage"] = "spacy"
        save_state()
        print("Stage 1: spaCy en_core_web_lg...")

        spacy_results = {}
        with Pool(args.workers, initializer=init_spacy) as pool:
            for i, batch_results in enumerate(pool.imap(extract_spacy, batches)):
                for para_id, doc_id, entities in batch_results:
                    spacy_results[para_id] = (doc_id, entities)
                    stats["processed"] += 1
                    if "_error" not in entities:
                        stats["entities_found"] += sum(len(v) for v in entities.values())

                elapsed = time.time() - start_time
                stats["rate"] = int(stats["processed"] / (elapsed / 60)) if elapsed > 0 else 0
                stats["percent"] = round((stats["processed"] / stats["total"]) * 100, 1)

                if (i + 1) % 10 == 0 or i == len(batches) - 1:
                    print(f"  Batch {i+1}/{len(batches)}: {stats['processed']:,} / {stats['total']:,} ({stats['percent']}%) ~{stats['rate']:,}/min")
                    save_state()

        print(f"  spaCy done: {stats['entities_found']:,} entities in {time.time()-start_time:.0f}s\n")

    # ── Stage 2: GLiNER ─────────────────────────────────────────────────────
    gliner_results = {}
    if args.stage in ("2", "both"):
        stats["stage"] = "gliner"
        stats["processed"] = 0
        save_state()
        print("Stage 2: GLiNER (custom religious entities)...")

        gliner_start = time.time()
        # GLiNER uses ~4GB per worker. Cap at 12 to avoid swap on 188GB RAM
        gliner_workers = min(12, max(1, args.workers // 6))
        print(f"  Using {gliner_workers} workers for GLiNER")

        with Pool(gliner_workers, initializer=init_gliner) as pool:
            for i, batch_results in enumerate(pool.imap(extract_gliner, batches)):
                for para_id, doc_id, entities in batch_results:
                    gliner_results[para_id] = (doc_id, entities)
                    stats["processed"] += 1
                    if "_error" not in entities:
                        stats["entities_found"] += sum(len(v) for v in entities.values())

                elapsed = time.time() - gliner_start
                stats["rate"] = int(stats["processed"] / (elapsed / 60)) if elapsed > 0 else 0
                stats["percent"] = round((stats["processed"] / stats["total"]) * 100, 1)

                if (i + 1) % 10 == 0 or i == len(batches) - 1:
                    print(f"  Batch {i+1}/{len(batches)}: {stats['processed']:,} / {stats['total']:,} ({stats['percent']}%) ~{stats['rate']:,}/min")
                    save_state()

        print(f"  GLiNER done: {stats['entities_found']:,} entities in {time.time()-gliner_start:.0f}s\n")

    # ── Merge & Store ────────────────────────────────────────────────────────
    stats["stage"] = "storing"
    save_state()
    print("Merging and storing results...")

    all_para_ids = set(list(spacy_results.keys()) + list(gliner_results.keys())) if args.stage == "both" else set(spacy_results.keys() or gliner_results.keys())

    merged_results = []
    for para_id in all_para_ids:
        spacy_doc_id, spacy_ents = spacy_results.get(para_id, (None, {}))
        gliner_doc_id, gliner_ents = gliner_results.get(para_id, (None, {}))
        doc_id = spacy_doc_id or gliner_doc_id
        merged = merge_entities(spacy_ents, gliner_ents)
        merged_results.append((para_id, doc_id, merged))

    # Store in batches to avoid holding everything in memory
    for chunk in chunk_list(merged_results, 5000):
        store_results(str(DB_PATH), chunk)

    total_time = time.time() - start_time
    stats["stage"] = "complete"
    stats["percent"] = 100
    save_state()

    print(f"\n=== Summary ===")
    print(f"Paragraphs:  {len(merged_results):,}")
    print(f"Entities:    {stats['entities_found']:,}")
    print(f"Errors:      {stats['errors']}")
    print(f"Time:        {total_time:.0f}s ({total_time/60:.1f}min)")
    print(f"Rate:        {len(merged_results) / (total_time/60):.0f} paragraphs/min")

if __name__ == "__main__":
    main()
