// enrich/retrieval — HyPE: the hypothetical questions each passage answers, so a reader's own wording
// retrieves it. Runs AFTER disambiguation (gated): it reads the disambiguation note to resolve references,
// then writes 2-5 English questions + a one-sentence thesis per paragraph. Questions are ALWAYS English — the
// cross-lingual bridge: an English query embedding matches the English HyPE of a Persian/Arabic passage, so
// one index retrieves the whole corpus. Same cache discipline as disambiguation (stable SYS prefix; segments
// concurrent, sequential within).
//
// v2 (2026-08-08, "hype-v2-facts"): questions are KNOWLEDGE-INFORMED. The entity pipeline extracts cited
// claims FROM these very paragraphs (store.getParaClaims, optional port) — feeding them back in means the
// model knows exactly which facts a paragraph establishes and writes questions that make each fact
// retrievable. Plus: ADAPTIVE count (2-5 distinct asks, no quota-padding — fixed 5 forced rephrased
// duplicates on thin paragraphs), genre-matched registers (history vs doctrinal), and ≥1 topic-phrased
// question WITHOUT personal names (measured gap: person-anchored questions lost topic searches like
// "children's classes Burma"). Rows are stamped hyp_model=HYPE_VERSION; v1 rows (5-question, unstamped)
// remain valid/done — regeneration is explicit (opts.resume=false), never implicit.
import { assertDisambiguated } from '../kernel/gate.js';  // HyPE consumes disambiguated text → gate first
import { profileFor } from '../kernel/profile.js';
import { segment } from '../kernel/segment.js';
import { pool } from '../kernel/run.js';
import { isHyped, DISAMB_THRESHOLD } from '../../pipeline/processed.js';

