# Strategy trees — family BC (explain · narrate · identify · compare) — 11-09

Method: `planning/anis-strategy-trees.md` §1 steps 1→12, §2 elements, §2a context units, §2b conversation state + layers,
§3 modes/templates. Every tree here is tradition-agnostic: no node names a tradition; "the same task for another religion" is
never a separate strategy. Scope (`religions_specified`, `authority_floor`, `named_sources`, `search_originals`,
`scope_source`) resolves turn > conversation_state > reader card > site and every fetch/search applies it implicitly.

| class | verdict | strategy |
|---|---|---|
| B1 What a tradition teaches | own task | `understanding` |
| B2 Explain this passage | **setting_of understanding** (anchor = `reader_position` / `quoted_words` / `state.given`) | `understanding` |
| B3 Why or how | **setting_of understanding** (`question_frame = why`) | `understanding` |
| B4 Tell the story | own task | `story` |
| B5 Who was this person | own task | `person` |
| C1 Two traditions on one topic | own task | `comparison` |
| C2 X vs Y | **setting_of comparison** (`compare_sides` = concepts/works/schools; no `topic` → default axes) | `comparison` |
| C3 All religions on X | **setting_of comparison** (`religions_specified = all`) | `comparison` |
| C4 Two accounts or translations | own task | `versions` |

**NEW elements:** `search.together`, `fetch.anchor`, `fetch.events`, `fetch.align`; NEW edge `rank → empty`; NEW shared
template `tpl.unavailable`. **NEW units:** `reader_position`, `question_frame`, `compare_sides` (see Method notes).

> **Consolidated 11-09** with the plan (A, DE, FGH): every NEW element/unit here is now in the plan's §2/§2a. Applied: no
> tree widens scope (the `wider` tiers in understanding and story and byname's widen are removed — the only widening is E2,
> DE file); `search.together` → `search.together`; `hand.strategy{upto: evidence}` → `{upto: evidence}`; absence /
> fallback / unavailable nodes are the shared ends `$absence` (runs E2) · `$fallback` · `$unavailable`, not counted; node
> counts are working nodes; a named person is ranked by scope, never filtered (`out_of_scope`, not `widened`);
> `reads_arabic`/`reads_persian` → `reader_card.reads_scripts`. Where a convention below still differs, the plan wins.

### Conventions used by every tree (so each table stays short)

* **Implicit reads.** Every `fetch.*` / `search.*` node reads the scope units (`religions_specified`, `authority_floor`,
  `named_sources`, `search_originals`) and `state.given`, and writes `found_passages` / `found_records`, `found_outcome`,
  and `missing` (what it looked for and did not get). Tables list only reads/writes beyond these.
* **One evidence pipeline.** Every non-error outcome flows into one `rank`. `rank` drops passages in `state.given`
  (unless pinned) and returns NEW edge `empty` when nothing is left — the one road to ABSENCE. "None after all tiers" is
  decided by state, not by which tier failed last.
* **No tree widens (plan §1 step 6).** Thin = answer in scope with what there is and say what is missing (`missing` →
  `state.open`). Last-tier none → `$absence`, which runs E2 (DE file) — the one place scope widens, stated in the reply.
* **Absence ≠ error.** `none` → `$absence` (E2 → `tpl.absence`: not in the library + nearest real passage). `error` → next
  tier; after the last tier `$fallback` (`fallback.agent`); its `answered` goes through the tree's main shape (every answer
  via the writer), its `fail` → `$unavailable` (`tpl.unavailable`: "I couldn't search the library just now…"), never a false absence.
* **Tree end (code, §2b step 2):** `state.given += quoted passages`, `state.thread += {turn, strategy, topic, output_form,
  found_outcome}`, `state.open += missing`, `state.offers += offers the template made`.
* **Inherited-scope clause (all templates).** `{{scope_clause}}` is written once in the plan's §3 base template (shown
  only when `scope_source ∈ {conversation, reader}` and `scope_excluded > 0`; site layer only on a miss). Trees only place it.
* **Original-language words (§3, all templates marked `[originals]`).** Every Arabic or Persian word, term, root or quoted
  original whose script is not in `reader_card.reads_scripts` (default empty) is followed by its transliteration
  (plan §3 base), from CTAI / the library (`fetch.renderings`), never improvised; a script in the list stands alone. Voice never shows script: transliteration only.

---

## 1. understanding — B-explain (B1; B2, B3 as settings)

**name** `understanding` · **type** `B-explain`

**card:** The reader wants to understand what a tradition teaches about something — a teaching, concept or practice, the reason
or purpose behind it, or a passage they quote or are reading. Anís answers directly from that tradition's own scripture and
authoritative interpretation (originals searched too), quoted and linked in authority order.

**difference:** the only strategy that EXPLAINS: a3 lists passages without explaining, a6 defines one word, comparison relates
sides. **B2 → setting_of understanding**: same task, the input is a given passage instead of a topic (`fetch.anchor` loads it;
the rest of the tree is identical). **B3 → setting_of understanding**: "why" is the same explain task with a different frame;
`question_frame` changes only the search phrasing and a template block — two more options would only confuse Jev.

**near_misses**
| text | goes_to | why |
|---|---|---|
| "who wrote 'the earth is but one country'?" | a4 | wants the source of the words, not their meaning |
| "what does the word Kawthar mean?" | a6 | one word's meaning |
| "how is a Sikh funeral conducted?" | d3 | what to do, not what it means |
| "Buddhist vs Christian view of suffering" | comparison | two sides and their relation |
| "why does God let my child suffer?" | d1 | personal distress: comfort before explanation |

**ideal answer per mode**
* voice: one spoken sentence of direct answer · one quotation ≤2 sentences, spoken citation · offer to email the passages.
* widget: direct answer · one passage quoted+linked · others by linked title (~150 words).
* site: direct answer · 2–4 passages in authority order, linked, translator named; why-frame = one reasoning step per passage (150–250).
* email: as site, passages in full, original beside English where held (≤ ~600).
* research: a short section per authority layer (scripture · authoritative interpretation · scholarship labelled), ending with the one passage most worth reading in full (500–900).

**shapes** `one_passage` · `passages` · `absence` · `unavailable` (NEW).

