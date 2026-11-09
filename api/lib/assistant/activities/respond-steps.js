// The respond graph's activities (strategy-seed.js RESPOND_GRAPH): anisRespond's gather cascade cut into steps, each the SAME
// expression as respond.js legacyGather (predicates unchanged — the old comments explain each one there). A step reads and
// writes the turn state `s` and returns its EDGE (recorded in path.steps). Sync steps stay sync (the interpreter awaits only a
// promise) so concurrent starts (phrases / original / hunt) interleave with the main flow exactly as before.
// 'answered' = the turn is answered here: s.done holds the reply object.
import {
  looksLikeSourceQuestion, looksLikeOriginalQuestion, agentOn, agentRespond, liveResearch, researchEnabled, quotationIn, trimTalk,
  originalWording, huntSource, fillTags, evidenceOf, searchQueryFor, distilQuery,
} from '../respond.js';
import { strategyOf } from '../strategy-choice.js';
import { isUnmatched, resolveUnmatched, withStrategyPin, plannerOn } from '../unmatched.js';
import { matchRoute } from '../strategy-planner.js';
import { narrate } from '../narrate.js';
import { timed } from '../timeline.js';
import { textRequest } from '../text-request.js';
import { religionsReply } from '../library-facts.js';
import { findWork, workAboutQuery } from '../work-request.js';
import { extractPhrases, fixedPhrases, hintsOf } from '../phrases.js';
import { research as runResearch, libraryTools } from '../researcher.js';
import { followUpAsks } from '../../search-plan.js';
import { termQuestion, resolveTerm, ctaiTerm } from '../ctai-term.js';
import { runStrategy, withAnchors } from '../strategies.js';
import { looksLikePositionQuestion, positionResearch } from '../position.js';
import { looksLikeLanguageQuestion } from '../language.js';
import { preferOwnWork, literalOwnSearch, linkHits } from '../own-source.js';
import { toPassage } from '../tools.js';
import { jevSubject } from '../query-anchor.js';

const fast = (s) => {
  const { direction, question } = s;
  s.fast = direction.lookup && !direction.guarded && direction.engine !== 'agent' && direction.research !== true
    && !looksLikeSourceQuestion(question) && !looksLikeOriginalQuestion(question) ? direction.lookup : null;
  return s.fast ? 'lookup' : 'none';
};

// params.fallback (the five lookup strategies, strategy-seed.js LOOKUP_GRAPHS): the research agent as their LAST node — it runs when the
// lookup found nothing (nothing in s.fast/work/sourced/original/study, not a conversation), whatever strategy Jev chose
const agent = (s, params = {}) => {
  const { direction, d, deps, messages, onEvent, t0 } = s;
  const open = params.fallback ? !(s.fast || s.work || s.sourced || s.original || s.study || s.conversational) : !s.fast && !strategyOf(direction.strategy);
  if (!(open && agentOn(direction) && !(deps && !d.agentCreate))) return 'skip';
  return agentRespond({ messages, onEvent, d, t0, subject: jevSubject(direction, null) }).catch((err) => { console.warn('anis agent failed', err?.message); return null; })
    .then((A) => { if (A) { s.done = A; return 'answered'; } return 'fail'; });
};

const plan = (s) => {
  const { fast: f, d, messages } = s;
  if (!f) Promise.resolve(d.prewarm?.(messages)).catch(() => {});
  const set = (p) => {
    s.plan = p;
    return f ? 'lookup' : p ? 'planned' : 'none';
  };
  if (f) return set({ shape: f.kind === 'book' ? 'lookup' : 'quote', provenance: 'lookup-code', reason: f.kind });
  return d.plan ? timed('plan', () => d.plan(messages)).catch(() => null).then(set) : set(null);
};

const conversational = (s) => {
  s.conversational = s.plan?.shape === 'converse' && !textRequest([...s.messages].reverse().find((m) => m.role === 'user')?.content).request;
  return s.conversational ? 'converse' : 'no';
};

const religions = (s) => {
  const { plan: p, d, onEvent, t0 } = s;
  if (!(p?.library === 'religions' && !s.conversational)) return 'skip';
  return (async () => {
    const stats = d.libraryStats ? await d.libraryStats() : await import('../../library/library-stats.js').then((m) => m.readLibraryStats()).catch(() => null);
    const reply = religionsReply(stats);
    if (!reply) return 'empty';
    onEvent({ type: 'sources', sources: [], plan: { shape: 'fact', library: 'religions' }, ms: Date.now() - t0 });
    onEvent({ type: 'stage', stage: 'craft' });
    onEvent({ type: 'text', content: reply });
    s.done = { reply, quotes_removed: 0, citations: [], retrieved: [], evidence: [], plan: { ...p, shape: 'fact', library: 'religions' },
      format: { id: 'library', by: 'library-stats' }, profile: null,
      timings: { search_ms: Date.now() - t0, first_token_ms: Date.now() - t0, total_ms: Date.now() - t0 } };
    return 'answered';
  })();
};

