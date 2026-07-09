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

const SYS = `You write a MINIMAL disambiguation note for ONE paragraph of a historical narrative. An AI (not a parser) will read your note alongside the paragraph so it can identify the people and place without having read the earlier text. Write ONLY what that reader could NOT work out from this paragraph by itself — nothing more.

You get the BOOK metadata, the SCENE (chapter + section heading), the running PLACE/ERA, and the notes for preceding paragraphs (identity established earlier carries forward, because the narrative drops a person's titles/nisba once a scene has introduced them).

Include, and only include:
• PLACE and ERA in force. Inherit from the running context; change only when THIS paragraph moves location or time. The chapter fixes the era — give an approximate time (a year or short range), NOT the heading text.
• Any bare / elided / variant name or ambiguous epithet the paragraph uses, resolved to the full canonical handle established earlier — this is the main job (e.g. bare "Mírzá Aḥmad" here = Mírzá Aḥmad-i-Azghandí). KEEP honorifics/titles (Mírzá, Mullá, Siyyid, Ḥájí, Karbilá'í, Mashhadí, Ustád, Áqá) — they discriminate when nisbas match or are absent and are sometimes the whole handle (Karbilá'í-‘Alí); never strip them. Use the most-used handle (Quddús, Vaḥíd, the Báb). A heavily title-dropped bare name resolves by COMMON REFERENCE to the most-prominent bearer; one person may carry two names (bare "Mírzá Aḥmad" in the Bábí-scribe context = Mullá ‘Abdu'l-Karím-i-Qazvíní).
• A pronoun ONLY when its referent is genuinely unclear from this paragraph (several people in play). Skip pronouns that are obvious. Inside quoted speech, I/We/Our = the speaker.

Do NOT restate a name already written in full; do NOT resolve what is already clear; do NOT map generic phrases ("the Cause", "the Faith"); do NOT add outside knowledge. If a reference truly cannot be resolved from context, mark it "?". If nothing beyond place/era needs saying, give just the place/era.

Format (compact prose for an AI reader — no rigid syntax): "@<place>, ~<era> — <only the resolutions actually needed>". Example: "@Yazd, ~1845 — "Mírzá Aḥmad" = Mírzá Aḥmad-i-Azghandí; "Siyyid Ḥusayn" = Siyyid Ḥusayn-i-Azghandí (his uncle)."

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

const placeEraOf = (note) => { const m = String(note).match(/@[^—|]*/); return m ? m[0].replace(/^@/, '').trim() : ''; };
let runPlaceEra = ''; let done = 0;
for (const [si, seg] of segs.entries()) {
  const summaries = [];
  const label = USE_TOC ? (seg[0].chapterNum || 'front-matter') : `${seg[0].pid}..${seg[seg.length - 1].pid}`;
  console.error(`\n== segment ${si + 1}/${segs.length} · ${label} (${seg.length} paras) ==`);
  for (const p of seg) {
    const sceneLine = USE_TOC ? `${p.chapterNum || ''}${p.chapterTitle ? ' · ' + p.chapterTitle : ''}${p.scene ? ' · ' + p.scene : ''}`.trim() : (p.heading || '');
    const priorBlock = summaries.slice(-12).map((s) => s.line).join('\n');
    const user = `SCENE: ${sceneLine || '(none)'}\nRUNNING PLACE/ERA (inherit unless this paragraph moves): ${runPlaceEra || '(not yet established — infer from scene)'}\n\nNOTES FOR PRECEDING PARAGRAPHS (identity established here carries forward):\n${priorBlock || '(none — first paragraph of the chapter)'}\n\nCURRENT PARAGRAPH [${p.pid}]:\n${p.text}`;
    let out = '';
    try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: user }], { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 400 }); out = (res.content || '').trim().replace(/^CTX:\s*/i, ''); }
    catch (e) { console.error(`  [${p.pid}] FAIL ${String(e.message).slice(0, 50)}`); continue; }
    summaries.push({ pid: p.pid, line: `[${p.pid}] ${out.replace(/\n/g, ' ')}` });
    const pe = placeEraOf(out); if (pe) runPlaceEra = pe;
    done++;
    if (!WRITE) console.log(`\n${p.pid} (${sceneLine}):\n${out}`);
    else { await content.updateContextOnly(p.id, out, 'deepseek-disambig-v1'); if (done % 25 === 0) console.error(`  wrote ${done}`); }
  }
}
console.error(`\nDONE — ${done} paragraphs disambiguated${WRITE ? ' → content.context (model=deepseek-disambig-v1)' : ' (dry run)'}`);
process.exit(0);
