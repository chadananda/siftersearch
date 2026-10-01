A search box looks like one tool. It is really many. Someone who pastes a sentence of Shoghi Effendi's English and
wants the Persian behind it is asking a different question from someone who wants *the* passage that best states an
idea, or the passage that answers a question, or every tablet addressed to one person. Each of those wants a different
route through the library, a different ordering of what comes back, and a different shape of reply.

Most search systems pick one route for everything, or hand the choice to a large language model that takes seconds to
think. SifterSearch is doing something else: a fast **System-1** model, Jev, makes typed decisions in about a tenth of a
second — which route to take, how to rank, how to answer — and the slow, careful work is kept for the few cases that
need it. This page lays out the strategies we have and the ones we are building, so they can be read, questioned and
added to.

## Why Branching Search Needs a Fast Decision-Maker

Branching only pays if choosing the branch is cheap. If every query first waits two to six seconds for a language model
to write out a plan, nobody would accept more than one or two branches. A System-1 model changes that arithmetic.

Jev, from TypeSafe, does not write prose. It answers **typed questions**: a choice among options we define, a yes/no
as a probability, or a score against a rubric — several questions in one call, each with a confidence. In our use it
answers in **about 150 ms**. Because it can only return one of the options we wrote, it can never drift off the menu;
it can still be confidently wrong, which is why every decision falls back to a sensible default and every choice is
logged.

The effect is already measurable. When search planning moved to one Jev classification with no language-model call,
our search-type test battery went from **49 of 76** queries answered correctly in about **6.5 seconds** to **61 of 76**
in about **0.18 seconds** (measured 2026-09-24). More branches, and faster.

The same pattern runs elsewhere: in an identity audit of one figure's mentions, Jev's confident "same person" calls
were **30 of 30 correct** on a random check across English, Persian, French, German and Spanish, and its "unclear" flags
surfaced namesakes that were visible only in the Persian. The rule we follow everywhere: *Jev decides the confident
majority and flags the rest for a careful reader.*

## How a Branching Search Works, Step by Step

1. **Code removes the impossible.** No timeline without dates; no comparison without two traditions; no original-text
   strategy for a work that has no original in the library.
2. **Jev chooses among what remains** — the search strategy, the re-ranking strategy and the answer format, as three
   questions in one call.
3. **The strategy runs.** Different strategies use different indexes: phrase vectors, keyword matches, translation
   links, person and concept ids, HyPE questions.
4. **The re-ranker orders the results** — by arithmetic where that is enough, by one more Jev call where judgement is
   needed.
5. **The answer is shaped** in the chosen format.

If Jev is slow or unavailable, each step has a default and the search still answers.

## Search Strategies: Which Route Through the Library

**In use today.** Jev sorts every query into one of seven shapes, and the shape decides which layers run (keyword
matching for quotations, HyPE questions for topics, diversity across traditions when the question is open):

| shape | the query… |
|---|---|
| quote | gives the wording of a passage, exact or half-remembered, and wants it or its source |
| fact | asks who, when, where, how many, what happened |
| topic | asks what the scriptures or teachings say about a theme |
| define | asks what a term, name or concept means |
| lookup | names a work or person and wants that item itself |
| enumerate | wants a list — members of a group, attendees, every instance |
| converse | is conversation, not a lookup |

Jev also decides the scope: which tradition, and whether the question asks for one author's own words or is only
*about* that author (a question about the Báb's martyrdom is not a request for the Báb's writings).

**Being built.** The next step makes the strategy change the route itself, not just the layers:

| strategy | when | route |
|---|---|---|
| find the original | the Arabic or Persian behind an English passage | translation links first, then phrase search in the original languages; returns the exact phrase |
| find the published rendering | the authorised English for an original or a paraphrase | from the original to its translations, ranked by authority |
| exact quotation | the wording is remembered | keyword phrase match plus literal phrase search |
| best expression of an idea | the passage that best states an idea | the concept's entry, the passages that prove it, then meaning-level search |
| answer a question | a question the texts answer | HyPE questions plus meaning-level search |
| person or event | about someone, somewhere or something that happened | every name and title the texts use for them, then what happened |
| define a term | what a word means | the concept entry, the lexicon, the original-language form |
| compare | how traditions or authors treat a theme | one sub-search per tradition, in parallel |
| enumerate | the complete list | exhaustive id filters, no cut-off |
| follow an argument | how a work reasons its way to a conclusion | the work's argument outline, claims in order |