const work = (s) => {
  const { fast: f, d, deps, question, plan: p, direction } = s;
  const set = (w) => { s.work = w; return w ? 'found' : 'none'; };
  if (s.conversational) { s.work = null; return 'skip'; }
  if (f) return set(f.kind === 'book' ? f.work : null);
  return timed('work', () => (d.findWork || (deps ? async () => null : findWork))(question, { named: p?.named, ...(direction.lookupIntent === 'book' ? {} : { coreOnly: true }) })).catch(() => null).then(set);
};

const stage = (s, params) => { s.onEvent({ type: 'stage', stage: params.stage }); return 'emitted'; };

const phrasesStart = (s) => {
  const { conversational: c, plan: p, fast: f, d, deps, question, messages } = s;
  s.phrased = null; s.searchQ = null;
  if (!(!c && p && !f)) { s.phrasesP = Promise.resolve(null); return 'skip'; }
  s.phrasesP = timed('phrases', async () => fixedPhrases(p) || (d.phrases || (deps ? async () => null : extractPhrases))(question, p, { messages }),
    (x) => (x ? { via: x.via, ...(x.reason ? { reason: x.reason } : {}) } : null)).catch(() => null);
  return 'started';
};

// the strategy executor, ONE function for Jev's strategy and an Unmatched turn's (unmatched.js): narrates a slow strategy's start, pins a candidate's graph
const runStrat = (s, choice) => {
  const { messages, question, plan: p, d, profile, live, direction, onEvent } = s;
  return withStrategyPin(direction, () => {
    narrate(onEvent, direction.channel, `strategy.${strategyOf(choice)}.start`);
    return timed('strategy', () => runStrategy(choice, { messages, question, plan: p, query: searchQueryFor(messages), distil: distilQuery, search: d.search,
      profile, scope: direction.scope || null, state: direction.state || null, onEvent, decisions: direction.decisions, deps: d, channel: direction.channel || null,
      ...(live ? { inBooks: live.inBooks, searchIn: (d.researchTools || libraryTools({ search: d.search })).searchIn, sourceTools: d.researchTools || libraryTools({ search: d.search }) } : {}),
      ...(live && p?.drawFrom?.name ? { drawFrom: p.drawFrom.name } : {}) }));
  });
};

const research = (s) => {
  const { fast: f, conversational: c, work: w, direction, deps, d, messages, plan: p, question, onEvent } = s;
  s.live = liveResearch(direction);
  const live = s.live;
  const want = !f && !c && !w && (direction.research ?? ((!deps || d.research) ? researchEnabled(direction.channel) : false));
  const go = () => {
    const researchOn = want && !strategyOf(direction.strategy) && !(unmatchedFn && plannerOn());   // Jev's strategy first on every channel (Chad 11-08); planner on: a query is answered only by a strategy (no free research agent)
    const set = (R) => { s.researched = R?.passages?.length || R?.brief ? R : null; return researchOn ? (s.researched ? 'found' : 'empty') : 'skip'; };
    if (!researchOn) return set(null);
    return (d.research || runResearch)({ messages, ...(live || {}), narrate: (key, slots) => narrate(onEvent, direction.channel, key, slots), drawFrom: p?.drawFrom?.name || null, subject: jevSubject(direction, p),
      create: d.researchCreate || (async (params) => (await import('../../role-client.js')).roleCreate('anis-researcher', params)),
      tools: d.researchTools || libraryTools({ search: d.search }) }).catch((err) => { console.warn('anis research failed', err?.message); return null; }).then(set);
  };
  // UNMATCHED (Jev found no strategy) where the researcher would answer: reuse / recheck / design a strategy (unmatched.js) — it runs now,
  // and the direction then names it, so every gate below treats the turn as strategy-chosen; any failure leaves the researcher
  const unmatchedFn = want && isUnmatched(direction.strategy) ? (d.unmatched || (deps ? null : resolveUnmatched)) : null;
  // route record (Chad 11-09): a matched turn is logged with its kind/source and costs no gate call and no Opus call
  try { const mr = unmatchedFn ? null : matchRoute({ strategy: direction.strategy }); if (mr) direction.decisions?.record?.('route', { by: 'code', saw: question, chosen: mr.name, reason: `route: ${mr.kind} ${mr.source}` }); } catch { /* a log never fails a turn */ }
  if (!unmatchedFn) return go();
  return unmatchedFn({ direction, messages, question, onEvent, run: (choice) => runStrat(s, choice) }).catch((err) => { console.warn('anis unmatched failed', err?.message); return null; })
    .then((pre) => { s.pre = pre; return go(); });
};

