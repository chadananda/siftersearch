// Folder sweep through the Dewey API: is every document in a folder already in the library? Each file → POST /api/dewey/holdings
// with a Dewey key (DEWEY_API_KEY, or tmp/dewey-test-key). Every document ≤ 21 MB goes up as it is — Dewey converts any
// format itself (api/lib/dewey/convert.js); only an oversize PDF is cut to its first 40 pages' text locally (pdftotext) and
// sent as .txt. Audio is listed, not sent. Resumable.
// Usage: node scripts/library/dewey-folder-sweep.mjs <folder> <out.jsonl>
import { readdirSync, statSync, readFileSync, appendFileSync, existsSync } from 'fs';
import { join, extname, relative } from 'path';
import { execFileSync } from 'child_process';

const [dir, out] = process.argv.slice(2);
const KEY = (process.env.DEWEY_API_KEY || readFileSync('tmp/dewey-test-key', 'utf8')).trim();
const API = process.env.DEWEY_API || 'https://api.siftersearch.com/api/dewey/holdings';
const AUDIO = /\.(mp3|m4a|aiff?|wav|ogg)$/i, SKIP = /(^|\/)(\.DS_Store|Icon\r?)$/;
const MAX = 21 * 1024 * 1024;   // base64 of this stays under the route's 30 MB body limit
const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).file) : []);

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dir).filter((p) => !SKIP.test(p)).sort();

function payload(p) {
  const ext = extname(p).toLowerCase(), size = statSync(p).size, name = p.split('/').pop();
  if (size <= MAX) return { how: 'file', body: { file: { name, data: readFileSync(p).toString('base64') } } };
  let text;
  if (ext === '.pdf') text = execFileSync('pdftotext', ['-l', '40', '-enc', 'UTF-8', p, '-'], { maxBuffer: 1 << 28 }).toString();
  else return null;   // too large to send, and not a PDF we can cut down
  return { how: `text(${ext.slice(1)})`, body: { file: { name: name.replace(/\.[^.]+$/, '') + '.txt', data: Buffer.from(text).toString('base64') } } };
}

async function check(p) {
  const file = relative(dir, p);
  if (AUDIO.test(p)) return { file, how: 'audio', verdict: 'audio-not-checked' };
  let pl;
  try { pl = payload(p); } catch (e) { return { file, how: 'convert', verdict: `convert failed: ${e.message}`.slice(0, 200) }; }
  if (!pl) return { file, how: 'unsupported', verdict: 'unsupported' };
  const t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(pl.body), signal: AbortSignal.timeout(180000) });
      const j = await r.json().catch(() => ({}));
      if (r.status >= 500 && attempt < 2) continue;
      return { file, how: pl.how, status: r.status, ms: Date.now() - t0, verdict: j.verdict || `error ${r.status}: ${j.message || ''}`.slice(0, 200),
        read_as: j.identified ? { title: j.identified.title, needs_ocr: j.identified.needs_ocr || undefined, lines: j.identified.printed_lines?.length || 0 } : undefined,
        top: (j.candidates || []).slice(0, 3).map((c) => ({ id: c.id, title: c.title, author: c.author, ev: c.evidence.map((e) => e.kind + (e.detail ? `: ${e.detail}` : '')).join('; ') })) };
    } catch (e) { if (attempt >= 2) return { file, how: pl.how, verdict: `error: ${e.message}`.slice(0, 200) }; }
  }
}

const queue = files.filter((p) => !done.has(relative(dir, p)));
console.log(`${files.length} files, ${queue.length} to check`);
let i = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (i < queue.length) {
    const p = queue[i++];
    const r = await check(p);
    appendFileSync(out, JSON.stringify(r) + '\n');
    console.log(`${r.verdict.padEnd(20)} ${r.how.padEnd(12)} ${r.file}${r.top?.[0] ? `  → #${r.top[0].id} ${r.top[0].title}` : ''}`);
  }
}));