// v4 (2026-08-26, "hype-v4-seeker"): the questions are the retrieval surface, so their SHAPE is the product.
// v3 wrote comprehension checks — "What does this passage ask the reader to ponder?" — and padded counts by
// splitting one sentence's list into a question per noun. v4 asks for what a reader types, forbids referring
// to the text itself, and reaches the concept layer: where a claim carries an original term, a reader who
// knows that term must be able to search with it.
//
// THE VERSION STRING IS PART OF THE PROMPT. Changing the prompt without bumping it left every paragraph
// matching the current version, so --rehype skipped the whole book and regenerated nothing — the run
// reported success and the questions were byte-identical. A prompt change IS a version change.
export const HYPE_VERSION = 'hype-v9-one-ask';
const DENSE_HINT = 'Keep each question short; output ONLY the compact JSON object, nothing else.';
const MIN_LEN = 60; // skip headers/fragments (titles, publisher lines) not worth HyPE
// Question count is set by the PARAGRAPH, not a quota: a dense passage (every sentence answering several
// questions) may yield 20-40; a transition yields 1-3. QUESTION_CEILING is a runaway-model sanity rail only —
// far above any real paragraph — never a target. (The old EXACTLY-5 was inherited from HyPE convention and
// was arbitrary in both directions: it padded thin paragraphs and starved dense ones.)
const QUESTION_CEILING = 40;
const MAX_FACTS_PER_PARA = 24;  // sanity slice only — the densest observed paragraph carries 12 claims
// SENTENCE-SLICING (measured necessity, 2026-08-08): v4-flash's hybrid reasoning SCALES WITH THE ASK — asked
// for a dense paragraph's full 20-40 questions in one call, it burned past a 4000 cap (481/500 truncated) and
// then past 8000 too (31/41). Raising the container feeds the balloon; the fix is bounding the TASK: long
// paragraphs are split into sentence groups, one call per group (a handful of questions each, reasoning stays
// small), answers concatenated up to QUESTION_CEILING. Slice calls share the same cached SYS prefix, and the
// full paragraph rides along as context so questions stay globally grounded.
// 4000 (was 900): slicing exists to bound v4-flash's ask-scaling reasoning, but it introduced cross-slice
// redundancy — and flagship runs now use a paid model with NO hidden-reasoning billing, where a whole-paragraph
// call is both cheaper and cleaner. 4000 keeps slicing as a monster-paragraph guard only. (v3-on-flash remains
// deprecated in practice: even sliced it truncated 41% — see .work/eewa-build-state.md 08-08.)
const SLICE_CHARS = 4000;       // paragraphs longer than this get sliced
const SLICE_TARGET = 1500;      // aim ~this many chars of focus text per slice call

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? DISAMB_THRESHOLD });
  const profile = await profileFor(ctx, docId);
  const [meta, all, cast, facts, conceptClaims] = await Promise.all([
    ctx.store.getDocMeta(docId), ctx.store.getParagraphs(docId), castOf(ctx, docId), factsOf(ctx, docId), conceptsOf(ctx, docId)]);
  const long = all.filter((p) => p.text.length >= (opts.minLen ?? MIN_LEN));
  // upgrade: version-aware resume — "done" means at the CURRENT generator version, so re-hyping a book skips
  // paragraphs already upgraded and redoes the rest. A killed upgrade run therefore RESUMES where it died on
  // retry instead of restarting from zero (resume:false remains the unconditional full redo).
  const doneP = opts.upgrade ? (p) => p.hypModel === HYPE_VERSION && isDone(p) : isDone;
  const paras = (opts.resume ?? true) ? long.filter((p) => !doneP(p)) : long;
  const segs = segment(paras, { mode: profile.segmentation, segMax: opts.segMax ?? 60 });
  const system = buildSystem(profile, meta, cast);
  const route = { model: opts.model ?? profile.models.hype, fallback: opts.fallback ?? profile.fallback };
  // Headroom for uncapped counts — sized from a MEASURED failure, not a guess: v4-flash is a HYBRID whose
  // reasoning output counts against max_tokens even though the catalog doesn't tag it 'reasoning' (see
  // model-registry note). At 4000, 481/500 pilot calls truncated (avg completion 3,949) → unparseable →
  // ~11 full-cost retries per paragraph. Reasoning scales with question count (planning 20-40 questions can
  // burn 2-3k thinking tokens) + up to ~3k of JSON → 8000 floor for everything; 12000 for explicit reasoners.
  const maxTokens = (m) => (ctx.catalog.get(m)?.capabilities?.includes('reasoning') ? 12000 : 8000);
  const stats = { paras: paras.length, segments: segs.length, done: 0, failed: 0, escalated: 0, factFed: 0, version: HYPE_VERSION };
  // Report per PARAGRAPH, ABSOLUTE: total = all HyPE-eligible paras (long), already-done = resume-skipped (base),
  // so a resumed hype run's bar shows true progress not just the remaining slice.
  const base = long.length - paras.length;
  const report = () => opts.onProgress?.(base + stats.done + stats.failed, long.length);

  // THROUGHPUT: THE UNIT OF WORK IS A PARAGRAPH, NOT A SEGMENT.
  //
  // This pooled over SEGMENTS and ran each segment's paragraphs sequentially, so a 789-paragraph book formed
  // ~5-13 segments and only that many calls were ever in flight — raising `cc` past the segment count did
  // nothing at all. Measured on Some Answered Questions: ~5 paragraphs/minute at cc=6, 2.5 hours for one
  // book (Chad, 2026-08-26: "5 par/minute is painfully slow. is there no way to speed that up?").
  //
  // The serialisation existed for the PROMPT CACHE: the SYSTEM prefix is byte-identical across a whole book
  // and expensive to re-bill, so one call must populate the cache before the rest follow. That needs a single
  // warm-up, not every paragraph queued behind the one before it. Segments survive for ordering only.
  const flat = segs.flat();
  if (flat.length) await hypeOne(flat[0]);            // populate the shared prefix, then open the throttle
  await pool(opts.concurrency ?? 12, flat.slice(1), hypeOne);

  async function hypeOne(p) {
    // Per-PARAGRAPH guard: pool()'s guard is per ITEM = per SEGMENT here, so an unguarded throw would drop every
    // remaining paragraph of the segment while the stage still reported success. Fatal (credit/key/policy) aborts.
    try {
      const pFacts = facts[p.pid] || null;
      if (pFacts) stats.factFed++;
      const slices = sliceParagraph(p.text);
      let parsed = null, escalated = false;
      if (slices.length === 1) {
        ({ parsed, escalated } = await ctx.model.runLadder({ route, system, user: buildUser(p, pFacts, null, conceptClaims?.[p.pid]), parse: parseHype, maxTokens, temperature: 0.3, denseHint: DENSE_HINT }));
      } else {
        // One bounded call per sentence-group; slice 1 also writes the whole-paragraph thesis.
        const questions = []; let thesis = '';
        for (let si = 0; si < slices.length; si++) {
          const r = await ctx.model.runLadder({ route, system, user: buildUser(p, pFacts, { focus: slices[si], part: si + 1, parts: slices.length }, conceptClaims?.[p.pid]), parse: si === 0 ? parseHype : parseHypeSlice, maxTokens, temperature: 0.3, denseHint: DENSE_HINT });
          if (r.escalated) escalated = true;
          if (!r.parsed) continue;                       // a lost slice costs coverage, not the paragraph
          if (si === 0) thesis = r.parsed.thesis;
          for (const q of r.parsed.questions) { const k = q.toLowerCase().replace(/[^a-z0-9 ]/g, ''); if (!questions.some((e) => e.k === k)) questions.push({ k, q }); }
        }
        if (questions.length && thesis) parsed = { questions: questions.slice(0, QUESTION_CEILING).map((e) => e.q), thesis };
        stats.sliced = (stats.sliced || 0) + 1;
      }
      if (!parsed) { await markHypeExhausted(ctx, p, opts, stats); report(); return; }
      if (!opts.dryRun) await ctx.store.saveHype(p.id, parsed.questions, parsed.thesis, HYPE_VERSION);
      stats.done++; if (escalated) stats.escalated++; report();
    } catch (e) {
      if (e?.fatal) throw e;
      await markHypeExhausted(ctx, p, opts, stats);
      report();
    }
  }
  ctx.log.info?.({ docId, ...stats }, 'retrieval/hype');
  return stats;
}


