# Anís tools API

Anís searches the library with a set of named tools. Each kind of search, and each lookup, is its own tool with one name, one function and one contract. Strategies, the researcher, the agent and outside callers all use the same contract.

- **Registry:** `api/lib/assistant/tools.js` defines every entry: `name`, `label`, `kind`, `purpose`, the `input` and `output` JSON Schemas, `outputName`, an `example` and `run(input, ctx)`.
- **In process:** `run(name, input, ctx)` returns plain JSON.
- **Over HTTP:** `POST /api/v1/tools/{name}` returns the same JSON (`api/routes/anis-tools.js`). It needs an `X-API-Key`.
  - `GET /api/v1/tools` lists the tools.
  - The OpenAPI spec is at `GET /api/v1/docs/json`, under the tag "Anís Tools". The interactive docs are at `/api/v1/docs`.
- **Errors:** `{ "error": { "code", "message" } }`. The codes are:
  - `invalid_input` (400);
  - `unknown_tool` (404);
  - `tool_failed` (500).
- **For models:** `llmTools(names)` generates the tool definitions from the input schemas. Models see canonical names only.

## Naming rule

- A tool whose name ends in `_search` takes words (`query`, or a `title`) and returns ranked results.
- A tool whose name ends in `_lookup` takes one known thing (a paragraph id, a work title or a word) and returns facts about it. It never takes a `query`.
- A strategy (`kind: "strategy"`) combines tools. Strategies are internal (see below); the contract tools are all `kind: "tool"`.
- A name means one function. Two engines get two names. For example, `fused_search` fuses every layer on the query as written; `quote_search` finds the passage holding given words.
- There are no aliases. They were retired on 11-09: a caller uses the canonical name.
- Intent is never decided here. Jev chooses the tool or strategy, and the tool only executes it.

## Shared schemas

| Schema | Used for |
|---|---|
| `AnisToolFilters` | the hard filters of every passage search: `tradition`, `collection`, `author`, `writerOnly`, `language`, `documentId`, `work`, `authority`, `yearFrom`, `yearTo` (`quote_search` takes its own lists: `religions`, `authors`, `works`) |
| `AnisPassage` | one paragraph. It keeps the executeSearch field names (`id` = paragraph id, `document_id`, `source_url`) so citations and links keep working. `role` (source, original, translation, quoting) is set by `quotation_candidates` and `edition_lookup`. |
| `AnisWork` | one work: `id`, `title`, `author`, `url`, `encumbered` |
| `AnisToolError` | the error envelope |

## Tools

The contract tools (`REGISTRY`), as of 11-10. The live list, with call counts and timings, is `GET /api/v1/tools` and /docs/anis-tools.

