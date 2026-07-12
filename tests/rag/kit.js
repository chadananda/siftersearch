// CorpusRAG test kit — the fakes every rag test composes, so test files stay imports + assertions.
// The library takes ports; these are trivial in-memory ports. No DB, no network. See api/lib/rag/ports.js.
import { createCorpusRAG } from '../../api/lib/rag/index.js';

// LLM port. `script` is either an array of {content,finishReason} (returned in order, last repeats) or a
// function(opts, i) → {content,finishReason} (respond by model/attempt). Records every call for assertions.
export function fakeLLM(script = []) {
  const calls = [];
  let i = 0;
  return {
    calls,
    chat: async (messages, opts) => {
      calls.push({ messages, opts });
      const r = typeof script === 'function' ? script(opts, i, messages) : script[Math.min(i, script.length - 1)];
      i++;
      return r ?? { content: '', finishReason: 'stop' };
    },
  };
}

// ModelCatalog port. Defaults cover the cases the kernel cares about: a plain cloud model, a fallback on a
// different provider, a reasoning-capable model, and a local model. Extend/override via `extra`.
export function fakeCatalog(extra = {}) {
  const base = {
    flash: { provider: 'deepseek' },
    haiku: { provider: 'anthropic', capabilities: [] },
    pro: { provider: 'deepseek', capabilities: ['reasoning'] },
    local1: { provider: 'ollama', local: true },
    ...extra,
  };
  return { get: (id) => base[id] || null };
}

// Store port, in memory. seed = { docs:{id:meta}, samples:{id:text}, paras:{id:[Paragraph]}, coverage:{id:0..1} }.
// Saved context notes are recorded on `.saved` for write assertions.
export function memStore(seed = {}) {
  const saved = [];     // saveContext calls
  const hyped = [];     // saveHype calls
  const mentions = [];  // saveMentions rows
  const claims = [];     // saveClaims rows
  const decisions = []; // saveDecisions rows
  const created = [];    // createEntity calls
  const bound = [];      // bindMentions calls
  const appliedMarks = []; // markDecisionApplied calls
  const merges = [];     // applyMerge calls
  const conceptClaims = []; // saveConceptClaims rows
  const conceptDecisions = []; // saveConceptDecisions rows
  const lexiconEntries = []; // saveLexiconEntries rows
  const conceptLinks = []; // saveConceptLinks rows
  return {
    saved, hyped, mentions, claims, decisions, created, bound, appliedMarks, merges, conceptClaims, conceptDecisions, lexiconEntries, conceptLinks,
    getDocMeta: async (id) => seed.docs?.[id] || { id },
    getSampleText: async (id) => seed.samples?.[id] || '',
    getParagraphs: async (id) => seed.paras?.[id] || [],
    saveContext: async (paragraphId, note, methodVersion) => { saved.push({ paragraphId, note, methodVersion }); },
    saveHype: async (paragraphId, questions, thesis) => { hyped.push({ paragraphId, questions, thesis }); },
    saveMentions: async (rows) => { mentions.push(...rows); return rows.length; },
    getRelations: async () => seed.relations || [],
    saveClaims: async (rows) => { claims.push(...rows); return rows.length; },
    saveConceptClaims: async (rows) => { conceptClaims.push(...rows); return rows.length; },
    getConceptGroups: async (id) => seed.conceptGroups?.[id] || [],
    findLexiconEntries: async () => seed.lexicon || [],
    saveConceptDecisions: async (rows) => { conceptDecisions.push(...rows); return rows.length; },
    getConceptInterpretations: async (id) => seed.conceptInterpretations?.[id] || [],
    saveLexiconEntries: async (rows) => { lexiconEntries.push(...rows); return rows.length; },
    getConcept: async (id) => seed.concepts?.[id] || { id },
    saveConceptLinks: async (rows) => { conceptLinks.push(...rows); return rows.length; },
    getDisambigCoverage: async (id) => seed.coverage?.[id] ?? 1,
    getMentionClusters: async (id) => seed.clusters?.[id] || [],
    getDecidedClusterNames: async () => new Set(seed.decided || []),
    findCandidateEntities: async (name) => (typeof seed.candidates === 'function' ? seed.candidates(name) : seed.candidates || []),
    getScenes: async (id, paraIds) => seed.scenes || paraIds.map((pid) => ({ pid, context: '' })),
    saveDecisions: async (rows) => { decisions.push(...rows); return rows.length; },
    // project
    getDuplicateGroups: async () => seed.dupGroups || [],
    applyMerge: async (canonical, mergeIds) => { merges.push({ canonical, mergeIds }); return mergeIds.length; },
    getProposedDecisions: async () => seed.proposals || [],
    createEntity: async (canonical, type) => { const id = 1000 + created.length; created.push({ id, canonical, type }); return id; },
    bindMentions: async (resolvedAs, entityId, conf) => { bound.push({ resolvedAs, entityId, conf }); return seed.clusterSizes?.[resolvedAs] ?? 1; },
    markDecisionApplied: async (id, entityId) => { appliedMarks.push({ id, entityId }); },
  };
}

// Profiler port. Returns a Profile; override any field.
export function fakeProfiler(profile = {}) {
  return (meta = {}) => ({
    lang: meta.lang || 'en', script: 'latin', genre: 'history', domain: 'bahai', priority: 0,
    models: { disambig: 'flash', hype: 'flash', extract: 'flash' }, fallback: 'haiku',
    extract: true, eraAnchors: '', segmentation: 'bounded', ...profile,
  });
}

// A ready CorpusRAG on all fakes. Returns the instance plus the ports so a test can inspect them.
export function makeRag(overrides = {}) {
  const ports = {
    llm: overrides.llm || fakeLLM([]),
    models: overrides.models || fakeCatalog(),
    store: overrides.store || memStore(overrides.seed || {}),
    profiler: overrides.profiler || fakeProfiler(overrides.profile || {}),
    log: overrides.log,
  };
  return { rag: createCorpusRAG(ports), ...ports };
}

// A parser used across tests: accept a JSON object that carries an `idea`.
export const parseIdea = (c) => { try { const j = JSON.parse(c); return j.idea ? j : null; } catch { return null; } };
