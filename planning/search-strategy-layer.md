# Search strategy layer — System-1 picks how to search, how to rank, how to answer (2026-10-01)

**Requirement (Chad):** "A search for the corresponding original-language phrase would find a different result than a
search for the published version, or the quote best expressing an idea, or the quote best answering a question. We
want a battery of search strategies which System-1 selects, a similar set of re-ranking strategies System-1 selects,
and an answer format which System-1 selects, so that the user is always getting results they asked for."

Depends on the phrase index (planning/phrase-index-plan.md, P4). No slow LLM anywhere in the loop: Jev only.

## The pattern (already proven in `api/lib/anis/formats.js`)

Catalog entry = `{ id, when (Jev reads it), fits(profile) (code removes the impossible), how/run }`.
Code filters → Jev chooses among what remains in ONE typed call → a shape default covers Jev being slow or down.
Logged with `by: 'jev' | 'code' | 'default'` so every choice is auditable and the catalogs grow from the logs.

**One Jev call per query, not three:** strategy, rerank and format are three `choice` questions in the same typed
request (as `source-resolve.js` already asks several questions at once). Format can be re-checked after retrieval if
the evidence profile rules the first choice out (code-side `fits`, no second Jev call).

## Catalog 0 — research patterns (what the reader is doing)

Chad 10-01: "we need to search for more patterns — the study guide pattern, the commentary pattern, the cross-reference
pattern". A pattern is how people actually study (passage guide, compilation, word study, reception history…); each
maps to a strategy + re-ranker + format. Full catalog of 36 (sources, status, missing layer per pattern):
planning/research-patterns.md. Jev recognises the pattern in the same call that picks the strategy.

**First ten** (value × feasibility): passage guide · who quotes this (reception) · topical compilation · occasion of
revelation (tablets) · study-circle sequence · translation comparison · cross-references · word study · prayer by
occasion · parallel accounts.

**Missing data layers, by patterns unlocked:** (1) chronology — dates of works/passages; (2) commentary→passage links
(explains / applies / mentions, seeded from quote links + Jev); (3) canonical citation scheme (sura:ayah,
book:chapter:verse, Phelps PIN + ¶); (4) Arabic/Persian root–lemma index; (5) typed passage↔passage relations
(cross-reference, parallel account, allusion, supersedes, derives-from — generalises content_source_links);
(6) passage genre/occasion tags; (7) translator/edition metadata; (8) variant/witness alignment; (9) isnād graph.

## Catalog 1 — search strategies (what to retrieve)

| id | when (Jev reads) | run |
|---|---|---|
| `find_original` | wants the Arabic/Persian (or other original) behind an English passage or quote | link pivot first; then phrase vectors, `literal`, ar+fa group (or the source language); return the span |
| `find_published` | has an original or a paraphrase and wants the authorised/published English | reverse pivot (original → its translations, authority-ranked); then English phrase vectors restricted to translations |
| `exact_quote` | remembers the wording, wants where it is | keyword phrase match on paragraphs + `literal` phrase vectors; no grounding |
| `best_expression` | wants the passage that best expresses an idea | concept card → `concept_ids` spans + `grounded` phrase vectors; authority-weighted |
| `answer_question` | asks a question the texts answer | HyPE `question` entries + `grounded` phrase vectors |
| `person_event` | about a person, place or event | `entity_ids` filter (identity expansion) + `grounded` vectors for what happened |
| `define_term` | what a word/name/concept means | concept card + lexicon + `term_with_original` sources |
| `compare` / `range` | how traditions/authors treat a theme | per-tradition sub-queries (parallel), diversity |
| `enumerate` | wants the full list (all tablets to X, all mentions of Y) | id filters, exhaustive, no ranking cut |
| `argument` | the argument/line of reasoning of a work | thread entries (enrichment P6) → claims in order |
| `metadata_lookup` | when/where/by whom a work was written, translated, published | find the document(s), read doc_meta fields — no vectors (planning/document-metadata-plan.md) |
| `metadata_gather` | a list/timeline built from document or unit metadata (talks with dates, tablets to X) | gather target units by filters, extract fields, Jev fills gaps from unit evidence |

## Catalog 2 — re-ranking strategies (how to order what came back)