/**
 * A paragraph the generator could not produce questions for, after its full ladder, has still been
 * PROCESSED — the pipeline has done everything it can with it. Stamp hyp_model and leave the questions
 * empty: no placeholder text, no invented questions, nothing that could reach the retrieval index.
 *
 * Why this matters (2026-08-13): the completion gate used to count the QUESTION column, so a failure
 * left it NULL — indistinguishable from "not tried yet" — and a book with a couple of unprocessable
 * paragraphs could never reach the bar. Books 519 (1
 * failure) and 12443 (3 failures) each ran the entire pipeline, verified ok:true / missing:[] and printed
 * "COMPLETE + SEARCHABLE", and were still recorded "did not reach verify" and re-queued — a permanent
 * re-grounding loop, re-spending on finished work. The two books with 0 failures completed normally.
 * This is the same error the disambiguation measure made: counting OUTPUT rather than PROCESSING.
 */
async function markHypeExhausted(ctx, p, opts, stats) {
  stats.failed++;
  stats.exhausted = (stats.exhausted || 0) + 1;
  if (opts.dryRun) return;
  // Best-effort: if this write fails the paragraph simply stays NULL and is retried next run — the old
  // behaviour — so a storage blip can never lose a paragraph that DID generate questions.
  try { await ctx.store.saveHype(p.id, [], '', HYPE_VERSION); }   // stamped, empty — that IS the result
  catch (e) { ctx.log.warn?.({ paraId: p.id, err: e.message }, 'retrieval/hype: could not mark paragraph exhausted'); }
}

const castOf = (ctx, docId) => (ctx.store.getCastSeed ? Promise.resolve(ctx.store.getCastSeed(docId)).catch(() => '') : Promise.resolve(''));
// Cited claims per paragraph (optional port; {} = fact-blind, prompt degrades gracefully to v2-without-facts).
const factsOf = (ctx, docId) => (ctx.store.getParaClaims ? Promise.resolve(ctx.store.getParaClaims(docId)).catch(() => ({})) : Promise.resolve({}));
// Concept claims per paragraph (optional port; {} = concept-blind, exactly as fact-blind above). OPTIONAL is
// deliberate: the conceptual track runs on doctrinal works only, so every historical book must keep producing
// byte-identical prompts. A missing port must never change an existing book's HyPE.
const conceptsOf = (ctx, docId) => (ctx.store.getParaConceptClaims ? Promise.resolve(ctx.store.getParaConceptClaims(docId)).catch(() => ({})) : Promise.resolve({}));
// A paragraph is HyPE-done with ANY generator format: v3 adaptive (1-40), v2 (2-5), v1 (exactly 5) — all are
// JSON arrays ≥1 with a thesis. Old newline-joined HyPE (no thesis / not JSON) fails → gets regenerated. Older
// versions are NOT auto-regenerated; upgrading a book is an explicit resume:false (rehype) run.
// Resume on the stage's VERSION STAMP, never on question count — a paragraph can be legitimately processed
// and yield nothing, and we will not fabricate questions to satisfy a counter. Owned by pipeline/processed.
const isDone = (p) => isHyped(p, HYPE_VERSION);

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Normalise an answering span for comparison: two questions pointing at the same words are one question.
 */
