// DISAMBIGUATION PASS (must run BEFORE any entity/claim extraction — see project_scene_context_layer).
// One GROWING cache per segment (not a staggered window): the SYSTEM prompt (instructions + book meta) is stable
// across the whole book; the USER prompt carries an ever-growing list of PRIOR PARAGRAPH SUMMARIES + the one new
// paragraph. Successive calls share the entire prior prefix → DeepSeek KV/prefix cache pays only for the new tail.
// The summaries ARE the rolling scene-state (bare name → full name, place, period), so identity established 30
// paragraphs back is still present. Segments are bounded (~SEGMAX main-text paras, cut at a heading edge) and a
// compact CAST/PLACE/PERIOD digest is carried across each boundary so no referent is ever dropped at a cut.
// Writes content.context (tag context_model). Reversible: UPDATE content SET context=NULL,context_model=NULL WHERE context_model='deepseek-disambig-v1' AND doc_id=?.
//   DRY:   node scripts/entity-read/disambiguate-book.mjs               (DOC=21308 default, prints, no write)
//   PROOF: DOC=21308 PIDMIN=524 PIDMAX=560 node scripts/entity-read/disambiguate-book.mjs
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 DOC=21308 node scripts/entity-read/disambiguate-book.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const content = (await import('../../api/lib/content.js')).default;
const { chatCompletion } = await import('../../api/lib/ai.js');
const DOC = +(process.env.DOC || 21308);
const SEGMAX = +(process.env.SEGMAX || 60);
const WRITE = process.env.WRITE === '1';
const MODEL = process.env.MODEL || 'deepseek-chat';
const PIDMIN = process.env.PIDMIN ? +process.env.PIDMIN : null;
const PIDMAX = process.env.PIDMAX ? +process.env.PIDMAX : null;
const pnum = (pid) => +String(pid).replace(/\D/g, '');

const meta = (await queryAll(`SELECT title, author, religion, collection, year, description FROM docs WHERE id=?`, [DOC]))[0] || {};
const bookMeta = [`"${meta.title}" by ${meta.author || '?'}`, [meta.religion, meta.collection].filter(Boolean).join(' / '), meta.year ? `Year ${meta.year}` : '', meta.description ? `About: ${String(meta.description).slice(0, 240)}` : ''].filter(Boolean).join('\n');

const SYS = `You build a ROLLING DISAMBIGUATION INDEX for a historical narrative, one paragraph at a time. You are given the BOOK metadata and the SUMMARIES of all preceding paragraphs in this scene (the established context). For the CURRENT paragraph, write a compact standalone summary that RESOLVES every reference using that established context — the narrative drops a person's nisba/full name once a scene has introduced them, so you must carry it forward.
Rules: (1) Resolve every bare name, title, epithet and pronoun to the FULL canonical name already established in the prior summaries or metadata (e.g. bare "Mírzá Aḥmad" → "Mírzá Aḥmad-i-Azghandí"). (2) State the PLACE and PERIOD in force, inheriting from prior context when the paragraph doesn't restate them. (3) Use ONLY the book text and the prior summaries — NO outside knowledge. (4) If a referent is genuinely NEW (not in prior context), keep the name as written and mark it (new).
Output EXACTLY two lines:
CAST: <bare or short form>=<full canonical> ; <...> | PLACE: <place> | PERIOD: <period/date>
GLOSS: <1-2 sentences: what this paragraph asserts, every reference resolved to full names>

BOOK:
${bookMeta}`;

// main-text paragraphs in reading order
let paras = await queryAll(`SELECT id, external_para_id pid, paragraph_index pidx, heading, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype='paragraph' AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [DOC]);
paras = paras.map((p) => ({ ...p, text: String(p.text).replace(/\s+/g, ' ').trim() }));
if (PIDMIN != null) paras = paras.filter((p) => pnum(p.pid) >= PIDMIN && pnum(p.pid) <= (PIDMAX ?? PIDMIN));
console.error(`disambiguate DOC=${DOC}: ${paras.length} main-text paragraphs · SEGMAX=${SEGMAX} · WRITE=${WRITE} · model=${MODEL}`);

// segment into bounded runs, cut at a heading edge once past SEGMAX
const segs = []; let cur = [];
for (let i = 0; i < paras.length; i++) { const p = paras[i]; const headChange = cur.length && p.heading !== cur[cur.length - 1].heading;
  if (cur.length >= SEGMAX && headChange) { segs.push(cur); cur = []; } cur.push(p); }
if (cur.length) segs.push(cur);
console.error(`segments: ${segs.length}`);

let carried = ''; let done = 0;
for (const [si, seg] of segs.entries()) {
  const summaries = [];  // this segment's growing list
  console.error(`\n== segment ${si + 1}/${segs.length} · ${seg[0].pid}..${seg[seg.length - 1].pid} (${seg.length} paras) ==`);
  for (const p of seg) {
    const priorBlock = (carried ? `ENTERING SCENE — carried context: ${carried}\n` : '') + summaries.map((s) => s.line).join('\n');
    const user = `ESTABLISHED CONTEXT (prior paragraph summaries):\n${priorBlock || '(none — first paragraph of the book)'}\n\nCURRENT PARAGRAPH [${p.pid}]:\n${p.text}`;
    let out = '';
    try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: user }], { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 320 }); out = (res.content || '').trim(); }
    catch (e) { console.error(`  [${p.pid}] FAIL ${String(e.message).slice(0, 50)}`); continue; }
    const castLine = (out.match(/CAST:.*/i) || [''])[0];
    summaries.push({ pid: p.pid, line: `[${p.pid}] ${out.replace(/\n/g, ' ')}` });
    carried = castLine.replace(/^CAST:\s*/i, '').slice(0, 400);  // last CAST/place/period becomes the entering digest
    done++;
    if (!WRITE) console.log(`\n${p.pid}:\n${out}`);
    else { await content.updateContextOnly(p.id, out, 'deepseek-disambig-v1'); if (done % 25 === 0) console.error(`  wrote ${done}`); }
  }
}
console.error(`\nDONE — ${done} paragraphs disambiguated${WRITE ? ' (written to content.context, model=deepseek-disambig-v1)' : ' (dry run)'}`);
process.exit(0);
