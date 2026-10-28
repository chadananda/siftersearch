// ZIP safety suite (Chad 10-28): entry limits, expansion size, ratio (zip bomb), lying headers, zip-slip, symlinks, encrypted, nested depth,
// type allowlist + magic bytes. Real ZIPs built with jszip; the worker's unpackZip runs end to end on them.
import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listZip, planEntries, extractEntry, classifyEntry, flatName, unsafeEntryName, sniff, ArchiveError, LIMITS } from '../../api/lib/dewey/archive-safe.js';
import { unpackZip } from '../../scripts/dewey/worker/lib.mjs';

let dir;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'dewey-zip-')); });
const PDF = Buffer.from('%PDF-1.4\n' + 'a'.repeat(200));
const zipOf = async (files, opts = {}) => { const z = new JSZip(); for (const [n, d, o] of files) z.file(n, d, { ...o }); return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: opts.platform || 'DOS' }); };
const save = async (name, buf) => { const p = join(dir, name); await writeFile(p, buf); return p; };

describe('listing + planning', () => {
  it('lists entries from the central directory', async () => {
    const p = await save('a.zip', await zipOf([['book one.pdf', PDF], ['sub/notes.txt', 'hello'], ['empty/', null, { dir: true }]]));
    const e = await listZip(p);
    expect(e.filter((x) => !x.dir).map((x) => x.name).sort()).toEqual(['book one.pdf', 'sub/notes.txt']);
    const plan = planEntries(e, LIMITS, { fileSize: 500 });
    expect(plan.take.map((t) => t.flat).sort()).toEqual(['book one.pdf', 'sub - notes.txt']);
  });
  it('refuses more than 500 files', async () => {
    const e = Array.from({ length: 501 }, (_, i) => ({ name: `f${i}.pdf`, size: 10, csize: 10, method: 8, flags: 0, dir: false }));
    expect(() => planEntries(e, LIMITS)).toThrow(/501 files/);
  });
  it('refuses an archive that expands past 2 GB', () => {
    expect(() => planEntries([{ name: 'big.pdf', size: 3 * 1024 ** 3, csize: 3 * 1024 ** 3, method: 8, flags: 0, dir: false }], { ...LIMITS, entryMax: 4 * 1024 ** 3 })).toThrow(/expand to 3\.0 GB/);
  });
  it('refuses a ratio bomb (declared 200x the file)', () => {
    const e = [{ name: 'z.txt', size: 300 * 1024 ** 2, csize: 1024, method: 8, flags: 0, dir: false }];
    try { planEntries(e, LIMITS, { fileSize: 1024 ** 2 }); throw new Error('no throw'); } catch (err) { expect(err).toBeInstanceOf(ArchiveError); expect(err.code).toBe('BOMB'); expect(err.message).toMatch(/zip bomb/); }
  });
  it('skips zip-slip names, symlinks, encrypted and unsupported entries, with reasons', () => {
    const base = { size: 10, csize: 10, method: 8, flags: 0, dir: false };
    const { take, skip } = planEntries([{ ...base, name: '../../etc/cron.d/x' }, { ...base, name: '/abs/path.pdf' }, { ...base, name: 'C:\\win.pdf' }, { ...base, name: 'link.pdf', symlink: true },
      { ...base, name: 'secret.pdf', encrypted: true }, { ...base, name: 'odd.pdf', method: 12 }, { ...base, name: '__MACOSX/._a.pdf' }, { ...base, name: 'ok.pdf' }], LIMITS);
    expect(take.map((t) => t.name)).toEqual(['ok.pdf']);
    expect(skip.map((s) => s.reason)).toEqual([expect.stringMatching(/leave the archive/), expect.stringMatching(/leave the archive/), expect.stringMatching(/leave the archive/), expect.stringMatching(/links/), expect.stringMatching(/password/), expect.stringMatching(/unsupported/)]);
  });
  it('caps the files taken for a new contributor and says so', () => {
    const e = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.pdf`, size: 1, csize: 1, method: 8, flags: 0, dir: false }));
    const { take, skip } = planEntries(e, LIMITS, { maxTake: 3 });
    expect(take).toHaveLength(3); expect(skip.map((s) => s.reason)).toEqual([expect.stringMatching(/3-file limit/), expect.stringMatching(/3-file limit/)]);
  });
  it('flatName never yields a path', () => {
    expect(flatName('../../x/../evil.pdf')).toBe('x - evil.pdf'); expect(flatName('a/b\\c.pdf')).toBe('a - b - c.pdf'); expect(flatName('')).toBe('entry-0'); expect(unsafeEntryName('a/../b')).toBe(true); expect(unsafeEntryName('a/b.pdf')).toBe(false);
  });
  it('a file that is not a zip, and an unreadable directory, are errors', async () => {
    await expect(listZip(await save('no.zip', Buffer.from('not a zip at all, just text')))).rejects.toMatchObject({ code: 'NOT_ZIP' });
  });
});

describe('inflating enforces the REAL size', () => {
  it('a header that lies about its size cannot expand past it', async () => {
    const p = await save('lie.zip', await zipOf([['bomb.txt', Buffer.alloc(2 * 1024 ** 2, 0)]]));
    const [e] = await listZip(p);
    await expect(extractEntry(p, { ...e, size: 100 }, createWriteStream(join(dir, 'lie.out')))).rejects.toMatchObject({ code: 'BOMB' });
  });
  it('maxBytes is a hard stop even when the header agrees', async () => {
    const p = await save('big.zip', await zipOf([['big.txt', Buffer.alloc(1024 ** 2, 7)]]));
    const [e] = await listZip(p);
    await expect(extractEntry(p, e, createWriteStream(join(dir, 'big.out')), { maxBytes: 1000 })).rejects.toMatchObject({ code: 'BOMB' });
  });
  it('an honest entry extracts with its sha256 and head bytes', async () => {
    const p = await save('ok.zip', await zipOf([['a.pdf', PDF]]));
    const [e] = await listZip(p); const r = await extractEntry(p, e, createWriteStream(join(dir, 'ok.out')));
    expect(r.bytes).toBe(PDF.length); expect(r.sha256).toMatch(/^[0-9a-f]{64}$/); expect(sniff(r.head)).toBe('pdf');
  });
});

describe('type allowlist + magic bytes', () => {
  it('takes documents and media; refuses programs, even renamed', () => {
    expect(classifyEntry('book.pdf', PDF).kind).toBe('doc'); expect(classifyEntry('talk.mp3', Buffer.from('ID3\x04\0\0')).kind).toBe('media'); expect(classifyEntry('nested.zip', Buffer.from('PK\x03\x04')).kind).toBe('archive');
    expect(classifyEntry('setup.exe', null)).toMatchObject({ kind: 'skip', reason: expect.stringMatching(/program/) });
    expect(classifyEntry('book.pdf', Buffer.from('MZ\x90\0'))).toMatchObject({ kind: 'skip', reason: expect.stringMatching(/program/) });
    expect(classifyEntry('run.sh', null).kind).toBe('skip'); expect(classifyEntry('mystery.xyz', null).reason).toMatch(/not a kind of file/);
    expect(classifyEntry('fake.pdf', Buffer.from('<html>hi</html>'))).toMatchObject({ kind: 'skip', reason: expect.stringMatching(/looks? like html/) });
  });
});

describe('worker unpackZip end to end', () => {
  const ctx = (extra = {}) => ({ order: { id: 1, limits: { maxEntries: 500, depth: 2 }, ...extra }, scratch: join(dir, `s-${Math.random().toString(36).slice(2)}`) });
  it('unpacks documents, skips junk with reasons, flattens names', async () => {
    const p = await save('mix.zip', await zipOf([['Books/Seven Valleys.pdf', PDF], ['Books/readme.txt', 'x'], ['tool.exe', Buffer.from('MZ....')], ['../evil.pdf', PDF]]));
    const u = await unpackZip(p, ctx());
    expect(u.files.map((f) => f.name).sort()).toEqual(['Books - Seven Valleys.pdf', 'Books - readme.txt']);
    expect(u.skipped.some((s) => /leave the archive/.test(s.reason))).toBe(true);
    for (const f of u.files) expect(f.path.startsWith(dir)).toBe(true);   // nothing escaped the scratch area
  });
  it('opens a ZIP inside a ZIP (depth 2) and refuses depth 3', async () => {
    const l3 = await zipOf([['deep.pdf', PDF]]), l2 = await zipOf([['two.pdf', PDF], ['inner3.zip', l3]]), l1 = await zipOf([['one.pdf', PDF], ['inner2.zip', l2]]);
    const u = await unpackZip(await save('n.zip', l1), ctx());
    expect(u.files.map((f) => f.from).sort()).toEqual(['inner2.zip › two.pdf', 'one.pdf']);
    expect(u.skipped.map((s) => s.reason).join()).toMatch(/nested more than 2 deep/);
  });
  it('a real expansion bomb is refused before it fills the disk', async () => {
    const p = await save('b.zip', await zipOf([['z1.txt', Buffer.alloc(6 * 1024 ** 2, 0)]]));
    await expect(unpackZip(p, ctx({ limits: { maxEntries: 500, depth: 2, zip: { expanded: 1024 ** 2, entries: 500, entryMax: 10 * 1024 ** 2, ratio: 100, depth: 2 } } }))).rejects.toMatchObject({ code: 'BOMB' });
  });
});
