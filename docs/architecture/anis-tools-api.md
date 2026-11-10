# Anís tools API

Anís searches the library with a set of named tools. Each kind of search, and each lookup, is its own tool with one name, one function and one contract. Strategies, the researcher, the agent and outside callers all use the same contract.

- **Catalog:** the tool catalog lives in the database (`api/lib/repos/anis-tools-repo.js`, its own store `tools.db`), one row per tool: name, label, kind, purpose, schemas, example, status (`built`, `planned` or `disabled`), executor (`code`, `http`, or none for a planned row), cost and timeout. Every process reads it through a cached copy that re-checks a revision stamp every few seconds, so a change is live without a restart or a deploy. If the store cannot be read, the code tools still run from `tools.js`.
- **Code tools:** `api/lib/assistant/tools.js` is the implementation of each code tool: `name`, `label`, `kind`, `purpose`, the `input` and `output` JSON Schemas, `outputName`, an `example` and `run(input, ctx)`. One process (the first Anís instance) writes their metadata into the catalog after each deploy, and only when it changed.
- **HTTP tools:** a row alone defines them (see "Adding a tool"). One generic executor runs them.
- **In process:** `run(name, input, ctx)` returns plain JSON.
- **Over HTTP:** `POST /api/v1/tools/{name}` returns the same JSON (`api/routes/anis-tools.js`). It needs an `X-API-Key`.
  - `GET /api/v1/tools` lists the tools.
  - The OpenAPI spec is at `GET /api/v1/docs/json`, under the tag "Anís Tools". The interactive docs are at `/api/v1/docs`.
- **Errors:** `{ "error": { "code", "message", "retryable" } }`. The codes are:
  - `invalid_input` and `empty_input` (400);
  - `unknown_tool` (404);
  - `timeout` (504);
  - `unavailable` and `rights_unavailable` (503): a disabled tool, a remote service that is down, or a credential that cannot be read;
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

There are two ways. A code tool needs a deploy. An HTTP tool needs only a call to the ops API.

### A code tool

Use this when the tool runs our own code: a search over our indexes, or a lookup in our data.

1. Pick the name by the naming rule, and make sure it is not used by another function.
2. Add an entry to `ENTRIES` in `tools.js` with:
   - `name`, `label`, `kind` and `purpose` (one sentence);
   - `input` (JSON Schema; reuse `FILTERS` for passage filters);
   - `output` (reuse `PASSAGE` / `WORK`) and `outputName`;
   - an `example: { input, output }` that validates;
   - `run(input, ctx)`. Load its dependencies through `dep(ctx, …)`, so a test can inject them through `ctx.deps`.
3. Models only: add the name to `RESEARCH_TOOL_NAMES` (researcher.js) or `AGENT_TOOL_NAMES` (agent.js), plus a runner in `toolRunner` that formats the JSON for the model. Use `llmOmit` for inputs a model should not set.
4. The route, the spec entry, the list entry and the catalog row all come from the entry, so there is nothing else to wire. The catalog row appears after the deploy, when the first Anís instance syncs it.
5. Tests: `tests/api/anis-tools-registry.test.js` (behaviour, naming) and `tests/api/anis-tools-api.test.js` (route, schemas, example, auth) cover a new entry automatically. Add a behaviour test for what the tool does.

### An HTTP tool

Use this for an outside service that answers over HTTP with JSON. The row is the whole tool: no code, no deploy, no restart.

1. Write the row as JSON. It holds the name (by the naming rule), the label, the purpose, the input and output schemas, an optional example and timeout, and an `http` block:
   - `method` and `url`. The URL is a template: `{field}` is replaced by that input field, URL-encoded.
   - `body`, an optional template. A string that is exactly `"{field}"` becomes the field's value with its type kept; other strings are filled in as text. Without a template, a POST sends the input as it is.
   - `auth`: `none`, `bearer`, `basic` (the credential is `user:password`) or `header:<Name>`. Any auth other than `none` names a `credential`.
   - `pick`, the part of the response that becomes the output: one path (`data.items`, `$.results[0]`), or an object that maps output fields to paths. Without a pick, the whole JSON object is the output.
   - `cost_usd`, the cost of one call, for the stats.
2. Register it: `node scripts/ops/ops.mjs anis-tool-register tool.json`. Registering the same name again updates it. A name held by a code tool or a planned row is refused.
3. Store the credential, if it has one: pipe the secret into `node scripts/ops/ops.mjs anis-tool-credential <credential-name>`. The secret is read from stdin, never from the command line. Run the same command again to rotate it.
4. Try it: `node scripts/ops/ops.mjs anis-tool-test <name> '{"query":"…"}'` makes one real call and returns the output and the time it took, even while the tool is disabled.
5. Turn it on or off: `node scripts/ops/ops.mjs anis-tool-status <name> built` or `disabled`. A disabled tool refuses every call with `unavailable`.

Within a few seconds the tool is listed by `GET /api/v1/tools`, callable at `POST /api/v1/tools/{name}` and through `run()`, and counted in the tool stats like any other tool. Jev and the strategies see it as an ordinary tool. Adding it never changes how intent is decided.

Credentials are encrypted at rest with AES-256-GCM. The key comes from the environment variable `TOOL_SECRETS_KEY` in `.env-secrets` on tower. No API, log or page ever shows a secret; the list shows only credential names, when each was set, and which tools use it. If the key is not set, tools that need a credential refuse with `unavailable` ("credential store is locked"), and every other tool keeps working.

A failed call never returns an empty result. A timeout is `timeout`. A network failure, an HTTP 429 or a 5xx from the service is `unavailable` and may be retried. Any other HTTP error, or a body that is not JSON, is `tool_failed`. Error messages never include the URL or the secret.
