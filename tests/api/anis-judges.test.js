// judge.holds / judge.timeline / fill.term_script: the model steps the tools no longer hold. Fake models, fixtures only.
import { describe, it, expect, beforeEach } from 'vitest';
import { judgeHolds, judgeTimeline, termScript, _resetTermMemo } from '../../api/lib/assistant/judges.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';
const Q = 'The earth is but one country, and mankind its citizens';
const cand = (i, text, x = {}) => ({ id: i, text, title: `W${i}`, language: 'en', role: 'candidate', score: 0.3, ...x });
describe('judgeHolds', () => {
  it('wording holds without a model; the span is exact', async () => {
    const r = await judgeHolds({ quotation: Q, passages: [cand(1, `${Q}.`, { score: 1, role: 'source' })], decide: () => { throw new Error('no model'); } });
    expect(r.asked).toBe(0); expect(r.passages[0].verdict).toBe('holds'); expect(r.passages[0].span.length).toBe(1);
  });
  it('one call over all unsettled candidates: holds / partial / no; candidate promoted to source; no drops', async () => {
    let calls = 0;
    const decide = async (_t, _s, qs) => { calls++; expect(Object.keys(qs).length).toBe(3); return { answers: { p1: { noul: 0.9 }, p2: { noul: 0.3 }, p3: { noul: 0.05 } } }; };
    const r = await judgeHolds({ quotation: Q, passages: [cand(1, 'Earth is one land, all humanity its people.'), cand(2, 'Something close.'), cand(3, 'Unrelated.')], decide });
    expect(calls).toBe(1); expect(r.passages.map((p) => [p.id, p.verdict, p.role])).toEqual([[1, 'holds', 'source'], [2, 'partial', 'near']]);
  });
  it('no decision available: only wording-level candidates survive', async () => {
    const r = await judgeHolds({ quotation: Q, passages: [cand(1, 'Earth is one land.', { score: 0.1 })], decide: async () => null });
    expect(r.passages).toEqual([]); expect(r.judged).toBe(false);
  });
  it('the tool’s own finds (source, original, cited_by) pass through', async () => {
    const r = await judgeHolds({ quotation: Q, passages: [{ id: 1, text: 'x', role: 'cited_by', score: 0 }, { id: 2, text: 'لوح', role: 'original', language: 'ar' }] });
    expect(r.passages.length).toBe(2);
  });
});
describe('judgeTimeline', () => {
  const people = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, evidence: [{ statement: 'met the Báb', proof: 'he met the Báb in Shiraz' }] }));
  it('chunks of 12 in parallel; keeps matches with the clause', async () => {
    let calls = 0;
    const complete = async (m) => { calls++; const ids = [...m[1].content.matchAll(/^(\d+)\|/gm)].map((x) => Number(x[1])); return { content: JSON.stringify({ lead: 'They met Him.', matches: ids.filter((i) => i % 5 === 0).map((id) => ({ id, clause: 'met the Báb in Shiraz' })) }) }; };
    const r = await judgeTimeline({ query: 'who met the Báb', people, complete });
    expect(calls).toBe(3); expect(r.judged).toBe(true); expect(r.people.map((p) => p.id)).toEqual([5, 10, 15, 20, 25]); expect(r.people[0].clause).toBe('met the Báb in Shiraz'); expect(r.lead).toBe('They met Him.');
  });
  it('model down: people untouched, judged:false (fail open, flagged)', async () => {
    const r = await judgeTimeline({ query: 'q', people, complete: async () => { throw new Error('down'); } });
    expect(r.judged).toBe(false); expect(r.people.length).toBe(25);
  });
});
describe('termScript', () => {
  beforeEach(_resetTermMemo);
  it('Arabic script is itself; a Latin term asks once, then the memo answers', async () => {
    expect(await termScript('كلمة')).toEqual({ term_arabic: 'كلمة', via: 'script' });
    let n = 0; const complete = async () => { n++; return { content: 'كلمة' }; };
    const a = await termScript('Kalimih', { complete }), b = await termScript('kalimih', { complete });
    expect(a?.via).toBe('model'); expect(b?.via).toBe('memo'); expect(n).toBe(1);
  });
});
describe('elements', () => {
  const st = (units, judges, extra = {}) => ({ node: 'n', question: 'q', tools: {}, units, ctx: {}, templates: {}, judges, ...extra });
  it('judge.holds: edge from the verdicts; none with no candidates', async () => {
    const u = { found_passages: [{ id: 1 }], quoted_words: Q }; const s = st(u, { holds: async ({ passages }) => ({ passages: passages.map((p) => ({ ...p, verdict: 'holds' })), asked: 1, judged: true }) });
    expect(await ELEMENTS['judge.holds'].run(s, {})).toBe('holds');
    expect(await ELEMENTS['judge.holds'].run(st({ found_passages: [], quoted_words: Q }, {}), {})).toBe('none');
  });
  it('judge.timeline: matched / unjudged', async () => {
    const mkU = () => ({ found_records: [{ id: 1, evidence: [{}] }], current_user_question: 'q' });
    expect(await ELEMENTS['judge.timeline'].run(st(mkU(), { timeline: async ({ people }) => ({ people, judged: true }) }), {})).toBe('matched');
    expect(await ELEMENTS['judge.timeline'].run(st(mkU(), { timeline: async () => ({ people: [], judged: false }) }), {})).toBe('unjudged');
  });
  it('fill.term_script writes term_arabic', async () => {
    const u = { term: 'Kalimih' }; expect(await ELEMENTS['fill.term_script'].run(st(u, { termScript: async () => ({ term_arabic: 'كلمة', via: 'model' }) }), {})).toBe('filled'); expect(u.term_arabic).toBe('كلمة');
  });
});
