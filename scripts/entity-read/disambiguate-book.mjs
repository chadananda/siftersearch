// DISAMBIGUATION PASS (must run BEFORE any entity/claim extraction — see project_scene_context_layer).
// One GROWING cache per SEGMENT (not a staggered window): the SYSTEM prompt (instructions + book meta) is stable
// across the whole book; the USER prompt carries an ever-growing list of PRIOR PARAGRAPH SUMMARIES + the one new
// paragraph. Successive calls share the entire prior prefix → DeepSeek KV/prefix cache pays only for the new tail.
// The summaries ARE the rolling scene-state (bare name → full name, place, period), so identity established many
// paragraphs back is still present.
//
// SEGMENT = the growing-cache unit:
//   • GPB/DB fast-path (USE_TOC, auto for 21308/21310): segment by the book's real CHAPTER (parsed from the source
//     markdown <h> TOC), and feed each paragraph its CHAPTER · TITLE · SCENE label as the place/period anchor.
//   • General books: bounded runs (~SEGMAX paras, cut at a heading edge). A CAST/PLACE/PERIOD digest is carried
//     across every boundary either way, so no referent is dropped at a cut.
//
// Writes content.context (tag context_model='deepseek-disambig-v1'). Reversible:
//   UPDATE content SET context=NULL,context_model=NULL WHERE context_model='deepseek-disambig-v1' AND doc_id=?
//   DRY:   DOC=21308 CHAP="CHAPTER IX" node scripts/entity-read/disambiguate-book.mjs           (prints, no write)
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 DOC=21308 node scripts/entity-read/disambiguate-book.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const content = (await import('../../api/lib/content.js')).default;
const { chatCompletion } = await import('../../api/lib/ai.js');
const { assignChapters } = await import('./chapter-map.mjs');
const DOC = +(process.env.DOC || 21308);
const SEGMAX = +(process.env.SEGMAX || 60);
const WRITE = process.env.WRITE === '1';
const MODEL = process.env.MODEL || 'deepseek-chat';
const CHAP = process.env.CHAP || null;                 // restrict to one chapter (proof runs)
const USE_TOC = process.env.USE_TOC ? process.env.USE_TOC === '1' : [21308, 21310].includes(DOC);
const pnum = (pid) => +String(pid).replace(/\D/g, '');

const meta = (await queryAll(`SELECT title, author, religion, collection, year, description FROM docs WHERE id=?`, [DOC]))[0] || {};
const bookMeta = [`"${meta.title}" by ${meta.author || '?'}`, [meta.religion, meta.collection].filter(Boolean).join(' / '), meta.year ? `Year ${meta.year}` : '', meta.description ? `About: ${String(meta.description).slice(0, 240)}` : ''].filter(Boolean).join('\n');

const SYS = `You build a ROLLING DISAMBIGUATION INDEX for a historical narrative, one paragraph at a time. You are given the BOOK metadata, the current SCENE (chapter/section heading — your anchor for place and period), and the SUMMARIES of all preceding paragraphs in this chapter (the established context). For the CURRENT paragraph, write a compact standalone summary that RESOLVES every reference using that context — the narrative drops a person's nisba/full name once a scene has introduced them, so you MUST carry it forward.
Rules: (1) Resolve every bare name, title, epithet and pronoun to the FULL canonical name already established in the prior summaries, scene, or metadata (e.g. bare "Mírzá Aḥmad" → "Mírzá Aḥmad-i-Azghandí"). (2) State the PLACE and PERIOD in force — inherit from the SCENE heading and prior context when the paragraph doesn't restate them; the chapter title usually fixes the era/locale. (3) Use ONLY the book text, scene, and prior summaries — NO outside knowledge. (4) If a referent is genuinely NEW (not in prior context), keep the name as written and mark it (new).
Output EXACTLY two lines:
CAST: <bare/short>=<full canonical> ; <...> | PLACE: <place> | PERIOD: <period/date>
GLOSS: <1-2 sentences: what this paragraph asserts, every reference resolved to full names>

BOOK:
${bookMeta}`;

// Load main-text paragraphs (+ chapter/scene labels for the TOC fast-path)
let paras = await queryAll(`SELECT id, external_para_id pid, paragraph_index pidx, heading, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype='paragraph' AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [DOC]);
paras = paras.map((p) => ({ ...p, text: String(p.text).replace(/\s+/g, ' ').trim() }));
let segs;
if (USE_TOC) {
  const { paras: mapped } = await assignChapters(DOC);
  const byPid = new Map(mapped.map((m) => [m.pid, m]));
  paras = paras.map((p) => ({ ...p, ...(byPid.get(p.pid) || {}) }));
  if (CHAP) paras = paras.filter((p) => (p.chapterNum || '') === CHAP);
  // segment by chapterNum (consecutive)
  segs = []; let cur = [];
  for (const p of paras) { if (cur.length && p.chapterNum !== cur[cur.length - 1].chapterNum) { segs.push(cur); cur = []; } cur.push(p); }
  if (cur.length) segs.push(cur);
} else {
  segs = []; let cur = [];
  for (const p of paras) { const headChange = cur.length && p.heading !== cur[cur.length - 1].heading; if (cur.length >= SEGMAX && headChange) { segs.push(cur); cur = []; } cur.push(p); }
  if (cur.length) segs.push(cur);
}
console.error(`disambiguate DOC=${DOC} · ${paras.length} paras · ${segs.length} segments (${USE_TOC ? 'TOC/chapter' : 'bounded-run'}) · WRITE=${WRITE} · model=${MODEL}`);

let carried = ''; let done = 0;
for (const [si, seg] of segs.entries()) {
  const summaries = [];
  const label = USE_TOC ? (seg[0].chapterNum || 'front-matter') : `${seg[0].pid}..${seg[seg.length - 1].pid}`;
  console.error(`\n== segment ${si + 1}/${segs.length} · ${label} (${seg.length} paras) ==`);
  for (const p of seg) {
    const sceneLine = USE_TOC ? `${p.chapterNum || ''}${p.chapterTitle ? ' · ' + p.chapterTitle : ''}${p.scene ? ' · ' + p.scene : ''}`.trim() : (p.heading || '');
    const priorBlock = (carried ? `ENTERING — carried context: ${carried}\n` : '') + summaries.map((s) => s.line).join('\n');
    const user = `SCENE: ${sceneLine || '(none)'}\n\nESTABLISHED CONTEXT (prior paragraph summaries this chapter):\n${priorBlock || '(none — first paragraph)'}\n\nCURRENT PARAGRAPH [${p.pid}]:\n${p.text}`;
    let out = '';
    try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: user }], { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 320 }); out = (res.content || '').trim(); }
    catch (e) { console.error(`  [${p.pid}] FAIL ${String(e.message).slice(0, 50)}`); continue; }
    const castLine = (out.match(/CAST:.*/i) || [''])[0];
    summaries.push({ pid: p.pid, line: `[${p.pid}] ${out.replace(/\n/g, ' ')}` });
    carried = castLine.replace(/^CAST:\s*/i, '').slice(0, 400);
    done++;
    if (!WRITE) console.log(`\n${p.pid} (${sceneLine}):\n${out}`);
    else { await content.updateContextOnly(p.id, out, 'deepseek-disambig-v1'); if (done % 25 === 0) console.error(`  wrote ${done}`); }
  }
}
console.error(`\nDONE — ${done} paragraphs disambiguated${WRITE ? ' → content.context (model=deepseek-disambig-v1)' : ' (dry run)'}`);
process.exit(0);
