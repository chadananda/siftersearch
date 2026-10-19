// Dewey benchmark — ask Dewey about every case (POST /api/dewey/holdings with the file, exactly as an upload) and record
// the answer. Resumable: cases already in results.jsonl are skipped. Serial (one at a time — production API).
// usage: node scripts/dewey-bench/run.mjs [--only P3,N1] [--redo]
import { readFile, appendFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const API = process.env.API_URL || 'https://api.siftersearch.com';
const KEY = process.env.DEWEY_KEY || (await readFile('tmp/dewey-test-key', 'utf8').catch(() => '')).match(/sk_[\w-]+/)?.[0];
const OUT = 'tmp/dewey-bench';
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const results = `${OUT}/results.jsonl`;
if (args.includes('--redo')) await writeFile(results, '');
const done = new Set(existsSync(results) ? (await readFile(results, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
const manifest = JSON.parse(await readFile(`${OUT}/manifest.json`, 'utf8'));

for (const c of manifest) {
  if (done.has(c.id) || (only && !only.some((p) => c.id.startsWith(`${p}-`) || c.id.startsWith(p)))) continue;
  const data = (await readFile(c.file)).toString('base64');
  const t0 = Date.now();
  let res, err = null;
  for (let k = 0; k < 3; k++) {
    try {
      err = null;
      const r = await fetch(`${API}/api/dewey/holdings`, { method: 'POST', headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: { name: c.file.split('/').pop(), data } }), signal: AbortSignal.timeout(300000) });
      res = await r.json().catch(() => ({}));
      if (r.status === 429) { await new Promise((z) => setTimeout(z, 60000)); continue; }
      if (!r.ok) err = `${r.status} ${res.message || res.error || ''}`.trim();
      break;
    } catch (e) { err = e.message; await new Promise((z) => setTimeout(z, 10000)); }
  }
  const top = (res?.candidates || []).slice(0, 3).map((x) => ({ id: x.id, title: x.title, relation: x.relation?.relation ?? x.relation ?? null,
    ours_in_theirs: x.relation?.ours_in_theirs, theirs_in_ours: x.relation?.theirs_in_ours, evidence: (x.evidence || []).map((e) => e.kind) }));
  const row = { id: c.id, scenario: c.scenario, expect: c.expect, verdict: res?.verdict ?? null, error: err, ms: Date.now() - t0,
    identified: res?.identified ? { title: res.identified.title, author: res.identified.author, kind: res.identified.kind, needs_ocr: res.identified.needs_ocr } : null,
    compared: res?.compared || null, top, source: c.source?.id ?? null,
    source_found: c.source ? (res?.candidates || []).some((x) => x.id === c.source.id) : null };
  await appendFile(results, `${JSON.stringify(row)}\n`);
  console.log(`${c.id.padEnd(28)} ${String(row.verdict).padEnd(18)} ${c.expect.includes(row.verdict) ? 'ok ' : 'XX '} ${Math.round(row.ms / 1000)}s ${err || ''}`);
}
