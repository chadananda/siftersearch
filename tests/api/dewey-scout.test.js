// Dewey's scouts (planning/dewey-scouts-plan.md): the RIS seed, and each outcome for a work — held, a copy offered, a lead
// readable elsewhere, to buy — with every channel logged, shadow libraries never used.
import { describe, it, expect, vi } from 'vitest';
import { parseRis } from '../../api/lib/dewey/scout/ris.js';
import { isShadow } from '../../api/lib/dewey/scout/channels.js';
import { scoutWork, scoutList } from '../../api/lib/dewey/scout/scout.js';

const RIS = `TY  - GEN\nID  - 3956\nUR  - https://bahai-library.com/ali-khan_pilgrim-notes_1906\nT1  - 1906 Pilgrim Notes of Ali Kuli Khan\nA1  - Khan,Ali Kuli\nA2  - Merrick,David, editor\nY1  - 2010\nY2  - 1906\nM3  - Pilgrims; Histories; \nLA  - English\nAB  - Large volume of the words of 'Abdu'l-Bahá.\nKW  - 1906\nKW  - Pilgrims notes\nER  - \n\nTY  - UNPB\nT1  - No URL here\nER  - \n`;

describe('RIS', () => {
  it('parses bahai-library entries, names first-name first; entries without a URL are dropped', () => {
    const w = parseRis(RIS);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ id: '3956', title: '1906 Pilgrim Notes of Ali Kuli Khan', authors: ['Ali Kuli Khan'], editors: ['David Merrick'], year: '2010', written: '1906', kinds: ['Pilgrims', 'Histories'], keywords: ['1906', 'Pilgrims notes'] });
  });
});

describe('shadow libraries', () => {
  it('are never used', () => {
    for (const u of ['https://libgen.is/book/1', 'https://annas-archive.org/md5/x', 'https://z-lib.io/b', 'https://sci-hub.se/x', 'https://www.pdfdrive.com/x']) expect(isShadow(u)).toBe(true);
    for (const u of ['https://archive.org/details/x', 'https://bahai-library.com/x', 'https://www.academia.edu/123']) expect(isShadow(u)).toBe(false);
  });
});

const work = { title: 'Resurrection and Renewal', author: 'Abbas Amanat', importance: 5, kind: 'book', list: 'bahai-publications' };
const mk = () => {
  const created = [];
  return { created, deps: {
    create: vi.fn(async (x) => { created.push(x); return { id: created.length, ...x }; }), update: vi.fn(async () => ({})), politeMs: 0,
    check: vi.fn(async () => ({ verdict: 'not-found-by-title' })), appraise: vi.fn(async () => ({ title: 'Resurrection and Renewal', kind: 'book', shelf: null })),
    archive: vi.fn(async () => ({ path: '/arc/x.pdf', sha256: 'abc' })), purchase: vi.fn(async () => ({ text: 'AbeBooks $40' })),
    get: vi.fn(async () => '/tmp/none-such.pdf'), research: async () => null, pdfPages: async () => null,
  } };
};

