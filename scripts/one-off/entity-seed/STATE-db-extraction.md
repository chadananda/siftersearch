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
- [done] export-roster.mjs + merge-db.mjs + GATHER-INSTRUCTIONS.md written, roster exported (1368)
- [done] CHECKPOINT PASSED: pilot 0-65 merged (55 resolved/23 new), 66-155 merged (74 resolved/62 new).
        Entity count 1368->1391 after file1 = exactly +23, NO transliteration dups. Resolution works.
- [in flight] 16 fan-out gather agents over idx 156-2081. MERGED (14 of 18 incl pilots): 0-65, 66-155,
        156-275, 276-395, 396-515, 636-755, 756-875, 876-995, 1116-1235, 1356-1475, 1476-1595, 1716-1835.
        Entity count 1368 -> 2062 (+694 so far; martyrology chunks 756-875/876-995 added ~240 bare-name martyrs).
        STILL PENDING merge (agents running): 516-635, 996-1115, 1236-1355, 1596-1715, 1836-1955, 1956-2081.
        Run the serial merge loop again as they land:
          for f in tmp/entity-research/db-gather-*.json; do [ -f "$f.merged" ] && continue; node scripts/one-off/entity-seed/merge-db.mjs "$f"; done

## Adjudication flags raised by gather agents (resolve in final dedup pass)
- Ḥájí Mírzá Karím Ḵhán «son of Ibráhím Ḵhán-i-Qájár-i-Kirmání» == seed Ḥájí Muḥammad-Karím Khán-i-Kirmání (FOLD)
- Mullá ‘Abdu’l-Ḵháliq (1454) — agent left NEW; seed has ‘Abdu’l-Kháliq-i-Iṣfahání (check same?)
- Mullá Báqir «brother of Mullá Mihdíy-i-Kandí» (937) vs seed Mullá Báqir-i-Tabrízí (LotL) — check
- "Muḥammad Muṣṭafá (historian)" == seed Shaykh Muḥammad Muṣṭafá al-Baghdádí (FOLD, agent noted)
- Mírzá Muḥammad-‘Alí «LotL, Ṭáhirih's brother-in-law» — NEW, distinct from seed covenant-breaker M-‘Alí — keep
- Sulaymán Ḵhán-i-Afshár (Qájár officer) — kept NEW, distinct from seed martyr Ḥájí Sulaymán Khán-i-Tabrízí — keep
- Several bare given-name namesakes intentionally kept separate by village/context — DO NOT auto-merge on bare name
- [ ] FINAL CONSOLIDATION after all 18 merged:
        1. gloss-strip: pilot files (0-65, 66-155) baked parenthetical glosses + comma-epithets into
           canonical_name (e.g. "Zarand (birthplace of Nabíl)", "Siyyid Muḥammad-Riḍá (father of the Báb)",
           "Manṣúr, the ‘Abbáside Ḵhalífih"). Strip "(...)" parentheticals from DB-created canonicals.
        2. dedup/adjudication: new DB entities vs seed + vs each other. KNOWN dup to fold:
           "Ḥájí Mírzá Karím Ḵhán, son of Ibráhím Ḵhán-i-Qájár-i-Kirmání" == seed "Ḥájí Muḥammad-Karím
           Khán-i-Kirmání" (agent flagged it deliberately). Use AI adjudication like GPB (commentary≠source,
           namesake≠dup, context-only for identical-attribute namesakes).
        3. verify review page: [DB +N] button + per-entity DB badge populate; filter by DB.
        4. bump version, commit, deploy entity-review if changed; report to user by morning.

## Key facts / cautions
- DB content verified complete: 2082 paras, 0 deleted, Sang-Sar martyrs present (7).
- Single-writer: route via SIFTER_WRITER_URL; merges SERIAL only.
- Agent fleet: write LOCAL file (no "/tmp/" in path — Write hook blocks it), cat | ssh > ~/sifter/siftersearch/tmp/entity-research/X.json, confirm REMOTE_COUNT.
- merge-db tags excerpts DB:. Review page shows [DB +N] once mentions land.
- Deploy of scripts: git push -> server git pull. Run from ~/sifter/siftersearch.

## Next priority
Export roster, gather+merge chunk 0-49, REVIEW resolution quality (did known names fold onto
seed entities? are new ones genuinely new?), then proceed through full book.