These depend on a new **phrase-level index**: one search entry per phrase, pointing into an unchanged paragraph. In our
tests on Arabic and Persian originals, phrase entries found the passage within the right book first time in about 72%
of cases, against about 36% for the paragraph vectors used today; in English, phrase search answered 52–55% of
questions first time against 39% today. The phrase index is what makes "find the original" and "best expression"
possible as distinct routes. See [Indexing Layers](/docs/indexing-layers) for how the layers fit together.

## Re-Ranking Strategies: Ordering What Comes Back

A strategy decides *what* is found; a re-ranker decides *what comes first*. All of these are planned; none generates
text.

| re-ranker | for | how |
|---|---|---|
| none | exact quotation, lists | keep the found order, or the book's order |
| authority | doctrinal questions | scripture and authorised interpretation before commentary |
| original first | finding originals | the original-language phrase and its linked source first |
| answers the question | questions | Jev reads each of the top ~20: answers / partly / mentions / unrelated |
| states the idea | best expression | Jev: states it centrally / illustrates it / mentions it in passing |
| whose words | people and quotations | Jev: the person is the speaker / the subject / only mentioned |
| diversity | comparisons | alternate traditions and authors |
| chronological | history | by date |

Each Jev re-ranker stays only if it measurably moves the right passage up within the time budget.

## Answer Formats: The Shape of the Reply

Seventeen formats are in use today; Jev picks one after code removes those the evidence cannot support:

- **direct answer** — a clear answer in one or two passages
- **yes or no, with proof** — a single fact the evidence decides
- **decisive passage** — one passage should be read whole
- **range of voices** — several authors, and the range is the answer
- **authority layers** — scripture, interpretation, history and scholarship kept apart
- **popular belief vs the literature** — gently, when a common assumption meets the texts
- **term with its original** — a word, its original-language form, its meaning in use
- **find a passage** — the half-remembered passage, found
- **people record** — who met, knew or accompanied whom
- **list**, **timeline**, **comparison**, **comparison table**
- **reading suggestion** — when reading one text more fully serves best
- **study question** — when thinking further is the point
- **honest absence** — nothing found answers the question
- **letter** — a considered written reply, quoting fully

Three more are planned for the new strategies: **original and translation side by side**, **the published rendering
with its source**, and **a passage list** with the matching phrase highlighted and no commentary.

## Research Patterns: How People Actually Study the Texts

A strategy is a route; a **research pattern** is what the reader is doing — the way scholars, study circles and
devotional readers have always worked with scripture. Each pattern maps to a strategy, a ranking and a format, and Jev
recognises it in the same call that picks the strategy. We surveyed established study tools (Bible software such as
Logos and Accordance, Sefaria, Qur'an and tafsir tools, Bahá'í compilations and study circles) and catalogued 36
patterns. About a third we can serve now, a third partly, and a third need a new kind of data.

The ten we plan to add first:

| pattern | what the reader wants |
|---|---|
| passage guide | everything about one passage: its original, translations, who quotes it, the people and terms in it |
| who quotes this | the reception of a text — every work that quotes it, by authority (and by date, once works are dated) |
| topical compilation | every authoritative passage on a topic, grouped by subtopic, as the compilations do |
| occasion of revelation | to whom, when and why a tablet was revealed |
| study-circle sequence | a short ordered set of passages with questions, from simple to deep |
| translation comparison | several renderings of one passage side by side |
| cross-references | other passages on the same thought, beginning with the same author |
| word study | how one original word is rendered across the English, with examples |
| prayer by occasion | a prayer for healing, for the departed, for children |
| parallel accounts | one event as told by different historians, in columns |

Three missing kinds of data would unlock most of the rest: **dates** for works and passages (for reception, the
development of a concept, which guidance supersedes which), **links from commentary to the passage it explains** (not
only to passages it quotes), and a **citation scheme** that understands references like a sura and verse or a chapter
and verse.

## Follow-Up Search and Exploration Without Slow Models

