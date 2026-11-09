// Context units, scope layers and conversation_state (strategy-trees §2a/§2b): layer precedence, patch fold + schema, Jev's patch in the ONE
// strategy call (fake Jev), tree-end appends, and the scope feeding the elements and the turn.
import { describe, it, expect } from 'vitest';
import { UNITS, resolveUnit, resolveScope, emptyState, applyPatch, foldPatches, sanitizePatch, treePatch, buildUnits, patchFromAnswers, patchQuestions, stateText, isRequestUnit } from '../../api/lib/assistant/units.js';
import { chooseStrategy } from '../../api/lib/assistant/strategy-choice.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import { migrations, CURRENT_VERSION } from '../../api/lib/migrations/runner.js';

const A = (choice, confidence = 0.9) => ({ choice, confidence });
const jev = (answers, seen = []) => async (_url, init) => { seen.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ answers }) }; };

describe('registry and layers', () => {
  it('names the §2a units with type, filler, default, carried', () => {
    expect(UNITS.religions_specified).toMatchObject({ filled: 'jev', default: 'all', carried: 'conversation' });
    expect(UNITS.current_user_question.filled).toBe('code');
    expect(isRequestUnit('quoted_words')).toBe(true); expect(isRequestUnit('religions_specified')).toBe(false); expect(isRequestUnit('found_passages')).toBe(false);
  });
  it('turn > conversation > reader > site > default, and the winning layer is named', () => {
    const L = { turn: { religions_specified: ['Islam'] }, conversation: { religions_specified: ['Buddhism'] }, reader: { religions_specified: ['Hindu'] }, site: { religions_specified: ["Baha'i"] } };
    expect(resolveUnit('religions_specified', L)).toEqual({ value: ['Islam'], layer: 'turn' });
    expect(resolveUnit('religions_specified', { ...L, turn: {} })).toEqual({ value: ['Buddhism'], layer: 'conversation' });
    expect(resolveUnit('religions_specified', { ...L, turn: {}, conversation: {} }).layer).toBe('reader');
    expect(resolveUnit('religions_specified', { site: L.site })).toEqual({ value: ["Baha'i"], layer: 'site' });
    expect(resolveUnit('religions_specified', {})).toEqual({ value: 'all', layer: 'default' });
    expect(resolveUnit('reads_scripts', {}).value).toEqual([]);
  });
  it('resolveScope: scope_source is the layer of religions_specified; religion only for a single tradition', () => {
    const r = resolveScope({ conversation: { religions_specified: ['Buddhist'] }, site: { religions_specified: ["Baha'i"] } });
    expect(r.units).toMatchObject({ scope_source: 'conversation', authority_floor: 'interpretation', search_originals: true });
    expect(r.religion).toBe('Buddhist');
    expect(resolveScope({ conversation: { religions_specified: 'all' }, site: { religions_specified: ["Baha'i"] } }).religion).toBeNull();   // the reader widened: no site default
  });
  it('request units only when the strategy declares them in needs', () => {
    const base = { question: 'q', request: { quoted_words: 'x y', output_form: 'table' } };
    expect(buildUnits({ ...base, needs: ['quoted_words'] })).toMatchObject({ quoted_words: 'x y' });
    expect(buildUnits({ ...base, needs: ['quoted_words'] }).output_form).toBeUndefined();
    expect(buildUnits(base).quoted_words).toBeUndefined();
  });
});

describe('patch fold and schema', () => {
  it('folds patches into a versioned state; an old conversation (no rows) is the empty state', () => {
    expect(foldPatches([])).toEqual(emptyState());
    const s = foldPatches([{ turn: 0, patch: { scope: { religions_specified: ['Buddhism'] } } }, { turn: 0, patch: { thread: [{ turn: 0, strategy: 'understanding', topic: 'love' }] } }, { turn: 1, patch: { scope: { authority_floor: 'scripture' } } }]);
    expect(s).toMatchObject({ version: 3, updated_turn: 1, scope: { religions_specified: ['Buddhism'], authority_floor: 'scripture' } });
    expect(s.thread).toHaveLength(1);
  });
  it('unknown fields are dropped; Jev cannot write given/thread; code cannot set the scope', () => {
    const raw = { scope: { religions_specified: ['Islam'], bogus: 1, authority_floor: 'nonsense' }, given: [{ turn: 0, kind: 'passage', ref: 'a' }], evil: true, reader: { reply_language: 'fr', reads_scripts: ['arabic', 'x y'] } };
    expect(sanitizePatch(raw, 'jev')).toEqual({ scope: { religions_specified: ['Islam'] }, reader: { reply_language: 'fr', reads_scripts: ['arabic'] } });
    expect(sanitizePatch({ scope: { religions_specified: ['Islam'] }, given: [{ turn: 0, kind: 'passage', ref: 'a' }, { turn: 0, kind: 'bad', ref: 'b' }] }, 'code')).toEqual({ given: [{ turn: 0, kind: 'passage', ref: 'a' }] });
    expect(sanitizePatch('x')).toEqual({});
  });
  it('offers lapse after 2 turns and on a topic change', () => {
    let s = applyPatch(emptyState(), { subjects: { topic: 'love' }, offers: [{ what: 'email it', turn: 0, strategy: 's', units: {} }] }, { turn: 0 });
    expect(s.offers).toHaveLength(1);
    expect(applyPatch(s, {}, { turn: 2 }).offers).toHaveLength(1);
    expect(applyPatch(s, {}, { turn: 3 }).offers).toHaveLength(0);
    expect(applyPatch(s, { subjects: { topic: 'prayer' } }, { turn: 1 }).offers).toHaveLength(0);
  });
});

