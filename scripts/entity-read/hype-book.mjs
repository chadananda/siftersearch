// HyPE GENERATION PASS (run AFTER disambiguation — needs content.context; see project_scene_context_layer).
// Generates 5 hypothetical questions + a thesis per paragraph, from the DISAMBIGUATED text (context resolves refs).
//
// CACHE-FRIENDLY BY CONSTRUCTION: the SYSTEM prompt (HyPE instructions + book metadata + book CAST) is IDENTICAL
// for every paragraph in the book → DeepSeek's prefix cache serves it at ~95% after the first call. The catch
// (measured): the cache is populated ASYNCHRONOUSLY after a request completes, so BACK-TO-BACK concurrent calls
// on the same prefix MISS — only SEQUENTIAL calls (each taking seconds) hit. So we process each SEGMENT
// sequentially (cache warms between paragraphs) and run SEGMENTS concurrently (each its own warm prefix).
//
// MODEL: deepseek-v4-flash for the bulk of HISTORY books (fast + cheap; caches ~95%). deepseek-v4-pro (reasoning)
// only for a couple of flagship/doctrinal books where nuance matters — MODEL=deepseek-v4-pro (needs big maxTokens
// headroom for the reasoning tokens). Doctrinal books will later want idea-focused rolling summaries + idea-focused
// questions — a separate variant; this script is tuned for history (person/scene/fact).
//
// Writes content.hyp_questions (JSON array) + content.hyp_thesis, enhanced_synced=0 (Meili re-indexes the sidecar).
// Reverse: UPDATE content SET hyp_questions=NULL,hyp_thesis=NULL WHERE doc_id=? ...   (or restore from backup)
//   DRY:   DOC=429 CHAP="..." node scripts/entity-read/hype-book.mjs                 (prints, no write)
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 DOC=429 node scripts/entity-read/hype-book.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const content = (await import('../../api/lib/content.js')).default;
const { chatCompletion } = await import('../../api/lib/ai.js');
const { assignChapters } = await import('./chapter-map.mjs');

const DOC = +(process.env.DOC || 429);
const { detectProfile, providerOf } = await import('../../api/lib/pipeline/profile.js');
const MINLEN = +(process.env.MINLEN || 60);                       // skip headers/fragments (titles, publisher lines) not worth HyPE
const SEGMAX = +(process.env.SEGMAX || 60);
const CONC = +(process.env.CONC || 5);
const WRITE = process.env.WRITE === '1';
const RESUME = process.env.RESUME === '1';
const CHAP = process.env.CHAP || null;
const LIMIT = +(process.env.LIMIT || 0);   // cap total paragraphs (for dry-run testing)
const USE_TOC = process.env.USE_TOC ? process.env.USE_TOC === '1' : [21308, 21310].includes(DOC);

const meta = (await queryAll(`SELECT id, title, author, religion, collection, year, description FROM docs WHERE id=?`, [DOC]))[0] || { id: DOC };
const sampleText = (await queryAll(`SELECT text FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL AND length(text)>200 ORDER BY paragraph_index LIMIT 1`, [DOC]))[0]?.text || '';
const profile = detectProfile(meta, sampleText);
// HyPE questions are ALWAYS in ENGLISH — the cross-lingual retrieval bridge: an English query embedding matches
// the English HyPE questions of a Persian/Arabic/Hebrew passage, so one unified English index retrieves the whole
// corpus. Routing is only about whether the model can READ the source: flash (En/Ar/He), haiku (Persian). Escalate.
const MODEL = process.env.MODEL || profile.models.hype;
const PROVIDER = providerOf(MODEL);
const FALLBACK = process.env.FALLBACK || profile.fallback;
const FALLBACK_PROVIDER = providerOf(FALLBACK);
const isPro = (m) => /pro/.test(m);
const maxTokFor = (m) => +(process.env.MAXTOK || (isPro(m) ? 6000 : 1500));  // reasoning models need headroom before the JSON
const LANG_NAME = { en: 'English', fa: 'Persian', ar: 'Arabic', he: 'Hebrew' };
const bookMeta = [`"${meta.title}" by ${meta.author || '?'}`, [meta.religion, meta.collection].filter(Boolean).join(' / '), meta.year ? `Year ${meta.year}` : '', meta.description ? `About: ${String(meta.description).slice(0, 240)}` : ''].filter(Boolean).join('\n');
// The book CAST (who's-who) makes the stable system prefix LARGE (better cache) AND grounds the questions in real
// identities. Same seed the disambiguation pass uses.
const castSeed = process.env.NO_CAST === '1' ? '' : await (async () => { try { return (await (await import('./cast-seed.mjs')).buildCastSeed(DOC)).seed; } catch (e) { console.error(`cast-seed unavailable: ${e.message}`); return ''; } })();
console.error(`profile: lang=${profile.lang} genre=${profile.genre} · HyPE model=${MODEL} (${PROVIDER}) → fallback=${FALLBACK} · questions in ENGLISH`);