const readQuestion = (s) => {
  s.wantsOriginal = looksLikeOriginalQuestion(s.question);
  s.quoted = quotationIn(s.question);
  return s.wantsOriginal ? 'original' : s.quoted ? 'quoted' : 'plain';
};

const originalStart = (s) => {
  const { researched, work: w, wantsOriginal, d, question, messages } = s;
  s.originalP = !researched && !w && wantsOriginal ? timed('original', () => originalWording(d, question, messages)).catch(() => null) : null;
  return s.originalP ? 'started' : 'skip';
};

// params.own: the lookup strategy owns the hunt, so its reply is the template reply (as in Unmatched), not evidence for the writer
const huntStart = (s, params = {}) => {
  const { question, quoted, fast: f, researched, work: w, plan: p, direction, messages, wantsOriginal, d } = s;
  const separate = quoted !== trimTalk(question.trim()) && quoted !== question.trim();
  const huntable = !f && !researched && !w && !p?.named && ((direction.kind === 'source_lookup' && quoted.split(/\s+/).length >= 4 && (separate || messages.length <= 1))
    || looksLikeSourceQuestion(question) || (wantsOriginal && quoted !== question.trim() && quoted.split(/\s+/).length >= 8));
  s.asks = huntable ? followUpAsks(question) : [];
  s.huntAsEvidence = s.asks.length > 0 || (!params.own && !!strategyOf(direction.strategy));
  s.huntP = huntable ? timed('source-hunt', () => huntSource(d, question, { named: p?.drawFrom?.name || null })).catch(() => null) : null;
  return !huntable ? 'skip' : s.huntAsEvidence ? 'evidence' : 'template';
};

const huntAwait = (s) => {
  const set = (x) => { s.sourced = x; return x ? 'sourced' : 'none'; };
  return s.huntP && !s.huntAsEvidence ? s.huntP.then(set) : set(null);
};

const originalAwait = (s) => {
  const set = (x) => { s.original = x; return x ? 'found' : 'none'; };
  return !s.sourced && s.originalP ? s.originalP.then(set) : set(null);
};

const sourceReply = (s) => {
  const { sourced, d, onEvent, t0 } = s;
  if (!sourced) return 'skip';
  return (async () => {
    const up = d.upgradeLinks || (async (x) => x);
    for (const q of sourced.retrieved) if (q.citation_url) q.citation_url = await up(q.citation_url).catch(() => q.citation_url);
    const reply = await up(fillTags(sourced.reply, sourced.tags)).catch(() => fillTags(sourced.reply, sourced.tags));
    const citations = sourced.retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url,
      religion: q.religion, document_id: q.doc_id, paragraph_index: null, text: q.text.slice(0, 300) }));
    onEvent({ type: 'sources', sources: citations, plan: { shape: 'source' }, ms: Date.now() - t0 });
    onEvent({ type: 'stage', stage: 'craft' });
    onEvent({ type: 'text', content: reply });
    s.done = { reply, quotes_removed: 0, citations, retrieved: sourced.retrieved, evidence: evidenceOf(sourced.retrieved), plan: { shape: 'source', sourceHunt: sourced.hunt },
      format: { id: 'source', by: 'sourcehunt' }, profile: null,
      timings: { search_ms: Date.now() - t0, first_token_ms: Date.now() - t0, total_ms: Date.now() - t0 } };
    return 'answered';
  })();
};

const termStudy = (s) => {
  const { researched, sourced, original, conversational: c, d, question } = s;
  s.study = null;
  const termQ = !researched && !sourced && !original && !c ? (d.termQuestion || termQuestion)(question) : null;
  if (!termQ) return 'skip';
  return (async () => {
    try {
      const word = termQ.script === 'arabic' ? termQ.term : await (d.resolveTerm || resolveTerm)(termQ.term);
      if (word) s.study = await (d.ctaiTerm || ctaiTerm)(word);
      if (!s.study?.passages?.length) s.study = null;
    } catch { s.study = null; }
    return s.study ? 'found' : 'empty';
  })();
};

