# OVERNIGHT AUTONOMOUS RUN — mandate set by user 2026-06-18 (review "tomorrow morning")
Sequence (do in order; NO paid API — subscription/Claude Code + subagents only; two-books extraction only):
 0. MIGRATION (in progress, task b54yk7igu): move sifter.db+graph.db to ZFS recordsize=16K dataset (fast/siftersearch-db) + synchronous=NORMAL (db.js committed 2.117.0). /tank backup gated. Writer is FAST now (A400 detached) → normal HTTP write path works, no worker-stop workaround needed.
 1. STEP 2 — finish import: extract the remaining ~672 graph_enriched=0 paragraphs in GPB(21310)+DB(21308) = 654 footnotes (idx 1424-2081; many trivial→mark enriched no-entity; substantive→resolve mentions to existing roster + propose new) + ~18 substantial narrative paras (Mullá Ḥusayn entry, Báb panegyric). Use a general decisions-executor + subagent fleet. Skip NOTHING (mark all enriched).
 2. STEP 3 — deep research pass on EVERY person (~1160) AND EVERY tablet/work (~337): research cross-corpus, then MERGE (dedup same-person/same-work duplicates via AI same-work/same-person adjudication — NEVER keyword-merge), JOIN (aliases, kinship relations, duplicate_of), GATHER (consolidate cross-corpus info into each entity description). Extends the ~58 verify/*.md clusters to the full roster. Prioritize: major figures + martyr-roll new entities + works first.
 3. STEP 4 — REVIEW DOCUMENT (the morning deliverable): a page that LIVE-BUILDS from the DB (re-queries graph_entities + entity_mentions→content→chapter + descriptions). Spec: tab per entity_type; within each, section per Dawn-Breakers chapter listing entities FIRST INTRODUCED there (earliest mention, no repetition); each entity = collapsible record (description, aliases, role/dates/side/kinship, citations). Implementation: Astro admin route or generated page served from the API. MUST be built+populated by morning even if Step 3 is partial (it reflects live DB state).
PRIORITY if time-constrained: ensure Step 4 page EXISTS + works (morning review) > Step 3 completeness > Step 2 completeness. Update this file + worker-status.json each lurch.

# Dawn-Breakers Entity Roadmap (post-purge) — set by user 2026-06-17

Strategy: research-driven, on subscription (me + agents) first; deepseek-v4-flash + high-context-cache later. Entity DB scoped to the TWO books only (GPB 21310 + Dawn-Breakers 21308). Voting pipeline PARKED. Decisions spec: DECISIONS-RESOLVED.md.

## Step 1 — PURGE to the two books  [DONE 2026-06-17]
Two passes: (a) purge-out-of-scope-entities.mjs scoped the graph.db SIDECAR entity_mentions to two-books content; (b) rebuild-entity-graph.mjs --apply (direct better-sqlite3, FK off, sole-writer with pipeline+worker parked) rebuilt the whole entity graph in sifter.db. Backups: /tank/backups/siftersearch/entity-purge-* + entity-rebuild-20260617T160637Z (full sifter.db + graph.db pre-delete).
FINAL counts (verified): graph_entities 633,775 → **4,351**; graph_relations 2,898,878 → **28,797**; entity_mentions(sifter dup) 120,874 → 8,857 (two-books CONTENT only); quote_instances 6,409 → 1,072; paragraph_roles 12,854 → 862; entity_aliases 17,407 → 6,635. Content + docs untouched.
NOTE: VACUUM was interrupted (stalled on API read-locks) — harmless: deletes are committed and SQLite reuses freed pages, so the file stays ~28G but the bloat won't regrow. Can VACUUM later in a maintenance window (stop API reads briefly). Writer (siftersearch-worker) back online; pipeline stays parked.

## Step 2 — extract missing newly-imported DB content
The DB import added ~871 paragraphs (footnotes + the martyr-roll LISTS: Sang-Sar 18, Mázindarán 27, Shah-Mírzád 2, Savád-Kúh 5) that have NO entities (graph_enriched=0; the old extraction predated the import). EXTRACT entities from those — **research-driven / scoped to DB only** (NOT the voting pipeline). Find DB paragraphs with graph_enriched=0 (or no entity_mentions), run scoped extraction (agents on subscription), CREATE the entities. Footnotes + lists are the priority (the martyr families: Siyyid Aḥmad + brother Mír Abu'l-Qásim + uncle Mír Mihdí + brother-in-law Mír Ibráhím, etc.).

## Step 3 — research EVERY person + tablet in Dawn-Breakers
Resume the REVIEW-LEDGER march, now scoped to DB. Every PERSON and every WORK/TABLET mentioned in Dawn-Breakers gets a deep, verified record (cross-corpus: GPB attributes + Momen/Balyuzi/Taherzadeh + web, per the entity-research SKILL). The ~58 clusters already done (verify/*.md) cover the major figures; complete the long tail + the newly-extracted martyr-roll figures.

## Step 4 — build the "Dawn-Breakers Entities" review page  [FINAL deliverable]
A dynamic page for MANUAL REVIEW. Spec:
- **A tab per entity_type** (person, work/tablet, place, event, concept, organization…).
- **Within each tab: a section per Dawn-Breakers chapter**, listing entities **FIRST INTRODUCED in that chapter** — each entity appears ONCE (in its first-introduction chapter), NO repetition across chapters.
- Each entity = a **collapsible record** of everything we know (the research DESCRIBE + aliases + role-arc + dates + side + kinship + firewalls + citations).
- Data sources: graph_entities (DB-scoped) + entity_mentions→content→chapter (for first-introduction) + the verify/*.md research records.
- "First introduced in chapter X" = the chapter of the entity's earliest mention (min paragraph_index / external_para_id) in doc 21308.
- Implementation TBD when we get there (Astro route / admin page / generated HTML) — confirm with user.

## STEP 2 — IN PROGRESS (subscription = Claude Code, NO paid API; Anthropic disabled)
RULE (user): extract EVERY bit, skip NOTHING. Group short list-items with framing context — don't skip. The daemon's two skip-bugs MUST be fixed: (1) `length(text)>50` filter silently drops short fragments; (2) fail-handler marks `graph_enriched=-1` and abandons after 3 tries. Both = data loss.

FULL unextracted scope in the two books = **812 paragraphs**: 21308 → 794 pending(0) + 13 abandoned(-1); 21310 → 2 pending + 3 abandoned. The 16 `-1` are SUBSTANTIAL paras (Mullá Ḥusayn entry p776, the 7169-char Báb panegyric GPB p98, eyewitness quotes) — re-extract, never leave -1.

Executor: `scripts/wip/extract-martyr-rolls.mjs` (createEntity religion='' + description provenance; mentions→graph.db; kinship→graph_relations; graph_enriched via writer). Run with `SIFTER_WRITER_URL=http://127.0.0.1:7849`.

WRITE PATH — ROOT CAUSE FOUND + FIXED 2026-06-17: the writer deadlocks / 13s transactions / 0.4MB/s VACUUM were NOT bloat or recordsize. The `fast` ZFS pool was a MIRROR of the NVMe + a FAILING Kingston A400 SATA SSD (per-device write latency 8–52 SECONDS, 103s async queue). Mirror writes gate to the slow leg → everything crawled. FIX: `sudo zpool detach fast ata-KINGSTON_SA400S37960G_50026B7783EF978B` (NVMe had full copy; no data move). After detach: write latency 10–43ms, 15000-random-update+ckpt test = 7.3s (was hung). Writer/API healthy. NOTE: pool now SINGLE NVMe, NO redundancy — add a 2nd NVMe + `zpool attach` later. VACUUM now optional (fast if wanted; free pages reuse fine). The DIRECT-write worker-stop workaround in extract-martyr-rolls.mjs is NO LONGER NEEDED — normal HTTP writer path works now.

DONE — ALL Dawn-Breakers list-items (140) extracted, pending=0. 138 entities via extract-martyr-rolls.mjs across 11 rolls: Míyámay 31, Sang-Sar 17, Mázindarán 27, Savád-Kúh 5, Ardistán 6, Iṣfahán 24, Ṭabarsí 3, Zanján 5, Qáyin 6, enemy-officers 11, companions-of-Mullá-Ḥusayn 2. Same-name collisions disambiguated by (tag[, para]); kinship in description text (NOT relations — avoids namesake-wrong links; real relations in Step 3). Colophon p88/93/94 processed; "Muḥammad-i-Zarandí"→Nabíl #1220249. extractor_version='cc-subscription-rolls-v1'.

✅ (d) DAEMON skip-bugs FIXED (v2.116.0, committed): MIN_TEXT_LEN default 50→0 (no silent length-skip); EXTRACT_REQUEUE_FAILED=1 lever resets graph_enriched=-1→0 so failures are never permanently abandoned.
✅ (b/c) ALL 16 abandoned `-1` reset to 0 (un-skipped) — now pending, not lost.

REMAINING Step 2 = the NEXT LURCH (672 paras, all graph_enriched=0 now; needs judgment-based entity extraction — subscription/me/subagents, NO API):
 - 21308: 667 pending = 654 FOOTNOTES (idx 1424–2081) + 13 substantial narrative paras (incl. Mullá Ḥusayn martyr entry p776) that had been abandoned.
 - 21310 (GPB): 5 pending (incl. 7169-char Báb panegyric p98).
 METHOD: footnotes — 165 trivial ("Currently unavailable."/bare dates) → mark enriched, no entity; ~489 substantive + the narrative paras → resolve mentions to EXISTING roster (Báb, Bahá'u'lláh, Karbilá, Imám Riḍá, Shaykh Aḥmad, Nabíl, the 138 new martyrs…) + propose genuinely-new. Build a general decisions-executor (resolve-existing + create-new + mention + enrich; DIRECT writes, worker stopped) and feed it via a subagent fleet reading batches. Mark ALL enriched (skip nothing).
Then Step 3 (research march), Step 4 (review page).

OPERATIONAL: updater FROZEN (pm2 stop siftersearch-updater) — restart later + immediately re-park the 4 graph workers (they'll un-park on its reload). graph pipeline still parked. Writer restarted several times (deadlocks); currently online.
