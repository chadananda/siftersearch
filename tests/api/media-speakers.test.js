// Speaker portraits (Chad 10-22): one canonical portrait per person, found on the web (Bahaipedia/bahai.media first, then
// Wikidata/Commons and Wikipedia — Bahá'í-verified, never a namesake or a group photo), credit/licence kept, the master
// stored once and served through the image worker with face-centred crops at every size.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { speakerKey, cleanName, titleMatches, parseInformation, isGroupPhoto, findPortrait, portraitFor } from '../../api/lib/media/speakers.js';
import { ensurePortrait } from '../../api/lib/ops/media-jobs.js';
import { speakerThumb } from '../../api/routes/media.js';
import { picture } from '../../src/lib/media.js';

describe('names and pages', () => {
  it('one key per person, titles and honorifics dropped; roles and surnames alone have none', () => {
    expect(speakerKey('‘Alí Nakhjavání')).toBe('ali-nakhjavani');
    expect(speakerKey('Mr. Hooper Dunbar')).toBe('hooper-dunbar');
    expect(speakerKey('Hooper C. Dunbar')).toBe('hooper-dunbar');
    expect(speakerKey("'Ali Nakhjavani")).toBe('ali-nakhjavani');
    expect(speakerKey('Hand of the Cause Dhikru’lláh Khádem')).toBe('dhikrullah-khadem');
    expect(speakerKey('Grossmann')).toBeNull();
    expect(speakerKey('Interpreter')).toBeNull();
    expect(cleanName('Dr. Elsie Austin')).toBe('Elsie Austin');
  });
  it('a page or file must carry the person\'s names; group photos are refused', () => {
    expect(titleMatches('‘Alí Nakhjavání', 'Ali Nakhjavani')).toBe(true);
    expect(titleMatches('Ali-akbar-furutan.jpg', 'Ali-Akbar Furutan')).toBe(true);
    expect(titleMatches('Violette Nakhjavani', 'Ali Nakhjavani')).toBe(false);
    expect(isGroupPhoto('Ted_and_Alicia_Cardell_with_two_of_their_children,_1960.jpg')).toBe(true);
    expect(isGroupPhoto('Mr._Hooper_Dunbar.png')).toBe(false);
  });
  it('reads credit, source and licence from a bahai.media {{Information}} page', () => {
    const t = "== File info ==\n{{Information\n|Description=Former member of the {{enl|Universal House of Justice}}\n|Source=http://media.bahai.org/x/7693/details\n|Date=''unknown''\n|Author=''unknown''\n|Permission=http://media.bahai.org/terms\n}}\n== Licensing ==\n{{Baha'i media bank}}";
    expect(parseInformation(t)).toEqual({ credit: null, source: 'http://media.bahai.org/x/7693/details', permission: 'http://media.bahai.org/terms', licence: 'Bahá’í Media Bank (media.bahai.org terms)' });
    expect(parseInformation('{{Information\n|Author=[[User:Jane|Jane Doe]]\n}}').credit).toBe('Jane Doe');
  });
});

const wiki = (pages) => vi.fn(async (url) => ({ ok: true, json: async () => {
  if (url.includes('bahaipedia.org') && url.includes('list=search')) return { query: { search: pages.map((p) => ({ title: p.title })) } };
  if (url.includes('bahaipedia.org')) { const p = pages.find((x) => url.includes(encodeURIComponent(x.title))); return { query: { pages: { 1: { title: p.title, fullurl: `https://bahaipedia.org/${p.title}`, pageimage: p.image, original: { source: `https://file.bahai.media/${p.image}`, width: 400, height: 500 } } } } }; }
  if (url.includes('bahai.media')) return { query: { pages: { 1: { imageinfo: [{ descriptionurl: 'https://bahai.media/File:x' }], revisions: [{ slots: { main: { '*': '{{Information\n|Author=Photographer Name\n}}' } } }] } } } };
  return { search: [], query: { search: [], pages: {} } };
} }));

describe('finding a portrait', () => {
  it('Bahaipedia first, the page whose title carries the names, never a group photo', async () => {
    const fetchImpl = wiki([{ title: 'Ted Cardell', image: 'Ted_and_Alicia_Cardell_with_children.jpg' }, { title: 'Hooper Dunbar', image: 'Mr._Hooper_Dunbar.png' }]);
    const r = await findPortrait('Hooper Dunbar', { fetchImpl });
    expect(r).toMatchObject({ origin: 'bahaipedia', url: 'https://file.bahai.media/Mr._Hooper_Dunbar.png', credit: 'Photographer Name', page_url: 'https://bahaipedia.org/Hooper Dunbar' });
    expect(await findPortrait('Ted Cardell', { fetchImpl })).toBeNull();
  });
  it('a hand-found portrait (data/media-speaker-portraits.json) wins', async () => {
    const r = await portraitFor('Darius Shahrokh', { overrides: { 'darius-shahrokh': { url: 'https://x/ds.jpg', page_url: 'https://x/about', credit: 'Family' } }, fetchImpl: vi.fn() });
    expect(r).toMatchObject({ origin: 'web', url: 'https://x/ds.jpg', source_url: 'https://x/about', credit: 'Family' });
  });
});