**needs**
| unit | required | default |
|---|---|---|
| `topic` | required | `state.subjects.topic`, else the anchor passage's subject |
| `question_frame` (NEW) | optional | `what` |
| `reader_position` (NEW) | optional | none → topic mode |
| `quoted_words` | optional | none |
| `religions_specified`, `authority_floor`, `named_sources`, `search_originals`, `scope_source` | implicit (scope) | layer chain → `all` |
| `channel`, `depth`, `reply_budget` | implicit (code) | widget-chat · brief |

**state reads/writes:** reads `state.scope`, `state.subjects.topic`, `state.given` (skip repeats; "that passage" → anchor),
`state.thread` ("explain it more simply" re-uses the last turn's topic). Writes (code, at end) `given`, `thread`, `open`
(from `missing` on no_direct / thin), `offers` (the "more: argument · context · original" offer on the anchored answer).

**the TREE** (10 working nodes + shared ends; `anchor` is a no-op in topic mode)

| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| anchor | NEW `fetch.anchor` | — | `reader_position`, `quoted_words`, `state.given`, `previous_evidence` → `found_passages`[anchor], `named_work` | one · thin · none · error → gather |
| gather | NEW `search.together` | `fetch.collection`; `search.shelf{authority: scripture, k: 6}`; `search.shelf{authority: interp, k: 4}`; `search.hype{q: {{question_frame}} {{topic}}}`; `search.originals`; anchor set → `named_sources += author of anchor` | `topic`, `question_frame` → `found_passages` | one · several · thin · none → rank · error → $fallback |
| rank | `rank` | by: authority; k: 4 (email/research 8); pin: anchor; drop `state.given` | `found_passages` → `found_passages` | done → stage · NEW empty → $absence |
| stage | `ui.stage` | "Reading the passages in context…" | `channel` → — | emitted → around |
| around | `read.around` | — | `found_passages` → `found_passages`.context | done → trace |
| trace | `read.source` | — | `found_passages` → `found_passages`.primary | traced · kept → judge |
| judge | `judge.passages` | — | `current_user_question`, `found_passages` → `found_passages`.verdict | answers → s_answer · mentions_only → s_nodirect · conflict → s_conflict |
| s_answer | `shape` | `understanding.answer` | — | done → $end |
| s_nodirect | `shape` | `understanding.no_direct` | writes `missing` | done → $end |
| s_conflict | `shape` | `understanding.conflict` | — | done → $end |
| $absence | shared end | `hand.strategy e2` → `tpl.absence` | writes `missing` | done → $end |
| $fallback | shared end: `fallback.agent` | — | `current_user_question` → `found_passages` (labelled) | answered → s_answer · fail → $unavailable |
| $unavailable | shared end: `tpl.unavailable` | `found_outcome` | done → $end |

```
anchor ─(any)→ gather ─one/several/thin/none→ rank ─done→ stage → around → trace → judge ─answers──────→ s_answer → $end
                  │                            └─empty→ $absence (E2)                  ├─mentions_only→ s_nodirect → $end
                  └─error→ $fallback ─answered→ s_answer · fail→ $unavailable          └─conflict─────→ s_conflict → $end
```

**paths**
* clean hit: anchor(none) → gather(one) → rank → stage → around → trace → judge(answers) → s_answer
* several: gather(several) → rank keeps top 4 by authority, minus `state.given` → … → s_answer
* thin: gather(thin) → rank → … → judge(answers) → s_answer naming what is missing (→ `state.open`); or (mentions_only) → s_nodirect
* none after all tiers: gather(none) → rank(empty) → $absence (E2 may widen, stated in the reply)
* error: gather(error) → $fallback → s_answer | $unavailable
* conflicting sources: judge(conflict) → s_conflict, each attributed in authority order
* B2: anchor(one) → gather (same author's words elsewhere, original term) → rank (anchor pinned) → … → s_answer [anchor]
* B3: gather with why-frame → … → s_answer [why], or s_nodirect "the texts give no reason"

**templates**
```
understanding.answer   (overrides tpl.passages / tpl.one_passage)
base: First sentence answers {{current_user_question}} in the tradition's own terms. Then {{found_passages}} in authority
  order, each quoted (never clipped), linked, translator named; provisional translations named as such; never retranslate.
  Scholarship only labelled ("a scholar, X, writes…"). {{scope_clause}}
  [question_frame=why] Build the reasoning one cited step per passage — "because…" comes from the text, not from you. Name
  where authoritative interpreters differ. End with the one passage most worth reading in full.
  [anchor] Start from the reader's passage (its key sentence at most; if the found wording differs from {{quoted_words}},
  say so). Explain it with the same author's words elsewhere and the original term when held [originals]. Never replace the text with a
  paraphrase. End with one line offering more (the argument · the context · the original) — recorded in state.offers.
  [missing] One line on what the library does not hold on this.
voice: 1 sentence answer · 1 quotation ≤ 2 sentences · spoken citation · {{scope_clause}} spoken briefly · "Shall I send these passages to your email?"
widget: answer + 1 quoted passage linked; others by linked title.
email: passages in full; original beside English (```bilingual) when held [originals].

understanding.no_direct
base: Say plainly that the texts in the library do not state this directly ([why]: "do not give a reason for this"). Then the
  closest passages that touch it, labelled as touching, not answering. {{scope_clause}} One line offering a wider search or a
  research report (→ state.offers). Never fill the gap with your own reasoning.
voice: one sentence · one short passage · the offer.

understanding.conflict
base: First sentence: the texts give more than one view. Each passage attributed, in authority order (Writings → Guardian →
  House of Justice → pilgrim notes → scholarship; other traditions: their scripture → authoritative interpretation →
  scholarship). Say which carries authority and why; do not reconcile them yourself. {{scope_clause}}
```

**target_time** ≤12 s, first words ≤2 s (stage ~0.8 s); anchored ≤8 s.
**measures** judge score vs agent + Perplexity · p50/p95 ms · $/answer · branch taken (answer/no_direct/conflict/absence/agent) ·
absence rate · fallback rate · B2 anchored-to-right-paragraph % · B3 steps-cited % · originals hit rate · E2-widened % · repeat-quote rate (passage in `state.given` re-quoted; must be 0).
**tests (new)**
1. "What do Zoroastrians teach happens to the soul at the Chinvat bridge?"
2. "Can you explain this? 'The essence of all that We have revealed for thee is Justice.'"
3. "Why do Jains sweep the ground before they walk?"
4. "What is the Bahá'í understanding of the Holy Spirit?"
5. "What is this paragraph saying about the 'City of Certitude'?" (widget beside the Íqán)

**must_not**
1. "Who said 'ye are the fruits of one tree'?" → a4
2. "Hindu and Buddhist views of rebirth compared" → comparison
3. "What are the rules for the Bahá'í Fast?" → d3

**open issues**
* `fetch.collection` to build — returns none <1 ms inside `gather` until then.
* `reader_position` needs the widget/reader to send the paragraph id; until then anchors come from `quoted_words`
  (`fetch.phrase close`) and `state.given` / `previous_evidence` (read directly; `fetch.thread` dropped, plan §2).
* `search.originals` exists only for Persian/Arabic; elsewhere returns none at once.
* `mentions_only` does not retry wider (scope widens only in E2, on none). Measure s_nodirect rate; if high, the fix is a better
  in-scope tier (hype phrasing, collection), not widening.

---

## 2. comparison — C-compare (C1; C2, C3 as settings)

**name** `comparison` · **type** `C-compare`

**card:** The reader wants two or more traditions, concepts, works or schools set side by side — how each treats something, or
how they differ as wholes. Anís reads each side separately in its own scripture, then states what is shared and what differs,
fairly to each.

**difference — argued against "understanding with ≥2 religions in scope":** comparison stays its own task. (1) It DELIVERS the
relation (shared/different) in a `sides` shape, which understanding never does. (2) It retrieves per side (fan-out partition),
so a rich shelf cannot crowd a thin one out of a ranked union. (3) Scope cannot signal it: `religions_specified` is carried
across turns, so in a Buddhist–Christian conversation "what about grace?" has two religions in scope and still wants understanding
(a union answer); and "Jesus said X — is there such in the Writings?" may want a comparison with scope set to the second side only.
Scope says WHERE; the strategy says WHAT. Sides default to `state.scope.religions_specified`, so the tree holds no tradition logic.
**C2 → setting_of**: sides are concepts/works/schools (`compare_sides`); with no `topic`, default axes. **C3 → setting_of**:
`religions_specified = all`; only the template's many-sides block differs.

**near_misses**
| text | goes_to | why |
|---|---|---|
| "Rodwell vs Pickthall on the first súrih" | versions | two renderings of one text |
| "the Gospels and the Qur'án contradict each other on the crucifixion, don't they?" | e1 | an objection, not a survey |
| "chart of the founders of the world religions with dates" | f4 | a visual/table product |
| "what do Buddhists say about grace?" (mid interfaith conversation) | understanding | one tradition asked |
| "the golden rule in every religion, originals too" | compilation | compilation job with originals |

**ideal answer per mode**
* voice: one framing sentence · 1–2 spoken sentences per side · one sentence shared/different · offer to send; many sides → the pattern + 3 examples.
* widget: frame · one quoted line per side, linked · one line shared/different.
* site: a section per side in its own terms (1–2 passages) · shared/different; table when ≥2 sides × ≥3 points (150–250).
* email: sections with passages in full, originals beside where held, then shared/different (≤ ~600).
* research: each side as a full understanding answer, then a shared/different analysis (500–900).

**shapes** `sides` (2–4 sides as sections; >4 as survey lines + pattern) · `absence` · `unavailable`.

**needs**
| unit | required | default |
|---|---|---|
| `compare_sides` (NEW) | optional | = `state.scope.religions_specified` (C3: `all` = every tradition held). One side named + "is there such…" → the other side = `state.thread` last turn's tradition |
| `topic` | optional | none → default axes by side kind (traditions/schools: ultimate reality · scripture · path · afterlife · founder; concepts: definition · source text · who teaches it · how it is lived; works: origin · content · standing · central teaching) |
| `quoted_words` | optional | none (anchors its own side) |
| scope units, `channel`, `depth` | implicit | layer chain |

**state reads/writes:** reads `state.scope.religions_specified` (the sides), `state.thread` (implied second side),
`state.given` (each sub-tree skips repeats). Writes `given`, `thread`, `open` (each thin side as "X on {{topic}}"),
`offers` ("go deeper on one axis / one side").

**the TREE** (4 working nodes + shared ends)

| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| stage | `ui.stage` | "Reading each side in its own scripture…" | — | emitted → fan |
| fan | `search.fanout` | by: `compare_sides`; inner: `hand.strategy{name: understanding, upto: evidence, religions_specified: [side], k: sides ≤ 4 ? 3 : 1}` | `compare_sides`, `topic`, `quoted_words` → `found_passages`[side], `missing`[side] | all · some_thin → rank · all_none → $absence · error → $fallback |
| rank | `rank` | by: authority within side; sides in the reader's order; >4 sides drop empty sides; ≤4 keep them (template says thin) | `found_passages` → `found_passages` | done → s_sides · NEW empty → $absence |
| s_sides | `shape` | `comparison.sides` | — | done → $end |
| $absence | shared end | `hand.strategy e2` → `tpl.absence` | writes `missing` | done → $end |
| $fallback | shared end: `fallback.agent` | — | → `found_passages` (labelled) | answered → s_sides · fail → $unavailable |
| $unavailable | shared end: `tpl.unavailable` | `found_outcome` | done → $end |

```
stage → fan ─all/some_thin→ rank ─done→ s_sides → $end
          │                   └─empty→ $absence → $end
          ├─all_none→ $absence → $end
          └─error→ $fallback ─answered→ s_sides · fail→ $unavailable → $end
```

**paths**
* clean hit: fan(all) → rank → s_sides
* several: each sub-tree ranks its own hits; rank keeps k per side → s_sides
* thin: fan(some_thin) → rank keeps the thin side → s_sides ("the library holds little from X on this"; → `state.open`)
* none after all tiers: every sub-tree ran `upto: evidence` (no sub-tree reaches E2) → fan(all_none) → $absence, so E2 runs once for the whole comparison
* error: fan(error = every branch errored) → $fallback → s_sides | $unavailable; a partial error counts as some_thin, noted in `missing`
* conflicting sources: inside a side, the sub-tree's conflict verdicts travel with that side's passages; the template
  attributes them. Disagreement BETWEEN sides is the content, not a conflict.

**templates**
```
comparison.sides   (overrides tpl.sides)
base: First line frames the comparison of {{compare_sides}} on {{topic}} neutrally. One section per side, each in its own
  terms and its own scripture's words, quoted and linked; no side described in another's vocabulary. Equal treatment = same
  structure per side, not equal word counts. A thin side says so. Then "Shared" and "Different", each point tied to a cited
  passage. Never rank the traditions. {{scope_clause}}
  [no topic] Table of 4–6 axis rows, a source on every row, then one paragraph; offer to go deeper on one axis (→ state.offers).
  [sides > 4] Survey: one quoted line per side that has a real passage (sides without one are counted in one line, not
  listed), then the pattern across them.
  [quoted_words] Quote it on its side first, then the other side's closest teaching.
voice: frame · 1–2 spoken sentences per side (many: pattern + 3 examples) · shared/different in one sentence · offer to send.
widget: frame · one quoted line per side, linked · one line shared/different.
site: sections, or a table when ≥ 2 sides × ≥ 3 points.
email: sections with passages in full; originals beside where held [originals].
```

**target_time** ≤12 s, first words ≤2 s (stage at 0 s); branches parallel → one understanding sub-tree + ~0.3 s.
**measures** judge score (incl. fairness: each side in its own scripture) · p50 ms · $/answer (watch `all` = 12 sub-trees) ·
branch · thin-side % · sides with ≥1 real passage when the shelf holds them (C3 ≥5 traditions) · absence · fallback.
**tests (new)**
1. "How do Judaism and Islam each treat dietary law?"
2. "What's the difference between nirvana and moksha?"
3. "Does every religion have a flood story?"
4. "Theravada and Mahayana: how do they differ?"
5. "Christ said to love your enemies. Is there a parallel in the Qur'án?"

**must_not**
1. "Is the NIV or the ESV closer to the Greek?" → versions
2. "Islam copied the Bible, didn't it?" → e1
3. "What does Shinto teach about purity?" → understanding

**open issues**
* `all` = 12 sub-trees each with a `judge.passages`: measure $ and p95; if too high, sides >4 use inner
  `search.shelf{authority: scripture, k: 2}` + one merged `judge.passages` (needs an inner chosen by side count).
* `fetch.collection` (prepared cross-tradition collections) would short-circuit C3; to build — none until then.
* Default axes are a fixed list per side kind; revisit after 100 judged C2 answers.

---

## 3. story — B-narrate (B4)

**name** `story` · **type** `B-narrate`

**card:** The reader wants to know what happened — the story or background of an event, an episode in someone's life, a
movement's spread, or the occasion of a writing. Anís tells it in order, dated, each event cited to its historical source, and
says where accounts differ.

**difference:** the only strategy that orders events in time with a source on each: understanding explains, person gives a
record card, versions sets two accounts against each other.

**near_misses**
| text | goes_to | why |
|---|---|---|
| "who was Quddús?" | person | a record, not an episode |
| "a timeline chart of the Báb's ministry" | f4 | visual product |
| "compare Nabíl's and Shoghi Effendi's accounts of Badasht" | versions | accounts set against each other |
| "why do Bahá'ís have a Nineteen Day Feast?" | understanding (why) | a reason, not past events |
| "the whole history of Buddhism, in depth" | f5 / hand.job | too large for a live answer |

**ideal answer per mode**
* voice: the arc in one sentence · 3–4 spoken events with years and sources named · offer to send the full account (≤120 words).
* widget: arc in one line · 3–5 dated events, linked, main source named (~150).
* site: arc · dated events in order, each cited · one line where accounts differ; dated list when ≥3 dates (150–250).
* email: full narrative, key eye-witness/authoritative passages quoted, every event cited, differing accounts set out (≤ ~600).
* research: full narrative with context before/after, every account weighed in authority order (500–900).

**shapes** `sequence` (≥3 dates; <3 → short narrative block) · `absence` · `unavailable`.

**needs**
| unit | required | default |
|---|---|---|
| `topic` | required | the event/episode/movement (period folded in: "Tahirih in Qazvín"); default `state.subjects.topic` |
| `named_work` | optional | none; set when the subject is a writing's background |
| `named_person` | optional | `state.subjects.named_person` |
| scope units, `channel`, `depth` | implicit | layer chain |

**state reads/writes:** reads `state.subjects` ("what happened next?" continues `topic`), `state.thread` (the last story's
period → next segment), `state.given`. Writes `given`, `thread`, `open` (events found without a source/date), `offers` (the
two-account comparison from story.differ → a "yes" routes to versions).

**the TREE** (9 working nodes + shared ends)

| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| stage | `ui.stage` | "Gathering the accounts…" | — | emitted → gather |
| gather | NEW `search.together` | NEW `fetch.events`; `fetch.work_notes` (if `named_work`); `search.shelf{authority: scripture, k: 3}`; `search.shelf{authority: history, k: 8}` | `topic`, `named_person`, `named_work` → `found_passages`, `found_records`[events] | one · several · thin → rank · none · error → web |
| web | `search.web` | labelled | `topic` → `found_passages`[web] | one · none → rank · error → $fallback |
| rank | `rank` | by: date, then authority (Writings → Guardian → House of Justice → contemporary chronicle → scholarship) | `found_passages`, `found_records` → ordered | done → around · NEW empty → $absence |
| around | `read.around` | — | → context | done → trace |
| trace | `read.source` | — | → primary | traced · kept → judge |
| judge | `judge.passages` | answers = tells the event · conflict = accounts differ on a fact/date | → verdict | answers → s_story · conflict → s_differ · mentions_only → $absence |
| s_story | `shape` | `story.sequence` | — | done → $end |
| s_differ | `shape` | `story.differ` | — | done → $end |
| $absence | shared end | `hand.strategy e2` → `tpl.absence` (nearest = the mentions) | writes `missing` | done → $end |
| $fallback | shared end: `fallback.agent` | — | → `found_passages` (labelled) | answered → s_story · fail → $unavailable |
| $unavailable | shared end: `tpl.unavailable` | `found_outcome` | done → $end |

```
stage → gather ─one/several/thin→ rank ─done→ around → trace → judge ─answers──────→ s_story → $end
          │                         └─empty→ $absence (E2)          ├─conflict─────→ s_differ → $end
          └─none/error→ web ─one/none→ rank                         └─mentions_only→ $absence (E2)
                          └─error→ $fallback ─answered→ s_story · fail→ $unavailable
```

**paths**
* clean hit: stage → gather(several) → rank(date) → around → trace → judge(answers) → s_story
* several: rank by date, most authoritative account per event → s_story
* thin: gather(thin) → rank → … → judge(answers) → s_story short narrative, missing named (→ `state.open`); or mentions_only → $absence
* none after all tiers: gather(none) → web(none) → rank(empty) → $absence
* error: gather(error) → web(error) → $fallback → s_story | $unavailable
* conflicting sources: judge(conflict) → s_differ, + offer of the two-account comparison (versions) in `state.offers`

**templates**
```
story.sequence   (overrides tpl.sequence)
base: First sentence: the arc of {{topic}} in one line (who, what, when, where). Then events in date order, each with its date
  (or "about") and its source named and linked; quote an eye-witness or authoritative line where it carries the moment, never
  clipped. Writings and the Guardian's account outrank chronicles; chronicles outrank scholarship (labelled). {{scope_clause}}
  [< 3 dates] a short narrative paragraph instead of a list. [web] outside facts labelled "(from the web, not the library)".
  [named_work] lead with the occasion and recipient from the catalogue, then the events around it.
voice: arc · 3–4 events with years, sources spoken · offer to send the full account.
widget: arc · 3–5 dated events, linked.
site: dated list when ≥ 3 dates; one line on differing accounts.
email: full narrative; key passages in full.

story.differ
base: As story.sequence; at each point where accounts differ, give each account attributed and in authority order, without
  deciding unless an authoritative source does. Last line offers the two accounts side by side (→ state.offers).
```

**target_time** ≤12 s, first words ≤2 s.
**measures** judge score vs agent + Perplexity · p50 ms · $/answer · branch · events with a source % · events with a date % ·
accounts-differ rate · web-used rate by scope · absence · fallback.
**tests (new)**
1. "How did the Bahá'í Faith first reach Japan?"
2. "Tell me what happened when the Israelites left Egypt."
3. "What was the background to the Tablet of Carmel?"
4. "How did Buddhism come to Tibet?"
5. "What happened to Ṭáhirih in Qazvín?"

**must_not**
1. "Who was Ṭáhirih?" → person
2. "Draw me a timeline of the Heroic Age" → f4
3. "Do Nabíl and Balyuzi tell the Síyáh-Chál story differently?" → versions

**open issues**
* `fetch.events` (dated claims from the entity graph) to build — `dated_events` in the old tiers does not exist under
  `api/lib`. Until then it returns none and the history shelf + `rank(by: date)` (dates read from passage text) carry it.
* `authority: history` must be defined per tradition (catalogue marking); until marked, `authority: history` falls back to any authority inside the scope (no widening).
* Tablet background needs occasion/recipient in `fetch.work_notes` (Phelps inventory); until then the history shelf.

---

## 4. person — B-identify (B5)

**name** `person` · **type** `B-identify`

**card:** The reader wants to know who someone is or was — a figure of any tradition, named in any form or script. Anís says
who they were in two sentences, gives key dates, quotes what the Writings or scriptures say about them, and links their
biography page.

**difference:** the only strategy that resolves a name to one bearer and returns a record + passages about them: story
narrates events, a6 defines terms (including titles), a3 lists passages on a topic.

**near_misses**
| text | goes_to | why |
|---|---|---|
| "what happened on Mullá Ḥusayn's journey to Shíráz?" | story | an episode |
| "what does 'Bahá' mean?" | a6 | a word, though it names a person |
| "find every passage where Bahá'u'lláh mentions Navváb" | a3 | the passages are the product |
| "Mulla Hosein" (bare, first turn) | h2 → person | bare names are routed by h2 |
| "who is Kali?" | a6 as a concept · person as a figure | Jev decides from the conversation |

**ideal answer per mode**
* voice: two spoken sentences · a key date · one short line from the Writings about them · offer to send more.
* widget: two sentences · key dates · one quoted passage about them · biography link.
* site: two sentences · key dates · 1–3 passages about them in authority order · biography link.
* email: as site, passages in full, originals beside where held.
* research: extended record, significant passages grouped by period, link to the story.

**shapes** `record` · `absence` · `unavailable`.

**needs**
| unit | required | default |
|---|---|---|
| `named_person` | required (name forms; + bearer choice) | `state.subjects.named_person` ("and his son?" resolves from it) |
| scope units | implicit — exact person lookup RANKS bearers by scope, does not filter (Method note 5) | layer chain |
| `channel`, `depth` | implicit | — |

**state reads/writes:** reads `state.subjects.named_person`, `state.offers` ("the other one" → the alternative bearers offered
last turn), `state.given`. Writes `subjects.named_person` (the resolved bearer — code at tree end), `given`, `thread`,
`offers` (other bearers, when the prominent default was used), `open` (no record).

**the TREE** (7 working nodes + shared ends)

| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| person | `fetch.person` | name forms; scope ranks bearers | `named_person` → `found_records`[bearers] | one → about · several → pick · none · error → byname |
| pick | `judge` | q: "Which bearer does the reader mean?"; options: `context` (conversation, state or reader card points to one) · `prominent` (nothing does: take the most prominent, offer the others) | `found_records`, `state.subjects`, `state.offers`, `previous_conversation_rounds` → `named_person` | context · prominent → about |
| about | `search.shelf` | authority: `authority_floor` (scripture first); q: person id + name forms; k: 3 | `named_person` → `found_passages` | one · several · thin · none · error → rank |
| byname | NEW `search.together` | `search.shelf{authority: any, q: name forms}`; `search.hype{q: "who was {{named_person}}"}`; `scope: rank` (a named person is ranked, never filtered) | `named_person` → `found_passages` (`out_of_scope` marked) | one · several · thin · none → rank · error → $fallback |
| rank | `rank` | by: authority, k: 3; record first; date mismatch record vs passage → flags `conflict` on the passage (code) | → ordered | done → around · NEW empty → $absence |
| around | `read.around` | — | → context | done → s_record |
| s_record | `shape` | `person.record` | — | done → $end |
| $absence | shared end | `hand.strategy e2` → `tpl.absence` | writes `missing` | done → $end |
| $fallback | shared end: `fallback.agent` | — | → `found_passages` (labelled) | answered → s_record · fail → $unavailable |
| $unavailable | shared end: `tpl.unavailable` | `found_outcome` | done → $end |

```
person ─one→ about ─(any)→ rank ─done→ around → s_record → $end
   ├─several→ pick ─context/prominent→ about     └─empty→ $absence → $end
   └─none/error→ byname ─hits/none→ rank
                   └─error→ $fallback ─answered→ s_record · fail→ $unavailable → $end
```

**paths**
* clean hit: person(one) → about(several) → rank → around → s_record
* several bearers: person(several) → pick(context|prominent) → about → … → s_record (prominent → others offered, `state.offers`)
* thin: about(thin|none) → rank (record alone) → s_record: two sentences + dates, "the Writings say little about them directly"
* none after all tiers: person(none) → byname(none) → rank(empty) → $absence
* error: person(error) → byname(error) → $fallback → s_record | $unavailable
* conflicting sources: rank flags record-vs-passage date conflict → person.record gives both, the Writings first
* not in records (another tradition's figure): person(none) → byname(hits; `out_of_scope` marked when outside the scope) → rank → s_record from passages

**templates**
```
person.record   (overrides tpl.record)
base: Two sentences: who {{named_person}} was (role, tradition, era) — the record's words, not invented. Key dates (birth,
  death, defining events), each sourced. Then 1–3 passages ABOUT them, Writings/scripture first, quoted and linked. Link
  the biography page when one exists. {{scope_clause}}
  [prominent default] Closing line: "There are others of this name: X (role), Y (role) — did you mean one of them?" (→ state.offers)
  [no record] Build the two sentences from the passages; say the library has no biography record.
  [conflict] Both dates/facts attributed; the Writings over the record.