describe("Jev's patch rides in the ONE strategy call", () => {
  const st = foldPatches([{ turn: 0, patch: { scope: { religions_specified: ['Buddhism'] }, thread: [{ turn: 0, strategy: 'understanding', topic: 'compassion', found_outcome: 'several' }], offers: [{ what: 'a table of these', turn: 0, strategy: 'understanding', units: {} }] } }]);
  const msgs = [{ role: 'user', content: 'what is compassion?' }, { role: 'assistant', content: '…' }, { role: 'user', content: 'what about in Islam?' }];
  it('sends the compact state and the patch questions; no state = the first-turn questions only', async () => {
    const seen = [];
    await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: jev({ strategy: A('understanding') }, seen), conversationState: st, turn: 1 });
    expect(seen[0].state).toContain('conversation state: scope: Buddhism');
    expect(seen[0].questions.continues).toBeTruthy(); expect(seen[0].questions.offer).toBeTruthy(); expect(seen[0].questions.scope_religion.criteria.Islam).toBeTruthy();
    const first = []; await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: jev({ strategy: A('understanding') }, first) });
    expect(first[0].questions.continues).toBeUndefined(); expect(first[0].questions.offer).toBeUndefined(); expect(first[0].questions.scope_religion).toBeTruthy();
  });
  it('"what about in Islam?" -> the previous strategy + a scope patch (conversation, via the layers)', async () => {
    const r = await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: jev({ strategy: A('reference', 0.8), scope_religion: A('Islam'), scope_span: A('conversation'), continues: A('previous') }), conversationState: st, turn: 1 });
    expect(r.strategy).toMatchObject({ choice: 'understanding', was: 'reference', reason: 'continues-previous' });
    expect(r.patch.jev).toEqual({ scope: { religions_specified: ['Islam'] } });
    expect(r.decisions.find((d) => d.point === 'state-patch')).toMatchObject({ by: 'jev' });
    const scope = resolveScope({ turn: r.patch.jev.scope, conversation: { religions_specified: ['Buddhism'] } });
    expect(scope.units).toMatchObject({ religions_specified: ['Islam'], scope_source: 'turn' });
  });
  it('turn-only scope stays out of the stored patch; low confidence = unchanged; accepted offer closes the offers', () => {
    const p = patchFromAnswers({ scope_religion: A('Islam'), scope_span: A('turn') }, { st });
    expect(p.patch).toEqual({}); expect(p.turnOnly).toEqual({ scope: { religions_specified: ['Islam'] } });
    expect(patchFromAnswers({ scope_religion: A('Buddhist') }, { st }).patch).toEqual({ scope: { religions_specified: ['Buddhist'] } });   // Jev's option key is the stored religion
    expect(patchFromAnswers({ scope_religion: A('Islam', 0.3) }, { st }).patch).toEqual({});
    expect(patchFromAnswers({ scope_religion: A('unchanged') }, { st }).patch).toEqual({});
    expect(patchFromAnswers({ offer: A('accepted') }, { st })).toMatchObject({ patch: { offers_drop: 'all' }, offer: 'accepted' });
    expect(patchFromAnswers({ reads_script: A('arabic') }, { st }).patch).toEqual({ reader: { reads_scripts: ['arabic'] } });
    expect(patchFromAnswers({ reads_script: A('none') }, { st }).patch).toEqual({});
    expect(patchQuestions(emptyState(), {}).scope_religion).toBeTruthy(); expect(stateText(emptyState())).toBe('');
  });
});