Research is rarely one question. After a result, the reader wants *who is this person*, *the original of the second
passage*, *who else says this*, *what came before in the argument*. Exploration only stays fast if every branch is
still a System-1 decision.

So every result carries its ids — the people and concepts in it, what it quotes and who quotes it, its original and
translations, its place in the work. Code turns those ids into a menu of next steps; Jev decides which one a follow-up
message means ("what else did *he* say" — which *he*?) or ranks the suggestions. Following a suggestion is a lookup,
with no model call at all. In research mode the same loop runs on its own: Jev picks the next branch, and it stops when
a hop finds nothing new.

## Measuring Branching Search, Layer by Layer

A branching system can fail in four separate places, so each is measured separately:

1. Did Jev choose the right strategy?
2. With the right strategy forced, did retrieval find the passage?
3. Did the re-ranker move the right passage up?
4. Was the reply in an acceptable shape — and inside the one-second budget?

The test cases come from material we already hold: verified translation pairs for originals, the same pairs reversed
for published renderings, the search-type battery for quotations, definitions and facts, HyPE questions for answering,
concept claims with their proof passages for best expression, and the entity battery for people.

## Jev and Its Alternatives

Jev is two weeks old as a public product, and almost everything published about its speed and price comes from its
maker. Our own numbers (about 150 ms; 30 of 30 confident identity calls correct) are encouraging, but no one has
published how it handles Arabic, Persian or Hebrew. So it will be tested against the alternatives on our data before
the new layer depends on it.

| option | typical speed | strengths | weaknesses |
|---|---|---|---|
| **Jev** (TypeSafe System One) | ~150 ms measured | typed answers with confidence; many questions per call; very low price | new; no independent multilingual evaluation; price may not last |
| small hosted language models with strict schemas (e.g. OpenAI's smallest model, Gemini Flash-Lite, Claude Haiku) | roughly 0.4–1 s | mature; broad language coverage | slower; costlier per call; no built-in confidence |
| fast open models on dedicated inference (Groq, Cerebras) | roughly 0.2–0.5 s | strict schemas; open weights | reasoning tokens add time; Arabic/Persian unverified |
| dedicated re-rankers (Cohere, Voyage, Jina, Qwen3-Reranker) | under a second for 20 passages | built for "is this relevant?"; multilingual | score relevance only — cannot say *whose words* a passage carries |
| similarity to option descriptions (embeddings) | the cost of one embedding | nearly free; a useful floor | weakest on subtle distinctions |
| a model on our own GPU server | fast for short prompts, slow for long ones | no per-call cost; private | too slow to re-rank 20 passages per query |

The bake-off will use at least 300 labelled cases per use (query planning, re-ranking, format choice, and offline
enrichment), with at least 50 per non-English language. It compares accuracy on the confident answers alongside how
many answers are confident, speed at the 95th percentile, timeouts counted as wrong, and cost per *correct* decision.
A system that skips hard cases must not look better than one that answers them.

## What Might Be Missing From Our Search Strategies

The catalogs are meant to grow. Questions worth pressing:

- **Strategies.** Should "find the original" and "find every translation of this original" be one strategy or two?
  Is there a strategy for *where an idea first appears* in a tradition, or how its wording changed over time? For
  *who quotes this passage* — the reception of a text?
- **Re-rankers.** Should translation authority (an authorised translation over others) be its own ranking, apart from
  the authority of the author? Should a passage that is itself a quotation give way to its source?
- **Formats.** The passage guide answers the *study sheet* question; is a *chain of quotation* — a passage as it
  travels from source to commentary — its own format?
- **Patterns.** Which of the 36 matter most to the people who actually use the library — and which have we not
  thought of?

For more on how the entity layer finds people under every name, see [Entity Search](/docs/entity-search); for the
concept work behind "best expression", see [The Conceptual Track](/docs/extraction-conceptual-track).

## Further Into SifterSearch's Search Design

- [Indexing Layers](/docs/indexing-layers) — the layers every strategy draws on
- [Entity Search](/docs/entity-search) — finding people and places under every name the texts use
- [The Conceptual Track](/docs/extraction-conceptual-track) — how ideas are extracted and anchored to passages
- [Research Assistant](/docs/research-assistant) — the assistant these strategies serve
