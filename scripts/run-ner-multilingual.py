#!/usr/bin/env python3
"""
Multilingual NER Entity Extraction — Hebrew, Arabic, Farsi

Uses spaCy xx_ent_wiki_sm for non-English texts that en_core_web_lg misses.
Merges results into existing content_objects rows.

Usage:
    python scripts/run-ner-multilingual.py                  # process all non-English
    python scripts/run-ner-multilingual.py --dry-run         # count only
    python scripts/run-ner-multilingual.py --language he     # Hebrew only
"""

import argparse
import json
import os
import re
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

# Unicode ranges for non-Latin scripts
HEBREW_RANGE = re.compile(r'[\u0590-\u05FF]')
ARABIC_RANGE = re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')

# spaCy entity type mapping (same as main NER)
SPACY_TYPE_MAP = {
    "PER": "people",
    "PERSON": "people",
    "LOC": "places",
    "GPE": "places",
    "FAC": "places",
    "ORG": "concepts",
    "MISC": "concepts",
    "EVENT": "events",
    "DATE": "events",
    "WORK_OF_ART": "documents",
    "NORP": "concepts",
}

# ─── Detection ────────────────────────────────────────────────────────────────

def detect_non_english(text):
    """Check if text contains significant non-Latin script."""
    hebrew_chars = len(HEBREW_RANGE.findall(text))
    arabic_chars = len(ARABIC_RANGE.findall(text))
    total = len(text)
    if total == 0:
        return None
    ratio = (hebrew_chars + arabic_chars) / total
    if ratio > 0.1:  # More than 10% non-Latin
        if hebrew_chars > arabic_chars:
            return "he"
        return "ar"
    return None

# ─── spaCy processing ────────────────────────────────────────────────────────

_nlp = None

def init_worker():
    """Initialize multilingual spaCy model in each worker."""
    global _nlp
    import spacy
    _nlp = spacy.load("xx_ent_wiki_sm")

def extract_batch(texts_with_ids):
    """Extract entities from a batch using multilingual spaCy."""
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
            result = {
                cat: [{"name": n} for n in sorted(names)]
                for cat, names in entities.items()
            }
            results.append((para_id, doc_id, result))
        except Exception as e:
            results.append((para_id, doc_id, {"_error": str(e)}))
    return results

# ─── Database operations ─────────────────────────────────────────────────────

def get_non_english_paragraphs(db_path, language=None):
    """Get paragraphs with non-English content."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Get by language tag first
    if language:
        query = """
            SELECT c.id, c.doc_id, c.text FROM content c
            WHERE c.deleted_at IS NULL AND LENGTH(c.text) > 20
            AND c.language = ?
            ORDER BY c.doc_id, c.paragraph_index
        """
        rows = conn.execute(query, [language]).fetchall()
    else:
        # Get all tagged non-English + detect untagged
        query = """
            SELECT c.id, c.doc_id, c.text FROM content c
            WHERE c.deleted_at IS NULL AND LENGTH(c.text) > 20
            AND LENGTH(c.text) <= ?
            AND (c.language IN ('he', 'ar', 'fa')
                 OR c.language IS NULL OR c.language = '')
            ORDER BY c.doc_id, c.paragraph_index
        """
        rows = conn.execute(query, [MAX_PARAGRAPH_CHARS]).fetchall()

    conn.close()

    paragraphs = []
    for r in rows:
        text = r["text"]
        lang = language or detect_non_english(text)
        if lang:
            paragraphs.append((r["id"], r["doc_id"], text))

    return paragraphs

def merge_results(db_path, results):
    """Merge multilingual NER results into content_objects."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")

    updated = 0
    inserted = 0

    for para_id, doc_id, entities in results:
        if "_error" in entities:
            continue
        if not any(entities.values()):
            continue

        # Check existing
        row = conn.execute(
            """SELECT people_json, places_json, documents_json, events_json, concepts_json,
                      object_pipeline_version
               FROM content_objects WHERE content_id = ?
               ORDER BY created_at DESC LIMIT 1""",
            [para_id]
        ).fetchone()

        if row:
            merged = {}
            for i, cat in enumerate(["people", "places", "documents", "events", "concepts"]):
                existing = set()
                try:
                    for ent in json.loads(row[i] or "[]"):
                        if isinstance(ent, dict) and "name" in ent:
                            existing.add(ent["name"])
                except (json.JSONDecodeError, TypeError):
                    pass
                for ent in entities.get(cat, []):
                    existing.add(ent["name"])
                merged[cat] = sorted(existing)

            rendered = ", ".join(
                name
                for cat in ["people", "places", "concepts", "events", "documents"]
                for name in merged.get(cat, [])
            )

            version = row[5] or "v1-ner"
            if "+ml" not in version:
                version += "+ml"

            conn.execute("""
                UPDATE content_objects SET
                    people_json = ?, places_json = ?, documents_json = ?,
                    events_json = ?, concepts_json = ?, rendered = ?,
                    object_pipeline_version = ?
                WHERE content_id = ?
            """, [
                json.dumps([{"name": n} for n in merged["people"]]),
                json.dumps([{"name": n} for n in merged["places"]]),
                json.dumps([{"name": n} for n in merged["documents"]]),
                json.dumps([{"name": n} for n in merged["events"]]),
                json.dumps([{"name": n} for n in merged["concepts"]]),
                rendered, version, para_id
            ])
            updated += 1
        else:
            rendered = ", ".join(
                ent["name"]
                for cat in ["people", "places", "concepts", "events", "documents"]
                for ent in entities.get(cat, [])
            )
            conn.execute("""
                INSERT OR IGNORE INTO content_objects
                    (content_id, doc_id, people_json, places_json, documents_json,
                     events_json, concepts_json, relations_json, rendered, object_pipeline_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, 'v1-ml')
            """, [
                para_id, doc_id,
                json.dumps(entities.get("people", [])),
                json.dumps(entities.get("places", [])),
                json.dumps(entities.get("documents", [])),
                json.dumps(entities.get("events", [])),
                json.dumps(entities.get("concepts", [])),
                rendered
            ])
            inserted += 1

    conn.commit()
    conn.close()
    return updated, inserted

