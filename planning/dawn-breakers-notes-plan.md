# Instructor Notes Companion — plan (Dawn-Breakers first, then the Íqán)

Status: PLAN, nothing built. Source of truth for the task is Chad's research protocol (2026-08-13),
restated in §1 so the implementation never drifts from it.

**Scope, per Chad (2026-08-13): this is NOT a Dawn-Breakers tool.** It is one engine with a per-book
**research profile**. The machinery — chapter context pass, paragraph loop, notes ledger, gates — is
constant. What changes per book is *what counts as a useful addition* and *which research channels are
authoritative*. Dawn-Breakers is a HISTORY, so it wants deep historical research (which the corpus already
holds). The **Kitáb-i-Íqán** is REVEALED TEXT, so it wants deep Islamic research, constant reference to the
original Arabic/Persian, and antecedents and cross-references across the Bahá'í corpus. Same engine,
different lens. Profiles are declared, not hardcoded, so a third book does not mean a third program (§1.1).

## 1. The task

Per chapter: read the **whole chapter first for context**, then work **paragraph by paragraph**.
For each paragraph, look only for genuinely useful additions in the profile's categories.

**Dawn-Breakers profile (historical) — the six Chad specified:**

| category | what it adds |
|---|---|
| `name` | meaning/translation of a Persian or Arabic name, title, honorific, term — when interesting |
| `person` | who they are, why they matter *here*, notable appearances elsewhere in Bahá'í / Persian / Islamic history |
| `place` | period-appropriate context: social, economic, political, religious |
| `connection` | parallels to the writings and teachings of the Báb, Bahá'u'lláh, ‘Abdu'l-Bahá |
| `islamic` | Qur'ánic, Shí‘ah, historical or cultural reference a modern reader would miss |
| `detail` | an occasional memorable fact that illuminates the story or starts a class discussion |

### 1.1 Profiles — same engine, different lens

A profile declares: the categories, the research channels in authority order, and any extra gates. Sketch
for the second book, to prove the abstraction earns its keep rather than being speculative generality:

**Kitáb-i-Íqán profile (revealed text):**

