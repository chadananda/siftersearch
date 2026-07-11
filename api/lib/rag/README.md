# CorpusRAG

A framework-agnostic library for enriching and retrieving a large, multilingual document corpus:
disambiguation, HyPE (hypothetical-question indexing), an evidence-based **entity** (factual) layer, and a
top-down **concept** (doctrinal) layer — behind one small interface.

Designed for eventual standalone release. The core here contains **no database access, no table or field
names, no model ids, and no provider names.** Everything concrete enters through injected ports.

## Install / use

```js
import { createCorpusRAG } from 'corpus-rag';

const rag = createCorpusRAG({ llm, models, store, profiler, log }); // supply the ports (see ports.js)

await rag.disambiguate(docId);        // make each passage self-contained (gates everything below)
await rag.retrieval.index(docId);     // HyPE questions for search
await rag.entities.mentions(docId);   // source-anchored, identity deferred
await rag.entities.claims(docId);     // cited, proof-gated
await rag.entities.reconcile(docId);  // resolve by evidence → proposed, append-only decisions
await rag.entities.project();         // materialize entities from the decision log
await rag.concepts.extract(docId);    // concepts as first-class entities + interpretation-claims
await rag.pipeline.drain();           // gated, priority-ordered orchestration
```

The method names are the whole public surface. Everything under `kernel/`, `enrich/`, `entities/`,
`concepts/` is internal implementation and never referenced by name.

## The ports (the abstraction boundary)

You provide five dependencies; the library provides the logic. Full contracts: [`ports.js`](./ports.js).

| Port | Role |
|---|---|
| `llm` | one `chat(messages, opts)` primitive — the only way the library calls a model |
| `models` | a catalog: `get(id)` → provider · capabilities · cost (cloud **and** local models) |
| `store` | persistence, named by intent (`getParagraphs`, `saveContext`, …) — no SQL crosses the boundary |
| `profiler` | your routing policy: `(docMeta, sample)` → which model each stage/language uses |
| `log` | optional structured logger |

Because the library names no model, **swapping a model — or pointing a stage at a local endpoint — is a
change to your catalog/profiler, never to library code.** An unknown model id fails loudly rather than
guessing a provider.

## Guarantees

- Disambiguation **gates** all downstream stages.
- Identity is **deferred** at extraction and decided by **evidence** at reconcile — recorded as
  **append-only decisions**, so better models improve entities without regenerating them. The materialized
  graph is a disposable projection.
- Every fact is **cited and proof-gated**; enrichment is written in English while proof stays verbatim in
  the source language.

## Testing

The ports make every stage unit-testable with fakes — no database, no network. See
[`../../tests/rag/`](../../../tests/rag). New stages are added test-first.

## This repository

SifterSearch wires the ports to its own infrastructure in the app-side adapter `api/lib/rag-adapter/`
(the only code that imports the app's DB, LLM client, model registry, and routing policy). Application
code imports the ready instance from there; the library core stays clean. Concept/architecture docs:
`docs/architecture/corpus-rag-library.md`.
