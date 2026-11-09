# Anís strategies and tools — first-principles review (11-09)

Chad: "make sure every decision tree makes sense … as smart and well-planned as possible as a starting point."
Library: 12 traditions, ~158k docs. Any tree that only works for one tradition's books is a defect, not a starting point.

## Rules every tree follows

1. **Tradition first, as a unit.** religions_specified (Jev, this turn) → the named work's tradition → the host's default → none.
   None = interfaith: fan out over the library's traditions and keep those whose search really answers. Never a Bahá'í default in code.
2. **Authority = that tradition's own model** (`tradition-authority.js`): its scripture → authoritative interpretation → commentary → scholarship.
   The Bahá'í ladder applies to Bahá'í answers only.
3. **Queries are the reader's subject** (`questionSubject`), never stuffed with keywords ("chronology dates years ministry").
4. **Form is a property of the passage, not of a book's headings.** Headings, titles and collections are signals, never the basis.
5. **Absence is honest and cheap**, stated per tradition or side, naming what was searched.
6. **Template slots come only from units something fills.** Nothing reads a unit no node writes.
7. **Cost per run path:** code first. At most one cheap Jev choice per decision. One writer call. Opus never runs on a matched turn.
8. **Originals means any language the library holds** (the Arabic Qur'án, Hebrew Tanakh, Pali, Sanskrit, Chinese, Persian/Arabic Bahá'í).
   We never translate; we align existing editions.

## Tools: assumption → contract

