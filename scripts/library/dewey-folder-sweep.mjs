// Folder sweep through the Dewey API: is every document in a folder already in the library? Each file → POST /api/dewey/holdings
// with a Dewey key (DEWEY_API_KEY, or tmp/dewey-test-key). Every document ≤ 21 MB goes up as it is — Dewey converts any
// format itself (api/lib/dewey/convert.js); only an oversize PDF is cut to its first 40 pages' text locally (pdftotext) and
// sent as .txt. Audio is listed, not sent. Resumable.
// --chat: each file goes to Dewey's CHAT instead (POST /api/dewey/chat, one at a time) — it lands in the key owner's thread
// on /dewey, and a work we lack that belongs is imported (Loading column). Oversize files are skipped there (a text excerpt
// must never be imported as the work).
// --server-root LOCAL=SERVER: the folder is ALSO on the server (the synced Dropbox): each file is sent as its server path
// (attach.path) — read in place by Dewey, no upload, no size limit, original stays where it is.
// Usage: node scripts/library/dewey-folder-sweep.mjs <folder> <out.jsonl> [--chat] [--server-root /Users/chad/Dropbox=/tank/dropbox]
import { readdirSync, statSync, readFileSync, appendFileSync, existsSync } from 'fs';
import { join, extname, relative } from 'path';
import { execFileSync } from 'child_process';

const argv = process.argv.slice(2);
const rootArg = argv.includes('--server-root') ? argv[argv.indexOf('--server-root') + 1] : null;
const [dir, out] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--server-root');
const [LOCAL_ROOT, SERVER_ROOT] = rootArg ? rootArg.split('=') : [null, null];
const serverPath = (p) => (LOCAL_ROOT && p.startsWith(LOCAL_ROOT) ? (SERVER_ROOT + p.slice(LOCAL_ROOT.length)).normalize('NFC') : null);   // macOS names are NFD
const CHAT = process.argv.includes('--chat');
const FOLDER = dir.replace(/\/+$/, '').split('/').pop();
const KEY = (process.env.DEWEY_API_KEY || readFileSync('tmp/dewey-test-key', 'utf8')).trim();
const API = process.env.DEWEY_API || 'https://api.siftersearch.com/api/dewey/holdings';
const AUDIO = /\.(mp3|m4a|aiff?|wav|ogg)$/i, SKIP = /(^|\/)(\.DS_Store|Icon\r?|\.gitignore)$|\.(debug|sample|zip|jpe?g|png|gif)$/i;   // helpers and images are not documents
const MAX = 21 * 1024 * 1024;   // base64 of this stays under the route's 30 MB body limit
// a file whose check ERRED (a 429, a timeout) is checked again on resume
const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !/^error/.test(r.verdict || '')).map((r) => r.file) : []);

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dir).filter((p) => !SKIP.test(p)).sort();

function payload(p) {
  const ext = extname(p).toLowerCase(), size = statSync(p).size, name = p.split('/').pop();
  const sp = serverPath(p);
  if (sp) return { how: 'path', body: { path: sp }, attach: { path: sp } };
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
  if (CHAT && !['file', 'path'].includes(pl.how)) return { file, how: pl.how, verdict: 'skipped: too large to send whole' };
  const t0 = Date.now();
  if (CHAT) {
    const r = await fetch(API.replace(/\/holdings$/, '/chat'), { method: 'POST', headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `From the folder “${FOLDER}”: ${file}`, attach: pl.attach || { file: pl.body.file }, stream: false }), signal: AbortSignal.timeout(600000) }).catch((e) => ({ status: 0, json: async () => ({ message: e.message }) }));
    const j = await r.json().catch(() => ({}));
    const h = j.holdings?.[0];
    return { file, how: 'chat', status: r.status, ms: Date.now() - t0, verdict: h?.verdict || `error ${r.status}: ${j.message || ''}`.slice(0, 200),
      top: (h?.candidates || []).slice(0, 2).map((c) => ({ id: c.id, title: c.title, rel: c.relation?.relation })),
      items: (j.items || []).map((i) => ({ id: i.id, state: i.state })), reply: String(j.reply || '').slice(0, 400) };
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(pl.body), signal: AbortSignal.timeout(180000) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) { await new Promise((z) => setTimeout(z, 60000)); attempt--; continue; }   // the key's hourly allowance: wait, never record it
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
// PACED BY THE CLOCK (10-21: a sweep's back-to-back holdings checks drove Qdrant to ~300 MB/s of reads and search to 4–14 s;
// paused, search was 2–4 s): overnight (22:00–07:00) two at a time, no pause; by day ONE at a time with a pause between files —
// a check-only sweep must never cost a reader their search. --pause=<sec> sets the daytime pause (default 30).
const PAUSE = Number((argv.find((a) => a.startsWith('--pause=')) || '').split('=')[1] || 30) * 1000;
const night = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
let lane = 0;
await Promise.all(Array.from({ length: CHAT ? 1 : 2 }, async () => {   // 2 at a time: the key allows 600 checks an hour   // chat: one at a time, in order, as a person would
  const me = lane++;
  while (i < queue.length) {
    if (!CHAT && !night()) { if (me > 0) { await new Promise((r) => setTimeout(r, 60000)); continue; } await new Promise((r) => setTimeout(r, PAUSE)); }
    if (i >= queue.length) break;
    const p = queue[i++];
    const r = await check(p);
    appendFileSync(out, JSON.stringify(r) + '\n');
    console.log(`${r.verdict.padEnd(20)} ${r.how.padEnd(12)} ${r.file}${r.top?.[0] ? `  → #${r.top[0].id} ${r.top[0].title}${r.top[0].rel ? ` (${r.top[0].rel})` : ''}` : ''}${r.items?.length ? `  [imported: item ${r.items.map((i) => `${i.id} ${i.state}`).join(', ')}]` : ''}`);
  }
}));