All re-ranking is either arithmetic (no model) or ONE Jev call that classifies the top ~20 passages with per-passage
`choice` questions (the `source-resolve.js` shape). Never generative.

| id | when | how |
|---|---|---|
| `none` | exact quote / enumerate | keep retrieval order (or document order for enumerate) |
| `authority` | doctrinal question; mixed scripture/commentary | sort by authority tier (existing `authority.js`), then score |
| `original_first` | find_original | spans in the source language first; prefer the linked original over semantic neighbours |
| `answerhood` | answer_question | Jev per passage: answers / partly / mentions only / unrelated → reorder |
| `expressiveness` | best_expression | Jev per passage: states the idea centrally / illustrates it / mentions it in passing |
| `primary_speaker` | person_event, quotes | Jev per passage: is X the speaker / subject / mentioned (source-resolve already asks "whose words") |
| `diversity` | compare / range | round-robin across traditions/authors after relevance |
| `chronological` | history, enumerate events | by date |

## Highlighting — Jev picks the target span (Chad 10-01)

"Highlighting is hard to do algorithmically, especially on semantic results. Use Jev to identify target highlights."
- Candidates are the paragraph's own phrase units (offsets from api/lib/phrases.js) — Jev never locates text, it
  CHOOSES: per result paragraph, a typed choice over numbered phrases ("which phrase(s) answer / match the query?",
  multi-select allowed). One call for the top ~10 results (~150–300 ms), batched with the re-ranker when both run.
- Free fallback = the phrase the index matched (every phrase-index hit already carries it). Lexical hits (exact
  quote, names) highlight their matched tokens deterministically — no Jev needed.
- Cross-language: highlight the chosen phrase in the original and its aligned phrase in the translation.
- Measure: CTAI word-aligned cases (275 with exact spans) + phrase/sentence cases — highlight hit rate, baseline =
  the index's own best phrase (exact phrase @1: originals ~29%, in-book ~52%); Jev must beat it.

## Catalog 3 — answer formats

Exists: `api/lib/anis/formats.js` (direct_answer, yes_no_with_proof, decisive_passage, range_of_voices,
authority_layers, popular_vs_literature, term_with_original, …). Add what the strategies need:
`original_and_translation` (side by side, span highlighted), `published_rendering` (the authorised English with its
source), `passage_list` (results with the matching phrase highlighted, no prose).

## Follow-up search and exploration — branching stays System-1 (Chad 10-01)

"We should be able to support follow-up searching and exploration, but only if we keep all branching with Jev and not
slow LLMs." So no model ever writes a plan; every hop is an index lookup chosen from a menu.

- **Session working set.** The spans already shown, each with its ids: entity_ids, concept_ids, source/quoted-by
  links, original/translation links, work + position, argument thread. Kept per conversation (threads table).
- **Code builds the menu from those ids** — never free text: *people in these passages* (Mullá Ḥusayn, Quddús…),
  *concepts they develop*, *what this quotes / who quotes this*, *the original / other renderings*, *earlier in the
  argument / what this resumes*, *same theme in another tradition*, *more like this*, *narrower (this work / author /
  period)*, *broader (drop a filter)*.
- **A follow-up message** → one Jev call: which menu branch (or "new search"), plus the referent when the message
  points back ("what else did *he* say", "the original of the *second* one") resolved against the working set.
- **Suggested next steps** (exploration chips) = the menu, ranked by one Jev call or by arithmetic (coverage: branches
  that bring new ids first). Clicking a chip is a lookup with zero model calls.
- **Research mode** = the same loop run automatically: Jev picks the next branch; stop when hops add no new ids
  (coverage), never a fixed hop count; one composing call at the end only if the answer format needs prose.
- **Measure:** follow-up resolution accuracy (labelled conversations: which branch, which referent), hops per
  question answered, latency per hop (target: Jev ~150 ms + lookup).

## Decision trees inside one turn — triangulating an answer (Chad 10-01)

"A search strategy might involve a decision tree for follow-up research … Jev might select the best results and search
with them to pursue a theme … the chat can explain what search strategy it is using to buy the extra second or two."

