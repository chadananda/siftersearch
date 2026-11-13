// THE AGENT (Chad 11-01: "start with using haiku + tools to answer everything … it hallucinates constantly instead of using
// its library"). The loop lives in agent-core.js (pure, Worker-bundlable); this file injects the server pieces (tool schemas, tool-name
// registry, work notes, preamble drop, quote cards, reply ceiling) and builds the live tools. Deps injectable (tests).
import { libraryTools, toolRunner } from './researcher.js';
import { llmTools, canonical, canonWork, run as runTool, toPassage } from './tools.js';
import { dropPreamble } from './work-request.js';
import { agentSearch } from './agent-search.js';
import { roleReplyCap } from './reply-cap.js';
import { agentCache } from './tool-cache.js';
import { strategyImpl } from './agent-strategies.js';
import { agentAnswer as coreAnswer, AGENT_TOOL_NAMES } from './agent-core.js';

export { AGENT_TOOL_NAMES, NOT_FOUND, MIN_SEARCHES, AGENT_SYSTEM, renderRefs, readRound } from './agent-core.js';
export const AGENT_TOOLS = llmTools(AGENT_TOOL_NAMES);
export { canonWork };

/** One turn: → { reply, retrieved, citations, steps, usage, timings }. See agent-core.js agentAnswer; server pieces injected here (a caller's own wins). */
export const agentAnswer = (o) => coreAnswer({ runner: toolRunner, toolDefs: AGENT_TOOLS, canonical, post: { dropPreamble: (t) => dropPreamble(t) }, maxTokens: roleReplyCap('anis-agent'),
  workNotes: (title, notes) => runTool('work_notes_lookup', { title }, { notes }),
  cards: (a, opts) => import('./quote-cards.js').then((m) => m.refCards(a, opts)), ...o });

/** The live tools for the agent (the API process): the researcher's library tools + the strategies (agent-strategies.js). */
export const agentTools = ({ search, fastSearch, turn = {} } = {}) => {
  const fast = fastSearch || agentSearch();
  // own source on every fused_search (11-12: the Aqdas verse came back credited to a compilation and a parallel-translation copy)
  const ownSource = async (hits) => {
    const os = await import('./own-source.js');
    return (await os.preferOwnWork(hits, { search: os.literalOwnSearch, link: os.linkHits, shape: toPassage })).passages;
  };
  const researchLookup = async (q) => {
    const rc = await import('./research-cache.js');
    const hit = await rc.lookupResearch(q).catch((err) => { console.warn(`[anis] research lookup failed: ${err.message}`); return null; });
    // the question log (question-log.js): every researched question, with how the cache served it, where it was asked and on what channel
    import('./question-log.js').then((m) => m.logTurnQuestion({ question: q, hit: hit && { similarity: hit.similarity, setId: hit.set.id }, channel: turn.channel ?? null, site: turn.site ?? null }));
    if (!hit) return null;
    // held passages get the same own-source pass as a search (11-12 decentralization: a held Uncompiled letter beat the compilation)
    const held = await rc.hydrate(hit.set);
    return { status: hit.set.status, question: hit.set.question, similarity: hit.similarity, passages: (await ownSource(held).catch(() => null)) || held };
  };
  const researchCapture = async (q, ps) => (await import('./research-cache.js')).captureResearch(q, ps);
  return { ...libraryTools({ search, fastSearch: fast }), ...strategyImpl({ search, fastSearch: fast }), ownSource, researchLookup, researchCapture };
};
export { agentCache };
