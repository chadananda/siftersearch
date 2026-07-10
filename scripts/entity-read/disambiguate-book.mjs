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
// Pass 2 → Pass 3: the book-level MAIN CAST seed gives every chapter book-wide identity, so chapters disambiguate
// independently without losing a figure introduced elsewhere (fixes cross-chapter identity).
const castSeed = process.env.NO_CAST === '1' ? '' : await (async () => { try { return (await (await import('./cast-seed.mjs')).buildCastSeed(DOC)).seed; } catch (e) { console.error(`cast-seed unavailable: ${e.message}`); return ''; } })();

const SYS = `You write a MINIMAL disambiguation note for ONE paragraph of a historical narrative. An AI (not a parser) will read your note alongside the paragraph so it can identify the people and place without having read the earlier text. Write ONLY what that reader could NOT work out from this paragraph by itself — nothing more.

You get the BOOK metadata, the SCENE (chapter + section heading), the running PLACE/ERA, and the notes for preceding paragraphs (identity established earlier carries forward, because the narrative drops a person's titles/nisba once a scene has introduced them).

FAITHFULNESS IS THE FIRST RULE. Resolve using ONLY what the text and its scene actually supply. NEVER add a nisba, surname, or fuller name the text/scene does not itself give — do not "upgrade" a name to a prominent namesake's full form. The text's OWN qualifier wins: if the paragraph or a nearby paragraph gives an appositive, role, relationship, or descriptor for a name ("Mírzá Aḥmad, the Báb's amanuensis"), THAT is the resolution — carry the name plus that descriptor verbatim, and let it OVERRIDE any prominence guess. A local descriptor that contradicts a prominent bearer (an "amanuensis" is not the traditions-scholar Mírzá Aḥmad-i-Azghandí) means it is a DIFFERENT person — resolve to what the text says, not to the famous namesake. When you cannot pin the fuller canonical from the text/scene/cast with confidence, keep the name as written plus the text's descriptor and STOP; mark uncertain identity with "?". Under-resolve rather than mis-resolve.

Include, and only include:
• PLACE and ERA in force. Inherit from the running context; change only when THIS paragraph moves location or time. Mark the era as a PIN or an EST: a PIN is explicitly derivable — a stated date, a SOLAR/seasonal anchor (Naw-Rúz = spring equinox ~21 March; a named season), or "N years after a known epoch" (Báb's Declaration = May 1844; His martyrdom = July 1850) — write it like "spring 1851 [pin: 7th Naw-Rúz]"; an EST is inferred from the chapter/context or a drifting lunar Hijri (A.H.) date — write it like "~1845 [est: chapter era]". Compute pins, don't discard them (e.g. "the seventh Naw-Rúz after the Declaration" = spring 1851 = 1844 + 7). NOT the heading text.
• Any bare / elided / variant name or ambiguous epithet the paragraph uses, resolved to the fuller handle THE TEXT SUPPORTS (established earlier in this scene, in the cast, or by the paragraph's own qualifier). KEEP honorifics/titles (Mírzá, Mullá, Siyyid, Ḥájí, Karbilá'í, Mashhadí, Ustád, Áqá) — they discriminate when nisbas match or are absent and are sometimes the whole handle (Karbilá'í-‘Alí); never strip them. Use the most-used handle (Quddús, Vaḥíd, the Báb). The COMMON-REFERENCE / prominence prior applies ONLY to a truly BARE name with NO qualifier anywhere in the scene, and only when consistent with the scene's facts; a local role/appositive always overrides it.
• A pronoun ONLY when its referent is genuinely unclear from this paragraph (several people in play). Skip pronouns that are obvious. Inside quoted speech, I/We/Our = the speaker.

Do NOT restate a name already written in full; do NOT resolve what is already clear; do NOT map generic phrases ("the Cause", "the Faith"); do NOT add outside knowledge or an unsupported nisba. If a reference truly cannot be resolved from context, mark it "?". If nothing beyond place/era needs saying, give just the place/era.

Format (compact prose for an AI reader — no rigid syntax): "@<place>, ~<era> — <only the resolutions actually needed>". Example (illustrates format only — resolve each case from ITS OWN text, never by analogy to this example): "@S̱híráz, ~1845 — "Siyyid Yaḥyá" = Siyyid Yaḥyáy-i-Dárábí (Vaḥíd); "I" (in quoted speech) = Siyyid Yaḥyáy-i-Dárábí."

BOOK:
${bookMeta}
${castSeed ? `\nMAIN CAST (book-wide who's-who — resolve a bare or variant name to the right PRINCIPAL figure even when they were introduced in a DIFFERENT chapter; honour each "≠ (not to be confused with)" distinction; a bare name = the most-prominent matching figure UNLESS the paragraph's role/place/era fits a listed alternative):\n${castSeed}` : ''}`;

