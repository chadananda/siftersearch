import { describe, it, expect } from 'vitest';
import { groupFiles } from '../../api/lib/archives/group.js';

const f = (rel, o = {}) => { const name = rel.split('/').pop(), folder = rel.split('/').slice(0, -1).join('/'), ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const cls = o.cls || ({ pdf: 'pdf', epub: 'epub', wav: 'audio', mp3: 'audio', mp4: 'video', tif: 'image', jpg: 'image', txt: 'txt' }[ext] || 'other');
  return { rel, folder, name, ext, cls, size: 100000, ...o }; };

describe('groupFiles', () => {
  it('pdf/epub = one book each, title cleaned, year from name', () => {
    const r = groupFiles([f('A/01_The_Dawn_Breakers_1932.pdf'), f('A/Other.epub')]);
    expect(r.map((x) => x.kind)).toEqual(['book', 'book']);
    expect(r[0].title).toBe('The Dawn Breakers 1932'); expect(r[0].year).toBe(1932);
  });
  it('tif folder = one scan item; camera jpgs = photo-set', () => {
    const scan = Array.from({ length: 6 }, (_, i) => f(`Paper/Star of the West/page_00${i}.tif`));
    const photos = Array.from({ length: 6 }, (_, i) => f(`Pics/IMG_00${i}.jpg`));
    const r = groupFiles([...scan, ...photos]);
    expect(r.find((x) => x.kind === 'scan')).toMatchObject({ files: 6, title: 'Star of the West', primary_rel: 'Paper/Star of the West/page_000.tif' });
    expect(r.find((x) => x.kind === 'photo-set')).toMatchObject({ files: 6, section: 'set-aside' });
  });
  it('wav + mp3 siblings collapse, wav primary; tag title and artist used', () => {
    const r = groupFiles([f('T/talk.mp3', { dur: 60 }), f('T/talk.wav', { dur: 61, title: 'Real Title', artist: 'A. Speaker' })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'talk', primary_rel: 'T/talk.wav', files: 2, creator: 'A. Speaker' });
    expect(r[0].rel_paths).toEqual(['T/talk.mp3', 'T/talk.wav']);
  });
  it('junk is set aside; covenant-breaker section; never invents creator', () => {
    const r = groupFiles([f('x/Thumbs.db', { cls: 'junk' }), f('x/noext', { size: 100 }), f('Books_by_Covenant-Breakers/Book.pdf'), f('v/clip.mp4')]);
    expect(r.filter((x) => x.kind === 'junk').every((x) => x.section === 'set-aside')).toBe(true);
    expect(r.filter((x) => x.kind === 'junk')).toHaveLength(2);
    expect(r.find((x) => x.kind === 'book').section).toBe('covenant-breaker');
    expect(r.find((x) => x.kind === 'video').creator).toBeNull();
  });
  it('a known covenant-breaker author → covenant-breaker section, flagged before/after the break; narrow names only', () => {
    const r = groupFiles([f('Books/Ahmad Sohrab - I Heard Him Say 1937.pdf'), f('Books/Remey/Observations 1950.pdf'), f('Talks/Sohrab Sepehri poems.pdf'), f('Talks/z.mp3', { artist: 'Ruth White' })]);
    const by = (t) => r.find((x) => x.primary_rel.includes(t));
    expect(by('Sohrab -')).toMatchObject({ section: 'covenant-breaker', metadata: { cb: { name: 'Ahmad Sohrab', broke: 1929, before: false } } });
    expect(by('Remey').metadata.cb).toMatchObject({ name: 'Charles Mason Remey', before: true });
    expect(by('Sepehri').section).toBe('main');   // a bare 'Sohrab' is not Ahmad Sohrab
    expect(by('z.mp3').metadata.cb).toMatchObject({ name: 'Ruth White', before: null });
  });
  it('identical files in many folders collapse to one item under the plainest path; the catalogue verdict survives', () => {
    const r = groupFiles([f('Desktop Clear/Copy of Books/Iqan.pdf', { fp: 'k1' }), f('Books/Iqan.pdf', { fp: 'k1' }), f('Backup/Books_by_Covenant-Breakers/Iqan.pdf', { fp: 'k1' }),
      f('A/talk.mp3', { fp: 't1', dur: 900, why: 'duplicate: identical size+duration inside drive' }), f('Z/deep/er/talk.mp3', { fp: 't1', dur: 900, why: 'new', sug: 'import' }), f('Books/Other.pdf', { fp: 'k2' })]);
    const book = r.find((x) => x.title === 'Iqan');
    expect(r.filter((x) => x.kind === 'book')).toHaveLength(2);
    expect(book).toMatchObject({ primary_rel: 'Books/Iqan.pdf', section: 'covenant-breaker' });
    expect(book.metadata.copies).toBe(3); expect(book.metadata.also).toHaveLength(2);
    const talk = r.filter((x) => x.kind === 'talk');
    expect(talk).toHaveLength(1); expect(talk[0].metadata).toMatchObject({ catalog_why: 'new', sug: 'import', copies: 2 });
  });
});
