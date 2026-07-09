// Cross-corpus resolver. Builds candidate same-core pairs (from the cluster cleanup's REVIEW/REJECT merges +
// flagged groups), and for each pulls DB context (summary/aliases/mention snippets) AND Meili-discovers the
// name across the WHOLE library. DeepSeek does the NARROWING: it auto-confirms the DISTINCT majority and
// hands every "same"/"uncertain" pair to a worklist WITH all evidence pre-assembled, so Opus (the subscription
// agent — NOT the API) can adjudicate the hard merge calls by reading the file. PAIRS="a,b;c,d" forces a set.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync, existsSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
const DOC = 21308, dir = 'tmp/entity-research/seqread';

// ---- build candidate pairs ----
let pairs = [];
if (process.env.PAIRS) pairs = process.env.PAIRS.split(';').filter(Boolean).map(p => p.split(',').map(Number));
else {
  const seen = new Set(); const add = (a, b) => { const k = [a, b].sort().join('|'); if (a && b && a !== b && !seen.has(k)) { seen.add(k); pairs.push([a, b]); } };
  if (existsSync(`${dir}/merge-verified.json`)) for (const o of JSON.parse(readFileSync(`${dir}/merge-verified.json`, 'utf8'))) if (o.verdict !== 'SAFE') add(o.keep, o.absorb);
  const prop = JSON.parse(readFileSync(`${dir}/cluster-merge-proposals.json`, 'utf8'));
  for (const o of prop) for (const f of (o.flags || [])) { const g = (f.ids || []).filter(Boolean); if (g.length >= 2 && g.length <= 4) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) add(g[i], g[j]); }
}
const ids = [...new Set(pairs.flat())];
console.error(`candidate pairs: ${pairs.length} over ${ids.length} entities`);

const ge = new Map((await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases a, er.summary s, er.side FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id IN (${ids.join(',')})`)).map(r => [r.id, r]));
const ment = await graphQueryAll(`SELECT entity_id, content_id FROM entity_mentions WHERE entity_id IN (${ids.join(',')})`);
const wantC = [...new Set(ment.map(m => String(m.content_id)))];
const ctext = new Map((await queryAll(`SELECT id, paragraph_index pi, substr(replace(text,char(10),' '),1,200) t FROM content WHERE id IN (${wantC.join(',') || 0})`)).map(r => [String(r.id), r]));
const snips = new Map();
for (const m of ment) { const c = ctext.get(String(m.content_id)); if (!c) continue; if (!snips.has(m.entity_id)) snips.set(m.entity_id, []); const a = snips.get(m.entity_id); if (a.length < 3) a.push(`[¶${c.pi}] ${c.t}`); }
const docTitle = new Map((await queryAll('SELECT id, substr(title,1,32) t FROM docs')).map(r => [r.id, r.t]));
async function discover(e) {
  if (!meili || !e) return [];
  const q = e.cn.replace(/\(.*?\)/g, '').replace(/martyr of.*/i, '').trim();
  try {
    const res = await meili.index(INDEXES.PARAGRAPHS).search(q, { limit: 6, attributesToRetrieve: ['id', 'doc_id'] });
    const hits = (res.hits || []).filter(h => h.doc_id !== DOC).slice(0, 4);
    if (!hits.length) return [];
    const rows = await queryAll(`SELECT id, doc_id, substr(replace(text,char(10),' '),1,220) t FROM content WHERE id IN (${hits.map(h => h.id).join(',')})`);
    return rows.map(r => `[${docTitle.get(r.doc_id) || r.doc_id}] ${r.t}`);
  } catch { return []; }
}
const aliasesOf = e => { try { return JSON.parse(e.a || '[]'); } catch { return []; } };
const block = e => `id ${e.id}: "${e.cn}" [side ${e.side || '?'}]\n  summary: ${(e.s || '(none)').slice(0, 220)}\n  aliases: ${aliasesOf(e).join(' | ')}\n  DB mentions: ${(snips.get(e.id) || []).join(' // ') || '(none)'}`;

const SYS = `Decide if TWO Bábí/Bahá'í-history entities are SAME, DISTINCT, or UNCERTAIN, from their DB context + cross-corpus evidence. Default DISTINCT; use UNCERTAIN for any genuinely close call (it goes to a human). A shared given name proves nothing. ONE shared relationship to a common-named third party ("…Khán", a bare given name) is NOT proof — there are two distinct Sulaymán Kháns of Ádhirbáyján each with a father Yaḥyá Khán, so "father of Sulaymán Khán" => UNCERTAIN unless that third party is uniquely pinned by episode/date. HARD DISTINCT: enumeration markers, different kin, different nisba/place, different fate/period, honorific CLASS change (Siyyid↔Mírzá↔Karbilá'í↔Mullá; added Ḥájí/Áqá is not). SAME needs an explicit linking clause OR ≥2 independent matching attributes across BOTH DB and corpus. Return ONLY JSON: {"verdict":"same"|"distinct"|"uncertain","confidence":0..1,"evidence":"..."}.`;

const out = []; const CONC = 6;
for (let i = 0; i < pairs.length; i += CONC) {
  const batch = await Promise.all(pairs.slice(i, i + CONC).map(async ([a, b]) => {
    const ea = ge.get(a), eb = ge.get(b); if (!ea || !eb) return { a, b, verdict: 'missing' };
    const [da, db] = await Promise.all([discover(ea), discover(eb)]);
    const prompt = `ENTITY A — ${block(ea)}\n  CORPUS: ${da.join(' // ') || '(none)'}\n\nENTITY B — ${block(eb)}\n  CORPUS: ${db.join(' // ') || '(none)'}`;
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: prompt }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 450, responseFormat: { type: 'json_object' } });
      const m = (res.content || '').match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : {};
      return { a, b, an: ea.cn, bn: eb.cn, verdict: j.verdict || 'uncertain', confidence: j.confidence ?? null, evidence: (j.evidence || '').slice(0, 300), evA: block(ea), evB: block(eb), corpusA: da, corpusB: db };
    } catch (e) { return { a, b, an: ea.cn, bn: eb.cn, verdict: 'error', error: String(e).slice(0, 80) }; }
  }));
  out.push(...batch); process.stderr.write(`  ${Math.min(i + CONC, pairs.length)}/${pairs.length}\n`);
}
const bucket = v => out.filter(o => o.verdict === v);
// worklist for manual Opus adjudication = everything not a clean DISTINCT
const worklist = out.filter(o => ['same', 'uncertain', 'error'].includes(o.verdict));
writeFileSync(`${dir}/cross-resolve-out.json`, JSON.stringify(out, null, 1));
writeFileSync(`${dir}/cross-resolve-worklist.json`, JSON.stringify(worklist, null, 1));
console.log(`\npairs: ${out.length} | DISTINCT(auto) ${bucket('distinct').length} | SAME ${bucket('same').length} | UNCERTAIN ${bucket('uncertain').length} | missing/err ${out.filter(o => ['missing', 'error'].includes(o.verdict)).length}`);
console.log(`worklist for manual adjudication: ${worklist.length} -> cross-resolve-worklist.json\n`);
for (const o of worklist) console.log(`  [${o.verdict}${o.confidence != null ? ' ' + o.confidence : ''}] ${o.a} "${o.an}" ~ ${o.b} "${o.bn}"\n     ${o.evidence}`);
process.exit(0);