| category | what it adds |
|---|---|
| `original` | what the English renders — the Arabic/Persian term Shoghi Effendi chose to translate this way, and where he renders the same term differently. **Translation IS interpretation**: his word-choice fixes which sense a polysemous term carries, so this is a primary-evidence note, not trivia |
| `quranic` | the verse being cited or alluded to, in its own Qur'ánic context — including what the surrounding verses say that the citation assumes |
| `hadith` | the Shí‘ah tradition invoked, its standing, and who transmits it |
| `theological` | the Shí‘ah/Islamic doctrine at issue (return, seal of the prophets, occultation, the Qá'im) as a Muslim reader of 1862 would have held it |
| `antecedent` | where this theme appears EARLIER — in the Báb's writings, or in the same argument developed elsewhere by Bahá'u'lláh |
| `crossref` | where the corpus treats the same passage or theme, so the reader can follow it outward |

Two things the Íqán profile needs that the historical one does not:

- **Aligned original text.** Notes referring to the original require the Arabic/Persian aligned to the
  English paragraph. CTAI is the aligned-source channel ([[project_conceptual_track_ctai_bilingual]]);
  its doctrine — **Guardian translations alone are authoritative, everything else is recall-only** —
  carries over unchanged.

  **⚠ VERIFIED 2026-08-14 — THE PREREQUISITE FAILS. Profile E is a DATA PROJECT before it is a profile.**

  | doc | lang | ¶ | what it actually is |
  |---|---|---|---|
  | 20810 | en | **291** | the real English Íqán — usable today |
  | 445534, 445532 | fa | **1** | `حضرت بهاءالله, كتاب ايقان` — catalogue stubs, no text |
  | 445529 | en | 1 | stub |
  | 15176, 16709 | en | 4, 6 | stubs |

  The original exists in the catalogue and **not** in the corpus: one-paragraph rows, nothing to align to.
  So the `original` category — "what the English renders, and where he renders the same term differently" —
  cannot be built at all yet, and it is the category that justifies the profile.

  Work required before profile E, in order:
  1. **Source and ingest the Persian/Arabic Íqán** at paragraph granularity (the stub names it; the text is
     missing). Same "have source / no source" problem as the missing-books queue.
  2. **Align** original ¶ to English ¶. Not necessarily 1:1 — Shoghi Effendi's paragraphing is his own, so
     this is a real alignment task, which is precisely what CTAI is for.
  3. Only then the profile.

  Until then a **reduced Íqán profile is still worth having**: `quranic`, `hadith`, `theological`,
  `antecedent` and `crossref` all work from the English text plus the corpus. Only `original` is blocked.
  That is the honest scope for a first pass, and it is a decision for Chad rather than an assumption here.
- **A citation-fidelity gate.** A note asserting "this cites Qur'án 2:23" must be checkable against the
  original, not asserted from the English. Same shape as the source gate in §5, higher stakes: a wrong
  scriptural attribution in an instructor's notes is worse than no note.

Rules that are **product invariants**, not prompt suggestions:

1. **Be selective.** Many paragraphs need one note or none. Zero notes is a correct outcome.
2. **Never summarize the paragraph.**
3. **Not comprehensive** — the most illuminating point, not every available point.
4. **Avoid repetition.** Search existing notes *before* researching. Re-mention only when this paragraph
   adds a **new dimension**.
5. **Label the epistemic status**: explicit teaching vs strong parallel vs interesting interpretive
   connection. These must never blur.
6. **Sources for factual claims and quotations.**
7. **Concise enough to actually use while teaching.**

Goal: a growing set of instructor notes that makes the book a jumping-off point for deeper exploration,
without burying the reader in trivia.

## 2. Why this is easier here than it looks

Dawn-Breakers (doc 21308, 1,224 ¶) is already the most enriched book in the corpus:

- disambiguation complete — every paragraph carries a context note naming who/where/when is in force;
- **424 entity mentions bound** to resolved entities, plus claims and a cast seed;
- 869 ¶ hyped, 677 fact-fed;
- `scripts/entity-read/chapter-map.mjs` already assigns `chapterNum` / `chapterTitle` / `scene` per ¶.

So "what is this paragraph about" is a **lookup, not an inference**. The repetition check can key on
resolved entity ids rather than string matching — which is what makes rule 4 enforceable instead of hopeful.
(String matching for identity is explicitly rejected: [[feedback_no_literal_name_binding]].)

## 3. The persistent research-notes database

Chad's one requested feature. It is the spine of the whole thing.

```sql
CREATE TABLE study_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  para_id TEXT NOT NULL,            -- external_para_id (para_NNNN) — the citable anchor
  paragraph_index INTEGER NOT NULL, -- ordering + "¶ 37" display
  chapter_num TEXT, chapter_title TEXT,
  category TEXT NOT NULL,           -- name | person | place | connection | islamic | detail
  subject_key TEXT NOT NULL,        -- normalised topic: 'entity:1247564' or 'term:babu-l-bab'
  subject_entity_id INTEGER,        -- when the subject is a resolved entity (preferred)
  body TEXT NOT NULL,               -- the note itself, teaching-ready prose
  claim_kind TEXT,                  -- explicit_teaching | strong_parallel | interpretive | fact
  sources_json TEXT,                -- [{docId,paraId,url,quote}] — required for fact/quotation
  new_dimension TEXT,               -- when re-touching a taught subject: what this adds. NULL = first time
  model TEXT, version TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_study_notes_doc_para ON study_notes(doc_id, paragraph_index);
CREATE INDEX idx_study_notes_subject  ON study_notes(subject_key, doc_id);
CREATE INDEX idx_study_notes_entity   ON study_notes(subject_entity_id);
```

**Search before researching** has two channels, and needs both:

- **exact**: `subject_key` / `subject_entity_id` — "have we already explained *this* person?"
- **fuzzy**: a Meilisearch index over `body` — "have we already said something like this?", which catches
  the same idea arriving under a different label (typo/translit-tolerant, as the corpus index already is).

### Completion is a stamp, never a note count

```sql
CREATE TABLE study_note_pass (
  doc_id INTEGER, para_id TEXT, version TEXT,
  notes_written INTEGER DEFAULT 0,
  at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (doc_id, para_id, version)
);
```

A paragraph that correctly warrants **no note** is PROCESSED. Measuring "done" by output is exactly the
bug that cost 2026-08-13 twice over (disambiguation, then hype) — see `api/lib/pipeline/processed.js`.
The same doctrine applies here from day one, and rule 1 makes empty results *common* rather than rare.

## 4. Flow, per chapter

```
annotate-chapter DOC=21308 CHAPTER=3
  1. CONTEXT PASS   one call over the whole chapter → arc, cast, places, time span.
                    Not stored as notes; it is the frame every paragraph call receives.
  2. FOR EACH ¶:
     a. subjects   ← bound entity mentions + disambiguation context + chapter cast
     b. PRIOR      ← study_notes lookup by subject (exact) + fuzzy body search
     c. research   ← model call: the six categories, given ¶ text, chapter frame, PRIOR ("already
                     covered — only add a new dimension"), and corpus evidence
     d. gates      ← §5
     e. store      ← notes + stamp study_note_pass (even when zero notes)
```

Chapter-at-a-time is the unit Chad asked for and also the right cost unit: the context pass is amortised
over the chapter, and a chapter can be reviewed before the next is spent.

## 5. Gates — deterministic backstops behind a well-tuned prompt

Prompt-first, determinism as the backstop ([[feedback_prompt_tuning_over_determinism]]). Each gate exists
because a specific rule above is otherwise unenforceable:

| gate | rule | behaviour on failure |
|---|---|---|
| **no-summary** | 2 | high n-gram overlap with the paragraph → reject the note, log it |
| **repetition** | 4 | `subject_key` already taught and `new_dimension` empty → drop |
| **source** | 6 | `claim_kind` = fact/quotation with empty `sources_json` → HOLD, never silently publish |
| **label** | 5 | `connection` note without an explicit/parallel/interpretive label → HOLD |
| **selectivity** | 1,3 | more than N notes on one ¶ → keep the strongest, log the rest (never inflate) |

Held notes go to a review queue, not the bin — a note that is right but unsourced is worth chasing.

## 6. Sources policy

Corpus first, and cite it the way the app already does: `${docs.source_url}?paraId=${external_para_id}`
(the working scheme — see the entity-research skill). Highest authority available, no citation laundering:
Shoghi Effendi's footnotes (doc **40108**) outrank scholarship, and GPB characterisations outrank both
([[feedback_evidence_source_attribution]]). Web only when the corpus is genuinely thin, marked
UNVERIFIED, preferring published books over blogs ([[feedback_web_fallback_published_sources]]).

## 7. Cost

Basis: tonight's measured grounding — 6 books, ~1,800 deepseek calls, $6.40 (~$0.0036/call), English so
deepseek-only per the spend policy ([[feedback_paid_models_persian_only]]). Notes calls carry more context
(chapter frame + prior notes), so assume 2–4×: **~$25–50 for all 1,224 ¶**, spendable one chapter at a
time. Cheap enough to iterate on the prompt with a single chapter before committing the book.

## 7.1 How it is operated: INTERACTIVE, stored by book, admin-visible

Chad (2026-08-13): *"something we could build interactively, but it would remain in storage by book,
available in the admin area as book-notes. Later we will create an exporter to export to OceanLibrary.com
notes when that API exists."*

This is not a fire-and-forget batch job, and that changes two things in the design:

**Interactive loop.** The unit of work is a chapter, and a human is in it:

```
pick book + chapter → run → review the chapter's notes in the admin UI
   → accept / edit / reject per note   → re-run a single ¶ with a nudge
   → accepted notes enter the ledger   → next chapter starts better-informed
```

Consequences the schema must carry (folded into §3): every note has a **review state**
(`pending | accepted | edited | rejected`), an **edited body** distinct from the model's original (so the
prompt can be evaluated against what a human actually kept), and a per-¶ **re-run** that supersedes rather
than duplicates. **Only accepted notes count as "taught" for the repetition ledger** — a rejected note must
not suppress a later good one, which would be the repetition gate quietly causing gaps.