describe('tree end: code appends', () => {
  it('given (passage/title/record), thread, open on thin, offers with units', () => {
    const units = { current_user_question: 'books on love', religions_specified: ['Buddhism'], found_passages: [{ document_id: 5, paragraph_index: 3, text: 'x' }, { document_id: 9, paragraph_index: null }], found_records: [{ id: 'p1' }, { type: 'work', id: 'w1' }],
      found_outcome: { a: 'thin' }, offers: [{ what: 'email the full list' }] };
    const p = treePatch({ turn: 2, strategy: 'compilation', units, channel: 'site-chat' });
    expect(p.given).toEqual([{ turn: 2, kind: 'passage', ref: '5:3' }, { turn: 2, kind: 'title', ref: '9:' }, { turn: 2, kind: 'record', ref: 'p1' }, { turn: 2, kind: 'title', ref: 'w1' }]);
    expect(p.thread[0]).toMatchObject({ turn: 2, strategy: 'compilation', found_outcome: 'thin' });
    expect(p.open).toEqual(['books on love']);
    expect(p.offers[0]).toMatchObject({ what: 'email the full list', turn: 2, strategy: 'compilation', channel: 'site-chat', units: { religions_specified: ['Buddhism'] } });
    const s = applyPatch(emptyState(), p, { turn: 2 });
    expect(s.given).toHaveLength(4); expect(s.open).toEqual(['books on love']);
    // a later turn that finds it clears the open item
    const q = treePatch({ turn: 3, strategy: 'compilation', units: { current_user_question: 'books on love', found_outcome: { a: 'several' }, found_passages: [{ id: 1, text: 'y' }] }, state: s });
    expect(applyPatch(s, q, { turn: 3 }).open).toEqual([]);
  });
  it('a quoted passage carries into referent for "the second one" style follow-ups', () => {
    const s = applyPatch(emptyState(), treePatch({ turn: 0, strategy: 's', units: { current_user_question: 'q', found_passages: [{ document_id: 1, paragraph_index: 1, text: 't' }] } }), { turn: 0 });
    expect(buildUnits({ state: s }).referent).toEqual([{ turn: 0, kind: 'passage', ref: '1:1' }]);
  });
});

describe('the scope reaches the elements', () => {
  it('"only Buddhism" earlier -> a later list search is scoped to Buddhism and scope_excluded is reported', async () => {
    const state = applyPatch(emptyState(), { scope: { religions_specified: ['Buddhism'] } }, { turn: 0 });
    const units = buildUnits({ question: 'show me all books that discuss love', state, profile: { default_tradition: "Baha'i" } });
    expect(units).toMatchObject({ scope_source: 'conversation' });
    const hits = [{ id: 1, text: 'a', religion: 'Buddhism', score: 0.9 }, { id: 2, text: 'b', religion: 'Islam', score: 0.9 }, { id: 3, text: 'c', religion: "Baha'i", score: 0.9 }];
    const s = { node: 'n', question: 'q', units, tools: { fused_search: async () => ({ passages: hits }) }, ctx: {} };
    const edge = await ELEMENTS['search.shelf'].run(s, {});
    expect(edge).toBe('one');
    expect(s.units.found_passages.map((p) => p.id)).toEqual([1]);
    expect(s.units.scope_excluded).toBe(2);
  });
});

describe('the turn: state loaded, scope resolved, patches stored, trace', () => {
  it('loads the state, passes scope to respond, appends the jev and code patches, records path.state', async () => {
    const calls = { append: [], respond: [], close: [], strategyArgs: null };
    const before = applyPatch(emptyState(), { scope: { religions_specified: ['Buddhism'] }, thread: [{ turn: 0, strategy: 'understanding', topic: 'x' }] }, { turn: 0 });
    const deps = {
      open: async () => ({ conversationId: 'conv_1', round: 1 }), close: async (a) => { calls.close.push(a); }, fail: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' } }),
      respond: async (a) => { calls.respond.push(a); return { reply: 'ok', citations: [{ document_id: 7, paragraph_index: 2, text: 't' }], retrieved: [], plan: { shape: 'understanding' }, timings: {} }; },
      outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
      strategy: async (_m, o) => { calls.strategyArgs = o; return { strategy: { choice: 'understanding' }, sides: [], decisions: [], patch: { jev: { scope: { religions_specified: ['Islam'] } }, turnOnly: null } }; },
      state: { load: async () => before, append: async (a) => { calls.append.push(a); } },
    };
    const r = await anisTurn({ messages: [{ role: 'user', content: 'what about in Islam?' }], participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    expect(calls.strategyArgs.conversationState).toBe(before); expect(calls.strategyArgs.turn).toBe(1);
    expect(calls.respond[0].direction.scope).toMatchObject({ religion: 'Islam', source: 'turn' });
    expect(calls.append.map((a) => a.by)).toEqual(['jev', 'code']);
    expect(calls.append[1].patch.given).toEqual([{ turn: 1, kind: 'passage', ref: '7:2' }]);
    expect(calls.close[0].path.state).toMatchObject({ version: 1, scope_source: 'turn', jev: { scope: { religions_specified: ['Islam'] } } });
    expect(r.status).toBe('answered');
  });
  it('no stored state (an old conversation) still works: empty state, site default scope', async () => {
    const calls = { respond: [] };
    const deps = { open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' } }),
      respond: async (a) => { calls.respond.push(a); return { reply: 'ok', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; }, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    await anisTurn({ messages: [{ role: 'user', content: 'hello there friend' }], participant: { id: 's' }, clientKey: 's', onEvent: () => {}, profile: { default_tradition: "Baha'i" }, deps });
    expect(calls.respond[0].direction.scope).toMatchObject({ religion: "Baha'i", source: 'site' });
  });
});

describe('migration', () => {
  it('198 creates anis_state_patches and CURRENT_VERSION covers it', () => { expect(typeof migrations[198]).toBe('function'); expect(CURRENT_VERSION).toBeGreaterThanOrEqual(198); });
});
