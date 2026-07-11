// entities/mentions — the source-anchored mention substrate. Reads the disambiguation notes and records each
// resolved reference as a mention with a STABLE anchor = sha1(doc|para|surfaceNorm|occurrence) — so re-deriving
// with a better model yields the SAME anchor and every downstream decision (merge/split/verify) survives.
// identity is DEFERRED: entity_id is never set here (name nominates; evidence binds at reconcile). Gated on
// disambiguation.
import { createHash } from 'node:crypto';
import { assertDisambiguated } from '../kernel/gate.js';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const version = opts.version ?? ctx.config.versions?.disambig ?? 'disambig-v1';
  const paras = (await ctx.store.getParagraphs(docId)).filter((p) => p.context && p.contextModel === version);
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
  const stats = { paras: paras.length, mentions: mentions.length, written };
  ctx.log.info?.({ docId, ...stats }, 'entities/mentions');
  return stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

// Extract «surface = resolved» pairs from a note. The note is "@place, ~era — idea · s1 = h1; s2 = h2";
// resolutions live after the first " · ". Tolerant of quotes around the surface; skips abstentions ("?").
export function parseMentions(context) {
  const afterDash = String(context).split('—').slice(1).join('—');
  const i = afterDash.indexOf(' · ');
  if (i < 0) return [];
  return afterDash.slice(i + 3).split(';').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const eq = pair.indexOf(' = ');
    if (eq < 0) return null;
    const surface = pair.slice(0, eq).trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
    const resolvedAs = pair.slice(eq + 3).trim();
    if (!surface || !resolvedAs || /^\?+$/.test(resolvedAs)) return null;
    return { surface, resolvedAs };
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
