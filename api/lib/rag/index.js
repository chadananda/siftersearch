// ─────────────────────────────────────────────────────────────────────────────
// CorpusRAG — a reusable retrieval/enrichment library. Framework-agnostic and release-ready:
// the core here names NO database, NO table, NO field, NO model. Everything concrete enters through
// injected PORTS (see ports.js); the host supplies them via an adapter (this repo: api/lib/rag-adapter).
//
// THIS FILE IS THE ONLY PUBLIC SURFACE. Callers speak the DOMAIN, never file names.
//
// THE CONCEPTUAL MAP (what the library does, top-down):
//   profile(doc)              understand a document — language · genre · domain · model routing.
//   disambiguate(doc)         make each passage self-contained (the GATE for everything below).
//   retrieval.index(doc)      HyPE — hypothetical questions per passage, for search recall.
//   entities.*                FACTUAL layer: mentions · claims · reconcile · project · lookup.
//   concepts.*                DOCTRINAL layer: lexicon.seed · disambiguate · extract · reconcile · link.
//   pipeline.*                gated, ordered orchestration composing the stages.
//
// Full documentation: docs/architecture/corpus-rag-library.md.
// ─────────────────────────────────────────────────────────────────────────────

import { makeModelEngine } from './kernel/model.js'; // routed LLM calls + escalation ladder (pure, DI)

// Create a CorpusRAG instance bound to a set of ports. The host injects { llm, models, store, profiler,
// log }; nothing is imported from the application here. Missing a required port fails fast with a clear
// message (also what makes the library trivially unit-testable — inject fakes).
export function createCorpusRAG(deps = {}) {
  const ctx = buildContext(deps);

  // Each method is a thin delegation: lazily load the internal stage, hand it ctx + args. The method NAMES
  // are the stable contract; the file paths behind them are free to move and are never surfaced.
  return {
    async profile(docId) {
      const { profileFor } = await import('./kernel/profile.js');
      return profileFor(ctx, docId);
    },

    async disambiguate(docId, opts) {
      const { run } = await import('./enrich/disambiguate.js');
      return run(ctx, docId, opts);
    },
    retrieval: {
      async index(docId, opts) {
        const { run } = await import('./enrich/retrieval.js'); // HyPE
        return run(ctx, docId, opts);
      },
    },

    entities: {
      async mentions(docId, opts) { return (await import('./entities/mentions.js')).run(ctx, docId, opts); },   // source-anchored, id deferred
      async claims(docId, opts)   { return (await import('./entities/claims.js')).run(ctx, docId, opts); },     // cited, proof-gated
      async reconcile(docId, opts){ return (await import('./entities/reconcile.js')).run(ctx, docId, opts); },  // evidence → proposed decisions
      async project(opts)         { return (await import('./entities/project.js')).run(ctx, opts); },           // materialize from decision log
      async merge(opts)           { return (await import('./entities/merge.js')).run(ctx, opts); },             // dedup same-name entities by evidence
      async lookup(q, opts)       { return (await import('./entities/lookup.js')).run(ctx, q, opts); },         // translit-invariant recall
    },

    concepts: {
      lexicon: {
        async seed(docId, opts) { return (await import('./concepts/lexicon.js')).seed(ctx, docId, opts); },     // grow interpretive lexicon
      },
      async disambiguate(docId, opts) { return (await import('./concepts/disambiguate.js')).run(ctx, docId, opts); }, // argument-carrying
      async extract(docId, opts)      { return (await import('./concepts/extract.js')).run(ctx, docId, opts); },      // concept entities + claims
      async reconcile(docId, opts)    { return (await import('./concepts/reconcile.js')).run(ctx, docId, opts); },    // bind symbols to lexicon
      async link(a, b, opts)          { return (await import('./concepts/link.js')).link(ctx, a, b, opts); },         // analogical / bridge
    },

    pipeline: {
      async drain(opts)  { return (await import('./pipeline.js')).drain(ctx, opts); },
      async status(opts) { return (await import('./pipeline.js')).status(ctx, opts); },
    },
  };
}

// Assemble the shared context every stage receives from the injected ports. This is the one place the
// ports are validated and the model engine is built over them — no host imports, no defaults that reach
// into an application.
function buildContext(deps) {
  const need = ['llm', 'models', 'store', 'profiler'];
  for (const k of need) if (!deps[k]) throw new Error(`CorpusRAG: missing required port '${k}'. Supply it via the adapter (see api/lib/rag/ports.js).`);
  const log = deps.log || { info() {}, warn() {}, error() {}, debug() {} }; // silent by default
  return {
    llm: deps.llm,
    catalog: deps.models,        // price/provider/capability catalog (ports: ModelCatalog)
    store: deps.store,           // persistence port — the only path to data
    profiler: deps.profiler,     // per-doc routing policy (host config)
    log,
    model: makeModelEngine({ llm: deps.llm, catalog: deps.models }), // routed calls + ladder
    config: deps.config || {},
  };
}

export default createCorpusRAG;
