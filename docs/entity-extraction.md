# Entity Extraction — Method & Reusable Pattern

How SifterSearch builds a clean entity graph across the corpus: the why, the pitfalls we hit, and the
two-pass + research method that now works. Meant to be a **reusable, improvable pattern**. Long-form vision:
[divine-entity-seed.md](divine-entity-seed.md). Methodology of record: `.claude/skills/entity-research/SKILL.md`.

## The problem
LLMs find *mentions* easily but fail at *identity* — recognizing that two mentions are the same person. Left
to extract alone, they shatter each figure into a fog of phrases ("his companions", "the believers", "that
little band"), and the graph fragments before it can hold its shape. The fix is a **seed** of canonical
entities to resolve against, plus a disciplined way to bind every later reference to it.

## Why we start with GPB
*God Passes By* (Shoghi Effendi, 1944) is not secondary literature — it is authoritative interpretation, written
from a doctrinal station now permanently closed. It names every key figure, work, doctrine, episode, and
prophetic bridge with canonical consistency, and it signals each one's *significance*. So it is a pre-built
authority spine: small, correct, hand-verifiable — exactly the seed the graph needs. We seed from GPB
(`docs.id=21310`), then resolve every later book against it. **Order is doctrine: GPB first; The Dawn-Breakers
and all later works resolve against the verified seed — never re-seed a later book first.**
Current seed: ~563 persons, 575 places, 123 works, 106 groups (the spine; later books add detail beneath it).

## The one rule
**Resolve identity by reading and reasoning — never by keyword/name matching.** Whether a reference points to
a person, and whether two references are the same person, is a comprehension task. Triangulate on the
**conjunction of attributes** (name, nisba/origin, role, kinship, deeds, period): when they uniquely determine
one person it's a *certain* identification **even if the surface name differs entirely** ("the siyyid of Qum
who deserted the fort" = Mírzá Ḥusayn-i-Mutavallíy-i-Qumí — no shared letters, one match). Flag "ambiguous"
only when the same attributes genuinely fit more than one person.

## Pitfalls we hit (each is now a fix)
- **Keyword/name matching fails in both directions** — it *drops* references it can't see (epithets, titles,
  roles, pronouns) and *wrongly merges* namesakes. → Resolve by reading; triangulate.
- **Shallow summaries** from 400-char snippets or web labels mislabel figures (a Grand Vizier who *freed*
  Bahá'u'lláh summarized as "enemy"). → Ground every summary in the **dossier** (the entity's full cross-corpus
  mention text).
- **Fan-out scoring drifts** — N independent agents score importance inconsistently. → Follow with a
  **single-judge calibration** over the top tier; sweep rubric-anchored *categories* (e.g. the Letters of the
  Living = 70–89) as a group.
- **Coreference is book-spanning** — the antecedent of "the deserter" sits chapters back. → Read sequentially
  carrying a running cast; unify identity globally in reconciliation.
- **DeepSeek `v4-pro`/`v4-flash` are reasoning models** that spend the whole token budget on hidden reasoning
  and return empty JSON. → Use model name **`deepseek-chat`** (non-thinking).
- **Dense roster paragraphs overflow** the output budget → truncated JSON. → Shrink the window (20→8→4→2);
  **salvage** complete objects from partial JSON; loop a **gap-fill** until coverage is 100%.
- **No fetch timeout** → requests hang forever under concurrency, stalling silently. → AbortController + retry.
- **Reconciler name-queries miss** diacritic/apostrophe forms of major figures → they look "new". →
  normalized-name **recovery** pass before queueing anything as new.

## The method: two passes + a research pass
**DeepSeek reads (bulk, cheap); Claude reconciles + verifies (judgment).** Each engine to its strength.

1. **READ** (`scripts/entity-read/seq-read.mjs`, DeepSeek `deepseek-chat`). Read the book paragraph-by-paragraph
   in reading order, in overlapping windows carrying a bounded running cast. Capture **every** reference —
   name/title/epithet/role/kinship/pronoun — with its text span. (`find-gaps`/`fill-gaps` close any window
   that overflowed, to 0 gaps.)
2. **RECONCILE** (`aggregate.mjs` → Claude region-reconcilers → `apply-seqread.mjs`). Group windows into
   regions; per region bind each label to a seed/DB entity **by triangulation**. Cross-region identity unifies
   *through* shared entity ids (two regions binding to the same id = the same person). Apply links **reversibly**
   (`extractor_version='seqread-v1'`), additive only; **never auto-create entities or auto-merge** — queue new
   people, ambiguities, and duplicate-merge candidates for human review.
3. **RESEARCH / enrich** (per entity). Pull the dossier (all mentions) → write a faithful summary (who + true
   role; martyrdom stated with when/where), set the **most-used** name as canonical (full form → alias), and
   score importance against the rubric; then run the single-judge calibration.

## The reusable pattern (and where to improve it)
For any new book or corpus:
1. Make sure the **seed it depends on is correct first** (errors compound downstream).
2. **Read sequentially** → capture every reference (reading, not matching).
3. **Reconcile by triangulation** against the seed → bind, or queue as new/ambiguous.
4. **Apply reversibly**; route the judgment calls to human review.
5. **Enrich from the dossier**; calibrate scores as a group.

Open improvement points: candidate generation that itself avoids keyword (so epithet-only paras still surface
candidates); a **semantic / coreference entity index** (today's index is name-only); auto-recompute
`mention_count` after bulk changes; cross-book identity bridges (same person across GPB / Dawn-Breakers /
Memorials under different names).

## Tooling & operations
- Read pipeline: `scripts/entity-read/{seq-read,find-gaps,fill-gaps,aggregate,apply-seqread}.mjs`.
- Seed / enrich / dedup / split: `scripts/one-off/entity-seed/`.
- Inspect: `/admin/entities` (per-type tabs, per-chapter sections, `[GPB]` badges, importance-sorted).
- **Single-writer**: run write scripts with `SIFTER_WRITER_URL=http://127.0.0.1:7849` (content DB) or hit
  `SQLITE_BUSY`; the `graph.db` sidecar is written direct. Back up `graph.db` before an apply.
- **Reverse a read**: `DELETE FROM entity_mentions WHERE extractor_version='seqread-v1'`.

## Status (2026-06)
Seed (GPB) review-ready. The Dawn-Breakers read end-to-end: 1,900/1,900 paragraphs, 20,504 references, 943
reversible links applied; new persons + duplicate-merges queued in `tmp/entity-research/seqread/FINDINGS.md`.
Pending: work the review queue; build the semantic/coreference index.

---

*— SifterSearch entity extraction project. A living pattern; refine it as each book teaches us more.*
