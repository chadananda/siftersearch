# Strategy trees — family D (practice and the heart) and E (challenge)

Written 11-09. Method: `planning/anis-strategy-trees.md`, applied literally:

* §1, steps 1→12
* §2 (elements)
* §2a (context units)
* §2b (conversation_state, its layers, and the rule that scope binds every strategy)

Strategies, in order: D1 d1 · D2 prayer · D3 d3 · D4 guidance · D5 d5 · E1 e1 · E2 e2 · E3 e3.

Elements are from §2 and units from §2a. Anything else is marked **NEW:** (element), **NEW unit:** or **(proposed
param/edge)**, and each one is justified in *Method notes*.

> **Consolidated 11-09** with the plan (A, BC, FGH): every NEW element/unit here is now in the plan's §2/§2a. Applied:
> `route` → `switch`; no tree widens (g1's authority widen removed; E2 is the only widening place, plan §1 step 6);
> absence shapes are the shared end `$absence` (runs E2, with the tree's template as override); `fallback.agent` is
> `$fallback` (`answered` → the tree's main shape, `fail` → `$unavailable` = `tpl.unavailable`, never an absence wording);
> `hand.strategy` edges are the full outcome set + error; node counts are working nodes; the scope clause and originals
> rule are written once in the plan's §3 base (`reads_scripts`); G6 is a setting of e1 (FGH file). The plan wins on any
> difference.

## Conventions used in every tree below

**Scope.**
* Every `fetch.*` and `search.*` node applies `state.scope` implicitly: `religions_specified`, `authority_floor`,
  `named_sources` and `search_originals`.
* Each field resolves turn > conversation_state > reader card > site profile > `all`, and the winning layer is
  `scope_source`. These scope reads are not repeated in the R column.
* A tree never hard-codes a tradition. A tradition-specific resource (prayer book, institution, fact sheet) is looked up by
  `religions_specified` in a keyed collection or a code table.
* No tree widens scope. Last-tier none → `$absence` → E2, the one place scope widens (E2's x2, `widen:`), and the reply
  says so (plan §1 step 6). Tier params (`authority: law`) narrow inside the scope (scope ∩ params).

**Two template rules apply to every template, so they are not repeated below.**
* **[scope clause].** Written once in the plan's §3 base: shown when `scope_source ∈ {conversation, reader}` and
  `scope_excluded > 0` (site layer: only on a miss); omitted when `reader_state ∈ {grieving, in crisis}` (Method note 9).
* **[widened line].** Only E2 sets `widened` (`e2.elsewhere` is the widened line).
* **[originals rule]** (§3 "Original-language words"). It applies wherever a template shows an original, a prayer's
  original, or an Arabic/Persian term.
  * It reads `reader_card.reads_scripts` (default []). Written once in the plan's §3 base.
  * **Script not in the list:** every original-script word carries its transliteration beside it, e.g. حکمت (*ḥikmat*). The
    transliteration comes from `found_passages`/`found_records`, meaning CTAI's `transliteration` or the library's own
    spelling in Shoghi Effendi's system. It is never improvised.
  * **No data transliteration:** show the script and its meaning, with no guessed romanization.
  * **Script in the list:** the script stands alone, with a gloss only where the sentence needs one.
  * Templates below mark this as `[originals rule]`.

**State.**
* **Repeats.** Every rank/shape step skips passages already in `state.given`. Exception: when the request resolves to a
  given passage ("that passage", "say that prayer again").
* **Follow-ups** resolve through Jev's state patch, before any tree runs:
  * "yes" goes to `state.offers`
  * "the second one" or "source?" goes to `state.given` and `state.thread`
* **At tree end, code writes:**
  * `given` += quoted passages
  * `thread` += this turn
  * `open` += `missing` when the tree ended thin or in absence
  * `offers` += any offer the template made, recorded with the strategy and units that would fulfil it (Method note 10)

**Outcomes.** Every fetch/search node writes `found_outcome`, and writes `missing` on none.
* `error` on a tier goes to the next tier.
* `error` on the LAST tier goes to `fallback.agent`, which is logged as a tree defect.
* `none` after the last tier goes to `$absence` (E2, with the tree's absence template as override). An honest absence is
  a correct answer.
* `$fallback` (`fallback.agent`): `answered →` the tree's main shape (every answer via the writer) · `fail → $unavailable`
  (`tpl.unavailable`, "I couldn't search the library just now"), never an absence wording.
* Shared ends `$absence` · `$fallback` · `$unavailable` are not counted in node totals.

**Jev count.** Jev decisions = every `judge`/`judge.passages` on the path, sub-trees included. The one strategy+state call
is not counted.

**`switch`** (plan §2; this file first called it `route`) (code).
* Params: `on` (a unit, or counts over `found_passages` by authority kind or tradition) and `cases`.
* Edges: the cases plus `else`.
* It reads only filled units and makes no Jev call.

**`stage:`** (proposed param). A slow node with `stage:` emits its progress line on live channels, without a separate
`ui.stage` node.

**Shorthand.** `fp` found_passages · `fr` found_records · `fo` found_outcome · `R → W` reads → writes.

---

## D1 · `d1` — Grief, fear, doubt

### 1. Identity
* **name** `d1` · **type** `D-comfort`
* **card** The reader speaks from their own life about a loss, a fear, loneliness or doubt. The answer is warm and brief:
  one or two passages from the reader's own tradition that speak to that loss or fear, and an offer of a prayer. Comfort,
  not a lesson.
* **difference** (vs `understanding` B1/B3):
  * B1 explains a teaching.
  * d1 gives a person in pain a passage to hold and a prayer.
  * d1 has a safety ending (reader_state `in crisis`) that no teaching strategy has.
  * **Verdict: own task.** Step 1 names comfort as a task, and its deliverable and safety ending are not B1's.

### 2. Near misses
| request | goes_to | why |
|---|---|---|
| "What happens to the soul after death in Hinduism?" | understanding (B1) | impersonal, wants the teaching |
| "Why does God allow suffering?" | understanding (B3) | asks the reason, no personal loss |
| "a prayer for my mother who passed away" | prayer (D2) | asks for the prayer itself |
| "Should I give up my faith to marry him?" | d5 | a membership decision |
| "What do the Writings say about grief?" | a3 | passages on a topic, not consolation |

### 3. Ideal answer per mode
* **voice**: one warm sentence in the reader's words, one short passage spoken, then "Would you like a prayer? I can send
  it to you." 40–80 words.
* **widget**: a warm line, one passage in full and linked, and a prayer offered by linked title. ≤ 120 words.
* **site**: a warm line, one or two passages in full and linked, then a prayer offered or one gentle question back.
  120–200 words, no headings or lists.
* **email**: greeting, two passages in full, the offered prayer in full, and the original beside the English when
  `reply_language` shows it. ≤ 400 words.
* **research**: same as site. Depth does not lengthen comfort. It may add "more to read" as linked titles.

### 4. Shapes, needs, state
Shapes: `comfort` · `comfort` (crisis variant) · `absence` (minimal: a warm line, no quote).

| needs (unit) | required? | default when empty |
|---|---|---|
| `current_user_question` | required | — |
| `topic` (what is grieved or feared, in the reader's words) | optional | `state.subjects.topic`, else "a hard time" → general key |
| `reader_state` | optional | `state.reader.reader_state`, else grieving. `in crisis` is set by Jev from the whole conversation, never from keywords |
| `religions_specified` | scope | state chain |
| `channel`, `reply_budget` | code | — |
| **NEW unit:** `locale` | optional | international help list |

**NEW unit:** `locale` — country code. Code fills it from the reader card, else request geo.

**state reads/writes**
* reads: `scope`, `reader.reader_state`, `subjects.topic`, `given` (never re-quote the passage that comforted them last
  turn).
* writes: `given`, `thread`.
* writes `offers` += {what: "a prayer", strategy: prayer, units: {occasion: topic}}. A "yes" then runs prayer without
  asking again.
* The crisis path writes `reader.reader_state = in crisis`, which carries until the conversation shows otherwise
  (Method note 10).

### 5. Tree
| id | element | params | R → W | edges → next |
|---|---|---|---|---|
| c1 | `switch` | on: reader_state | R reader_state | in crisis → c9 · else → c2 |
| c2 | fetch.collection | id: consolation (proposed param), key: topic | R topic → W fp, fo | one → c6 · thin → c3 · none → c3 · error → c3 |
| c3 | search.fanout | by: authority [scripture, interp, prayer]; inner: search.hype(shelf=authority); stage: "Finding words for this…" | R topic → W fp, fo | all → c4 · some_thin → c4 · all_none → c7 · error → c7 |
| c4 | judge.passages | — | R topic, fp → W fp | answers → c5 · conflict → c5 · mentions_only → c7 |
| c5 | rank | by: authority, k: 2 (conflict: keep the higher authority only) | R fp → W fp | done → c6 |
| c6 | read.around | — | R fp → W fp | done → c11 |
| c7 | hand.strategy | name: prayer (occasion ← topic), upto: evidence | R topic → W fp | found · thin → c11 · none → c8 · error → c8 |
| c8 | fetch.collection | id: consolation, key: default (a hand-checked fixed set per tradition) | → W fp, fo, missing | one → c11 · thin → c11 · none → $absence · error → $fallback |
| c9 | fetch.collection | id: crisis-help, key: locale | R locale → W fr | any → c10 (the template carries an international line) |
| c10 | shape | template: d1.crisis | R fr, fp | → $end |
| c11 | shape | template: d1.comfort | R topic, fp | → $end |
| $absence | shared end | E2 with template: d1.minimal | R fo | → $end |
| $fallback | shared end | — | — | answered → c11 · fail → $unavailable |

```
c1  switch(reader_state) ─in crisis→ c9 collection(crisis-help, locale) ─any→ c10 shape d1.crisis → $end
   └else→ c2 collection(consolation, topic) ─one→ c6 read.around → c11 shape d1.comfort → $end
             └thin|none|error→ c3 fanout hype[scripture,interp,prayer]
                    ─all|some_thin→ c4 judge.passages ─answers|conflict→ c5 rank(k2) → c6
                    │                         └mentions_only→ c7
                    └all_none|error→ c7 hand.strategy(prayer) ─found|thin→ c11
                                        └none|error→ c8 collection(consolation, default) ─one|thin→ c11
                                                             ├none→ $absence (E2; d1.minimal)
                                                             └error→ $fallback ─answered→ c11 · fail→ $unavailable
```

**Scope.**
* Never widened: a passage from another faith is not consolation for this reader.
* With scope `all` (anonymous reader, interfaith host), the consolation `all` key holds a short interfaith set. The reply
  shows at most two passages, each attributed to its tradition.

**Paths**
* **clean hit**: c1 → c2 one → c6 → c11. No Jev decision; under 1 s to the writer.
* **several**: c3 all → c4 → c5 (keep 2) → c6 → c11.
* **thin**: c2 thin → c3 → c4 → c5 → c6 → c11.
* **none after all tiers**: c3 all_none → c7 none → c8 → c11. With no fixed set → $absence (E2; d1.minimal, no invented quote).
* **error**: c2 → c3 → c7 → c8. c8 error → $fallback → (fail) $unavailable.
* **conflicting sources**: c4 conflict → c5 keeps the higher authority only. Disputes belong to B1 if the reader asks.
* **Jev decisions**: c4, plus prayer's p3 = 2.

### 6. Templates
`d1.comfort` (overrides `tpl.comfort`)
```
base: Speak to the person. First sentence: one warm line naming {{topic}} in the reader's own words — no formula. Then
  {{found_passages}} (1–2) in full, linked, author named; with religions_specified = all, each attributed to its
  tradition. No doctrine beyond the passage; never "you should"; no lists or headings. Close with a prayer offered by
  linked title, or one gentle question back. No scope clause.
voice: 40–80 words; one passage ≤ 2 sentences (choose a short one, never clip); "Would you like a prayer? I can send it
  to you."
widget: ≤ 120 words, one passage.   site: 120–200 words.
email: up to two passages and the offered prayer in full; original beside English per reply_language, under the
  [originals rule]. ≤ 400 words.
```
`d1.crisis`
```
base: FIRST sentence is the real help: the line from {{found_records}} for {{locale}} (else the international line),
  plainly and kindly. Then one short passage of hope, linked. Then "I'm here if you want to keep talking." No list, no
  argument, no scope clause.
voice: help line first, spoken slowly, twice.   email: help line is the subject and first line.
```
`d1.minimal`
```
base: One warm line. If {{found_outcome}} shows an error: "I couldn't reach the library just now" — never "nothing was
  found". Offer to try again; one gentle question back. No quotation.
```

### 7. Time, measures, tests
* **target_time**:
  * collection path ≤ 3 s
  * otherwise ≤ 8 s, first words ≤ 2 s
  * crisis path ≤ 1 s
* **measures**:
  * judge score, with warmth and fit scored separately
  * p50 ms, $/answer, the branch taken
  * `in crisis` rate, audited weekly
  * fallback rate
  * words against `reply_budget`
  * the share of offers accepted
* **tests (new)**:
  * "my dad died last week and I keep wondering if he can see me"
  * "I feel like God stopped listening to me"
  * "our baby was stillborn — where is she now?"
  * "I'm terrified of dying"
  * "since the divorce I feel completely alone"
* **must_not**:
  * "what do Buddhists believe about rebirth?" (B1)
  * "prayer for the departed" (D2)
  * "why does God allow suffering?" (B3)

### 8. Open issues
* **Consolation collection and fixed default set, keyed by tradition × topic (to build; chosen by a person, never
  generated).**
  * Until it exists, c2 and c8 return none. Everything takes c3 → c7, and if prayer is empty, the minimal reply.
* **Crisis lines per country (to build, with an owner and a review date).** Until then, the international line.
* **Jev's `reader_state` option text** must describe crisis signs across the conversation.

---

## D2 · `prayer` — A prayer for an occasion

### 1. Identity
* **name** `prayer` · **type** `D-pray`
* **card** The reader wants a prayer to say, in whichever tradition is in scope. It may be for an occasion, a need or a
  person (healing, the departed, protection, children, marriage, tests, morning, the Fast), or a prayer known by name or
  by its opening words. The answer gives one complete prayer, linked, with two alternatives by title.
* **difference** (vs `a3` passages, `a4` quotation trace):
  * prayer returns a whole text to recite, chosen by occasion and never excerpted, from its own index.
  * A Psalm, a du'á and a Bahá'í prayer are one task in different scopes.
  * **Verdict: own task.**

### 2. Near misses
| request | goes_to | why |
|---|---|---|
| "Bahá'í prayer book" / "the Book of Common Prayer" | a2 | the book |
| "how often must I pray salat?" | d3 | a rule about prayer |
| "plan a devotional gathering on service" | f2 | a program |
| "who wrote the Tablet of Ahmad?" | a1 | a fact about a prayer |
| "my mother just died and I can't stop crying" | d1 | comfort first; d1 offers a prayer |

### 3. Ideal answer per mode
* **voice**: "Here is a prayer for healing by Bahá'u'lláh:" / "Here is Psalm 121:", then the shortest fitting prayer,
  spoken in full. Then "I can send you two others."
* **widget**: the prayer in full, linked and attributed, plus one alternative by title.
* **site**: one framing line, the prayer in full and linked, and two alternatives by linked title.
* **email**: the prayer in full, with the original beside the English when held, and two alternatives in full.
* **research**: as site, plus the prayer's origin (`fetch.work_notes`) when known.

### 4. Shapes, needs, state
Shapes: `one_passage` (`prayer.one`) · `prayer.near` · `absence` (the tradition's prayer book).

| needs (unit) | required? | default when empty |
|---|---|---|
| `occasion` | optional | from `state.reader.reader_state` (grieving → the departed; in crisis → tests and difficulties), else "general" |
| `named_work` (a prayer known by name) | optional | none |
| `quoted_words` (opening words) | optional | none |
| `audience` | optional | `state.reader.audience`. For children, rank prefers prayers marked for children, then short ones |
| `religions_specified` | scope | state chain |
| `channel` | code | — |

**state reads/writes**
* reads: `scope`, `reader.reader_state`, `reader.audience`, `subjects.topic` (occasion when the earlier turn named it),
  `given` (a prayer already given is skipped unless asked for again), `offers` (accepted from d1 with its occasion).
* writes: `given` (the prayer), `thread`.
* writes `offers` += {what: "two other prayers", strategy: prayer, units: {occasion}}.
* on absence, writes `open` += the occasion.

### 5. Tree
| id | element | params | R → W | edges → next |
|---|---|---|---|---|
| p1 | fetch.prayer | key: named_work \| quoted_words \| occasion, first filled (proposed param) | R named_work, quoted_words, occasion → W fp, fo | one → p5 · several → p4 · none → p2 · error → p2 |
| p2 | search.hype | shelf: prayer | R occasion, current_user_question → W fp, fo | several → p3 · thin → p3 · none → p6 · error → p6 |
| p3 | judge | q: "Does this prayer fit {{occasion}}?" options: fits (written for this occasion or need) · near (same theme, not this occasion) · no (unrelated) | R occasion, fp → W fp | fits → p4 · near → p7 · no → p6 |
| p4 | rank | by: occasion fit, audience fit, then authority (the tradition's standard translation first); channel=voice: shortest first (proposed `by: length`); k 3 | R fp, audience, channel → W fp | done → p5 |
| p5 | shape | template: prayer.one | R fp, occasion | → $end |
| p6 | fetch.collection | id: prayer-books, key: religions_specified | → W fr, fo, missing | one → $absence · thin → $absence · none → $absence · error → $fallback |
| p7 | shape | template: prayer.near | R fp, occasion | → $end |
| $absence | shared end | E2 with template: prayer.absence | R fr, occasion, missing | → $end |
| $fallback | shared end | — | — | answered → p5 · fail → $unavailable |

```
p1 fetch.prayer ─one→ p5 shape prayer.one → $end
   ├several→ p4 rank(fit, audience, authority; voice: length) → p5
   └none|error→ p2 search.hype(prayer) ─several|thin→ p3 judge ─fits→ p4
                                                     ├near→ p7 shape prayer.near → $end
                                                     └no→ p6
                └none|error→ p6 collection(prayer-books, religions_specified) ─one|thin|none→ $absence (E2; prayer.absence)
                                                                                └error→ $fallback ─answered→ p5 · fail→ $unavailable
```

**Scope.**
* No widening: someone who wants to pray in their own tradition is not served by another's prayer.
* With `all`, alternatives may come from other traditions, labelled.
* The "standard translation" is recorded per tradition in the index:
  * Bahá'í: Shoghi Effendi's, then the official prayer book.
  * Others: the translation the library marks as standard.
  * Any other translation is named.

**Paths**
* **clean hit**: p1 one → p5. ≤ 1 s, no Jev decision.
* **several**: p1 several → p4 → p5.
* **thin**: p2 thin → p3 → fits → p4 → p5, or near → p7.
* **none after all tiers**: p2 none → p6 → $absence (prayer.absence).
* **error**: p1 → p2 → p6. p6 error → $fallback → (fail) $unavailable.
* **conflicting sources**: two translations of one prayer → p4 puts the standard one first and names the other.
* **Jev decisions**: 0 on the index path, 1 on HyPE.

### 6. Templates
`prayer.one` (overrides `tpl.one_passage`)
```
base: First line: what the prayer is for and who revealed or wrote it ("A prayer for {{occasion}}, revealed by …"), +
  [scope clause]. Then the prayer IN FULL — never shortened or paraphrased — linked, translator named. Then up to two
  alternatives as linked italic titles with first words (tradition-labelled when religions_specified = all). No
  commentary.
voice: the prayer in full (rank chose the shortest that fits); "I can send you two others."
widget: prayer + one alternative.
email: prayer in full with the original beside it when held (```bilingual), under the [originals rule]. Unset
  reads_* → a named term in the framing line (e.g. the Fast) carries its transliteration from data. The prayer's
  original text is never romanized line by line: show the script, with the English beside it. Two alternatives in full.
```
`prayer.near`
```
base: "I didn't find a prayer written for {{occasion}}; this one, for {{its own occasion}}, is close:" then it in full,
  linked. ({{its own occasion}} = the index record's occasion in found_passages.)
```
`prayer.absence` (overrides `tpl.absence`)
```
base: "I can't find a prayer for {{occasion}} in the library" + [scope clause]. Then the prayer book(s) in
  {{found_records}} linked (italic title = link), and the nearest prayer by title if any. Never compose a prayer.
```

### 7. Time, measures, tests
* **target_time**: ≤ 1 s on the index path, ≤ 3 s on HyPE.
* **measures**:
  * judge score, p50 ms, $/answer
  * the branch taken
  * index hit rate per tradition
  * prayer given in full (a code check)
  * repeats against `given` (a code check; a repeat is a defect)
  * fallback rate
* **tests (new)**:
  * "a prayer I can say before a job interview"
  * "a prayer for my newborn"
  * "the prayer that begins 'O God, guide me, protect me'"
  * "a du'a for my friend having surgery tomorrow"
  * "a psalm to read at my grandmother's funeral"
* **must_not**:
  * "how many times a day must Bahá'ís pray?" (d3)
  * "how many prayers did the Báb write?" (a1)
  * "make a devotional program for Ayyám-i-Há" (f2)

### 8. Open issues
* **Prayer index (to build).**
  * Keyed by tradition × occasion, plus name and opening words.
  * Each record holds title, author, translator, a standard-translation flag, length and a for-children flag.
  * Until it exists, p1 returns none and everything takes p2 + p3 (≈ 2 s, 1 Jev decision).
  * Build: HyPE over each tradition's prayer shelf, then a hand review of about 40 occasions.
* **Prayer-books collection per tradition (to build, small).** Until it exists, the absence (prayer.absence) gives the absence line alone.
* **Which traditions have a prayer shelf at all?** Coverage is to be measured per tradition.

---

## D3 · `d3` — Rules and practice

### 1. Identity
* **name** `d3` · **type** `D-rule`
* **card** The reader asks whether something is allowed, required or forbidden in a tradition, or how a practice is done.
  * The first line answers yes, no or "it depends", followed by the text that says so.
  * It separates law from custom.
  * For a personal case it gives the general law and points to the tradition's institution.
* **difference** (vs `understanding` B1/B3, `guidance` D4):
  * B1/B3 explain meaning or reasons.
  * d3 gives a verdict on conduct from the law texts.
  * D4 gives a living institution's current dated guidance.
  * Halakha, fiqh, canon law and the Aqdas are one task in different scopes.
  * **Verdict: own task.**

### 2. Near misses
| request | goes_to | why |
|---|---|---|
| "Why don't Bahá'ís drink alcohol?" | understanding (B3) | asks the reason |
| "what has the House of Justice said about choosing a neighbourhood?" | guidance (D4) | current institutional guidance |
| "what do Muslims believe about angels?" | understanding (B1) | belief, not conduct |
| "does Christianity allow homosexuality?" | understanding, contested (E3 setting) | contested: texts in context, no verdict line |
| "should I convert to marry him?" | d5 | a membership decision |

### 3. Ideal answer per mode
* **voice**: "No: Bahá'u'lláh forbids alcohol in the Kitáb-i-Aqdas, except as medicine." One spoken passage, then "Shall I
  send you the passages?"
* **widget**: the verdict line, one passage linked, and the condition in one line.
* **site**: the verdict, the governing passages in authority order, the conditions and exemptions, and law vs custom
  stated. A personal case names the institution. 150–250 words.
* **email**: as site, passages in full, and the original beside the English for law texts.
* **research**: as site, plus dated elaborations and how custom differs by place.

### 4. Shapes, needs, state
Shapes: `verdict` (`d3.verdict`) · `d3.refer` · `d3.unaddressed` · `absence`.

| needs (unit) | required? | default when empty |
|---|---|---|
| `topic` (the act or rite) | required | `state.subjects.topic` ("and what about cremation?") |
| `output_form` | optional | prose. **NEW value `steps`** for "how do I…" |
| `religions_specified` | scope | state chain |
| **NEW unit:** `institution` | code | "a qualified teacher of your tradition" |

**NEW unit:** `institution` — text. Code fills it from `religions_specified` through a reviewed table. Examples:

* Bahá'í: your Local Spiritual Assembly
* Catholic: your parish priest
* Islam: a qualified scholar
* Judaism: your rabbi

**state reads/writes**
* reads: `scope`, `subjects.topic`, `given` (a follow-up such as "and if I'm travelling?" cites the passage already given
  only by reference, then adds the condition), `thread` (a follow-up keeps the previous turn's `topic`).
* writes: `given`, `thread`.
* writes `offers` += {what: "the passages", strategy: d3, units: {topic}, channel: email}.
* on d3.unaddressed or absence, writes `open` += the topic.

### 5. Tree
| id | element | params | R → W | edges → next |
|---|---|---|---|---|
| r1 | fetch.collection | id: rules, key: topic | R topic → W fp, fo | one → r5 · thin → r2 · none → r2 · error → r2 |
| r2 | search.fanout | by: authority [law, interp, guidance]; inner: search.shelf(k 6); stage: "Checking the law texts…" | R topic → W fp, fo | all → r3 · some_thin → r3 · all_none → r7 · error → r7 |
| r3 | judge.passages | — | R topic, fp → W fp | answers → r4 · conflict → r4 · mentions_only → r12 |
| r4 | read.source | — | R fp → W fp | traced → r5 · kept → r5 |
| r5 | read.around | — | R fp → W fp | done → r6 |
| r6 | judge | q: "What kind of answer do these texts give on {{topic}}?" options: law · depends (conditions or exemptions matter) · custom (practice, not law) · personal (a ruling on the reader's own case) · guidance (the rule lives in dated institutional guidance) | R topic, fp, current_user_question → W fp | law → r10 · depends → r10 · custom → r10 · personal → r11 · guidance → r9 |
| r7 | search.originals | (a free none when search_originals is false) | R topic → W fp, fo, missing | several → r8 · thin → r8 · none → $absence · error → $fallback |
| r8 | read.around | — | R fp → W fp | done → r6 |
| r9 | rank | by: date (latest applicable first; supersession flag where indexed) | R fp → W fp | done → r10 |
| r10 | shape | template: d3.verdict | R topic, output_form, fp | → $end |
| r11 | shape | template: d3.refer | R institution, fp | → $end |
| r12 | shape | template: d3.unaddressed | R topic, fp | → $end |
| $absence | shared end | E2 with template: tpl.absence | R missing | → $end |
| $fallback | shared end | — | — | answered → r10 · fail → $unavailable |

```
r1 collection(rules, topic) ─one→ r5 read.around → r6 judge(kind)
   └thin|none|error→ r2 fanout shelf[law,interp,guidance]
          ─all|some_thin→ r3 judge.passages ─answers|conflict→ r4 read.source → r5 → r6
          │                         └mentions_only→ r12 shape d3.unaddressed → $end
          └all_none|error→ r7 search.originals ─several|thin→ r8 read.around → r6
                                    ├none→ $absence (E2)
                                    └error→ $fallback ─answered→ r10 · fail→ $unavailable
r6 judge ─law|depends|custom→ r10 shape d3.verdict → $end
         ├personal→ r11 shape d3.refer → $end
         └guidance→ r9 rank(date) → r10
```

**Scope.**
* The kinds law, interp and guidance mean the same in every tradition: its law texts, its authoritative interpreters, and
  its living institution's dated guidance where one exists.
* With several traditions, or `all`, the results carry their tradition. `d3.verdict` then gives one verdict line per
  tradition found (at most 3, in scope order) and offers detail on one.
* No widening: another tradition's ruling is not an answer.

**Paths**
* **clean hit**: r1 one → r5 → r6 law → r10 (1 Jev decision).
* **several**: r2 all → r3 → r4 → r5 → r6 → r10.
* **thin**: r2 some_thin → … → r6 depends → r10, saying what is unspecified.
* **none after all tiers**: r7 none → $absence. If r3 returns mentions_only → r12.
* **error**: r1 → r2 → r7. r7 error → $fallback → (fail) $unavailable.
* **conflicting sources**: r3 conflict → … → r10. Every source is attributed in authority order, and an elaboration
  never replaces the text. Only guidance supersedes guidance (r9).
* **Jev decisions**: r3 + r6 = 2. The guidance option uses `rank`, not `hand.strategy guidance`, so it stays at 2.

### 6. Templates
`d3.verdict` (overrides `tpl.verdict`)
```
base: FIRST LINE is the verdict on {{topic}}: "Yes", "No", or "It depends:" + the condition, + [scope clause] — then the
  governing text quoted and linked. If output_form = steps: what the practice is, then the steps in order, each tied to
  its text. State the kind plainly: law / custom ("a custom, not a law") / elaboration (interpreter or institution,
  dated). Conditions and exemptions as a short list. Never rule beyond the text; scholarship only labelled. Several
  traditions in scope: one verdict line each, attributed, then offer detail.
voice: verdict + one spoken citation + one passage ≤ 2 sentences; "Shall I send you the passages?"
  Terms of law named in the reply (e.g. ḥuqúqu'lláh, salát) follow the [originals rule].
site: a table only for ≥ 3 conditions × ≥ 2 cases.
email: passages in full; original beside English for law texts, under the [originals rule].
```
`d3.refer`
```
base: "That's a decision for {{institution}}, not for me." Then the general law that applies, quoted and linked, so the
  reader knows what {{institution}} will start from. Kind, never evasive.
```
`d3.unaddressed`
```
base: "The texts in the library don't set a rule on {{topic}}" + [scope clause]. Then the principle that applies, from
  {{found_passages}}, labelled a principle. A custom is called a custom.
```

### 7. Time, measures, tests
* **target_time**: collection path ≤ 3 s. Otherwise ≤ 12 s, first words ≤ 2 s.
* **measures**:
  * judge score
  * the verdict in the first line (a code check)
  * p50 ms, $/answer, the branch taken
  * the r6 kind distribution
  * refer, absence and fallback rates, all per tradition
* **tests (new)**:
  * "can a Bahá'í be cremated?"
  * "do I have to fast in Ramadan while breastfeeding?"
  * "is gambling allowed in Sikhism?"
  * "may a Bahá'í woman keep her maiden name?"
  * "how do I say the long obligatory prayer?"
* **must_not**:
  * "why do Bahá'ís fast?" (B3)
  * "what has the House of Justice said about cluster growth?" (D4)
  * "what do Muslims believe about the Day of Judgement?" (B1)

### 8. Open issues
* **Rules collection keyed by tradition × topic (to build).**
  * Until it exists, r1 returns none and everything takes r2 (≈ +3 s).
  * Seed it with the ~50 most-asked Bahá'í rules, then the most-asked Islamic and Jewish rules.
* **Law works held per tradition** (fiqh manuals, the Shulchan Arukh, the Catechism).
  * Where none is held, the `law` kind is empty and scripture + interp carry the answer.
  * The template must then say "from the scriptures; the library holds no legal code for {{religions_specified}}".
* **Supersession flag.** It comes from the guidance index (D4). Until that exists, r9 ranks by date only.
* **Institution table** needs an owner.

---

## D4 · `guidance` — Community life and service

### 1. Identity
* **name** `guidance` · **type** `D-guide`
* **card** The reader asks what a tradition's living institution has said, now says or has decided about community life,
  administration, elections or current plans. Usually that is the Universal House of Justice; it may also be the Vatican
  or a national body. The answer gives the current applicable guidance first, dated, and says what it supersedes. Then it
  gives the scripture behind it, organised as what to do.
* **difference** (vs `d3`):
  * d3 rules on acts from law texts.
  * guidance answers from dated institutional messages, decides which one is current, and owns the date and supersession
    logic that d3 reuses.
  * **Verdict: own task, narrowly (17 lead requests).**
* **Tradition-agnostic.** The index is Bahá'í-only for now.
  * Another tradition whose institutional documents are held: the shelf tier.
  * A tradition with no single living institution: `guidance.writings`, which says so.

### 2. Near misses
| request | goes_to | why |
|---|---|---|
| "Is the Nineteen Day Feast obligatory?" | d3 | a rule |
| "what does Bahá'u'lláh say about consultation?" | a3 / understanding | scripture, not current guidance |
| "who were the first members of the House of Justice?" | a1 / b5 | a fact or people |
| "the history of the Five Year Plans" | b4 | a story over time |
| "compile the House of Justice's letters on the arts" | f1 | a compilation job |

### 3. Ideal answer per mode
* **voice**: "In its Ridván 2026 message the House of Justice says…", one spoken passage, then "Shall I send you the
  guidance and the texts behind it?"
* **widget**: the current guidance in one dated line, one passage linked, and one line on the scripture behind it.
* **site**: 2–5 points, each with a dated passage. Then the scripture behind it, and "this replaces…" where it applies.
  150–250 words.
* **email**: as site, passages in full, every message dated and linked.
* **research**: as site, plus a dated sequence of how the guidance developed when there are 3 or more messages.

### 4. Shapes, needs, state
Shapes: `passages` (`guidance.current`) · `guidance.writings` · `absence`.

| needs (unit) | required? | default when empty |
|---|---|---|
| `topic` (the matter, incl. "in the current Plan") | required | `state.subjects.topic` |
| `named_sources` (a named body or message) | optional | the tradition's highest institution |
| `audience` | optional | `state.reader.audience`. A seeker gets institutional terms (cluster, institute process) glossed in a clause. A study circle does not |
| `religions_specified` | scope | state chain |
| `authority_floor` | scope | a guidance request names the guidance in the turn, so the turn layer's patch admits it; an inherited `scripture` floor is respected (g4 writings_only path), never widened by the tree |

**state reads/writes**
* reads: `scope`, `subjects.topic`, `reader.audience`, `given` (a message already quoted is cited by reference only),
  `thread` ("and before that?" → the earlier dated message on the same topic).
* writes: `given`, `thread`.
* writes `offers` += {what: "the guidance and texts", strategy: guidance, units: {topic}, channel: email}.
* on writings-only or absence, writes `open` += topic.

### 5. Tree
| id | element | params | R → W | edges → next |
|---|---|---|---|---|
| g1 | fetch.guidance | latest applicable first | R topic, named_sources → W fp, fo | one → g3 · several → g2 · none → g1b · error → g1b |
| g1b | search.shelf | authority: guidance, k 8 | R topic → W fp, fo | one → g2 · several → g2 · thin → g2 · none → g3 · error → g3 |
| g2 | rank | by: date (latest applicable; supersession flag) | R fp → W fp | done → g3 |
| g3 | search.fanout | by: authority [scripture, interp]; inner: search.shelf(k 4); stage: "Finding the texts behind it…" | R topic → W fp, fo | all → g4 · some_thin → g4 · all_none → g4 · error → g4 |
| g4 | `switch` | on: found_passages kinds; cases: has_guidance · writings_only · nothing · errored | R fp, fo | has_guidance → g5 · writings_only → g7 · nothing → $absence · errored → $fallback |
| g5 | read.around | — | R fp → W fp | done → g6 |
| g6 | judge | q: "Is the top message the current guidance on {{topic}}?" options: current · superseded (a later message in hand replaces an earlier one) · passing (only touches the matter; lead with the texts) | R topic, fp → W fp | current → g8 · superseded → g8 · passing → g9 |
| g7 | read.around | — | R fp → W fp | done → g9 |
| g8 | shape | template: guidance.current | R topic, fp, audience | → $end |
| g9 | shape | template: guidance.writings | R topic, fp, religions_specified, named_sources | → $end |
| $absence | shared end | E2 with template: tpl.absence | R missing | → $end |
| $fallback | shared end | — | — | answered → g8 · fail → $unavailable |

```
g1 fetch.guidance ─one→ g3 ; ─several→ g2 rank(date) → g3 ; ─none|error→ g1b shelf(guidance) ─hits→ g2 ; ─none|error→ g3
g3 fanout shelf[scripture,interp] ─any→ g4  switch(found kinds)
   ├has_guidance→ g5 read.around → g6 judge ─current|superseded→ g8 shape guidance.current → $end
   │                                         └passing→ g9 shape guidance.writings → $end
   ├writings_only→ g7 read.around → g9
   ├nothing→ $absence (E2)
   └errored→ $fallback ─answered→ g8 · fail→ $unavailable
```

**Scope by tradition**

| tradition in scope | path |
|---|---|
| Bahá'í | Full path. g1 falls back to g1b until the index exists. |
| Another tradition with institutional documents held (e.g. papal encyclicals) | g1 none → g1b → g2 → g6. "Superseded" only when a later document says so. |
| A tradition with no single living institution | g3 → g4 writings_only → g9: "{{religions_specified}} has no single body issuing current guidance; its texts say:". |
| `all` | Results are grouped by issuing body. |

**Paths**
* **clean hit**: g1 one → g3 → g4 has_guidance → g5 → g6 current → g8.
* **several**: g1 several → g2 → … → g8.
* **thin**: g1b thin → g2 → g3 → g4 → g5 → g6 → g8 or g9.
* **none after all tiers**: g4 nothing → $absence.
* **error**: g1 → g1b → g3. If nothing was found and something errored, g4 errored → $fallback → (fail) $unavailable.
* **conflicting sources**:
  * Two dated messages that differ → g2 → g6 superseded → the later one is given and the earlier one named.
  * Two different bodies → both are shown, each with its body. Neither is called superseded.
* **Jev decisions**: 1.

### 6. Templates
`guidance.current` (overrides `tpl.passages`)
```
base: First line: the
  current guidance on {{topic}} in one sentence, issuing body and date, + [scope clause]. Then 2–5 points, each with its
  dated passage linked. If superseded: "This replaces the guidance of {{earlier date}}." Then "The texts behind it:" one
  or two passages. audience = seeker: gloss institutional terms in a clause. Never present guidance as scripture;
  letters written on behalf of an institution are labelled.
voice: first line + one passage ≤ 2 sentences; "Shall I send you the guidance and the texts behind it?"
site: points as a short list.   email: passages in full, each dated and linked.
```
`guidance.writings`
```
base: First line, one of: "I couldn't find guidance from {{named_sources|the institution}} specifically on {{topic}};"
  or "{{religions_specified}} has no single body issuing current guidance;" — then "its texts say:" and passages in
  authority order; passing mentions of guidance last, dated.
```

### 7. Time, measures, tests
* **target_time**: index path ≤ 3 s. Otherwise ≤ 12 s, first words ≤ 2 s.
* **measures**:
  * judge score
  * a dated first line (a code check)
  * supersession correctness (audited)
  * the branch taken, per tradition
  * p50 ms, $/answer, fallback rate
* **tests (new)**:
  * "what did the latest Ridván message say about the Plan's goals?"
  * "how should a Local Assembly consult with the wider community, according to current guidance?"
  * "what does the House of Justice advise about social media?"
  * "what has the Pope said recently about care for the environment?"
  * "how should a cluster choose a neighbourhood for intensive activity?"
* **must_not**:
  * "is it permitted to drink alcohol?" (d3)
  * "what does Bahá'u'lláh say about consultation?" (a3)
  * "who were the first members of the Universal House of Justice?" (a1/b5)

### 8. Open issues
* **Guidance index, by date × topic with supersession (to build; Bahá'í institutions first).** Until it exists, g1b, and
  "superseded" is Jev's call from dates alone.
* **Supersession marking.** A hand list for the current and previous Plan only. Older material is ranked by date. For other
  traditions, only explicit supersession counts.
* **"Written on behalf of"** must be an authority kind in the index.
* **Institutional documents of other traditions.** Which do we hold? Until that is known, those traditions mostly end at
  g9.

---

## D5 · `d5` — Cult? join? convert?

### 1. Identity
* **name** `d5` · **type** `D-decide`
* **card** The reader is weighing a faith itself: whether it can be trusted, how to join it, whether to convert or hold
  two faiths, or how to leave.
  * The answer is fair and calm: checked facts with sources, and the worry taken seriously.
  * It gives a no-pressure next step only when the reader is ready, or is leaving.
* **difference** (vs `understanding` B1, `d1`):
  * B1 explains.
  * d5 answers a membership decision from a checked fact sheet. Its paths end in an action (enrol or withdraw) that no
    explanation path has.
  * **Verdict: own task (borderline).** It applies to any tradition in scope.

### 2. Near misses
| request | goes_to | why |
|---|---|---|
| "Is Judaism racist for believing it is chosen?" | understanding, contested (E3 setting) | a charge against a teaching |
| "What do Bahá'ís believe about Jesus?" | understanding (B1) | belief, no decision |
| "I've lost my faith and feel empty" | d1 | pain, not membership |
| "Can a Bahá'í marry a Muslim?" | d3 | a rule |
| "You said Bahá'ís have no clergy — what about Counsellors?" | e1 | pushback on a claim |

### 3. Ideal answer per mode
* **voice**: "That's a fair question." Two or three checked facts, one spoken citation, then "Would you like me to send you
  more?"
* **widget**: acknowledge the worry, give the facts with sources and one passage, and a next step only if ready.
* **site**: an honest acknowledgement, the facts, one or two passages, and a calm next step (enrolment if ready;
  withdrawal if leaving). 150–250 words.
* **email**: as site, passages in full, and the community's own pages linked.
* **research**: as site, plus scholarship, labelled.

### 4. Shapes, needs, state
Shapes: `d5.fair` (record-like) · `d5.join` · `d5.leave` · `absence`.

| needs (unit) | required? | default when empty |
|---|---|---|
| `topic` (the worry) | optional | "what is it and can I trust it" |
| `reader_state` | optional | `state.reader.reader_state`, else curious. **NEW value `leaving`** |
| `religions_specified` | scope | the faith being weighed, which Jev sets from the conversation (not the reader card) |

**state reads/writes**
* reads: `scope`, `reader.reader_state` (a reader who turned ready during the conversation gets the join step without
  re-asking), `subjects.topic`, `given`.
* writes: `given`, `thread`.
* Jev's patch may move `reader.reader_state` (e.g. hostile → curious → ready to join) across turns.
* writes `offers` += {what: "more", strategy: d5, units: {topic}}.

### 5. Tree
| id | element | params | R → W | edges → next |
|---|---|---|---|---|
| f1 | fetch.collection | id: faith-facts, key: topic | R topic → W fr, fo | one → f2 · thin → f2 · none → f2 · error → f2 |
| f2 | `switch` | on: reader_state | R reader_state | ready to join → f6 · leaving → f7 · else → f3 |
| f3 | hand.strategy | name: understanding (topic), upto: evidence | R topic → W fp | found · thin → f8 · none → f4 · error → f4 |
| f4 | search.shelf | authority: any (scholarship labelled), k 4 | R topic → W fp, fo | one → f8 · several → f8 · thin → f8 · none → f5 · error → $fallback |
| f5 | `switch` | on: found_records non-empty | R fr | yes → f8 · no → $absence |
| f6 | shape | template: d5.join | R fr, religions_specified | → $end |
| f7 | shape | template: d5.leave | R fr, topic | → $end |
| f8 | shape | template: d5.fair | R fr, fp, reader_state, topic | → $end |
| $fallback | shared end | — | — | answered → f8 · fail → $unavailable |
| $absence | shared end | E2 with template: tpl.absence | R missing | → $end |

```
f1 collection(faith-facts, topic) ─any→ f2  switch(reader_state)
   ├ready to join→ f6 shape d5.join → $end
   ├leaving→ f7 shape d5.leave → $end
   └curious|hostile→ f3 hand.strategy(understanding) ─found|thin→ f8 shape d5.fair → $end
                         └none|error→ f4 shelf(any) ─hits→ f8 ; ─none→ f5 switch(facts?) ─yes→ f8 ; ─no→ $absence (E2)
                                                     └error→ $fallback ─answered→ f8 · fail→ $unavailable
```

**Paths**
* **clean hit**: f1 one → f2 curious → f3 found → f8.
* **several**: inside f3. The facts are kept whole.
* **thin**: f3 none → f4 thin → f8 (saying what is missing).
* **none after all tiers**: f4 none → f5 no → $absence.
* **error**: f1 error → f2 (continue without facts). f3 → f4. f4 error → $fallback → (fail) $unavailable.
* **conflicting sources**: inside f3 (sides). A critic's claim is stated fairly in its own terms and attributed.
* **Jev decisions**: 0 here, plus B1's ≤ 2.
* **Scope**: no widening.

### 6. Templates
`d5.fair` (overrides `tpl.record`)
```
base: First line acknowledges the question as fair, without defensiveness; reader_state = hostile → name the worry
  ({{topic}}) in the reader's terms first. Then checked facts from {{found_records}}, each with its source; then one or
  two passages from {{found_passages}}. No pressure, no invitation unless asked, no superlatives. Critics' views stated
  fairly, attributed.
voice: acknowledgement + up to three facts + one spoken citation; "Would you like me to send you more?"
email: passages in full; the community's own page linked.
```
`d5.join`
```
base: How one becomes a member of {{religions_specified}}, in one or two plain sentences from the checked facts; then
  where to go (link from found_records). Warm, brief, no pressure. No fact sheet: "The {{religions_specified}} community
  near you can tell you how; here is where to find it:" — never an invented procedure.
```
`d5.leave`
```
base: Respectful from the first word; never argue the reader back. How leaving works, from the checked facts; then, only
  if a worry ({{topic}}) was raised, one fair line on it with a source. Offer to talk more.
```

### 7. Time, measures, tests
* **target_time**: ready/leaving ≤ 3 s. Otherwise ≤ 12 s, first words ≤ 2 s.
* **measures**:
  * judge score, with fairness and pressure scored separately (pressure is a defect)
  * the `reader_state` distribution and how it moves across turns
  * the branch taken
  * fact-sheet misses by tradition × topic
  * p50 ms, $/answer, fallback rate
* **tests (new)**:
  * "my girlfriend's family are Bahá'ís — is it a cult?"
  * "how do I actually sign up to become a Bahá'í?"
  * "can I be a Bahá'í and still go to church?"
  * "I'm thinking of leaving the Faith — what happens if I do?"
  * "can anyone become a Sikh, or do you have to be born one?"
* **must_not**:
  * "do Bahá'ís believe women are equal to men?" (B1)
  * "what do Bahá'ís believe about Jesus?" (B1)
  * "I've lost my faith and feel empty" (d1)

### 8. Open issues
* **Faith-facts sheet, keyed by tradition × topic (to build; signed off by Chad).** Until it exists, f1 returns none.
  join and leave use the fallback line, and everything else relies on B1.
* **Two faiths, or converting to marry.** This touches d3. B1 finds the law passages, which is enough for one line. For
  the ruling, Jev composes d5 + d3.

---

## E1 · `e1` — Pushback, contradiction

### 1. Identity
* **name** `e1` · **type** `E-test`
* **card** The reader challenges a claim, either one Anís made or one in or about a text. The answer:
  * concedes what is interpretation;
  * shows the exact words;
  * gives the authoritative explanation where one exists, and says plainly where none does.
* **difference** (vs `understanding` B1, `a4`, the contested setting):
  * e1 tests a specific claim against the exact words and is ready to concede.
  * B1 explains; a4 only locates.
  * **Verdict: own task.**
  * **G6** (pushback on Anís's own answer) is this tree with `challenged_claim` filled and `state.given` read. Recommend
    FGH treat G6 as `setting_of: e1`.

### 2. Near misses
| request | goes_to | why |
|---|---|---|
| "what does John 14:6 say?" | reference (A5) | wants the verse, no challenge |
| "Is the Bahá'í Faith a cult?" | d5 | trusting a community |
| "what do Bahá'ís believe about women's equality?" | understanding (B1) | no challenge |
| "where does it say 'the earth is but one country'?" | a4 | locate a quote |
| "what's your source for that?" | g2 | asks for the citation (resolves from state.given) |

### 3. Ideal answer per mode
* **voice**: "You're right that…" or "The text itself says…", one exact passage spoken, then one line with the
  authoritative explanation or "there isn't an authoritative explanation of that." Offer to send.
* **widget**: concede or confirm, the exact words linked, and the explanation in one or two lines.
* **site**: concede, confirm or name the tension. Then the exact words and the authoritative explanations in authority
  order. Where there is none, say so, and give scholarship labelled. 150–250 words.
* **email**: as site, passages in full, and the original when a translation choice is at issue.
* **research**: as site, plus how the passage has been read. For an interfaith challenge, each tradition's reading of its
  own verse.

### 4. Shapes, needs, state
Shapes: `e1.concede` · `e1.show` (`one_passage`) · `e1.tension` (`sides`) · `e1.not_said` · absence via `$absence` (E2).

**G6 (pushback on Anís's own answer) is a setting of e1** (consolidation 11-09; FGH file keeps G6's design as reference).
In that setting `challenged_claim` comes from `previous_answer`, `challenge_kind` picks the branch, and the templates take
G6's wording: e10 ← `pushback.correct`, e11 ← `pushback.stand`, e15 ← `pushback.not_said`, absence ← `pushback.retract`.

| needs (unit) | required? | default when empty |
|---|---|---|
| `challenged_claim` | optional | none (the claim is in the question) |
| `previous_answer`, `previous_evidence` | code | [] |
| `scripture_reference` | optional | none |
| `quoted_words` | optional | none |
| `challenge_kind` (from G6) | optional | none → the unit switch below |
| `topic` | optional | `state.subjects.topic`, else the question |
| `religions_specified` | scope | the conversation's traditions. An interfaith challenge carries both, set by Jev's patch |

**state reads/writes**
* reads: `scope`, `given` (the passages our answer quoted: the G6 evidence, free), `thread` (what strategy produced the
  disputed answer), `subjects`.
* writes: `given`, `thread`.
* After a concession, Jev's next patch may tighten `authority_floor` if the reader asked for "only the Writings".
* when tension has no authoritative explanation, writes `open` += the claim.

### 5. Tree
| id | element | params | R → W | edges → next |
|---|---|---|---|---|
| e1 | `switch` | on: `challenge_kind = not_said` first; else which unit is filled: challenged_claim · scripture_reference · quoted_words · else | R challenge_kind, challenged_claim, scripture_reference, quoted_words | not_said → e15 · challenged_claim → e2 · scripture_reference → e3 · quoted_words → e4 · else → e5 |
| e2 | read.source | on: state.given of the challenged turn (= previous_evidence) | R previous_evidence → W fp | traced → e5 · kept → e5 |
| e3 | fetch.reference | — | R scripture_reference → W fp, fo, missing | one → e5 · several → e5 · none → e5 (missing: "the verse does not exist as cited") · error → e5 |
| e4 | fetch.phrase | close | R quoted_words → W fp, fo, missing | one → e5 · several → e5 · thin → e5 · none → e5 (missing: "these words are not in the text") · error → e5 |
| e5 | search.fanout | by: authority [scripture, interp, guidance]; inner: search.shelf(k 4); stage: "Checking the exact words…" | R topic, challenged_claim → W fp, fo | all → e7 · some_thin → e7 · all_none → e6 · error → e6 |
| e6 | search.originals | (a free none when search_originals is false) | R topic → W fp, fo | several → e7 · thin → e7 · none → e7 · error → $fallback |
| e7 | read.source | — | R fp → W fp | traced → e8 · kept → e8 |
| e8 | read.around | — | R fp → W fp | done → e9 |
| e9 | judge | q: "Set {{challenged_claim\|the claim}} against the exact words and the authoritative explanations." options: overreached (the claim, or our earlier answer, says more than the words) · supported · tension (real; say so if there is no authoritative explanation) · not_there (the words or verse it rests on are not in the text). Empty evidence → not_there in code | R challenged_claim, current_user_question, fp, missing → W fp | overreached → e10 · supported → e11 · tension → e12 · not_there → $absence |
| e10 | shape | template: e1.concede | R challenged_claim, previous_answer, fp | → $end |
| e11 | shape | template: e1.show | R fp | → $end |
| e12 | shape | template: e1.tension | R fp | → $end |
| $fallback | shared end | — | — | answered → e11 · fail → $unavailable |
| $absence | shared end | E2 with template: e2.absence (G6 setting: pushback.retract) | R missing, fp | → $end |
| e15 | shape | template: e1.not_said (= G6 `pushback.not_said`: quote what previous_answer actually said) | R previous_answer, challenged_claim | → $end |

```
e1 switch(units) ─not_said→ e15 shape e1.not_said → $end
                ├challenged_claim→ e2 read.source(state.given) → e5
                ├scripture_reference→ e3 fetch.reference ─any→ e5
                ├quoted_words→ e4 fetch.phrase(close) ─any→ e5
                └else→ e5
e5 fanout shelf[scripture,interp,guidance] ─all|some_thin→ e7
   └all_none|error→ e6 search.originals ─several|thin|none→ e7 ; ─error→ $fallback ─answered→ e11 · fail→ $unavailable
e7 read.source → e8 read.around → e9 judge ─overreached→ e10 shape e1.concede → $end
                                          ├supported→ e11 shape e1.show → $end
                                          ├tension→ e12 shape e1.tension → $end
                                          └not_there→ $absence (E2)
```

**Paths**
* **clean hit**: e1 → e3 one → e5 → e7 → e8 → e9 supported → e11.
* **several**: e5 all → e7 → e9. The passage at issue first, the rest by authority.
* **thin**: e5 some_thin → … → e9 tension, with no authoritative explanation → e12.
* **none after all tiers**: e6 none → e7 → e9 (empty → not_there) → $absence.
* **error**: e3/e4 error → e5. e5 → e6. e6 error → $fallback → (fail) $unavailable.
* **conflicting sources**: e9 tension → e12. The words first, then each explanation attributed in authority order.
* **G6**: e1 → e2 → e5 → … → e9 overreached → e10.
* **Jev decisions**: 1.
* **Scope**: no widening. A tension is reported honestly, not filled from outside the scope.

### 6. Templates
`e1.concede`
```
base: FIRST WORDS concede, specifically: "You're right — I presented {{challenged_claim}} as {{what we called it}}; it
  is {{its real authority kind}}." Then the exact words from {{found_passages}}, linked, with their real authority kind;
  then what can still be said with that authority. No hedging, no defending the earlier wording.
voice: concession + one spoken citation; offer to send the passage.
```
`e1.show` (overrides `tpl.one_passage`)
```
base: "The text itself says this:" then the exact words, linked, translator named; then the authoritative explanation,
  if any, attributed. Calm, never triumphant. "How do I answer someone who…": something to share, not a debating script.
```
`e1.tension` (overrides `tpl.sides`)
```
base: Name the tension honestly ("There is a real tension here; it has been addressed this way:" or "…and there is no
  authoritative explanation of it."), + [scope clause]. Then the exact words, then each explanation in authority order;
  scholarship only labelled. None exists → say so and stop. Another tradition's verse: quote it in its own words first,
  then the reader's tradition's explanation, attributed; never speak for the other tradition beyond its own text.
  When the challenge turns on a word ("doesn't X really mean Y?"), show the original word and its renderings from
  {{found_passages}} under the [originals rule], never a translation of our own.
site: two-column table only for ≥ 2 readings × ≥ 3 points.
email: passages in full; original when translation matters, under the [originals rule].
```

### 7. Time, measures, tests
* **target_time**: ≤ 12 s, first words ≤ 2 s. G6 ≤ 6 s (its evidence is already in `state.given`).
* **measures**:
  * judge score, with honesty scored separately (a missed concession is a defect)
  * the e9 outcome distribution: overreached on the G6 path is our own error rate
  * the "no authoritative explanation" rate
  * p50 ms, $/answer, fallback rate
* **tests (new)**:
  * "that passage you quoted is from a pilgrim note, isn't it?"
  * "doesn't the Aqdas's inheritance law contradict gender equality?"
  * "how do I answer a Christian who says John 14:6 means only Jesus saves?"
  * "isn't progressive revelation just saying your religion is the latest and best?"
  * "you said the Báb wrote the Bayán in Arabic — wasn't it Persian?"
* **must_not**:
  * "what does John 14:6 say?" (A5)
  * "is the Bahá'í Faith a cult?" (d5)
  * "what do Bahá'ís believe about women's equality?" (B1)

### 8. Open issues
* **Interfaith apologetics** (Qur'án 33:40, John 14:6). At research depth, each tradition's own reading could come from
  `hand.strategy understanding` per tradition. It is not in the live tree, so as to keep within the Jev limit.
* **G6 as a setting of e1** needs FGH's agreement.
* **`missing` notes.** Confirm that `fetch.reference` and `fetch.phrase` write `missing` on none.

---

## E2 · `e2` — Something that isn't there

### 1. Identity
* **name** `e2` · **type** `E-absence` (**internal sub-tree, not a Jev option**)
* **card** (for docs and composer only) It takes over when the asked-for strategy finds nothing: a quote that doesn't
  exist, a ruling never made, a verse that isn't there.
  * It says "I can't find that in the library" and gives the closest real passage, labelled.
  * It may WIDEN the scope to find where a saying really comes from.
  * It uses the web, labelled, only for what no library holds.
* **verdict**:
  * The reader's task is a find, trace or lookup (a4, a1, a3, a5). "Not there" is an outcome that Jev cannot foresee.
  * So e2 is the shared absence sub-tree, called through `hand.strategy e2` on any tree's last-tier none. It is not a
    strategy and not a `setting_of`.
  * Re-label the 219 "lead" requests to the type actually asked.

### 2. Near misses (they go to a normal strategy, which calls e2 only when empty)
| request | goes_to | why |
|---|---|---|
| "Jesus said God helps those who help themselves — where?" | a4 → e2 on none | trace first |
| "where in the Bible does it say not to celebrate Halloween?" | a3 → e2 on none | passages first |
| "is Krishna Jesus?" | understanding / comparison | a belief question |
| "Theravada Zen?" | h2 / a1 | fragment or fact |
| "the Hidden Words aren't loading" | h1 | about the site |

### 3. Ideal answer per mode
* **voice**: "I can't find that in Bahá'u'lláh's writings. It's from the Dhammapada:" or "The closest is…", one spoken
  passage, then "Shall I send it?"
* **widget**: the absence line, then the nearest or true-source passage, labelled and linked.
* **site**: the absence line, the nearest passages labelled, any widened find stated, and one labelled web line for a
  web-only matter.
* **email**: as site, passages in full.
* **research**: as site, plus what was searched (from `missing`).

### 4. Shapes, needs, state
Shapes: `e2.near` · `e2.elsewhere` · `e2.absence` · `e2.web`.

| needs (unit) | required? | default when empty |
|---|---|---|
| `missing` (what the caller looked for, and in which tiers) | required (from the caller) | assume exact index + shelf were tried |
| `quoted_words` / `scripture_reference` / `topic` / `named_person` | whichever the caller had | the question |
| `religions_specified` | scope | the caller's scope |

**state reads/writes**
* reads: `scope`, `given` (never offer as "nearest" a passage already given for this question).
* writes: `given`, `widened`.
* writes `open` += the premise, when nothing is found.
* The scope is NOT changed by a widened find: the widen is for this turn only, and the reader decides whether to widen
  the conversation.

### 5. Tree
| id | element | params | R → W | edges → next |
|---|---|---|---|---|
| x0 | ui.stage | "Not found as worded — looking for the nearest passage…" | R missing | emitted → x1 |
| x1 | search.hype | shelf: any (authority-ordered) | R quoted_words, topic → W fp, fo | several → x3 · thin → x2 · none → x2 · error → x2 |
| x2 | fetch.phrase | close; widen: traditions (only when quoted_words is filled and religions_specified ≠ all) | R quoted_words → W fp, fo, widened | one → x3 · several → x3 · thin → x3 · none → x3 · error → $fallback |
| x3 | judge | q: "Is any of this the thing asked for?" options: near (same idea in scope, different words) · elsewhere (the saying itself, outside the scope; requires widened) · related (only a related passage) · web_only (a matter no library holds) · nothing | R missing, fp, widened → W fp | near → x4 · elsewhere → x11 · related → x8 · web_only → x6 · nothing → x8 |
| x4 | rank | by: authority, k 2 | R fp → W fp | done → x5 |
| x5 | read.around | — | R fp → W fp | done → x9 |
| x6 | search.web | — | R quoted_words, topic → W fr, fo | one → x10 · none → x8 · error → x8 |
| $fallback | shared end | — | — | answered → x9 · fail → $unavailable |
| x8 | shape | template: e2.absence | R missing, fp, fo | → $end |
| x9 | shape | template: e2.near | R fp | → $end |
| x10 | shape | template: e2.web | R fr, fp | → $end |
| x11 | shape | template: e2.elsewhere | R fp, widened, religions_specified | → $end |

```
x0 ui.stage → x1 search.hype ─several→ x3 ; ─thin|none|error→ x2 fetch.phrase(close, widen traditions) ─any→ x3 ; ─error→ $fallback ─answered→ x9 · fail→ $unavailable
x3 judge ─near→ x4 rank → x5 read.around → x9 shape e2.near → $end
         ├elsewhere→ x11 shape e2.elsewhere → $end
         ├related|nothing→ x8 shape e2.absence → $end
         └web_only→ x6 search.web ─one→ x10 shape e2.web → $end ; ─none|error→ x8
```

**Paths**
* **clean hit** (a near match in scope): x1 several → x3 near → x4 → x5 → x9.
* **several**: x4 keeps 2.
* **thin**: x1 thin → x2 → x3.
* **widened**: x2 finds the saying in another tradition → x3 elsewhere → x11.
* **none after all tiers**: x3 nothing → x8.
* **error**: x1 → x2. x2 error → $fallback → (fail) $unavailable. x6 error → x8, and the web line is dropped.
* **conflicting sources**: not applicable. If the nearest passages disagree, x4 keeps the higher authority.
* **Jev decisions**: 1 here, plus the caller's (a4: 2) = 3. Within the limit only because x0 is a verdict line, which
  counts as first words (plan §1 step 7); a pure progress line would not.

### 6. Templates
`e2.absence` (overrides `tpl.absence`)
```
base: FIRST LINE: "I can't find that in the library" + [scope clause]. (An error never reaches E2: it ends in
  `tpl.unavailable`.) Related passage → "The closest I can find is:" + it, linked, labelled not the thing asked for. Never
  suggest the premise is true; never invent a source. depth=research: one line from {{missing}}.
voice: absence line + at most one spoken sentence of the nearest passage; "Shall I send it?"
```
`e2.near`
```
base: "Not in those words — but {{author}} says something close in {{work}}:" + the passage, linked, labelled "closest
  wording". A known misquotation of it → say so in one line.
```
`e2.elsewhere` (this IS the [widened line])
```
base: "I can't find that in {{religions_specified}} sources — these words are from {{work}} ({{tradition}}):" + the
  passage, linked. A near passage in scope as well → add it, labelled "closest in {{religions_specified}}".
```
`e2.web`
```
base: "I can't find that in the library." + one line labelled "Outside the library:" with the web source linked; then the
  nearest library passage on the theme, labelled. The web line is never presented as the library's.
```

### 7. Time, measures, tests
* **target_time**: first words ≤ 1 s after the caller's none. The whole reply ≤ 8 s.
* **measures**:
  * judge score
  * the absence line first (a code check)
  * elsewhere rate (misattributions found)
  * near-match acceptance
  * web-line rate (should stay low)
  * false absence (audit sample)
  * fallback rate
* **tests (new, through the callers)**:
  * "where does Bahá'u'lláh say 'be the change you wish to see'?"
  * "which tablet forbids eating meat on Fridays?"
  * "the Gita verse where Krishna says all religions are one"
  * "the Buddha's 'holding on to anger is like drinking poison' — which sutta?"
  * "what year did 'Abdu'l-Bahá visit Australia?"
* **must_not** (e2 must not be reached):
  * "is 'the earth is but one country' a real quote?" (a4)
  * "verse about patience in the Qur'án" (a3)
  * "the Hidden Words aren't loading" (h1)

### 8. Open issues
* **Web use for a misquote's origin.** Only via x3 web_only, labelled, one line. Chad to confirm.
* **Callers must fill `missing`.** Until they do, x1 runs anyway (it is cheap).
* **Re-label the 219 E2 lead requests.**

---

## E3 · `e3` — Controversy → **setting_of: understanding**

### 1. Identity
* **verdict** `{"setting_of": "understanding"}`.
  * A contested topic in a scope is a TOPIC. "No editorial" is a TONE. Strict authority order is already B1's rule.
  * E3 co-occurs with B1 147 times, and its route is "B1 with strict authority order".
  * The one addition is retrieval: the teaching AND the guidance on how to treat people. That is a fanout param.
  * Any tradition in scope works the same way.
* **name** `understanding` + `contested` · **type** `B-explain` (setting)
* **card**: none. B1's card gains: "…including contested moral and social questions (then: the texts in context, with the
  guidance on treating people, and no editorial)".
* **NEW unit:** `contested` — bool. Jev fills it in the strategy call, only when weighing `understanding`. It is not
  carried in state (each question is judged afresh).

### 2. Near misses (Jev should NOT set `contested`)
| request | goes_to | why |
|---|---|---|
| "Can Bahá'ís drink alcohol?" | d3 | a rule with a verdict |
| "Is the Bahá'í Faith a cult?" | d5 | about a community |
| "Isn't the men-only House of Justice a contradiction of equality?" | e1 | a claim under test |
| "what does Buddhism teach about compassion?" | understanding, contested = false | not contested |

### 3. Ideal answer per mode (B1's, with the setting)
* **voice**: one neutral sentence on what the texts say, one spoken passage, and one line on treating people. Offer to
  send.
* **widget**: a neutral first line, one passage in context, and one line on treating people.
* **site**: the texts in authority order, each read in context, then the guidance on treating people, then each differing
  interpretation attributed. No evaluative adjectives. 200–250 words.
* **email**: as site, passages in full.
* **research**: as site, plus authoritative interpreters, and scholarship labelled.

### 4. Shapes, needs, state
Shapes: B1's `passages` / `sides` with the override `understanding.contested`.

| needs (unit) / setting param | value |
|---|---|
| `contested` (NEW unit) | true |
| `topic` | required |
| `religions_specified` | scope. With several traditions, B1's fanout runs by religions_specified, one side per tradition |
| `authority_floor` | at least interpretation. Pilgrim notes and scholarship only labelled, never in the first line |
| fanout facets | [the teaching / law on {{topic}}, how to treat people] |
| read.around | mandatory on every quoted passage |
| conflict edge | → `sides`, attributed, in authority order |

**state reads/writes**: B1's. A follow-up such as "and in Islam?" becomes a turn patch to `religions_specified`, and the
same setting runs again. It never becomes a new strategy.

### 5. Tree
No tree of its own: B1's tree runs with the params above. What this setting requires of B1's tree:
* **clean hit / several**: the fanout runs per facet × authority (× tradition), so the facet on treating people is never
  crowded out.
* **thin**: the template says which facet is thin and never pads.
* **none after all tiers**: understanding's `$absence` (E2).
* **error**: B1's.
* **conflicting sources**: B1's `judge.passages` conflict → `sides` with `understanding.contested`.
* **No widening**: a contested topic is answered only from traditions in scope.
* If B1's fanout cannot take a `facets` list (proposed param), the setting degrades to two sequential `search.shelf` calls.

### 6. Templates
`understanding.contested` (overrides B1's template when `contested`)
```
base: First line: what the texts of {{religions_specified}} say on {{topic}}, attributed, neutral, + [scope clause] —
  never "unfortunately", "progressive", "strict", "clearly". Each passage in its context. Then the guidance on treating
  people, quoted. Differing interpretations each attributed in authority order, none endorsed. Scholarship only
  labelled. Several traditions: one attributed section each. No editorial in either direction.
voice: neutral first line, one passage, one line on treating people; offer to send.
```

### 7. Time, measures, tests
* **target_time**: B1's (≤ 12 s, first words ≤ 2 s).
* **measures**: B1's, plus:
  * an evaluative-adjective check outside quotations (a code list; a hit is a defect)
  * every quote read around
  * the treatment-of-people facet present (a code check)
  * neutrality scored by the judge
* **tests (new)**:
  * "what does the Bahá'í Faith say about abortion?"
  * "does Islam allow a man to hit his wife?"
  * "Hinduism and caste discrimination"
  * "what is the Bahá'í view on euthanasia?"
  * "does Judaism allow same-sex marriage?"
* **must_not**:
  * "what does Buddhism teach about compassion?" (contested = false)
  * "can Bahá'ís drink alcohol?" (d3)
  * "is the Bahá'í Faith a cult?" (d5)

### 8. Open issues
* **Denominations** (Catholic/Protestant, Sunni/Shia). Do we hold each one's authoritative texts? Until we do, the
  template names whose reading the sources represent.
* **No collection shortcut** for contested topics.
* **BC family must accept the setting**: the `contested` unit, the `facets` fanout and the template override.

---

## Method notes

Proposed concrete edits to `planning/anis-strategy-trees.md`, most important first.

1. **§1 step 1: give a test for own strategy vs setting.**
   * Proposed: *"SETTING if the nearest tree, given params, units and a template override, produces the ideal answer for
     every shape. STRATEGY if it needs a retrieval tier, a decision or an ending (an action, a safety branch) that the
     nearest tree lacks, or if other trees call it as a sub-tree. Report how_often; under 0.5 % with no distinct tier →
     setting."*
   * D4, D5 and E3 were judgement calls without this test.
   * The scope rule already settles "same task, another tradition". Say so explicitly in step 1 as well as in step 4.
    → **folded → §1 step 1 (own-task test: unique first search step or unique final shape; sub-tree callees are their own task; same-task-other-tradition settled by step 4); rejected: the 0.5 % frequency rule (frequency decides priority, not identity)**
2. **Steps 6 and 11 contradict each other about the last tier.**
   * Proposed: *"After the last tier, none → ABSENCE (a correct answer); error or unrouted → fallback.agent (a defect)."*
   * Allow `fallback.agent: answered → $end` as the one exception to "every path ends in a shape".
   * `tpl.absence` needs two first lines: none ("I can't find…") and error ("I couldn't search…").
    → **folded → §1 steps 6 and 11; rejected: `answered → $end` (an agent answer goes through the tree's main shape — every answer via the writer) and an error first line in tpl.absence (errors end in `tpl.unavailable`, §3)**
3. **Scope vs a tree's authority params is undefined.**
   * Both filter. Proposed: *"an element searches the INTERSECTION of scope and its params. An empty intersection is
     skipped (a free none)."*
   * A strategy that cannot work inside the floor (guidance under 'scripture only') declares `needs_floor`. Its first node
     widens authority as a routed outcome and says so.
   * Likewise, `search_originals = false` makes `search.originals` a free none.
   * Clarify too that a widen found by a tree is turn-only: it never patches `conversation_state.scope`. Only the reader
     widens the conversation.
    → **folded → §2 / §2b (element searches scope ∩ params; empty intersection = free none; a widen never patches conversation scope); rejected: `needs_floor` + tree widening — a guidance request sets the floor at the turn layer, and only E2 widens (open question for Chad in the brief)**
4. **Outcome classes are not tasks: add `internal: true` (E2).**
   * An internal strategy has no Jev card and is reached only by `hand.strategy`.
   * Step 6's last-tier none may route to `hand.strategy e2`.
   * Add to step 1: *"if the class only describes an outcome of another task, design it as an internal sub-tree or a
     shape."*
    → **folded → §1 step 1 (outcome classes become internal sub-trees or shapes), §2 `internal: true`, §1 step 6 (`$absence` = hand.strategy e2)**
5. **§2 lacks a code switch: add `route`.**
   * Params `on` (unit, or counts over found_passages) and `cases`; edges are the cases plus else.
   * Used here by d1, d5, e1 and guidance. Without it, a tree spends a Jev call on something code knows.
   * Also: a `judge` with empty evidence short-circuits in code to a declared option.
    → **folded → §2 `switch` (renamed from route); `judge` empty evidence short-circuits in code**
6. **The two-Jev limit must count sub-trees and define "first words".**
   * `hand.strategy` declares its maximum Jev count, and the path total includes it.
   * A `ui.stage` line counts as first words only when it is a code-known verdict.
   * `hand.strategy` needs an `error` edge and a defined return: the sub-tree's found_* merge into the caller's, and its
     own shape node is skipped.
    → **folded → §1 step 7 (sub-trees count; a verdict stage line is first words, a progress line is not), §2 `hand.strategy` (full outcome set + error, found_* merge, callee shape skipped with upto: evidence)**
7. **Missing params:**
   * `fetch.collection id/key` (here: consolation, crisis-help, rules, faith-facts, prayer-books; all keyed tradition ×
     topic)
   * `fetch.prayer key`
   * `rank by: length` (mode-aware) and `by: audience fit`
   * `stage:` on slow elements
   * `search.fanout facets`, and a list of `inner` elements
    → **folded → §2 params (`fetch.collection{id, key}`, `fetch.prayer{key}`, `rank by: length|audience|occasion`, `stage:`, `search.fanout{facets, inner list}`)**
8. **§2a gaps.**
   * **NEW units:**
     * `locale` (code; d1 crisis lines)
     * `institution` (code table from religions_specified; d3)
     * `contested` (Jev; the E3 setting)
   * **NEW enum values:** `reader_state` + `leaving` (d5); `output_form` + `steps` (d3).
   * **`religions_specified` should be "what the conversation is ABOUT"**, not whose reader it is. d5 weighs another faith,
     and e1 interfaith challenges need two traditions.
   * **Delete the old "slots" paragraph in step 4.** `needs:` units replace it.
   * **Inconsistency:** §2a marks `reader_state` and `audience` as not carried / carried respectively, while §2b puts both
     under `reader` (carried). Make §2a's carried column match §2b.
   * **Name mismatch:** `scope_source` values (§2a: conversation · reader · host · default) differ from the §2b layers
     (turn · conversation · reader · site). Use one set.
    → **folded → §2a (`locale`, `institution`, `contested`; reader_state + leaving; output_form + steps; religions_specified = what the conversation is about; carried column matches §2b; scope_source names aligned) and §1 step 4 (slots paragraph removed)**
9. **§2b scope clause: exceptions are needed.**
   * Comfort and crisis replies must not carry "(Bahá'í sources only; say 'all traditions' to widen)". It is jarring in
     grief.
   * Proposed: *"the scope clause is omitted when reader_state ∈ {grieving, in crisis}."*
   * Define the clause once as a shared template fragment (`tpl.scope_clause`) rather than per template.
   * Define when the scope "filtered" the reply: proposed *scope_source ≠ turn AND religions_specified ≠ all*. Measuring
     whether results were actually dropped would cost a second search.
    → **folded → §3 base `{{scope_clause}}` (once; omitted for grieving/in crisis); rejected: 'filtered = scope_source ≠ turn and ≠ all' — elements return `scope_excluded` free from the same query (A note 19), so the clause fires only when something was dropped**
10. **§2b state fields need more precise rules.**
    * **`offers`:** an entry must carry `{what, strategy, units, channel?, turn}`. Then "yes" runs the offered work
      directly (d1's prayer offer → prayer with occasion; d3's "send the passages" → email). Offers also need an expiry
      (proposed: they lapse after 2 turns or on a topic change).
    * **`given`:** say where repeats are skipped (proposed: at rank/shape, not at search, so "that passage" still
      resolves), and the exception for a request that resolves to a given passage ("say that prayer again").
    * **`reader.reader_state`:** say how it decays. `in crisis` should persist until Jev patches it. `grieving` should not
      silently colour an unrelated later question.
    * **`open`:** who clears it (proposed: code, when a later turn's strategy answers that topic with found_outcome one or
      several) and whether Anís may raise it unprompted (proposed: only in email/research depth).
    → **folded → §2b (offers {what, strategy, units, channel?, turn}, lapse after 2 turns or topic change; given skipped at rank/shape; reader_state decay; open cleared by code)**
11. **§3 voice "quotes ≤ 2 sentences" conflicts with "never clip".** Proposed: *"choose passages of ≤ 2 sentences; never
    clip a longer one, offer it by email; a prayer the reader asked to say is spoken in full."* Also add a crisis rule:
    on every channel, the help line comes first.
    → **folded → §3 modes (voice: choose ≤ 2-sentence passages, never clip, prayer in full; crisis help line first)**
12. **Step 4's "never a question back" needs exceptions** for safety and for comfort, where a gentle question back is part
    of the ideal answer.
    → **folded → §1 step 4 (exceptions: safety, comfort)**
13. **§3 "Original-language words" is Arabic/Persian-only, which breaks tradition-agnostic trees.**
    * Proposed: generalise it to `reads_scripts: [arabic, persian, hebrew, devanagari, pali/sanskrit, …]` with the same
      rule.
    * Name the transliteration source per script. For Arabic/Persian: CTAI or the library, in Shoghi Effendi's system.
      For other scripts: the library's own spelling, else IAST/ISO.
    * Without that, a Hebrew or Sanskrit original under d3/e1 has no rule at all.
    * Also state that the rule covers terms in prose, and that a prayer's or passage's original TEXT is shown in script
      beside the translation, never romanized whole.
    * Say whether `reads_*` is part of `state.reader` (§2b) or only the reader card. These trees assume it is carried in
      `state.reader`.
    → **folded → §2a `reads_scripts`, §3 base scripts rule (per-script transliteration source; original TEXT shown in script, never romanized whole; carried in state.reader from the reader card)**
14. **Size guidance.** "Lookups 3–6 nodes" is too tight once error and absence routing are complete (prayer: 9). Proposed:
    *"lookups ≤ 9, researched ≤ 14; shape and fallback nodes don't count."*
    → **folded → §2 graph limits (lookups ≤ 9 working nodes, researched ≤ 14, MAX_NODES 16; shared ends not counted)**
