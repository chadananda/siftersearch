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
- A strategy (`kind: "strategy"`) combines tools. For example, `quotation_trace` runs sourceHunt over the `phrase_search` and `literal_search` layers.
- A name means one function. Two engines get two names. For example, `combined_search` is the planned search and `fused_search` has no planner.
- An old name is an **alias**, listed in `ALIASES`. It is accepted on input only, through `run()` and as a hidden route. Lists, the spec and models show the canonical name.
- Intent is never decided here. Jev chooses the tool or strategy, and the tool only executes it.

## Shared schemas

| Schema | Used for |
|---|---|
| `AnisToolFilters` | the hard filters of every passage search: `tradition`, `collection`, `author`, `writerOnly`, `language`, `documentId`, `yearFrom`, `yearTo` |
| `AnisPassage` | one paragraph. It keeps the executeSearch field names (`id` = paragraph id, `document_id`, `source_url`) so citations and links keep working. `role` is set by `quotation_trace`. |
| `AnisWork` | one work: `id`, `title`, `author`, `url`, `encumbered` |
| `AnisToolError` | the error envelope |

## Tools

| Name | Label | Kind | Output | Aliases | Purpose |
|---|---|---|---|---|---|
| literal_search | Literal Search (BM25) | tool | Passage[] | — | BM25 keyword search over whole paragraphs: the exact words, folded for accents and spelling. |
| phrase_search | Phrase Search | tool | Passage[] | — | Phrase-vector search: paragraphs holding a phrase like the query, in any wording. |
| hype_search | HyPE Search | tool | Passage[] | — | Question search (HyPE): paragraphs that answer a question like the query. |
| combined_search | Combined Search | tool | Passage[] | search_library, planned_search | The planned library search: a planner reads the query (and the conversation), sets the scope, and fuses every layer. |
| fused_search | Fused Search | tool | Passage[] | — | Every layer fused on the query as written: no planner, no LLM, no relaxing. |
| quote_search | Quote Search | tool | Passage[] | — | Find the passage(s) holding given words: literal first, then meaning; filters religions / authors / works (any of each, all kinds AND). A book in context = works:[id]. |
| biography_search | Biography Search | tool | Person[] | people_search | People search: who did, met or wrote something, each person with the cited evidence. |
| document_search | Document Search | tool | Work[] | find_work | A work in the library by its title, any spelling: the best match first, then close others. |
| web_search | Web Search | tool | WebAnswer | — | The open web, for what a library of texts cannot hold; never scripture. |
| original_lookup | Original Lookup | tool | Passage[] | find_original | The Arabic/Persian original of an English passage, then the authorised translations linked to it. |
| translation_lookup | Translation Lookup | tool | Passage[] | find_translation | Existing English translations of an Arabic/Persian text. |
| links_lookup | Links Lookup | tool | PassageLinks | passage_links | A paragraph's recorded links: its original, translations, the sources it quotes and the works quoting it. |
| context_lookup | Context Lookup | tool | Context | read_around | The paragraphs before and after one paragraph (none for a copyrighted book). |
| rendering_lookup | Rendering Lookup (CTAI) | tool | Renderings | word_study | How Shoghi Effendi rendered an Arabic/Persian word or root, with counts and paired passages. |
| work_notes_lookup | Work Notes Lookup | tool | WorkNotes | about_work | Verified quotations on a core work's significance, best authority first. |
| source_trace | Source Trace | tool | Passage[] | trace_source | The primary passages that a signpost (a House letter, a scholar, a compilation) quotes or rests on. |
| quotation_trace | Quotation Trace | strategy | Passage[] | source_of | Where a quotation comes from: its published source, the original tablet and the works quoting it. |

Some entries are **internal** strategies (`internal: true`): `comparison`, `understanding`, `prayer`, `guidance` and `reference`. The answer pipeline runs them through `run()` once Jev has chosen them. They are not routes.

`POST /api/v1/tools/search`, the older multi-mode tool in `public-api.js`, is still served for existing callers. Its successor is `combined_search`.

## Adding a tool

1. Pick the name by the naming rule, and make sure it is not used by another function. If the tool replaces an old name, add that name to `ALIASES`.
2. Add an entry to `ENTRIES` in `tools.js` with:
   - `name`, `label`, `kind` and `purpose` (one sentence);
   - `input` (JSON Schema; reuse `FILTERS` for passage filters);
   - `output` (reuse `PASSAGE` / `WORK`) and `outputName`;
   - an `example: { input, output }` that validates;
   - `run(input, ctx)`. Load its dependencies through `dep(ctx, …)`, so a test can inject them through `ctx.deps`.
3. Models only: add the name to `RESEARCH_TOOL_NAMES` (researcher.js) or `AGENT_TOOL_NAMES` (agent.js), plus a runner in `toolRunner` that formats the JSON for the model. Use `llmOmit` for inputs a model should not set.
4. The route, the spec entry and the list entry come from the registry, so there is nothing else to wire.
5. Tests: `tests/api/anis-tools-registry.test.js` (behaviour, naming) and `tests/api/anis-tools-api.test.js` (route, schemas, example, auth) cover a new entry automatically. Add a behaviour test for what the tool does.