describe('scoutWork', () => {
  it('held by title → recorded, nothing searched', async () => {
    const { created, deps } = mk();
    deps.check = vi.fn(async () => ({ verdict: 'held', candidates: [{ id: 7, title: 'Resurrection and Renewal' }] }));
    const ch = { 'archive.org': vi.fn() };
    expect(await scoutWork(work, { ...deps, channels: ch })).toMatchObject({ state: 'held', held: 7 });
    expect(ch['archive.org']).not.toHaveBeenCalled();
    expect(created[0].state).toBe('declined');
  });
  it('a copy found → downloaded, its text checked, offered with where it came from', async () => {
    const { created, deps } = mk();
    const channels = { 'archive.org': vi.fn(async () => [{ url: 'https://archive.org/download/rr/rr_text.pdf', kind: 'pdf', site: 'archive.org', title: work.title }]), web: vi.fn(async () => []) };
    deps.checkFile = vi.fn(async () => ({ identified: { _text: 'word '.repeat(5000) }, excerpt: 'x', result: { verdict: 'not-held' } }));
    const r = await scoutWork(work, { ...deps, channels });
    expect(r).toMatchObject({ state: 'offered', from: 'https://archive.org/download/rr/rr_text.pdf' });
    expect(created[0]).toMatchObject({ state: 'offered', by: 'dewey-scout' });
    expect(created[0].identified.scout.channels).toEqual([{ channel: 'archive.org', searched: true, found: 1 }, { channel: 'web', searched: true, found: 0 }]);
    expect(deps.update).toHaveBeenCalledWith(1, expect.objectContaining({ source_url: 'https://archive.org/download/rr/rr_text.pdf', original_path: '/arc/x.pdf' }));
  });
  it('a copy whose TEXT is a held book under another title → not offered', async () => {
    const { created, deps } = mk();
    const channels = { web: vi.fn(async () => [{ url: 'https://example.org/rr.pdf', kind: 'pdf', site: 'example.org', title: work.title }]) };
    deps.checkFile = vi.fn(async () => ({ identified: { _text: 'word '.repeat(5000) }, result: { verdict: 'held', candidates: [{ id: 9, title: 'The Babi Movement' }] } }));
    expect(await scoutWork(work, { ...deps, channels })).toMatchObject({ state: 'held-by-text', held: 9 });
    expect(created[0].state).toBe('declined');
  });
  it('borrow-only → a lead; nothing anywhere → to buy, with every channel logged and prices', async () => {
    const a = mk();
    expect(await scoutWork(work, { ...a.deps, channels: { 'archive.org': async () => [{ url: 'https://archive.org/details/rr', kind: 'borrow', site: 'archive.org' }] } })).toMatchObject({ state: 'lead' });
    const b = mk();
    expect(await scoutWork(work, { ...b.deps, channels: { 'archive.org': async () => [], web: async () => [] } })).toMatchObject({ state: 'to-buy' });
    expect(b.created[0].identified).toMatchObject({ purchase: { text: 'AbeBooks $40' }, scout: { channels: [{ channel: 'archive.org', searched: true, found: 0 }, { channel: 'web', searched: true, found: 0 }] } });
  });
  it('a shadow-library hit is dropped even if a channel returns it', async () => {
    const { deps } = mk();
    const r = await scoutWork(work, { ...deps, channels: { web: async () => [{ url: 'https://libgen.is/x.pdf', kind: 'pdf', site: 'libgen.is' }] } });
    expect(r.state).toBe('to-buy');
    expect(deps.get).not.toHaveBeenCalled();
  });
});

describe('scoutList', () => {
  it('a work handled before (by title or page) is skipped; limit respected', async () => {
    const { deps } = mk();
    const works = [{ ...work, title: 'Already Seen' }, { ...work, title: 'New One', page: null }, { ...work, title: 'Another' }];
    const r = await scoutList(works, { limit: 1, deps: { ...deps, channels: { web: async () => [] }, items: async () => [{ title: 'Already Seen', identified: {} }] } });
    expect(r.outcomes.map((o) => o.title)).toEqual(['New One']);
  });
});

