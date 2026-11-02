# Anís, organic: one agent answers, fast classes earn their place (Chad 11-01)

> "start with using haiku + tools to answer everything. Then analyze every interaction to determine if we can create a
> high-speed classification based response … every classified question gets assessed for whether that classification was
> correct and the classifier extended or improved … self-improving, self assessing … We cannot do worse."

## Why the current engine fails
- Site chat: fixed plan (Jev) → one retrieval → Sonnet writer. The writer never sees a tool; whatever retrieval missed it
  fills from memory → hallucination. Two LLM hops minimum → p50 7–12 s, ~all turns > 5 s (battery 11-01).
- Email: Haiku researcher writes a BRIEF → Sonnet writer. The brief permits "[own]" and "well-known background" → more memory.
- The battery scores stages (shape/phrases/retrieval), not what Chad sees: is every claim sourced, is the book linked,
  is it short when the question is short. Stage pass rate went 0.73 → 0.89; the replies did not visibly improve.

## A. Default engine: the agent (`api/lib/assistant/agent.js`) — BUILT
- One Sonnet 5.5 loop (role `anis-agent`; quality first, Haiku only where assessed equal) that researches AND writes. Tools = the researcher's (`toolRunner`, shared) +
  `about_work` (work-notes.json). Parallel tool calls; ≤5 rounds, ≤12 calls.
- Grounding by code, not by prompt: the model may cite only refs its tools returned — `[[P3]]` passage, `[[B1]]` book.
  `renderRefs` turns them into links and drops any other ref; `dropUnverified` removes a sentence quoting words no passage
  holds; `fixQuoteSpeakers`, `linkQuotes`, `dropPreamble` as before.
- Switch: `direction.engine` ('agent' | 'pipeline') per request (draft API body `engine`), else channels in `ANIS_AGENT`.
- Next: stream the final round (sentence gate) so first words arrive while the answer is written.

## B. Fast classes (only after the agent is the baseline)
- Registry `api/lib/assistant/classes/`: each class `{ id, version, match(turn) → confidence, handle(turn) }`.
  Matching = deterministic rules first, then kNN over labelled example embeddings (examples are DATA, grown by C).
- A class answers only when confidence ≥ its threshold AND its assessed precision (C) ≥ 0.9; otherwise the agent.
- First classes: greeting/thanks (triage canned), give-the-book (findWork + work-notes, no model), source-of-quotation.

## C. The loop (self-assessing)
1. Turn log: class (or none) + confidence, tool trace, refs used, reply, latency, cost, guard drops.
2. Assessor job (Haiku; Sonnet on a sample): grounded? answered the question? book linked? length fit? For classed turns,
   shadow-run the agent on a sample and compare → class correct / wrong.
3. Wrong class → its turn becomes a negative example; class below the bar → auto-suspended (back to the agent).
4. Miner: clusters of unclassed turns whose tool traces are stable → class proposals on a review page; handler written
   by Claude, approved by Chad.
5. Dashboard: grounded rate, link rate on book questions, p50/p95, cost, share answered by classes, win/tie/loss vs Perplexity.

## D. Headline metrics (replace stage pass rate)
grounded rate · link rate (book named → linked) · p50/p95 latency · $/reply · win/tie/loss vs Perplexity.
Baseline both engines on the same fixtures before switching anything on by default.

## Rollout
1. Agent behind the flag; battery pipeline vs agent on the wording fixtures + Chad's failing questions.
2. Better and not slower → `ANIS_AGENT=site-chat,email`.
3. Turn log + assessor. 4. Classes (book, greeting, source). 5. Miner + review page.

## Work notes (`api/lib/assistant/work-notes.json`)
`scripts/anis/compile-work-notes.mjs`: per core work (work-canon.js, 51 works) the passages that NAME it as a title →
Haiku picks spans → each span verified verbatim in its passage; tiers: 1 own words of a central figure in their own work ·
2 compilation / second-hand · 3 secondary · 4 Uncompiled Published Letters. ~$0.3 per full run.
