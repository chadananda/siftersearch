// Safe ZIP reading for Dewey (Chad 10-28: <= 500 entries, <= 2 GB, nested depth 2, path-traversal + zip-bomb protection, type allowlist).
// A small central-directory reader and a counting inflater: sizes are CHECKED from the directory AND ENFORCED while inflating (a lying
// header cannot expand past the limit). No names from the archive are ever used as paths: callers get a sanitized flat name.
// Runs on a WORKER (scripts/dewey/worker); pure Node, no deps. ZIP64 and encrypted entries are refused.
import { open } from 'node:fs/promises';
import { createInflateRaw } from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';

export const DOC_EXT = new Set('pdf docx doc rtf odt txt md html htm epub djvu'.split(' '));
export const MEDIA_EXT = new Set('mp3 m4a aac wav flac ogg opus aiff aif wma mp4 m4v mov mkv webm avi'.split(' '));
export const IMAGE_EXT = new Set('jpg jpeg png tif tiff'.split(' '));   // a scanned page: accepted as a document source
export const ARCHIVE_EXT = new Set(['zip']);
export const DANGEROUS_EXT = new Set('exe dll bat cmd com scr msi js jar vbs ps1 sh app dmg apk pif lnk iso reg hta cpl'.split(' '));
export const LIMITS = { entries: 500, expanded: 2 * 1024 ** 3, depth: 2, ratio: 100, entryMax: 2 * 1024 ** 3 };