const answerKey = (a) => String(a || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 90);

/**
 * Keep one question per distinct ANSWER.
 *
 * Chad, 2026-08-26: "please tighten, but never with arbitrary caps. We want unique questions but cannot
 * guess in advance how many questions a paragraph will answer. You fixed the too many questions problem
 * with a cap before and that is broken thinking."
 *
 * So the test is his — two questions are two questions only if they have two answers — and it is applied
 * HERE rather than asked of the model. Three prompt revisions tried to legislate it in prose and each
 * drifted back: a sentence naming nature's "sound organization, inviolable laws, perfect order and
 * consummate design" produced four definitional questions, then four MORE in the original language, all
 * answered by that one sentence. Prose asking a model to police its own redundancy competes with every
 * other instruction in the prompt; a key comparison does not.
 *
 * NO CAP IS APPLIED. A paragraph answering thirty distinct things keeps thirty. Questions with no span, or
 * spans too short to be meaningful, are kept as-is — an unusable span is a reason to skip the check, never
 * to discard a question.
 */
export function dedupeByAnswer(items) {
  const seen = new Map();
  const out = [];
  for (const it of items) {
    const key = answerKey(it.a);
    if (key.length < 12) { out.push(it.q); continue; }        // no usable span → keep, do not judge
    if (seen.has(key)) continue;
    seen.set(key, true);
    out.push(it.q);
  }
  return out;
}

export function parseHype(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    // Accept both shapes: {q,a} objects (current) and bare strings (older recordings, and slices that
    // answer without a span). A mixed array is fine — each item is judged on what it carries.
    const items = (j.questions || [])
      .map((x) => (typeof x === 'string' ? { q: x, a: '' } : { q: String(x?.q ?? ''), a: String(x?.a ?? '') }))
      .filter((x) => x.q.trim());
    if (!items.length) return null;
    const q = dedupeByAnswer(items);
    if (q.length < 1) return null;
    return { questions: q.slice(0, 40), thesis: String(j.thesis || '').trim() };   // 40 = runaway rail, never a target
  } catch { return null; }
}

const LANG_NAME = { en: 'English', fa: 'Persian', ar: 'Arabic', he: 'Hebrew' };

// Register menu by genre: narrative books answer who/what/when/outcome; doctrinal books answer
// concept/assertion/implication. One menu per book (genre is a book-level profile), listed as guidance —
// the ADAPTIVE rule (distinct asks only) decides how many actually apply to a given paragraph.
const REGISTERS = {
  history: `(a) a concrete who/what/when/where fact it states, (b) the event or episode and its outcome, (c) why it matters or what followed from it, (d) how a curious lay reader would casually ask about it`,
  biography: `(a) a concrete fact about the person (role, relationship, act, date), (b) the episode recounted and its outcome, (c) the person's significance or what this reveals about them, (d) how a curious lay reader would casually ask about it`,
  doctrinal: `(a) the concept, term, or station and what is taught about it, (b) the distinction it draws — how it differs from what a reader might confuse it with, (c) the reason or condition given, and what follows from it, (d) how a thoughtful lay reader would casually ask about it, in their own words`,
};

