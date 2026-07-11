// DISAMBIGUATION PASS (must run BEFORE any entity/claim extraction — see project_scene_context_layer).
// STABLE-PREFIX-HEAVY, VARIABLE-TAIL-LIGHT (KV-cache optimal + reliable): the big, byte-identical SYSTEM prefix
// (lean guard rules + book meta + the cumulative CAST who's-who) is cached ~95%+ across the whole book; the USER
// message is trimmed to SCENE + a tiny STATE (place · era · a few recently-resolved names) + the one paragraph —
// so within a scene consecutive calls share SYSTEM+SCENE+STATE and only the paragraph text varies. Identity comes
// from the rich cached cast (not a fragile per-paragraph sliding window). Output is JSON with REQUIRED fields
// {place,era,idea,resolve[]} → structurally NEVER empty (the old free-form/minimal prompt made flash collapse to
// empty on ~67% of prose). The JSON is rendered to the same "@place, ~era — idea · resolves" string for storage.
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
const CHAP = process.env.CHAP || null;                 // restrict to one chapter (proof runs)
const USE_TOC = process.env.USE_TOC ? process.env.USE_TOC === '1' : [21308, 21310].includes(DOC);
const pnum = (pid) => +String(pid).replace(/\D/g, '');

// PROFILE-DRIVEN model routing (multilingual): flash for En/Ar/He, haiku for Persian (flash fails silently on it),
// with an escalation ladder primary→fallback that self-heals a passage the cheap model can't parse. Env overrides win.
const { detectProfile, providerOf } = await import('../../api/lib/pipeline/profile.js');
const meta = (await queryAll(`SELECT id, title, author, religion, collection, year, description FROM docs WHERE id=?`, [DOC]))[0] || { id: DOC };
const sampleText = (await queryAll(`SELECT text FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL AND length(text)>200 ORDER BY paragraph_index LIMIT 1`, [DOC]))[0]?.text || '';
const profile = detectProfile(meta, sampleText);
const MODEL = process.env.MODEL || profile.models.disambig;
const PROVIDER = providerOf(MODEL);
const FALLBACK = process.env.FALLBACK || profile.fallback;
const FALLBACK_PROVIDER = providerOf(FALLBACK);
const isPro = (m) => /pro/.test(m);
const maxTokFor = (m) => +(process.env.MAXTOK || (isPro(m) ? 4000 : 1500)); // 1000 truncated ~0.75% (genealogically dense paras → long resolve lists); 1500 + concise-handle instruction fixes it
const LANG_NAME = { en: 'English', fa: 'Persian', ar: 'Arabic', he: 'Hebrew' };

const bookMeta = [`"${meta.title}" by ${meta.author || '?'}`, [meta.religion, meta.collection].filter(Boolean).join(' / '), meta.year ? `Year ${meta.year}` : '', meta.description ? `About: ${String(meta.description).slice(0, 240)}` : ''].filter(Boolean).join('\n');
// The book-level CAST seed (cumulative who's-who) grounds identity book-wide and lives in the STABLE cached prefix.
const castSeed = process.env.NO_CAST === '1' ? '' : await (async () => { try { return (await (await import('./cast-seed.mjs')).buildCastSeed(DOC)).seed; } catch (e) { console.error(`cast-seed unavailable: ${e.message}`); return ''; } })();
console.error(`profile: lang=${profile.lang} genre=${profile.genre} domain=${profile.domain} · model=${MODEL} (${PROVIDER}) → fallback=${FALLBACK}`);

const SYS = `You output a compact disambiguation note as JSON for ONE passage of a ${profile.genre} work${profile.lang !== 'en' ? ` written in ${LANG_NAME[profile.lang] || profile.lang} (${profile.script} script) — READ the ${LANG_NAME[profile.lang] || profile.lang} passage and write your note in ENGLISH` : ''}, so a later English-reading AI that has NOT seen the surrounding text can place the passage and tell who/what is meant. Output JSON ONLY.

Return exactly: {"place":"…","era":"… [pin|est]","idea":"…","resolve":["<name as written> = <fuller handle>", …]}

ALWAYS fill place, era, and idea — never blank; there is always a locus (place OR section of the work), a time, and a thread. "resolve" MAY be [] when no name needs it.
• place / era — the location (or, for scripture/commentary, the work-section) and time in force. Inherit from STATE; change only when THIS passage moves. Mark era "[pin]" when stated or anchored (${profile.eraAnchors || 'a stated date, a named era, or "N years after" a known epoch — compute it'}), else "[est]".
• idea — the subject / argument / thread this passage develops, in a few words (whose words or which tablet, if given, plus the point). This alone makes the note useful when no name needs resolving.
• resolve — for each bare, elided, variant, or ambiguous name/epithet, "<name> = <fuller handle>". Keep each handle SHORT — the canonical name plus at most a two-word role (NOT a long descriptive clause; e.g. "Shahr-Bánú = 'Abdu'l-Bahá's betrothed", not a full sentence of relationships). Use ONLY a handle the paragraph, scene, or CAST supports — never invent a nisba or upgrade a name to a famous namesake. The text's own qualifier beats prominence: an "amanuensis Mírzá Aḥmad" is NOT the scholar Mírzá Aḥmad-i-Azghandí. Keep honorifics (Mírzá, Mullá, Siyyid, Ḥájí, Karbilá'í, Ustád, Áqá). Use the most-used handle (Quddús, Vaḥíd, the Báb). Unsure → keep as written + "?"; UNDER-resolve rather than over-resolve — resolve only the names a reader genuinely could not place, not every name; skip names already in full and obvious pronouns; in quoted speech I/We = the speaker.

BOOK:
${bookMeta}
${castSeed ? `\nCAST (who's-who — resolve a bare/variant name to the right PRINCIPAL even if introduced in another chapter; honour each "≠ (not to be confused with)" distinction; a bare name = the most-prominent match UNLESS the paragraph's role/place/era fits a listed alternative):\n${castSeed}` : ''}`;

