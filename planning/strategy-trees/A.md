# Family A — lookups (A1 fact · A2 book · A3 passages · A4 quotation · A5 reference · A6 word · A7 original)

Written 11-09 by following `planning/anis-strategy-trees.md` §1 steps 1→12 literally, with §2 elements and §3 templates.
Design only. Elements not in §2 are marked **NEW:** and listed with what they wrap at the end of this header.

> **Consolidated 11-09** with the plan (BC, DE, FGH): every NEW element/unit below is now in the plan's §2/§2a, so "NEW"
> means "added by this family". Applied here: no tree widens scope (identity nodes `ww`, `pw`, `fw` and the widen tiers
> `shw`, `s3` removed; named things are ranked by scope, never filtered — plan §1 step 4); every absence node is the shared
> end `$absence` (runs E2, DE file); `ag`/`un` are the shared ends `$fallback`/`$unavailable`; node counts are working
> nodes only; `hand.strategy` edges are the full outcome set + error; `{{scope_line}}` → `{{scope_clause}}` (plan §3 base);
> `reads_arabic`/`reads_persian` → `reader_card.reads_scripts`. Where a convention below still differs, the plan wins.

**Conventions used in every tree below**
* **Units (§2a), not slots.** Each strategy lists `needs:` (unit · required/optional · default). Each node row has a
  `reads → writes` column naming units. Templates use `{{unit}}`. Implicit on every node (not repeated per row): every
  `fetch.*`/`search.*` reads the scope units (`religions_specified`, `authority_floor`, `named_sources`, `search_originals`)
  from `conversation_state.scope` and writes `found_outcome` (and `missing` on none); every `shape` reads `channel`,
  `depth`, `reply_language`, `reply_budget`.
* **NEW units used in this family** (each a code task; listed again in Method notes):
  * `path` — [node:edge], filled by the engine as the tree runs; templates read judge verdicts from it
    (`path.jr = stated_unclear_bearer`); measures count branches from it.
  * `web_found` — [{site, url, snippet}], filled by `search.web`; kept apart from `found_passages` so a web result can never
    be quoted as library evidence.
  * `fact_asked` — short text (date · place · author · age · count · translator …), filled by Jev in the strategy call (A1).
  * `incipit` — the opening words of a named passage ("the Tablet of Ahmad begins…"), filled by Jev (A5).
  * `translation_wanted` — translator id or "authorized", filled by Jev + code resolves; default authorized → work's default edition (A2, A5, A7).
  * `parallel_direction` — to_original · to_translation, filled by Jev (A7).
  * `target_lang` — lang code of the side wanted, filled by Jev; default: the work's original language (to_original) or `reply_language` (A7).
  * `scope_excluded` — count of hits a retrieval element dropped because of the scope, filled by every fetch/search from the
    same query; `{{scope_clause}}` fires only when > 0 (Method note 19).
* **conversation_state (§2b), common to all seven:** reads `state.scope` implicitly; reads `state.subjects` so a follow-up
  ("when did *he* die?", "is it in Persian?") fills `named_person`/`named_work`/`term` from the carried subject, not from
  re-parsing; reads `state.given` so a passage already quoted is not quoted again (template says "as quoted above" and
  links). At tree end code writes `state.given += quoted passages`, `state.thread += {turn, strategy, topic, found_outcome}`,
  `state.subjects` ← the resolved subject, `state.open += missing` when the tree ended thin/absence/unavailable, and
  `state.offers += …` when the template offers something ("send the link", "the whole tablet by email"). Per-strategy
  differences are on each strategy's **state** line.
* "Last-tier error" routes to `ag` (fallback.agent, logged as a defect) → `un` (shape `tpl.unavailable`, NEW). Absence is
  stated only when every tier answered *none*; a tier that *errored* never becomes "it is not in the library".
