# Anís strategy graph: activities are code, strategies are data (Chad 11-04)

## What Chad asked for (11-04)

> "Activities would be code and strategies would be data. Strategies would be combinations of prompt templates, decisions and tools. Maybe each step would be a record and a strategy would be a combination of branching steps. This would allow each step type to be optimized and assessed independently while allowing the quality of each branch and each strategy to be quantified for speed and quality. Our docs page for strategies would be based on db queries instead of static."

He also said:

> "strategies improve and extend automatically using high-intelligence LLM … on a budget but allow us to execute strategies with minimum intelligence for scalability."

## Model

### Activities (code, versioned)

An activity is a typed function. It declares the schema of what it takes in and what it returns, and a task class: code, jev or llm. Adding a new activity means writing code and a test, which should be rare.

The kinds of activity:

- **Tool**: `*_search`, `*_lookup`, phrase/originals search, holdings.
- **Decision**: a Jev gate. It takes a question and options and returns the label of the edge to follow.
- **Transform**: dedupe, tier order, holdUncompiledCopies, quote trace.
- **Writer**: a prompt template that produces the reply.
- **Check**: markdown validity, quote verification, ensureWholeReference.

### Steps (DB rows)

A step is one use of an activity, with its parameters:

`{id, activity, params(json), template_id?, budget_ms, budget_usd, version}`

For a decision step, the params hold the question, the options and the name of the state builder. The gate is the step itself.

### Templates (DB rows)

A template is prompt text with slots, and it is versioned. The writer instructions move here: COMPARISON_HOW, REFERENCE_HOW, UNDERSTANDING_HOW.

### Strategies (DB rows)

A strategy is a directed graph of steps:

`{id, name, description, exemplars[], entry_step, edges:[{from, on, to}], status, version, parent_version}`

- An edge's `on` is the outcome that triggers it: a decision label, ok, empty or fail.
- `status` is candidate, active or retired.
- The edges carry the branching. A terminal edge ends in the writer step and its checks.

### Choosing a strategy

Choosing a strategy stays a Jev gate. Jev is given the descriptions of the active strategies, plus a "none" option.

## Measurement

This costs nothing extra: it comes from traces we already write.

- **Per step**: each executed step logs `{turn_id, strategy@v, step@v, ms, usd, outcome_edge}`. This extends search_trace and path.jev_calls.
- **Step statistics**: latency (p50 and p95), cost and the mix of outcomes. Decision steps are also scored for accuracy against gold, using the jev bank.
- **Per branch and per strategy**: the judge score from the improve worker, the forensics defect classes, time and cost. A branch is one path through the graph.

When a strategy is weak, these numbers show which step or branch is losing quality or time.

## Improvement

This uses Opus and the improve budget only. It never runs on the reply path.

- **New strategies.** When Jev answers "none", Opus gets a design call. It is given the catalog of activities with their costs, the nearest strategies, and why each one does not fit. It returns a candidate graph built only from existing activities. The candidate is checked against the schema before it is saved.
- **Edits to weak strategies.** For a weak step or branch, Opus proposes a change to that step's params or template, or to the edge. The change is saved as a candidate version.
- **Promotion by replay.** The candidate and the current version are both run on fresh questions of the class. The question that triggered the candidate is never enough on its own. They are compared on judge score, forensics, time and cost. If the candidate wins it becomes active, and the old version is kept for rollback.
- **No duplicates.** Before a candidate is saved, it is compared with its neighbours and merged if it is really a variant of one.
- **Keeping Jev accurate.** As the library grows, decision steps are tuned through the jev bank (`jev-try`).

## Docs

Chad 11-04: "split out the 'Activities' doc from the 'Response Strategies' doc page and generate the content of the response strategies from querying the db."

There are three pages, all edge-cached, with numbers that refresh live.

- **/docs/response-strategies** is generated entirely from strategies.db. For each active strategy it shows:
  - the graph, its steps and its templates (template names only);
  - its live numbers: how often it is used, its judge score, its p50 time and its cost per turn;
  - its branches;
  - its candidates and their replay results.
- **/docs/anis-activities** is the catalog of activities, generated from the code registry: kind, class, input and output, which strategies use each one, and per-activity numbers. Scheduled, cron-like learning activities are PARKED (docs/architecture/anis-activities.md).
- **/docs/anis-tools** is generated from the tool registry (tools.js REGISTRY): each tool's schema, the activities that call it, and its live latency.
- The old static page `search-strategy` (doc_pages) keeps indexing, intent, formats and audit. Its section 3 links to the three pages.

## Phases

1. **Move the existing strategies into the DB.**
   - Add the schema, a repo (`strategies-repo.js`), a migration, and an interpreter that runs a graph of activities.
   - Move the existing code strategies into rows: comparison, understanding, reference lookup, quote trace, book lookup and research.
   - There should be no change in behaviour. Replay the wording battery before and after: the routes and sources must be identical.
2. **Measure.** Add per-step trace logging, a stats endpoint and the DB-driven docs page.
3. **Design new strategies.** Build the "none" → Opus design → candidate → replay promotion path.
4. **Improve existing strategies.** The improve worker proposes changes at the level of a step or a branch.