// Load main-text paragraphs (+ chapter/scene labels for the TOC fast-path)
// pid = external_para_id (OceanLibrary docs, e.g. GPB/DB) else content id (books ingested without para_NNNN
// ids, e.g. ROB, Gate of the Heart). Include 'quote' blocks — in many books the substance is quoted scripture.
let paras = await queryAll(`SELECT id, COALESCE(external_para_id, 'p' || id) pid, paragraph_index pidx, heading, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype IN ('paragraph','quote') ORDER BY paragraph_index`, [DOC]);
paras = paras.map((p) => ({ ...p, text: String(p.text).replace(/\s+/g, ' ').trim() }));
const LIMIT = +(process.env.LIMIT || 0); if (LIMIT) paras = paras.slice(0, LIMIT);   // cap total paras (dry-run testing)
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
  // Prefer cutting at a heading edge once past SEGMAX. But books ingested without headings
  // (ROB, Gate: heading uniform/empty) would otherwise never cut → ONE giant sequential segment
  // → CONC does nothing (the throughput killer). Force a cut at SEGMAX*3 even without a heading
  // change so headingless books still split into CONC-parallel segments. priorBlock only looks
  // back 12 paras, so a boundary every ~180 paras costs ~nothing in coreference quality.
  segs = []; let cur = [];
  for (const p of paras) { const headChange = cur.length && p.heading !== cur[cur.length - 1].heading; if ((cur.length >= SEGMAX && headChange) || cur.length >= SEGMAX * 3) { segs.push(cur); cur = []; } cur.push(p); }
  if (cur.length) segs.push(cur);
}
console.error(`disambiguate DOC=${DOC} · ${paras.length} paras · ${segs.length} segments (${USE_TOC ? 'TOC/chapter' : 'bounded-run'}) · WRITE=${WRITE} · model=${MODEL}`);