**Storage is by book, permanently.** `study_notes.doc_id` is the book; nothing is per-session or
per-export. The admin area gets a **Book Notes** section: books that have notes → chapters → paragraphs
with their notes, review controls, and progress (¶ processed / notes accepted, from `study_note_pass`).

**Export-ready, not export-coupled.** The exporter is deferred until the OceanLibrary notes API exists, so
the rule now is simply: **store meaning, render at export time.** No HTML, no site-specific formatting in
`body`. This costs nothing today and is what makes the future exporter a mapping rather than a rewrite —
and one property already lines it up: notes are anchored to `external_para_id` (`para_NNNN`), which IS
OceanLibrary's own paragraph anchor (`${source_url}?paraId=para_NNNN`). A Dawn-Breakers note is therefore
already addressable in OceanLibrary's scheme without any translation step.

## 8. Build order

- **A — the database Chad asked for.** Migration (`study_notes` + `study_note_pass`), `api/lib/notes/ledger.js`
  (record, review-state transitions, exact + fuzzy lookup), Meili index, tests. Useful standing alone:
  notes can be written by hand and searched before any generation exists.
- **B — the chapter runner, behind the profile.** `api/lib/notes/profiles/dawn-breakers.js`, the context
  pass, the per-¶ research call, the §5 gates, and `scripts/notes/annotate-chapter.mjs`. Run **chapter 1
  only**, review with Chad, tune the prompt against what he actually keeps, then continue.
- **C — the admin surface (Book Notes).** `GET/POST /api/admin/book-notes/...` for list, chapter view,
  review actions and single-¶ re-run; the admin page itself; Markdown render in Chad's format (`¶ 37` +
  only the headings with something to say).
- **D — Dawn-Breakers, chapter by chapter**, interactively. The ledger grows and repetition falls as it goes.
- **E — the Íqán profile**, once the alignment prerequisite in §1.1 is verified.
- **F — the OceanLibrary exporter**, when that API exists. Deferred by design, not forgotten.

## 9. Open questions

1. **Chapter 1 sample size** — annotate one chapter and review before spending the book? (assumed yes)
2. ~~**Íqán prerequisite**~~ — ANSWERED 2026-08-14: the original is a 1-¶ stub, so E is a data project
   (source + ingest + align) before it is a profile. Open decision: run a REDUCED Íqán profile now
   (everything except `original`), or wait for the aligned text?
3. **Cross-book later**: the ledger is book-scoped by Chad's decision. When GPB is annotated, do notes
   cross-reference Dawn-Breakers notes, or stay independent? (Deferred — the schema supports either.)
4. **Public surfacing**: instructor-only for now. If notes ever appear beside the text on the site, that is
   a read path on the same data — no model change.