// STABLE PREFIX (identical for every paragraph → cached): instructions + book meta + cast.
const SYS = `You generate Hypothetical Prompt Embeddings (HyPE) for ONE paragraph of a book, to power semantic search. A reader searches with a QUESTION; your job is to write the questions THIS paragraph answers, so the paragraph is retrievable by anyone asking about its content in their own words. Output JSON ONLY.
${profile.lang !== 'en' ? `\nThe paragraph is in ${LANG_NAME[profile.lang] || profile.lang} (${profile.script} script) — READ it, but write ALL questions and the thesis in ENGLISH. They feed a unified English search index, so an English query can retrieve this ${LANG_NAME[profile.lang] || profile.lang} passage.\n` : ''}
Produce, from the paragraph (use the disambiguation CONTEXT only to resolve who/what/where — do NOT ask about the context):
- "questions": EXACTLY 5, each a real question ending in "?", max 15 words, covering these registers, one each:
  1. factual — a concrete who/what/when this paragraph states
  2. factual — a second distinct concrete fact
  3. definitional — the concept/term/role this paragraph explains
  4. implication — what follows from, or is significant about, this passage
  5. conversational — how a thoughtful lay reader would ask about this, casual wording
  Vary the phrasing; do NOT repeat the same question reworded. Ground every question in what the paragraph ACTUALLY says — never invent facts.
- "thesis": ONE sentence (20-45 words) stating what this paragraph teaches/recounts as a proposition (not a question, not "this paragraph describes…" — state the claim directly).

Return exactly: {"questions":["…?","…?","…?","…?","…?"],"thesis":"…"}

BOOK:
${bookMeta}
${castSeed ? `\nBOOK CAST (who's-who — use to resolve a name to the right figure; do not ask about people not in the paragraph):\n${castSeed}` : ''}`;

// pid = external_para_id when present (OceanLibrary docs like GPB/DB), else the content id (books ingested
// without para_NNNN ids, e.g. ROB). Include 'quote' blocks too — in ROB most content is quoted tablet text.
let paras = await queryAll(`SELECT id, COALESCE(external_para_id, 'p' || id) pid, paragraph_index pidx, heading, text, context FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype IN ('paragraph','quote') ORDER BY paragraph_index`, [DOC]);
paras = paras.map((p) => ({ ...p, text: String(p.text).replace(/\s+/g, ' ').trim() })).filter((p) => p.text.length >= MINLEN);
if (LIMIT) paras = paras.slice(0, LIMIT);
let segs;
if (USE_TOC) {
  const { paras: mapped } = await assignChapters(DOC);
  const byPid = new Map(mapped.map((m) => [m.pid, m]));
  paras = paras.map((p) => ({ ...p, ...(byPid.get(p.pid) || {}) }));
  if (CHAP) paras = paras.filter((p) => (p.chapterNum || '') === CHAP);
  segs = []; let cur = [];
  for (const p of paras) { if (cur.length && p.chapterNum !== cur[cur.length - 1].chapterNum) { segs.push(cur); cur = []; } cur.push(p); }
  if (cur.length) segs.push(cur);
} else {
  // Cut at a heading edge past SEGMAX; force a cut at SEGMAX*3 even without a heading change so
  // headingless books (ROB/Gate) still split into CONC-parallel segments instead of one giant
  // sequential run. Sequential-within-segment still warms the prefix cache between paragraphs.
  segs = []; let cur = [];
  for (const p of paras) { const headChange = cur.length && p.heading !== cur[cur.length - 1].heading; if ((cur.length >= SEGMAX && headChange) || cur.length >= SEGMAX * 3) { segs.push(cur); cur = []; } cur.push(p); }
  if (cur.length) segs.push(cur);
}
console.error(`hype DOC=${DOC} · ${paras.length} paras · ${segs.length} segments (${USE_TOC ? 'TOC/chapter' : 'bounded-run'}) · WRITE=${WRITE} · model=${MODEL} · maxTok=${maxTokFor(MODEL)}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn, n = 5) => { let err; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { err = e; await sleep(700 * (i + 1)); } } throw err; };
process.on('unhandledRejection', (e) => console.error(`unhandledRejection: ${String(e?.message || e).slice(0, 80)}`));

// RESUME: a paragraph is "done" only if it has a NEW-FORMAT hyp (a JSON array of >=4 questions) AND a thesis.
// The old garbage HyPE (3 newline-joined noun-phrases, no thesis) does NOT match → gets replaced.
const isNewFormat = (hq, th) => { if (!th) return false; try { const a = JSON.parse(hq); return Array.isArray(a) && a.length >= 4; } catch { return false; } };
const doneSet = RESUME ? new Set((await queryAll(`SELECT external_para_id pid, hyp_questions hq, hyp_thesis th FROM content WHERE doc_id=?`, [DOC])).filter((r) => isNewFormat(r.hq, r.th)).map((r) => r.pid)) : new Set();

let done = 0, failed = 0, cacheHit = 0, cacheTot = 0, escalations = 0;
async function callModel(model, provider, sys, user) {
  const opts = { provider, model, temperature: 0.3, maxTokens: maxTokFor(model) };
  if (provider === 'deepseek') { opts.responseFormat = { type: 'json_object' }; if (isPro(model)) opts.thinking = true; }
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: user }], opts);
}
function parseOut(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/); if (!m) return null;
  try { const j = JSON.parse(m[0]); const q = (j.questions || []).filter((x) => typeof x === 'string' && x.trim()); if (q.length < 4) return null; return { questions: q.slice(0, 5), thesis: (j.thesis || '').trim() }; } catch { return null; }
}
async function processSeg(seg, si) {
  const label = USE_TOC ? (seg[0].chapterNum || 'front-matter') : `${seg[0].pid}..${seg[seg.length - 1].pid}`;
  console.error(`== seg ${si + 1}/${segs.length} · ${label} (${seg.length} paras) start`);
  for (const p of seg) {                       // SEQUENTIAL within a segment → prefix cache warms between calls
    if (RESUME && doneSet.has(p.pid)) continue;
    const user = `CONTEXT (disambiguation — for resolving references only): ${p.context || '(none)'}\n\nPARAGRAPH [${p.pid}]:\n${p.text}`;
    // Escalation ladder: primary model (3 tries) → fallback model (2 tries) — self-heals a passage the cheap
    // model can't parse (e.g. Persian on flash). JSON is non-deterministic; an unparseable/truncated reply
    // usually parses on re-call. Later tries nudge toward brevity.
    const ladder = MODEL === FALLBACK ? [[MODEL, PROVIDER, 4]] : [[MODEL, PROVIDER, 3], [FALLBACK, FALLBACK_PROVIDER, 2]];
    let parsed = null, lastRes = null;
    for (const [m, prov, tries] of ladder) {
      for (let attempt = 0; attempt < tries && !parsed; attempt++) {
        const sys = attempt < 2 && m === MODEL ? SYS : SYS + '\n\nIMPORTANT: keep each question short; output ONLY the compact JSON object, nothing else.';
        let res;
        try { res = await retry(() => callModel(m, prov, sys, user)); }
        catch (e) { console.error(`  [${p.pid}] AI FAIL ${m} ${String(e.message).slice(0, 40)}`); break; }
        lastRes = res;
        if (res.usage) { cacheHit += res.usage.cachedTokens || res.usage.prompt_cache_hit_tokens || 0; cacheTot += res.usage.promptTokens || res.usage.prompt_tokens || 0; }
        parsed = parseOut(res.content || '');
      }
      if (parsed) { if (m !== MODEL) escalations++; break; }
    }
    if (!parsed) { console.error(`  [${p.pid}] unparseable after retries [finish=${lastRes?.finishReason || '?'}]: ${String(lastRes?.content || '').replace(/\s+/g, ' ').slice(0, 120)}`); failed++; continue; }
    if (!WRITE) { console.log(`\n${p.pid}:\n  THESIS: ${parsed.thesis}\n  ${parsed.questions.join('\n  ')}`); done++; }
    else { try { await retry(() => content.updateHype(p.id, parsed.questions, parsed.thesis)); done++; if (done % 50 === 0) console.error(`  wrote ${done} (cache ${cacheTot ? Math.round(100 * cacheHit / cacheTot) : 0}%)`); } catch (e) { console.error(`  [${p.pid}] WRITE FAIL ${String(e.message).slice(0, 50)}`); failed++; } }
  }
  console.error(`== seg ${si + 1}/${segs.length} · ${label} done`);
}
let next = 0;
async function worker() { while (next < segs.length) { const i = next++; try { await processSeg(segs[i], i); } catch (e) { console.error(`seg ${i + 1} crashed: ${String(e.message).slice(0, 60)}`); } } }
await Promise.all(Array.from({ length: Math.min(CONC, segs.length) }, worker));
console.error(`\nDONE — ${done} paragraphs HyPE'd, ${failed} failed · ${escalations} escalated to ${FALLBACK} · prefix-cache ${cacheTot ? Math.round(100 * cacheHit / cacheTot) : 0}% (${cacheHit}/${cacheTot})${WRITE ? ' → content.hyp_questions+hyp_thesis' : ' (dry run)'}`);
process.exit(0);