voice: two spoken sentences · one date · one short line about them · offer to send more.
widget: two sentences · dates · one passage · biography link.
email: passages in full; originals beside where held [originals]; a name given in script carries its transliteration.
```

**target_time** ≤3 s (no stage line).
**measures** judge score · p50 ms · $/answer · right bearer % on an ambiguous-name set · record hit rate · passages-about hit
rate · E2-widened % · absence · fallback · follow-up resolution % ("the other one" resolved from `state.offers`).
**tests (new)**
1. "Who was Mírzá Abu'l-Faḍl?"
2. "Tell me about Martha Root."
3. "Who is Ananda in the Buddhist scriptures?"
4. "Siyyid Kázim, who was he?"
5. "who was Vahid" (two prominent bearers; Jev picks from context)

**must_not**
1. "What happened at Fort Ṭabarsí?" → story
2. "What does 'Abhá' mean?" → a6
3. "List the passages about Navváb" → a3

**open issues**
* Non-Bahá'í figures (Rumi, Ananda) have no biography record; byname builds the record from passages — measured separately.
* `prominent` needs a stated basis inside `fetch.person` (corpus mention count).
* No `read.source` here (passages about a person come from primary works); add `trace` before `around` if `about` starts
  returning secondary copies.

---

## 5. versions — C-versions (C4)

**name** `versions` · **type** `C-versions`

**card:** The reader wants two renderings of the same text, or two accounts of the same event, weighed — which translation is
best or authoritative, or how two accounts differ. Anís sets the matching passages side by side on the points that differ and
says which carries authority and why, never retranslating.

**difference:** the only strategy that ALIGNS versions of one text/event: comparison relates different traditions or concepts,
a7 shows one original beside its translation, story narrates one account. Not a setting of comparison: its sides are versions
of the same text, its retrieval is alignment, its verdict is about authority of rendering, not teaching.

**near_misses**
| text | goes_to | why |
|---|---|---|
| "show me the Arabic of the Tablet of Aḥmad" | a7 | one original, no weighing |
| "Zen vs Taoism" | comparison | not one text |
| "where can I get the Gleanings?" | a2 | finding a book |
| "what happened at Badasht?" | story | one story, accounts not weighed |

**ideal answer per mode**
* voice: one sentence verdict (which is authoritative, or none) and why · one difference spoken · offer to send the side-by-side.
* widget: verdict line · one aligned pair quoted, both linked.
* site: verdict · 2–4 aligned pairs on the points that differ (table when ≥3), translators named, reason sourced.
* email: verdict · aligned pairs in full · original beside where held · translators' own notes.
* research: plus each version's history (translator, date, approach) and guidance/scholarship on it, labelled.

**shapes** `side_by_side` (meaning differs / accounts disagree) · `verdict` (wording only, or decided from notes) · `absence` · `unavailable`.

**needs**
| unit | required | default |
|---|---|---|
| `named_work` | required (the text, or the event's main work) | `state.subjects.named_work` |
| `named_sources` | optional (the two translators / editions / accounts) | the versions held, top 3 by authority within scope |
| `scripture_reference` / `quoted_words` | optional (the passage) | the passages where versions differ most (`fetch.align` picks), else the opening |
| `topic` | optional (for accounts of an event) | `state.subjects.topic` |
| scope units, `channel`, `depth` | implicit | layer chain |

**state reads/writes:** reads `state.subjects.named_work`, `state.offers` (a "yes" to story.differ's offer arrives here with
topic + the two accounts), `state.given` (pairs already shown are not repeated; "next difference" continues). Writes `given`,
`thread`, `open` (versions not held / pairs not alignable), `offers` (the full side-by-side by email).

**the TREE** (8 working nodes + shared ends)

| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| stage | `ui.stage` | "Finding the versions…" | — | emitted → work |
| work | `fetch.work` | all editions/translations | `named_work`, `named_sources` → `found_records`[versions] | one · several → gather · none · error → web |
| gather | NEW `search.together` | NEW `fetch.align`; `fetch.work_notes` per version; `search.shelf{authority: guidance, q: "translation of {{named_work}}", k: 2}` | `found_records`, `scripture_reference`, `quoted_words`, `topic` → `found_passages`[pairs], `found_records`[notes] | one · several · thin → around · none → $absence · error → $fallback |
| around | `read.around` | — | → context | done → judge |
| judge | `judge` | q: "How do the aligned versions differ?"; options: `meaning` (a pair says something different, or accounts disagree on a fact) · `wording` (same sense, different words; or only notes/guidance decide) | `found_passages`, `current_user_question` → — | meaning → s_side · wording → s_verdict |
| s_side | `shape` | `versions.side_by_side` | — | done → $end |
| s_verdict | `shape` | `versions.verdict` | — | done → $end |
| web | `search.web` | labelled | `named_work` → `found_passages`[web] | one → s_verdict · none → $absence · error → $fallback |
| $absence | shared end | `hand.strategy e2` → `tpl.absence` (nearest = versions held) | writes `missing` | done → $end |
| $fallback | shared end: `fallback.agent` | — | → `found_passages` (labelled) | answered → s_verdict · fail → $unavailable |
| $unavailable | shared end: `tpl.unavailable` | `found_outcome` | done → $end |

```
stage → work ─one/several→ gather ─hits→ around → judge ─meaning→ s_side → $end
          │                  ├─none→ $absence          └─wording→ s_verdict → $end
          │                  └─error→ $fallback
          └─none/error→ web ─one→ s_verdict · none→ $absence · error→ $fallback ─answered→ s_verdict · fail→ $unavailable
