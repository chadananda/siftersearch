# Jafar — Conversational Personality Analysis

**Source:** Four ten-round dialogues conducted overnight 2026-04-27/28, real conversations against the production Jafar (gpt-4o + system prompt + library tools).

**Dialogs analyzed:**
1. [Warnings about the Left, but not the Right](/dialog/001-left-right-warnings) — politics
2. [Women, the UHJ, and Faith in Unrevealed Wisdom](/dialog/002-women-uhj) — social-order
3. [What 'Abdu'l-Bahá Actually Meant by 'Religion'](/dialog/003-religion-word-meaning) — word-meaning
4. [The Bahá'í Soul, Buddhist Anatta, and the Limits of Both/And](/dialog/004-soul-reincarnation) — comparative-religion

---

## Headline finding

Jafar functions adequately as a **search-and-cite assistant**. Jafar does not yet function as a **deeply wise and knowledgeable friend who knows things**.

The gap is not effort — Jafar tries hard, runs the right tools, follows its instructions. The gap is *posture*. Jafar approaches every question as a search problem rather than as a conversation between two people who know enough to think together. A wise friend brings their own informed perspective and uses search to confirm and extend; Jafar effaces its own perspective and lets search results stand in for thought.

---

## Six failure patterns observed across all four dialogs

### 1. Literal-phrase trap

When the user asks about "the movement of the left," Jafar searches for those exact words. When that returns nothing useful, Jafar reports failure rather than reframing the query. A wise friend would have heard the question and immediately translated: *they mean Shoghi Effendi on communism — let me find his actual texts.*

**Evidence:** Dialog 1, Round 1 — "I searched the Bahá'í writings for specific warnings about 'the movement of the left' and 'the movement of the right.' The results did not provide distinct warnings about either."

### 2. One-and-done search

When initial searches return weak results, Jafar tends to give up and report the failure to the user. The system prompt explicitly says "Be persistent. If your first search returns weak results, try again with different terms" — but in practice Jafar tries once, maybe twice, then declares the search exhausted.

**Evidence:** Dialog 1, Round 3 — Jafar filtered by collection "The World Order of Bahá'u'lláh," got 0 hits, reported failure. Did not drop the filter, did not try author-only search, did not try simpler terms. The user had to instruct Jafar specifically to drop the filter.

### 3. Filter over-narrowing

When Jafar adds filters (religion, collection, document_id), it tends to be too aggressive. Religion filter spelled with diacritics (`Bahá'í`) when the canonical DB form is `Baha'i` returns zero results. Collection filter on a slightly-mistyped collection name returns zero results.

**Evidence:** Dialog 4, Round 1 — `religion: "Bahá'í"` returned 0 passages; `religion: "Baha'i"` would have returned the actual material.

### 4. Search result blindness

Multiple times Jafar received 5+ passages from search and reported "I did not find a specific passage" — even when the requested topic was clearly present in the results. Jafar appears to over-trust its own snap-judgment of relevance and under-read what the search actually returned.

**Evidence:**
- Dialog 1, Round 6 — searched "Promised Day fascism" / "Promised Day Hitler" / "Promised Day Mussolini," got 5 results each, reported "didn't yield the expected passages."
- Dialog 1, Round 10 — searched for Bahá'u'lláh on political division, got 5+6 passages, reported "I was unable to find a specific quote."
- Dialog 3, Round 3 — searched "din madhhab religion," got 5 passages, reported "no direct discussion."

### 5. Hedging instead of committing

When a question requires Jafar to take a substantive position — to make a real claim about what is true — Jafar tends to retreat to "both perspectives offer valuable insights." This is the worst trait for a friend who is supposed to know things. A wise friend takes positions, defends them, and revises under pressure. Jafar takes no positions and so has nothing to defend or revise.

**Evidence:** Dialog 4, Round 8-9 — when asked whether Buddhist anatta and Bahá'í personal-identity teachings actually contradict, Jafar repeatedly said they "appear to contradict" but "complement rather than directly oppose." It took the user proposing a specific resolution (anatta correct re ego, Bahá'í correct re higher soul) for Jafar to commit to anything.

### 6. Generic "Bahá'í lens" reflex

When asked for synthesis, Jafar reaches for the standard Bahá'í discourse moves: "oneness of humanity," "spiritual progress," "transformative force," "unity beyond divisions." These phrases are fine in isolation but become hollow when used as substitutes for specific engagement with the question. A wise friend would say something the user has not heard from every Bahá'í blog post.

**Evidence:** Dialog 1, Round 9 (the Bahá'í lens prompt produced a textbook Bahá'í-discourse paragraph with no specific quotation, no surprise, no insight).

---

## Three secondary issues

### 7. Link discipline lapse

The system prompt explicitly forbids linking to external sites (`bahai-library.com`, `bahai.org`, etc.). In Dialog 3 Round 1, Jafar generated a `http://bahai-library.com/...` URL that does not exist. The user had to call this out before Jafar reverted to siftersearch.com URLs.

### 8. Numbered-list reflex

Jafar reaches for numbered lists at the slightest provocation. Conversational prose would often serve better. A friend explaining a complex idea does not enumerate it 1-4 unless the structure genuinely requires it. Numbered lists make Jafar feel like a help-desk ticket, not a conversation.

### 9. No brought-knowledge

The deepest failure is that Jafar never brings information *unprompted* that a knowledgeable friend would bring. It does not say: "you mentioned Shoghi Effendi — note that he wrote *The Promised Day Is Come* in 1941, in the middle of WWII; that is the context for those Nazi/fascist passages." Every contextualization came from me, never from Jafar. Jafar searches what it is asked, not what would help the user.

---

## Quality scores per dialog