import { pulsePlan, autoAddRule, BAHAI_LIBRARY_ORDER } from '../../api/lib/ops/dewey-scout-job.js';
describe('daily pulse', () => {
  it('once a day: bahai-library (pilgrim notes first), Bahá\'í publications, the next tradition', () => {
    const a = pulsePlan({}, { today: '2026-10-19' });
    expect(a.runs.map((r) => [r.list, r.collections?.[0] || r.religion || null])).toEqual([['bahai-library', 'Pilgrims'], ['bahai-publications', null], ['core-books', 'Christian']]);
    expect(pulsePlan(a.state, { today: '2026-10-19' }).runs).toEqual([]);
    const b = pulsePlan(a.state, { today: '2026-10-20', lastBahaiResult: { remaining: 0 } });
    expect(b.runs[0].collections).toEqual([BAHAI_LIBRARY_ORDER[1]]);
    expect(b.runs[2].religion).toBe('Islam');
    expect(pulsePlan(b.state, { today: '2026-10-21', lastBahaiResult: { remaining: 40 } }).runs[0].collections).toEqual([BAHAI_LIBRARY_ORDER[1]]);
  });
  it('adds only important, not-held, in-scope, recommended finds, up to the day\'s cap', () => {
    const ok = { result: { verdict: 'not-held' } }, a = { in_scope: 'yes', recommendation: 'add' };
    const rule = autoAddRule({ cap: 2, addedToday: 1 });
    expect(rule({ importance: 3 }, a, ok)).toBe(false);
    expect(rule({ importance: 5 }, { ...a, in_scope: 'maybe' }, ok)).toBe(false);
    expect(rule({ importance: 5 }, a, { result: { verdict: 'possible' } })).toBe(false);
    expect(rule({ importance: 5 }, a, ok)).toBe(true);
    expect(rule({ importance: 5 }, a, ok)).toBe(false);   // cap reached
  });
});

import { sameWork } from '../../api/lib/dewey/scout/channels.js';
describe('sameWork (10-19: two wrong works were imported on a loose title match)', () => {
  it('the found main title must be the asked one, give or take a few words', () => {
    expect(sameWork("Apostles' Creed", "The Plain Man's Guide to the True Church, or an Exposition of the Apostles' Creed")).toBe(false);
    expect(sameWork('Septuaginta', 'Septuaginta-Studien, 1. Heft')).toBe(false);
    expect(sameWork('Septuaginta', 'Septuaginta: id est Vetus Testamentum graece')).toBe(true);
    expect(sameWork('Institutes of the Christian Religion', 'Institutes of the Christian Religion (Vol. 1 of 2)')).toBe(true);
    expect(sameWork('The Rule of Saint Benedict', 'The Rule of St. Benedict')).toBe(true);
    expect(sameWork('Resurrection and Renewal', 'Resurrection And Renewal: The Making of the Babi Movement')).toBe(true);
  });
});
describe('sameWork — a work about a work is not the work', () => {
  it('the found title begins with the asked one', () => {
    expect(sameWork('Summa Theologiae', 'The Cambridge Companion To The Summa Theologiae')).toBe(false);
    expect(sameWork('Summa Theologiae', 'Fragmenta Manuscripta 072, Summa theologiae')).toBe(false);
    expect(sameWork("Apostles' Creed", 'A commentary on the Apostles\' Creed')).toBe(false);
    expect(sameWork('Confessions', 'The Confessions of Saint Augustine')).toBe(true);
  });
});
describe('held by the main title (10-19: The Dawn-Breakers scouted as a lead)', () => {
  it('a long subtitle on the list does not hide a held work', async () => {
    const { deps } = mk();
    deps.check = vi.fn(async (id) => (id.title === 'The Dawn-Breakers' ? { verdict: 'held', candidates: [{ id: 21308, title: 'The Dawn-Breakers' }] } : { verdict: 'not-found-by-title' }));
    const ch = { 'archive.org': vi.fn(async () => []) };
    expect(await scoutWork({ ...work, title: "The Dawn-Breakers: Nabíl's Narrative of the Early Days of the Bahá'í Revelation" }, { ...deps, channels: ch })).toMatchObject({ state: 'held', held: 21308 });
    expect(ch['archive.org']).not.toHaveBeenCalled();
  });
});
describe('a linked Word file keeps its type (10-19: a .docx saved as .html → "not usable text")', () => {
  it('pageCopies names a .docx a docx', async () => {
    const { pageCopies } = await import('../../api/lib/dewey/scout/scout.js');
    const html = '<a href="/docs/s/scatcherd_wise_man_east.docx">Word</a><a href="/pdf/h/haney.pdf">PDF</a>';
    const r = await pageCopies({ page: 'https://bahai-library.com/scatcherd', title: 'x' }, async () => ({ ok: true, text: async () => html }));
    expect(r.map((c) => c.kind)).toEqual(['docx', 'pdf', 'html']);
  });
});
describe('folder-sweep offers (Chad 10-19: "find books we do not have and propose them")', () => {
  it('missing files are offered, held ones and handled ones are not, nothing outside the allowed folders', async () => {
    const { deweyOfferPathsJob } = await import('../../api/lib/ops/dewey-offer-paths-job.js');
    const created = [];
    const deps = { allowed: (p) => p.startsWith('/tank/dropbox/'), find: async (sha) => sha === 'seen', appraise: async () => ({ title: 'A Book', recommendation: 'add', shelf: null }),
      create: async (x) => { created.push(x); return { id: created.length, ...x }; }, update: async () => ({}),
      check: async ({ path }) => (path.endsWith('held.txt') ? { sha256: 'h', result: { verdict: 'held', candidates: [{ id: 7 }] } } : path.endsWith('seen.txt') ? { sha256: 'seen', result: { verdict: 'not-held' } } : { sha256: 'n', identified: { title: 'A Book' }, excerpt: 'x', result: { verdict: 'not-held' } }) };
    const r = await deweyOfferPathsJob({ paths: ['/tank/dropbox/a/new.txt', '/tank/dropbox/a/held.txt', '/tank/dropbox/a/seen.txt', '/etc/passwd'] }, deps);
    expect(r.offered.map((o) => o.path)).toEqual(['/tank/dropbox/a/new.txt']);
    expect(r.incomplete).toEqual([]);
    expect(r.held).toEqual([{ path: '/tank/dropbox/a/held.txt', held: 7 }]);
    expect(r.skipped).toEqual(['/tank/dropbox/a/seen.txt']);
    expect(r.errors[0].path).toBe('/etc/passwd');
    expect(created[0]).toMatchObject({ state: 'offered', by: 'dewey-sweep' });
  });
});