// Load main-text paragraphs (+ chapter/scene labels for the TOC fast-path)
// pid = external_para_id (OceanLibrary docs, e.g. GPB/DB) else content id (books ingested without para_NNNN
// ids, e.g. ROB, Gate of the Heart). Include 'quote' blocks — in many books the substance is quoted scripture.
let paras = await queryAll(`SELECT id, COALESCE(external_para_id, 'p' || id) pid, paragraph_index pidx, heading, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype IN ('paragraph','quote') ORDER BY paragraph_index`, [DOC]);
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
const CONC = +(process.env.CONC || 5);   // chapters processed concurrently (each chapter stays sequential internally)
const RESUME = process.env.RESUME === '1'; // skip paragraphs already disambiguated (idempotent restart)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn, n = 5) => { let err; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { err = e; await sleep(700 * (i + 1)); } } throw err; };
process.on('unhandledRejection', (e) => console.error(`unhandledRejection: ${String(e?.message || e).slice(0, 80)}`)); // never let a transient blip kill the run
const doneSet = RESUME ? new Set((await queryAll(`SELECT COALESCE(external_para_id, 'p' || id) pid FROM content WHERE doc_id=? AND context_model='deepseek-disambig-v1' AND context IS NOT NULL`, [DOC])).map((r) => r.pid)) : new Set();
let done = 0, failed = 0;
// One segment (chapter) = one sequential growing cache. runPlaceEra is LOCAL so chapters can run in parallel.
async function processSeg(seg, si) {
  const summaries = []; let runPlaceEra = '';
  const label = USE_TOC ? (seg[0].chapterNum || 'front-matter') : `${seg[0].pid}..${seg[seg.length - 1].pid}`;
  console.error(`== seg ${si + 1}/${segs.length} · ${label} (${seg.length} paras) start`);
  for (const p of seg) {
    if (RESUME && doneSet.has(p.pid)) continue;
    const sceneLine = USE_TOC ? `${p.chapterNum || ''}${p.chapterTitle ? ' · ' + p.chapterTitle : ''}${p.scene ? ' · ' + p.scene : ''}`.trim() : (p.heading || '');
    const priorBlock = summaries.slice(-12).map((s) => s.line).join('\n');
    const user = `SCENE: ${sceneLine || '(none)'}\nRUNNING PLACE/ERA (inherit unless this paragraph moves): ${runPlaceEra || '(not yet established — infer from scene)'}\n\nNOTES FOR PRECEDING PARAGRAPHS (identity established here carries forward):\n${priorBlock || '(none — first paragraph of the chapter)'}\n\nCURRENT PARAGRAPH [${p.pid}]:\n${p.text}`;
    let out = '';
    try { const res = await retry(() => chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: user }], { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 400 })); out = (res.content || '').trim().replace(/^CTX:\s*/i, ''); }
    catch (e) { console.error(`  [${p.pid}] AI FAIL ${String(e.message).slice(0, 50)}`); failed++; continue; }
    if (!out) { failed++; continue; }
    summaries.push({ pid: p.pid, line: `[${p.pid}] ${out.replace(/\n/g, ' ')}` });
    const pe = placeEraOf(out); if (pe) runPlaceEra = pe;
    if (!WRITE) { console.log(`\n${p.pid} (${sceneLine}):\n${out}`); done++; }
    else { try { await retry(() => content.updateContextOnly(p.id, out, 'deepseek-disambig-v1')); done++; if (done % 50 === 0) console.error(`  wrote ${done}`); } catch (e) { console.error(`  [${p.pid}] WRITE FAIL ${String(e.message).slice(0, 50)}`); failed++; } }
  }
  console.error(`== seg ${si + 1}/${segs.length} · ${label} done`);
}
let next = 0;
async function worker() { while (next < segs.length) { const i = next++; try { await processSeg(segs[i], i); } catch (e) { console.error(`seg ${i + 1} crashed: ${String(e.message).slice(0, 60)}`); } } }
await Promise.all(Array.from({ length: Math.min(CONC, segs.length) }, worker));
console.error(`\nDONE — ${done} paragraphs disambiguated, ${failed} failed${WRITE ? ' → content.context (model=deepseek-disambig-v1)' : ' (dry run)'}`);
process.exit(0);
