// One authority model per tradition (11-09): non-Bahá'í passages get a kind, filters keep them, compilation orders by the tradition's own canon,
// originals stay Bahá'í-only (honest absence), Jain is offered. Mocked — no network, no DB.
import { describe, it, expect } from 'vitest';
import { doctrinalTier } from '../../api/lib/authority.js';
import { authorityModel, authorityOrder, traditionKind, standingOf } from '../../api/lib/assistant/tradition-authority.js';
import { authorityKind } from '../../api/lib/assistant/tool-kit.js';
import { toolRunner } from '../../api/lib/assistant/researcher.js';
import { compilation } from '../../api/lib/assistant/strategies.js';
import { TRADITIONS } from '../../api/lib/scope-extract.js';
import { RELIGIONS } from '../../api/lib/assistant/tradition-name.js';
import { sourceTier } from '../../api/lib/assistant/source-tier.js';
import { HOUSE_STYLE } from '../../api/lib/assistant/prompt.js';
import { doctrinalTierDocsJob } from '../../api/lib/ops/doctrinal-tier-docs-job.js';

const BIBLE = { id: 11, document_id: 11, paragraph_index: 0, title: 'Matthew', author: 'Matthew', religion: 'Christianity', collection: 'Bible', text: 'render unto Caesar' };
const P = (i, religion, title, author = '', collection = '') => ({ id: i, document_id: 100 + i, paragraph_index: i, text: `passage ${i}`, religion, title, author, collection });
const msgs = [{ role: 'user', content: 'compile on compassion' }];

describe('doctrinalTier: every tradition\'s scripture is core', () => {
  it.each([
    [{ religion: 'Hindu', title: 'Chandogya Upanishad' }, 'core'],
    [{ religion: 'Sikh', title: 'Sri Guru Granth Sahib' }, 'core'],
    [{ religion: 'Islam', title: 'The Noble Quran' }, 'core'],
    [{ religion: 'Christian', title: 'The New Testament (RSV)' }, 'core'],
    [{ religion: 'Zoroastrian', title: 'Avesta' }, 'core'],
    [{ religion: 'Tao', title: 'I Ching' }, 'core'],
    [{ religion: 'Judaism', title: 'Tanakh' }, 'core'],
    [{ religion: 'Jain', title: 'Agamas' }, 'core'],
    [{ religion: 'Buddhist', title: 'Dhammapada' }, 'core'],
  ])('%j', (d, tier) => expect(doctrinalTier(d)).toBe(tier));
  it('a book ABOUT a scripture is not scripture', () => expect(doctrinalTier({ religion: 'Hindu', title: 'A Commentary on the Upanishads' })).not.toBe('core'));
});

describe('kinds for non-Bahá\'í passages', () => {
  it('a Bible passage is scripture; a Bahá\'í passage keeps its source-tier kind', () => {
    expect(sourceTier(BIBLE)).toBeNull();
    expect(traditionKind(BIBLE)).toBe('scripture');
    expect(authorityKind(BIBLE)).toBe('scripture');
    expect(standingOf(BIBLE)).toBe('writings');
    expect(authorityKind(P(1, "Baha'i", 'Gleanings from the Writings of Bahá’u’lláh', 'Bahá’u’lláh', 'Core Tablets'))).toBe('scripture');
    expect(authorityKind({ title: 'x' })).toBeNull();   // truly unknown stays null
  });
  it('a Bible passage survives an authority:[scripture] filter', async () => {
    const { run } = toolRunner({ search: async () => [BIBLE], originals: async () => [] });
    expect(await run.combined_search({ query: 'tribute', tradition: 'Christianity', authority: ['scripture'] })).toMatch(/render unto Caesar/);
  });
});

describe('traditions list', () => {
  it('Jain is offered, and every tradition the library names (bar Other) has a description', () => {
    expect(TRADITIONS.Jain).toMatch(/Agamas/);
    for (const r of RELIGIONS.filter((x) => x !== 'Other')) expect(TRADITIONS[r], r).toBeTruthy();
  });
});

describe('authority order per tradition', () => {
  it('Bahá\'í order unchanged: Writings, then Shoghi Effendi, then pilgrims\' notes, House has no doctrinal weight', () => {
    const o = authorityOrder("Baha'i");
    expect(o.indexOf('Writings')).toBeLessThan(o.indexOf('Shoghi Effendi'));
    expect(o.indexOf('Shoghi Effendi')).toBeLessThan(o.indexOf('pilgrims'));
    expect(o).toMatch(/never doctrinal/);
  });
  it('Buddhist order names sutras first and never Shoghi Effendi; unknown tradition gets the generic order', () => {
    expect(authorityModel('Buddhism')[0]).toMatch(/suttas|sutras/);
    expect(authorityOrder('Buddhism')).not.toMatch(/Shoghi/);
    expect(authorityOrder(null)).toMatch(/own scripture/);
  });
  it('HOUSE_STYLE scopes the Bahá\'í ladder to Bahá\'í answers', () => {
    expect(HOUSE_STYLE).toMatch(/AUTHORITY IN EVERY OTHER TRADITION/);
  });
  it('a Buddhist compilation ranks sutras before commentary and its brief never names Shoghi Effendi', async () => {
    const study = (i) => P(i, 'Buddhist', 'A Modern Study of Zen', 'Some Scholar', 'Books');
    const sutra = (i) => P(i, 'Buddhist', 'Dhammapada', 'The Buddha', 'Pali Canon');
    const search = async () => ({ passages: [study(1), study(2), sutra(3), sutra(4), sutra(5), sutra(6)] });
    const out = await compilation({}, { messages: msgs, query: 'compassion', distil: () => 'compassion', search, plan: { filters: { religion: 'Buddhist' } } });
    expect(out.passages.slice(0, 4).every((p) => p.title === 'Dhammapada')).toBe(true);
    expect(out.passages.map((p) => p.document_id)).not.toContain(101);   // doctrinal by default: the study is left out
    expect(out.format.how).toMatch(/sutras|suttas/);
    expect(out.format.how).not.toMatch(/Shoghi/);
  });
});

describe('originals are Bahá\'í only — honest absence, never a swapped tradition', () => {
  it('a Hindu originals_search finds nothing, says why, and never asks the originals index', async () => {
    let n = 0;
    const { run } = toolRunner({ search: async () => [], originals: async () => { n++; return [{ id: 1, language: 'fa', text: 'x' }]; } });
    const out = await run.originals_search({ query: 'karma', tradition: 'Hindu' });
    expect(n).toBe(0);
    expect(out).toMatch(/Bahá|Baha/);
  });
});

describe('doctrinal-tier-docs report', () => {
  it('counts docs per religion × tier with title samples, skipping Bahá\'í unless asked', async () => {
    const rows = [{ id: 1, title: 'Chandogya Upanishad', religion: 'Hindu' }, { id: 2, title: 'A Commentary on the Upanishads', religion: 'Hindu' }, { id: 3, title: 'Gleanings', religion: "Baha'i" }];
    let calls = 0;
    const docs = async () => ({ docs: calls++ ? [] : rows });
    const r = await doctrinalTierDocsJob({}, { docs });
    expect(r.scanned).toBe(3);
    expect(Object.keys(r.religions)).toEqual(['Hindu']);
    expect(r.religions.Hindu.core.docs).toBe(1);
    expect(r.religions.Hindu.core.sample[0]).toMatch(/Chandogya/);
  });
});