* Edge lists `a/b/c→x` mean each of those edges goes to x.
* **Scope (§1 step 4, §2):** every `fetch.*`/`search.*` node applies the scope units by default, so no tree names a
  tradition and none of these seven is per-religion. Params like `authority: scripture` are *tier filters inside the
  scope* (step 5's cheapest-authoritative-first), never a widening. No tree here widens: a scoped miss ends in
  `$absence` → E2, the one place scope widens (routed, and the reply says so). A named title, reference, quotation or
  person is ranked by the scope (in-scope copies first), never filtered; an out-of-scope hit is flagged `out_of_scope`.
* **`{{scope_clause}}` (§2b "Scope binds every strategy"; shared by every A template).** Fields resolve turn > conversation
  > reader > site; `scope_source` records the winner. When the answer was *filtered* by an inherited scope (scope_source ∈
  conversation · reader, `scope_excluded` > 0), the
  reply names it in ONE short clause the reader can act on: "{{religions_specified}} sources only, as you asked — say 'all
  traditions' to widen." Not emitted when scope_source = turn (the reader just said it), when religions_specified = all,
  or for a named thing that was found (ranked, not filtered: `scope_excluded` = 0). Written once in the plan's §3 base. Site-layer scope: emitted only when the scoped search missed — see Method
  notes. Voice: the clause is spoken only when the scoped answer was thin or absent.

**NEW elements / params used in this family** (each argued in Method notes)

| NEW | kind | wraps | used in |
|---|---|---|---|
| `switch` (element) | code decision | nothing new: evaluates one expression over units (which request unit is filled, `count(found_passages)`, `found_outcome`) and takes the matching case edge | A1, A6, A7 |
| `search.together` (element) | tool/code | Promise.all over a list of retrieval elements; merges into `found_passages`; returns the standard one·several·thin·none·error on the merged pool | A1, A3 |
| `tpl.unavailable` (shape) | template | "I couldn't reach the library just now" + retry offer; never claims absence | all |
| `shape.by_count` (param) | — | picks `one_passage` vs `passages` template from `count(found_passages)` in code | A1, A3 |
| `judge.mark` (param) | — | Jev marks which item(s) the chosen option applies to (`found_passages[i].marked` / `found_records[i].marked`) | A2, A4 |
| `hand.strategy.upto: evidence` (param) | — | run the sub-tree up to (not including) its `search.web`/`shape` nodes; `found` iff `found_passages` or `found_records` non-empty | A7 |
| `search.shelf.work` / `.lang` / `.query` / authority list (params) | — | scope fused_search to a work, a language, an explicit query string, or several authority kinds | A2, A3, A5, A7 |
| `rank.by` list + keys `copy`, `attributed`, `marked` (params) | — | `copy` = reader-named translation > work's default edition > reader's language > authorized translation > other; `attributed` = the reader's named author's own works first | A2, A4, A5 |
| `fetch.original.direction` (param) | — | one element for original_lookup / translation_lookup | A7 |
| ~~`widen: sources` (value)~~ | — | dropped at consolidation: trees never widen; E2 widens `named_sources` | — |
| `k` by depth (param form) | — | `k: {default: 4, research: 10}` | A3, A5 |
| `skip: given` (param on rank) | — | drops passages already in `state.given` (or keeps them flagged `given` so the template can say "as quoted above") | A1, A3, A4, A6 |

---

## A1 · `a1` — A fact

### 1. Name, type, card, difference
* **name** `a1` · **type** `A-lookup` · **setting_of** none.
* **description (card):** The reader wants one checkable fact — a date, a place, an author, an age, a count — about a named
  person, work, place, event or tradition. Anís states the fact in one to three sentences with its source linked.
* **difference:** vs `b5` (who was this person) it returns one fact, not a record of a life; vs `b4` (tell the story) no
  narrative; vs `a2` the reader wants a fact *about* a book, not the book. Decision: own task — "state one fact with its
  source" is not done by any neighbour, and it is 7.4 % of traffic.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| what happened to the body of the Báb after he was killed | b4 | a sequence of events, not one fact |
| Who wrote the Hidden Words? I have it down as Shoghi Effendi's work. | e1 | corrects the reader's stated premise (fact + pushback) |
| who was Ṭáhirih | b5 | a person record, not one fact |
| where can I read the Kitáb-i-Aqdas | a2 | wants the book |
| why was the Báb executed | b1 | asks a cause (explanation), not a fact |

### 3. Ideal answer per mode
* **voice:** "The Báb was executed in Tabríz, on the ninth of July 1850 — Nabíl tells it in The Dawn-Breakers." One sentence of context only if it changes the meaning; offer to send the source.
* **widget:** the fact in 1–2 sentences, source as linked citation text; ≤ 60 words.
* **site:** the fact, source linked, one line of context; if sources disagree, both in two short lines, authority first.
* **email:** the fact, the sentence that states it quoted in full, linked, translator/author named; disagreement shown with each source quoted.
* **research:** the fact, every library source stating it (authority order), where they differ and why (calendar, edition), ≤ 500 words.

### 4. Shapes and needs
Shapes: `record` (from a person/work record) · `one_passage` / `passages` (a sentence stating it; several = sources disagree or corroborate) · `absence`.

| unit | required / optional | default when empty |
|---|---|---|
| `named_person` | optional (one of named_person · named_work · topic required) | none → `sw` skips the person record |
| `named_work` | optional (as above) | none → `sw` skips the work record |
| `topic` | optional (as above): a place, event or tradition as subject | the question |
| NEW `fact_asked` | required | the most likely fact for the subject (person → dates; work → author + date) |
| `previous_evidence` | optional ("when was *that* written?") | [] |

Scope used: every tier, record lookups too (a named person or work is ranked by scope, never filtered). No widen node
(consolidation 11-09): a scoped miss ends in `$absence` → E2, the one place scope widens. The old `subject_kind` slot is gone:
`sw` branches on which request unit Jev filled, so no NEW unit is needed for it.

**state:** reads `state.subjects` (follow-up "and when did he die?" → `named_person` carried), `state.given`. Writes
`state.subjects.named_person|named_work` (the resolved bearer/work), `state.offers` ("send the link" on voice; "if you meant
<other bearer>" on `stated_unclear_bearer`, so a "yes, the other one" resolves there), `state.open` on o_abs/un.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| sw | NEW `switch` | on: first filled of [named_person, named_work] | named_person, named_work → — | person→per · work→wn · neither→sh |
| per | fetch.person | name: {{named_person}} | named_person → found_records, named_person (bearer) | one→jr · several→jr · none→sh · error→sh |
| wn | fetch.work_notes | work: {{named_work}} | named_work → found_records | one→jr · none→sh · error→sh |
| jr | judge | q: "Does this record state {{fact_asked}}?" options: **stated** — the record gives it and the bearer is clear · **stated_unclear_bearer** — it gives it but several bearers of the name fit; answer the most prominent, offer the other · **not_stated** — the record lacks this fact | found_records, fact_asked, previous_conversation_rounds → path | stated→o_rec · stated_unclear_bearer→o_rec · not_stated→sh |
| sh | NEW `search.together` | [search.shelf{authority:[history, scripture, interp, guidance, other], query:"{{named_person}}{{named_work}}{{topic}} {{fact_asked}}", k:6}, search.hype{shelf:any}] | named_person, named_work, topic, fact_asked → found_passages | one→jp · several→jp · thin→jp · none→wb · error→ag |
| jp | judge.passages | — | found_passages, fact_asked → found_passages (verdict per passage) | answers→rk · conflict→rk · mentions_only→wb |
| rk | rank | by:[authority, date], k:3, skip: given | found_passages, state.given → found_passages | done→ra |
| ra | read.around | — | found_passages → found_passages (context) | done→o_p |
| wb | search.web | query: same as sh | named_person, named_work, topic, fact_asked → web_found | one→o_abs · none→o_abs · error→o_abs |
| ag | fallback.agent | — | current_user_question, found_* → reply | answered→$end · fail→un |
| o_rec | shape | a1.record | found_records, fact_asked, path | done→$end |
| o_p | shape | by_count {1: a1.one_passage, n: a1.passages} | found_passages, fact_asked | done→$end |
| o_abs | `$absence` (E2; a1.absence = its template override) | — | missing, web_found, found_passages | (shared end) |
| un | shape | tpl.unavailable | missing | done→$end |

11 working nodes (+ shared ends `$absence`, `$fallback` ag, `$unavailable` un). Jev decisions before first words: ≤ 2 (jr, jp).

```
sw ─person→ per ─one/several→ jr ─stated(_unclear)→ o_rec
  │            └none/error──┐   └not_stated──┐
  ├work──→ wn ─one→ jr      ▼                ▼
  │           └none/error→ sh ◄──────────────┘
  └other────────────────→ sh ─one/several/thin→ jp ─answers/conflict→ rk → ra → o_p
                              ├none→ wb ─*→ o_abs ($absence → E2)   └mentions_only→ wb
                              └error→ ag ─answered→$end / fail→ un
```

Paths: **clean hit** sw→per→jr(stated)→o_rec · **several** (bearers) per(several)→jr(stated_unclear_bearer)→o_rec; (passages) sh(several)→jp→rk(k 3)→ra→o_p[passages] ·
**thin** sh(thin)→jp: answers → o_p; mentions_only → wb · **widened** only inside E2 (consolidation 11-09: a tree never widens) · **none after all tiers** sh(none)→wb(none)→o_abs ($absence → E2) ·
**error** per(error)→sh; sh(error)→ag→un · **conflicting** sh→jp(conflict)→rk(authority)→ra→o_p[a1.passages, "sources differ"].

### 6. Templates
* `a1.record` — {{base}} "Open with {{fact_asked}} of {{named_person}}{{named_work}} in one sentence, from the record
  ({{found_records}}). Link the record (biography page or catalogue entry). If `path.jr = stated_unclear_bearer`, answer
  for the most prominent bearer and add one line: 'If you meant <other bearer>, …' (that line is a `state.offers` entry).
  One line of context only if it changes the meaning. {{scope_clause}}"
  * voice: "Say the fact; name the source in words ('according to his biography in the library'). Offer to send the link."
* `a1.one_passage` — "{{fact_asked}} first, then the sentence from {{found_passages}} that states it, quoted exactly,
  linked, author named; a passage already in `state.given` is cited 'as quoted above', not requoted. If a passage is `out_of_scope`, name
  where it comes from ('a history of <tradition>…', 'a scholar writes…'). {{scope_clause}}"
* `a1.passages` — "If the passages agree: the fact, then the strongest source quoted, others as linked titles. If they
  conflict: 'Sources differ:' then each value with its source, highest authority first; say what likely explains the
  difference (calendar, edition, transliteration) only if a passage says so. {{scope_clause}}"
  * voice: "Say both values with their sources in two sentences; no explanation unless a source gives one."
* `a1.absence` — over `tpl.absence`: "Say the library does not state {{fact_asked}} for this subject — 'the library' only
  if `found_outcome.shw = none`; if shw errored, '{{religions_specified}} sources' and nothing about the rest. If {{web_found}} is present, give it as 'Outside the library, <site> says …',
  labelled, linked (not on voice). Then the nearest library passage from {{found_passages}}, labelled nearest."

### 7. Speed, measures, tests
* **target_time** ≤ 3 s (record path ≤ 1 s).
* **measures** judge score · p50 ms · $ · branch (record / passage / widened / web / absence) · absence rate · widen rate by scope · web-label rate · fallback rate · conflict rate.
* **tests:** "what year did Shoghi Effendi pass away" · "where is the Shrine of the Báb located" · "how many verses are in the Kitáb-i-Aqdas" · "when was the Bhagavad Gita composed" · "who translated the Hidden Words into English"
* **must_not:** "tell me about the life of Quddús" (b5) · "how did the Bahá'í Faith spread to Africa" (b4) · "the Kitáb-i-Íqán online" (a2)

### 8. Open issues
* `fetch.work_notes` covers ~56 canon works; others fall to the shelf tier (works, just slower). Extending the catalogue fields to all works removes most `wn→sh` hops.
* Places and events have no record element (the entity graph is not in §2). Until a `fetch.entity` exists they go straight to the shelf.
* Web for general-religion facts ("how old is Taoism"): this tree allows it only after the library tiers, labelled, inside the absence shape. Chad to confirm.
* ~~This tree ends in its own absence shape~~ — superseded at consolidation (decision 1): last-tier none → `$absence` (E2) with `a1.absence` as the template override; the nearest passage already in `found_passages` is passed in.

---

## A2 · `a2` — Find a book

### 1. Name, type, card, difference
* **name** `a2` · **type** `A-lookup` · **setting_of** none.
* **description (card):** The reader names or describes a book, tablet or work and wants to read it. Anís gives the library's
  own copy, linked, title in italics as the link, with one line on what it is — the book itself, not a talk about it.
* **difference:** vs `reference` the reader wants the whole work, not a numbered passage in it; vs `a1` the work itself, not a fact about it. Own task.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| Hidden Words Arabic 5 | reference | a numbered passage inside the book |
| hidden words worksheet pdf | f3 | a teaching handout, not the book |
| who wrote The Dawn-Breakers | a1 | a fact about the book |
| what is the Kitáb-i-Íqán about | b2 | asks the content explained |
| books on the equality of women and men | a3 / f1 | a topic, not a named work |

### 3. Ideal answer per mode
* **voice:** "*The Kitáb-i-Íqán* — the Book of Certitude — is in the library. Shall I send you the link?"
* **widget:** the italic title as the link, one line on what it is (author, year). Nothing else.
* **site:** same; several → best match first, then up to 4 others as a short list (editions/translations labelled).
* **email:** best copy linked, translator and edition named, other editions/translations listed.
* **research:** the copy, every edition/translation the library holds, translator and year, one paragraph on what it is, 2–3 related works.

### 4. Shapes and needs
Shapes: `titles` (one or several) · `absence` (nearest titles; a web location labelled).

| unit | required / optional | default when empty |
|---|---|---|
| `named_work` | required — Jev's canonical title when he recognises a description or misspelling ("bok of certitude" → Kitáb-i-Íqán); code resolves to a work id when it can | the reader's words as given (unresolved title text) |
| `named_person` | optional — the author | none |
| `reply_language` | optional — or the language asked ("in sanskrit") | language of the question |
| NEW `translation_wanted` | optional ("Shoghi Effendi's translation") | authorized translation, else the work's default edition |

Scope used: traditions + languages on `w`; a title is a named thing, so scope only ranks its hits (decision 2) — a
Bahá'í-scoped conversation asking for the Upanishads finds them, in-scope copies first. No widen node.

**state:** reads `state.subjects.named_work` ("is it in Persian?" → the carried work, language from the question).
Writes `state.subjects.named_work` (the resolved work id), `state.offers` (voice: "send the link"), `state.open` on o_abs/un.
Nothing is quoted, so `state.given` is untouched.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| w | fetch.work | title: {{named_work}}, author: {{named_person}}, lang: {{reply_language}} (named thing: scope ranks, never filters) | named_work, named_person, reply_language → found_records | one→o · several→j · none→s · error→s |
| j | judge (mark) | q: "Several titles matched. Which is the book asked for?" options: **one_is_it** — one title is clearly the book; mark it · **editions** — copies/translations of the same book; mark all · **different_books** — different works each fit the words; mark those that fit | found_records, current_user_question, previous_conversation_rounds → found_records[].marked, path | one_is_it→rk · editions→rk · different_books→rk |
| rk | rank | by:[marked, copy], k:5 | found_records, translation_wanted, reply_language → found_records | done→o |
| s | search.shelf | query: "{{named_work}} {{named_person}}", k:5, group: work | named_work, named_person → found_records (nearest titles) | one→o_abs · several→o_abs · thin→o_abs · none→wb · error→ag |
| wb | search.web | query: "{{named_work}} {{named_person}}" | named_work, named_person → web_found | one→o_abs · none→o_abs · error→o_abs |
| ag | fallback.agent | — | current_user_question, found_* → reply | answered→$end · fail→un |
| o | shape | a2.titles | found_records, path, scope_source | done→$end |
| o_abs | `$absence` (E2; a2.absence = its template override) | — | named_work, found_records, web_found | (shared end) |
| un | shape | tpl.unavailable | missing | done→$end |

6 working nodes (+ shared ends). One Jev decision at most.

```
w ─one──────────────────────→ o          (w ranks by scope, never filters: decision 2)
 ├several→ j ─*→ rk(marked, copy) → o
 └none/error→ s ─one/several/thin→ o_abs   (nearest titles)
                ├none→ wb ─*→ o_abs        (web location, labelled)
                └error→ ag → $end | un
```

Paths: **clean** w(one)→o · **several** w→j→rk→o · **out of scope** w(one, an out-of-scope title ranked after in-scope ones)→o, no widening needed · **thin** s(thin)→o_abs (nearest titles, not claimed) · **none** w→s(none)→wb→o_abs ·
**error** w(error)→s; s(error)→ag→un · **conflicting** (two copies differ, e.g. an old translation and the authorized one) j(editions)→rk(copy)→o: authorized first, the other labelled.

### 6. Templates
* `a2.titles` — {{base}} "The best match from {{found_records}} as *italic title = link*, then one line: author, year,
  what it is. If more than one item: the rest as a short list, each a linked italic title with its edition/translator. No
  preamble; nothing about the content unless asked. Never a talk *about* the book in place of the book. If the title is `out_of_scope`: say
  so in a few words, always. Reader's own restriction (scope_source = conversation):
  'It is outside the {{religions_specified}} works you asked for, but the library holds it:'. Reader/site scope: a
  parenthesis naming the work's tradition after the title is enough ('— a Hindu scripture'). {{scope_clause}} (normally silent here: a found title is not filtered)."
  * voice: "Say the title and author; say it is in the library; offer to send the link. Several: name the best one, say there are N others."
  * email: "Add translator and edition; list all copies held."
* `a2.absence` — over `tpl.absence`: "'The library doesn't hold *{{named_work}}*.' ('The library', because ww and s
  searched every tradition; if they errored, say '{{religions_specified}} works'.) Then up to 3 nearest titles from
  {{found_records}}, labelled 'nearest in the library'. If {{web_found}}: 'It is available at <site>' — labelled outside
  the library."

### 7. Speed, measures, tests
* **target_time** ≤ 1 s.
* **measures** judge score · p50 · $ · branch (one / several / nearest / web) · absence rate · fallback rate · link-correct rate (title link resolves to the asked work, spot-checked).
* **tests:** "where can I find Some Answered Questions" · "Gleanings from the Writings of Bahá'u'lláh full text" · "the Seven Valleys in Persian" · "Tao Te Ching Legge translation" · "that book by Nabíl about the early believers"
* **must_not:** "Gleanings 27" (reference) · "summary of Some Answered Questions" (b2) · "when was the Seven Valleys written" (a1)

### 8. Open issues
* `fetch.work` returns `several` both for editions of one work and for different works. If code collapsed editions by work id, `j` would only run for genuinely different works (fewer Jev calls). Proposed in Method notes.
* Default edition order (`rank.copy`) needs Chad's confirmation: reader-named > authorized translation > OceanLibrary copy > reader's language > other.
* "Give the essence of this talk" (A2 + B2) is two strategies; Jev's multi-type choice, not this tree.

---

## A3 · `a3` — Passages on a topic

### 1. Name, type, card, difference
* **name** `a3` · **type** `A-find` · **setting_of** none.
* **description (card):** The reader wants the text itself on a subject — what a tradition, a work or the Writings say about
  X, verses or quotes on X (a short set, now). Anís quotes the most authoritative passage exactly, linked, with two or three
  more when the subject has several.
* **difference:** vs `understanding` (B1) it gives the passages, not an explanation; vs `compilation` (F1) a handful now, not a gathered collection as a job; vs `a4` a topic, not given words. Own task (15.9 %, the largest class).

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| Find quotes on the mystery of sacrifice and suffering | compilation | "quotes" plural/gather = a compilation job |
| what does the Bahá'í Faith teach about life after death | understanding | wants the teaching explained |
| who said "justice is the best beloved" | a4 | words given, wants their source |
| Bible and Qur'an on forgiveness compared | comparison | two traditions side by side |
| a prayer for healing | prayer | an occasion → prayer index |

### 3. Ideal answer per mode
* **voice:** one passage, spoken (≤ 2 sentences quoted), author and work said in words; "There are two more — shall I send them?"
* **widget:** the strongest passage quoted, linked; others by linked title. ~150 words.
* **site:** 1–4 passages in authority order, each quoted exactly and linked, one framing line, no essay. 150–250 words.
* **email:** 3–6 passages in full, original beside English where the original is held, translator named.
* **research:** 6–10 passages grouped by authority (Writings, Guardian, House of Justice, then labelled others), each with one line of context.

### 4. Shapes and needs
Shapes: `one_passage` · `passages` · `absence`.

| unit | required / optional | default when empty |
|---|---|---|
| `topic` | required | the question |
| `named_sources` | optional (scope unit, read implicitly: "in the Hidden Words", "where does Bahá'u'lláh say") | [] |
| `search_originals` | optional (scope unit) | true for teachings |
| `previous_evidence` | optional ("more like that one") | [] |

Scope used: traditions, authority floor, named sources and originals — no work/author/tradition units of its own. s1 and
s2 are tier filters *inside* the scope (s2 runs only the authority kinds the floor admits). No widen node: a scoped miss
ends in `$absence` → E2, which may widen (named sources, then traditions), routed and stated.

**state:** reads `state.subjects.topic` ("more on that"), `state.given` (rk `skip: given` — "more passages" never repeats
the ones already quoted; a passage re-found is cited "as quoted above"). Writes `state.given += quoted`,
`state.subjects.topic`, `state.offers` (widget: "the rest as linked titles" → "show me the second one" resolves to
`state.given`/the listed titles), `state.open` += `missing` on o_abs/un (and when E2 answered from a widened scope).

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| c | fetch.collection | topic: {{topic}} | topic → found_passages | one→rk · thin→s1 · none→s1 · error→s1 |
| s1 | NEW `search.together` | [search.shelf{authority: scripture, k:8}, search.hype{shelf: scripture}, search.originals{runs when search_originals}] | topic, search_originals → found_passages | one→j1 · several→j1 · thin→s2 · none→s2 · error→s2 |
| j1 | judge.passages | — | found_passages, topic → found_passages (verdicts) | answers→rk · conflict→rk · mentions_only→s2 |
| s2 | search.shelf | authority: [interp, guidance, other] ∩ authority_floor, k:8 | topic → found_passages | one→j2 · several→j2 · thin→j2 · none→j2 · error→ag |
| j2 | judge.passages | — (over all of found_passages; empty → mentions_only without a call) | found_passages, topic → found_passages (verdicts) | answers→rk · conflict→rk · mentions_only→o_abs |
| rk | rank | by:[authority, score], k: {default 4, research 10}, skip: given | found_passages, state.given, depth → found_passages | done→src |
| src | read.source | — | found_passages → found_passages (primary work) | traced→ra · kept→ra |
| ra | read.around | — | found_passages → found_passages (context) | done→o |
| ag | fallback.agent | — | current_user_question, found_* → reply | answered→$end · fail→un |
| o | shape | by_count {1: a3.one_passage, n: a3.passages} | found_passages, topic, religions_specified | done→$end |
| o_abs | `$absence` (E2; a3.absence = its template override) | — | topic, missing, found_passages, found_outcome | (shared end) |
| un | shape | tpl.unavailable | missing | done→$end |

9 working nodes (+ shared ends). ≤ 2 Jev decisions (j1, j2).

```
c ─one──────────────────────────────────────→ rk → src → ra → o
 └thin/none/error→ s1 ─one/several→ j1 ─answers/conflict→ rk
                     │                └mentions_only→ s2
                     └thin/none/error──────────────→ s2 ─hit→ j2 ─answers/conflict→ rk
                                                        ├none→ j2 (empty → mentions_only)  └mentions_only→ o_abs ($absence → E2)
                                                        └error→ ag → $end | un
```

Paths: **clean** c(none)→s1(one)→j1(answers)→rk→src→ra→o[one_passage] (or c(one)→rk… once collections exist) ·
**several** s1(several)→j1→rk(k 4)→…→o[passages] · **thin** s1(thin)→s2→j2 judges scripture-thin + interpretation hits together ·
**widened** only inside E2 (a named source lacking the topic: E2 widens to the whole scope, routed, and says so) ·
**none after all tiers** s1(none)→s2(none)→j2(empty→mentions_only)→o_abs ($absence → E2) · **error** s1(error)→s2; s2(error)→ag→un ·
**conflicting** j1/j2(conflict)→rk(authority)→…→o[a3.passages with attribution].

### 6. Templates
* `a3.one_passage` — {{base}} "One framing line that answers {{topic}} in the passage's own point, then the passage
  quoted exactly, linked to its paragraph, author and work named, translator named when not the author. Never paraphrase in
  place of the quote; never clip it mid-sentence. {{scope_clause}}"
  * voice: "Say who wrote it and where, then the passage (two sentences at most, whole sentences). Offer to send the rest."
* `a3.passages` — "A direct one-line answer to {{topic}}, then 2–4 passages from {{found_passages}} in authority order by
  each passage's authority kind: scripture, authoritative interpretation, institutional guidance, then others labelled as
  such (pilgrim note, scholarship) — for the Bahá'í Writings that reads the Writings, the Guardian, the House of Justice.
  (Widened passages come only from E2, which words them itself.) Each
  quoted exactly and linked. A passage already in `state.given` is not requoted: 'the passage quoted above from <work>'.
  If a `conflict` verdict is present, show both passages, attributed, in authority order, and say plainly they differ. A
  passage traced by read.source is cited from its primary work. A Persian/Arabic hit with no authorized translation is
  shown in the original and named 'no authorized translation' — never translated. {{scope_clause}} — this is the list case
  §2b names: emitted whenever the inherited scope dropped hits (`scope_excluded` > 0), e.g. 'Bahá'í Writings only, as you asked; say "all traditions" to widen'."
  * widget: "Quote only the first; list the rest as linked titles (they go to `state.offers`, so 'the second one' resolves)."
  * email: "Quote all in full; original beside English (```bilingual) when held."
* `a3.absence` — over `tpl.absence`: "Say what was searched and found nothing that speaks to {{topic}} directly — 'the
  library' only if `found_outcome.s3 = none`, otherwise '{{religions_specified}} sources'. Then the nearest passages from
  {{found_passages}} (they mention it) labelled 'nearest — mentions the subject'. No web."

### 7. Speed, measures, tests
* **target_time** ≤ 3 s.
* **measures** judge score · p50 · $ · branch (collection / scripture / interp+other / widened / absence) · share answered at s1 (scripture) · widen rate by scope · absence rate · fallback rate · conflict rate · traced share.
* **tests:** "what does Bahá'u'lláh write about trustworthiness" · "verses in the Psalms about waiting on the Lord" · "Gita on doing your duty without attachment" · "passages from 'Abdu'l-Bahá on the education of children" · "what does the Qur'an say about orphans"
* **must_not:** "compile everything on the Covenant for a deepening" (compilation) · "explain the Bahá'í view of the soul" (understanding) · "is 'the earth is but one country' a real quote" (a4)

### 8. Open issues
* `fetch.collection` is to build: until then it always returns `none` (one cheap call) and the tree starts at s1. Keep the node so collections slot in without a new version.
* `search.originals` runs when `search_originals` is true (Jev's per-turn scope unit), not by tradition; today
  its index holds Persian/Arabic, so for other traditions it returns none cheaply until their originals are indexed.
* s2 merges the interpretation, guidance and "other" tiers into one call (same cost); `rank` restores authority order. If measures show s2 often answers only from "other", split it.

---

## A4 · `a4` — Quotation trace

### 1. Name, type, card, difference
* **name** `a4` · **type** `A-trace` · **setting_of** none.
* **description (card):** The reader gives words — quoted, pasted, half-remembered or misspelt — and wants to know whether
  they are real and where they come from. Anís gives a verdict first (found · found in different wording · not a quotation ·
  not found), then the real passage, linked.
* **difference:** vs `a3` the reader supplies the words, not a topic; vs `a7` the reader wants provenance, not a parallel text. Own task (11 %).

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| Show me the Persian original of "the earth is but one country" | a7 | wants the original beside it |
| Psalm 23 | reference | a reference, no words to trace |
| what does "the earth is but one country" mean | understanding | wants it explained |
| quotes about unity | a3 | a topic |
| Bahá'u'lláh never said that, did he? (about an earlier answer) | e1 | pushback on an earlier claim |

### 3. Ideal answer per mode
* **voice:** "Yes — Bahá'u'lláh wrote that, in the Gleanings, section 117." / "Those exact words aren't in the library; the nearest is…" Offer to send.
* **widget:** verdict line, the real passage quoted and linked, author and work. ≤ 100 words.
* **site:** verdict, passage, author, work, paragraph link; if it sits in a secondary book, the primary source it quotes.
* **email:** verdict, the passage in full, original beside it when held, translator, and where else it is quoted.
* **research:** verdict, the primary passage, the chain (first publication → later quotations), variant wordings with sources.

### 4. Shapes and needs
Shapes: `verdict` (all found outcomes) · `not_found` (web origin labelled).

| unit | required / optional | default when empty |
|---|---|---|
| `quoted_words` | required — the reader's words, copied verbatim by code from Jev's marked span | none possible |
| NEW `quoted_clean` | optional — Jev's normalised form of the same words, spelling and abbreviations folded ("poor in ur midst r my trust" → "the poor in your midst are My trust") | = quoted_words |
| `named_person` | optional — the figure the reader attributes it to ("Rumi said", "Buddha") | none |
| `previous_answer` | optional — "is that a real quote?" about Anís's own last reply (code copies the span) | none |

Scope used: quoted words are a named thing, so every tier searches the whole library and the scope only ranks (in-scope
copies first; decision 2). A hit outside the scope is itself part of the verdict ("not the Buddha — it is in <work>").

**state:** reads `state.given` (the words match a passage already quoted → verdict cites it "as quoted above", no new
lookup needed only when the match is exact — p1 still runs, it is cheap) and `state.thread` ("did he really say that?"
after a quote in the previous reply → `quoted_words` from that reply). Writes `state.given += the real passage`,
`state.subjects.named_person` (the actual author), `state.offers` (voice "offer to send"), `state.open` on o_nf/un.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| p1 | fetch.phrase | mode: exact, words: {{quoted_clean}} (quoted words: scope ranks, never filters) | quoted_clean → found_passages | one→src · several→rk · none→p2 · error→p2 |
| p2 | fetch.phrase | mode: close, words: {{quoted_clean}} | quoted_clean → found_passages | one→jv · several→jv · thin→jv · none→sh · error→sh |
| sh | search.shelf | query: {{quoted_clean}}, k:5, scope: rank | quoted_clean → found_passages | one→jv · several→jv · thin→jv · none→wb · error→ag |
| jv | judge (mark) | q: "How does the best library hit relate to the reader's words?" options: **same_passage** — the same passage in another translation/edition or misremembered wording; mark it · **paraphrase** — expresses the idea of a real passage but is not its words; mark it · **not_it** — no hit is this saying | found_passages, quoted_words → found_passages[].marked, path | same_passage→rk · paraphrase→rk · not_it→wb |
| rk | rank | by:[marked, attributed, authority, date], k:3 | found_passages, named_person → found_passages | done→src |
| src | read.source | — | found_passages → found_passages (primary work) | traced→ra · kept→ra |
| ra | read.around | — | found_passages → found_passages (context) | done→o |
| wb | search.web | query: "\"{{quoted_words}}\" origin {{named_person}}" | quoted_words, named_person → web_found | one→o_nf · none→o_nf · error→o_nf |
| ag | fallback.agent | — | current_user_question, found_* → reply | answered→$end · fail→un |
| o | shape | a4.verdict | found_passages, path, named_person | done→$end |
| o_nf | `$absence` (E2; a4.not_found = its template override) | — | quoted_words, named_person, web_found, found_passages | (shared end) |
| un | shape | tpl.unavailable | missing | done→$end |

9 working nodes (+ shared ends). One Jev decision at most.

```
p1 ─one──────────────→ src → ra → o
  ├several→ rk ────────↗
  └none/error→ p2 ─one/several/thin→ jv ─same_passage/paraphrase→ rk
               └none/error→ sh ─hit→ jv       └not_it→ wb ─*→ o_nf
                             ├none→ wb
                             └error→ ag → $end | un
```

Paths: **clean** p1(one)→src(kept)→ra→o ["found"] · **several** p1(several)→rk(attributed, authority, earliest)→src(traced to primary)→ra→o ·
**out of scope** p1(one, ranked after in-scope copies)→src→ra→o ["found — in <work>, not in <scope/attributed figure>"] ·
**thin** p2(thin)→jv(same_passage)→rk→…→o ["different wording"] · **none after all tiers** p1→p2→sh(none)→wb→o_nf ($absence → E2) ·
**error** p1/p2(error)→next tier; sh(error)→ag→un · **conflicting** (words found, but under another author than `attributed_to`)
p1→rk→src→ra→o: verdict says "found — but it is <author>'s, not <attributed_to>'s".

### 6. Templates
* `a4.verdict` — {{base}} "First words are the verdict, read from {{path}}: exact hit (p1 one|several) → 'Yes —
  <author> wrote this, in <work>.' · `path.jv = same_passage` → 'Found, in different wording:' · `path.jv = paraphrase` →
  'Not a quotation — it echoes this passage by <author>:'. If {{named_person}} differs from the passage's author, or the
  hit is out of scope (`out_of_scope` on the passage), say so in the verdict line ('Not the Buddha — it is from <work>'). Then the
  real passage quoted exactly, linked to its paragraph; if read.source traced it, cite the primary work and add 'quoted in
  <secondary>'. If the passage is already in `state.given`: 'Yes — it is the passage quoted above from <work>' and link it,
  no requote. No {{scope_clause}}: provenance is answered across the whole library."
  * voice: "Verdict and source in one sentence; the passage only if ≤ 2 sentences; offer to send."
  * email: "Add the original beside it when held, and other places it is quoted."
* `a4.not_found` — over `tpl.absence`: "'Those words aren't in the library.' (Every tier searched the whole library, so 'the
  library' is true — unless sh errored, which routes to `un`, never here.) If {{web_found}} names an origin: 'It is usually
  attributed to {{named_person}}; outside the library, <site> traces it to <origin>' — labelled, linked (not on voice). If
  {{named_person}} is a figure whose writings the library holds, add: 'It is not in <figure>'s writings held here.' If
  {{found_passages}} holds a nearest passage, give it labelled 'nearest'."

### 7. Speed, measures, tests
* **target_time** ≤ 1 s (p1/p2 paths); ≤ 3 s when sh/wb run.
* **measures** judge score · p50 · $ · verdict branch (exact / different wording / paraphrase / not found) · traced share · web-label rate · fallback rate · misattribution-caught rate.
* **tests:** "did Bahá'u'lláh say 'the best beloved of all things in My sight is Justice'" · "who wrote 'be generous in prosperity and thankful in adversity'" · "is 'be the change you wish to see' from Gandhi" · "where does it say 'knowledge is as wings to man's life'" · "luv ur neighbr as urself bible?"
* **must_not:** "the Arabic original of 'O Son of Spirit'" (a7) · "John 3:16" (reference) · "passages about generosity" (a3)

### 8. Open issues
* Garbled input relies on Jev filling `quoted_clean` (no extract LLM step). If p1/p2 miss often on garbled input, measure before adding one.
* Web naming the real origin of misattributed sayings (fake Buddha/Rumi) is allowed here only in `o_nf`, labelled. Chad to confirm.
* A quote in Persian/Arabic: `fetch.phrase` is assumed multilingual; if not, add `search.originals` to sh.
* p1 then pw doubles the exact lookup on a scoped miss (≈ 2 × a few ms). If the phrase index cannot filter by scope
  cheaply, run p1 unscoped and let `rank` put in-scope hits first — same answers, one node fewer. Measure which.

---

## A5 · `reference` — Look up a reference

### 1. Name, type, card, difference
* **name** `reference` · **type** `A-lookup` · **setting_of** none.
* **description (card):** The reader gives a chapter-and-verse, surah, numbered paragraph or a passage's well-known name
  (Psalm 23, Ayat al-Kursi, Hidden Words Arabic 5) and wants that text. Anís gives the text, linked, its translation named.
* **difference:** vs `a2` a passage inside a work, not the work; vs `a4` a reference, not words to trace. Own task.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| معنی آیه الکرسی (meaning of Ayat al-Kursi) | understanding (+ reference) | asks the meaning |
| golden rule bible verse | a3 | a topic, no reference |
| the Kitáb-i-Aqdas | a2 | the whole work |
| Persian of Hidden Words Persian 3 | a7 | wants the original beside it |
| who wrote Psalm 23 | a1 | a fact about the passage |

### 3. Ideal answer per mode
* **voice:** "Psalm 23, in the King James Version: 'The Lord is my shepherd; I shall not want…'" — whole verses, ≤ 2 sentences, then offer to send it.
* **widget:** the text, whole, linked, translation named. A long unit (a whole surah or chapter): the opening verses whole + "the full chapter (N verses)" linked.
* **site:** the same, with verse numbers.
* **email:** the whole unit; original beside the translation when held.
* **research:** the passage, the library's other translations beside it, and one line of context (where it sits in the work).

### 4. Shapes and needs
Shapes: `one_passage` · `titles` (the work, when the paragraph can't be opened) · `absence`.

| unit | required / optional | default when empty |
|---|---|---|
| `scripture_reference` | required — parsed by code; for named passages Jev gives the canonical form first ("Ayatul Kursi" → Qur'án 2:255; "Lord is my shepherd" → Psalm 23) and code parses that | none possible |
| `named_work` | optional | from the parsed reference |
| NEW `incipit` | optional — opening words when Jev knows them | empty (p returns none at once) |
| NEW `translation_wanted` | optional (Jev / reader card) | the work's default edition (`rank.copy`) |

Scope used: languages (which translation/original first) and traditions on `f`, as ranking only: a reference names its
own work (decision 2); "John 3:16" in a Bahá'í-scoped conversation is still John 3:16.

**state:** reads `state.subjects.named_work` ("verse 5 of it", "the next verse" → reference relative to the last one in
`state.given`). Writes `state.given += the unit shown`, `state.subjects.named_work`, `state.offers` (long unit: "the full
<unit> by email" / voice "send the rest" — a "yes" resolves there), `state.open` on o_abs/un.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| f | fetch.reference | ref: {{scripture_reference}}, translation: {{translation_wanted}} (named thing: scope ranks, never filters) | scripture_reference, translation_wanted → found_passages | one→ra · several→rk · none→p · error→p |
| rk | rank | by:[copy], k: {default 1, research 3} | found_passages, translation_wanted, reply_language → found_passages | done→ra |
| p | fetch.phrase | mode: close, words: {{incipit}}, work: {{named_work}}, scope: rank | incipit, named_work → found_passages | one→ra · several→rk · thin→w · none→w · error→w |
| w | fetch.work | title: {{named_work}}, scope: rank | named_work → found_records | one→o_w · several→o_w · none→o_abs · error→ag |
| ra | read.around | — | found_passages → found_passages (whole unit) | done→o |
| ag | fallback.agent | — | current_user_question, found_* → reply | answered→$end · fail→un |
| o | shape | reference.passage | found_passages, scripture_reference | done→$end |
| o_w | shape | reference.work | found_records, scripture_reference | done→$end |
| o_abs | `$absence` (E2) | — | scripture_reference, missing | (shared end) |
| un | shape | tpl.unavailable | missing | done→$end |

7 working nodes (+ shared ends). No Jev decision (edition choice is code: `rank.copy`).

```
f ─one──────────→ ra → o
 ├several→ rk ──→ ra
 └none/error→ p ─one→ ra │ several→ rk
                └thin/none/error→ w ─one/several→ o_w
                                     ├none→ o_abs
                                     └error→ ag → $end | un
```

Paths: **clean** f(one)→ra→o · **several** (editions) f→rk(copy)→ra→o · **out of scope** f(one, ranked)→ra→o (no remark needed: the reader named the work) · **thin** p(thin)→w→o_w ·
**none after all tiers** f→p→w(none)→o_abs ($absence → E2) · **error** f/p(error)→next; w(error)→ag→un ·
**conflicting** (versification differs: Hebrew vs Septuagint psalm numbers; Qur'án verse numbering) f(several)→rk→ra→o, template names the other numbering.

### 6. Templates
* `reference.passage` — {{base}} "The text of {{scripture_reference}} first — no preamble — whole verses/paragraphs from
  {{found_passages}}, linked, the translation named in one short line after it. A unit longer than ~600 words: give the
  opening verses whole, then 'The full <unit> (<N> verses) is here' linked; never stop mid-verse (the rest becomes a
  `state.offers` entry). If editions number it differently, one line saying so. If `out_of_scope`: nothing beyond naming the
  work's tradition in the translation line — the reader named the work. No {{scope_clause}} (a found reference is not filtered)."
  * voice: "Name the reference and translation, read up to two whole sentences, offer to send the rest."
  * email: "The whole unit regardless of length; original beside it when held."
* `reference.work` — "'I can't open {{scripture_reference}} directly yet — here is *{{named_work}}*' as italic linked title
  from {{found_records}}, with where in it to look (chapter/section) if known."

### 7. Speed, measures, tests
* **target_time** ≤ 1 s.
* **measures** judge score · p50 · $ · branch (parsed / incipit / work only / absence) · parse-hit rate per tradition · fallback rate.
* **tests:** "Romans 8:28" · "Surah Al-Fatiha" · "Gleanings section 27" · "Dhammapada verse 5" · "the Beatitudes"
* **must_not:** "what does Matthew 5 teach about anger" (understanding) · "Gleanings" (a2) · "Arabic of Qur'an 1:1 beside the English" (a7)

### 8. Open issues
* Numbered Bahá'í texts in `fetch.reference` are "to build"; until then `p` (incipit) and `w` (the work) carry them — answers stay honest but slower and coarser.
* Default Bible/Qur'án translation (open question in the class) = `rank.copy`'s "work default edition"; needs a per-work default set by Chad.
* Mode size vs "never truncate" for long units (Sura 24, Matthew 5): this tree gives whole opening verses + link in live modes and the whole unit by email. Chad to confirm.

---

## A6 · `a6` — What a word means

### 1. Name, type, card, difference
* **name** `a6` · **type** `A-define` · **setting_of** none.
* **description (card):** The reader asks what a word, term or name means — often foreign (dharma, zakat, Abhá, 'Abdu'l-Bahá).
  Anís gives the meaning in one line, the original script and transliteration, and one passage that uses it.
* **difference:** vs `understanding` a word's meaning, not the teaching behind it; vs `b5` a word or a name's meaning, not a person's life. Own task (7.2 %).

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| what are the Four Sprouts (Mencius) | understanding | the teaching behind the term |
| Who is Kali? | b5 | a figure (Jev decides figure vs term) |
| Mawangdui Tao Te Ching 恒 vs 常 difference | c4 | two readings compared |
| how did Shoghi Effendi translate "nafs" in the Íqán and Gleanings | research-depth a6 (setting) | still the word; research depth gives the full word study |
| the Arabic of "O Son of Spirit" | a7 | a passage's original, not a word |

### 3. Ideal answer per mode
* **voice:** "Dharma — a Sanskrit word — means duty, the right way of living. The Gita says: '…'" Transliteration only, no script.
* **widget:** meaning in one line; script + transliteration; one short passage using it, linked.
* **site:** same; several senses → one line each.
* **email:** + the passage in full with the original beside it; Shoghi Effendi's renderings listed when it is a term of the Writings.
* **research:** full word study: every rendering Shoghi Effendi used, with passages, and related terms.

### 4. Shapes and needs
Shapes: `record` (term card: meaning · script · transliteration · one passage) · `absence`.

| unit | required / optional | default when empty |
|---|---|---|
| `term` | required (word + script) | none possible |
| `reader_card.reads_scripts` | optional — reader card field, set from evidence only (§3 base rule) | [] |

(The earlier `term_kind` slot is dropped: no node read it — the renderings → HyPE → web order already handles each kind.)

Scope used: traditions (which glossary/renderings and which scripture shelf), languages (script). `fetch.renderings` is
called for every tradition; it holds data (CTAI) only for the Bahá'í Writings today and returns none elsewhere — the data
is tradition-specific, the tree is not. `sx` lowers authority inside the scope; no tree widens (E2 does, on none).

**state:** reads `state.subjects.term` ("and its plural?", "how is it pronounced?") and `state.given` (rk `skip: given`
picks a passage not already quoted). Writes `state.subjects.term`, `state.given += the passage`, `state.offers` (the word
study by email when ≥ 3 renderings — "yes" resolves there), `state.open` on o_abs/un.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| g | fetch.renderings | term: {{term}} | term → found_records (renderings/glossary) | one→s · several→j · none→h · error→h |
| j | judge | q: "This term has several originals or senses. Which does the reader mean?" options: **one_sense** — the conversation points to one; keep it · **several_senses** — give each in a line | found_records, previous_conversation_rounds → path | one_sense→s · several_senses→s |
| h | search.hype | shelf: any, question: "what is {{term}}" | term → found_passages | several→jp · thin→jp · none→wb · error→wb |
| jp | judge.passages | — | found_passages, term → found_passages (verdicts) | answers→s · conflict→s · mentions_only→wb |
| wb | search.web | query: "{{term}} meaning {{religions_specified}}" | term, religions_specified → web_found | one→s · none→s · error→s |
| s | search.shelf | authority: scripture, query: {{term}}, k:3 | term → found_passages | one→rk · several→rk · thin→rk · none→sx · error→sx |
| sx | search.shelf | authority: any ∩ authority_floor, query: {{term}}, k:3 | term → found_passages | one→rk · several→rk · thin→rk · none→sw · error→sw |
| sw | NEW `switch` | on: [found_records or answering found_passages or web_found] / found_outcome | found_records, found_passages, web_found, found_outcome → — | definition→o · errored→ag · nothing→o_abs |
| rk | rank | by:[authority], k:1, skip: given | found_passages, state.given → found_passages | done→ra |
| ra | read.around | — | found_passages → found_passages (context) | done→o |
| ag | fallback.agent | — | current_user_question, found_* → reply | answered→$end · fail→un |
| o | shape | a6.term | term, found_records, found_passages, web_found, path | done→$end |
| o_abs | `$absence` (E2) | — | term, missing | (shared end) |
| un | shape | tpl.unavailable | missing | done→$end |

11 working nodes (+ shared ends). ≤ 2 Jev decisions (j or jp, never both: j only on the renderings path).

```
g ─one──────────────────────────────→ s ─hit→ rk → ra → o
 ├several→ j ─*─────────────────────→ s      └none/error→ sx ─hit→ rk   (rest of the scope)
                                                           └none/error→ sw ─definition→ o
 └none/error→ h ─several/thin→ jp ─answers/conflict→ s       ├errored→ ag → $end | un
               └none/error→ wb ─*→ s   └mentions_only→ wb    └nothing→ o_abs
```

Paths: **clean** g(one)→s(one)→rk→ra→o · **several** g(several)→j→s→… · **thin** h(thin)→jp(answers)→s→… ·
**wider authority, same scope** s(none)→sx(hit)→rk→ra→o · **none after all tiers** g→h→wb(none)→s(none)→sx(none)→sw(nothing)→o_abs · **error** g/h/wb(error)→next; s(error)→sx; sx(error)→sw(errored→ag→un, or definition→o when g/h/wb already gave one) ·
**conflicting** (two library definitions differ) h→jp(conflict)→s→…→o: both senses, attributed.

### 6. Templates
* `a6.term` — {{base}} Shape = Jafar's "wisdom" note (§3 exemplar). "When {{found_records}} holds renderings (one English
  word with several originals, or one original with several renderings): open with {{term}}, then each original with its
  root and its count, most common first ('حکمه (root ح-ك-م) is rendered "wisdom" 123 times — by far the most common'),
  and what each root does in its sentence ('a word closer to recognition or gnosis'). Then one passage from
  {{found_passages}} using the commonest original, quoted, linked; if it is `out_of_scope`, name its tradition.
  End with an offer to go deeper, the concordance linked (a `state.offers` entry). Single-sense term with no renderings:
  line 1 the meaning (record, else the defining passage, else {{web_found}} labelled 'outside the library'), then the
  passage. If `path.j = several_senses`: one line per sense.
  **Original words** (every Arabic/Persian word, script and root alike): if the reader reads that script
  (`reads_scripts` holds the word's script), the script stands alone; otherwise the transliteration sits
  beside it — حکمه (*ḥikma*), root ح-ك-م (*ḥ-k-m*). The transliteration is taken from CTAI (`transliteration`) or the
  library's own spelling (Shoghi Effendi's system), never composed; when neither has one, show the script and the meaning
  and no romanization. {{scope_clause}} only when the in-scope shelf (s) found no passage."
  * voice: "Transliteration only (from the data); no script; counts as words ('most often', 'a few times'); the passage ≤ 2
    sentences; offer the word study by email."
  * email: "Every original with root, count and one passage each, the original beside the English; the concordance linked;
    same script/transliteration rule."

### 7. Speed, measures, tests
* **target_time** ≤ 3 s (renderings path ≤ 1 s).
* **measures** judge score · p50 · $ · branch (renderings / HyPE / web / absence) · web-definition rate · script-sourced rate (script present and from a source) · fallback rate.
* **tests:** "what does 'Bahá' mean" · "meaning of 'ahimsa'" · "what is the Mashriqu'l-Adhkár" · "what does 'Íqán' mean" · "what does the word 'gospel' mean"
* **must_not:** "who was Krishna" (b5) · "explain the Bahá'í concept of the Covenant" (understanding) · "the Persian original of the Seven Valleys' first paragraph" (a7)

### 8. Open issues
* General religious terms (zakat, dharma): the tree prefers a library passage that defines it and uses the labelled web only after HyPE. Chad to confirm the web is allowed here.
* Script for non-Bahá'í terms depends on a source carrying it; the glossary needs script fields to make this reliable.
* `s` runs on every path (the "one passage that uses it"); if it adds latency without value on the web path, measure and drop it there.

---

## A7 · `a7` — Show the original (or translation)

### 1. Name, type, card, difference
* **name** `a7` · **type** `A-parallel` · **setting_of** none.
* **description (card):** The reader has a passage (quoted, referenced, or from earlier in the conversation) and wants it in
  its original language — or wants the translation of an original. Anís shows both side by side, both linked, the translator
  named; never a fresh translation.
* **difference:** vs `a4` it returns parallel texts, not a provenance verdict (it *uses* a4 to find the passage); vs `c4` one passage in two languages, not two accounts or translations compared. Own task — composition by `hand.strategy`.

### 2. Near misses
| text | goes_to | why |
|---|---|---|
| Persian eschatology | understanding | a topic in a tradition, no passage |
| two translations of the Tao Te Ching compared | c4 | compares renderings |
| what does "Íqán" mean | a6 | a word, not a passage |
| who said "so powerful is the light of unity" | a4 | provenance only |
| the Kitáb-i-Aqdas in Arabic | a2 | the whole work in a language |

### 3. Ideal answer per mode
* **voice:** "That passage is from the Lawḥ-i-Maqṣúd, in Persian. I can't read the Persian aloud well — shall I send both texts?" (transliteration of the opening only if short).
* **widget:** English passage, the original beneath (rtl), both linked, translator named.
* **site:** the two aligned side by side; a label when the alignment is "nearest paragraph".
* **email:** ```bilingual block, both in full, both linked, translator and source edition named.
* **research:** + the library's other translations of the same original, labelled authorized / provisional.

### 4. Shapes and needs
Shapes: `side_by_side` · `titles` (only the whole original work is held) · `absence`.

| unit | required / optional | default when empty |
|---|---|---|
| `quoted_words` | one of these three required — the passage's words | none |
| `scripture_reference` | (as above) — the passage by reference | none |
| `previous_evidence` | (as above) — "the passage you just quoted"; code takes it from `state.given` | [] |
| NEW `parallel_direction` | optional — to_original · to_translation | to_original if the passage is in the reply language, else to_translation |
| NEW `target_lang` | optional | the passage's source language (to_original) / `reply_language` (to_translation) |
| `reader_card.reads_scripts` | optional — reader card field, set from evidence only (§3 base rule) | [] |

The old `passage_kind` slot is gone: `sw` branches on which unit Jev filled. Scope used: the sub-trees inherit the turn's
scope as-is (no separate filter); `x` reads `target_lang` (and `search_originals`). No widen node: a4 and reference
rank named things by scope rather than filtering them.

**state:** reads `state.given` — "show me the original of that" / "the second one" resolves to a passage already quoted, so
`sw` skips the lookup sub-tree entirely and goes straight to `o`. Writes `state.given += both texts`,
`state.offers` (voice: "send both texts" — a "yes" resolves there), `state.open` on o_abs/un and when only `nearby` was found.

### 5. Tree
| id | element | params | reads → writes | edges → next |
|---|---|---|---|---|
| sw | NEW `switch` | on: first filled of [previous_evidence, scripture_reference, quoted_words] | previous_evidence, scripture_reference, quoted_words → found_passages (given case: the passage from state.given) | given→o · reference→h5 · words→h4 |
| h4 | hand.strategy | name: a4, upto: evidence | quoted_words → found_passages, path | one/several/thin→o · none→o_abs · error→ag |
| h5 | hand.strategy | name: reference, upto: evidence | scripture_reference → found_passages | one/several/thin→o · none→o_abs · error→ag |
| o | fetch.original | direction: {{parallel_direction}}, lang: {{target_lang}} | found_passages[0], parallel_direction, target_lang → found_passages (the other side) | one→out · thin→j · none→x · error→x |
| x | search.shelf | lang: {{target_lang}}, work: found_passages[0].work, query: the passage text, k:3 | found_passages, target_lang → found_passages | one→j · several→j · thin→j · none→o_abs · error→ag |
| j | judge | q: "Is this {{target_lang}} paragraph the same passage as the reader's?" options: **same** — same passage · **nearby** — same text, adjacent paragraph; the exact one isn't aligned · **not_same** — a different passage | found_passages → path | same→out · nearby→out · not_same→o_w |
| ag | fallback.agent | — | current_user_question, found_* → reply | answered→$end · fail→un |
| out | shape | a7.side_by_side | found_passages, path, target_lang | done→$end |
| o_w | shape | a7.work | found_passages, found_records | done→$end |
| o_abs | `$absence` (E2; a7.absence = its template override) | — | found_passages, path, missing | (shared end) |
| un | shape | tpl.unavailable | missing | done→$end |

8 working nodes (+ shared ends). ≤ 2 Jev decisions (a4's `jv` inside h4 + `j`).

```
sw ─given (state.given)─→ o ─one→ out
  ├words→ h4 ─found→ o
  └ref───→ h5 ─found→ o  ├thin→ j ─same/nearby→ out
          (none→ o_abs · error→ ag) │        └not_same→ o_w
                         └none/error→ x ─hit→ j
                                        ├none→ o_abs
                                        └error→ ag → $end | un
```

Paths: **clean** sw→h4(found)→o(one)→out; follow-up "the original of that" sw(given)→o(one)→out, no lookup · **several** (several hits) resolved inside a4's rank; several original candidates x(several)→j · **thin** o(thin: only the work is paired)→j→out[nearby] or o_w ·
**none after all tiers** o(none)→x(none)→o_abs · **error** o(error)→x; x(error)→ag→un ·
**conflicting** (authorized and provisional translations of one original) o(one)→out: authorized first, provisional named.

### 6. Templates
* `a7.side_by_side` — {{base}} "One line: which work and author, and which text is the original. Then the two texts
  from {{found_passages}}, aligned, each linked; translator named; 'authorized' or 'provisional translation by <name>'
  stated. If `path.j = nearby`, label the {{target_lang}} side 'nearest aligned paragraph'. If the source passage came
  from `state.given`, don't requote its English at length on voice/widget — 'the passage above, in <language>:'. Never
  produce a translation of your own. **Original words** (§3): the original side is shown in full script. When the reader
  does not read that script (its script not in `reads_scripts`), the transliteration is shown beside it —
  only a transliteration the library or CTAI holds for this passage (or for each word named in the framing line); never
  composed. With none held, show the script and the authorized English, and no romanization. Any Arabic/Persian word in
  the framing line (a title such as *Lawḥ-i-Maqṣúd*) follows the same rule."
  * voice: "Say the work and language; read the English (≤ 2 sentences); offer to send both texts. No script read aloud;
    the opening's transliteration only when the data holds one and it is short."
  * email: "```bilingual block with both texts in full."
* `a7.work` — "'The library holds the original of *<work>* but this paragraph isn't aligned yet' + the original work from
  {{found_records}} as italic linked title; the English passage quoted (or 'the passage above' when in `state.given`). An
  original-script title follows the §3 original-words rule (transliteration beside it unless the reader reads it)."
* `a7.absence` — over `tpl.absence`: "Found-passage case (h4/h5 found, o and x none): 'The library doesn't hold the
  {{target_lang}} of this passage' + the passage linked; say no translation will be made. Not-found case (h4 empty): a4's
  not-found verdict line for {{quoted_words}}; (h5 empty): 'I couldn't find {{scripture_reference}}'."

### 7. Speed, measures, tests
* **target_time** ≤ 1 s (aligned); ≤ 3 s via x.
* **measures** judge score · p50 · $ · branch (aligned / nearest / work only / absence) · alignment-confirmed rate · fallback rate.
* **tests:** "the Arabic of 'O Son of Being, love Me, that I may love thee'" · "Persian text of Hidden Words Persian 1" · "is there an English translation of the Lawḥ-i-Ḥikmat" · "Hebrew of Psalm 23:1" · "show me the original of the passage you just quoted"
* **must_not:** "where is 'O Son of Being, love Me' from" (a4) · "the Hidden Words" (a2) · "compare two English translations of Psalm 23" (c4)

### 8. Open issues
* `hand.strategy … upto: evidence` is NEW: without it h4 would run a4's web tier and shape. Until built, A7 can inline a4's p1/p2 (copying ~4 nodes) — note it as a temporary copy.
* Non-Bahá'í originals (Qur'án Arabic, Tao Te Ching Chinese, Hebrew Bible): which are aligned is unknown; `x` with `lang` relies on multilingual vectors over those shelves.
* Add A7 to the question-type fixtures so Jev's choices are measurable (class open question).

---

## Method notes (proposed edits to §1/§2/§3)

1. **§2 has no code branch.** Step 7 says code decisions are code, but the only branching element is `judge` (Jev). Every
   unit/count/error branch (A1 which subject unit is filled, A7 given/reference/words, A6 "anything found?") needed one. **Add `switch`**
   (code/decision; params `on: <expr>`, `cases: {value: edge}`) to §2.
    → **folded → §2 `switch`**
2. **Step 10 promises "independent fetches run together in one element", §2 has none for different elements** (`search.fanout`
   repeats one element per unit value). **Add `search.together`** (list of retrieval elements, standard outcome contract on
   the merged pool). Needed for shelf ∥ HyPE ∥ originals in A3 and A1.
    → **folded → §2 `search.together`**
3. **Error ≠ absence.** Step 6 sends error to the next tier, then "after the last tier, the ABSENCE shape" — so a down index
   ends in "it is not in the library", a false statement. **Edit step 6:** "Absence is stated only when every tier answered
   none. An error at the last tier goes to `fallback.agent`, then to `tpl.unavailable`." **Add `unavailable` to §3 shapes.**
   This also settles the step 6 / step 11 ambiguity: none-after-all-tiers → absence (not the agent); the agent covers errors and unrouted outcomes.
    → **folded → §1 steps 6 and 11, §3 `tpl.unavailable`**
4. **`judge` returns only an edge.** "several → a Jev choice" needs Jev to say *which* item. **Add param `mark`** (Jev marks
   the items his option applies to; `rank by: marked` puts them first).
    → **folded → §2 `judge{mark}`, `rank by: marked`**
5. **`shape` should pick one_passage vs passages by count** (`by_count`) and templates should see the NEW unit `path` (judge verdicts by node id), so one shape node
   can speak each verdict (A4) instead of one node per wording. Saves 1–3 nodes per tree.
    → **folded → §2 `shape{by_count}`, §2a `path`**
6. **Node budget.** "Lookups 3–6 nodes" is not reachable once every edge is routed and errors/absence/unavailable each end in
   a shape: A2 = 9, A5 = 10. **Edit:** count working nodes only (A2 = 5, A5 = 6), or make `error at last tier → ag → un` a
   graph-level default the validator adds.
    → **folded → §2 graph limits (working nodes only; shared ends not counted)**
7. **Units may carry Jev's normalised form.** Garbled quotes, misspelt titles and named passages ("Ayatul Kursi") are handled
   with no extract LLM if Jev fills `quoted_clean` / a canonical `named_work` / a canonical reference. **Add to step 4 and
   §2a:** "a request unit may hold Jev's corrected or canonical form beside the reader's words; prefer this to an LLM
   extract step." Concretely: `quoted_words` = verbatim (code copies the span) **plus** NEW `quoted_clean` (Jev);
   `scripture_reference` = "code parser" in §2a, but named passages need Jev's canonical form first → change its
   "filled by" to "Jev canonical form → code parser"; `named_work` before resolution is title text, not a work id → its type
   should be "work id | unresolved title".
    → **folded → §1 step 4, §2a (`quoted_clean`; `scripture_reference` filled by Jev canonical form → parser; `named_work` = work id | unresolved title)**
8. **`hand.strategy` needs a stop point and a budget rule.** Composition (A7 runs A4) must stop before the sub-tree's web/shape
   (`upto: evidence`), and the sub-tree's Jev decisions count toward step 7's "at most two before first words".
    → **folded → §2 `hand.strategy{upto: evidence}` (full outcome set + error), §1 step 7 (sub-tree Jev calls count)**
9. **Param gaps in §2:** `search.shelf` needs `work`, `lang`, `query` and an authority *list*; `rank.by` needs a list and keys
   `copy`, `attributed`, `marked`; `fetch.original`/`fetch.translation` should be one element with `direction`; `k` should take
   `{default, research}` so depth changes size without a different tree (keeps "modes differ in speed and size, not strategy").
    → **folded → §2 params (`search.shelf` work/lang/query/authority list; `rank.by` list + copy/attributed/marked; `fetch.original{direction}`; `k: {default, research}`)**
10. **`fetch.work` "several" mixes editions and different works.** Collapse editions of one work in code (same work id) so
    `several` means different works; the Jev call then runs only when meaning decides.
    → **folded → §2 `fetch.work` (editions collapsed in code)**
11. **`judge.passages` on an empty `found_passages`** should take `mentions_only` without a call (A3 j2 after none+none).
    → **folded → §2 `judge.passages` (empty input → mentions_only, no call)**
12. **`ui.stage` as a node is wasteful.** Make the engine emit a progress line for any element exceeding 2 s (element param
    `stage: "<label>"`), so trees stay small and no slow path forgets one.
    → **folded → §2 (any element may carry `stage:`; the engine emits it after 2 s; `ui.stage` stays for explicit lines)**
13. **§3 mode lengths vs "never truncate".** A requested long unit (a whole surah) can't fit widget/site sizes. **Add to §3:**
    "mode lengths are targets for prose; a requested text is given in whole units — whole verses, never cut mid-sentence —
    with the full unit linked when it exceeds the mode."
    → **folded → §3 mode lengths (whole units, never cut)**
14. **E2 as wrapper vs absence shape.** The class file has E2 "take over when the asked type comes back empty", and §1 has
    every tree end in its own absence shape. Both can't hold. **Proposed:** trees own their absence (they already hold the
    nearest passage); E2 is chosen by Jev at entry only when the reader states a premise ("where does Bahá'u'lláh say X").
    → **rejected: decision 1 — last-tier none goes to the shared `$absence`, which runs E2 with `missing` + found_* (so the nearest passage still arrives); E2 is also a Jev entry for premise questions (DE)**

**Scope (Chad 11-09 update: §1 step 4, §2, §2b "Layers" and "Scope binds every strategy")**

15. **Tier filters vs widening need a name in §2.** `authority: scripture` on a tier is a narrowing *inside* the scope
    (cheapest-authoritative-first), not a scope change. **Add to §2:** "an element param may narrow within the scope freely
    (`authority`, `work`, `lang`); only `widen:` leaves it; the validator rejects a narrowing param that contradicts the
    scope (e.g. `authority: other` under `authority_floor: scripture`) — it intersects (`∩ authority_floor`)."
    → **folded → §2 (tier params narrow inside the scope, ∩ authority_floor), §2b**
16. **Identity lookups should widen at once — or be unscoped by default.** A title (A2), reference (A5) or quotation (A4)
    names its own object; a scoped miss is almost never "not in the library". Each of these trees spends one node
    (`ww`, `fw`, `pw`) widening right after the scoped try. **Proposed:** an element-level default `scope: identity`
    (scope orders results — in-scope copies first — but does not exclude), which removes those three nodes and the doubled
    exact lookup in A4 (p1 then pw). Until then the trees keep the explicit widen node.
    → **folded → §1 step 4, §2 `scope: rank` (named things ranked, never filtered); `ww`/`pw`/`fw` removed**
17. **`widen:` needs `sources` (and `languages`).** §2 allows `traditions|authority`. A3's named source ("in the Hidden
    Words") must widen to the whole scope when the work lacks the topic; A7 may need another language than
    `search_originals` lists. **Edit §2:** `widen: traditions | authority | sources | languages` (a list).
    → **rejected for trees: only E2 widens (decision 1); the list traditions | authority | sources | languages became E2's `widen` param (§2 `search.*{widen}`, E2 only)**
18. **The "say so" line must key on the layer.** §2b says an inherited filter is named in one clause; done naively, every
    OceanLibrary answer opens with "Bahá'í sources only". This family's rule (header, `{{scope_clause}}`): emit when
    scope_source ∈ conversation · reader and the answer was actually filtered (lists, passages — never a found identity
    item); for the **site** layer, emit only when the scoped search missed or came back thin. **Add to §2b:** that
    exact rule, and **add `scope_clause` to §3** as a shared template fragment so no strategy re-words it.
    Also: §2a's `scope_source` lists conversation·reader·host·default but §2b's layers are turn·conversation·reader·site —
    **align them** (turn · conversation · reader · site · default).
    → **folded → §2b, §3 base `{{scope_clause}}`, §2a `scope_source` = turn · conversation · reader · site · default**
19. **"Was the answer filtered?" needs a fact the elements don't return.** To say "Buddhist works only" truthfully a
    shape must know the scope excluded something. **Proposed:** retrieval elements also return `excluded_by_scope`
    (count of hits dropped by the scope filter, free from the same query) — written into NEW unit `scope_excluded`;
    `{{scope_clause}}` fires only when it is > 0. Without it the clause is either noisy or a guess.
    → **folded → §2a `scope_excluded`, §2 (retrieval elements return it)**
20. **Data-specific elements are fine in tradition-agnostic trees.** `fetch.renderings` (CTAI) and `search.originals`
    hold Bahá'í/Persian-Arabic data only today; the trees call them for every scope and they return `none` cheaply.
    **Add to §1 step 5:** "an element whose data covers some traditions is still called under any scope; its `none` is a
    routed outcome, never a reason to fork a tree per tradition."
    → **folded → §1 step 5**
21. **`religions_specified` in a web query** (A6 wb) is the one place a scope unit becomes query text — state that the
    web element receives the scope as words because it cannot filter.
    → **folded → §2 `search.web` (scope passed as words)**

**Context units (§2a)**

22. **NEW units this family needs** (each a code task): `path` (engine: node → edge taken; templates read judge verdicts,
    measures read branches) · `web_found` (search.web output, kept apart from `found_passages`) · `fact_asked` (Jev, A1) ·
    `quoted_clean` (Jev, A4) · `incipit` (Jev, A5) · `translation_wanted` (Jev + code resolve; A2, A5) ·
    `parallel_direction` and `target_lang` (Jev, A7) · `scope_excluded` (elements; note 19). **Add to §2a.**
    → **folded → §2a (`path`, `web_found`, `fact_asked`, `quoted_clean`, `incipit`, `translation_wanted`, `parallel_direction`, `target_lang`, `scope_excluded`)**
23. **Two old "kind" slots disappear** when units exist: `subject_kind` (A1) and `passage_kind` (A7) become a `switch` on
    *which* request unit Jev filled (named_person / named_work / topic; previous_evidence / scripture_reference /
    quoted_words). **Add to step 4:** "don't add a kind unit when the filled units already say it."
    → **folded → §1 step 4**
24. **`named_person` plays two roles** (the subject of A1, the *attributed* author in A4). One unit is enough within a turn,
    but `state.subjects.named_person` then carries "Buddha" after A4 proved the words aren't his. **Proposed:** A4 writes
    the actual author to `state.subjects`, not the attributed one (done in A4's state line); §2a should say request units
    are the reader's claim and found units are the truth.
    → **folded → §2a (request units = the reader's claim, found units = the truth), §2b subjects written by code**
25. **Implicit reads need stating once.** Every node reading the four scope units and every shape reading channel/depth/
    reply_language/reply_budget would bloat every row. **Add to §2a:** "scope units are implicit reads of every
    fetch/search; mode units are implicit reads of every shape; `found_outcome`/`missing` are implicit writes of every
    retrieval element" — and the validator checks only explicit reads.
    → **folded → §2a implicit reads/writes**
26. **Per-node outcome must be addressable.** Templates need "did s3 answer none or error?" to choose 'the library' vs
    '<scope> sources' (A1, A2, A3). §2a has `found_outcome` "per node" — make that explicit as a map
    (`found_outcome.<node id>`), not one value.
    → **folded → §2a `found_outcome.<node id>`**
27. **Templates need `{{unit}}` over lists.** `{{found_passages}}` in a template means "the writer receives them"; it is not
    text substitution. **Add to §3:** list units are handed to the writer as structured evidence; only scalar units are
    substituted.
    → **folded → §3 (list units go to the writer as evidence; scalars substitute)**

**Conversation state (§2b)**

28. **`state.given` needs a rank param, not a node.** Every quoting tree here skips repeats with `rank … skip: given`
    (A1, A3, A6) or cites "as quoted above" (A4, A7). **Add `skip: given` to `rank` in §2** (drop, or keep flagged for the
    template).
    → **folded → §2 `rank{skip: given}`**
29. **A follow-up on a given passage should skip retrieval.** A7 "the original of that" resolves from `state.given` and
    goes straight to `fetch.original`. **Add to §1 step 6:** "a tree whose input can come from `state.given` starts with a
    `switch` that takes it, before any lookup."
    → **folded → §1 step 6**
30. **`state.offers` must be written by templates, not code guesses.** A1 ("if you meant <other bearer>"), A3 (the rest as
    linked titles), A5 (the full unit), A6 (word study), A7 (both texts) all make offers in prose. **Add to §2b:** a shape
    declares `offers:` (what, resolves_to) so "yes"/"the second one" resolve to a stored ref, never to re-parsed prose.
    → **folded → §2b (`shape` declares `offers: {what, strategy, units}`)**
31. **Unclear in §2b:** (a) does `state.open` get written when a tree widened successfully (answered, but not in the
    reader's scope)? This family says yes for A3 (the in-scope question is still open) and no for identity lookups;
    §2b should decide. (b) When the reader says "all traditions", is that a turn patch only, or does it overwrite
    `state.scope`? §2b's layer table implies turn; "Only the reader widens it" implies it persists. Say which.
    (c) §2b still describes `s.scope` / `s.choice` / `s.found` in its last paragraph next to the unit names — pick one
    vocabulary (units) and update the §2 element table's "State is the graph's shared `s`" sentence.
    → **folded → §2b ((a) `open` written when E2 widened, not for out_of_scope identity hits; (b) 'all traditions' is a conversation-layer patch that persists unless Jev marks it turn-only; (c) s.* names removed)**