export function buildSystem(profile, meta, cast = '') {
  const lang = LANG_NAME[profile.lang] || profile.lang;
  const foreign = profile.lang !== 'en'
    ? `\nThe paragraph is in ${lang} (${profile.script} script) — READ it, but write ALL questions and the thesis in ENGLISH so an English query can retrieve this ${lang} passage.\n` : '';
  const registers = REGISTERS[profile.genre] || REGISTERS.history;
  const bookMeta = [`"${meta.title}" by ${meta.author || '?'}`, [meta.religion, meta.collection].filter(Boolean).join(' / '), meta.year ? `Year ${meta.year}` : '', meta.description ? `About: ${String(meta.description).slice(0, 240)}` : ''].filter(Boolean).join('\n');
  return `You generate Hypothetical Prompt Embeddings (HyPE) for ONE paragraph, to power semantic search. A reader searches with a QUESTION; write the questions THIS paragraph answers, so it is retrievable by anyone asking about its content in their own words. Output JSON ONLY.
${foreign}
From the paragraph (use the disambiguation CONTEXT only to resolve who/what/where — do NOT ask about the context):
- "questions": every distinct question a READER WOULD ACTUALLY ASK that this paragraph answers. The paragraph's content sets the count, not a quota: a substantial passage may carry 15, 25, even 40 distinct asks, a thin transitional one only 1-3. Each ends "?", max 15 words. Useful angles: ${registers}.

  WRITE THE QUESTION SOMEONE TYPES INTO A SEARCH BOX, not a comprehension check about the text.
  • NEVER refer to the text itself. No "this passage", "the revealed verse", "the author", "the following". A reader searching does not know a passage exists — that is what they are trying to find. "What does this passage ask the reader to ponder?" is worthless: nobody will ever type it.
  • ONE QUESTION PER DISTINCT THING TAUGHT — never one per noun. If a sentence lists several items covered by a single teaching, that is ONE question about the teaching, not four about the list. "From what must the heart be cleansed?", "From what must the ear be cleansed?", "From what must the eye be cleansed?" is one question padded three times; ask "What must a seeker purify in order to attain certitude?" instead.
  • Ask what the passage ESTABLISHES, not what it mentions. A reader wants the teaching, the reason, the consequence, the distinction — not an inventory of its vocabulary.
  • IF THE PASSAGE DEFINES A TERM, the plain definitional questions are MANDATORY and come first. A passage saying "Know that justice consists in rendering to each his due" is THE answer to "What is justice?" and "What is meant by justice?" — those exact ordinary forms must be present, not only a subtler question about its application. Definitions are the highest-value thing a reader searches for and the easiest to miss, because the passage states them so plainly that they look like they need no question. Ask it ONCE — "What is X?" or "What is meant by X?", whichever reads better, never both: they are the same ask and a search embedding cannot tell them apart. Where the concept has an ORIGINAL term, that term gets its own question, since a reader searching it would otherwise miss this passage entirely.
    AND ONLY WHERE THE PASSAGE ANSWERS IT. If a phrase is merely used or quoted without being explained — a passage that says someone gave "my tired moments" is not explaining what tired moments ARE — then this passage is not the answer to "what does that mean", and asking it sends readers here for nothing.
    Define a term ONLY where the passage gives that term its own content — says what it IS, or draws a line between it and something else. A word the passage merely uses, as one of several ways of naming a single idea, does not get its own definition.
  • NO YES/NO QUESTIONS. "Does nature have consciousness?" and "Is nature in the grasp of God?" retrieve badly — a reader asks "what does X teach about Y", and a yes/no phrasing sits far from that in embedding space while adding no distinct ask. Turn each into the open form it is hiding: "What does ‘Abdu'l-Bahá teach about nature's lack of consciousness?"
  • EVERY QUESTION CARRIES THE SPAN THAT ANSWERS IT. Give "a" — the words from the passage a reader would be shown as the answer, copied verbatim. Two questions answered by the SAME words are one question, however differently worded, and only one will be kept. This is not a limit on how many: a paragraph answering thirty distinct things gets thirty. It is a test of whether an ask is really distinct, and the span is how you check your own work before writing it down.
  • NO CATCH-ALL QUESTIONS. "What did ‘Abdu'l-Bahá say about nature in Some Answered Questions?" is not a question, it is the paragraph's topic with a question mark. It matches everything about the topic and so distinguishes nothing.
  • NEVER NAME THE BOOK OR WORK IN A QUESTION. Not "in Some Answered Questions", not "in the Kitáb-i-Íqán", not "according to this book". The purpose of these questions is to TIE A CONCEPT ACROSS THE WHOLE CORPUS: the same concept is developed in many works, and a reader asking "what is meant by justice" should reach every passage that answers it, not only the one whose title they happened to name. Scoping to a book or a religion is done by a FILTER at search time and needs no help from the question text. A title inside the question only narrows what it can match, and a page of questions all ending in the same title matches little but itself.
  • Naming the AUTHOR is different and allowed where it is natural — readers really do ask "what did ‘Abdu'l-Bahá teach about the soul" — because it identifies a voice that speaks across many works rather than fencing the question inside one of them. Still do not put it in every question.
  • At least ONE question phrased WITHOUT naming any person — by theme, event, place or period — so topic searches also retrieve this paragraph.
  • Use the name-forms a reader would type: canonical short names (the CAST's primary forms), never long honorific chains.
  • Ground every question in what the paragraph ACTUALLY says — never invent facts.
- "thesis": ONE sentence (20-45 words) stating what this paragraph teaches as a proposition, stated directly.

If ESTABLISHED FACTS are provided with the paragraph, they are cited claims extracted from THIS paragraph — the knowledge researchers seek here. EVERY listed fact must be reachable by at least one question (closely related facts may share a question). Prefer fact-bearing questions over generic ones.

If AUTHORITATIVE INTERPRETATIONS are provided, they are the doctrinal claims this passage establishes, each with its ORIGINAL-LANGUAGE TERM in brackets. These are what a serious reader comes for, so make each one findable. Where a concept carries an original term, write at least one question a reader would ask USING THAT TERM — "What does ʿirfán mean in the Kitáb-i-Íqán?", "What is the difference between ʿadl and inṣáf?" — because a reader who knows the term searches with it, and the English gloss will not retrieve them. Ask about the concept; never echo the interpretation's wording back as a question.

Return exactly: {"questions":[{"q":"…?","a":"verbatim words from the passage that answer it"}],"thesis":"…"} (as many as the paragraph answers)

BOOK:
${bookMeta}${cast ? `\n\nBOOK CAST (who's-who — resolve a name to the right figure; do not ask about people not in the paragraph):\n${cast}` : ''}`;
}

// Split a long paragraph into sentence groups of ~SLICE_TARGET chars. Sentence-boundary regex covers
// Latin + Arabic-script terminators; a paragraph with no detectable boundaries stays one slice.
export function sliceParagraph(text) {
  if (text.length <= SLICE_CHARS) return [text];
  const sentences = text.split(/(?<=[.!?؟۔…])\s+/u).filter((s) => s.trim());
  if (sentences.length < 2) return [text];
  const slices = []; let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > SLICE_TARGET) { slices.push(cur.trim()); cur = ''; }
    cur += (cur ? ' ' : '') + s;
  }
  if (cur.trim()) slices.push(cur.trim());
  return slices;
}

