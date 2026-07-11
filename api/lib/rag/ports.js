// ports — the dependency contracts that make CorpusRAG a standalone, releasable library.
//
// The core (index + kernel + stages) names NO host infrastructure — no SQL, no table, no field, no model
// id, no provider. Everything host-specific — the database, the LLM client, the model catalog, the
// profiling policy, the logger — enters through these ports, supplied by an adapter that lives OUTSIDE the
// library (in this repo: api/lib/rag-adapter/). A future npm consumer writes their own adapter. This file
// is the whole abstraction boundary: implement these shapes and CorpusRAG runs anywhere — and fakes for
// them make every stage unit-testable with no database and no network.
//
// These are JSDoc typedefs (documentation + editor types), not runtime code — the contract, stated once.

/**
 * @typedef {Object} LLM  A single chat primitive. The library never imports an SDK directly.
 * @property {(messages: {role:string, content:string}[], opts: LLMCallOpts) => Promise<LLMResult>} chat
 */
/**
 * @typedef {Object} LLMCallOpts
 * @property {string}  model         model id (from the catalog)
 * @property {string}  provider      resolved provider (openai|anthropic|deepseek|ollama|lmstudio|…)
 * @property {number}  maxTokens
 * @property {number} [temperature]
 * @property {boolean}[json]             INTENT: want a JSON object back (adapter maps to the provider's
 *                                       response_format where supported; else relies on the prompt)
 * @property {boolean}[thinking]         INTENT: enable reasoning tokens where the provider supports it
 * @typedef {Object} LLMResult
 * @property {string}  content
 * @property {string} [finishReason]     'stop' | 'length' | …  (drives continuation/retry)
 */

/**
 * @typedef {Object} ModelCatalog  The price/provider/capability catalog (cloud AND local models).
 * @property {(id: string) => (ModelInfo|null)} get   authoritative provider + cost + capabilities per id
 * @typedef {Object} ModelInfo
 * @property {string}   provider
 * @property {string[]} [capabilities]   e.g. ['reasoning'] → gets thinking + a larger token budget
 * @property {boolean}  [local]          zero-cost local endpoint (ollama/lmstudio) — routing is transparent
 * @property {{input:number, output:number}} [pricing]
 */

/**
 * Profiler — the per-document routing policy (language/genre/domain → model choice). This is HOST config,
 * not library core (a consumer's corpus and models differ), so it is injected. Given a doc's metadata and a
 * text sample it returns the profile every stage keys off.
 * @typedef {(docMeta: DocMeta, sampleText: string) => Profile} Profiler
 * @typedef {Object} Profile
 * @property {string} lang @property {string} script @property {string} genre @property {string} domain
 * @property {number} priority
 * @property {{disambig:string, hype:string, extract:string}} models   per-stage model ids
 * @property {string} fallback         escalation target when the primary model fails
 * @property {boolean} extract         genre builds an entity graph? (gates entity extraction)
 * @property {string} [eraAnchors]     domain date anchors fed into disambiguation
 * @property {'toc'|'bounded'} segmentation
 */

/**
 * Store — the persistence port. All reads/writes the library needs, named by INTENT (never raw SQL passed
 * across the boundary — that would leak a schema). Grown method-by-method as stages require. Writes go
 * through whatever single-writer discipline the adapter enforces.
 * @typedef {Object} Store
 * @property {(docId: number) => Promise<DocMeta>} getDocMeta
 * @property {(docId: number) => Promise<string>}  getSampleText          first substantial paragraph
 * @property {(docId: number) => Promise<Paragraph[]>} getParagraphs      prose paragraphs in reading order
 * @property {(paragraphId: number, note: string, methodVersion: string) => Promise<void>} saveContext
 * @property {(paragraphId: number, questions: string[], thesis: string) => Promise<void>} saveHype
 * @property {(mentions: Mention[]) => Promise<number>} saveMentions       upsert by anchor; entity_id stays null
 * @property {() => Promise<{key:string,label:string}[]>} [getRelations]   controlled relation vocabulary
 * @property {(claims: ClaimRow[]) => Promise<number>} saveClaims          upsert by claim_hash; ids stay null
 * @property {(docId: number) => Promise<number>}  getDisambigCoverage    fraction 0..1 that carry a note (gate)
 * @property {(docId: number) => (Promise<string>|string)} [getCastSeed]  optional who's-who for the prompt
 * @property {(docId: number, opts?: {minFreq?:number,filter?:string,limit?:number}) => Promise<Cluster[]>} getMentionClusters
 * @property {(name: string, opts?: {type?:string,limit?:number}) => Promise<CandidateEntity[]>} findCandidateEntities  RECALL only
 * @property {(docId: number, paraIds: string[]) => Promise<{pid:string,context:string}[]>} getScenes
 * @property {(decisions: Decision[]) => Promise<number>} saveDecisions    append-only; never edits the graph
 * @typedef {Object} DocMeta
 * @property {number} id @property {string} [title] @property {string} [author] @property {string} [religion]
 * @property {string} [collection] @property {number} [year] @property {string} [description] @property {string} [lang]
 * @typedef {Object} Paragraph
 * @property {number} id @property {string} pid @property {number} pidx @property {string} [heading] @property {string} text
 * @property {string} [kind]         block kind ('paragraph'|'quote'); claims process 'paragraph' only
 * @property {string} [context]      the disambiguation note, when already present
 * @property {string} [contextModel] method-version tag of the existing note (for RESUME)
 * @property {string} [chapter]      chapter label for 'toc' segmentation (adapter-supplied where available)
 */

/**
 * @typedef {Object} Logger  minimal structured logger (pino-shaped).
 * @property {(...a:any)=>void} info @property {(...a:any)=>void} warn @property {(...a:any)=>void} error @property {(...a:any)=>void} [debug]
 */

/**
 * Deps — the full set injected into createCorpusRAG. Omit any and the default SifterSearch adapter fills it.
 * @typedef {Object} Deps
 * @property {LLM} llm @property {ModelCatalog} models @property {Store} store @property {Profiler} profiler
 * @property {Logger} [log]
 */

export {}; // types only
