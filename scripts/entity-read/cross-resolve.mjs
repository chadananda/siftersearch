// Cross-corpus resolver for flagged same-core pairs: for each entity pull its DB context (summary + aliases +
// mention snippets) AND Meili-discover its distinctive name across the WHOLE library (scholarly works included)
// to surface what the rest of the corpus knows; then adjudicate MERGE vs DISTINCT with cited evidence, under
// the hardened doctrine (enumeration/kin/class = distinct; common name + one shared relation ≠ same person —
// pin by episode/date; merge only on positive sameness). Read-only. PAIRS env = "a,b;c,d" for validation.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
const DOC = 21308;
const pairs = (process.env.PAIRS || '').split(';').filter(Boolean).map(p => p.split(',').map(Number));

const ids = [...new Set(pairs.flat())];
const ge = new Map((await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases a, er.summary s, er.side FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id IN (${ids.join(',')})`)).map(r => [r.id, r]));
// DB mention snippets per entity
const ment = await graphQueryAll(`SELECT entity_id, content_id FROM entity_mentions WHERE entity_id IN (${ids.join(',')})`);
const wantC = [...new Set(ment.map(m => String(m.content_id)))];
const ctext = new Map((await queryAll(`SELECT id, paragraph_index pi, substr(replace(text,char(10),' '),1,200) t FROM content WHERE id IN (${wantC.join(',') || 0})`)).map(r => [String(r.id), r]));
const snips = new Map();
for (const m of ment) { const c = ctext.get(String(m.content_id)); if (!c) continue; if (!snips.has(m.entity_id)) snips.set(m.entity_id, []); const a = snips.get(m.entity_id); if (a.length < 3) a.push(`[¶${c.pi}] ${c.t}`); }

const docTitle = new Map((await queryAll('SELECT id, substr(title,1,32) t FROM docs')).map(r => [r.id, r.t]));
async function discover(e) {
  if (!meili) return [];
  // distinctive query: drop bare honorifics, keep nisba/name; search whole corpus
  const q = e.cn.replace(/\(.*?\)/g, '').replace(/martyr of.*/i, '').trim();
  try {
    const res = await meili.index(INDEXES.PARAGRAPHS).search(q, { limit: 6, attributesToRetrieve: ['id', 'doc_id'] });
    const hits = (res.hits || []).filter(h => h.doc_id !== DOC).slice(0, 4);   // cross-corpus only (other books)
    if (!hits.length) return [];
    const rows = await queryAll(`SELECT id, doc_id, substr(replace(text,char(10),' '),1,200) t FROM content WHERE id IN (${hits.map(h => h.id).join(',')})`);
    return rows.map(r => `[${docTitle.get(r.doc_id) || r.doc_id}] ${r.t}`);
  } catch { return []; }
}

const SYS = `You decide whether TWO entities from a Bábí/Bahá'í history are the SAME person, DISTINCT namesakes, or UNCERTAIN, using their DB context AND cross-corpus library evidence. Default DISTINCT; assert SAME only on strong positive evidence; use UNCERTAIN whenever the call is genuinely close (it routes to a human). RULES:
- Shared given name is NORMAL and proves nothing.
- ONE shared RELATIONSHIP to a third person is NOT proof of sameness when names are common — e.g. there are TWO distinct Sulaymán Kháns of Ádhirbáyján, each with a military father named Yaḥyá Khán, so "father of Sulaymán Khán" is shared by two DIFFERENT Yaḥyá Kháns. HARD RULE: if the only evidence for SAME is a shared relation to a third party with a common name/title ("…Khán", a bare given name), and that third party is NOT uniquely pinned by a specific episode/date, you MUST answer "uncertain" (never "same").
- HARD DISTINCT: enumeration markers ("(martyr of X)","second martyr of","idx N"), different stated kinship, different nisba/place, different fate/period of death, honorific CLASS change (Siyyid↔Mírzá↔Karbilá'í↔Mullá — an added Ḥájí/Áqá is NOT a class change).
- SAME requires EITHER an explicit linking clause ("better known as","surnamed","the same who","whose real name"), OR a confluence of ≥2 independent matching attributes (nisba AND role, or kin AND fate, etc.) consistent across BOTH DB and corpus — never a single attribute.
- Cite which corpus passage / signal drove the call. Prefer "uncertain" over a shaky "same".
Return ONLY JSON: {"verdict":"same"|"distinct"|"uncertain","confidence":0..1,"evidence":"...","keep":<id if same>}.`;

const out = [];
for (const [a, b] of pairs) {
  const ea = ge.get(a), eb = ge.get(b); if (!ea || !eb) { out.push({ a, b, error: 'missing' }); continue; }
  const [da, db] = await Promise.all([discover(ea), discover(eb)]);
  const block = e => `id ${e.id}: "${e.cn}" [side ${e.side || '?'}]\n  summary: ${(e.s || '(none)').slice(0, 200)}\n  aliases: ${(() => { try { return JSON.parse(e.a || '[]').join(' | '); } catch { return ''; } })()}\n  DB mentions: ${(snips.get(e.id) || []).join(' // ') || '(none)'}`;
  const prompt = `ENTITY A — ${block(ea)}\n  CORPUS (other books): ${da.join(' // ') || '(none found)'}\n\nENTITY B — ${block(eb)}\n  CORPUS (other books): ${db.join(' // ') || '(none found)'}`;
  try {
    const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: prompt }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 500, responseFormat: { type: 'json_object' } });
    const m = (res.content || '').match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : {};
    out.push({ a, b, an: ea.cn, bn: eb.cn, ...j, corpusA: da.length, corpusB: db.length });
  } catch (e) { out.push({ a, b, error: String(e).slice(0, 80) }); }
}
for (const o of out) console.log(`\n${o.a} "${o.an}" ~ ${o.b} "${o.bn}"\n  => ${o.verdict || o.error} (conf ${o.confidence ?? '?'}, corpus ${o.corpusA}/${o.corpusB})\n  ${(o.evidence || '').slice(0, 280)}`);
process.exit(0);
