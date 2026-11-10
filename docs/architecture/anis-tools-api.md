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

The tool list is data, not documentation: read it live from `GET /api/v1/tools` (contract tools) or `GET /api/v1/anis/tools`
(with 7-day calls, errors and timings), rendered at /docs/anis-tools. Do not copy it into this file.

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