describe('ensurePortrait', () => {
  const bytes = Buffer.alloc(5000, 7);
  const okFetch = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => bytes }));
  const repoOf = (cur = null) => ({ getSpeaker: vi.fn(async () => cur), upsertSpeaker: vi.fn(async (r) => r), personEntityId: vi.fn(async () => 1234) });
  it('downloads once, stores the master with its hash, credit and the person entity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spk-')), repo = repoOf();
    const speakers = { ...(await import('../../api/lib/media/speakers.js')), portraitFor: vi.fn(async () => ({ url: 'https://file.bahai.media/a.jpg', origin: 'bahaipedia', credit: 'P', licence: 'L', source_url: 's', page_url: 'p' })) };
    const putCdn = vi.fn(async (key) => key);
    const r = await ensurePortrait('‘Alí Nakhjavání', {}, { repo, speakers, fetchImpl: okFetch, dir, overrides: {}, bioManifest: {}, putCdn });
    expect(r.status).toBe('found');
    expect(putCdn.mock.calls[0][0]).toBe('media-speakers/ali-nakhjavani.jpg');
    const row = repo.upsertSpeaker.mock.calls[0][0];
    expect(row).toMatchObject({ key: 'ali-nakhjavani', name: 'Ali Nakhjavani', entity_id: 1234, file: 'media-speakers/ali-nakhjavani.jpg', origin: 'bahaipedia', credit: 'P', licence: 'L', page_url: 'p' });
    expect(row.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(dir, 'ali-nakhjavani.jpg')).length).toBe(5000);
  });
  it('a biography portrait of the same person is reused before any web search', async () => {
    const repo = repoOf();
    const speakers = { ...(await import('../../api/lib/media/speakers.js')), portraitFor: vi.fn() };
    const r = await ensurePortrait('Martha Root', {}, { repo, speakers, overrides: {}, bioManifest: { 1234: { cdn: 'biography/1234.png', license: 'PD' } } });
    expect(r).toMatchObject({ status: 'found', origin: 'biography' });
    expect(repo.upsertSpeaker.mock.calls[0][0]).toMatchObject({ file: 'biography/1234.png', origin: 'biography', page_url: 'https://siftersearch.com/biography/1234', licence: 'PD' });
    expect(speakers.portraitFor).not.toHaveBeenCalled();
  });
  it('a held portrait is reused; a recent miss is not searched again', async () => {
    const speakers = { ...(await import('../../api/lib/media/speakers.js')), portraitFor: vi.fn() };
    expect((await ensurePortrait('Hooper Dunbar', {}, { repo: repoOf({ file: '/x.jpg' }), speakers, overrides: {} })).status).toBe('kept');
    expect((await ensurePortrait('Hooper Dunbar', {}, { repo: repoOf({ tried_at: new Date().toISOString() }), speakers, overrides: {} })).status).toBe('none');
    expect(speakers.portraitFor).not.toHaveBeenCalled();
  });
});

describe('served through the image worker', () => {
  it('the API gives the image service URL of the R2 master (versioned by its hash) with the credit', () => {
    expect(speakerThumb({ key: 'ali-nakhjavani', name: 'Ali Nakhjavani', file: 'x.jpg', sha: 'abcdef0123456789ffff', credit: 'P', licence: 'L' }))
      .toMatchObject({ url: 'https://siftersearch.com/img/cdn/siftersearch.com/x.jpg?v=abcdef0123456789', kind: 'photo', credit: 'P', licence: 'L' });
    expect(speakerThumb({ key: 'x', name: 'X' })).toBeNull();
  });
  it('every size goes through the biography portraits helper with fo-face; SVG tiles pass through', () => {
    const url = 'https://siftersearch.com/img/cdn/siftersearch.com/media-speakers/a.jpg?v=1';
    expect(picture(url, 160)).toEqual({ src: `${url}&tr=w-160,h-160,dpr-1,q-80,fo-face,e-sharpen`, srcset: `${url}&tr=w-160,h-160,dpr-1,q-80,fo-face,e-sharpen 1x, ${url}&tr=w-160,h-160,dpr-2,q-80,fo-face,e-sharpen 2x` });
    expect(picture('/api/media/x/file/thumb.svg', 160)).toEqual({ src: '/api/media/x/file/thumb.svg', srcset: null });
    expect(picture(url, 160, 160, { photo: false }).srcset).toBeNull();
  });
});

