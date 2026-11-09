# Family F · G · H — make something, follow-ups, conversation

Written 11-09 by following `planning/anis-strategy-trees.md` §1 steps 1→12 literally, with the 11-09 additions: §2a context
units (`needs:`, node reads/writes, `{{unit}}` templates), §2b conversation state (scope · reader · subjects · thread · given ·
offers · open; layers turn > conversation > reader > site; "scope binds every strategy, lists included") and §3
"Original-language words". Classes: F1 compilation · F2–F6 · G1–G7 · H1 · H2.

**Verdicts (step 1).** 6 own strategies, 9 settings (G6 became a setting of `e1` at consolidation). With §2b most follow-ups are an existing strategy plus a state patch.

| class | verdict | strategy / host | state patch / units set |
|---|---|---|---|
| F1 | own | `compilation` | — |
| F2 | own | `devotional_program` | — |
| F3 | **setting_of** `compilation` | | output_form: handout · audience · named_sources (a work) |
| F4 | **setting_of** `story` (timeline); tables by content → `comparison` / `a1` | | output_form: timeline \| table |
| F5 | **setting_of** the content strategy (default `understanding`) | | depth: research |
| F6 | own | `teach_over_time` | — |
| G1 | **setting_of** `@previous` or the strategy now asked | | NEW referent ← state.given · "yes" → state.offers[n] accepted |
| G2 | **setting_of** `a4` (source, elsewhere) · `a7` (original) | | quoted_words ← state.given[referent] / previous_answer sentence |
| G3 | **setting_of** `a4` (exact words) · `a7` (original) | | as G2 |
| G4 | **setting_of** `a6` (a word) · `understanding` (an idea) | | term · quoted_words ← previous_evidence[referent] |
| G5 | **setting_of** `@previous` (scope change only) · `comparison` (relation asked) | | religions_specified patched (turn layer) |
| G6 | **setting_of** `e1` (consolidated 11-09; design below kept as reference) | | challenged_claim ← previous_answer · challenge_kind |
| G7 | own | `reshape` | reads previous_answer, previous_evidence; reader patches (language, audience, reads_scripts); no retrieval |
| H1 | own | `h1` (about Anís / the library) | — |
| H2 | own | `bare_fragment` | writes subjects + offers (the two directions) |

