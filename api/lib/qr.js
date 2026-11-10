// QR codes as vectors, cached by exact URL. Encoder: `qrcode` (pure JS), level M. Module matrix cached in-process (LRU) and on
// local disk (data/run/qr, one tiny bit-packed file per URL: tower's own disk; R2 would be slower than re-encoding, the DB is off
// limits). Output: PDF vector drawing (drawQr, one path per code) or an SVG path (qrSvgPath). Deps: qrcode.
import QRCode from 'qrcode';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const stats = { encoded: 0, memHits: 0, diskHits: 0 };
const LRU_MAX = 4000, lru = new Map();
let dir = process.env.VITEST ? mkdtempSync(join(tmpdir(), 'qr-')) : join(process.cwd(), 'data', 'run', 'qr');
export const setCacheDir = (d) => { dir = d; };
export const resetCache = () => { lru.clear(); stats.encoded = stats.memHits = stats.diskHits = 0; };
const file = (key) => join(dir, `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.qr`);
const pack = (size, data) => { const b = Buffer.alloc(1 + Math.ceil(size * size / 8)); b[0] = size; for (let i = 0; i < size * size; i++) if (data[i]) b[1 + (i >> 3)] |= 1 << (i & 7); return b; };
const unpack = (b) => { const size = b[0], data = new Uint8Array(size * size); for (let i = 0; i < size * size; i++) data[i] = (b[1 + (i >> 3)] >> (i & 7)) & 1; return { size, data }; };

/** The shortest form of a passage URL that names the same place: selectionString (a highlight range, the longest part) and a
 *  slash before the query are dropped; paraId stays. Other URLs are returned unchanged. */
export function shortUrl(u) {
  try { const x = new URL(u); x.searchParams.delete('selectionString'); return x.toString().replace(/\/(\?|#|$)/, (m, c) => c).replace(/\?$/, ''); } catch { return u; }
}

/** The module matrix { size, data (1 = dark) } for a URL: memory → disk → encode. */
export function qrMatrix(url, { shorten = false } = {}) {
  const key = shorten ? shortUrl(url) : String(url);
  const hit = lru.get(key);
  if (hit) { lru.delete(key); lru.set(key, hit); stats.memHits++; return hit; }
  let m = null;
  try { m = unpack(readFileSync(file(key))); stats.diskHits++; } catch { /* not cached */ }
  if (!m) {
    const q = QRCode.create(key, { errorCorrectionLevel: 'M' });
    m = { size: q.modules.size, data: Uint8Array.from(q.modules.data) }; stats.encoded++;
    try { mkdirSync(dir, { recursive: true }); writeFileSync(file(key), pack(m.size, m.data)); } catch { /* cache is best effort */ }
  }
  lru.set(key, m); if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
  return m;
}

/** Dark-module runs as [x, y, length] (horizontal runs merged: fewer rects, smaller files). */
export function runsOf({ size, data }) {
  const out = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size;) { if (!data[y * size + x]) { x++; continue; } let l = 1; while (x + l < size && data[y * size + x + l]) l++; out.push([x, y, l]); x += l; }
  return out;
}

/** Draw a code into a pdfkit doc as vector at (x, y), `size` points square INCLUDING the quiet zone (4 modules, per spec). */
export function drawQr(doc, url, x, y, size = 51, { shorten = true, quiet = 4, color = '#000000' } = {}) {
  const m = qrMatrix(url, { shorten }), mod = size / (m.size + 2 * quiet), o = quiet * mod;
  doc.save(); doc.rect(x, y, size, size).fill('#ffffff');
  for (const [cx, cy, l] of runsOf(m)) doc.rect(x + o + cx * mod, y + o + cy * mod, l * mod + 0.05, mod + 0.05);
  doc.fill(color); doc.restore();
  return m.size;
}

/** The same code as an SVG path string (viewBox 0 0 size size, no quiet zone) for web use. */
export function qrSvgPath(url, opts = {}) {
  const m = qrMatrix(url, opts);
  return { size: m.size, d: runsOf(m).map(([x, y, l]) => `M${x} ${y}h${l}v1h-${l}z`).join('') };
}