| Name | Label | Output | Purpose |
|---|---|---|---|
| literal_search | Literal Search (BM25) | Passage[] | BM25 keyword search over whole paragraphs: the exact words, folded for accents and spelling. |
| phrase_search | Phrase Search | Passage[] | Phrase-vector search: paragraphs holding a phrase like the query, in any wording. |
| hype_search | HyPE Search | Passage[] | Question search (HyPE): paragraphs that answer a question like the query. |
| fused_search | Fused Search | Passage[] | The one typed search: every layer (or the ones you pick) fused on the query as written, filtered, deduped across layers/copies/editions. |
| quote_search | Quote Search | Passage[] | Answers "find the passage that says X", "where does <author/tradition> say X", "search for X in <work>": one search type, filters from the strategy and context. |
| compare_search | Compare Search | Side[] | Replaces a per-side search loop: one merged query per side, returned side by side (a side with no hits is an empty side, not an error). |
| reference_lookup | Reference Lookup | Reference | Chapter-and-verse to the passage, deterministically; no passage and ref null when the text is not a reference or the book is not in the library. |
| badi_calendar | Badí‘ Calendar | BadiDate | Calendar arithmetic only. Holy-day names are not returned (the table is not verified here); Naw-Rúz is flagged. |
| prayer_lookup | Prayer Lookup | Prayers | A name or incipit → literal and phrase search (and meaning, for a name) across the tradition’s whole scope; a need → meaning search (hype + phrase) in the tradition plus inside its prayer works. Headings, titles and prayer works only rank (with the tradition’s own authority, core first); they never decide. Deterministic. |
| whole_lookup | Whole Prayer Lookup | Whole prayer | Extends one paragraph to the whole prayer or devotional unit holding it: an attribution-closed run, a short section, else the contiguous paragraphs that address God. Never for a copyrighted book. |
| originals_search | Originals Search | Passage[] | The fast engine held to the doctrinal writers and the Arabic/Persian language group: the originals an English search ranks out. |
| biography_search | Biography Search | Person[] | People search: who did, met or wrote something, each person with the cited evidence (deterministic: the evidence index, no model). |
| document_search | Document Search | Work[] | A work in the library by its title, any spelling: the best match first, then close others. |
| original_lookup | Original Lookup | Passage[] | The Arabic/Persian original of an English passage, then the authorised translations linked to it. |
| translation_lookup | Translation Lookup | Passage[] | Existing English translations of an Arabic/Persian text: the library’s copy of the original and the translations linked to it. |
| links_lookup | Links Lookup | PassageLinks | A paragraph’s recorded links: its original, its translations, the sources it quotes and the works quoting it. |
| context_lookup | Context Lookup | Context | The paragraphs before and after one paragraph of a document (none for a copyrighted book). |
| rendering_lookup | Rendering Lookup (CTAI) | Renderings | How Shoghi Effendi (or another translator) rendered an Arabic/Persian word or root (the CTAI concordance), with counts and paired passages. |
| work_notes_lookup | Work Notes Lookup | WorkNotes | Verified quotations on a core work’s significance, best authority first. |
| author_lookup | Author Lookup | Authors | The library’s author strings for a person’s name (Augustine → Augustine of Hippo, Saint Augustine). |
| source_trace | Source Trace | Passage[] | The primary passages a signpost (a House letter, a scholar, a compilation) quotes or rests on. |
| edition_lookup | Edition Lookup | Editions | A passage’s original-language edition, or its existing translations, in any tradition: recorded links, else the same work in another language aligned by verse/section, else by meaning. |
| quotation_candidates | Quotation Candidates | Passage[] | Where a quotation may come from: the passage holding its words (source), the original tablet, works quoting it — each with a containment score; deterministic, no model. |

`PROCESS` holds the rest, callable through `run()` but not routes or contract tools: `web_search` (it calls an LLM), and the **internal** strategies (`internal: true`) `comparison`, `understanding`, `prayer`, `guidance`, `reference`, `compilation` and `deep_report`. The answer pipeline runs those once Jev has chosen them.

`quote_search` is the one find-a-passage tool (11-10): `{query, mode, religions, authors, works, from, to}`. `mode` is `literal`, `meaning` or `auto` (literal first, then meaning when nothing matches). The filters come from the strategy and the context, never from the tool: a book in context becomes `works:[id]`, so finding words inside a book is the same tool, not its own. Jev's library-wide case is the triage lookup kind `find_passage`.

`POST /api/v1/tools/search`, the older multi-mode tool in `public-api.js`, is still served for existing callers. Its successor is `fused_search`. `combined_search` (the planned search) left the registry on 11-09; it lives in `combined-search.js` for the researcher's rollback path only.

## Adding a tool

1. Pick the name by the naming rule, and make sure it is not used by another function.
2. Add an entry to `ENTRIES` in `tools.js` with:
   - `name`, `label`, `kind` and `purpose` (one sentence);
   - `input` (JSON Schema; reuse `FILTERS` for passage filters);
   - `output` (reuse `PASSAGE` / `WORK`) and `outputName`;
   - an `example: { input, output }` that validates;
   - `run(input, ctx)`. Load its dependencies through `dep(ctx, …)`, so a test can inject them through `ctx.deps`.
3. Models only: add the name to `RESEARCH_TOOL_NAMES` (researcher.js) or `AGENT_TOOL_NAMES` (agent.js), plus a runner in `toolRunner` that formats the JSON for the model. Use `llmOmit` for inputs a model should not set.
4. The route, the spec entry and the list entry come from the registry, so there is nothing else to wire.
5. Tests: `tests/api/anis-tools-registry.test.js` (behaviour, naming) and `tests/api/anis-tools-api.test.js` (route, schemas, example, auth) cover a new entry automatically. Add a behaviour test for what the tool does.
