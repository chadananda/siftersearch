#!/usr/bin/env node
// SourceHunt over a spreadsheet of selections, through the PUBLIC API (POST /api/v1/source-hunt, X-API-Key). Each selection's
// text is hunted paragraph by paragraph (a selection may stitch several tablets); results append to a JSONL file, so a rerun
// resumes where it stopped. Key from SIFTER_API_KEY or the first of PUBLIC_API_KEYS — never printed.
//   node scripts/sourcehunt/batch-csv.mjs --csv=selections.csv --out=results.jsonl [--text-col="Full Text"] [--id-col="#"]
//     [--first-sentence]  hunt only each row's opening sentence (≥ 8 words) — the rows are continuous quotations
//     [--exclude-ids=20777,921362]  publications that may not be the answer (the compilation being checked)
import { readFileSync, appendFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const arg = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const CSV = arg('csv'), OUT = arg('out'), TEXT = arg('text-col', 'Full Text'), ID = arg('id-col', '#');
const BASE = process.env.SOURCEHUNT_API || 'https://api.siftersearch.com';
const KEY = process.env.SIFTER_API_KEY || (process.env.PUBLIC_API_KEYS || '').split(',')[0];
const CONC = Number(arg('concurrency', 3)), MAXW = Number(arg('max-words', 120)), FIRST = args.includes('--first-sentence');
const EXCLUDE = arg('exclude-ids') ? { documentIds: arg('exclude-ids').split(',').map(Number) } : null;
if (!CSV || !OUT || !KEY) { console.error('need --csv, --out and an API key'); process.exit(1); }

/** RFC-4180 CSV (quoted fields with commas, quotes and newlines). */
function parseCsv(s) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// a paragraph is a quotation in its own right; a long one is hunted by its opening MAXW words (a contiguous stretch)
const paragraphs = (text) => String(text).split(/\n\s*\n|\n/).map((p) => p.trim()).filter((p) => p.split(/\s+/).length >= 8)
  .map((p) => p.split(/\s+/).slice(0, MAXW).join(' '));
// the opening sentence (sentences joined until ≥ 8 words, so "O Son of Spirit!" carries on into its first counsel)
function firstSentence(text) {
  const sents = String(text).trim().match(/[^.!?]+(?:[.!?]+[”’"')\]]*|$)/g) || [];
  let out = '';
  for (const x of sents) { out += x; if (out.trim().split(/\s+/).length >= 8) break; }
  return out.trim().split(/\s+/).slice(0, MAXW).join(' ');
}

const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l); return `${x.id}#${x.k}`; }) : []);
const rows = parseCsv(readFileSync(CSV, 'utf8'));
const jobs = rows.flatMap((r) => (FIRST ? [firstSentence(r[TEXT])].filter((x) => x.split(/\s+/).length >= 4) : paragraphs(r[TEXT]))
  .map((q, k) => ({ id: r[ID], k, q }))).filter((j) => !done.has(`${j.id}#${j.k}`));
console.error(`${rows.length} selections · ${jobs.length} paragraphs to hunt (${done.size} already done)`);

async function hunt(j) {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/v1/source-hunt`, { method: 'POST', signal: AbortSignal.timeout(120000),
        headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY }, body: JSON.stringify({ quote: j.q, ...(EXCLUDE ? { exclude: EXCLUDE } : {}) }) });
      if (res.status >= 500 || res.status === 429) { await new Promise((r) => setTimeout(r, 15000 * (attempt + 1))); continue; }
      const body = await res.json().catch(() => ({}));
      return { ...j, status: res.status, ms: Date.now() - t0, r: body };
    } catch (e) { if (attempt === 3) return { ...j, status: 0, error: e.message }; await new Promise((r) => setTimeout(r, 15000)); }
  }
  return { ...j, status: 0, error: 'retries exhausted' };
}

let next = 0, n = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    appendFileSync(OUT, JSON.stringify(await hunt(j)) + '\n');
    if (++n % 25 === 0) console.error(`${n}/${jobs.length}`);
  }
}));
console.error('done', n);
