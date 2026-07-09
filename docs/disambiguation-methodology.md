# Paragraph Disambiguation — Methodology & Design of Record

The disambiguation layer is the substrate for entity extraction. It runs **before** any
entity/claim extraction (see the pipeline invariant below) and writes a compact, standalone
"who/where/when" resolution header to `content.context` for every paragraph, so downstream
extraction never reads a naked paragraph.

## Pipeline invariant

**DISAMBIGUATE → EXTRACT → INTEGRATE → SEARCH.** Never extract entities/claims from
un-disambiguated text. Bare-name conflation (fusing distinct people who share a name) and
wrong-scene binding are the *guaranteed* output of extracting against isolated paragraphs.

## What this task is, in the field's terms

Streaming (sentence/paragraph-incremental) **within-document coreference resolution** with an
**externalized entity state**, emitted as a compact **decontextualization** header, feeding a
downstream **cluster-then-link** entity resolution stage. Grounded in seven literatures:

| Discipline | Key work | What we take |
|---|---|---|
| Decontextualization | Choi et al. 2021 (TACL); DnDScore 2024 | Edit taxonomy (name completion, pronoun/NP swap, discourse-marker removal, bridging, global scoping) as the checklist of what a good context resolves. Some spans are **infeasible** → must **abstain**, not guess. |
| Contextual Retrieval | Anthropic 2024 | KV-cache header validated. Ours is **sequential-accumulating** (carries coref state forward), strictly stronger than their per-chunk-independent variant. |
| Incremental coreference | Sentence-Incremental Coref 2023; entity-tracking-as-binding 2025 | LLMs **degrade at long-range entity tracking** when implicit → **externalize** the state. |
| Centering Theory | Grosz/Joshi/Weinstein 1995 | Salience ranking (pronoun>noun, subj>obj, given>new, recent>old) → keep only top-K salient **forward-looking centers** hot; **decay/evict** stale entities. This is the compaction model. |
| Proposition retrieval | Dense X 2023; PropRAG 2024 | Keep disambiguation (enrich) **separate** from propositionalization (extraction). |
| Cross-doc coref + NIL (historical) | Contrastive Entity Coref for Historical Texts 2024; NASTyLinker | Historical corpora are full of out-of-KB people → **NIL/new-entity is first-class**; **cluster-then-link** (local coref, then global bind). |
| Temporal KG | GraphRAG covariates; Graphiti bi-temporal | Stamp each claim with **valid-time** (event time), distinct from narration order — kills period errors. |

1,000-year precedent: classical **ṭabaqāt** biographical dictionaries used the **nisba** to
disambiguate scholars sharing ism+nasab. Name morphology (ism/kunya/nasab/laqab/nisba) is a real parse.

## Resolution doctrine

- **Name nominates, evidence binds.** The surface name generates candidates; the scene's evidence
  (place, period, role, connections) decides the bind. No name-only binding.
