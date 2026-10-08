A search box looks like one tool. It is really many. Someone who pastes a sentence of Shoghi Effendi's English and wants
the Persian behind it is asking a different question from someone who wants *the* passage that best states an idea, or
every tablet addressed to one person, or a month of readings to understand Islam. SifterSearch answers each with its own
route through the library, its own ordering and its own shape of reply, chosen in about a tenth of a second.

This page describes the whole system in six parts, in the order a question passes through it. Each part says what is in
use, what is being built, and how it is tested, so it can be read, questioned and changed.

1. **Indexing layers** — the different ways the library is indexed, each suited to a kind of question
2. **Classifying intent** — reading the question and choosing a search strategy
3. **Search strategies** — the routes through the library, including follow-up research
4. **Choosing a format** — reading the question, the conversation and the results to choose the shape of the reply
5. **Answer formats** — the shapes a reply can take
6. **Learning tools** — what Anís does beyond one answer: memory, study tools, reading plans, assessment

## Where it runs

Everything personal and everything that talks to a reader runs on Cloudflare: the website, the chat (Anís), a person's
history and memory. The library and its indexes run on our own server, which Cloudflare reaches through one internal
interface; no reader's code ever touches it, and it never receives a person's identity, so its answers can be cached and
the server could one day be replaced. The decisions in parts 2 and 4 are made by a fast **System-1** model (Jev today;
Cloudflare's Clef is being measured against it) that answers typed questions in about 150 ms and can only choose from the
options we wrote.

## The governing principle: decide fast, write once

Anís has many tools, and the art is in mustering exactly the right data for the one language-model call that writes the
reply. Every step before that call — which tool, which strategy, which format, which passages hold the answer — is a
**typed classification** (a choice among options we wrote, a yes/no as a probability) plus code and indexes, never slow
model "thinking". The language model writes the words and adds no facts; some replies (where a quotation comes from)
need no model call at all.

Fast is the default, not a rule against depth. A strategy may *need* slow thinking — surveying a subject means finding
its main ideas, then searching for the passages that best establish each one, with analysis between the steps: dozens
of searches. That is fine when the strategy is chosen for it. What must stay fast is the choosing, and the ordinary
case: most questions take a straightforward route and have their evidence in a second or two, and a deep strategy says
so up front (and can run in the background and return as a letter).

Jev is a temporary bridge. The destination is our own trained classifiers:

| tier | what it is | role |
|---|---|---|
| Jev | external System-1 model, typed answers in ~150 ms | the bridge: serves every decision today, and its logged answers seed training |
| Clef / Clef-flash | Cloudflare's classification models, run inside our own Worker; **trainable** | shadows every decision now (agreement with Jev 64–100% by decision); trained on our verified decisions, it can serve them beside the chat |
| Laya | our own small model; **free and trainable** | trained on the same verified decisions; serves wherever it is accurate enough |

Every decision is logged by task with its inputs and each model's answer, and the test batteries say which answer was
right — so the logs become training data, not a copy of Jev's mistakes. Each task moves off Jev when its trained
replacement is at least as accurate on that task's battery.

## 1. Indexing layers

Each layer answers a different kind of question. A strategy (part 3) decides which layers run.

| layer | what is indexed | best for |
|---|---|---|
| keyword (BM25) | the words of every paragraph | exact wording, rare names and terms |
| meaning (paragraph vectors) | each paragraph's meaning | "what do the texts say about…" |
| phrase vectors | every clause, in context, across languages (Gemini, 3072 dims) | a quotation in any translation; the Arabic or Persian behind an English passage |
| HyPE questions | questions each paragraph answers, written in advance | questions the texts answer in other words |
| translation links | English paragraph ↔ its original | going from a translation to the original and back |
| citation graph | which passages quote which | who quotes this; where a quotation comes from |
| entities and claims | people, places, events, and statements about them with their proof | who someone was, who met whom, rosters |
| tablet metadata | Phelps' Partial Inventory: titles, first lines, dates, addressees | identifying and describing an original tablet |

Today the keyword and meaning layers run in Meilisearch and the phrase, keyword and HyPE layers in Qdrant; Qdrant is
replacing Meilisearch. Details: [Indexing Layers](/docs/indexing-layers).

**Tested by** the ingestion battery: every document must be findable by its own sentences, and its paragraphs must be in
each index. *(First full run: pending.)*

## 2. Classifying intent

One Jev call reads the question (and the conversation, so "and what about compassion?" keeps its tradition) and answers
five typed questions at once:

| decision | options |
|---|---|
| strategy (shape) | quote · fact · topic · define · lookup · enumerate · converse |
| tradition | one of the library's traditions, or none |
| author | whose own words are wanted — or none when a person is only the subject ("When was the Báb martyred?" is *about* the Báb) |
| comparison | does it compare traditions or authors (pairs of ideas such as science and religion are not a comparison) |
| about | people · texts · terms · events |

Code then turns the plan into layers. Rules held in code, not left to the model: a comparison is never narrowed to one
tradition; a tradition the reader set is never overridden; an inferred author is a *preference* that ranks, never a filter
(names have many spellings, and a tablet is often found quoted in another book).

Anís adds one more decision before search: a triage of the message (research, a source question, conversation, an
attack…). A source question goes straight to SourceHunt (part 3).

**Tested by** the routing battery: 617 queries with the strategies that are acceptable for each.

| set | cases | right strategy (2026-10-07) |
|---|---|---|
| hand-written edge cases | 45 | 93% |
| search-type battery | 83 | 88% |
| quality battery (tradition only) | 489 | 98% never narrowed to a wrong tradition |

Known weaknesses: a bare name ("Vahid", "Nabil") is not treated as a person lookup; list questions ("Who were the Letters
of the Living?") are not recognised as lists; a misspelled title can be taken as conversation; and concepts shared by
traditions ("Asteya", "Jesus") are narrowed to one tradition. *Open question: should a shared concept rank one tradition
first instead of filtering to it?*

## 3. Search strategies

Each strategy is a route: which layers run, in what order, and how results are ranked.

| strategy | for | route | status |
|---|---|---|---|
| quote | the wording is remembered, exactly or roughly | keyword + phrase vectors; source preference | in use |
| source | where a quotation comes from, its book and original | SourceHunt: phrase + keyword candidates → a decision on which hold the sentence → the writer's own texts → translation links → the original tablet | in use (Anís tool) |
| topic | what the texts say about a theme | meaning + HyPE, spread across traditions unless one is asked | in use |
| fact | who, when, where | HyPE + passages; who-met-whom from the encounter index | in use |
| define | what a term means | passages + lexicon | partly |
| lookup | a named work or person | catalogue and entity records | in use |
| enumerate | the complete list | entity claims and rosters, no cut-off | in use |
| compare | how traditions or authors treat a theme | one sub-search per tradition | partly |
| find the original | the Arabic or Persian behind an English passage | translation links, then phrase search in the originals | in use (cross-lingual) |
| best expression | the passage that best states an idea | concept entry → its proving passages → meaning search | planned |
| survey a subject | the main ideas within a subject, each established by its key passages | map the sub-ideas (concept index, compilations, a model pass) → a targeted search per idea → analysis between steps → a structured report; dozens of searches, deliberately slow | planned (deep research today) |
| follow an argument | how a work reasons to a conclusion | the work's argument outline | planned |

**Ranking.** A strategy decides *what* is found; ranking decides *what comes first*: authority (scripture and authorised
interpretation before commentary), the source before books that quote it, the original first when the original is
wanted, diversity for comparisons, date order for history. Where judgement is needed, one more Jev call grades the top
results (answers the question / states the idea / whose words); each stays only if it measurably helps.

**Follow-up research.** Every result carries its ids — people, concepts, what it quotes and who quotes it, its original,
its place in the work — so the next step ("who is this?", "the original of the second passage", "who else says this?")
is a lookup chosen by Jev, with no slow model. In research mode the same loop runs on its own and stops when a step finds
nothing new.

**Tested by** one battery per strategy, each with answers we can verify rather than an older engine's output:

| strategy | answer key | status |
|---|---|---|
| quote / source | CTAI-verified translation pairs (819); the 498 *Bahá'í Sacred Writings* selections with their recorded sources | in use: source 89%, original tablet confirmed and right 65% |
| original highlight | the original-language words of each verified pair | in use: 88% |
| lookup | every title and person in the catalogue and entity graph, with spelling variants | building |
| enumerate | curated rosters (Letters of the Living, Badasht, Hands of the Cause) | building |
| topic | published compilations: a passage a compilation includes under "Justice" is a right answer for "justice" | building |
| compare | at least two named traditions in the results | building |
| define, fact | hand-curated, 30+ each | building |

The older 516-query battery on the [Search Quality](/docs/search-quality) page measures agreement with an earlier
engine's results more than correctness (many of its "phrase" tests are one word with one expected book), so it is kept as
a regression check, not as the measure of quality.

## 4. Choosing a format

After search, the reply's shape is chosen from three things: the question, the conversation, and *what was found*. Code
first removes what the evidence cannot support (no timeline without dates, no comparison without two traditions, no
table where the channel cannot show one); Jev chooses among what remains; a default covers Jev being unavailable.

**Tested by** the format battery and the soul battery (voice, fairness, no pressure, no flattery when the reader is wrong).

## 5. Answer formats

Seventeen are in use: direct answer · yes or no with proof · decisive passage · range of voices · authority layers ·
popular belief beside the texts · term with its original · find a passage · people record · list · timeline ·
comparison · comparison table · reading suggestion · study question · honest absence · letter.

A source answer has its own fixed form, built from SourceHunt's findings with no model call: the writer and the
published book (linked to the quoted paragraph), the original tablet and its language, the original's own words, its
entry in the Phelps Inventory, and other books that quote it.

Planned: original and translation side by side; the published rendering with its source; a passage list with the matching
phrase highlighted.

When Anís is hosted on another site, answers give that site's materials precedence — in ranking and in links — so a chat
on Ocean of Lights sends readers to Ocean of Lights pages.

## 6. Learning tools

Beyond answering one question, Anís can help a person learn over weeks and months. These are tools, chosen like
strategies, and each must earn its place by helping people read the texts themselves rather than depend on Anís.

| tool | what it does | needs | status |
|---|---|---|---|
| **memory** | remembers each person across visits and sites: a running summary of their conversations, and what they ask Anís to remember (never inferred interests) | one history per person (merged when they log in) | partly built; moving to Cloudflare |
| **source lookup** | where a quotation comes from, its book and original | SourceHunt | in use |
| **read in the original** | a passage beside its Arabic or Persian, with key terms aligned | translation links, CTAI term alignment | data exists; tool to build |
| **compare translations** | several renderings of one passage | SourceHunt across translations | data exists; tool to build |
| **who quotes this** | every work that quotes a passage, by authority | citation graph | data exists; tool to build |
| **people and events** | who someone was, who met whom, a timeline | entity graph, encounter index | in use in search |
| **reading plan** | for a goal ("I want to understand Islam"): a sequence of readings from introduction to primary texts to commentary, with progress | a map of each subject; graded reading lists | planned |
| **daily selection** | one passage a day from the plan, with a question to reflect on; the reply continues the conversation | reading plan; email or widget channel | planned |
| **assessment** | where the learner is on a subject — a few gentle questions and what they have asked so far — so the plan starts in the right place; reflective, never a grade | subject map; question bank per stage | planned |
| **study circle sequence** | a short ordered set of passages with questions, simple to deep | compilations, concept index | planned |
| **deep research** | a longer investigation run in the background and returned as a letter | the research worker | in use (separate) |

Principles from the Seeker Companion: connecting is the consent to be remembered; every message can be paused; hooks
point to primary texts and the person's own study, not back to Anís; a person who now reads on their own is a success.

**Open questions.** How a subject map is built (from compilations, curricula, the concept index?); whether daily
selections go by email, in the widget, or both; how assessment stays humble — a conversation, never a score.