The step-1 rule used for every verdict (proposed in Method notes): **own task iff its first retrieval tier differs from every
neighbour's, or it ends in a shape no neighbour produces. If only the rendering, the scope, the depth, or where the words came
from (current_user_question vs conversation_state) differs, it is a setting.** G2 was an own tree in the first draft (first
tier = the earlier turn's evidence); §2b makes that evidence a code-filled unit (`previous_evidence`, `state.given`), so its
first tier is a4's and it became a setting.

**Conventions** (as family A, renamed to §2a units).
* Every fetch/search node reads the scope units implicitly (`religions_specified · authority_floor · named_sources ·
  search_originals`, resolved turn > conversation > reader > site, winner in `scope_source`); node tables list only the units a
  node reads beyond that. In the reads/writes column `→` separates reads from writes. Edge lists `a/b→x` mean each edge goes to x.
* Last-tier *error* → `ag` = shared end `$fallback` (fallback.agent, a logged defect; `answered` → the tree's main shape) →
  `un` = `$unavailable` (`tpl.unavailable`); last-tier *none* → `abs` = `$absence` (runs E2, DE file, with the tree's absence
  template as override). Shared ends are not counted in node totals. No tree names a tradition; no tree widens (only E2 does,
  plan §1 step 6). `hand.strategy` edges are the callee's full outcome set + error (found/thin · none · error).
* **Every thin or absent ending writes `missing`; code copies it to `state.open` at tree end.**
* Every template inherits two base rules, now written once in the plan's §3 base:
  * **scope clause** — `{{scope_clause}}`, shown when `scope_source ∈ {conversation, reader}` and `scope_excluded > 0`
    (site layer: only on a miss).
  * **original-language words** — every original-script word or passage shown carries its transliteration beside it unless
    its script is in `reader_card.reads_scripts`; the transliteration comes from CTAI or the library's own spelling,
    never improvised; with neither, script + meaning, no guessed romanization. Templates below that show originals:
    `compilation.grouped`, `devotional.program`, `pushback.*`, `reshape.form`, and the hosts of G2–G4 (a4, a7, a6).

**NEW elements**

| NEW | kind | wraps | used in |
|---|---|---|---|
| `switch` (from A) | code decision | one expression over units/ctx → case edge | F1, F2, G6, G7, H2 |
| `search.together` (from A) | tool/code | Promise.all over different retrieval elements; merged outcome | F2, H2 |
| `tpl.unavailable` (from A) | shape | "couldn't reach the library just now"; never claims absence | all |
| `hand.strategy.upto: evidence` (param, from A) | — | run the sub-tree to just before its web/shape nodes | F1, F6, G6, H2 |
| `plan.subthemes` | tool/llm (light generator) | `plan_subthemes` in today's compilation executor; done · fail | F1 |
| `fetch.calendar` | tool/code | Badí' calendar (to build): date ↔ Feast / Holy Day + month attribute; one · none · error | F2 |
| `fetch.activity` | tool/code | reader's reading plans (to build); one · none · error | F6 |
| `deliver.email` | tool/code | the letter sender, given found units + email mode; sent · no_address · error | G7 (and F1/F2 offers) |
| `shape.template: '@sub'` (param) | — | the template the sub-tree would have chosen + this strategy's block | H2 |
| `rank.group` / `rank.dedupe` (params) | — | group by a unit (sub_themes, religions_specified); drop the same passage met twice (best published kept) | F1, F2 |

**NEW units** (each a code task; listed again in Method notes)

| unit | type | filled by | default | carried |
|---|---|---|---|---|
| `amount_wanted` | {count \| 'all' \| minutes \| days} | Jev (strategy call) | the strategy's own | — |
| `delivery` | here · email · document | Jev (strategy call) | here | — |
| `sub_themes` | [short text] | `plan.subthemes` | [topic] | — |
| `reading_plan` | {work, position, cadence, portion, started} | `fetch.activity` (code) | none | reader layer |
| `plan_action` | propose · next · review · quiz · pause · stop | Jev | propose if no reading_plan, else next | — |
| `challenge_kind` | attribution · wording · support · reading · not_said | Jev (strategy call) | support | — |
| `about_what` | library · anis · greeting · personal | Jev (strategy call) | library | — |
| `referent` | [given item: passage ref \| work id \| person id] | Jev points (ordinal/description), code resolves in `state.given` | the last item quoted | — |

(`reader_card.reads_scripts` replaces reads_arabic/reads_persian; now in §2a's `reader_card` type — Method note 18.)

> **Consolidated 11-09** with the plan (A, BC, DE): every NEW element/unit above is now in the plan's §2/§2a. Applied here:
> F1's c8 authority widen removed (no tree widens); `abs`/`ag`/`un` are the shared ends; hand.strategy edges are the full
> outcome set; F4 hosts `story` (BC's name for B4); G6 is a setting of `e1` (DE file); node counts are working nodes;
> `reads_scripts`. Where this file still differs, the plan wins.

---

## F1 · `compilation` — Compile quotations

### 1. Name, type, card, difference
* **name** `compilation` · **type** `F-compile` · **setting_of** none (absorbs F3 as a setting).
* **description (card):** The reader wants a gathered collection of passages on a theme to keep, print, share or study —
  "compile", "gather", "quotes on…" with a number or "all", "everything on…", a handout for a class. Anís gathers exact,
  linked passages within the conversation's scope, groups them under sub-themes in authority order, and delivers a short one
  in chat or a long one as a job sent by email.
* **difference:** vs `a3` it plans sub-themes and builds a grouped collection meant to be kept (a3 runs inside it, once per
  sub-theme); vs `devotional_program` it is ordered by theme, not by an occasion. Own: its first step (plan.subthemes) and its
  shape (grouped collection) are its own.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| "two or three passages on patience" | a3 | a handful now, not a collection |
| "what do the Writings teach about justice?" | understanding | the teaching explained |
| "put together a devotional for the Feast of Light" | devotional_program | an occasion's program |
| "7 common misquotes of Jesus" | e2 | wants what is NOT in the text |
| "where does 'the earth is but one country' come from?" | a4 | one quotation to trace |

### 3. Ideal answer per mode
* **voice:** "I've gathered nine passages on detachment in three groups. The first, from the Hidden Words: '…'. Shall I send
  you the whole compilation by email?"
* **widget:** one line on what was gathered (scope named if inherited); sub-theme headings; the first passage quoted, the rest
  as linked titles; the email offer.
* **site:** ≤ 6 passages in full under headings, authority order, linked; if more were found, how many + email/document offer.
  Large requests: the plan and "it's on its way".
* **email:** the full compilation: one-line intro, headings, every passage in full, original beside English when held (with
  transliteration unless the reader reads the script), translator named, sources list, greeting and close.
* **research:** the job: more sub-themes, k per sub-theme doubled, originals searched, one source note per passage.

### 4. Shapes and needs
Shapes: `passages` (grouped) · `program` (handout) · `absence`.

| unit | required | default |
|---|---|---|
| `topic` | required | `state.subjects.topic`; if none, the one allowed question back ("on what theme?") |
| `religions_specified`, `authority_floor`, `search_originals` | scope | turn > conversation > reader > site — "all books on X" after "only Buddhism" stays Buddhist; "in every tradition" is a turn patch to `all` |
| `named_sources` | optional | [] (within one work → F3 handout) |
| NEW `amount_wanted` | optional | site 6 · email/job 12–20 |
| `output_form` | optional | compilation; `handout` (F3) |
| `audience` | optional | reader_card |
| NEW `delivery` | optional | here; the job emails when large |
| `reader_card.reads_scripts` | code | unset → transliterate |
| `depth`, `channel`, `reply_budget` | code/Jev | brief · widget |

**state reads/writes:** reads `scope`, `subjects.topic`, `given` (passages already quoted are kept — a compilation is for
keeping — but marked so the writer does not re-explain them). Writes `given` += quoted passages; `thread` += this turn;
`offers` += "email the full compilation" when not all was sent; `open` += sub-themes dropped as thin (`missing`).

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| c1 | NEW `switch` | queue if `!ctx.in_job && (amount_wanted > 8 \|\| 'all' \|\| depth = research \|\| delivery = email)` | amount_wanted, depth, delivery → — | queue→c2 · else→c4 |
| c2 | hand.job | kind: compilation (re-enters this tree with ctx.in_job; conversation_state.scope frozen) | all needs → offers | queued→c3 · error→c4 |
| c3 | shape | compilation.queued | topic, delivery → — | done→$end |
| c4 | fetch.collection | — | topic → found_passages | one→rk · thin/none/error→c5 |
| c5 | NEW `plan.subthemes` | n: 3–6 | topic, named_sources, found_passages → NEW sub_themes | done→c6 · fail→c6 (sub_themes = [topic]) |
| c6 | ui.stage | "the plan: {{sub_themes}}" | sub_themes → — | emitted→c7 |
| c7 | search.fanout | by: sub_themes; inner: hand.strategy{a3, upto: evidence, k: 4} | sub_themes → found_passages, missing | all/some_thin→rk · all_none/error→sw |
| sw | NEW `switch` | have · errored · nothing | found_passages, found_outcome → — | have→rk · errored→ag · nothing→abs |
| rk | rank | by: authority; group: sub_themes (religions_specified when it holds ≥ 2 and the request is per tradition); dedupe; k: amount_wanted | found_passages → found_passages | done→o |
| o | shape | compilation.grouped (allow: compilation, handout) | found_passages, sub_themes, missing, scope_source, reader_card → — | done→$end |
| abs | `$absence` (shared end) | E2 with template: bare.absence | current_user_question, missing → — | done→$end |
| ag | `$fallback` (shared end) | — | — | answered→st · fail→un |
| un | `$unavailable` (shared end) | tpl.unavailable | — | done→$end |

10 working nodes. 0 Jev decisions here (each a3 brings ≤ 2, in parallel — one round). One light LLM (c5). a3 `upto: evidence` already ranks,
traces and reads around.

```
c1 ─queue→ c2 ─queued→ c3[queued]
 │           └error──┐
 └else──────────────→ c4 ─one───────────────────────────────────→ rk → o[grouped]
                       └thin/none/error→ c5 → c6 → c7 ─all─────────→ rk
                                                      ├some_thin────────────────→ rk
                                                      └all_none/error→ sw ─have→ rk
                                                                           ├nothing→ abs ($absence, E2)
                                                                           └errored→ ag ─answered→ o ; fail→ un
```

Paths: **clean** c4(one: a prepared/published compilation)→rk→o · **several** c4(none)→c5→c6→c7(all)→rk→o · **thin**
c7(some_thin)→rk→o; an empty sub-theme is dropped, named, and goes to `state.open` · **none after all tiers** c7(all_none)→sw(nothing)→abs · **error**
c2(error)→c4 (the live version, says the full one could not be queued); c7(error)→sw→ag→un · **conflicting** a3 marks
conflict in a sub-theme → rk keeps both → o shows them together, attributed.

### 6. Templates
* `compilation.grouped` — "A compilation on {{topic}}. One sentence: what it gathers and from which sources (+ the scope
  clause when inherited). One heading per item of {{sub_themes}}; under each, {{found_passages}} in authority order (the
  Writings, the Guardian, the House of Justice, then others labelled: pilgrim note, scholarship). Quote every passage in full
  — never clip; the citation text is the link; translator named when not Shoghi Effendi; provisional translations named; a
  Persian/Arabic passage with no authorized translation shown in the original and labelled, never translated, with its
  transliteration unless {{reader_card}} reads the script. At most one framing line per section. Conflicting passages sit
  together, attributed, not reconciled. If {{missing}}, name the dropped sub-themes in
  one line. If a published compilation on this theme exists, name and link it first."
  * voice: "Say how many passages in how many groups; read the strongest (≤ 2 whole sentences) with a spoken citation; offer
    the email."
  * widget: "Headings as a list; only the first passage quoted; the rest linked titles; the email offer."
  * site: "At most 6 passages in full; if more were found say how many and offer the email/document."
  * email: "Greeting; every passage in full; original beside English (```bilingual) when held; sources list; close."
  * variant `handout` (F3): "Within one work ({{named_sources}}) keep the work's order with paragraph numbers. After each
    section one line on how it connects to the previous one. End with 3–5 discussion questions answerable from these passages
    alone. Vocabulary for {{audience}}. Title it as a handout."
* `compilation.queued` — "One sentence: what is being compiled ({{topic}}, {{religions_specified}} named), that it takes a few
  minutes, and where it will arrive ({{delivery}}). No passages yet." · voice: "One sentence; ask for the address if none."
* `compilation.absence` — over `tpl.absence`: "Nothing gathers on {{topic}} within {{religions_specified}} (scope clause if
  inherited — the reader may widen); nearest passages labelled nearest; offer the research job by email."

### 7. Speed, measures, tests
* **target_time** live (≤ 8 passages) ≤ 12 s, first words ≤ 2 s (c6); job: minutes, emailed.
* **measures** judge score · p50 live / job duration · $ · branch (collection / planned / absence / queued) ·
  sub-themes dropped · dedupe rate · authority mix · inherited-scope share (`scope_source` ≠ turn) · fallback rate.
* **tests:** "Can you gather what the Writings say about the station of the mother?" · "Put together twelve passages on
  trustworthiness I can print for our study circle" · "A compilation on the oneness of religion, Bahá'u'lláh and 'Abdu'l-Bahá
  only" · (after "I only want Christian sources") "Now collect everything on forgiveness" → Christian only, clause names it ·
  "Everything Shoghi Effendi wrote about the Lesser Peace, grouped please"
* **must_not:** "Give me one good quote on patience" (a3) · "Prepare a reading program for the Feast of Mulk"
  (devotional_program) · "Where does 'ye are the fruits of one tree' come from?" (a4)

### 8. Open issues
* `fetch.collection` to build: until then it finds only published compilations by title and usually returns none → c5.
* `plan.subthemes` is a generator, not a decision — §1 step 7 has no place for it (Method note 10).
* c8 is a no-op when `authority_floor` is already `any`: the engine returns c7's outcome.
* Document output (Claude Doc / OceanLibrary page / PDF) undecided: inline + email until then.
* The plan is shown as progress (c6), never put to the reader for approval.

---

## F2 · `devotional_program` — Devotional program

### 1. Name, type, card, difference
* **name** `devotional_program` · **type** `F-program` · **setting_of** none.
* **description (card):** The reader is preparing a gathering — a Feast, a Holy Day, a devotional, a memorial or funeral — and
  wants a program to read from. Anís knows the calendar, picks prayers for the occasion and readings on its theme, and orders
  them: opening prayer, readings with readers, closing prayer, each linked and in full.
* **difference:** vs `compilation` its first tier is the calendar and the occasion-keyed prayer index and its shape is a timed
  program in reading order; vs `prayer` it builds a whole gathering. Own.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| "a prayer for the departed" | prayer | one prayer |
| "compile passages on service" | compilation | a theme collection to keep |
| "when is the next Feast?" | a1 | a fact |
| "free Sikh funeral invitation template" | h1 (what Anís does) | a design template, not readings |
| "what happens at a Bahá'í Feast?" | understanding | explains the practice |

### 3. Ideal answer per mode
* **voice:** "For the Feast of Speech, a short program: open with …; four readings — …; close with …. Shall I email it with the
  full texts?" (titles, not texts).
* **widget:** the numbered program, each item linked with its first line; full texts by email.
* **site:** the numbered program, every prayer and reading in full (it is read aloud — never clipped), readers, ≈ minutes.
* **email:** printable: title, occasion and date, items in full, readers, sources.
* **research:** as email + one alternative per place in the program.

### 4. Shapes and needs
Shapes: `program` · `absence`.

| unit | required | default |
|---|---|---|
| `occasion` | optional | the next Feast / Holy Day by `fetch.calendar` (said in one line, others offered) |
| `topic` | optional | the occasion's theme (a Feast's month attribute, a Holy Day's event) |
| `religions_specified` | scope | inherited; several = an interfaith program drawing readings across them (no new strategy) |
| `audience` | optional | reader_card → mixed ages |
| NEW `amount_wanted` | optional | ≈ 20 minutes: opening prayer + 4 readings + closing prayer |
| `named_person` | optional | (a memorial: whom it honours — template only) |
| `reader_card.reads_scripts` | code | unset → transliterate (e.g. a prayer recited in Arabic) |
| `output_form` | — | program |

**state reads/writes:** reads `scope`, `subjects.topic`. Writes `given` += program items; `thread`; `offers` += "email the
printable program"; `open` += anything asked and not held (songs) from `missing`.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| d0 | ui.stage | "finding prayers and readings for {{occasion}}" | occasion → — | emitted→d1 |
| d1 | NEW `fetch.calendar` | occasion \| 'next' | occasion → found_records (date, theme) | one/none/error→d2 (none = not a calendar day: funeral, a theme) |
| d2 | NEW `search.together` | [fetch.prayer{role: opening}, hand.strategy{a3, upto: evidence, k: from amount_wanted}, fetch.prayer{role: closing}] | occasion, topic, found_records → found_passages | one/several→jp · thin/none/error→d3 |
| d3 | search.hype | shelf: prayer + scripture | topic → found_passages, missing | several/thin→jp · none/error→sw |
| sw | NEW `switch` | have · errored · nothing | found_passages, found_outcome → — | have→jp · errored→ag · nothing→abs |
| jp | judge.passages | does each reading fit the occasion/theme? | found_passages, topic → found_passages | answers/conflict/mentions_only→rk (mentions_only: theme framed loosely, noted) |
| rk | rank | by: occasion (opening · readings in authority order · closing); k from amount_wanted | found_passages, amount_wanted → found_passages | done→ra |
| ra | read.around | whole prayers, whole paragraphs | found_passages → found_passages | done→o |
| o | shape | devotional.program | found_passages, found_records, occasion, audience, missing, reader_card → — | done→$end |
| abs | shape | tpl.absence | topic, missing → — | done→$end |
| ag | fallback.agent | — | — | answered→$end · fail→un |
| un | shape | tpl.unavailable | — | done→$end |

9 working nodes. 1 Jev decision (jp).

```
d0 → d1 → d2 ─one/several──────────────→ jp ─*→ rk → ra → o[program]
           └thin/none/error→ d3 ─several/thin→ jp
                               └none/error→ sw ─have→ jp
                                               ├nothing→ abs
                                               └errored→ ag → $end | un
```

Paths: **clean** d1(one: Feast of Qawl)→d2(several)→jp→rk→ra→o · **several** d2(several)→jp keeps what fits→rk takes k ·
**thin** d2(thin: no occasion prayer)→d3 (prayer shelf by theme)→jp→… · **none after all tiers** d2/d3(none)→sw→abs (only for
a scope with no prayers held) · **error** d1(error)→d2 (no date stated); d2(error)→d3; d3(error)→sw→ag→un · **conflicting**
n/a for a program (jp conflict → rk; both may be read, attributed).

### 6. Templates
* `devotional.program` — "A program for {{occasion}} (the date from {{found_records}} when the calendar gave one; never a guessed
  date). One line: its theme. Numbered items in reading order — opening prayer, readings, closing prayer — each with its
  reader, its linked title or first line, and the full text; never clip a prayer or reading. A prayer meant to be recited in
  Arabic or Persian: script with transliteration (unless {{reader_card}} reads it) and the published translation. For a Bahá'í
  funeral the Prayer for the Dead goes in its place with its one-line instruction. Vocabulary and length for {{audience}}. If
  {{missing}} names something not held (songs), say so in one line and mark where one fits. Estimated minutes at the end.
  Scope clause when inherited."
  * voice: "Items in order by title and author only, total minutes, offer the email."
  * widget: "Numbered list, first line of each item linked; full texts by email."
  * email: "Printable: title block, items in full, readers in bold, sources list."

### 7. Speed, measures, tests
* **target_time** ≤ 12 s, first words ≤ 2 s (d0). (The class card says "minutes"; a 6-item program needs no job.)
* **measures** judge score · p50 · $ · branch (calendar / theme only / hype / absence) · occasion-prayer hit rate · fallback rate.
* **tests:** "Can you make a devotional program for Ayyám-i-Há with the children reading?" · "We're hosting a devotional on
  service next Friday — prayers and readings for about 30 minutes" · "What should we read at the Feast this week?" · "Put
  together a memorial gathering for my grandmother" · "An interfaith devotional on gratitude with Christian, Muslim and Bahá'í
  readings"
* **must_not:** "A prayer for someone who has passed away" (prayer) · "Compile passages on service" (compilation) · "When is
  the next Feast?" (a1)

### 8. Open issues
* `fetch.calendar` to build (Badí' dates computable; Twin Holy Birthdays need the published lunar table). Until then: none →
  the theme only, never a date.
* `fetch.prayer` occasion index to build: until then it behaves as `search.hype{shelf: prayer}`.

---

## F3 · Study session → **setting_of `compilation`**

* **Verdict:** retrieval is the compilation's (passages on a topic, often within one work); only the rendering differs
  (connections + discussion questions, handout). Format and audience are settings (§1 step 1). Method stops at step 1.
* **sets:** `output_form: handout` · `audience` (study circle · class · children; default study circle) · `named_sources` (the
  work) · `amount_wanted` default 6.
* **near_misses:** "hidden words worksheet pdf" → a2 (may want the book) · "explain the Íqán's teaching on return" →
  understanding · "help me read the Íqán this month" → teach_over_time.
* **tests (must reach compilation, output_form handout):** "I'm leading a study class on the Covenant next week — prepare
  readings and questions?" · "A handout on consultation for a junior youth group" · "Prepare a study session on the Seven
  Valleys' valley of search" · "GCSE revision sheet: key Sikh teachings on equality, with quotes" · "Ten discussion questions
  on the Tao Te Ching chapter on water, with the passages". **must_not:** "Explain the valley of search" (understanding) ·
  "Quiz me on what I read yesterday" (teach_over_time) · "Give me the Seven Valleys" (a2).
* **host_needs:** a3 searching within `named_sources` (one work); the `handout` variant (written in F1 §6).

---

## F4 · Timeline, table, map → **setting_of `story`** (timelines); tables by content

* **Verdict:** a timeline is the `sequence` shape rendered dated — a format. Tables follow their content: one row per tradition
  ("dietary cheat sheet by religion") → `comparison` with `output_form: table`, rows = `religions_specified`; a list of facts
  ("a table of Bahá'í shrines and temples") → `a1` with `output_form: table`. Maps: not held → the host's absence, nearest = the
  table. "Make that a table" about the previous answer → G7 reshape.
* **sets:** `output_form: timeline | table | map`.
* **near_misses:** "jainism god photo" → h1 (images not held) · "tell me the story of the Báb's last days" → story, prose.
* **tests:** "Make me a timeline of 'Abdu'l-Bahá's journeys to the West" · "A table of the Holy Days with their dates and what
  they mark" · "Chart the dietary rules of Judaism, Islam and Hinduism side by side" · "A chronology of the Báb's ministry, with
  sources" · "Timeline of the Guardian's ministry". **must_not:** "When did 'Abdu'l-Bahá arrive in New York?" (a1) · "Tell me
  about the Báb" (b5) · "Make the last answer a table" (reshape).
* **host_needs:** timeline/table render per mode in story, comparison and a1 (voice: 3–5 dated events spoken). Dated-events index
  to build; until then story's own tiers supply dates.

---

## F5 · Research brief → **setting_of the content strategy at `depth: research`** (default `understanding`)

* **Verdict:** depth is Jev's choice and a unit (`depth`), not a strategy. The host is whatever the content is — understanding,
  comparison, story; "trace 'Most Great Justice' across 'Abdu'l-Bahá's talks" = a3 with `named_sources` = his talks.
* **sets:** `depth: research` · `delivery: email`.
* **near_misses:** "confucianism extended essay ideas" → understanding, brief · "compile everything on justice" → compilation.
* **tests:** "Write me a short report on how Isfahán's clerics responded to the Báb, with sources" · "A comparative analysis of
  euthanasia across the major religions" · "Research how the Guardian described the Administrative Order's evolution" · "Trace
  'Most Great Justice' across 'Abdu'l-Bahá's talks" · "An essay-length answer on science and religion in the Bahá'í writings".
  **must_not:** "What is the Bahá'í view of science and religion?" (understanding, brief) · "Compile passages on science and
  religion" (compilation) · "Who were the Letters of the Living?" (b5).
* **host_needs:** a depth = research tail in every host (live → `hand.job{deep_report}` + email offer) — better once in the
  engine (Method note 9).

---

## F6 · `teach_over_time` — Teach me over time

### 1. Name, type, card, difference
* **name** `teach_over_time` · **type** `F-plan` · **setting_of** none.
* **description (card):** The reader wants Anís to accompany them over days or weeks — read a book with them, send a daily
  passage, continue where they stopped, quiz them on what they read. Anís proposes a plan the reader agrees to, then keeps it:
  remembers their place, sends the next portion, checks understanding gently.
* **difference:** the only strategy that creates or continues state across conversations (an activity, reader layer). Own.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| "what should I read first to learn about Daoism?" | a2 | one recommendation |
| "quiz me on chapter 2 of the Íqán" (no plan) | compilation (handout) | a one-off set of questions |
| "send this answer to my email" | reshape | one delivery |
| "is starting with the Zhuangzi a mistake?" | understanding | advice, answered once |

### 3. Ideal answer per mode
* **voice:** "I can send you a short portion of the Íqán each morning — about ten minutes, thirty days. Shall I start tomorrow?"
* **widget:** the plan in three lines + the first portion linked + "start?".
* **site:** the plan as a small table (week → portions) + the first portion in full + how to pause.
* **email:** the first portion in full, the plan, how replies work ("next", "review", "quiz me", "stop").
* **research:** n/a.

### 4. Shapes and needs
Shapes: `program` (the plan) · `one_passage` (a session) · `absence`.

| unit | required | default |
|---|---|---|
| `named_work` or `topic` | one required | `state.subjects.named_work` |
| NEW `reading_plan` | code (fetch.activity) | none |
| NEW `plan_action` | optional | propose if no reading_plan, else next |
| NEW `amount_wanted` | optional | daily, ≈ 10 minutes, cut at paragraph boundaries |
| NEW `delivery` | optional | email if the reader card has one, else here on return |
| `audience`, `reply_language`, `reader_card` | carried | reader_card |
| scope | inherited | (a topic plan reads only within it) |

**state reads/writes:** reads `subjects.named_work`, `scope`. Writes `thread`; `offers` += "start the plan?" (a "yes" next turn
accepts it — G1); the plan itself lives in the reader layer (activity store), never in conversation_state.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| t1 | NEW `fetch.activity` | — | reader_card → NEW reading_plan | one→t2 · none→t3 · error→un |
| t2 | hand.job | kind: study_plan, action: {{plan_action}} | reading_plan, plan_action → found_passages (the portion) | queued→ts · error→un |
| t3 | fetch.work | — | named_work → found_records | one→t4 · several→tr · none/error→t5 |
| tr | rank | by: copy (authoritative translation, reply_language first), k 1 | found_records → found_records | done→t4 |
| t4 | fetch.work_notes | structure: sections, length | found_records → found_records | one/none/error→t6 (none/error: portions by paragraphs) |
| t5 | hand.strategy | compilation, upto: evidence, k: 30 (a subject, not a work) | topic → found_passages | found/thin→t6 · none→abs · error→un |
| t6 | hand.job | kind: study_plan, action: propose | found_records/found_passages, amount_wanted, delivery → offers | queued→to · error→un |
| ts | shape | teach.session | found_passages, reading_plan, plan_action → — | done→$end |
| to | shape | teach.offer | found_records, amount_wanted, delivery → — | done→$end |
| abs | shape | tpl.absence | topic → missing | done→$end |
| un | shape | tpl.unavailable | — | done→$end |

9 working nodes. 0 Jev decisions (plan_action comes with the strategy call).

```
t1 ─one→ t2 ─queued→ ts[session] ; error→ un
 ├none→ t3 ─one→ t4 → t6 ─queued→ to[offer] ; error→ un
 │         ├several→ tr → t4
 │         └none/error→ t5 ─found/thin→ t6 ; none→ abs ; error→ un
 └error→ un
```

Paths: **clean** t1(none)→t3(one)→t4→t6→to · **several** t3(several translations)→tr→t4→… · **thin** t4(none)→t6 with
paragraph portions · **none after all tiers** t3(none)→t5(none)→abs · **error** t1(error)→un (never start a duplicate plan
when the existing one can't be read) · **conflicting** n/a · **continue** t1(one)→t2→ts.

### 6. Templates
* `teach.offer` — "Propose, don't start: {{named_work}} (italic title, linked), cadence and portion from {{amount_wanted}}, total
  length, first portion named, delivered by {{delivery}}. One line on how to pause or stop. Ask the one question: 'Shall I start
  tomorrow?'" · voice: "Two sentences and the question." · email: "Include the first portion in full."
* `teach.session` — "Today's portion of {{reading_plan}} in full (never clipped), linked, where it sits in the work; for
  {{plan_action}} = review a two-line recap first; = quiz: 2–3 gentle questions answerable from the last portion, answers on
  request." · voice: "At most two sentences read; offer the rest by email."

### 7. Speed, measures, tests
* **target_time** ≤ 3 s live; sessions on schedule.
* **measures** proposed → accepted · sessions sent → replied · drop-off by week · p50 · fallback rate.
* **tests:** "Could you send me a passage from Gleanings every morning?" · "I want to read the Kitáb-i-Aqdas over the next two
  months with you" · "Let's continue the Íqán where we left off" · "Quiz me on what I read yesterday" · "A week of daily readings
  on detachment, please"
* **must_not:** "What should I read first to learn about Daoism?" (a2) · "Quiz me on chapter 2 of the Íqán" with no plan
  (compilation, handout) · "Email me this answer" (reshape)

### 8. Open issues
* `fetch.activity` / `reading_plan` to build: until then always none → "continue where we left off" cannot be honoured;
  teach.offer says so plainly.
* `hand.job{study_plan}` is a kind name only: scheduler, consent record and stop path to build. No pause link in mails
  (back-off is enough); "stop" in a reply ends the plan.
* F6 is the door to activities (class open question): yes — an activity is a job with reader-layer state.

---

## G1 · Refer back / accept an offer → **setting_of `@previous`** or the strategy now asked

* **Verdict:** "the second one", "that passage", "ok and when did he travel to America?", "yes please" only point into the
  conversation. With §2b this is a state patch, not a task: Jev points (ordinal or description) and code resolves NEW
  `referent` in `state.given`; Jev chooses the strategy the reader now asks for (a1 for "when did he travel"), or with no new
  task the previous turn's strategy (`state.thread[-1].strategy`) on that item. "Yes please" = `state.offers[n]` accepted → the
  offered strategy/job with the units stored on the offer. Scope carries unchanged.
* **sets:** `referent` · `named_work`/`named_person`/`quoted_words` from the referent · or `offers[n].accepted`.
* **near_misses:** "this passage beginning with '…'" → a4 (carries its own text) · "what about in Islam?" → G5 · "who wrote
  that?" → G2 (a4).
* **tests:** "the third book — where can I read it?" (a2) · "and when was he born?" (a1, named_person ← subjects) · "yes, send
  it" (offers[0] → deliver/job) · "the second one, please" (after titles → a2) · "what did she write?" (after a person → b5).
  **must_not:** "Tell me about Táhirih" as a first turn (b5) · "Is that true?" (pushback_on_answer) · "Shorter please" (reshape).
* **host_needs:** `state.given` must hold every item a reply listed (works, people, passages), ordered per turn — today it
  holds passages only (Method note 3); `state.offers` must store the offered strategy + units so "yes" replays it.

---

## G2 · "Where is that from?" → **setting_of `a4`** (source · elsewhere) · **`a7`** (original)

* **Verdict:** the reply's evidence is already a code unit (`previous_evidence`, `state.given`), so "source?" is a4 with
  `quoted_words` filled from the referent passage (a ref: a4's exact phrase tier hits at once, then read.source/read.around).
  "Is it also in the Hidden Words?" = a4 occurrences. "The Arabic of that" = a7 on that passage. If the reply paraphrased with
  no ref, `quoted_words` = the sentence of `previous_answer` Jev marks, and a4 does a close match.
* **sets:** `referent` · `quoted_words` ← `state.given[referent]` or the marked sentence of `previous_answer`.
* **near_misses:** "that's wrong — it's a 1932 letter" → pushback_on_answer · "where does 'the earth is but one country' come
  from?" (words the reader brings) → a4 directly, no state · "show me the Arabic of the Hidden Words" (a work) → a7 · "tell me
  more about that passage" → understanding.
* **tests:** "Which book is that from?" · "Can you give me the paragraph for the second quote?" · "Is that Bahá'u'lláh or
  'Abdu'l-Bahá speaking?" · "Does that line also appear in Gleanings?" · "Where did you get that idea about the Lesser Peace?"
  (a paraphrase → close match). **must_not:** "Who wrote the Seven Valleys?" (a1) · "That isn't scripture, it's a letter of the
  Guardian" (pushback_on_answer) · "Find the source of 'love is a light…'" with no previous turn (a4 with no state patch).
* **host_needs (a4, a7):** accept a passage ref as `quoted_words` and skip the phrase search; a template clause read from
  `previous_answer`: if the earlier reply quoted a secondary copy → "I quoted it from X; its own source is Y"; if it paraphrased
  → say so before the verbatim words; if the traced author differs from what the reply said → the correction is the first
  sentence and the earlier turn is logged as a defect; a4 none → "I can't find a source for what I said; it should not be relied
  on" (writes `missing` → `state.open`). a7's original follows the §3 transliteration rule.

## G3 · Exact words → **setting_of `a4`** / **`a7`** (as G2)

* **Verdict:** "what are the actual words?", "I don't see the quote" → a4 on the referent with the verbatim passage as the
  answer; "the Persian of what you quoted" → a7. Same patch as G2.
* **tests:** "What are the exact words?" · "You said you'd show me the quote — I don't see it" · "Give me the original Persian of
  that line" · "Quote it, don't summarise it" · "Can I see the full passage you were drawing on?". **must_not:** "Find me the
  Persian of the Seven Valleys" (a7, no patch) · "Say it in Persian" (reshape) · "I read Persian, drop the transliteration"
  (reshape, reader patch).
* **host_needs:** as G2. "I don't see the quote" means the reply promised a quote it did not give → log as a defect of that turn.

## G4 · Go deeper → **setting_of `a6`** (a word) · **`understanding`** (an idea)

* **Verdict:** "what's the original word behind 'detachment' there?" = a6 with `term` and the referent passage from
  `previous_evidence` as `quoted_words` (context); "go deeper on that idea" = understanding with `state.subjects.topic`.
* **tests:** "What's the Arabic word behind 'detachment' in that passage?" · "You called it 'ontological' — what's the original
  term?" · "Go deeper on what he means by 'the station of the heart'" · "Is 'sovereignty' there the same word as in the Aqdas?" ·
  "Unpack that idea of 'return' a bit more". **must_not:** "Quote it exactly" (G3 → a4) · "Compare that with Buddhist
  non-attachment" (G5 → comparison) · "Shorter" (reshape).
* **host_needs (a6):** when `quoted_words` is set, start with `fetch.original` on that paragraph (the term in its original
  context) before renderings; the term shown per §3 (script + CTAI transliteration + root, unless the reader reads the script).

## G5 · "And in Islam?" → **setting_of `@previous`** (scope change only) · **`comparison`** (relation asked)

* **Verdict:** under the scope rule, never a new task.
  * "and in Islam?" / "same question for Judaism" → `state.thread[-1].strategy` re-run; turn patch
    `religions_specified → [Islam]`, `scope_source: turn`; topic/subjects unchanged.
  * "how does that compare with the Gita?" / "is this like Muhammad in the cave of Hira?" → `comparison` with
    `religions_specified = [previous_scope.religions_specified…, new]` and side A seeded from `previous_evidence` (only side B
    searched).
  * "in every tradition" → `religions_specified → all` (turn patch) on the previous strategy.
* **tests:** "And what does Islam say about this?" · "Is that like the Buddhist idea of emptiness?" · "How does that compare
  with what the Gospels say?" · "Same question for Judaism" · "Show me that across all traditions". **must_not:** "What about
  Islam?" as a first message (understanding, scope Islam) · "That's not what the Qur'an says" (pushback_on_answer) · "Where's
  that from?" (G2).
* **host_needs:** `comparison` (BC) accepts seeded sides from `previous_evidence`; `setting_of: "@previous"` in the §1 schema.

---

## G6 · Pushback on the answer → **setting_of `e1`** (consolidated 11-09)

> **Consolidation:** by the step-1 test (plan §1) G6's first search step (trace the evidence the earlier answer cited) and its
> final shapes (concede / show / tension / not there) are e1's, so G6 is a setting of `e1` (DE file), not its own task. e1
> took from here: the optional unit `challenge_kind` (e1's switch tests `not_said` first), the node `e15` (`pushback.not_said`)
> and G6's templates as e1 overrides: `pushback.correct` → e10, `pushback.stand` → e11, `pushback.retract` → the absence.
> The design below is kept as the reference for those templates; it is not a strategy row.

### 1. Name, type, card, difference
* **name** `pushback_on_answer` · **type** `G-audit` · **setting_of** `e1` (was: none).
* **description (card):** The reader says Anís's own last answer was wrong — misattributed, misquoted, unsupported, or only
  Anís's own reading. Anís checks what it actually said against the sources and either corrects itself plainly or shows the
  evidence that supports it, separating the text's own words from its summary.
* **difference:** vs `e1` (pushback on a teaching) it audits Anís's own claim and can end in a correction or retraction —
  shapes no neighbour has; vs G2 the reader disputes, not asks. Own.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| "isn't Bahá'í inheritance law unfair to women?" | e1 | challenges the teaching |
| "where's that quote from?" | G2 → a4 | asks, does not dispute |
| "you still haven't said where Maimonides sits" | @previous on `state.open` | incomplete, not wrong |
| "make it shorter" | reshape | form, not content |

### 3. Ideal answer per mode
* **voice:** "You're right — that's from a letter written on behalf of Shoghi Effendi in 1932, not from the Writings. I'm sorry
  for the error." (or: "That one is Bahá'u'lláh's own words — the Kitáb-i-Íqán, paragraph 214. Shall I send it?")
* **widget:** correction or confirmation first; the source linked; the passage verbatim.
* **site:** as widget + what the correction changes (the weight of scripture vs a letter on the Guardian's behalf vs a pilgrim
  note); conflicting sources each attributed.
* **email:** as site + original beside English.
* **research:** as site + other sources that bear on it.

### 4. Shapes and needs
Shapes: `verdict` · `one_passage` · `sides` (inside correct) · `absence` (inside retract).

| unit | required | default |
|---|---|---|
| `challenged_claim` | required | Jev marks it in previous_answer (the sentence the reader's words echo) |
| NEW `challenge_kind` | required | support (filled in the strategy call, so no judge node) |
| `previous_answer`, `previous_evidence` | code | — |
| `quoted_words` | optional | the reader's alternative ("it's from Questions and Answers", "the word is 'radiance'") |
| scope | inherited | `authority_floor` as carried |
| `reader_card` | code | (originals per §3) |

**state reads/writes:** reads `given` (the evidence behind the claim), `thread[-1]`. Writes `thread` (+ outcome
stand/correct/retract); a correct/retract marks the earlier turn's claim as defective (code, for the improvement cycle) and
patches `given` with the corrected attribution; retract writes `missing` → `state.open`.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| p1 | NEW `switch` | on challenge_kind | challenge_kind → — | attribution/wording→p3 · support/reading→p6 · not_said→ns |
| p3 | hand.strategy | a4, upto: evidence | challenged_claim, previous_evidence, quoted_words → found_passages | found/thin→p4 · none→rt · error→ag |
| p4 | NEW `switch` | holds if found author = claim author ∧ kind = claim kind ∧ (wording ⇒ verbatim) | found_passages, previous_answer → — | holds→st · else→co |
| p6 | search.shelf | q: the claim, k: 6 | challenged_claim → found_passages | one/several/thin→p7 · none→rt · error→ag |
| p7 | judge.passages | — | found_passages, challenged_claim → found_passages | answers→st · conflict→co · mentions_only→rt |
| st | shape | pushback.stand | found_passages, challenged_claim, reader_card → — | done→$end |
| co | shape | pushback.correct | found_passages, challenged_claim, previous_answer, reader_card → — | done→$end |
| rt | shape | pushback.retract | challenged_claim → missing | done→$end |
| ns | shape | pushback.not_said | previous_answer, challenged_claim → — | done→$end |
| ag | fallback.agent | — | — | answered→$end · fail→un |
| un | shape | tpl.unavailable | — | done→$end |

9 working nodes (reference only). ≤ 1 Jev decision before first words (p7); the dispute kind comes with the strategy call.

```
p1 ─attribution/wording→ p3 ─found→ p4 ─holds→ st ; else→ co
 │                          ├none→ rt
 │                          └error→ ag
 ├support/reading→ p6 ─one/several/thin→ p7 ─answers→ st ; conflict→ co ; mentions_only→ rt
 │                    ├none→ rt
 │                    └error→ ag → $end | un
 └not_said→ ns
```

Paths: **clean** p1(attribution)→p3(found)→p4(else)→co (the reader was right) · **several** previous_evidence has several
passages → challenged_claim picks the one; p3 traces it · **thin** p6(thin)→p7→st/rt · **none after all tiers** p3(none) or
p6(none)→rt · **error** p3/p6(error)→ag→un (never "no source" when the library was unreachable) · **conflicting**
p7(conflict)→co (we presented one side as settled).

### 6. Templates
* `pushback.stand` — "Acknowledge the challenge in one line, without defensiveness. Then the evidence: source of
  {{challenged_claim}} (author, work, paragraph — linked), the words verbatim, and what kind of text it is (the Writings / a
  letter written on behalf of the Guardian / a talk / a pilgrim note) with its date. If the reader is partly right, say which
  part first. For a `reading` challenge: quote the passage's own words and label the earlier summary as Anís's reading. A
  disputed original word: script with transliteration (unless {{reader_card}} reads it), from CTAI, never improvised."
* `pushback.correct` — "First sentence: the correction, plainly ('You're right: that is …, not …'). At most one short apology.
  Then the right attribution and the verbatim passage, linked, and what the correction changes about its weight. Conflicting
  sources: each attributed, authority order, and say the earlier answer overstated."
* `pushback.retract` — "Say plainly that you can't find a source for {{challenged_claim}} and it should not be relied on.
  Nearest passage labelled nearest, if any. Offer a wider search."
* `pushback.not_said` — "Quote what {{previous_answer}} actually said (verbatim), gently; then one line on the reader's concern
  or the offer of the strategy that answers it."
* voice (all four): "First sentence as above; the source in words; offer to send the passage."

### 7. Speed, measures, tests
* **target_time** ≤ 3 s (a4 path); ≤ 12 s with p6, first words ≤ 2 s.
* **measures** outcome mix (stand / correct / retract / not_said) · every correct/retract logged as a defect of the earlier turn
  · challenge_kind misroutes (Jev-miss loop) · judge score · p50 · fallback rate.
* **tests:** "That's not from the Aqdas, it's from Questions and Answers." · "You called this a prayer of Bahá'u'lláh but my
  prayer book says 'Abdu'l-Bahá." · "Isn't that just your interpretation of the passage?" · "I don't think that quote is
  accurate — the word is 'radiance', not 'light'." · "Where did you get the idea that the Guardian said that? I can't find it."
* **must_not:** "Isn't it unfair that inheritance is divided this way?" (e1) · "Where's that quote from?" (G2 → a4) · "Make it
  shorter" (reshape)

### 8. Open issues
* `challenged_claim` resolution depends on `previous_answer` keeping claim sentences aligned with `previous_evidence` refs
  (which sentence cites which passage) — to build; until then p3 traces the sentence's words.
* Removed by step 1: teaching disputes (→ e1) and "you still haven't said…" (→ @previous on `state.open`).

---

## G7 · `reshape` — Reshape the answer

### 1. Name, type, card, difference
* **name** `reshape` · **type** `G-reshape` · **setting_of** none.
* **description (card):** The reader wants the answer just given in another form — shorter, simpler, for children, as a list or
  table, in another language, without (or with) transliteration, or sent by email. Anís re-renders the same evidence without
  searching again; quotations stay verbatim; a preference the reader states (language, audience, "I read Arabic") is kept for
  the rest of the conversation.
* **difference:** the only strategy with no retrieval: it re-renders `previous_answer` + `previous_evidence`. Considered
  "@previous with output_form patched", rejected: re-running the previous strategy would search again (cost, and a different
  answer), and the language and email branches are its own. Own.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| "tell me more about the second point" | understanding / G4 | needs new evidence |
| "send me a passage every morning" | teach_over_time | a series |
| "translate the Tablet of Ahmad into Spanish" | a7 | a published translation of a work |
| "the second one" | G1 | a pointer, not a form |

### 3. Ideal answer per mode
* **voice:** the same answer spoken: shorter prose, ≤ 2-sentence quotes, offer to send.
* **widget / site:** the same evidence in the asked form.
* **email:** "Sent to c…@gmail.com — the answer on X with its three passages."
* **research:** n/a.

### 4. Shapes and needs
Shapes: the previous turn's shape, re-rendered.

| unit | required | default |
|---|---|---|
| `previous_answer`, `previous_evidence` | required (code) | — |
| `output_form` | optional | previous_answer.format |
| `depth` | optional | brief ("shorter") |
| `audience` | optional | reader_card ("for my kids" → children) |
| `reply_language` | optional | unchanged |
| `reader_card.reads_scripts` | optional (Jev patch from "I read Arabic") | [] → transliterate |
| NEW `delivery` | optional | here |

**state reads/writes:** reads `thread[-1]`. Writes `thread` (+ output_form); patches `reader.reply_language` /
`reader.audience` in conversation_state when the reader set them; `reads_scripts` goes to the reader card via
the memory path (§3 says they persist); `given` unchanged (no new passages).

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| r1 | NEW `switch` | has a previous answer | previous_answer → — | yes→r2 · none→nth |
| r2 | NEW `switch` | reply_language ≠ previous_answer language | reply_language, previous_answer → — | lang→r3 · same→r4 |
| r3 | fetch.original | direction: to {{reply_language}} — the passage's original if in that language, else a published translation | previous_evidence, reply_language → found_passages, missing | one/thin/none/error→r4 (the rest stay as they were, noted) |
| r4 | NEW `switch` | on delivery | delivery → — | email→r5 · here→o |
| r5 | NEW `deliver.email` | email mode | previous_answer, found_passages/previous_evidence, reader_card → — | sent→snt · no_address→ask · error→o (note: send failed) |
| o | shape | reshape.form | previous_answer, previous_evidence, found_passages, output_form, audience, depth, reader_card, missing → — | done→$end |
| snt | shape | reshape.sent | — | done→$end |
| ask | shape | reshape.ask_address | — | done→$end |
| nth | shape | reshape.nothing | — | done→$end |

9 working nodes. 0 Jev decisions. No search.

```
r1 ─yes→ r2 ─lang→ r3 ─*→ r4 ─email→ r5 ─sent→ snt ; no_address→ ask ; error→ o
 │          └same────────→ r4 └here→ o[form]
 └none→ nth
```

Paths: **clean** r1→r2(same)→r4(here)→o · **several** previous_answer is always the last turn (older ones → G1 referent) ·
**thin** r3(thin: some passages have no published version in that language)→o (kept as they were, said once) · **none after all
tiers** r1(none)→nth · **error** r3(error)→r4 (unchanged passages, noted); r5(error)→o with a one-line note · **conflicting** n/a.

### 6. Templates
* `reshape.form` — "Re-render {{previous_answer}} as {{output_form}} for {{audience}} at {{depth}} using ONLY its evidence: no
  new claims, no search. Quotations stay verbatim — never paraphrase or clip inside quotation marks; 'shorter' means fewer
  passages and less prose, never a cut passage. Prose in {{reply_language}}; each passage in its original if that is the
  language, else a published translation with the translator named; if neither exists ({{missing}}) keep it as it was and say
  once that no published translation is held — never translate a passage yourself. Arabic/Persian words: transliteration
  beside them unless {{reader_card}} reads the script (then the script alone); after 'I read Arabic' re-render the previous
  answer without transliteration, or if it had no Arabic, one line acknowledging it. 'Simpler / for children': plain words
  around the passages, the shortest complete passages." · voice: "Spoken style; ≤ 2 whole sentences quoted; offer the rest."
* `reshape.sent` — fixed text, no LLM: "Sent to {{masked email}}: {{one-line description}}."
* `reshape.ask_address` — "Ask for the address in one line (site: the sign-in link)."
* `reshape.nothing` — "There's no earlier answer here to reshape; ask what they'd like."

### 7. Speed, measures, tests
* **target_time** ≤ 3 s (≤ 1 s for sends).
* **measures** re-search rate (0) · quotation-changed rate (writer check, 0) · improvised-transliteration rate (0) · p50 · $ ·
  no-translation share by language.
* **tests:** "Can you say that more simply?" · "Put that in Persian please" · "I read Arabic — you don't need to transliterate"
  · "Email me that whole answer" · "Make that a table"
* **must_not:** "Tell me more about the second point" (understanding) · "Send me a daily passage by email" (teach_over_time) ·
  "Translate the Tablet of Ahmad into Spanish" (a7)

### 8. Open issues
* `deliver.email` to build: until then email requests reply "I can't send this one yet" (no pretending).
* A table of people/works needs the previous turn's `found_records`, but §2a carries only passages (`previous_evidence`) →
  Method note 4.
* The class has 0 real phrasings: add 20 reshape turns to the conversation runs.

---

## H1 · `h1` — About Anís or the library

### 1. Name, type, card, difference
* **name** `h1` · **type** `H-about` · **setting_of** none.
* **description (card):** The reader asks about Anís or the library itself — what Anís is, what it can do, which traditions and
  how many books it holds — or simply greets. Anís answers briefly with live numbers and offers two things to try.
* **difference:** the only strategy whose source is the library's own facts (fetch.facts), not its contents. Own.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| "do you have the Dhammapada?" | a2 | a specific book: give the copy |
| "free online sacred texts" | a2 | wants texts |
| "what happens after we die?" | understanding | a teaching |
| "how many tablets did Bahá'u'lláh reveal?" | a1 | a fact about the Writings |

### 3. Ideal answer per mode
* **voice:** "I'm Anís, the Ocean AI Research Assistant. I search a library of about N books across 12 traditions and quote them
  with their sources. You could ask me … or …"
* **widget:** 2–3 sentences with the numbers; two suggested questions.
* **site:** as widget + traditions with counts as a short list.
* **email:** as site, greeting and close. **research:** n/a.

### 4. Shapes and needs
Shape: `record` (about card). The facts describe the whole library (scope does not filter them); `host_site`'s collection first.

| unit | required | default |
|---|---|---|
| NEW `about_what` | optional | library |
| `host_site`, `reader_card`, `reply_language` | code / carried | — |

**state reads/writes:** reads `scope.religions_specified` (to choose the two suggestions). Writes `thread`; `offers` += the two
suggested questions (so "the first one" / "yes" resolves — G1). A greeting in Arabic/Persian script sets nothing by itself;
Jev may patch `reads_scripts` from it (§3: set from evidence).

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| f | fetch.facts | cached corpus status | — → found_records | one→o · error→o2 |
| o | shape | about.card | found_records, about_what, host_site → — | done→$end |
| o2 | shape | about.card, numbers: none | about_what, host_site → — | done→$end |

3 working nodes. 0 Jev decisions.

```
f ─one→ o[about.card] ; error→ o2[about.card, no numbers]
```

Paths: **clean** f(one)→o · **several/thin/none/conflicting** n/a (fetch.facts has one · error) · **error** f(error)→o2.

### 6. Templates
* `about.card` — "Short. Numbers only from {{found_records}} (documents, traditions, languages — as reported, rounded down,
  never estimated; none → no numbers). Identity: 'Anís, the Ocean AI Research Assistant of Ocean 2.0 (OceanLibrary.com)'; never
  name the hosting service. {{host_site}}'s collection first. Two concrete questions the reader could ask, chosen within
  {{religions_specified}}. Reply in {{reply_language}}." Blocks by {{about_what}}: library → traditions with counts; anis → what
  Anís does and doesn't (quotes with sources, no opinions of its own); greeting → one warm line + the two questions; personal
  ("why are you a Bahá'í?") → Anís is not a person and holds no faith; offer what the texts say about the question.
  * voice: "At most one number; no lists."

### 7. Speed, measures, tests
* **target_time** ≤ 1 s.
* **measures** numbers sourced from facts (100 %) · p50 · $ · share of next turns that take a suggestion.
* **tests:** "Hi Anís!" · "How many books are in your library, and in what languages?" · "Are you a person or a program?" · "Do
  you have Buddhist texts too?" · "Who made you and where do your answers come from?"
* **must_not:** "Do you have the Dhammapada?" (a2) · "What do Bahá'ís believe about the afterlife?" (understanding) · "Which is
  the oldest religion?" (a1)

### 8. Open issues
* fetch.facts must stay a cached production report (never the local DB).

---

## H2 · `bare_fragment` — Bare word or fragment

### 1. Name, type, card, difference
* **name** `bare_fragment` · **type** `H-orient` · **setting_of** none.
* **description (card):** The reader typed only a word, a name, a title or a short phrase, with no question. Anís works out what
  it most likely is — a book, a person, a term, a topic — from the library's indexes, answers that reading briefly and offers two
  other directions. A pasted sentence of five words or more is a quotation (a4), not this.
* **difference:** every other strategy starts from a known task; this one picks the likely task from index evidence and offers
  the others. Own.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| "Thus hath it been decided by Him Who is the All-Powerful, the Almighty." | a4 | a passage: ≥ 5 words |
| "Hi" | h1 | a greeting |
| "What does Ridván mean?" | a6 | a question with a task |
| "yes" / "the second" (after H2's offers) | G1 | resolves to state.offers |

### 3. Ideal answer per mode
* **voice:** "Ridván is the Bahá'í festival marking Bahá'u'lláh's declaration in 1863. Would you like the passages about it, or
  the story of those twelve days?"
* **widget / site:** 2–4 sentences (or the book link / one passage) + two suggested questions.
* **email:** as widget with greeting (rare). **research:** n/a.

### 4. Shapes and needs
Shapes: the resolved strategy's (`titles` · `record` · `one_passage`), short · `absence`.

| unit | required | default |
|---|---|---|
| `current_user_question` | required (the fragment) | — |
| scope | inherited — exact indexes RANK by it, they do not filter (a named title is the reader's explicit, turn-level request) | — |
| `reader_card`, `previous_conversation_rounds` | code | — |

**state reads/writes:** reads `subjects` (an earlier subject breaks ties). Writes `subjects.named_work | named_person | term |
topic` from the resolved reading; `offers` += the two directions; `given`; `open` += the fragment when absent. A fragment typed
in Arabic/Persian script is evidence for `reads_scripts` (Jev patch, §3).

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| b1 | NEW `search.together` | [fetch.work{exact}, fetch.person, fetch.renderings{exact}, fetch.phrase{exact, only if ≥ 5 words}] | current_user_question → found_records | one→sw · several→j · none/error→b5 |
| sw | NEW `switch` | on found_records[0].kind | found_records → named_work / named_person / term / quoted_words | work→b2 · person→b3 · term→b4 · passage→b6 |
| j | judge | "Which reading of {{current_user_question}} is most likely here?" work · person · term · topic · passage | found_records, previous_conversation_rounds, reader_card → the matching unit | work→b2 · person→b3 · term→b4 · topic→b5 · passage→b6 |
| b2 | hand.strategy | a2, upto: evidence | named_work → found_passages/found_records | found/thin→o · none/error→b5 |
| b3 | hand.strategy | b5, upto: evidence | named_person → found_records | found/thin→o · none/error→b5 |
| b4 | hand.strategy | a6, upto: evidence | term → found_records | found/thin→o · none/error→b5 |
| b6 | hand.strategy | a4, upto: evidence | quoted_words → found_passages | found/thin→o · none/error→b5 |
| b5 | hand.strategy | a3, upto: evidence, k: 2 | topic := current_user_question → found_passages, missing | found/thin→o · none→abs · error→$fallback |
| o | shape | template: '@sub' + bare.directions, size: short | found_passages, found_records, reader_card → offers | done→$end |
| abs | shape | bare.absence | current_user_question, missing → — | done→$end |

9 working nodes. ≤ 1 Jev decision (j); the callee's own Jev calls count (plan §1 step 7).

```
b1 ─one→ sw ─work→ b2 ; person→ b3 ; term→ b4 ; passage→ b6 ─found/thin→ o ; none/error→ b5
 ├several→ j ─(same five)→ b2/b3/b4/b5/b6
 └none/error→ b5 ─found→ o[short + two directions]
                 ├none→ abs ($absence, E2)
                 └error→ $fallback
```

Paths: **clean** b1(one: "Gleanings")→sw→b2→o · **several** b1(several: "Ridván" term + titles)→j(term)→b4→o · **thin**
b2/b3/b4 none→b5 · **none after all tiers** b1(none)→b5(none)→abs · **error** b1(error)→b5; b5(error)→$fallback→$unavailable ·
**conflicting** n/a (other readings become the offered directions).

### 6. Templates
* `bare.directions` (appended to the sub-strategy's template, size short) — "Answer the most likely reading in 2–4 sentences, or
  give the book link / the one passage. No preamble, never 'it seems you typed…'. A term shown in its original follows §3
  (transliteration from CTAI unless {{reader_card}} reads the script). Then exactly two other directions as short questions,
  from the other {{found_records}} or the next obvious tasks (the book · the person · passages about it · what the word means)."
  · voice: "End with 'Would you like A, or B?'"
* `bare.absence` — over `tpl.absence`: "Not found in the library (scope clause if an inherited scope applied); if an index offered
  a near spelling, ask 'Did you mean …?' — the one allowed question back."

### 7. Speed, measures, tests
* **target_time** ≤ 1 s when an index answers; ≤ 3 s otherwise.
* **measures** kind mix · Jev share (j) · direction taken next turn (via offers) · absence rate · p50 · passage share (→ ~0 once
  Jev sends ≥ 5-word pastes to a4).
* **tests:** "Ridván" · "Táhirih" · "Gleanings" · "karma and rebirth" · "the mashriq"
* **must_not:** "Thus hath it been decided by Him Who is the All-Powerful, the Almighty" (a4) · "Hi" (h1) · "What does Ridván
  mean?" (a6)

### 8. Open issues
* 302 of 455 historical H2s are pasted passages: Jev should send them to a4 directly; b6 stays as the safety net.
* `fetch.renderings{exact}` covers Bahá'í terms; other traditions' terms fall to b5 (topic).

---

## Method notes (proposed edits to §1 / §2 / §2a / §2b / §3)

1. **§1 step 1 needs a test, not "when in doubt".** Proposed: "Own task only if its FIRST retrieval tier differs from every
   neighbour's, or it ends in a shape no neighbour produces. If only the rendering (output_form, audience, depth), the scope,
   or where the words came from (current_user_question vs conversation_state) differs, it is a setting." Applied: 8 of 15 FGH
   classes are settings. The class list was built from phrasings, not tasks; with §2b, G collapses to state patches.
    → **folded → §1 step 1 (own-task test: unique first search step or unique final shape); applied: 9 of 15 classes are settings (G6 → e1 at consolidation)**
2. **`hand.strategy` must return the full outcome contract** (one · several · thin · none · error), not found · empty: with
   found · empty, G6 would route a4's *error* to "retract", claiming "no source" when the library was unreachable. Also define
   (a) `upto: evidence` (A's param), (b) that sub-trees inherit the scope units and record any widening in `widened` for the
   parent's template, (c) whether Jev decisions inside parallel sub-trees count toward step 7's "two before first words".
    → **folded → §2 hand.strategy (full outcome set + error edge, `upto: evidence`) and §1 step 7 (sub-tree Jev calls count; parallel sub-trees = one round); rejected (b): sub-trees never widen, so there is no `widened` to pass up (only E2 widens)**
3. **§2b `given` must hold items of every kind, ordered per turn** — works, people and facts a reply listed, not only passages
   — or "the second one" after a list of titles cannot resolve. `offers` must store `{strategy, units}` so "yes please" replays
   the offer exactly. Name the unit Jev's pointer resolves to: NEW `referent`.
    → **folded → §2b given (every item kind, ordered per turn), offers {what, turn, strategy, units}, and §2a `referent`**
4. **§2a carries only passages from the previous turn.** "Make it a table" of people or works needs the previous
   `found_records`: rename `previous_evidence` → `previous_found` {passages, records}, or add `previous_records`. `state.thread`
   holds no found data, so it cannot serve reshape.
    → **folded → §2a `previous_evidence` now carries {passages, records}**
5. **`fetch.thread` is superseded** by `previous_answer` / `previous_evidence` / `state.given` (code units, free). Drop it, or
   keep it only for turns older than the last (`referent` resolution can cover those). It also lacked an error edge.
    → **folded → §2 (fetch.thread dropped; previous_* units + state.given + referent cover it)**
6. **Base-template rules belong in §3 once**, not in every strategy's template: (a) the scope clause — "when `scope_source` ∈
   {conversation, reader, site} and `religions_specified` ≠ all, one clause names the filter and how to widen it"; (b) the
   original-language rule. Every F/G/H template here relies on both; writing them 15 times invites drift.
    → **folded → §3 base template (scope clause + scripts rule, once); rejected: the `scope_source ≠ turn` trigger — the clause shows on conversation/reader layer AND `scope_excluded > 0`, site layer only on a miss**
7. **Scope vs explicitly named things.** "Scope binds every strategy" conflicts with exact indexes: "Dhammapada" after "only
   Bahá'í" would vanish. Proposed: an explicitly named work, person or quoted words is a turn-layer fact and is not filtered by
   an inherited scope; exact-index elements RANK by scope, shelf/HyPE/originals searches FILTER. (H2's b1 relies on it.)
    → **folded → §1 step 4 and §2a scope units (named things are ranked by scope, never filtered; item annotation `out_of_scope`)**
8. **Two scope vocabularies in §2.** §2a/§2b say `religions_specified · authority_floor · named_sources · search_originals ·
   scope_source`; the older §2 paragraph says `s.scope = {traditions, authority, sources, languages, from}`, `widen:
   'traditions'`, `fanout by: 'scope.traditions'`, and "slots in s.choice / s.found / s.note". Replace it with the unit names
   (`widen: 'religions_specified' | 'authority_floor'`; found_passages, found_records, widened, missing).
    → **folded → §2 (old s.scope paragraph removed; §2a unit names only; `widen` is E2's param alone)**
9. **Jobs and depth.** F strategies run live (small) and as a job (large) with the same tree: `hand.job` re-enters the tree with
   `ctx.in_job` and a FROZEN copy of conversation_state.scope (the conversation may change scope before the job runs).
   Depth = research is the same tail for every host — do it once in the engine (live + depth research → `hand.job{deep_report}`
   with this strategy as the plan) rather than as a branch in every tree (F5).
    → **folded → §2 hand.job (frozen scope copy) and §1 step 9 (depth research = one engine tail, F5 is a setting)**
10. **Generators are not decisions.** Step 7 allows only Jev decisions and the final writer, but a compilation needs sub-themes
    generated (`plan.subthemes` → NEW unit `sub_themes`). Proposed: "A light-LLM GENERATOR element is allowed where its output
    is a list the tree fans out over and no index supplies it; it writes a declared unit and is measured per branch."
    → **folded → §1 step 7 (a light-LLM generator writing a declared fan-out unit is allowed, measured per branch) and §2 plan.subthemes**
11. **No code branch in §2** (also A's note): add `switch`. And step 4: a unit Jev fills in the strategy call is branched by
    `switch`, never by a second `judge`. Moving G6's dispute kind into the strategy call (NEW `challenge_kind`) saved a Jev call
    — §2a's cost rule should say a branching question belongs in the strategy call when the strategy always needs it.
    → **folded → §2 switch and §1 step 4 (a unit Jev fills in the strategy call is branched by switch, never a second judge); §2a challenge_kind**
12. **Steps 6 and 11 disagree on the last edge.** Proposed: "*none* everywhere → absence (honest, writes `missing` →
    state.open, may offer the research job). *error* at the last tier → fallback.agent (a defect) → `tpl.unavailable`." Add
    `unavailable` to §3, and give elements that consume found units an `empty` edge (F1/F2 each spend a `switch` telling empty
    from error).
    → **folded → §1 steps 6 and 11 (none → $absence via E2; error → $fallback → tpl.unavailable) and §3 `unavailable`**
13. **§3 mode lengths are prose lengths.** Site chat 150–250 words cannot hold a 6-passage compilation or a 20-minute program
    without clipping. Proposed: "Lengths count prose; passages are counted per mode (voice 1 spoken ≤ 2 sentences · widget 1 +
    titles · site ≤ 6 in full · email all)." `reply_budget` should carry this as `passages_max`.
    → **folded → §3 (lengths count prose; passages counted per mode; reply_budget.passages_max)**
14. **NEW units this family needed** (code tasks): `amount_wanted` (count | all | minutes | days — "nine quotes", "30 minutes",
    "every morning"), `delivery` (here | email | document), `sub_themes`, `reading_plan` (reader layer — §2b's layer table should
    list activity state there), `plan_action`, `challenge_kind`, `about_what`, `referent`. NEW elements: `fetch.calendar`,
    `fetch.activity`, `deliver.email`, `plan.subthemes`, plus A's `switch` / `search.together`.
    → **folded → §2a (amount_wanted, delivery, sub_themes, reading_plan, plan_action, challenge_kind, about_what, referent) and §2 (fetch.calendar, fetch.activity, deliver.email, plan.subthemes)**
15. **`state.open` needs a consumer.** Trees write `missing` → open, but nothing reads it: "you still haven't said where
    Maimonides sits" should resolve to `state.open[n]` the way "yes" resolves to offers. Add to §2b: Jev sees `open` and may
    choose "answer the open item" as a patch on the previous strategy.
    → **folded → §2b open (Jev sees open; 'answer the open item' = patch on the previous strategy)**
16. **Which turn requests become carried patches?** "In Persian" / "for my kids" should persist (`reader.reply_language`,
    `reader.audience`), but §2b doesn't say which turn-local requests become conversation patches. Proposed: any carried unit the
    reader sets explicitly is patched into the conversation layer.
    → **folded → §2b (a carried unit the reader sets explicitly is patched into the conversation layer)**
17. **§2b vs §3 on reader fields.** §2b: "the state never writes the reader card itself; the memory/premise path decides".
    §3: `reads_arabic`/`reads_persian` are "patched by Jev and stay in reader memory". Say which: proposed — Jev's patch lands in
    conversation_state.reader at once (this conversation re-renders without transliteration) and the memory path promotes it to
    the reader card; never set from one Arabic proper name inside an English question.
    → **folded → §2b (Jev's patch lands in conversation_state.reader at once; the memory path promotes it to the reader card; never from one proper name)**
18. **§2a should list `reads_arabic` / `reads_persian` in `reader_card`'s type**, and found units need a transliteration field
    per original word (`found_passages[].original.translit`, `found_records[].translit` from CTAI or the library), so the writer
    copies it instead of improvising — the template rule alone cannot stop invented romanizations; a writer check (any Arabic
    script without an adjacent data-sourced transliteration, when the reader does not read it) should be a free format check
    like md-valid.
    → **folded → §2a reader_card.reads_scripts and found units' translit fields; §5 (free writer check for untransliterated script)**
19. **Step 3 target times for F are per path, not per class.** "Minutes" fits F1-large and F6 scheduling; a 6-item program or
    compilation fits ≤ 12 s with a progress line.
    → **folded → §1 step 3 (target time per path: lookups ≤ 12 s with a progress line, large plans minutes as a job)**