- **Honorifics are FEATURES, never stripped.** Titles (Mírzá, Mullá, Siyyid, Ḥájí/Ḥájjí, Karbilá'í,
  Mashhadí, Ustád, Áqá) discriminate when nisbas match or are absent, are sometimes the entire handle
  (Karbilá'í-‘Alí), and **degree-of-ellipsis is a prominence signal** — a bare form resolves by
  **common reference** to the most-prominent bearer (bare "Mírzá Aḥmad" in the Bábí-scribe context =
  Mullá ‘Abdu'l-Karím-i-Qazvíní; one person, two names).
- **Canonical = most-used handle, honorifics intact** — compact when a conventional short handle exists
  (Quddús, Vaḥíd, the Báb), title-bearing when not (Mullá Ḥusayn, Karbilá'í-‘Alí). The longest
  honorific+nisba form and variant names go to the entity's alias store, not the header.
- **Nisbas/places are soft** — village vs province (Ishtihárdí≡Qazvíní), governor-of-province vs its
  city; two people can share a town. Nisba mismatch is *near*-definitive, not absolute.
- **Prominence prior for central figures** — the Báb, Bahá'u'lláh, ‘Abdu'l-Bahá, Quddús use a fixed
  short handle and are not re-justified every mention.
- **Speaker-relative pronouns** — inside quoted/reported speech, I/We/Our refer to the **speaker**,
  not the narrator (Bahá'u'lláh's first-person passages: "We" = Bahá'u'lláh).
- **Valid-time, not narration-time** — PERIOD is when the events occurred; a flashback keeps its own time.
- **Abstain, don't guess** — a reference unresolvable from context is marked `→?`, never forced.

## Compact output format (written to `content.context`)

One header, honorifics kept, only the mentions **present in this paragraph**, place/period inherited
unless the paragraph moves. **The consumer is an AI extractor, not a parser** — so the note is minimal
natural language, not a rigid map, and resolves *only what a careful reader could not work out from the
paragraph alone*. Skip pronouns obvious from the sentence, names already written in full, and generic
phrases ("the Cause"). If only place/era needs stating, that is the whole note. Unresolvable → `?`.

```
@<place>, ~<era> — <only the resolutions actually needed>
```

Example (DB para_536):
```
@Yazd, ~1845 — "Mírzá Aḥmad" = Mírzá Aḥmad-i-Azghandí; "Siyyid Ḥusayn" = Siyyid Ḥusayn-i-Azghandí; "his nephew" = Mírzá Aḥmad-i-Azghandí.
```
And where nothing is elided (DB para_529): `@Yazd, ~1845 — "Mullá Ṣádiq" = Mullá Ṣádiq-i-Khurásání; "Mírzá Aḥmad-i-Azghandí" is already written in full.`

Compaction levers (in priority): (1) resolve only mentions genuinely unclear; (2) store the note, not a
prose gloss — the extractor already has the paragraph text; (3) inherit place/era, restating only on a
move; (4) conventional short handle as canonical. Titles are **never** cut for length, and the format is
NOT regex-cleaned — the model does the judgment, an AI reads the result. (~290 chars/note typical.)

## Generation mechanism — one growing cache per segment

System prompt (instructions + book metadata) is stable across the whole book; the user prompt carries a
**growing** list of prior-paragraph notes this chapter + the running place/era + the one new paragraph.
Successive calls share the entire prior prefix → DeepSeek KV/prefix cache pays only for the new tail. The
running place/era is carried across paragraphs (and seeded fresh per chapter) so identity/scope never drops.

- **GPB/DB fast-path** (`chapter-map.mjs`): parse the source markdown `<h>` TOC into chapter(h1/h2) +
  scene(h3/h4); **chapter = the growing-cache segment**; scene heading = the place/era anchor fed to the
  prompt; the chapter fixes the era (never guess a bare year from a single paragraph). Do **not** assume
  this `<h>` structure for other books — it is verified only for GPB (21310) and DB (21308).
- **General books**: bounded runs (~60 paras, cut at a heading edge) + carried digest (`USE_TOC=0`).

**Concurrency & resilience.** Chapters are independent segments, so they run concurrently (`CONC`, default
5) while each chapter stays strictly sequential internally (the growing cache requires order). Both the AI
call and the write are wrapped in retry-with-backoff; each worker is isolated and an `unhandledRejection`
guard ensures one transient `ECONNRESET` can never abort the run. `RESUME=1` skips paragraphs already
carrying `deepseek-disambig-v1` context, so an interrupted run restarts idempotently.

## Enforcement — extraction is gated on disambiguation

The invariant is enforced in code, not by convention. `scripts/entity-read/_disambig-gate.mjs` exports
`assertDisambiguated(doc)`, called at the top of every extractor (`build-claims-gpb.mjs`,
`build-claims-source.mjs`). It aborts (exit 2) unless ≥99% of the book's main-text paragraphs carry
`context_model='deepseek-disambig-v1'`, printing the exact disambiguation command to run first. Testing
override: `SKIP_DISAMBIG_GATE=1` (never in a real build).

## Running it & reversibility

```bash
# disambiguate a book (writes content.context; GPB/DB auto-use the TOC fast-path)
SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 CONC=5 DOC=21308 node scripts/entity-read/disambiguate-book.mjs
#   add RESUME=1 to continue an interrupted run · DRY (no WRITE) prints notes without writing
# check coverage
node scripts/entity-read/context-coverage.mjs
# only then extract (the gate will refuse otherwise)
SIFTER_WRITER_URL=http://127.0.0.1:7839 WRITE=1 DOC=21308 SRCFRAG=dawn-breakers BATCH=db-v1 node scripts/entity-read/build-claims-source.mjs
```

Reverse a disambiguation pass:
`UPDATE content SET context=NULL, context_model=NULL WHERE context_model='deepseek-disambig-v1' AND doc_id=?`.
All writes route via the single-writer API. Scripts live in `scripts/entity-read/`
(`disambiguate-book.mjs`, `chapter-map.mjs`, `_disambig-gate.mjs`, `context-coverage.mjs`).