- **A strategy may be a tree, not one search.** Each node = one Jev decision (which results to pursue, which branch
  next, stop?) + parallel lookups. Some strategies are always one step (exact quote); some may branch
  (best_expression, answer_question, argument, person_event, compare).
- **Later steps reuse stored vectors — no new embedding.** "Search with these results" = the selected phrases' own
  vectors as queries (plus their ids: people, concepts, links). Only the first step pays for a query embedding
  (~0.4–0.6 s); each further step ≈ Jev ~150 ms + lookups 10–50 ms ≈ 200 ms. → the vector store must return full
  vectors by id (Qdrant returns them; Meili binaryQuantized cannot — our /tank vector store can).
- **Triangulation is the stop rule.** Independent routes (link pivot, phrase vectors, concept ids, entity ids) that
  converge on the same passage = confident answer, stop. Divergence → Jev picks the next branch. Hard cap on depth.
- **Budget tiers, chosen with the strategy:** quick (one step, < 1 s) · deliberate (tree of ≤ 5 steps, ~1–3 s) ·
  research (open-ended, runs on, results arrive progressively).
- **Narration covers the deliberate tier — written by code, not a model.** Each catalog entry and branch carries a
  short line ("Looking for the Persian original…", "Following the quotation to its source…", "Three routes agree —
  checking one more"). Streamed as status events the moment the branch is chosen: zero model time, and true.
- **Measure:** steps per answer, answer accuracy vs one-step search, time per step, share of turns per tier.
- **Recurring trees become stored results.** A tree everyone would recompute identically (a timeline of
  'Abdu'l-Bahá's talks in the West) is run once by enrichment and stored as a table (events: talk, date, place,
  sources, confidence); the query reads it in ms and the live tree covers only what the table lacks. Live trees for
  new questions, stored results for recurring ones.
- **Worked example (checked against the library 10-01):** talks — Promulgation (20917, 1,284 ¶), Paris Talks (8320 /
  20908), 'Abdu'l-Bahá in London (20921), Talks in Los Angeles (7638), Star of the West; dates — the Promulgation
  spreadsheet of talks (39271: date, city, address per talk), Maḥmúd's Diary (11355: dated entries with place),
  239 Days. The talk texts themselves carry no date/place lines in our copy (Promulgation headings are "Notes by …")
  — check whether ingestion dropped the printed talk headers. Tree: plan (Jev) → talks ∥ dated sources (ids/structure)
  → match by stored opening-phrase vectors near the place, Jev confirms in one batch → dedupe via quote links → sort
  → one gap-filling round with narration. ≈ 0.6–1.1 s (+ ≤ 0.5 s for gaps); no embedding, no LLM.

## Battery (measure every layer separately)

Cases tagged with the EXPECTED strategy (and acceptable formats), from data we already hold:
- `find_original`: tests/quality/crosslingual-fixtures.json (819, judged by text).
- `find_published`: the same pairs reversed (original → Shoghi Effendi's English).
- `exact_quote`, `lay_paraphrase`, `define_term`, `find_person`, `history_fact`, `compare`, `enumerate`: the type
  battery (tests/quality/search-type-fixtures.json, 82).
- `answer_question`: stored HyPE questions → their passage (tests/quality/crosslingual/en_battery.py).
- `best_expression`: concept claims' `proof_verbatim` → query = the claim's statement, target = the proof span.
- `person_event`: entity battery (tests/quality/entity-battery.mjs).

Metrics:
1. **Strategy choice** — Jev picks the expected strategy (accuracy, confusion matrix).
2. **Retrieval per strategy** — @1/@10 with the RIGHT strategy forced (isolates retrieval from choice).
3. **Re-rank lift** — @1 after vs before each re-ranker; must be positive or the re-ranker is dropped.
4. **End to end** — Jev-chosen strategy + re-rank vs the expected answer.
5. **Format** — chosen format ∈ acceptable set.
6. **Latency** — p50/p95 of the Jev call(s) and the whole search; budget 1 s total.

## Order
1. After P4 of the phrase index (phrase layer live): build catalogs 1–2 with arithmetic re-rankers only; battery for
   strategy choice + retrieval.
2. Add the Jev per-passage re-rankers one at a time; keep only those with measured lift inside the latency budget.
3. Add the new formats; end-to-end battery.
