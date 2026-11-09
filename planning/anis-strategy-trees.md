# Anís strategy trees — the design method, the elements, and a tree for every known class (11-09)

Chad 11-08/09: "Each strategy should have a type, a decision tree with elements and mode consideration, output suggestion
templates … start out with really well thought out and complete decision tree strategies for every question we already know."
And: "'unmatched' should contain a very very good prompt for creating new decision trees. Whatever you are planning now for
coming up with decision trees is very similar to what we want 'unmatched' to do."
And: "A decision tree is the expression of a strategy." However a task is thought through, the result is a tree.

So this file has one method used three ways:
* **§1 The method** is, word for word, the system prompt Unmatched's designer (strategy-design.js `DESIGN_SYSTEM` v2) runs on a
  gap cluster. It is also what was used to write every tree in §4 — the 39 known classes are its first test.
* **§1b Unmatched at run time** is the same method applied live to one question nobody has a tree for: plan first, then run.
* **§2 Elements** is the catalog the designer is given (generic activities the graph engine runs); §2a the context units,
  §2b the conversation state, §2c what every run records and how a tree is displayed.
* **§3 Modes and templates** is shared by every tree (base template, modes, shapes).
* **§4 Trees**, one per strategy (families A–H, files `planning/strategy-trees/<family>.md`), with the index.
* **§5 Build plan.**

Why today's trees are one node: the designer may only use the six whole-strategy executors (`strategy.*`, scope 'strategy'),
so a "tree" can only be "run executor X with another writer instruction". Retrieval, judgement and shaping happen inside
executor code nobody can see, measure per branch, or improve. §2 lifts them out as elements.

**Consolidated 11-09:** the four family designs (A, BC, DE, FGH) and their method notes are folded into this file; every
note in each family's `## Method notes` is marked `folded → §x` or `rejected: why`. Where a family file still differs from
this plan, the plan wins.

---

## §1 The method (= DESIGN_SYSTEM v2)

```
You design RESPONSE STRATEGIES for Anís, the research assistant of a Bahá'í and interfaith library. A strategy is a TYPE of
request (what the reader wants done) plus a DECISION TREE that answers every request of that type fast, accurately and well in
every mode, whatever the tools return. The tree IS the strategy: write it as nodes and edges, never as prose. Work in this
order and show each part in your answer.

1. NAME THE TASK, NOT THE TOPIC. What does the reader want done (find, explain, compare, comfort, trace, list, reshape…)? A
   topic, tradition, length, tone, format, source, depth, delivery, or where the words came from (this question or the
   conversation) is a SETTING of a task, not a new task. The test: a class is its OWN task only if its FIRST SEARCH STEP or
   its FINAL SHAPE is unique to it; otherwise answer {"setting_of": "<nearest strategy>"} with the units/params it sets, and
   stop. Most follow-ups are an existing strategy plus a conversation-state patch. If it is its own task, write
   "difference": one sentence saying what this does that none of the strategies you are shown does. A tree that exists only
   to be called by other trees is marked "internal": true (never one of Jev's options). Every new option is one more way to
   confuse Jev.

2. WRITE THE CARD. "description" is what Jev reads to choose: the class of request in the reader's terms and what this
   strategy does for it, one or two sentences, no single question's words. Add "near_misses": 3–5 requests that sound alike
   but belong to another strategy, each with where it goes and why. The card must let Jev tell this apart from every neighbour.

3. START FROM THE IDEAL ANSWER, PER MODE. Before any step, write what the reader should receive: its first sentence, what it
   quotes, its length, in each mode (voice, widget, site chat, email, pdf; and depth=research). Name the INFORMATION SHAPES the
   answer can take (one passage · several passages · per-side sections · a record card · a dated sequence · a verdict with
   evidence · a list of titles · a table · an absence with the nearest thing · a plan/handout). Each shape gets a template
   (§3). Give a target time per PATH, not per class (a lookup path ≤ 1 s; a large plan minutes, as a job).

4. SCOPE AND UNITS. Every turn arrives with a SCOPE Jev settled from the whole conversation (not from words in the last
   message), as named units: religions_specified, authority_floor, named_sources, search_originals, and scope_source (the
   layer that set it: turn · conversation · reader · site · default). It persists until the conversation changes it. Every
   fetch/search element applies it; a tree never asks it again and never hard-codes a tradition, so a strategy is written
   once for every tradition — "the same task for another religion" is never a new strategy. A tree's own authority params
   filter INSIDE the scope (scope ∩ params): narrowing is fine (one branch per side of a comparison, scripture before
   interpretation); a tree never WIDENS the scope (step 6 says where widening happens). A NAMED thing — a title, a
   reference, quoted words, a named person — is RANKED by the scope (in-scope copies first), never filtered; a hit outside
   the scope is still returned, marked out_of_scope. Safety exceptions: crisis help and comfort answer whatever the scope.
   Everything else a tree can know is also a NAMED CONTEXT UNIT (§2a: current_user_question, previous_answer, topic,
   named_work, quoted_words, found_passages …). Declare which units the tree needs ("needs"), required or optional with a
   default, and refer to them by name in node params and templates; never invent one silently. Jev fills request units in
   the one call that chooses the strategy. For each unit say what happens when it is missing: a stated default (the host
   site's tradition, the most prominent bearer of a name, the most likely reading) — never a question back, unless
   answering the wrong reading would mislead; then answer the likely reading and offer the other in one line. A branching
   question the strategy always needs belongs in that call as a unit, branched by `switch`, never a second `judge`.

5. CHEAPEST AUTHORITATIVE SOURCE FIRST. Order the retrieval tiers: exact index (title, reference, phrase, prayer occasion,
   dated guidance, person record, renderings) → prepared collection → shelf search by authority (the scope tradition's
   primary scripture, then its authoritative interpretation, then other) → originals (the original-language phrase index)
   → web, labelled → the research agent. For the Bahá'í library the authority order is the Writings, then the Guardian,
   then the House of Justice, then pilgrim notes, then scholarship, labelled. A tier is used only if the one before it did
   not settle the answer. Cheap independent tiers run together in one `search.together` node. An element whose index is not
   built yet is still called (it returns none at no cost) so the tree does not change when the index arrives.

6. ROUTE EVERY OUTCOME. Every retrieval element returns one of: one (a single clear hit) · several · thin (something, not
   enough) · none · error. Route each one. "several" → a ranking rule or a Jev choice, never all of them dumped. "thin" →
   the next in-scope tier, or answer with what there is and say what is missing. "none" → the next in-scope tier; when
   the LAST tier answers none, go to the shared end $absence (the not-found sub-tree, E2): it is the ONLY place the scope
   may widen, as a routed outcome, and the reply states the widening; then the ABSENCE shape (say plainly it is not in the
   library, then the nearest real passage, labelled as nearest). "error" is not "none": an error at the last tier goes to
   $fallback (the research agent) and, if that fails, to $unavailable ("I couldn't search the library just now") — never
   "not in the library". If the tree reads given items (§2b), test them first with `switch`. A `rank` that drops
   everything returns empty → $absence. Contradicting sources → show each, attributed, in authority order. No path may end
   without something the writer can stand on.

7. JUDGE ONLY WHERE CODE CANNOT. A decision code can make (counts, authority kind, exact match, a date, a unit Jev already
   filled) is code (`switch`). Where meaning decides (does this passage answer it or only mention it? which of three bearers
   of the name?), use a Jev decision with a FIXED option set, each option one line saying when it applies. At most two Jev
   decisions before the first words on a live channel, counting the decisions inside sub-trees; parallel judges count as one
   round. A progress line is not first words; a stage line that gives a verdict is. A light-LLM GENERATOR is allowed only
   where its output is a list the tree fans out over and no index supplies it; it writes a declared unit and is measured
   per branch. Never an LLM where a Jev decision will do; the writer runs once, at the end.

8. VERIFY. Read around each passage you will quote (context); trace a quotation found in a secondary book to its primary
   source and prefer the passage's own published work; note the translator. The shared writer checks quotations after you.

9. SHAPE PER MODE. Each path ends in a template chosen by the information shape it found (step 3), rendered for the mode:
   voice is spoken (no links read out, short spoken citations, no tables or scripts, transliteration not script, offer to
   send the passages); widget is ~150 words; site chat 150–250 with tables/headings when they help; email up to ~600 with
   passages quoted in full and original beside English; pdf is a report laid out for the page (title, sections, full
   tables, notes with sources). Lengths count prose; passages are counted per mode. depth=research on a live channel = the
   full answer, and the same tree runs as a job when it is large.

10. SPEED. Give a target time per path (lookups ≤1 s, short answers ≤3 s, researched answers ≤12 s with first words ≤2 s,
   jobs minutes with progress shown). Independent fetches run together in one element. A stage longer than 2 s emits a
   progress line on live channels (the element's `stage:` param, or a `ui.stage` node).

11. FALLBACK LAST. The research agent ($fallback) is the edge after the tree's own last tier errored, never the first
   resort and never the answer to "none". Its answer goes through the tree's main shape like any other (every answer via
   the writer); if it fails, $unavailable. Every agent fallback is logged as a defect of this tree (which outcome was
   unrouted, or which tier was missing) for the improvement cycle.

12. HOW WE KNOW IT WORKS. Name the measures (judge score, p50 ms, $ per answer, the branch taken, absence rate, fallback
   rate) and 5 NEW test phrasings of the class you wrote yourself plus the 3 near-misses that must NOT choose it.

Use ONLY the elements you are given (§2 catalog), the context units (§2a) and templates (existing ids, or new ones you
write). The graph is a set of nodes; each node is one element with params; each element returns one of its listed edges;
every edge is routed to a node, to a shared end ($absence · $fallback · $unavailable) or to "$end"; no cycles (a retry is a
second node). Shared ends are not counted toward the node limit. Answer with ONE JSON object (schema below) and nothing else.
```