| tool / element | built on | verdict | contract it should have |
|---|---|---|---|
| prayer_lookup / fetch.prayer | works ranked by prayer words in titles; occasion = headings | **redesign** | `{tradition?, need?, name?, incipit?, work?}`. A named prayer or its opening words → literal/phrase search across the tradition (scripture included: Psalms, Qur'án du'as, Japji, Gayatri, Ashem Vohu). A need → meaning search in the tradition (core first) plus its prayer works → candidates. Whole-prayer boundaries come from section, attribution or contiguity. |
| judge.prayer | one typed Jev choice | keep | Candidates labelled by their opening text and work; "none fits" is an option. |
| quotation_candidates / source-hunt | `coreOnly` = Bahá'í DOCTRINAL; original language guessed fa/ar by script; no tradition input | **generalize** | Input gains `tradition?`. Core = the tradition's own core. The original = that work's edition in its own language, for any tradition. |
| rendering_lookup (CTAI) | Shoghi Effendi's renderings | keep, **Bahá'í-only by label** | A second provider handles other traditions: renderings across parallel translations of the same work, aligned by verse or section. |
| originals_search / original_lookup / translation_lookup | Persian/Arabic Bahá'í pairing | **generalize** | Work family (same work, other language edition) + alignment by reference number, else by multilingual meaning. Bahá'í pairing is one provider. |
| reference (lookup.js) | generic verse and section tables | ok | — |
| fetch.guidance | House of Justice | ok, gated | Only when the scope is Bahá'í or the House is named. |
| search.hype `shelf` | param not read (audit #24) | **fix** | Read it as an authority or doc-class filter, or drop it from the trees. |
| judge.timeline | people records only | **generalize** | Judges dated claims about any subject (event, work, person). |
| fetch.events / collection / calendar / activity | not built | ok as optional tiers | No tree may depend on them for its main path. The calendar is Badí‘ only; per-tradition holy days go on the wishlist. |
| search.web | labelled, never quoted as library evidence | ok | — |

**TOOLS wishlist:**
- passage **form** label from the enrichment EXTRACT stage (prayer / law / narrative / exhortation / commentary)
- **work family** links (translation_of, edition_of)
- an events index
- per-tradition calendars

The form label turns prayer-ness into data. Until it exists, the Jev choice verifies it.

## Trees

Format: node element {edge→node}. END = shape.

### prayer — REDESIGN
- **t0** resolve tradition (code: rule 1)
- **p1** fetch.prayer *named* (name or incipit given) {one→p6, several→p4, none→p2}
- **p2** fetch.prayer *need*: meaning search in the tradition, core first, plus its prayer works. With no tradition, per tradition, keeping only traditions with real hits. {several, thin→p4; none→p7}
- **p4** judge.prayer: one Jev choice over the candidates. Which are whole prayers that fit, best first. {picked→p5, none→p7, unjudged→p3 rank→p5}
- **p5** read.whole: extend the chosen passage to the whole prayer (section, attribution, contiguous address) →p6
- **p6** shape prayer.one: the first prayer in full, two offers, attribution and a citation link. Several traditions use prayer.many. END
- **p7** shape prayer.absence: per tradition, what was searched. END

Cost: named = code. Need = code + 1 cheap Jev. Absence = code.

### comparison — FIX wide path
- **c0** sides (Jev unit). For "how do religions see X" with no sides: sides = the library's traditions.
- **c1** search.compare: the same question per side, side-scoped, each side's authority model, k≥3
- **c2** judge.passages: one Jev call over every side's passages, tagged by side
- **c3** sides with no *answers* are written to `missing`. The shape states them, never silently drops them.
- **c4** shape comparison.sides: point-by-point agreement and difference, each side cited from its own core first

Drop the hype+shelf top-8 path: it lets corpus size pick the sides. Cost: code + 1 Jev + writer.

### understanding@7 — KEEP
anchor → parallel searches → inside → widen → rank → read around → trace → judge → three shapes. Sound.

### guidance — KEEP (gated to Bahá'í scope)

### reference — KEEP

### compilation — FIX grouping
- plan.subthemes → search.fanout per sub-theme in scope (tradition authority order) → judge → group **by sub-theme**, tier order within each group.
- No tradition: the host default. On an interfaith host, group by tradition, then by theme.
- Never group by author. Doctrinal unless asked.

### book, about, general_research, respond — KEEP

### quote_trace — GENERALIZE
- **q1** fetch.phrase: tradition-aware quotation_candidates across the whole library
- **q2** judge.holds: one Jev call
- **q3** read.source: secondary → primary
- **q4** original edition, any language
- **q5** shape: source (best published), the earliest and most authoritative occurrence, who quotes it, misattribution stated
- none → search.web for the attribution (labelled) → shape "not in the library; the web attributes it to …"

### term — GENERALIZE
- **t1** tradition + the term's language
- **t2** definitions: the term inside the tradition's core plus the library's dictionaries and glossaries
- **t3** usage: phrase usage across the core
- **t4** renderings: parallel translations aligned. Bahá'í: CTAI as one provider.
- **t5** judge: one Jev call, defines vs merely uses
- **t6** shape: meaning, how the tradition's own texts use it, its renderings, scholarship labelled

### original — GENERALIZE
- **o1** anchor (the quoted words or a found passage)
- **o2** its work
- **o3** the work family's original-language edition
- **o4** align by reference, else by multilingual meaning
- **o5** shape: the original with its existing translations

No edition → honest absence naming the missing language. Never translate.

### history_fact — FIX
- **h1** search.shelf: subject query, histories, chronicles and scholarship of the tradition ∥ **h2** search.web (`web_found`, labelled)
- **h3** judge: precedence is **historical** (primary record → contemporary account → scholarship), not doctrinal
- **h4** shape: the fact with its date and sources; disagreements stated

Bug fixed: shape_web read `found_records` but web writes `web_found`.

### claim_check — REDESIGN
- **k1** plan.criteria: a light generator. What would make *this* claim true or false (e.g. "X taught Y" → the places X addresses Y; "is G a cult" → the criteria scholars of religion use, planned per claim).
- **k2** search.fanout per criterion: the tradition's own texts → scholarship → web (labelled)
- **k3** judge per criterion: supports / contradicts / silent
- **k4** shape criterion by criterion; the verdict is only as strong as the evidence

Removes the hard-coded cult criteria and the unfilled `{{definition}}` / `{{criteria}}`.

### timeline — REDESIGN
- **l1** plan.entries: a light generator of the expected dated entries for the subject
- **l2** search.fanout per entry for dated evidence
- **l3** judge.timeline (generalized): keeps the entries with a dated source
- **l4** rank by date
- **l5** shape table: date · event · source. Undated entries are listed apart.

Removes the "ministry" stuffing and the unfilled `{{entries_*}}` / `{{sources_*}}`.

### phrase_usage_trace@3 — KEEP
Order by document year. Undated documents go last, and the shape says so.

## Implementation split (subagents, separate worktrees)
- **A** prayer (tool, prayer-shelf, tree, read.whole)
- **B** claim_check, timeline, history_fact (plan.criteria, plan.entries, judge.timeline generalized, the web_found fix)
- **C** comparison wide path and `missing`, compilation grouping, search.hype `shelf`
- **D** quote_trace, term, original (tradition-general providers; the Bahá'í tools become one provider each)

Each saves new candidate versions through the seed. The old prayer@2–5 candidates are retired, so the "prayer book" text disappears.
