# Dawn-Breakers Entity Extraction State
last_update: 2026-06-18
status: IN_PROGRESS
project_dir: /Users/chad/Dropbox/Public/JS/Projects/siftersearch.com

## Goal
Extract entities from The Dawn-Breakers (doc_id 21308, 2082 paragraphs, idx 0-2081),
RESOLVING each against the GPB seed (1,368 entities). Lighter than GPB: existing seed
entities get the DB mention recorded (drives [DB +N] count + badge) but NO excerpt
pile-on; only genuinely NEW DB-only entities get descriptions. People are the priority.
User out for the night — get it mostly done by morning. Checkpoint after first few chunks.

## Method
1. export-roster.mjs -> tmp/entity-research/seed-roster.txt (gather agents resolve against it)
2. Gather agents over ~50-para chunks (idx ranges), schema:
   {canonical_name, entity_type, side, is_new, db_statements:[verbatim, only if new/no-GPB], mention_idxs:[]}
   - is_new=false + EXACT seed canonical_name + empty db_statements for known entities (mention only)
   - is_new=true + fullest canonical (honorifics+nisba) + 1-2 short statements for new entities
3. merge-db.mjs <file> — resolve (canonical -> alias index -> new), tag DB:, record mentions, .merged guard
4. Merges run SERIALLY (never concurrent — single-writer port 7849 deadlock risk)

## Chunks (idx ranges, ~50 paras): 0-2081 total, ~42 chunks. Track completion below.

## Progress
- [done] export-roster.mjs + merge-db.mjs written
- [ ] roster exported on server
- [ ] chunk 0 (0-49) gathered + merged + REVIEWED (first checkpoint)
- [ ] remaining chunks

## Key facts / cautions
- DB content verified complete: 2082 paras, 0 deleted, Sang-Sar martyrs present (7).
- Single-writer: route via SIFTER_WRITER_URL; merges SERIAL only.
- Agent fleet: write LOCAL file (no "/tmp/" in path — Write hook blocks it), cat | ssh > ~/sifter/siftersearch/tmp/entity-research/X.json, confirm REMOTE_COUNT.
- merge-db tags excerpts DB:. Review page shows [DB +N] once mentions land.
- Deploy of scripts: git push -> server git pull. Run from ~/sifter/siftersearch.

## Next priority
Export roster, gather+merge chunk 0-49, REVIEW resolution quality (did known names fold onto
seed entities? are new ones genuinely new?), then proceed through full book.
