// enrich/retrieval — HyPE: the hypothetical questions each passage answers, so a reader's own wording
// retrieves it. Runs AFTER disambiguation (gated): it reads the disambiguation note to resolve references,
// then writes 5 English questions + a one-sentence thesis per paragraph. Questions are ALWAYS English — the
// cross-lingual bridge: an English query embedding matches the English HyPE of a Persian/Arabic passage, so
// one index retrieves the whole corpus. Same cache discipline as disambiguation (stable SYS prefix; segments
// concurrent, sequential within).
import { assertDisambiguated } from '../kernel/gate.js';  // HyPE consumes disambiguated text → gate first
import { profileFor } from '../kernel/profile.js';
import { segment } from '../kernel/segment.js';
import { pool } from '../kernel/run.js';

const DENSE_HINT = 'Keep each question short; output ONLY the compact JSON object, nothing else.';
const MIN_LEN = 60; // skip headers/fragments (titles, publisher lines) not worth HyPE

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const profile = await profileFor(ctx, docId);
  const [meta, all, cast] = await Promise.all([ctx.store.getDocMeta(docId), ctx.store.getParagraphs(docId), castOf(ctx, docId)]);
  const long = all.filter((p) => p.text.length >= (opts.minLen ?? MIN_LEN));
  const paras = (opts.resume ?? true) ? long.filter((p) => !isDone(p)) : long;
  const segs = segment(paras, { mode: profile.segmentation, segMax: opts.segMax ?? 60 });
  const system = buildSystem(profile, meta, cast);
  const route = { model: opts.model ?? profile.models.hype, fallback: opts.fallback ?? profile.fallback };
  const maxTokens = (m) => (ctx.catalog.get(m)?.capabilities?.includes('reasoning') ? 6000 : 1500);
  const stats = { paras: paras.length, segments: segs.length, done: 0, failed: 0, escalated: 0 };
  // Report per PARAGRAPH — HyPE runs one call per paragraph inside each segment; total = paras.length.
  const report = () => opts.onProgress?.(stats.done + stats.failed, paras.length);

  await pool(opts.concurrency ?? 5, segs, async (seg) => {
    for (const p of seg) {
      const user = buildUser(p);
      const { parsed, escalated } = await ctx.model.runLadder({ route, system, user, parse: parseHype, maxTokens, temperature: 0.3, denseHint: DENSE_HINT });
      if (!parsed) { stats.failed++; report(); continue; }
      if (!opts.dryRun) await ctx.store.saveHype(p.id, parsed.questions, parsed.thesis);
      stats.done++; if (escalated) stats.escalated++; report();
    }
  });
  ctx.log.info?.({ docId, ...stats }, 'retrieval/hype');
  return stats;
}

const castOf = (ctx, docId) => (ctx.store.getCastSeed ? Promise.resolve(ctx.store.getCastSeed(docId)).catch(() => '') : Promise.resolve(''));
// A paragraph is HyPE-done only with the NEW format: a JSON array of ≥4 questions AND a thesis. Old
// newline-joined HyPE (no thesis) fails this → gets regenerated.
const isDone = (p) => { if (!p.hypThesis) return false; try { const a = JSON.parse(p.hyp); return Array.isArray(a) && a.length >= 4; } catch { return false; } };

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function parseHype(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const q = (j.questions || []).filter((x) => typeof x === 'string' && x.trim());
    if (q.length < 4) return null;
    return { questions: q.slice(0, 5), thesis: String(j.thesis || '').trim() };
  } catch { return null; }
}

const LANG_NAME = { en: 'English', fa: 'Persian', ar: 'Arabic', he: 'Hebrew' };

export function buildSystem(profile, meta, cast = '') {
  const lang = LANG_NAME[profile.lang] || profile.lang;
  const foreign = profile.lang !== 'en'
    ? `\nThe paragraph is in ${lang} (${profile.script} script) — READ it, but write ALL questions and the thesis in ENGLISH so an English query can retrieve this ${lang} passage.\n` : '';
  const bookMeta = [`"${meta.title}" by ${meta.author || '?'}`, [meta.religion, meta.collection].filter(Boolean).join(' / '), meta.year ? `Year ${meta.year}` : '', meta.description ? `About: ${String(meta.description).slice(0, 240)}` : ''].filter(Boolean).join('\n');
  return `You generate Hypothetical Prompt Embeddings (HyPE) for ONE paragraph, to power semantic search. A reader searches with a QUESTION; write the questions THIS paragraph answers, so it is retrievable by anyone asking about its content in their own words. Output JSON ONLY.
${foreign}
From the paragraph (use the disambiguation CONTEXT only to resolve who/what/where — do NOT ask about the context):
- "questions": EXACTLY 5, each ending "?", max 15 words, one per register: (1) a concrete factual who/what/when it states, (2) a second distinct concrete fact, (3) the concept/term/role it explains, (4) what follows from / is significant about it, (5) how a thoughtful lay reader would casually ask. Vary phrasing; never invent facts.
- "thesis": ONE sentence (20-45 words) stating what this paragraph teaches as a proposition, stated directly.

Return exactly: {"questions":["…?","…?","…?","…?","…?"],"thesis":"…"}

BOOK:
${bookMeta}${cast ? `\n\nBOOK CAST (who's-who — resolve a name to the right figure; do not ask about people not in the paragraph):\n${cast}` : ''}`;
}

export function buildUser(p) {
  return `CONTEXT (disambiguation — for resolving references only): ${p.context || '(none)'}\n\nPARAGRAPH [${p.pid}]:\n${p.text}`;
}