Scoring rubric (each criterion 0–100, weighted equally, mean = overall %):

| | Depth | Clarity | Stereotype-avoidance | Word-defns | Assumption-challenge | Teaching-clarity | Evidence-quality | **Overall** |
|---|---|---|---|---|---|---|---|---|
| Dialog 1 (left-right) | 65 | 70 | 50 | 40 | 60 | 65 | 55 | **58%** |
| Dialog 2 (women UHJ) | 75 | 75 | 70 | 65 | 75 | 75 | 70 | **72%** |
| Dialog 3 (religion meaning) | 70 | 70 | 60 | 80 | 70 | 65 | 60 | **68%** |
| Dialog 4 (soul/anatta) | 70 | 70 | 55 | 60 | 65 | 70 | 60 | **64%** |

**Average overall:** 65.5%

Dialog 2 (UHJ) scored highest because the topic forced Jafar into territory where the corpus has clear, oft-cited material and the philosophical question (faith in unrevealed wisdom) had a real Bahá'í tradition of engagement. Dialog 1 scored lowest because Jafar's first-instinct search behavior was at its weakest — taking the user's framing literally instead of reframing.

---

## What "deeply wise and knowledgeable friend" requires that Jafar lacks

A friend who *knows things*:

1. **Translates user questions into the right inquiries** without being told. They hear "movement of the left" and immediately search for "communism Shoghi Effendi 1937."
2. **Brings context unprompted** — biographical, historical, intra-corpus. Knows that *Promised Day Is Come* was 1941, that Shoghi Effendi's wife Rúhíyyih Khánum's later letters complete much of the philosophical groundwork, that 'Abdu'l-Bahá's 1912 American addresses differ in tone from his Tablets.
3. **Holds positions and defends them**. Does not retreat to "both/and" when forced into "either/or." Says: *here is what I think and why, push back if you disagree.*
4. **Names what is uncertain**. The phrase "the rationale is not detailed in the available writings" is a real Bahá'í position — Jafar should say so directly and confidently, not as if it were a search failure.
5. **Distinguishes authority levels**. Bahá'u'lláh is not the same as 'Abdu'l-Bahá is not the same as Shoghi Effendi is not the same as Rúhíyyih Khánum is not the same as a *Star of the West* magazine article is not the same as a Hatcher essay. A knowledgeable friend automatically weights these differently. Jafar does not.
6. **Is willing to be brief**. The current prompt says "Be brief. One sentence when one suffices." Jafar tends toward 4-paragraph numbered-list answers even when one sentence would do. Brevity is a mark of confidence; verbosity is often hedging.

---

## Proposed system-prompt revisions

(See companion document `docs/jafar-system-prompt-v2.md` for the full revised prompt.)

The single biggest change: **shift the prompt's center of gravity from "search and quote" to "think and confirm."** Search becomes the way Jafar verifies its own perspective rather than a substitute for having one.

Concretely the v2 prompt:

- **Adds a "Posture" section** ahead of "Rules" that names what Jafar is: a friend who already knows the corpus, not a librarian who only knows the catalog.
- **Adds a "Persistence ladder"** — concrete steps for what to do when the first search returns weak results. Try author + concept. Drop the religion filter. Try simpler terms. Try the common phrase. Don't report failure until five distinct queries have been tried.
- **Adds a "Source hierarchy"** — Bahá'u'lláh > 'Abdu'l-Bahá > Shoghi Effendi > UHJ > family memoirs > scholarly secondary > magazines. Jafar should weight quotations by tier and signal the tier to the user.
- **Adds a "Take a position" instruction** — when forced into a contradiction, Jafar resolves it by committing to one side and naming what it would take to revise. No "both perspectives offer valuable insights" diplomacy.
- **Adds a "Bring context unprompted" instruction** — date, work, surrounding controversy, who else weighed in. Jafar should be the friend who automatically tells you the history without being asked.
- **Tightens the brevity rule** — the existing rule is good but unfollowed. v2 makes brevity the default and elaboration the exception. One paragraph max unless the question demands more.
- **Strengthens link discipline** — never write a URL that did not come from a search result `url` field. Treat URL invention as the same severity as fabricating a quote.
- **Reframes filters as opt-in narrowing**, not default safety. Jafar should default to broad searches and add filters only when the user's question genuinely requires it.

---

## Improvement metric: re-test the same questions

After applying v2, re-run two of the four dialogs (Dialog 1 and Dialog 4 — the lowest-scoring) and rescore. Target: each rises by ≥10 points. The morning report includes the comparison.

---

## Open questions for further work

- **Does Jafar need a separate "wise interlocutor" mode** distinct from "library lookup"? The current single prompt tries to do both. Two modes might let each do its job better.
- **Can the search tool itself be improved** so that the religion-filter-with-diacritics problem is fixed at the API layer rather than relied upon to be Jafar's problem?
- **Should Jafar cite tier alongside quote** — e.g., the source name with a small marker indicating "primary scripture" vs "secondary essay"? This would let users weigh the citations themselves.
- **Should the conversation UI** preserve the user's previous turn and Jafar's previous answer when the user pushes back, so that pushback feels less like punishment and more like collaborative deepening?

---

## Conclusion

Jafar at v1 is competent. The system prompt is well-structured and the tool integration works. The gap to "deeply wise and knowledgeable friend" is not a gap of capability — gpt-4o is more than capable — but a gap of **prompt posture**. The current prompt asks Jafar to be a careful research assistant. The v2 prompt asks Jafar to be a friend who already knows the corpus and uses search to verify its own thinking.

This is a fixable gap. The v2 changes are small in word count but consequential in voice. The morning comparison test will tell us how much they actually move the score.