```

**paths**
* clean hit: work(several) → gather(pairs + notes) → around → judge(meaning) → s_side
* several (>2 versions, "which is best"): work(several) → top 3 → gather → … → judge(wording) → s_verdict
* thin: gather(thin: one version held, few pairs) → around → judge → shape says what could not be aligned (→ `state.open`)
* none after all tiers: work(none) → web(none) → $absence; or gather(none) → $absence with versions held as nearest
* error: work(error) → web(error) → $fallback → s_verdict | $unavailable
* conflicting sources (accounts disagree): judge(meaning) → s_side, attributed in authority order

**templates**
```
versions.side_by_side   (overrides tpl.side_by_side)
base: First sentence: which version of {{named_work}} carries authority and why, from a source (Bahá'í texts: Shoghi
  Effendi's translation is the standard; others named as earlier or provisional. Other traditions: say no translation is
  authoritative and characterise each — literal, literary, devotional — from the translators' own notes or labelled
  scholarship). Then aligned pairs on the points that differ, each side quoted exactly and linked, translator named. Never
  offer a translation of your own; never adjudicate by retranslating. {{scope_clause}}
  [accounts] the accounts of {{topic}} attributed in authority order; state the differing fact; decide only if an
  authoritative source does.
voice: verdict sentence · one difference spoken · offer to send the side-by-side (→ state.offers).
widget: verdict · one aligned pair.
site: verdict · 2–4 pairs (table when ≥ 3) · translators named.
email: pairs in full; original beside when held (```bilingual) [originals]; translators' notes.

versions.verdict   (overrides tpl.verdict)
base: First sentence: the verdict (same sense, different wording · X is the authoritative rendering · no translation is
  authoritative; here is how they differ in approach). Then the evidence: one aligned pair as a sample, translators' notes,
  any guidance on translation. [web] outside-library comparison labelled "(from the web, not the library)" and which of
  these versions the library holds, linked.
```

**target_time** ≤12 s, first words ≤2 s.
**measures** judge score · p50 ms · $/answer · pairs aligned per answer · retranslation violations (must be 0: every quoted
rendering matches a held text) · branch · web-used rate · absence · fallback.
**tests (new)**
1. "Is Arberry's Qur'án closer to the Arabic than Yusuf Ali's?"
2. "How does Shoghi Effendi's Hidden Words differ from the earlier English version?"
3. "Which English Dhammapada should I read?"
4. "Do Nabíl and Balyuzi agree on what happened at the Báb's declaration?"
5. "Compare the two English versions of the Tablet of Aḥmad."

**must_not**
1. "Show me the Persian of the Seven Valleys" → a7
2. "Hinduism vs Buddhism on the self" → comparison
3. "Tell me the story of the Báb's declaration" → story

**open issues**
* `fetch.align` is NEW: numbered texts align through the reference parser across editions, Bahá'í passages via
  rendering_lookup; **same-language alignment of two accounts or unnumbered translations has no tool**. Until built it returns
  thin with each version's shelf hits on the passage's key words, and the template says alignment is approximate.
* Translation authority outside the Bahá'í shelf rests on sparse `fetch.work_notes`; measure how often the verdict has no
  sourced reason.
* `named_sources` here doubles as a scope filter (search only these versions) and as the sides — intended, but see Method note 9.

---

## Method notes (proposed edits to §1 / §2 / §2a / §2b / §3)

1. **`rank` edge `empty` (§2).** Without it every tree routes "none after all tiers" separately per tier, and thin tiers that
   left passages behind can't be told from true emptiness without a code branch. With `empty`, every non-error outcome flows
   into one `rank` and absence is decided by state (`found_passages` after dropping `state.given`). Edit step 6: "route every
   non-error outcome into the evidence pipeline; `rank → empty` is the one road to ABSENCE."
    → **folded → §1 step 6, §2 `rank` (edge `empty`)**

2. **`search.parallel` (NEW, §2).** Step 10 says independent fetches run together in one element, but `search.fanout` only
   repeats one inner; nothing runs *different* elements together, and "teachings questions also search the originals" forces
   originals alongside the shelf. Proposed: `search.parallel{inners: [element+params]}`, edges one·several·thin·none·error on
   the merged `found_passages` (error only if every inner errored). Edit step 5: cheap code tiers (index, collection, shelf,
   originals) may run together; tiering is for cost (web, LLM, agent) and for widening.
    → **folded → §2 `search.together` (renamed from search.parallel), §1 steps 5 and 10**

3. **Absence vs error, and `tpl.unavailable` (§1 steps 6, 11; §3).** "error → next tier" leaves the last tier's error
   indistinguishable from "searched, nothing" → false "not in the library". Proposed: none → ABSENCE; error after the last
   tier → `fallback.agent`; agent `fail` → shared `tpl.unavailable`; agent `answered` goes through the tree's main `shape`
   (every answer via the writer). Also: engine-provided terminals `$absence`, `$agent`, `$unavailable` not counted against
   node limits — honest error handling otherwise costs every tree 3 identical nodes and researched trees hit 14.
    → **folded → §1 steps 6 and 11, §2 shared ends ($absence · $fallback · $unavailable, not counted), §3 `tpl.unavailable`**

4. **Widening rule now conflicts with §1 step 6 "thin → next tier".** §2b says a tree may widen only when the scoped search
   found NOTHING. So "thin → next tier" must read: "thin → the next IN-SCOPE tier, or answer with what there is and record
   `missing` (→ `state.open`)". Lowering `authority_floor` (adding scholarship) is also widening and needs the same rule —
   state it, or exempt it explicitly. All BC trees now widen only on none.
    → **folded → §1 step 6 (thin → next IN-SCOPE tier) and §2b (lowering the authority floor is widening too: only E2 does it)**

5. **Lookups rank, searches filter (§2b "scope binds every strategy").** Exact-index fetches (person, work, reference, phrase)
   must RANK by scope, not filter: in a Bahá'í-scoped conversation "who was Rumi?" or "which Dhammapada?" must still resolve,
   and such a hit sets `widened` so `{{scope_clause}}` says so. Lists (a3 etc.) do filter, as §2b's example says. Write the
   distinction into §2b.
    → **folded → §1 step 4, §2b (named things ranked, never filtered); rejected: setting `widened` on such a hit — it gets the item annotation `out_of_scope` (§2a); `widened` is E2's only**

6. **Fan-out partitions the scope (§2b "may only widen").** `search.fanout by: religions_specified` runs each branch with ONE
   tradition — a narrowing. Proposed wording: "a tree may widen the scope, or PARTITION it across fan-out branches (union =
   scope); it never narrows it otherwise." Also `hand.strategy` needs `stop_before: shape` (return evidence, don't write), and
   parallel Jev judges inside branches should count as ONE Jev round toward "≤2 before first words".
    → **folded → §2b (narrowing inside the scope is fine, incl. fan-out partition), §2 `hand.strategy{upto: evidence}` (was stop_before: shape), §1 step 7 (parallel judges = one round)**

