// DRY RUN (read-only): align OceanLibrary site-file paragraph ids (id="para_N") onto the LIVE copies of each book by
// text, and report how many live paragraphs would gain an external_para_id. Nothing is written.
// Chad: "Look in the Oceanlibrary books. the para_id is there for every paragraph." / "oceanlibrary.com is always the
// core canonical". Run: node scripts/wip/ol-paraid-align.mjs [out.json]
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { foldText } = await import('../../api/lib/quote-text.js');
const ROOT = `${process.env.HOME}/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library/-sites/oceanlibrary.com/Bahá'í`;
const KEY = process.env.PUBLIC_SIFTER_API_KEY;
const IK = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
const API = 'https://api.siftersearch.com';

const files = fs.readdirSync(ROOT, { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => path.join(ROOT, f));
const clean = (t) => foldText(String(t).replace(/\[pg \d+\]/gi, ' ').replace(/^\s*\[[\d.]+\]\s*/, '').replace(/[*_#>]/g, ' '));
const keyOf = (t) => clean(t).slice(0, 90);

function parseSite(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
  const title = (fm.match(/^title:\s*['"]?(.+?)['"]?\s*$/m) || [])[1];
  const sourceUrl = (fm.match(/^source_url:\s*['"]?(.+?)['"]?\s*$/m) || [])[1];
  const paras = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^(.*)\{[^}]*\bid="(para_\d+)"[^}]*\btype="par"[^}]*\}\s*$/);
    if (m && clean(m[1]).length >= 40) paras.push({ id: m[2], key: keyOf(m[1]) });
  }
  return { file: path.basename(file), title, sourceUrl, paras };
}

async function j(url, headers) { const r = await fetch(url, { headers, signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
const report = [];
for (const file of files) {
  const site = parseSite(file);
  if (!site.title || !site.paras.length) { report.push({ book: path.basename(file), note: 'no title or no par ids parsed' }); continue; }
  const byKey = new Map(site.paras.map((p) => [p.key, p.id]));
  const cands = (await j(`${API}/api/v1/library/find-document?title=${encodeURIComponent(site.title)}`, { 'X-API-Key': KEY }).catch(() => ({ candidates: [] }))).candidates || [];
  const same = cands.filter((c) => foldText(c.title) === foldText(site.title)).slice(0, 4);
  const docs = [];
  for (const c of same) {
    const d = await j(`${API}/api/admin/docs/${c.document_id}/paragraphs?limit=100000`, { 'X-Internal-Key': IK }).catch(() => ({ paragraphs: [] }));
    const ps = (d.paragraphs || []).filter((p) => clean(p.text).length >= 40);
    let exact = 0, prefix = 0;
    for (const p of ps) {
      const k = keyOf(p.text);
      if (byKey.has(k)) { exact++; continue; }
      const k60 = k.slice(0, 60);
      if (site.paras.some((s) => s.key.startsWith(k60))) prefix++;
    }
    docs.push({ doc: c.document_id, author: c.author, live: ps.length, aligned: exact + prefix, exact, pct: ps.length ? Math.round(((exact + prefix) / ps.length) * 100) : 0 });
  }
  report.push({ book: site.title, siteParas: site.paras.length, sourceUrl: site.sourceUrl, docs });
  process.stderr.write('.');
}
fs.writeFileSync(process.argv[2] || 'ol-paraid-align.json', JSON.stringify(report, null, 1));
console.log(`\n${files.length} OceanLibrary site files`);
for (const r of report) {
  if (r.note) { console.log(`  ${r.book.slice(0, 50).padEnd(50)} ${r.note}`); continue; }
  const d = r.docs.map((x) => `${x.doc}: ${x.aligned}/${x.live} (${x.pct}%)`).join('  ') || 'NO LIVE DOC FOUND';
  console.log(`  ${r.book.slice(0, 50).padEnd(50)} site ${String(r.siteParas).padStart(5)} ¶ | ${d}`);
}