JSON schema (appended to the prompt by code; validated by `validateCandidate`):

```
{"setting_of": null | "<strategy>", "sets": {"<unit or param>": "<value>"},   // sets only with setting_of
 "difference": "…", "name": "snake_case", "type": "<family letter + task word, e.g. A-lookup, B-explain>",
 "internal": false,
 "description": "the card", "near_misses": [{"text","goes_to","why"}],
 "ideal": {"voice","widget","site","email","pdf","research"},      // step 3, one line each
 "shapes": ["one_passage", …],                                     // step 3
 "needs": [{"unit","required","default"}],                         // step 4: §2a context units only (or "NEW unit: …")
 "templates": [{"id":"<name>.<shape>","text":"… {{base}} … mode blocks …"}],
 "graph": {"entry","nodes":{"<id>":{"step","params"}},"edges":[{"from","on","to"}]},
 "target_time": {"<path>": "…"}, "measures": […], "tests": [5 phrasings], "must_not": [3 near-miss phrasings],
 "why": "…"}
```

---

## §1b Unmatched at run time (Chad 11-09)

**The whole mechanism, one rule (Chad 11-09):** every turn → Jev matches the cards: a card matches → run it (no extra call); **Unmatched** → its FIRST node is one Jev
decide: "a research query that needs a new strategy?" — **no** (feedback, thanks, "that's a good point") → conversational
reply, no strategy; **yes** → research is done ONLY by response strategies: the planner designs a tree now, runs it for this turn, saves it as a candidate. No
free-agent research path: the planner's safety net is itself a stored `general_research` tree (its use is logged as a planner
defect). One pure entry `route(turn) → conversational | strategy {name, version, source: matched|planned|fallback}`, logged
every turn, so test tools can be built around it. Two loops: **IMPROVE** = efficiency + quality of existing trees (node-level
edits); **EXTEND** = new strategy types (planned candidate → node tests → promotion → probation).
**Plan expensive, run cheap (Chad 11-09):** deep thinking (Opus) is spent once per challenge TYPE, to plan; the tree it
plans runs on Jev + tools + light LLM, with synthesis only when needed. A matched turn makes zero Opus calls; a planned
candidate joins the cards at once (probation) so the next similar question matches instead of replanning; every tree carries
a per-run cost/time budget checked at validation, and IMPROVE promotes cheaper/faster trees at equal quality.
**Rich trees, cheap paths (Chad 11-09):** because planning uses deep thinking, planned trees should be elaborate and
high-quality — cheapest probe first, escalate only on thin, parallel tool calls, verification nodes, conflict branches, early
exits, shapes per outcome. Size is not cost: the budget is the expected and worst cost/latency per run PATH; MAX_NODES is only
a high sanity cap in config. This supersedes "keep each tree as small as the class allows".
**Third loop, TOOLS (Chad 11-09):** the element catalog grows periodically so strategies get better and simpler. The
planner records wished-for elements (NEW:, inputs/outputs, estimated per-path saving) while still planning with today's
catalog; a wishlist aggregates them into the improve digest as Gherkin code tasks; a catalog version change re-plans the
strategies that could use the new element, promoted only if simpler/cheaper/faster at equal or better quality.
Loops: IMPROVE (existing trees) · EXTEND (new types) · TOOLS (catalog growth → re-plan).