const strategy = (s) => {
  const { fast: f, researched, sourced, original, study, conversational: c, direction } = s;
  if (!(!f && !researched && !sourced && !original && !study && !c && strategyOf(direction.strategy))) { s.strat = null; return 'skip'; }
  return Promise.resolve(s.pre?.out ?? runStrat(s, direction.strategy)).catch((err) => { console.warn('anis strategy failed', err?.message); return null; })
    .then((x) => { s.strat = x; return x ? 'found' : 'empty'; });
};

const position = (s) => {
  const { strat, researched, sourced, original, study, conversational: c, d, question, profile } = s;
  if (!(!strat && !researched && !sourced && !original && !study && !c && (d.looksLikePosition || looksLikePositionQuestion)(question))) { s.position = null; return 'skip'; }
  // as before: a failed role-client import is not caught here (it was an argument of the call, outside its .catch)
  return (async () => positionResearch({ question, create: d.create || (await import('../../role-client.js')).roleCreate, search: d.search,
    authorityOf: d.authorityOf || (async (x) => { try { return (await import('../../authority.js')).getAuthority(x || {}); } catch { return 0; } }),
    defaults: profile.default_tradition ? { religion: profile.default_tradition } : {}, scope_config: profile.scope_config })
    .catch((err) => { console.warn('anis position research failed', err?.message); return null; }))()
    .then((x) => { s.position = x; return x ? 'found' : 'empty'; });
};

const language = (s) => {
  const { strat, researched, sourced, original, study, position: pos, conversational: c, d, question } = s;
  s.language = !strat && !researched && !sourced && !original && !study && !pos && !c && (d.looksLikeLanguage || looksLikeLanguageQuestion)(question);
  return s.language ? 'yes' : 'no';
};

// the evidence the writer gets, by the first branch that holds (the old `res` chain, in its order); the edge names the branch
const evidence = (s) => {
  const { researched, work: w, fast: f, sourced, original, conversational: c, plan: p, strat, language: lang, position: pos, study, d, profile, direction, messages } = s;
  const done = (res, edge) => { s.res = res; if (s.phrased && res?._plan && !res._plan.quote) res._plan = { ...res._plan, phrases: s.phrased }; return edge; };
  if (researched) return done({ passages: researched.passages || [], _plan: { shape: 'research', steps: researched.steps, ms: researched.ms } }, 'research');
  if (w && f?.kind === 'book') return done({ passages: [], _plan: { shape: 'work', work: w.doc.id, via: 'lookup-code' } }, 'work');
  if (w) {
    return timed('search', () => d.search({ query: (s.searchQ = workAboutQuery(w)), mode: 'passages', limit: 16, scope_config: profile.scope_config,
      plan: { messages: [{ role: 'user', content: workAboutQuery(w) }] } })).then((r) => done({ ...r, _plan: { shape: 'work', work: w.doc.id } }, 'work'));
  }
  if (f?.passages) return done({ passages: f.origin?.passages || f.passages, _plan: { shape: f.kind === 'reference' ? 'lookup' : 'quote', lookup: f.kind, ...(f.phrase ? { quote: { phrase: f.phrase, via: 'lookup-code' } } : {}) } }, 'lookup');
  if (sourced) return done({ passages: [], _plan: { shape: 'source', sourceHunt: sourced.hunt } }, 'source');
  if (original) return done({ passages: [], _plan: original.plan }, 'original');
  if (c) return done({ passages: [], _plan: p }, 'converse');
  if (strat) return done({ passages: strat.passages || [], _plan: strat.plan }, 'strategy');
  if (lang) return done({ passages: [], _plan: { shape: 'language' } }, 'language');
  if (pos?.passages?.length) return done({ passages: pos.passages, _plan: { shape: 'position', themes: pos.themes } }, 'position');
  if (study) return done({ passages: [], _plan: { shape: 'define', term: study.term, root: study.root, via: 'ctai' } }, 'define');
  return s.phrasesP.then((x) => {
    s.phrased = x;
    s.searchQ = (x?.via === 'named-object' || x?.via === 'haiku') && x.phrase ? x.phrase : direction.query || searchQueryFor(messages);
    const hints = hintsOf(x);
    if (direction.strategy?.refersBack) messages.refersBack = true;   // the search plan reads it (search-plan.js refers-back rule)
    return timed('search', () => d.search({ query: s.searchQ, mode: 'passages', limit: 8, scope_config: profile.scope_config,
      plan: { messages, defaults: profile.default_tradition ? { religion: profile.default_tradition } : {}, ...(hints ? { hints } : {}) } }));
  })
    // Jev read the message as pointing at the last reply: the passages it cited lead (the actual words), also in a fresh conversation (the reply's own links)
    .then(async (r) => { if (direction.strategy?.refersBack && !f && r?.passages) r.passages = await withAnchors(r.passages, direction.state, { messages }, direction.decisions); return r; })
    .then((r) => done(r, 'search'));
};

