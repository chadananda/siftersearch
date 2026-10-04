#!/usr/bin/env node
// DRY RUN (runs ON tower): staged OOL docx for volumes the library lacks (Makátíb 1–2, Muntakhabát 3–6) → per tablet,
// is its text already held under another doc? BM25 on Qdrant `paragraphs_kw` for the tablet's longest paragraph, then
// word-shingle containment against the hit's text decides. Writes a report; ingests and changes NOTHING.
//   node scripts/library/ool-missing-dryrun.mjs <staging dir> <out.json>
// Deps: python3 + python-docx (mammoth breaks on our xmldom), api/lib/keyword-tokens.js. Env: QDRANT_KEY.
import Database from 'better-sqlite3';
import { execFileSync } from 'child_process';
import { readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bm25Query, tokens } from '../../api/lib/keyword-tokens.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [DIR, OUT] = process.argv.slice(2);
const QD = 'http://127.0.0.1:6333', QK = process.env.QDRANT_KEY || '';
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true });
const para = db.prepare(`SELECT c.id, c.doc_id, c.paragraph_index pidx, c.text, d.title, d.collection, d.scope, d.file_path
  FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id = ?`);
// containment is measured against the hit's WHOLE document: the library may split a docx paragraph into several
const docText = db.prepare(`SELECT group_concat(text, ' ') t FROM (SELECT text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index)`);

const VOL = [[/makateeb-0(\d)-(\d+)/, 'Makátíb-i-‘Abdu’l-Bahá, vol. '], [/selections-writings0(\d)-(\d+)/, 'Muntakhabátí az Makátíb-i-‘Abdu’l-Bahá, vol. ']];
const HEAD = /^(حضرت عبدالبهاء|نسخه اصل فارسی|[\d۰-۹]+)$/;

// share of the tablet paragraph's 5-word shingles found in the candidate document (shingle sets cached per doc: big
// compilations recur as hits, and re-tokenising them per tablet made the run CPU-bound)
const shingles = (t) => { const w = tokens(t), s = new Set(); for (let i = 0; i + 5 <= w.length; i++) s.add(w.slice(i, i + 5).join(' ')); return s; };
const docShingles = new Map();
function containment(a, docId) {
  if (!docShingles.has(docId)) docShingles.set(docId, shingles((docText.get(docId)?.t || '').replace(/⁅\/?s\d+⁆/g, '')));
  const A = shingles(a), B = docShingles.get(docId); if (!A.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / A.size;
}

// retries socket errors: an idle keep-alive socket closed by Qdrant gets reused ('other side closed')
async function kw(text, attempt = 0) {
  try { return await kwOnce(text); }
  catch (e) { if (attempt >= 4 || /^qdrant \d/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); return kw(text, attempt + 1); }
}
async function kwOnce(text) {
  const r = await fetch(`${QD}/collections/paragraphs_kw/points/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': QK },
    body: JSON.stringify({ query: bm25Query(text), using: 'bm25', limit: 5, with_payload: ['paragraph_id'] }) });
  if (!r.ok) throw new Error(`qdrant ${r.status}`);
  return (await r.json()).result.points.map((p) => p.payload.paragraph_id);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.docx')).sort();
const PY = 'import docx,json,sys,os\nd=sys.argv[1]\nprint(json.dumps({f:[p.text for p in docx.Document(os.path.join(d,f)).paragraphs] for f in sorted(os.listdir(d)) if f.endswith(".docx")}))';
const texts = JSON.parse(execFileSync('python3', ['-c', PY, DIR], { maxBuffer: 1 << 30 }).toString());
const rows = [];
for (const f of files) {
  const [re, name] = VOL.find(([r]) => r.test(f)); const [, vol, no] = f.match(re);
  const ps = texts[f].map((s) => s.trim()).filter(Boolean);
  const body = ps.slice(1).filter((p) => !HEAD.test(p));                  // line 1 = OOL's incipit summary
  const words = body.reduce((s, p) => s + tokens(p).length, 0);
  // probe the two longest paragraphs (one probe missed tablets whose longest paragraph differs in the library's edition)
  const probes = [...body].sort((a, b) => b.length - a.length).slice(0, 2).filter((p) => tokens(p).length >= 8);
  const probe = probes[0] || '';
  let held = null;
  for (const pr of probes) {
    for (const pid of await kw(pr.slice(0, 2000))) {
      const p = para.get(pid); if (!p) continue;
      const c = containment(pr, p.doc_id);
      if (c >= 0.6 && (!held || c > held.containment)) held = { containment: +c.toFixed(2), doc: p.doc_id, pidx: p.pidx, title: p.title, collection: p.collection, scope: p.scope, file: p.file_path };
    }
    if (held) break;
  }
  rows.push({ file: f, collection: name + vol, no: +no, incipit: ps[0]?.replace(/…$/, ''), paragraphs: body.length, words, short_probe: tokens(probe).length < 8, held });
}

const by = {};
for (const r of rows) {
  const b = (by[r.collection] ||= { tablets: 0, words: 0, new: 0, held_primary: 0, held_supplemental_only: 0, unchecked: 0 });
  b.tablets++; b.words += r.words;
  if (r.short_probe) b.unchecked++; else if (!r.held) b.new++; else if (r.held.scope === 'primary') b.held_primary++; else b.held_supplemental_only++;
}
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), summary: by, rows }, null, 1));
console.log(JSON.stringify(by, null, 1));