export class ArchiveError extends Error { constructor(msg, code = 'ARCHIVE') { super(msg); this.code = code; } }
export const extOf = (n) => (String(n).match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase();

/** A flat, safe file name from an entry path: no directories, no traversal, no control characters. */
export function flatName(entryName, index = 0) {
  const base = String(entryName).replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..').join(' - ');
  const clean = base.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^\p{L}\p{N}._ ()&,'’-]+/gu, '_').replace(/^\.+/, '').slice(0, 120);
  return clean || `entry-${index}`;
}
/** Is this entry NAME an attempt at traversal / an absolute path / a drive? (zip-slip). Pure. */
export const unsafeEntryName = (n) => { const s = String(n).replace(/\\/g, '/'); return s.startsWith('/') || /^[a-z]:/i.test(s) || s.split('/').includes('..') || s.includes('\0'); };

/** What a file's first bytes say it is → ext family or null. Used to catch an .exe renamed .pdf and a .pdf that is not one. */
export function sniff(buf) {
  const b = buf;
  const at = (i, s) => b.length >= i + s.length && s.split('').every((c, k) => b[i + k] === c.charCodeAt(0));
  if (at(0, '%PDF')) return 'pdf';
  if (at(0, 'PK\x03\x04') || at(0, 'PK\x05\x06')) return 'zip';   // docx / epub / odt / zip
  if (at(0, 'MZ')) return 'exe';
  if (at(0, '\x7fELF') || at(0, '\xca\xfe\xba\xbe') || at(0, '\xcf\xfa\xed\xfe') || at(0, '\xfe\xed\xfa\xce')) return 'exe';
  if (at(0, '#!')) return 'script';
  if (at(0, '\xd0\xcf\x11\xe0')) return 'ole';   // doc
  if (at(0, '{\\rtf')) return 'rtf';
  if (at(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (at(0, 'RIFF')) return 'riff';
  if (at(0, 'fLaC')) return 'flac';
  if (at(0, 'OggS')) return 'ogg';
  if (at(4, 'ftyp')) return 'mp4';
  if (at(0, '\x1aE\xdf\xa3')) return 'mkv';
  if (at(0, '\xff\xd8\xff')) return 'jpg';
  if (at(0, '\x89PNG')) return 'png';
  if (at(0, 'II*\0') || at(0, 'MM\0*')) return 'tif';
  if (at(0, 'AT&TFORM')) return 'djvu';
  if (at(0, '<!DOCTYPE') || at(0, '<html') || at(0, '<HTML')) return 'html';
  return b.slice(0, 512).every((x) => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127) || x >= 128) ? 'text' : 'binary';
}
const FAMILY = { pdf: ['pdf'], docx: ['zip'], epub: ['zip'], odt: ['zip'], doc: ['ole'], rtf: ['rtf'], txt: ['text'], md: ['text'], html: ['html', 'text'], htm: ['html', 'text'], djvu: ['djvu'],
  mp3: ['mp3'], m4a: ['mp4'], aac: ['mp3', 'mp4'], wav: ['riff'], flac: ['flac'], ogg: ['ogg'], opus: ['ogg'], aiff: ['binary', 'riff'], aif: ['binary', 'riff'], wma: ['binary'], mp4: ['mp4'], m4v: ['mp4'], mov: ['mp4'],
  mkv: ['mkv'], webm: ['mkv'], avi: ['riff'], jpg: ['jpg'], jpeg: ['jpg'], png: ['png'], tif: ['tif'], tiff: ['tif'], zip: ['zip'] };
/** Classify an entry by name + first bytes. → { kind: 'doc'|'media'|'archive'|'skip', ext, reason? } Pure. */
export function classifyEntry(name, head) {
  const ext = extOf(name);
  if (DANGEROUS_EXT.has(ext)) return { kind: 'skip', ext, reason: `a program file (.${ext}) is never taken` };
  const seen = head ? sniff(head) : null;
  if (seen === 'exe' || seen === 'script') return { kind: 'skip', ext, reason: 'it is a program, whatever its name says' };
  const kind = ARCHIVE_EXT.has(ext) ? 'archive' : DOC_EXT.has(ext) || IMAGE_EXT.has(ext) ? 'doc' : MEDIA_EXT.has(ext) ? 'media' : null;
  if (!kind) return { kind: 'skip', ext, reason: ext ? `.${ext} is not a kind of file the library takes` : 'no file type' };
  if (seen && FAMILY[ext] && !FAMILY[ext].includes(seen)) return { kind: 'skip', ext, reason: `it is named .${ext} but its contents look like ${seen}` };
  return { kind, ext };
}

// ── ZIP central directory ──
const u16 = (b, o) => b.readUInt16LE(o), u32 = (b, o) => b.readUInt32LE(o);
/** List a ZIP file's entries from its central directory. → [{ name, method, csize, size, offset, flags, dir, symlink, encrypted }] ; throws ArchiveError. */
export async function listZip(path, limits = LIMITS) {
  const fh = await open(path, 'r');
  try {
    const { size: fileSize } = await fh.stat();
    const tail = Buffer.alloc(Math.min(fileSize, 65557));
    await fh.read(tail, 0, tail.length, fileSize - tail.length);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new ArchiveError('this is not a readable ZIP file', 'NOT_ZIP');
    const total = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
    if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new ArchiveError('ZIP64 archives are not taken (over 4 GB or 65,535 files)', 'ZIP64');
    if (total > limits.entries * 4) throw new ArchiveError(`the archive lists ${total} entries (limit ${limits.entries})`, 'TOO_MANY');
    if (cdOff + cdSize > fileSize || cdSize > 64 * 1024 ** 2) throw new ArchiveError('the ZIP directory is damaged', 'CORRUPT');
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);
    const out = []; let p = 0;
    for (let i = 0; i < total; i++) {
      if (p + 46 > cd.length || u32(cd, p) !== 0x02014b50) throw new ArchiveError('the ZIP directory is damaged', 'CORRUPT');
      const madeBy = u16(cd, p + 4), flags = u16(cd, p + 8), method = u16(cd, p + 10), csize = u32(cd, p + 20), usize = u32(cd, p + 24);
      const nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32), ext = u32(cd, p + 38), off = u32(cd, p + 42);
      const name = cd.slice(p + 46, p + 46 + nl).toString(flags & 0x800 ? 'utf8' : 'latin1');
      const unixMode = (madeBy >> 8) === 3 ? (ext >>> 16) : 0;
      out.push({ name, method, csize, size: usize, offset: off, flags, dir: name.endsWith('/'), symlink: (unixMode & 0o170000) === 0o120000, encrypted: !!(flags & 1) });
      p += 46 + nl + xl + cl;
    }
    return out;
  } finally { await fh.close(); }
}

