// Param/template CONTRACT of the strategy elements: bad values rejected at save with a reason, a throwing element routes to its error edge, repaired rows pass.
import { describe, it, expect, vi } from 'vitest';
import { paramProblems, templateProblems, repairParams, repairTemplate, RANK_BY } from '../../api/lib/assistant/activities/contract.js';
import { compileGraph, runGraph } from '../../api/lib/assistant/activities/graph.js';
import { validateCandidate } from '../../api/lib/assistant/strategy-design.js';
import { activities } from '../../api/lib/assistant/activities/index.js';
import { catalog, openStrategiesDb, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, saveCandidate, contractProblems, fixStrategySlots, strategyRow } from '../../api/lib/repos/strategy-candidates-repo.js';

describe('paramProblems', () => {
  it.each([
    ['search.shelf', { thin_below: 3 }, /thin_below/], ['search.shelf', { thin_below: 0 }, /thin_below/], ['search.shelf', { authority: 'authoritative' }, /authority/],
    ['shape', { shared: ['x.how'] }, /shared.*ONE/], ['search.shelf', { tradition: '{{religions_specified}}' }, /tradition/], ['search.shelf', { tiers: true }, /tiers/],
    ['search.shelf', { layers: 'history' }, /layers/], ['rank', { by: 'relevance' }, /rank by/], ['rank', { per: 4 }, /per/], ['search.shelf', { doctrinal: 'yes' }, /true or false/],
    ['search.shelf', { query: '{topic} origin' }, /\{topic\}/], ['search.web', { query: '{{definition}}' }, /not a unit/],
    ['search.together', { list: [{ element: 'search.shelf', query: 'q', k: 5 }] }, /inside "params"/],
  ])('%s %j is rejected', (act, params, re) => { expect(paramProblems(act, params).join('|')).toMatch(re); });
  it('good values pass', () => {
    expect(paramProblems('search.shelf', { thin_below: 0.3, authority: ['scripture', 'guardian'], tradition: 'Christian', layers: ['literal'], doctrinal: true, k: { default: 5, many: 3 }, query: '{{topic}} {{follows_topic}}' })).toEqual([]);
    expect(paramProblems('rank', { by: ['authority', 'date'], per: 'side', k: 3 })).toEqual([]);
    expect(paramProblems('search.together', { list: [{ element: 'search.web', params: { query: '{{topic}}', k: 3 } }] }, { acts: activities() })).toEqual([]);
  });
  it('rank keys are exactly the elements COMPARE keys', async () => {
    const { COMPARE } = await import('../../api/lib/assistant/activities/elements.js');
    expect(Object.keys(COMPARE).sort()).toEqual([...RANK_BY].sort());
  });
});
describe('templateProblems / repairTemplate', () => {
  it('single braces, unknown slots and a shared template without {{base}} are reported', () => {
    const m = templateProblems('Say {claim} about {topic} {{nope}}', { shared: true }).join('|');
    expect(m).toMatch(/\[claim\]/); expect(m).toMatch(/\{\{topic\}\}/); expect(m).toMatch(/\{\{nope\}\}/); expect(m).toMatch(/no \{\{base\}\}/);
    expect(templateProblems('{{base}} {{#voice}}hi {{topic}}{{/voice}}', { shared: true })).toEqual([]);
  });
  it('repair: unit slots doubled, writer placeholders bracketed (never blanked), {{base}} added', () => {
    expect(repairTemplate('Say {claim} on {topic}', { shared: true })).toBe('{{base}}\n\nSay [claim] on {{topic}}');
    expect(repairTemplate('{{base}} ok')).toBe('{{base}} ok');
  });
});
describe('repairParams', () => {
  it('drops ignored/always-wrong values, fixes the shapes', () => {
    expect(repairParams('search.shelf', { thin_below: 3, authority: 'authoritative', tiers: true, layers: 'history', tradition: '{{religions_specified}}', k: 8 })).toEqual({ k: 8 });
    expect(repairParams('shape', { shared: ['a.how'], template: 'a.t' })).toEqual({ shared: 'a.how', template: 'a.t' });
    expect(repairParams('rank', { by: 'relevance', per: 4, k: 5 })).toEqual({ by: 'score', k: 5 });
    expect(repairParams('search.together', { list: [{ element: 'search.shelf', query: 'q', wide: true, k: 40 }] }).list).toEqual([{ element: 'search.shelf', params: { query: 'q', wide: true, k: 40 } }]);
  });
});
describe('validateCandidate', () => {
  it('rejects a bad param value with a reason the planner sees', () => {
    const c = { name: 'bad_values', description: 'A strategy that has a bad thin_below on purpose to test it.', exemplars: ['a?', 'b?'], templates: [{ id: 'bad_values.how', text: 'Say {claim}' }],
      steps: [{ id: 'bad_values.s', activity: 'search.shelf', params: { thin_below: 3 } }, { id: 'bad_values.w', activity: 'shape', params: { template: 'bad_values.how', shared: ['bad_values.how'] } }],
      graph: { entry: 's', nodes: { s: { step: 'bad_values.s' }, w: { step: 'bad_values.w' } }, edges: [] } };
    const v = validateCandidate(c, { cat: catalog() });
    expect(v.ok).toBe(false);
    expect(v.errors.join('|')).toMatch(/step bad_values\.s: param "thin_below"/); expect(v.errors.join('|')).toMatch(/step bad_values\.w: param "shared"/);
  });
  it('rejects a shared template with no {{base}} and single-brace tokens', () => {
    const c = { name: 'bad_tpl', description: 'A strategy whose shared template drops the base text on purpose.', exemplars: ['a?', 'b?'], templates: [{ id: 'bad_tpl.how', text: 'Method {claim}' }, { id: 'bad_tpl.t', text: '{{base}}' }],
      steps: [{ id: 'bad_tpl.w', activity: 'shape', params: { template: 'bad_tpl.t', shared: 'bad_tpl.how' } }], graph: { entry: 'w', nodes: { w: { step: 'bad_tpl.w' } }, edges: [] } };
    const e = validateCandidate(c, { cat: catalog() }).errors.join('|');
    expect(e).toMatch(/template bad_tpl\.how: .*no \{\{base\}\}/); expect(e).toMatch(/template bad_tpl\.how: has \{claim\}/);
  });
});
describe('runGraph: an element that throws', () => {
  const acts = (over = {}) => ({
    boom: { run: () => { throw new Error('bad param'); }, edges: ['ok'] }, ok: { run: () => 'done', edges: ['done'] },
    'end.fallback': { run: (s) => { s.fellBack = true; return 'answered'; }, edges: ['answered', 'fail'] }, 'end.unavailable': { run: (s) => { s.unavailable = true; return 'done'; }, edges: ['done'] }, 'end.absence': { run: () => 'done', edges: ['done'] }, ...over });
  const row = (edges, extra = {}) => ({ id: 't', version: 1, name: 't', graph: { entry: 'a', needs: [], nodes: { a: { step: 'a', step_version: 1 } }, edges, ...extra } });
  const steps = (k) => ({ 'a@1': { activity: 'boom', params: {} } })[k];
  it('goes to the node error edge when it has one, logging a decision', async () => {
    const A = acts({ boom: { run: () => { throw new Error('x'); }, edges: ['ok', 'error'] } });
    const g = compileGraph(row([{ from: 'a', on: 'ok', to: '$end' }, { from: 'a', on: 'error', to: '$end' }]), steps, A);
    const record = vi.fn(), s = { ctx: { decisions: { record } }, trace: [] };
    await runGraph(g, s);
    expect(s.trace[0]).toMatchObject({ node: 'a', edge: 'error' }); expect(record).toHaveBeenCalledWith('graph:error', expect.objectContaining({ by: 'code' }));
  });
  it('a tree with no error edge lands on $fallback; a throwing fallback lands on $unavailable', async () => {
    const A = acts();
    const g = compileGraph(row([{ from: 'a', on: 'ok', to: '$end' }]), steps, A), s = { trace: [] };
    await runGraph(g, s);
    expect(s.fellBack).toBe(true); expect(s.trace.map((t) => t.node)).toEqual(['a', '$fallback']);
    const A2 = acts({ 'end.fallback': { run: () => { throw new Error('agent down'); }, edges: ['answered', 'fail'] } }), s2 = { trace: [] };
    await runGraph(compileGraph(row([{ from: 'a', on: 'ok', to: '$end' }]), steps, A2), s2);
    expect(s2.unavailable).toBe(true);
  });
  it('a one-node executor graph (not a tree) still throws as before', async () => {
    const g = compileGraph({ id: 'e', version: 1, name: 'e', graph: { entry: 'a', nodes: { a: { step: 'a', step_version: 1 } }, edges: [{ from: 'a', on: 'ok', to: '$end' }] } }, steps, acts());
    await expect(runGraph(g, { trace: [] })).rejects.toThrow('bad param');
  });
});
describe('fixStrategySlots repairs the contract classes', () => {
  it('a broken row becomes a candidate that passes the contract (templates repaired too)', () => {
    const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db });
    const steps = [{ id: 'cc.g', version: 1, activity: 'search.shelf', params: { authority: 'authoritative', thin_below: 3, query: '{topic}' } },
      { id: 'cc.s', version: 1, activity: 'shape', params: { template: 'cc.answer', shared: ['cc.how'] } }];
    saveCandidate(db, { strategy: { id: 'cc', name: 'cc', description: 'd', exemplars: [], graph: { entry: 'g', nodes: { g: { step: 'cc.g', step_version: 1 }, s: { step: 'cc.s', step_version: 1 } }, edges: [{ from: 'g', on: '*', to: 's' }] } }, steps,
      templates: [{ id: 'cc.answer', text: 'Say {claim} about {topic}' }, { id: 'cc.how', text: 'Method only' }] });
    db.prepare("UPDATE strategies SET status = 'active' WHERE id = 'cc'").run();
    expect(contractProblems(db, strategyRow(db, 'cc', 1)).length).toBeGreaterThan(3);
    const r = fixStrategySlots(db, 'cc', { version: 1 });
    expect(r).toMatchObject({ saved: true, activatable: true, problems: [] }); expect(r.templates.sort()).toEqual(['cc.answer', 'cc.how']);
    expect(db.prepare("SELECT text FROM templates WHERE id = 'cc.how' ORDER BY version DESC LIMIT 1").get().text).toBe('{{base}}\n\nMethod only');
  });
});