// Parse the model's JSON note; null if no valid object or no idea (→ retry). idea is required, so a
// well-formed reply is structurally non-empty.
function parseNote(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/); if (!m) return null;
  try {
    const j = JSON.parse(m[0]); if (!j.idea || !String(j.idea).trim()) return null;
    const resolve = Array.isArray(j.resolve) ? j.resolve.filter((s) => typeof s === 'string' && s.includes('=')).map((s) => s.trim()) : [];
    return { place: String(j.place || '').trim(), era: String(j.era || '').trim(), idea: String(j.idea).trim(), resolve };
  } catch { return null; }
}
const CONC = +(process.env.CONC || 5);   // chapters processed concurrently (each chapter stays sequential internally)
const RESUME = process.env.RESUME === '1'; // skip paragraphs already disambiguated (idempotent restart)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn, n = 5) => { let err; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { err = e; await sleep(700 * (i + 1)); } } throw err; };
process.on('unhandledRejection', (e) => console.error(`unhandledRejection: ${String(e?.message || e).slice(0, 80)}`)); // never let a transient blip kill the run
const doneSet = RESUME ? new Set((await queryAll(`SELECT COALESCE(external_para_id, 'p' || id) pid FROM content WHERE doc_id=? AND context_model='deepseek-disambig-v1' AND context IS NOT NULL`, [DOC])).map((r) => r.pid)) : new Set();
let done = 0, failed = 0, escalations = 0, invalidDropped = 0;
// Provider-aware call. DeepSeek supports response_format json_object; anthropic/openai rely on the
// "Output JSON ONLY" instruction + parseNote's brace extraction (handles ```json fences too).
async function callModel(model, provider, sys, user) {
  const opts = { provider, model, temperature: 0, maxTokens: maxTokFor(model) };
  if (provider === 'deepseek') { opts.responseFormat = { type: 'json_object' }; if (isPro(model)) opts.thinking = true; }
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: user }], opts);
}
// One segment = one warm cache. STATE (place/era + a few recent name-resolves) is LOCAL and tiny, so segments run
// in parallel AND consecutive same-scene calls share SYSTEM+SCENE+STATE (only the paragraph text varies → max cache).
async function processSeg(seg, si) {
  let place = '', era = ''; const known = [];   // known = last few "name = handle" resolves (local coref, tiny → cache-cheap)
  const label = USE_TOC ? (seg[0].chapterNum || 'front-matter') : `${seg[0].pid}..${seg[seg.length - 1].pid}`;
  console.error(`== seg ${si + 1}/${segs.length} · ${label} (${seg.length} paras) start`);
  for (const p of seg) {
    if (RESUME && doneSet.has(p.pid)) continue;
    const sceneLine = USE_TOC ? `${p.chapterNum || ''}${p.chapterTitle ? ' · ' + p.chapterTitle : ''}${p.scene ? ' · ' + p.scene : ''}`.trim() : (p.heading || '');
    const state = `place=${place || '(open)'} · era=${era || '(open)'}${known.length ? ` · known: ${known.join('; ')}` : ''}`;
    const user = `SCENE: ${sceneLine || '(none)'}\nSTATE (inherit place/era unless this paragraph moves): ${state}\n\nPARAGRAPH [${p.pid}]:\n${p.text}`;
    // Escalation ladder: primary model (3 tries) → fallback model (2 tries). Self-heals a passage the cheap
    // model can't parse (esp. Persian on flash, which fails silently) instead of dropping it. `idea` is required
    // in the schema → a valid parse is structurally non-empty.
    const ladder = MODEL === FALLBACK ? [[MODEL, PROVIDER, 4]] : [[MODEL, PROVIDER, 3], [FALLBACK, FALLBACK_PROVIDER, 2]];
    let parsed = null, lastRes = null;
    for (const [m, prov, tries] of ladder) {
      for (let attempt = 0; attempt < tries && !parsed; attempt++) {
        const sys = attempt < 1 && m === MODEL ? SYS : SYS + '\n\nIMPORTANT: this passage is dense — resolve ONLY the few most ambiguous names (short handles), keep "idea" to one clause, and output ONLY the compact JSON object. Brevity prevents truncation.';
        let res;
        try { res = await retry(() => callModel(m, prov, sys, user)); }
        catch (e) { console.error(`  [${p.pid}] AI FAIL ${m} ${String(e.message).slice(0, 40)}`); break; }
        lastRes = res; parsed = parseNote(res.content || '');
      }
      if (parsed) { if (m !== MODEL) escalations++; break; }
    }
    if (!parsed) { console.error(`  [${p.pid}] unparseable after ladder [finish=${lastRes?.finishReason || '?'}]`); failed++; continue; }
    // Validation gate (your proof_ok doctrine): a resolved name's LHS must appear verbatim in the passage,
    // else the model invented it → drop that resolution. ONLY for Latin-script docs: on non-Latin source the
    // model often transliterates the LHS to Latin (legit), which wouldn't match the source script → false drop.
    if (parsed.resolve.length && profile.script === 'latin') {
      const kept = parsed.resolve.filter((r) => { const lhs = r.split('=')[0].trim().replace(/^["'“”]+|["'“”]+$/g, ''); return lhs.length < 2 || p.text.includes(lhs); });
      invalidDropped += parsed.resolve.length - kept.length; parsed.resolve = kept;
    }
    if (parsed.place) place = parsed.place;
    if (parsed.era) era = parsed.era;
    if (parsed.resolve.length) { known.push(...parsed.resolve); while (known.length > 5) known.shift(); }
    const out = `@${parsed.place || '?'}, ~${parsed.era || '?'} — ${parsed.idea}${parsed.resolve.length ? ` · ${parsed.resolve.join('; ')}` : ''}`;
    if (!WRITE) { console.log(`\n${p.pid} (${sceneLine}):\n${out}`); done++; }
    else { try { await retry(() => content.updateContextOnly(p.id, out, 'deepseek-disambig-v1')); done++; if (done % 50 === 0) console.error(`  wrote ${done}`); } catch (e) { console.error(`  [${p.pid}] WRITE FAIL ${String(e.message).slice(0, 50)}`); failed++; } }
  }
  console.error(`== seg ${si + 1}/${segs.length} · ${label} done`);
}
let next = 0;
async function worker() { while (next < segs.length) { const i = next++; try { await processSeg(segs[i], i); } catch (e) { console.error(`seg ${i + 1} crashed: ${String(e.message).slice(0, 60)}`); } } }
await Promise.all(Array.from({ length: Math.min(CONC, segs.length) }, worker));
console.error(`\nDONE — ${done} paragraphs disambiguated, ${failed} failed · ${escalations} escalated to ${FALLBACK} · ${invalidDropped} invented-resolves dropped${WRITE ? ' → content.context (model=deepseek-disambig-v1)' : ' (dry run)'}`);
process.exit(0);
