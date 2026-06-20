# Building Entities from Seed — Best Practices

> **Living playbook.** The *why* is in [divine-entity-seed.md](divine-entity-seed.md); the current seed itself
> is documented in [gpb-seed.md](gpb-seed.md); this is the *how* —
> concrete practices proven in production, appended as we discover them. Methodology reference:
> `.claude/skills/entity-research/SKILL.md`. Tooling: `scripts/entity-read/` (sequential read pipeline) and
> `scripts/one-off/entity-seed/` (seed/enrich/dedup tools).
>
> Status: the sequential-read pipeline (§3–§5) was built and run end-to-end on **The Dawn-Breakers**
> (doc 21308) on 2026-06-19 — 1,900/1,900 paragraphs, 20,504 references captured, 943 reversible links applied.

---

## 0. The one rule that governs everything

**Resolve identity by reading and reasoning — NEVER by keyword/name matching.** Deciding *who a mention
refers to*, and *whether two mentions are the same person*, is a comprehension task. Surface/alias matching
fails in both directions at once:

- it **drops** references the name-search can't see — epithets, titles, roles, kinship, pronouns
  ("the Siyyid-i-Qumí, who had deserted the fort" carries no "Mutavallí" token), and
- it **wrongly merges** namesakes (two different Muḥammad-Báqirs, the Letter-of-the-Living Qazvíní vs. the
  Covenant-breaker of the same name).

Both are the same disease: *matching strings where the task is resolving people.* Every practice below serves
this rule.

