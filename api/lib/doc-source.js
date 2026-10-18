// A document's ORIGINAL SOURCE — the archived scan, letter or file it was read from (Chad 10-18: "display the source
// documents when they exist nowhere else, like a link to the manuscript … checking the handwritten or poorly-scanned
// source if a question arises later"). Archived on the NAS by Dewey (<originals>/<sha256>.<ext>, never in Dropbox).
// WHO MAY OPEN IT: unpublished material that exists nowhere else (letters, pilgrim notes, manuscripts, diaries,
// transcripts, interviews…) is public; a published book scanned from print is for admins only (copyright). Admin links
// are signed for 10 minutes so a plain <a href> (and a PDF viewer's range requests) works. Deps: dewey-repo.
import { createHmac, timingSafeEqual } from 'crypto';
import { existsSync, statSync } from 'fs';
import { findByDoc } from './repos/dewey-repo.js';
import { inArchive } from './dewey/intake.js';

const UNPUBLISHED = /letter|pilgrim|manuscript|diary|journal|transcript|e-?mail|notes|memo|minutes|recollection|interview|memoir|statement|account/i;
const TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', rtf: 'application/rtf',
  txt: 'text/plain; charset=utf-8', html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', epub: 'application/epub+zip', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4', tiff: 'image/tiff', jpg: 'image/jpeg', png: 'image/png' };

/** Is this source open to everyone? Unpublished kinds only — a published book's scan stays with admins. Pure. */
export function isPublicSource(item) {
  const kind = String(item?.identified?.appraisal?.kind || item?.kind || '');
  return UNPUBLISHED.test(kind) || item?.identified?.source_public === true;
}

/** docId → { path, ext, type, bytes, public, kind } or null (no archived original). */
export async function sourceOf(docId, { find = findByDoc } = {}) {
  const item = await find(docId);
  if (!item?.original_path || !inArchive(item.original_path) || !existsSync(item.original_path)) return null;
  const ext = item.original_path.split('.').pop().toLowerCase();
  return { path: item.original_path, ext, type: TYPES[ext] || 'application/octet-stream', bytes: statSync(item.original_path).size,
    public: isPublicSource(item), kind: item.identified?.appraisal?.kind || item.kind || null, pages: item.identified?.slp?.pages || item.identified?.sample?.of || null };
}

const secret = () => process.env.JWT_ACCESS_SECRET || process.env.DEPLOY_SECRET || 'dev';
export function signSource(docId, ttlMs = 600000, now = Date.now()) {
  const exp = now + ttlMs;
  return `${exp}.${createHmac('sha256', secret()).update(`${docId}.${exp}`).digest('base64url')}`;
}
export function verifySource(docId, token, now = Date.now()) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) < now) return false;
  const want = createHmac('sha256', secret()).update(`${docId}.${exp}`).digest('base64url');
  return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