// Slice parts 2+ carry no thesis — questions only.
export function parseHypeSlice(raw) {
  const p = parseHype(raw);
  return p ? { questions: p.questions, thesis: '' } : null;
}

// The concept layer (conceptual-track §7). HyPE is the RETRIEVAL level of the same idea the lexicon holds,
// so a doctrinal passage needs its concepts fed back exactly as v2 feeds back person claims — otherwise the
// questions restate the passage's own wording. Measured on the Íqán's clouds/Matthew-24 passage (the design's
// worked example): with no concept layer it produced "What will men lament when the tribes of the earth
// mourn?" — a paraphrase that only matches a query already using the passage's vocabulary.
//
// Framed as ASK-ABOUT, unlike CONTEXT which is explicitly reference-resolution only: the concept IS the thing
// a reader searches for. Bounded, so a large lexicon cannot crowd out the paragraph itself.
const MAX_CONCEPTS_PER_PARA = 8;
export function buildUser(p, facts = null, slice = null, concepts = null) {
  const factBlock = facts?.length
    ? `\n\nESTABLISHED FACTS (cited claims from this paragraph — make each retrievable):\n${facts.slice(0, MAX_FACTS_PER_PARA).map((f) => `- ${f}`).join('\n')}`
    : '';
  const conceptBlock = concepts?.length
    ? `\n\nAUTHORITATIVE INTERPRETATIONS this passage develops (ASK ABOUT THESE — name the concept, do not echo the wording):\n${concepts.slice(0, MAX_CONCEPTS_PER_PARA).map((c) => `- ${c}`).join('\n')}`
    : '';
  if (!slice) return `CONTEXT (disambiguation — for resolving references only): ${p.context || '(none)'}${factBlock}${conceptBlock}\n\nPARAGRAPH [${p.pid}]:\n${p.text}`;
  const thesisNote = slice.part === 1
    ? 'Include the "thesis" for the WHOLE paragraph.'
    : 'Set "thesis" to "" — it was written with part 1.';
  return `CONTEXT (disambiguation — for resolving references only): ${p.context || '(none)'}${factBlock}${conceptBlock}\n\nFULL PARAGRAPH [${p.pid}] (for context only):\n${p.text}\n\nFOCUS (part ${slice.part}/${slice.parts}) — write questions ONLY for what these sentences state (facts covered by other parts are handled there). ${thesisNote}\nFOCUS SENTENCES:\n${slice.focus}`;
}