/** Decide what to take from a listing, before inflating anything. → { take: [entry+{flat,ext,kind}], skip: [{ name, reason }], error? } */
export function planEntries(entries, limits = LIMITS, { maxTake = limits.entries, fileSize = 0 } = {}) {
  const files = entries.filter((e) => !e.dir);
  const skip = [];
  if (files.length > limits.entries) throw new ArchiveError(`the archive holds ${files.length} files; the limit is ${limits.entries}`, 'TOO_MANY');
  const declared = files.reduce((a, e) => a + e.size, 0);
  if (declared > limits.expanded) throw new ArchiveError(`the archive would expand to ${(declared / 1024 ** 3).toFixed(1)} GB; the limit is ${limits.expanded / 1024 ** 3} GB`, 'BOMB');
  if (fileSize && declared / Math.max(1, fileSize) > limits.ratio && declared > 50 * 1024 ** 2) throw new ArchiveError(`the archive expands ${Math.round(declared / fileSize)}x — refused as a possible zip bomb`, 'BOMB');
  const take = []; const seen = new Set();
  files.forEach((e, i) => {
    if (unsafeEntryName(e.name)) return skip.push({ name: e.name, reason: 'its path tries to leave the archive' });
    if (e.symlink) return skip.push({ name: e.name, reason: 'links inside archives are not followed' });
    if (e.encrypted) return skip.push({ name: e.name, reason: 'it is password-protected' });
    if (e.method !== 0 && e.method !== 8) return skip.push({ name: e.name, reason: `unsupported compression (${e.method})` });
    if (e.size > limits.entryMax) return skip.push({ name: e.name, reason: 'a single file over the size limit' });
    if (/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/.test(e.name) || /(^|\/)\._/.test(e.name)) return;   // filesystem litter, not worth a line
    const byName = classifyEntry(e.name, null);   // programs and unknown types are never even inflated
    if (byName.kind === 'skip') return skip.push({ name: e.name, reason: byName.reason });
    let flat = flatName(e.name, i); if (seen.has(flat.toLowerCase())) flat = `${i}-${flat}`; seen.add(flat.toLowerCase());
    if (take.length >= maxTake) return skip.push({ name: e.name, reason: `over the ${maxTake}-file limit for this archive` });
    take.push({ ...e, flat });
  });
  return { take, skip };
}

/** Inflate ONE entry to a writable, enforcing `maxBytes` on the REAL output. → { bytes, sha256, head } ; throws ArchiveError('BOMB'). */
export async function extractEntry(path, entry, dest, { maxBytes = LIMITS.entryMax } = {}) {
  const fh = await open(path, 'r');
  try {
    const lh = Buffer.alloc(30);
    await fh.read(lh, 0, 30, entry.offset);
    if (u32(lh, 0) !== 0x04034b50) throw new ArchiveError('the ZIP is damaged (bad entry header)', 'CORRUPT');
    const start = entry.offset + 30 + u16(lh, 26) + u16(lh, 28);
    if (entry.csize === 0) { dest.end(); return { bytes: 0, sha256: createHash('sha256').digest('hex'), head: Buffer.alloc(0) }; }
    const hash = createHash('sha256'); let bytes = 0; let head = Buffer.alloc(0);
    const counter = new Transform({ transform(chunk, _e, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes || bytes > Math.max(entry.size, 1) * 1.01 + 64) return cb(new ArchiveError(`"${entry.name}" expands past its declared size — refused`, 'BOMB'));
      if (head.length < 512) head = Buffer.concat([head, chunk.slice(0, 512 - head.length)]);
      hash.update(chunk); cb(null, chunk);
    } });
    const src = fh.createReadStream({ start, end: start + Math.max(entry.csize, 1) - 1 });
    await pipeline(src, ...(entry.method === 8 ? [createInflateRaw()] : []), counter, dest);
    return { bytes, sha256: hash.digest('hex'), head };
  } finally { await fh.close().catch(() => {}); }
}
