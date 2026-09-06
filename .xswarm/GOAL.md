<!-- PROPOSED by goal-propose.py. Inferred from repo evidence, not
     confirmed by Chad. Raise at the next planning meeting. -->

# Goal (PROPOSED)

## What this is for

The user is a researcher or serious student working on Bahá'í and interfaith primary sources — someone who already knows what a "Letter of the Living" is and wants to ask a question in ordinary language and get a *specific, checkable* answer rather than a ranked list of hits. The recent commits are not search-engine work; they are the work of pinning down what a single query means: a verb selects a relationship edge, remaining words select the subject, a named group bounds who is eligible. "Who was at this event" became a page where the page *is* the query. So the thing being built is not a better retrieval box over sacred texts — it is a question-answering surface over an entity graph (people, events, groups, participation) extracted from those texts, where the answer is a set of named people with reasoning attached, and where the same query is reachable three ways: the app UI, the API, and the OpenAPI cheat sheet. Inferred: Chad is the primary user right now and the audience is other researchers later.

## What success looks like

A researcher asks "who was at Badasht" — by URL, by API call, or by typing it — and gets the same answer set, with each person carrying the reason they're in the set, and the answer is defensible against the sources. Someone unfamiliar can reproduce that answer from the cheat sheet without reading code. When the extraction is wrong, the wrongness is visible as a bad reason on a named person, not as an absence. Queries that mix a group bound with an action ("Letters of the Living who were at Badasht") return the intersection, not the union, and not a headcount.

## What would falsify this

Chad stops asking entity questions and goes back to reading passages. Concretely: if the graph queries keep returning answer sets that need manual verification against the source text every single time, the graph isn't a shortcut — it is a second thing to check. The observable version: over a month of real use, the fraction of `/people/search` answers Chad accepts without opening the underlying text does not rise. A second falsifier: the interesting questions turn out to be about *what a text says* rather than *who did what*, in which case the entity layer is the wrong abstraction and hybrid passage search was already the product.

## Explicitly not the goal

Becoming a general RAG platform for arbitrary document corpora. The four planning docs (`PRD.md`, `RAG-Enhancement-PRD.md`, `RAG-quality-PRD.md`, `ocean-search-testing-prd.md`) look like an accreted stack of retrieval-quality work, and "improve RAG quality" is the easiest thing to keep doing forever because there is always another metric. The entity-answer work is a different bet, and the RAG layer is now infrastructure under it, not the deliverable. Also not the goal: a chat interface. The commits show effort spent making a query *mean one thing*; a chatbot re-introduces the ambiguity that work removed.

Also flagging: `siftersearch` and `ocean-search` (per `ocean-search-testing-prd.md`) appear to overlap in the evidence. If they are separate corpora on one engine, fine; if they are two search products, one should absorb the other.

## Where I am guessing

- **That entity/graph QA is the goal and hybrid search is the substrate.** Highest-stakes guess. If the real goal is still "best-in-class search over the Ocean corpus" and the who-was-at pages are a demo, this whole document is wrong.
- **That the corpus is Bahá'í-primary rather than broadly interfaith.** The README says interfaith; every commit says Badasht and Letters of the Living. I believe the commits.
- **That the API is a first-class product surface, not internal plumbing.** The amount of care spent on a verbatim canonical cheat sheet appearing identically in OpenAPI and `/docs/api` reads like you expect third parties to call this. If it's only for your own agents, the cheat-sheet discipline matters less and the goal narrows.
- **That the entity graph is extracted, not hand-curated.** If people/events/participation are hand-entered, the falsification test above is meaningless — accuracy is a data-entry question, not a system question.
- **That the user tiers (patron, institutional) imply a funding or access model that constrains the goal.** I ignored them. If there is a paying institutional customer, their needs outrank the researcher-user framing.
- **That `2.187.21` is a live production box and "verified live" means real deployment, not a staging check.** Weak inference from two commit messages, alongside `wrangler.jsonc` — two deploy stories that may not be one story.