# ─── Main ────────────────────────────────────────────────────────────────────

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def main():
    parser = argparse.ArgumentParser(description="Multilingual NER Entity Extraction")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=max(1, cpu_count() - 4))
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--language", choices=["he", "ar", "fa"])
    args = parser.parse_args()

    print("=== Multilingual NER Entity Extraction ===")
    print(f"Workers: {args.workers}, Batch size: {args.batch_size}")
    if args.language:
        print(f"Language filter: {args.language}")
    print()

    paragraphs = get_non_english_paragraphs(str(DB_PATH), language=args.language)
    print(f"Non-English paragraphs found: {len(paragraphs):,}")

    if args.dry_run or len(paragraphs) == 0:
        if len(paragraphs) == 0:
            print("No non-English paragraphs found.")
        return

    stats = {
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stage": "multilingual-ner",
        "processed": 0,
        "total": len(paragraphs),
        "entities_found": 0,
        "errors": 0,
        "rate": 0,
        "percent": 0,
    }
    STATE_FILE.parent.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(stats, indent=2))

    start_time = time.time()
    batches = list(chunk_list(paragraphs, args.batch_size))
    print(f"Batches: {len(batches)}\n")

    all_results = []
    with Pool(args.workers, initializer=init_worker) as pool:
        for i, batch_results in enumerate(pool.imap(extract_batch, batches)):
            all_results.extend(batch_results)
            stats["processed"] += len(batch_results)

            entities_in_batch = sum(
                sum(len(v) for v in ents.values()) if "_error" not in ents else 0
                for _, _, ents in batch_results
            )
            stats["entities_found"] += entities_in_batch

            elapsed = time.time() - start_time
            stats["rate"] = int(stats["processed"] / (elapsed / 60)) if elapsed > 0 else 0
            stats["percent"] = round((stats["processed"] / stats["total"]) * 100, 1)

            print(f"  Batch {i+1}/{len(batches)}: {stats['processed']:,} / {stats['total']:,} ({stats['percent']}%) ~{stats['rate']:,}/min")
            STATE_FILE.write_text(json.dumps(stats, indent=2))

    extract_time = time.time() - start_time
    print(f"\nExtraction done: {stats['entities_found']:,} entities in {extract_time:.1f}s")

    # Store
    stats["stage"] = "storing"
    STATE_FILE.write_text(json.dumps(stats, indent=2))
    print("Merging results...")

    total_updated = 0
    total_inserted = 0
    for chunk in chunk_list(all_results, 5000):
        u, i = merge_results(str(DB_PATH), chunk)
        total_updated += u
        total_inserted += i

    total_time = time.time() - start_time
    stats["stage"] = "complete"
    stats["percent"] = 100
    STATE_FILE.write_text(json.dumps(stats, indent=2))

    print(f"\n=== Summary ===")
    print(f"Paragraphs:  {len(paragraphs):,}")
    print(f"Entities:    {stats['entities_found']:,}")
    print(f"Updated:     {total_updated:,} (merged)")
    print(f"Inserted:    {total_inserted:,} (new)")
    print(f"Time:        {total_time:.1f}s ({total_time/60:.1f}min)")

if __name__ == "__main__":
    main()
