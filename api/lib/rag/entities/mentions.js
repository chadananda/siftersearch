// entities/mentions — the source-anchored mention substrate. Reads the disambiguation notes and records each
// resolved reference as a mention with a STABLE anchor = sha1(doc|para|surfaceNorm|occurrence) — so re-deriving
// with a better model yields the SAME anchor and every downstream decision (merge/split/verify) survives.
// identity is DEFERRED: entity_id is never set here (name nominates; evidence binds at reconcile). Gated on
// disambiguation.
import { createHash } from 'node:crypto';
import { assertDisambiguated } from '../kernel/gate.js';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.98 });   // ONE bar (kernel/gate) — 0.99 stranded 98–99% books
  const version = opts.version ?? ctx.config.versions?.disambig ?? 'disambig-v1';
  // `p.context != null`, NOT `p.context` — an EMPTY note is "examined, nothing to resolve", a complete
  // disambiguation result (pipeline/processed.js rule 1). Truthiness dropped exactly those paragraphs, so on
  // a sparse book they would never be stamped as extracted, coverage could never reach the bar, and the book
  // would be re-extracted forever: the yield-based grind rebuilt one layer down. Parsing an empty note simply
  // yields no pairs, which is the correct outcome for it.
  // A NOTE IS EXTRACTABLE WHATEVER STAMPED IT (Chad's call, 2026-08-15, after the class turned out to be
  // 710 books / 83,899 paragraphs rather than the 8 I first reported).
  //
  // This required contextModel === version, which made a whole class of book IMPOSSIBLE: paragraphs whose
  // notes predate the version stamp carry context_model NULL, so disambiguation coverage calls the book
  // 100% done (`context IS NOT NULL`) while this stage sees ZERO eligible paragraphs. No mentions, and no
  // extraction stamps either — so the completion gate can never be met, resumeStageFor sends the book back
  // here, and it fails identically until the storm guard parks it. That produced a 30-failure storm.
  //
  // The version filter was an optimisation for re-derivation, not a correctness rule: each mention records
  // its own methodVersion, so a later pass can still re-derive from better notes. The known cost, stated
  // plainly: anchors are stable and saveMentions is INSERT OR IGNORE, so a mention derived from an older
  // note will not be overwritten by a better one later — re-derivation has to clear them first. At 710
  // books that trade beats re-disambiguating 84k paragraphs.
  const paras = (await ctx.store.getParagraphs(docId)).filter((p) => p.context != null);
  const mentions = [];
  const seen = new Set();
  for (const p of paras) {
    for (const { surface, resolvedAs } of parseMentions(p.context)) {
      const surfaceNorm = normSurface(surface);
      if (!surfaceNorm) continue;
      const anchor = anchorOf(docId, p.pid, surfaceNorm, 0);
      if (seen.has(anchor)) continue;                 // de-dup identical mentions within the run
      seen.add(anchor);
      mentions.push({ anchor, docId, paraId: p.pid, occurrence: 0, surface, surfaceNorm, resolvedAs: resolvedAs.slice(0, 120), methodVersion: version });
    }
  }
  const written = opts.dryRun ? 0 : await ctx.store.saveMentions(mentions);
  // STAMP EVERY PARAGRAPH READ, not just the ones that yielded a mention. This stage's only trace used to be
  // its output, so a paragraph naming nobody looked exactly like a paragraph never attempted — completion had
  // to be guessed from yield or from the fact that a later stage ran, and both guesses certified 53 books
  // done having never been extracted. The stamp also carries the extractor VERSION, which is what makes an
  // upgrade targetable (re-run WHERE extract_model <> current) instead of all-or-nothing (2026-08-14).
  const extractVersion = opts.extractVersion ?? ctx.config.versions?.extract ?? 'extract-v2';
  let stamped = 0;
  if (!opts.dryRun && ctx.store.markExtracted) {
    const ids = paras.map((p) => p.id).filter((id) => id != null);
    await ctx.store.markExtracted(ids, extractVersion);
    stamped = ids.length;
  }
  const stats = { paras: paras.length, mentions: mentions.length, written, stamped, extractVersion };
  ctx.log.info?.({ docId, ...stats }, 'entities/mentions');
  return stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

// Extract «"surface" = resolved» pairs from a note. Notes read "@place, ~era [pin] — [idea ·] "s1" = h1;
// "s2" = h2". Surfaces are QUOTED (straight or curly); the regex matches only quoted pairs, so any idea
// prefix and the "@place, era" header (which may itself contain an em-dash) are naturally skipped. Skips
// abstentions ("?").
const RESOLVE = /["“”]([^"“”]{1,70})["“”]\s*=\s*([^;]+?)(?=\s*;|\s*$)/g;
const keep = (s, r) => s && r && !/^\?+$/.test(r);
export function parseMentions(context) {
  const body = String(context).split('—').slice(1).join('—');
  // Format A (GPB/DB): QUOTED "surface" = handle — the regex ignores the @place header (even if it has an em-dash).
  const out = [];
  const re = new RegExp(RESOLVE.source, 'g');
  let m;
  while ((m = re.exec(body))) { const s = m[1].trim(), r = m[2].trim(); if (keep(s, r)) out.push({ surface: s, resolvedAs: r }); }
  if (out.length) return out;
  // Format B (wave-1/ROB/Taherzadeh): UNQUOTED "idea · surface = handle; surface2 = handle2" — resolves after " · ".
  const dot = body.indexOf(' · ');
  if (dot < 0) return [];
  return body.slice(dot + 3).split(';').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const eq = pair.indexOf(' = ');
    if (eq < 0) return null;
    const surface = pair.slice(0, eq).trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
    const resolvedAs = pair.slice(eq + 3).trim();
    return keep(surface, resolvedAs) ? { surface, resolvedAs } : null;
  }).filter(Boolean);
}

// Normalise a surface for de-dup only (NOT for identity): strip diacritics + quotes, collapse space, lower.
export function normSurface(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
}

// Stable, content-addressed mention id. Same source position + surface → same anchor across every re-run.
export function anchorOf(docId, paraId, surfaceNorm, occurrence = 0) {
  return createHash('sha1').update(`${docId}|${paraId}|${surfaceNorm}|${occurrence}`).digest('hex').slice(0, 16);
}
