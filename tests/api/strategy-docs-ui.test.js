// /docs/response-strategies presentation copy: the mode copy must match channels.js (drift fails), titles/taglines, step list from a graph.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHANNELS, DEPTH_FRAME, supports } from '../../api/lib/assistant/channels.js';
import { MODES, MODE_NOTES, titleOf, taglineOf, strategyOrder, treeBadge, orderedSteps, humanStep, outcomeOf, targetsOf } from '../../src/lib/strategy-docs.js';

describe('mode copy matches channels.js', () => {
  it('chat word counts and frames', () => {
    expect(CHANNELS['widget-chat'].frame).toContain(`about ${MODES.chat.widgetWords} words`);
    expect(CHANNELS['site-chat'].frame).toContain(`about ${MODES.chat.siteWords} words`);
    expect(DEPTH_FRAME).toContain(MODES.chat.deepWords);
    expect(MODES.chat.lines.join(' ')).toContain(`${MODES.chat.widgetWords} words`);
    expect(MODES.chat.lines.join(' ')).toContain(MODES.chat.siteWords);
    expect(MODES.chat.lines.join(' ')).toContain(MODES.chat.deepWords);
    expect(supports(CHANNELS['site-chat'], ['tables', 'headings'])).toBe(true);
    expect(CHANNELS['widget-chat'].progress && CHANNELS['site-chat'].progress).toBe(true);
  });
  it('email letter length, bilingual table, no progress', () => {
    expect(CHANNELS.email.frame).toContain(`up to about ${MODES.email.emailWords} words`);
    expect(MODES.email.lines.join(' ')).toContain(`${MODES.email.emailWords} words`);
    expect(CHANNELS.email.frame).toContain('bilingual');
    expect(CHANNELS.email.progress).toBeFalsy();
  });
  it('audio is "not yet" only while no voice channel exists', () => {
    expect(MODES.audio.live).toBe(false);
    expect(Object.keys(CHANNELS).filter((k) => /voice|audio|speech/i.test(k))).toEqual([]);
  });
  it('compilation is the only per-strategy note, and the code does it', () => {
    expect(Object.keys(MODE_NOTES)).toEqual(['compilation']);
    expect(supports(CHANNELS['widget-chat'], ['headings'])).toBe(false);
  });
});

describe('titles, groups, steps', () => {
  it('titles and taglines come from the row, not a hard-coded list', () => {
    expect(titleOf({ name: 'quote_trace' })).toBe('Quote trace');
    expect(titleOf({ name: 'Find a book' })).toBe('Find a book');
    expect(taglineOf({ name: 'prayer', status: 'built', description: 'wants a PRAYER to say — for an occasion' })).toEqual({ text: 'wants a PRAYER to say', quote: false });
    expect(taglineOf({ name: 'A fact', description: '', patterns: [{ sounds_like: ['When was the Báb born?'] }] })).toEqual({ text: '“When was the Báb born?”', quote: true });
    expect(taglineOf({ name: 'x', status: 'built', description: 'a'.repeat(300) }).text.length).toBeLessThanOrEqual(140);
  });
  it('tree badge: newest status, active version beside it when they differ', () => {
    expect(treeBadge({ version: 1, newest: { version: 6, status: 'candidate' } })).toEqual({ status: 'candidate', text: 'candidate v6 · active v1' });
    expect(treeBadge({ version: 3, newest: { version: 3, status: 'active' } }).text).toBe('active v3');
    expect(treeBadge({ version: null, newest: { version: 2, status: 'retired' } }).text).toBe('retired v2 · none active');
    expect(treeBadge({ newest: null })).toBe(null);
  });
  it('a strategy IS a tree: no live/planned groups; rows with no tree are not listed', () => {
    const rows = [{ id: 'u', general: true }, { id: 'p', newest: { version: 2 } }, { id: 'a1' }];
    expect(strategyOrder(rows).map((s) => s.id)).toEqual(['p', 'u']);
  });
  it('step list: flow order, readable labels, exits', () => {
    expect(humanStep('respond.read_question')).toBe('Read question');
    const g = { entry: 'a', nodes: [{ id: 'a', activity: 'respond.fast', step: 's', step_version: 1, kind: 'decision', cls: 'code' }, { id: 'b', activity: 'respond.agent', step: 's', step_version: 1, kind: 'tool', cls: 'llm' }],
      edges: [{ from: 'a', on: '*', to: 'b' }, { from: 'b', on: 'answered', to: '$end' }] };
    const st = orderedSteps(g);
    expect(st.map((s) => [s.n, s.label, s.kind])).toEqual([[1, 'Fast', 'code'], [2, 'Agent', 'LLM']]);
    expect(st[0].exits).toEqual([{ on: 'then', end: false, to: 2, toLabel: 'Agent' }]);
    expect(st[1].exits[0]).toMatchObject({ on: 'answered', end: true });
  });
  it('outcomes use the replay reasons verbatim', () => {
    expect(outcomeOf({ status: 'candidate', replay: { failed: ['mean score 5.08 vs 4.83: not better by 0.5'] } })).toBe('mean score 5.08 vs 4.83: not better by 0.5');
    expect(outcomeOf({ status: 'active' })).toBe('promoted');
    expect(targetsOf('A1 + E2')).toEqual(['A1', 'E2']);
  });
});

describe('page keeps its live keys and the narrow width is gone', () => {
  const page = readFileSync(new URL('../../src/pages/docs/response-strategies.astro', import.meta.url), 'utf8');
  it('data-live keys', () => {
    for (const k of ['s.${s.id}.p50_ms', 's.${s.id}.score', 's.${s.id}.${k}', 'b.${s.id}.${b.hash}.share', 'c.${s.id}.${c.version}.score', 'a.${a.name}.runs']) expect(page).toContain(k);
    for (const k of ['turns', 'share', 'p50_ms', 'p95_ms', 'score', 'n_scored', 'weak_pct', 'usd_per_turn']) expect(page).toContain(`'${k}'`);
  });
  it('lists no strategy by id or name', () => {
    expect(page).not.toMatch(/'(comparison|understanding|prayer|guidance|reference|compilation)'/);
    expect(page).not.toContain('strategy-respond');
  });
  it('docs width', () => {
    expect(readFileSync(new URL('../../src/layouts/DocsLayout.astro', import.meta.url), 'utf8')).toMatch(/\.article \{[^}]*max-width: 90rem/);
  });
});