describe('an incomplete copy is passed over (10-19: "do not propose books that are incomplete")', () => {
  it('a contents PDF is not offered; the search goes on to a whole copy', async () => {
    const { created, deps } = mk();
    const channels = { 'archive.org': vi.fn(async () => [{ url: 'https://x.org/book_contents.pdf', kind: 'pdf', site: 'x.org' }, { url: 'https://y.org/book.pdf', kind: 'pdf', site: 'y.org' }]) };
    deps.get = vi.fn(async (c) => `/tmp/${c.url.split('/').pop()}`);
    deps.checkFile = vi.fn(async () => ({ identified: { _text: 'word '.repeat(9000) }, excerpt: 'x', result: { verdict: 'not-held' } }));
    const r = await scoutWork(work, { ...deps, channels });
    expect(r).toMatchObject({ state: 'offered', from: 'https://y.org/book.pdf' });
    expect(created[0].identified.scout.incomplete[0]).toMatchObject({ url: 'https://x.org/book_contents.pdf' });
  });
});

describe('an incomplete copy tells us the work exists (10-19)', () => {
  it('a folder file that is only part of a book goes on the acquire list, never offered', async () => {
    const { deweyOfferPathsJob } = await import('../../api/lib/ops/dewey-offer-paths-job.js');
    const created = [];
    const r = await deweyOfferPathsJob({ paths: ['/tank/dropbox/a/europe_contents.pdf'] }, { allowed: () => true, find: async () => null, update: async () => ({}),
      appraise: async () => ({ title: "'Abdu'l-Bahá in Europe", kind: 'book' }), create: async (x) => { created.push(x); return { id: 9, ...x }; },
      check: async () => ({ sha256: 'e', identified: { _text: 'w '.repeat(4400) }, excerpt: 'x', result: { verdict: 'not-held' } }) });
    expect(r.offered).toEqual([]);
    expect(created[0]).toMatchObject({ state: 'to-buy', title: "'Abdu'l-Bahá in Europe" });
  });
});
