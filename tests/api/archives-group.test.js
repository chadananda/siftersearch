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
    expect(r.find((x) => x.kind === 'photo-set').files).toBe(6);
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
});
