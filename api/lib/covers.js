// Book covers: the ORIGINAL lives on tower (COVERS_DIR, default /tank/sifter/covers/<docId>/) with its provenance; every
// rendering (size, crop, format, sharpen) is made on demand by the image Worker (worker/img/) from ImageKit-style URLs
// and cached at the edge and in R2, so tower serves each original version once. Chad 10-10. Sources: Chad's generated
// OceanLibrary covers; online catalogues for published books; generated covers for the rest (Librarian tools).
import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';

export const coversDir = () => process.env.COVERS_DIR || '/tank/sifter/covers';
const dirOf = (docId) => join(coversDir(), String(Number(docId)));

/** Image-service URL for a cover. `v` = content hash (a replaced cover gets a new URL); add `&tr=` for a rendering. */
export const coverUrl = (docId, version) => `/img/covers/${Number(docId)}?v=${version}`;
/** A rendering of a stored cover URL: coverImg(doc.cover_url, 'w-160,h-240,e-sharpen'). */
export const coverImg = (url, tr) => (url && tr ? `${url}${url.includes('?') ? '&' : '?'}tr=${tr}` : url);

const SNIFF = [[[0x89, 0x50, 0x4e, 0x47], 'png'], [[0xff, 0xd8, 0xff], 'jpeg'], [[0x52, 0x49, 0x46, 0x46], 'webp'], [[0x47, 0x49, 0x46], 'gif']];
export function sniffFormat(buf) {
  for (const [sig, fmt] of SNIFF) if (sig.every((b, i) => buf[i] === b)) return fmt;
  return null;
}
export const CONTENT_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/**
 * Store a cover original with its provenance. Refuses bytes that are not an image.
 * @param {number} docId
 * @param {Buffer} input
 * @param {{source:string, url?:string, rights?:string}} meta  where it came from and on what terms
 * @returns {Promise<{version:string, url:string, format:string}>}
 */
export async function storeCover(docId, input, meta = {}) {
  const id = Number(docId);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`storeCover: bad docId ${docId}`);
  const format = sniffFormat(input);
  if (!format) throw new Error(`storeCover: doc ${id}: not a png/jpeg/webp/gif image`);
  const version = createHash('sha256').update(input).digest('hex').slice(0, 12);
  await mkdir(dirOf(id), { recursive: true });
  await writeFile(join(dirOf(id), `original.${format}`), input);
  await writeFile(join(dirOf(id), 'meta.json'), JSON.stringify({ docId: id, version, format, bytes: input.length, storedAt: new Date().toISOString(), ...meta }, null, 2));
  return { version, url: coverUrl(id, version), format };
}

/** → { bytes, format } of the stored original, or null. */
export async function readOriginal(docId) {
  const files = await readdir(dirOf(docId)).catch(() => []);
  const f = files.find((n) => n.startsWith('original.'));
  if (!f) return null;
  const bytes = await readFile(join(dirOf(docId), f));
  return { bytes, format: sniffFormat(bytes) };
}