**Triangulation is identification, not guessing.** A reference is fixed by the **conjunction of its
attributes** — name, nisba/origin, role, kinship, deeds, period. When the attributes uniquely determine one
person, the identification is **certain even if the surface name differs entirely** ("the siyyid of Qum who
deserted the fort" = Mírzá Ḥusayn-i-Mutavallíy-i-Qumí — zero shared letters, but only one person fits). Flag
"ambiguous" **only** when the same attributes genuinely fit more than one person.

---

## 1. The pipeline, end to end

1. **Seed** the canonical entities from God Passes By (the authoritative spine).
2. For each later book, **resolve against the seed** — never cold-gather (it spawns transliteration dups).
3. Per book: **sequential coreference read** (§3) → **triangulation reconcile** (§4) → **apply** (§5) →
   **enrich** (§6) → **calibrate** (§6).
4. **Get each book's characters right before the next attaches.** Errors compound downstream.

Per-step user approval for entity creation/merge/split — never mass-mutate the foundation autonomously.

---

## 2. Seeding & resolve-against-seed

- Build the seed **by periods**, in authority order: GPB first (the seed of authority), then The Dawn-Breakers
  resolved against it, then later works.
- **Canonical name = the name MOST COMMONLY USED**, not the longest honorific+nisba (Shoghi Effendi's simple
  titles — Quddús, Ṭáhirih, the Báb — are learnable/memorable; the full nisba form goes in `aliases`).
- Export a compact roster (canonical + aliases) so gather agents reuse EXACT seed canonical names; known
  entities attach mentions (`is_new:false`, empty excerpts) rather than spawning duplicates.
- Resolution order per candidate: exact canonical → normalized alias (transliteration-folded) → else create.

---

## 3. Sequential coreference read (the core ingest)

The validated way to capture **every** reference in a book. Two engines, each to its strength:

- **DeepSeek reads** (bulk, cheap, large context): `scripts/entity-read/seq-read.mjs` reads the document
  paragraph-by-paragraph in reading order (`content.paragraph_index`), in overlapping **windows**, carrying a
  **bounded running cast** (last K windows) so a reference resolves against people established earlier.
  Captures every person-reference — name/title/epithet/role/kinship/**pronoun** — with the text span.
- **Claude reconciles** (judgment): see §4.

### Model choice (hard-won)
- DeepSeek's real model names are `deepseek-v4-pro` and `deepseek-v4-flash` — **both are reasoning models**
  that burn the whole `max_tokens` on hidden `reasoning_content` and return an **empty** `content`. **Use the
  model name `deepseek-chat`** (= v4-flash in *non-thinking* mode): clean JSON, `finish_reason:"stop"`.
- Cheap (~$0.27 / $1.10 per Mtok) — reading a whole book is single dollars. No reason to ration to a local model.

### Robustness (the reader must never silently lose a paragraph)
- **Hard fetch timeout** (AbortController, ~150s) → abort + retry. Without it, a throttled request hangs
  forever under concurrency and stalls the whole run with no error.
- **Salvage on parse failure**: mention/cast objects are flat (no nested braces), so regex-extract complete
  `{...}` objects even from truncated/slightly-malformed JSON. A bad window still contributes, never a total gap.
- **Dense paragraphs overflow even 32k output** (martyr-rosters listing 50 names). Use smaller windows for
  them: start at window=20, drop to 8 → 4 → 2 for stubborn dense ranges. Each request stays fast and fits.
- **Gap-fill loop**: `find-gaps.mjs` computes paragraph_index coverage vs. the full doc; `fill-gaps.mjs`
  re-reads gaps at a smaller window with bounded concurrency. Repeat until **0 gaps**.
- Run detached (`nohup`) on the server; the reader is **resumable** (skips cached window files).

### Concurrency
- Reads can run as parallel partitions, but bound the cast per window (global identity is the reconciler's
  job, not the reader's — don't let the carried cast grow to thousands of entries and blow the context).

---

## 4. Reconciliation by triangulation (Claude)

- `aggregate.mjs` flattens all window mentions into `all-mentions.json` and groups windows into **regions**
  (~12 windows each), writing each region's distinct labels (merged label+description+aliases).
- One **Claude region-reconciler** per region binds each label to a DB entity by the triangulation discipline
  in §0, writing `region-NN-map.json` (`{label, surfaces, entity_id, canonical_name, confidence, new, triangulation}`).
- **Cross-window / cross-region identity unifies *through* the shared DB entity id** — if region A and region B
  both bind to entity 1249227, that's automatically the same person. No global merge pass needed for bound
  entities; only genuinely-new people need cross-region dedup (→ review queue).
- The reconciler also **discovers DB duplicates** as a byproduct (e.g. a phantom entity created from an epithet
  — "the Siyyid-i-Qumí" as its own row — is the same man as the named betrayer).
- Reconcilers query the DB themselves by name AND attribute; they do not need the full roster in context.

---

## 5. Applying (safely)

- `apply-seqread.mjs` resolves every mention through the region maps to a DB entity id and **attaches
  `entity_mentions`** for certain/probable binds to **existing** entities.
- **Reversibility is mandatory**: tag every applied row `extractor_version='seqread-v1'`. The entire pass
  reverses with `DELETE FROM entity_mentions WHERE extractor_version='seqread-v1'`.
- **Back up first**: `cp data/graph.db /tank/backups/siftersearch/graph-pre-seqread-<ts>.db`.
- **Additive only**: insert links that don't already exist (dedup by `entity_id|content_id`). Do **not**
  delete/replace existing mentions.
- **Do NOT auto-create new entities or auto-merge duplicates** in an unattended run. Write them to a review
  queue (`review-queue.json` / `FINDINGS.md`) for per-item human approval.
- **Query-miss recovery**: a "new" label whose name uniquely matches an existing entity (after normalization)
  is re-bound, not queued — catches majors the reconciler's name-query missed on a diacritic/apostrophe form.

---

## 6. Enrichment & importance calibration

- **Summary** (2–4 sentences): who the person was AND their true role, faithful and precise about who-did-what;
  nuance over label (never flatten a sympathetic figure to "enemy"). **If they died a martyr, say so with
  when/where** — it honors the fact and firewalls them from later same-named figures.
- **Ground summaries in the dossier** (`/api/graph/entity/:id/dossier` — all cross-corpus mention text), not
  in 400-char snippets or web labels. Shallow inputs produce shallow, often-wrong summaries.
- **Importance 1–100** by AI judgment against the rubric, NOT a formula: 90–100 Manifestations/central figures;
  70–89 Letters of the Living, foremost heroes, Holy Family, era-driving sovereigns/Grand Viziers; 45–69
  prominent taught figures/Hands/secondary antagonists; 20–44 episode participants; 1–19 incidentals.
- **Fan-out scoring drifts.** N independent agents will not score consistently. Always follow a fan-out
  enrichment with a **single-judge calibration pass** over the top tier (whole list in view) to reconcile.
- **Sweep rubric-anchored *categories* as a group** post-calibration. The Letters of the Living are a defined
  foundational set the rubric puts at 70–89; a fan-out left most at 18–62 until swept as a group. Identify the
  category from the corpus enumeration, not a summary keyword (which false-positives).

---

## 7. Disambiguation doctrine

- **Namesake firewalls**: keep distinct people with shared names apart by context — nisba, side
  (Bábí vs. Bahá'í by final allegiance), timeframe/period, kinship, deeds. Never drop a shared name to dodge a
  collision; resolve it.
- **Period-pinning**: a martyr who fell in 1849 at Ṭabarsí cannot be a same-named figure active in 1890. Use
  the death-fact / episode date as a discriminator.
- **Split conflations carefully**: when one entity blends two people, keep the dominant identity on the
  original id and peel the second into a new entity (move its mentions + relations); don't use a crude
  delete-and-recreate. Before creating, check whether the peeled identity already exists (avoid duplicating).
- **A sub-agent's "conflation"/"duplicate" flag is a LEAD, not a verdict** — read the actual mentions before
  splitting or merging; over half of flagged conflations were over-flagged on inspection.
- **Transliteration ≠ alias**: the underlying Arabic-script spelling is the true match key; romanization
  variants (Sadiq/Sadeq) are the same name, not aliases. Macron-below artifacts (S̱h, ḵh) are bad encodings of
  "sh"/"kh" — normalize, don't treat as distinct.

---

## 8. Tooling & infrastructure gotchas

- **Single-writer routing**: `sifter.db` (content + `graph_entities`) writes MUST route through the worker —
  run scripts with `SIFTER_WRITER_URL=http://127.0.0.1:7849`, or they hit `SQLITE_BUSY`. The `graph.db`
  sidecar (`entity_mentions`, `entity_aliases`) is written direct (`graphQuery`) and relies on busy_timeout.
- **`entity_mentions.content_id` is TEXT** — store/compare as string; queries joining to `content.id` need
  `CAST(content_id AS INTEGER)`.
- **`mention_count` on `graph_entities` is NOT auto-recomputed** by merge/split scripts — refresh it after
  bulk mention changes, or the entity-search endpoint and review page show stale counts.
- **`pgrep -f seq-read.mjs` matches your own SSH command line** (it contains the string) — kill node procs by
  `for p in $(pgrep -f entity-read); do [ "$(ps -o comm= -p $p)" = node ] && kill -9 $p; done`.
- **Combining a local `git` command and an `ssh` command in one shell call can swallow the SSH output** — run
  server commands in their own call.
- **Research is API/Meili-first, not raw SQL.** Use the dossier/search endpoints for *reading*; reserve direct
  SQL for *write-surgery*. Don't carry the SQL habit into research questions.
- **Known gap (parked)**: the entity index `entity_mentions_idx` is searchable only on `entity_canonical_name`
  (name-only) — conceptual queries return nothing. Semantic/coreference entity search is future work.

---

## 9. Where the artifacts live

- Pipeline scripts: `scripts/entity-read/{seq-read,find-gaps,fill-gaps,aggregate,apply-seqread}.mjs`
- Seed/enrich/dedup tools: `scripts/one-off/entity-seed/` (export-roster, merge-db, merge-enrich, merge-dedup,
  split-conflations, fix-letters-of-living, …)
- Per-run working data + review queue: `~/sifter/siftersearch/tmp/entity-research/seqread/` on tower-nas
  (window files, region maps, `all-mentions.json`, `review-queue.json`, `FINDINGS.md`)
- Methodology of record: `.claude/skills/entity-research/SKILL.md`

---

*— SifterSearch entity extraction project. Append practices here as they prove out.*