const ownSource = (s) => {
  const { fast: f, work: w, sourced, original, study, res, deps, d } = s;
  if (!(!f && !w && !sourced && !original && !study && res?.passages?.length)) return 'skip';
  const ownDeps = deps ? { search: d.ownSourceSearch || null, link: d.ownSourceLink || null } : { search: literalOwnSearch, link: linkHits };
  const named = new Set([...(res._plan?.namedWorks || []), ...(res._plan?.steps || []).filter((x) => x.tool === 'named_source').flatMap((x) => x.args?.works || [])].map(Number));
  return timed('own-source', () => preferOwnWork(res.passages, { ...ownDeps, shape: toPassage, keep: named.size ? (p) => named.has(Number(p.document_id)) : null }),
    (r) => ({ swapped: r.swapped.length, searches: r.searches, late: r.late })).catch((err) => { console.warn('anis own-source failed', err?.message); return null; })
    .then((own) => {
      if (!own) return 'kept';
      res.passages = own.passages;
      if (own.searches || own.swapped.length) res._plan = { ...(res._plan || {}), ownSource: { swapped: own.swapped, searches: own.searches, late: own.late, ms: own.ms } };
      return own.swapped.length ? 'swapped' : 'kept';
    });
};

/** name → { kind, cls, run(s, params) → edge | Promise<edge>, edges: the edges it can return } */
export const RESPOND_ACTIVITIES = {
  'respond.fast': { kind: 'decision', cls: 'code', run: fast, edges: ['lookup', 'none'] },
  'respond.agent': { kind: 'tool', cls: 'llm', run: agent, edges: ['answered', 'fail', 'skip'] },
  'respond.plan': { kind: 'decision', cls: 'jev', run: plan, edges: ['lookup', 'planned', 'none'] },
  'respond.conversational': { kind: 'decision', cls: 'code', run: conversational, edges: ['converse', 'no'] },
  'respond.religions': { kind: 'tool', cls: 'code', run: religions, edges: ['answered', 'empty', 'skip'] },
  'respond.work': { kind: 'tool', cls: 'code', run: work, edges: ['found', 'none', 'skip'] },
  'ui.stage': { kind: 'transform', cls: 'code', run: stage, edges: ['emitted'] },
  'respond.phrases_start': { kind: 'tool', cls: 'llm', run: phrasesStart, edges: ['started', 'skip'] },
  'respond.research': { kind: 'tool', cls: 'llm', run: research, edges: ['found', 'empty', 'skip'] },
  'respond.read_question': { kind: 'decision', cls: 'code', run: readQuestion, edges: ['original', 'quoted', 'plain'] },
  'respond.original_start': { kind: 'tool', cls: 'code', run: originalStart, edges: ['started', 'skip'] },
  'respond.hunt_start': { kind: 'tool', cls: 'code', run: huntStart, edges: ['template', 'evidence', 'skip'] },
  'respond.hunt_await': { kind: 'transform', cls: 'code', run: huntAwait, edges: ['sourced', 'none'] },
  'respond.original_await': { kind: 'transform', cls: 'code', run: originalAwait, edges: ['found', 'none'] },
  'respond.source_reply': { kind: 'writer', cls: 'code', run: sourceReply, edges: ['answered', 'skip'] },
  'respond.term_study': { kind: 'tool', cls: 'code', run: termStudy, edges: ['found', 'empty', 'skip'] },
  'respond.strategy': { kind: 'tool', cls: 'code', run: strategy, edges: ['found', 'empty', 'skip'] },
  'respond.position': { kind: 'tool', cls: 'llm', run: position, edges: ['found', 'empty', 'skip'] },
  'respond.language': { kind: 'decision', cls: 'code', run: language, edges: ['yes', 'no'] },
  'respond.evidence': { kind: 'tool', cls: 'code', run: evidence, edges: ['research', 'work', 'lookup', 'source', 'original', 'converse', 'strategy', 'language', 'position', 'define', 'search'] },
  'respond.own_source': { kind: 'check', cls: 'code', run: ownSource, edges: ['swapped', 'kept', 'skip'] },
};