When no strategy fits a question (Jev chooses Unmatched), Anís does not improvise. It PLANS FIRST, with the §1 method, for
this one question:

1. **Design a tree for THIS question** — task → steps → per-mode shapes, by §1 steps 1–9, from the §2 elements and §2a
   units. The planner emits the tree itself, in the stored-strategy schema (the §1 JSON), not prose: a hand-designed, a
   planned and a promoted strategy are one kind of object (§2c).
2. **Tell the reader the plan** in one or two sentences before working ("I'll find every place Shoghi Effendi translates
   this word, pair each with its original, group them by rendering, and summarise the pattern.").
3. **Probe** each search step with the `probe` element: run the step's query on a small sample, check that the hits match
   what the plan expects (kind of passage, language, author), and adjust the step's params if they do not. A mismatch is
   recorded on the node (§2c).
4. **Run the tree**, with source tracing per item (`read.source`, `read.around`).
5. **Shape the answer per mode** (§3, including pdf).
6. **Save** the planned tree and its measured outcome (§2c trace, judge score) as a CANDIDATE strategy. Promotion works
   from these candidates through the normal gate (replay, distinctness), never from reverse-engineered agent tool calls.

The free research agent remains only as the §1 step-11 fallback: when a step cannot be built from the elements. Each such
case is logged as a defect (which element was missing) for the catalog.

**Worked example:** "Create a side-by-side comparison of the translation of this word from Shoghi Effendi."

| step | node | element / params |
|---|---|---|
| plan | — | task = trace + compare renderings; shapes: `table` + summary; reader told the plan |
| 1 | pr | `probe` on `fetch.renderings{term, translator: Shoghi Effendi}`, sample 5: are the hits his translations, with an original word? |
| 2 | rn | `fetch.renderings{term, translator: Shoghi Effendi}` → every instance with its counterpart (`fetch.align` per passage) · none → `$absence` · error → `$fallback` |
| 3 | src | `read.source` per item (the published work, translator named) |
| 4 | grp | `rank{group: rendering, by: count}` → groups (English rendering → instances, original root) |
| 5 | o | `shape{template: tpl.table}` per mode |

Per mode:
* **voice:** explains what was found ("He renders it five ways; most often as …, in these works"), no table; offers the
  table by email.
* **site/widget chat:** the summary, then a few rows of the table, and a link or offer for the full table.
* **email:** the explanation and the full table, each row linked.
* **pdf:** the formatted report: title, method, the full table, notes per group, sources.

---

## §2 Elements (the catalog the designer is given)

### §2a Context units (the named inputs every strategy is built from)

Chad 11-09: "If you define the units of context information to be passed into each strategy and name them, then new strategies
can be designed with those named elements incorporated like religions_specified or previous_conversation_rounds or
current_user_question etc."

A context unit is a named, typed piece of what the turn knows. Elements declare `reads:` / `writes:` units; templates use them
as `{{unit}}`; a tree's node params refer to them by name (`fanout by: compare_sides`). A designer may use only defined
units; a tree that needs a new one names it `NEW unit: <name> — <type>, filled by …` (a code task, never improvised).
Validation rejects a graph that reads a unit nothing upstream fills. The scope units and `conversation_state` are read
IMPLICITLY by every fetch/search element; a tree lists them in `needs` only when a param or template uses them.

| unit | type | filled by | default when empty | carried to next turn |
|---|---|---|---|---|
| **The turn** | | | | |
| `current_user_question` | text | code | — | — |
| `previous_conversation_rounds` | [{user, reply}] (last 6) | code | [] | — |
| `previous_answer` | {text, format, strategy} | code | none | — |
| `previous_evidence` | {passages, records} cited in the last reply | code | {} | — |
| `previous_scope` | the scope units of the last turn | code | none | — |
| `referent` | [given item: passage ref · work id · person id] | Jev points (ordinal/description), code resolves in `state.given` | the last item quoted | — |
| `reader_position` | {doc id, paragraph id} the reader is on | code (widget/reader sends it) | none → topic mode | — |
| **Reader and place** | | | | |
| `reader_card` | {usual tradition, level, language, topics read, reads_scripts: [arabic, persian, hebrew, …]} | code (profile) | anonymous card, reads_scripts [] | reader layer |
| `host_site` | {name, tradition, own material shelf} | code (widget origin) | Ocean library | site layer |
| `locale` | country code | code: reader card, else request geo | international | reader layer |
| `channel` | voice · widget-chat · site-chat · email · pdf | code | widget-chat | — |
| `reply_language` | lang code | Jev (with question + reader card) | language of the question | conversation |
| `depth` | brief · full · research | Jev | brief | — |
| `reply_budget` | {words, passages_max, link cap, can_show[]} | code from channel + depth | widget brief | — |
| `reading_plan` | {work, position, cadence, portion, started} | `fetch.activity` | none | reader layer |
| **Scope (Jev, one call with the strategy choice)** | | | | |
| `religions_specified` | ordered [tradition] or `all` | Jev from the conversation | reader_card → host_site → `all` | conversation |
| `scope_source` | turn · conversation · reader · site · default | code (the layer that won) | default | — |
| `authority_floor` | scripture · interpretation · any | Jev | interpretation | conversation |
| `named_sources` | [work id / author id] | Jev + code resolves | [] | — (turn only) |
| `search_originals` | bool (+ languages) | Jev | true for teachings | conversation |
| `scope_excluded` | count of hits an element dropped because of the scope (same query) | every fetch/search element | 0 | — |
| **Request (Jev fills the ones the chosen strategy declares)** | | | | |
| `topic` | short text | Jev | the question | conversation (subjects) |
| `question_frame` | what · why · how | Jev | what | — |
| `quoted_words` | text the reader quotes | Jev marks span, code copies it verbatim | none | — |
| `quoted_clean` | Jev's normalised form of quoted_words (spelling, abbreviations folded) | Jev | = quoted_words | — |
| `incipit` | the opening words of a named passage | Jev | none | — |
| `named_person` | person id (+ bearer choice) | Jev + fetch.person | none | conversation (subjects) |
| `named_work` | work id | Jev + fetch.work | none | conversation (subjects) |
| `translation_wanted` | translator id or "authorized" | Jev + code resolves | authorized → the work's default edition | — |
| `parallel_direction` | to_original · to_translation | Jev | to_original | — |
| `target_lang` | lang code of the side wanted | Jev | the work's original (to_original) or reply_language | — |
| `scripture_reference` | parsed ref | code parser | none | — |
| `term` | word + script | Jev | none | conversation (subjects) |
| `fact_asked` | date · place · author · age · count · translator … | Jev | the most likely fact for the subject | — |
| `occasion` | prayer/feast occasion | Jev | none | — |
| `compare_sides` | ordered [tradition · concept · work · school] | Jev | = religions_specified | — |
| `audience` | children · mixed · study circle · seeker · scholar | Jev | reader_card | conversation |
| `output_form` | prose · table · timeline · handout · program · steps · map | Jev | the strategy's own | — |
| `amount_wanted` | {count · 'all' · minutes · days} | Jev | the strategy's own | — |
| `delivery` | here · email · document | Jev | here | — |
| `challenged_claim` | the sentence being disputed | Jev marks it in previous_answer | none | — |
| `challenge_kind` | attribution · wording · support · reading · not_said | Jev | support | — |
| `contested` | bool (a question on which traditions/readers truly differ) | Jev, only when weighing `understanding` | false | — |
| `about_what` | library · anis · greeting · personal | Jev | library | — |
| `plan_action` | propose · next · review · quiz · pause · stop | Jev | propose if no reading_plan, else next | — |
| `reader_state` | curious · hostile · grieving · in crisis · ready to join | Jev | curious | conversation (decays, §2b) |
| `institution` | text: the tradition's living institution / qualified teacher | code from religions_specified (reviewed table) | "a qualified teacher of your tradition" | — |
| **Found (written by elements during the tree)** | | | | |
| `found_passages` | [passage + authority kind, work, translator, context, original{text, translit}, annotations] | search/fetch/read elements | [] | becomes previous_evidence |
| `found_records` | [person / work / fact record, translit] | fetch elements | [] | becomes previous_evidence |
| `web_found` | [{site, url, snippet}] — never quoted as library evidence | `search.web` | [] | — |
| `found_outcome.<node>` | one · several · thin · none · error, per node | each element | — | thread |
| `path` | [node:edge] as the tree ran; templates read verdicts (`path.jr = stated_unclear_bearer`) | the engine | [] | — |
| `sub_themes` | [short text] | `plan.subthemes` | [topic] | — |
| `widened` | what scope E2 widened and why | E2 only | none | — |
| `missing` | what the tree looked for and did not find | elements | [] | → state.open |

Item annotations on found items: `out_of_scope` (a named thing found outside the scope; ranked after in-scope copies),
`given` (already quoted this conversation), `nearest` (absence: the nearest real passage), `traced` (secondary → primary).
Transliterations (`original.translit`, `found_records[].translit`) come from CTAI or the library's own spelling, so the
writer copies them and never improvises (§3).

Cost rule: code-filled units are free and always present. Scope units and `depth`/`reply_language` come from the ONE Jev call
that chooses the strategy. Request units are asked in that same call only for the strategies Jev is weighing (each strategy
declares `needs:`); a unit a tree discovers it needs later is a `judge` node, recorded like any other Jev decision. A
branching question the strategy always needs goes in that call (e.g. `challenge_kind`), branched by `switch`.

Per strategy the spec now has `needs:` (units it reads, required vs optional with default) and each node `reads/writes`.

### §2b Conversation state (the carried units, kept as one object)

Chad 11-09: "maybe we have a state object we maintain with conversation fields extracted and available for decisions and filtering."

Today nothing is kept: every turn re-derives from raw history (triage even asks Jev "does this continue the previous
message?" afresh). Instead each conversation has ONE `conversation_state` object, stored with the conversation (repo, versioned
per turn), holding every unit marked "conversation" in §2a plus what only a running conversation knows:

```
conversation_state = {
  scope:     { religions_specified, authority_floor, search_originals, scope_source },
  reader:    { reply_language, audience, reader_state, reads_scripts },
  subjects:  { topic, named_person, named_work, term },             // the current subject of the conversation
  thread:    [{ turn, strategy, topic, output_form, found_outcome }], // what each turn was, compact
  given:     [{ turn, kind: passage|title|record, ref }],  // every item a reply quoted or listed, ordered per turn
  offers:    [{ what, turn, strategy, units, channel? }],  // open offers; "yes" replays strategy + units exactly
  open:      [question],        // what was asked and is still unanswered or was answered thinly (missing)
  version, updated_turn }
```

**How it is maintained (cheap and observable):**
1. Turn start: code loads the state; the ONE Jev call that chooses the strategy gets the state + `current_user_question` and
   returns only CHANGES (a patch: "religions_specified → [Islam]", "subjects.topic unchanged", "offers[0] accepted"). Jev
   never re-reads the whole history to rebuild what the state already holds; the last 2 rounds stay in his context for tone.
2. Tree end: code writes what the tree found (`given` += quoted/listed items, `thread` += this turn, `open` from `missing`,
   `offers` += what the template offered, `subjects` ← the resolved subject).
3. Every patch is stored with its turn (who changed what: Jev or code), so a wrong filter is traceable to the turn and the
   decision that set it, and a Jev mistake on state feeds the Jev-miss fix loop like any other.

**Field rules:**
* **given:** holds every item kind (passages, titles, records), so "the second one" after a list of titles resolves through
  `referent`. Repeats are skipped at `rank`/`shape` (`skip: given`), never at search, so "that passage" still resolves; a
  request that resolves to a given item ("say that prayer again") shows it again.
* **offers:** store `{what, turn, strategy, units}` (and `channel` when the offer is to email), so "yes please" replays the
  offer exactly. An offer lapses after 2 turns or on a topic change.
* **open:** Jev sees it and may choose "answer the open item" as a patch on the previous strategy. Code clears an item when
  a later turn answers that topic with found_outcome one or several. Anís raises it unprompted only in email/research depth.
  It is written when the tree ended thin/absence/unavailable, and when E2 widened — not for an out_of_scope hit on a named thing.
* **reader_state decays:** `in crisis` persists until Jev patches it; `grieving` colours only the turns on that subject and
  never silently a later unrelated question.
* **reader patches:** a carried unit the reader sets explicitly ("in Persian", "for my kids", "I read Arabic") is patched into
  the conversation layer at once; the memory/premise path decides whether it becomes durable reader memory
  (`reads_scripts` included; never set from one Arabic proper name inside an English question). The state never writes the
  reader card itself.

**What it is for:**
* **Filtering:** every fetch/search element applies `scope` without asking; trees read `given` to skip repeats.
* **Decisions:** Jev options and `judge` nodes see the state, so follow-ups ("source?", "the second one", "what about in
  Islam?", "yes please", "make it a table") resolve against `given` / `thread` / `offers` / `scope` instead of guessing.
  Most G-family requests become: an existing strategy + a state patch.
* **Templates:** `{{religions_specified}}`, `{{audience}}` etc. read from it.
* **Admin:** the conversation view shows the state per turn (the digest gets one line: what changed).

Units NOT carried (current_user_question, found_* during the tree, depth, channel, named_sources) stay turn-local.

**Layers (Chad 11-09 — "we already have a user profile object, a conversation state object"):** every field resolves
through one chain, nearest wins, and the winning layer is recorded (`scope_source`: turn · conversation · reader · site ·
default):

| layer | object today | lifetime | example |
|---|---|---|---|
| turn | Jev's patch for this message | one turn | "…and in the Qur'an?" |
| conversation | `conversation_state` (§2b) | the conversation | earlier: "I am only interested in Buddhism" |
| reader | reader card: participant memory + premises (`reader-card.js`) | across conversations | a reader who always asks in French |
| site | host `profile` (`default_tradition`, `scope_config`) | per host | OceanLibrary → Bahá'í |
| default | the whole library | — | — |

**Scope binds every strategy, lists included (Chad 11-09):** "add jev filters for things like 'which religions does this
conversation apply to?' and then pass that through to each tool call so that often one strategy can work for many religions
depending on conversation context." The scope units replace today's three separate readers (plan.filters.religion, the
comparison's side choice, profile.default_tradition). "Show me all books that discuss X" after "I am only interested in
Buddhism" → the shelf/search runs with `religions_specified=[Buddhism]` from the conversation layer. Rules:
* Elements search **scope ∩ the tree's params**: a tree may narrow (authority tier, one side per comparison branch); an empty
  intersection is a free none.
* **Only the reader widens** ("in every tradition" → a patch; it persists in the conversation layer unless Jev marks it
  turn-only). In a tree, only E2 (`$absence`) widens, as a routed outcome, and the reply says so.
* **Named things are ranked, not filtered** (§1 step 4); a hit outside the scope carries `out_of_scope`.
* **The scope clause** is written once in the §3 base template; it shows when the conversation or reader layer narrowed the
  search and `scope_excluded > 0` (site layer: only on a miss). A silent filter looks like a missing library.
* The scope is recorded on the turn (branch metrics by scope) and carried to the next turn.

### §2c Run trace, feedback hooks, display (Chad 11-09)

"A decision tree is the expression of a strategy." However a task is thought through — by hand, by the Unmatched planner
(§1b), or by promotion — the result is a tree in the §1 schema, stored as a strategy row. They are one kind of object, run by
one engine, traced the same way.

* **Run trace, per node:** the units read (value + the layer it came from), the exact params passed to the tool, what came
  back (count, `scope_excluded`, the top hit), the edge taken, time and cost.
* **Feedback hooks attach to the node that caused them:** a `probe` mismatch, an empty or errored result, the Opus judge's
  verdict (mapped to the node whose output it faults), the reader's next-turn reaction ("not what I meant" → the judge or
  switch that chose the reading; "source?" → the node that supplied the passage). The improvement loop then targets a node
  (its params, its option text, a missing tier), not just the strategy.
* **Display:** the admin view draws the tree with this turn's path highlighted; each node expands to its inputs, tool call,
  outputs and feedback. The docs page draws the same tree from the row, without a run.
* **The view is a flow canvas like n8n (Chad 11-09):** "display the decision tree in manner similar to n8n with flow and
  fields and tools and decisions. With quick popup drill-in to see llm prompts and decision prompts and testing stats and
  inputs and outputs."
  - **Canvas:** left-to-right flow. One card per node, showing the element icon, the node id, the tool it calls and the
    units it reads → writes (field chips). Edges are labelled with their outcome (one · several · thin · none · error ·
    a judge option) and carry per-edge counts (how often each branch is taken).
  - **Decision nodes** (`judge`, `switch`, `rank`) look different from tool nodes. The shared ends (`$absence`,
    `$fallback`, `$unavailable`) are small terminal pills. A `hand.strategy` node opens the callee's tree.
  - **Popup drill-in** (one click, no page change), with tabs:
    - **Prompt:** the exact LLM or Jev prompt, its options and the model.
    - **Params:** the static params and the unit bindings.
    - **Stats:** runs, edge split, p50 ms, $ per run, error rate, and test results (the stored replay cases and the
      5 test phrasings, pass/fail).
    - **Samples:** recent inputs → outputs (units in with their layer, tool params, top results, edge taken).
    - **Feedback:** node-level hooks such as probe mismatches, judge verdicts and reader reactions.
  - **Run overlay:** opened from a conversation turn, it shows the same canvas with that turn's path lit and dims the
    rest. Each node's popup then shows that turn's actual values.
  - **Built with** `@xyflow/svelte` (Svelte Flow) and dagre auto-layout, read-only at first. The canvas renders from the
    strategy row plus the run trace; there is no hand-maintained layout. Editing in the canvas can come later and would
    save a candidate version through the promotion gate.
* **Exists already:** the graph engine records each decision and per-step metrics (branch taken, ms, $) per strategy step.
  **New:** per-node unit/param recording (values + layer), node-level feedback rows, and the tree view (admin + docs).

### Elements

Every element is an activity in `activities/index.js`. Params make one element serve many trees. All retrieval elements
share the outcome contract **one · several · thin · none · error** (§1 step 6), apply the scope units implicitly
(scope ∩ params; named things ranked, `scope: rank`), return `scope_excluded`, and take an optional `stage:` (progress line).
Elements read and write the §2a units only; there is no separate shared slot object.

| element | kind / cls | params | edges | wraps (existing) |
|---|---|---|---|---|
| `fetch.work` | tool/code | lang? · scope: rank | one · several · none · error | document_search (title index, fuzzy, all languages) |
| `fetch.reference` | tool/code | scope: rank | one · several (editions) · none · error | reference parser (Bible/Qur'an/Gita/numbered Bahá'í) |
| `fetch.phrase` | tool/code | mode: exact\|close · words · scope: rank | one · several · thin (close only) · none · error | quotation_trace / phrase index |
| `fetch.person` | tool/code | scope: rank | one · several (bearers) · none · error | biography_search |
| `fetch.original` / `fetch.translation` | tool/code | direction: to_original\|to_translation · target_lang | one · thin (work only) · none · error | original_lookup / translation_lookup |
| `fetch.renderings` | tool/code | term · translator? | one · several · none · error | rendering_lookup (CTAI) + glossary |
| `fetch.align` | tool/code | versions[] · passage? | one · several · none · error | aligns one passage across editions/translations (reference parser for numbered texts; paragraph alignment otherwise) — to build |
| `fetch.anchor` | tool/code | — | one · thin · none · error | loads the passage a question is about from reader_position / quoted_words / state.given / previous_evidence |
| `fetch.prayer` | tool/code | key: occasion\|incipit | one · several · none · error | prayers by occasion (index to build; HyPE over prayer shelf until then) |
| `fetch.guidance` | tool/code | — | one · several · none · error | House of Justice by date/topic (index to build; shelf search until then) |
| `fetch.collection` | tool/code | id · key? (e.g. id: crisis-help, key: locale) | one · thin · none · error | prepared topic collections (to build; none until then) |
| `fetch.events` | tool/code | subject | one · several · none · error | dated claims from the entity graph (to build) |
| `fetch.calendar` | tool/code | date\|occasion | one · none · error | Badí' calendar: date ↔ Feast / Holy Day (to build) |
| `fetch.activity` | tool/code | — | one · none · error | the reader's reading plans → `reading_plan` (to build) |
| `fetch.facts` | tool/code | — | one · error | library facts / corpus status |
| `fetch.work_notes` | tool/code | — | one · none · error | work_notes_lookup (catalogue: date, author, occasion) |
| `search.shelf` | tool/code | authority: scripture\|interp\|guidance\|history\|law\|prayer\|any; k {default, research} | one · several · thin · none · error | fused_search restricted by authority, inside the scope |
| `search.hype` | tool/code | shelf · q | several · thin · none · error | HyPE question search |
| `search.originals` | tool/code | — | several · thin · none · error | originals_search (original-language phrase index) |
| `search.web` | tool/code | query (the scope goes in as words, labelled) | one · none · error | web_search → `web_found` (always labelled as outside the library) |
| `search.together` | tool/code | list of fetch/search nodes with params | one · several · thin · none · error (merged) | runs cheap independent tiers in parallel, merges into found_* (one node) |
| `search.fanout` | tool/code | by: unit (compare_sides, sub_themes) or facets: [..]; inner: element+params or hand.strategy | all · some_thin · all_none · error | runs the inner element once per value, in parallel |
| `probe` | tool/code | step: a search node; sample: n; expect: {kind, language, author …} | match · adjust · mismatch | runs the step on a small sample, checks hits against the plan's expectation; adjust = rewrites the step's params (§1b) |
| `read.around` | transform/code | — | done | context_lookup on each passage to be quoted |
| `read.source` | transform/code | — | traced · kept | source_trace + own_source (secondary copy → primary work) |
| `switch` | decision/code | on: a unit or expression (which unit is filled, count, found_outcome, kind); cases | the cases' edges | code branch on a unit — no LLM (was DE's `route`) |
| `judge` | decision/jev | question; options:[{edge,when}]; mark? (Jev marks the chosen items) | the options' edges | ONE Jev decision with a fixed option set (systemone) |
| `judge.passages` | decision/jev | precedence (on conflict) | answers · mentions_only · conflict · empty (no input) | Jev per passage: answers / only mentions / contradicts another |
| `plan.subthemes` | tool/llm (light generator) | n | done · fail | plan_subthemes → `sub_themes` (fan-out list; §1 step 7) |
| `rank` | transform/code | by: authority\|date\|score\|occasion\|copy\|attributed\|marked\|length\|audience\|history; k; pin?; group?; dedupe?; skip: given | done · empty | orders found_*, keeps the top k; empty when nothing is left → $absence |
| `ui.stage` | io/code | stage | emitted | progress line (live channels) |
| `shape` | writer-prep/code | template; allow (formats); by_count?; '@sub' (a sub-tree's template); offers? | done | sets the writer instruction from a template + mode block; ends at `$end` |
| `hand.strategy` | tool/code | name · upto: evidence (stop before the callee's shape) · unit overrides | found · thin · none · error (the callee's full set) | runs another strategy's tree as a sub-tree; its Jev calls count toward step 7 |
| `hand.job` | tool/code | kind: compilation\|deep_report\|study_plan | queued · error | queues a job with this tree as the plan and a FROZEN copy of the scope; offers email; live reply says what is coming |
| `deliver.email` | tool/code | — | sent · no_address · error | the letter sender, given found units + email mode |
| `fallback.agent` | tool/llm | — | answered · fail | the research agent (last; logged as a tree defect) |

**Shared ends** (not counted toward node limits):
* `$absence` = `hand.strategy{e2}` — the not-found sub-tree (DE file, `internal`). It may widen the scope (param `widen`,
  E2 only, writes `widened`) and ends in the ABSENCE shape; the calling tree passes its own absence template as an override.
* `$fallback` = `fallback.agent` — `answered` → the calling tree's main shape; `fail` → `$unavailable`.
* `$unavailable` = `shape{tpl.unavailable}`.

`fetch.thread` is dropped: `previous_answer` / `previous_evidence` / `state.given` / `referent` (code units, free) cover it.

Today's executors (`strategy.comparison` …) stay registered as single elements, so every old graph still compiles. Graph
limits: MAX_NODES 6 → 16 working nodes; a lookup tree should stay ≤ 9 working nodes, a researched tree ≤ 14.

---

## §3 Modes and templates (shared)

### Modes

| mode | length | can show | citations | special |
|---|---|---|---|---|
| **voice** (to build: channel `voice`) | 60–120 spoken words; research depth ≤ 250 | nothing visual | spoken: "Bahá'u'lláh, in the Kitáb-i-Íqán" — no links, no numbers | transliteration, never script; quotes ≤ 2 sentences; ends offering to send the passages ("Shall I send these to your email?") |
| **widget-chat** | ~150 words | links, lists, quotes | linked citation text, 1 link cap | one passage quoted, rest by title |
| **site-chat** | 150–250 | + tables, headings | linked citation text | tables when ≥ 2 sides × ≥ 3 points |
| **email** (privileged) | ≤ ~600 | + charts, rtl, bilingual blocks | linked, translator named | passages in full; original beside English (```bilingual); greeting and close |
| **pdf** (a report laid out for the page) | as the content needs | + full tables, sections, notes | full references, translator named, source list | title + date + method line; tables never cut; produced as a job (`hand.job`) and sent by email or link |
| **depth=research** (any live) | 500–900 | per channel | per channel | full answer; on voice → speaks the short one and offers the full one by email or pdf |

Lengths count prose. Passages are counted per mode (`reply_budget.passages_max`): voice 1 spoken (≤ 2 sentences) · widget 1
+ titles · site ≤ 6 in full · email and pdf all. A list, table or program is not clipped to fit a prose length; when it is
larger than the mode holds, the reply shows the first part and offers the rest (email/pdf). A quotation never ends in a clip.

### Base template (every template inherits it)

`{{base}}` = the strategy's own instruction; the base rules are written ONCE here and never repeated in a strategy:

* **Scope clause** `{{scope_clause}}`: one short clause naming an inherited filter and how to widen it ("Buddhist works only,
  as you asked; say 'all traditions' to widen"). Shown when `scope_source ∈ {conversation, reader}` AND `scope_excluded > 0`;
  for the site layer only on a miss (absence). Not shown for a named thing that was found, nor when
  `reader_state ∈ {grieving, in crisis}`. When E2 widened, the absence template states the widening instead.
* **Original-script words** (below): transliteration beside any original-script word whose script is not in
  `reader_card.reads_scripts`, from data only.
* **Out-of-scope hits:** a named thing found only outside the scope is given, with one line saying where it comes from.

### Templates by information shape

Shared templates `tpl.<shape>` (each with a mode block per mode; `{{base}}` = the strategy's own instruction). A strategy's
own template overrides only what differs.

| shape | first sentence | body | when the data is… |
|---|---|---|---|
| `one_passage` | the answer, or the passage's point | the passage quoted, linked, translator | one decisive hit |
| `passages` | a direct answer | 2–4 passages in authority order, each linked | several hits that answer |
| `sides` | one line framing | a section per side in its own terms, then shared / different; > 4 sides → a table, empty sides dropped and named | comparison, controversy |
| `record` | who/what in two sentences | key dates, then the passages about them | person, work, fact |
| `sequence` | the arc in one line | dated events in order, each cited | story, timeline (≥ 3 dates) |
| `verdict` | found · different wording · not found / yes · no · it depends | the evidence | quotation trace, rules |
| `titles` | the best match, linked, italic | others as a short list | book lookups, several hits |
| `table` | what the table shows and its main pattern | the rows (per mode: voice none, chat some, email/pdf all), then a summary | renderings, side-by-side lists, reshape |
| `side_by_side` | which is authoritative | original and translation, aligned, both linked | originals, two translations |
| `absence` | "I can't find that in the library." | the nearest real passage, labelled as nearest; any widening stated; web only labelled | none after the last tier (via E2) |
| `unavailable` | "I couldn't search the library just now." | what was asked, kept in `open`; offer to try again or send it by email when it works | an error after the last tier and the fallback — never "not in the library" |
| `program` | what it is for | ordered items (who reads, what), opening/closing | devotional program, study handout |
| `comfort` | one warm line | one or two passages, a prayer offered | grief, fear, doubt |

List units (`found_passages`, `found_records`, `sub_themes`) are evidence for the writer, not text to paste; the template
says which and how many to show per mode.

**Original-language words (Chad 11-09), applied in every template through the base:**
* **Reader field:** the reader card has `reads_scripts: []` (arabic, persian, hebrew, …). An entry is set from evidence only:
  the reader writes in that script or says so. Jev patches it into the conversation layer; the memory path keeps it. If a
  script is not listed, the reader does not read it.
* **Default:** every original-script word in a reply appears WITH its transliteration beside it: حکمت (*ḥikmat*),
  root ح-ك-م (*ḥ-k-m*).
* **Reader reads the script** (its script in `reads_scripts`): the script stands alone, with no transliteration. Gloss the
  meaning only when the sentence needs it.
* **The transliteration comes from the data, never improvised:** from CTAI (`ctai-term.js` returns `transliteration`) or
  from the library's own spelling, in the Bahá'í system (Shoghi Effendi's), carried on the found item (`translit`). If neither
  is available, show the script and the meaning, and leave out a guessed romanization. A free writer check (like
  md-valid) flags original script without an adjacent data-sourced transliteration when the reader does not read it.
* **The exemplar** for a term answer (`term_with_original`, CTAI renderings) is Jafar's note to a reader who reads Arabic:
  > Behind [the English word "wisdom"] in the texts stand several different originals, and they're not interchangeable
  > in sense. حکمه (root ح-ك-م) is rendered "wisdom" 123 times - by far the most common. علم (root ع-ل-م,
  > "knowledge") stands behind it 24 times. عرفان (root ع-ر-ف, a word closer to recognition or gnosis) 5 times. And عقل
  > (root ع-ق-ل, "reason" or "intellect") just twice.

  Its shape: the English word, then each original with its root and count, most common first, and what each root does
  in its sentence. Then an offer to go deeper, with the concordance linked. For a reader who does not read Arabic, the
  same text has *ḥikma*, *ʿilm*, *ʿirfān* and *ʿaql* beside the script.

---

## §4 Trees

One file per family under `planning/strategy-trees/` (A lookups, B explain, C compare, D practice/heart, E challenge,
F make something, G follow-ups, H conversation). Each tree follows the §1 JSON schema in readable form. Node counts are
working nodes (shared ends `$absence` / `$fallback` / `$unavailable` not counted).

### Index (consolidated 11-09)

| class | strategy (or setting_of X) | file | working nodes |
|---|---|---|---|
| A1 A fact | `a1` | A.md | 11 |
| A2 Find a book | `a2` | A.md | 6 |
| A3 Passages on a topic | `a3` | A.md | 9 |
| A4 Quotation trace | `a4` | A.md | 9 |
| A5 Look up a reference | `reference` | A.md | 7 |
| A6 What a word means | `a6` | A.md | 11 |
| A7 Show the original (or translation) | `a7` | A.md | 8 |
| B1 What a tradition teaches | `understanding` | BC.md | 10 |
| B2 Explain this passage | setting_of `understanding` (anchor) | BC.md | — |
| B3 Why or how | setting_of `understanding` (`question_frame`) | BC.md | — |
| B4 Tell the story | `story` | BC.md | 9 |
| B5 Who was this person | `person` | BC.md | 7 |
| C1 Two traditions on one topic | `comparison` | BC.md | 4 |
| C2 X vs Y | setting_of `comparison` (`compare_sides`) | BC.md | — |
| C3 All religions on X | setting_of `comparison` (`religions_specified = all`) | BC.md | — |
| C4 Two accounts or translations | `versions` | BC.md | 8 |
| D1 Grief, fear, doubt (and crisis) | `d1` | DE.md | 11 |
| D2 Prayer for an occasion | `prayer` | DE.md | 7 |
| D3 Rules and practice | `d3` | DE.md | 12 |
| D4 Community life and service | `guidance` | DE.md | 10 |
| D5 Cult? join? convert? | `d5` | DE.md | 8 |
| E1 Pushback, contradiction | `e1` | DE.md | 13 |
| E2 Something that isn't there | `e2` (internal; the `$absence` shared end) | DE.md | 10 |
| E3 Controversy | setting_of `understanding` (`contested`) | DE.md | — |
| F1 Compile quotations | `compilation` | FGH.md | 10 |
| F2 Devotional program | `devotional_program` | FGH.md | 9 |
| F3 Study session | setting_of `compilation` | FGH.md | — |
| F4 Timeline, table, map | setting_of `story` (timelines); tables → `comparison` / `a1` | FGH.md | — |
| F5 Research brief | setting_of the content strategy at `depth: research` | FGH.md | — |
| F6 Teach me over time | `teach_over_time` | FGH.md | 9 |
| G1 Refer back / accept an offer | setting_of `@previous` or the strategy now asked | FGH.md | — |
| G2 "Where is that from?" | setting_of `a4` · `a7` (original) | FGH.md | — |
| G3 Exact words | setting_of `a4` / `a7` | FGH.md | — |
| G4 Go deeper | setting_of `a6` / `understanding` | FGH.md | — |
| G5 "And in Islam?" | setting_of `@previous` / `comparison` | FGH.md | — |
| G6 Pushback on the answer | setting_of `e1` (`challenge_kind`) | FGH.md (reference) → DE.md | — |
| G7 Reshape the answer | `reshape` | FGH.md | 9 |
| H1 About Anís or the library | `h1` | FGH.md | 3 |
| H2 Bare word or fragment | `bare_fragment` | FGH.md | 9 |

25 own strategies (one internal: `e2`), 14 settings — 39 classes. Each family file holds the full card.

## §5 Build plan

1. Elements (§2) as activities + catalog entries + tests; `judge` = one generic activity whose options are params; `switch`,
   `search.together`, `probe` and the shared ends (`$absence` = E2, `$fallback`, `$unavailable`) first, since most trees use them.
2. Context units (§2a) with fillers; `scope_excluded` from every fetch/search; `conversation_state` (§2b) with patches per turn.
3. Shared templates (§3) as `tpl.*` rows, base template (scope clause, scripts rule) once; mode blocks rendered by `shape`
   from ctx.channel (+ voice channel entry, + pdf via `hand.job`); free writer check for untransliterated script.
4. Seed the §4 trees as strategy rows v(next), each a candidate through the promotion gate (replay vs the current version:
   score, p50, $, Jev share, distinctness). Planned classes become active when their tree passes.
5. `DESIGN_SYSTEM` ← §1 verbatim; `designMessage` sends the §2 catalog, §3 templates and the nearest strategies' full trees.
6. Unmatched at run time (§1b): the planner emits a §1-schema tree, tells the reader the plan, probes, runs, shapes, and saves
   the tree + measured outcome as a candidate strategy; agent fallback only when a step cannot be built (logged defect).
7. Run trace (§2c): per node, record units read (value + layer), exact params, result (count, scope_excluded, top hit), edge,
   time, cost — extending the engine's existing decision + per-step metrics.
8. Feedback hooks (§2c): node-level feedback rows from probe mismatches, empty/errored results, the Opus judge verdict, and
   the reader's next-turn reaction; the improvement loop targets the node.
9. Tree view (§2c): the admin conversation view draws the tree with this turn's path highlighted, each node expandable to
   inputs, tool call, outputs, feedback; the docs page draws the same tree from the rows without a run (no hand-written copy).