7. **NEW units (§2a).**
   * `reader_position` — {work id, paragraph id} the reader has open; filled by code from the widget/reader page; not carried.
     Needed by B2; without it "this paragraph" can't anchor.
   * `question_frame` — what · why · meaning; filled by Jev in the strategy call; not carried. Needed by B3 as a setting
     (a template block needs a typed switch, not phrasing hidden in `topic`).
   * `compare_sides` — ordered [{kind: tradition|concept|work|school|person, id or text}]; filled by Jev, default
     `religions_specified`; carried as `state.subjects.sides` so "and Hinduism?" adds a side. Traditions-only sides would
     make C2 (nirvana vs moksha, Theravada vs Mahayana) impossible.
    → **folded → §2a (`reader_position`, `question_frame`, `compare_sides`)**

8. **Per-passage annotations are not units (§2a).** `judge.passages` verdicts, `read.around` context, `read.source` primary,
   rank conflict flags all live as fields ON `found_passages`. §2a should say elements may annotate found_* items with
   declared fields (verdict, context, primary, conflict, side), else every annotation becomes a new unit.
    → **folded → §2a (item annotations: verdict, context, primary, conflict, side, out_of_scope)**

9. **`named_sources` is both scope and request.** For versions it names the sides; for understanding ("in 'Abdu'l-Bahá's
   talks") it filters. As a carried scope unit, the two versions named in a C4 turn would silently filter the next, unrelated
   question. Proposed: Jev's patch marks named_sources `turn-only` when they name sides of a versions/comparison request.
    → **folded → §2a (`named_sources` carried column: turn-only when it names the sides of a comparison/versions request)**

10. **§2b follow-ups that need a field.** "the other one" (bearers) and "next difference" resolve only if `state.offers`
    stores the alternatives, not just "what". Proposed: `offers: [{what, turn, strategy, payload}]` — payload = the bearer ids
    / remaining aligned pairs, so a "yes" or "the other one" is a state patch + the same strategy, no re-search. Also define
    who writes `state.subjects` after a tree resolves a unit (person picks a bearer): code at tree end, not Jev next turn.
    → **folded → §2b (`offers: [{what, turn, strategy, units}]`; code writes `subjects` at tree end)**

11. **Scope clause needs code, not prose (§2b).** "Whenever an inherited scope filtered the answer, name it" requires the
    template to know (a) `scope_source` ≠ turn and (b) the filter actually removed something. Proposed: search elements set
    `filtered_out: n` (hits outside scope they dropped); code builds `{{scope_clause}}` only when `scope_source ∈
    {conversation, reader, host}` and `filtered_out > 0`, so a clean in-scope answer isn't cluttered.
    → **folded → §2 (search elements return `scope_excluded`, renamed from filtered_out) and §3 base `{{scope_clause}}` (site layer: only on a miss)**

12. **Authority order is Bahá'í-specific (§1 step 5).** Trees are written once for every tradition; state the generic ladder
    (scripture → authoritative interpretation → institutional guidance → reported sayings → scholarship, labelled) and let
    `rank(by: authority)` map each tradition's works onto it from catalogue metadata, Chad's Bahá'í order as the fixed mapping.
    Add `history` for story: Writings and the Guardian's account above chronicles, chronicles above later scholarship.
    → **folded → §1 step 5 (generic authority ladder, tradition mapping from catalogue) and §2 `rank by: authority|history`**

13. **Settings that change input or frame (§1 step 1).** "If one already does this task, answer setting_of and stop" leaves no
    way to express that B2's anchor or C2's axes change params/templates. Rule: a setting is admissible when the existing tree
    handles it through `needs` units and `{{unit}}` params/template blocks alone; if it needs new nodes, propose them as an
    edit to the existing tree (re-tested on its replay set), never a new strategy.
    → **folded → §1 step 1 (the own-task test: unique first search step or unique final shape; params/blocks/node edits to the existing tree are settings)**

14. **Smaller.** (a) `judge.passages` returns one edge for a SET: define precedence — conflict if two answering passages
    contradict, else answers if ≥1 answers, else mentions_only; this also settles B1's "who decides enough". (b) Define
    whether a `ui.stage` line counts as "first words". (c) `search_originals` should default true in code for every tradition
    with an originals index, not be a Jev guess. (d) §3 `sides` must say how it scales from 2 to 12 sides. (e) The class
    data's tiers name tools absent from §2 and code (`dated_events`, `resolve_name`, `term_in_passage`); give the designer
    prompt §2 names only. (f) §2 text still says `s.found` / `s.choice` / `s.note` — rename to `found_passages` / units /
    `missing` so the catalog and §2a agree. (g) `reads_arabic` / `reads_persian` (§3) are reader-card fields but are not in
    the §2a table; add them under `reader_card`'s type, and state who sets them (reader says so → premise path, never
    inferred from one Arabic word in a question). Templates then need the transliteration of every original word shown, so
    `fetch.renderings` must run after `rank` whenever originals will be quoted — today no BC tree has a node for it; either
    `read.around` fetches transliterations with context, or the writer's checker does (propose: read.around).
    → **folded → (a) §2 `judge.passages` precedence; (b) §1 step 7 (a progress line is not first words; a verdict line is); (c) §2a `search_originals` default; (d) §3 `sides` scaling; (e) §1 closing paragraph (§2 names only); (f) §2 (s.* names removed); (g) §2a `reads_scripts` + §3 base, §2 `read.around` fetches renderings**
