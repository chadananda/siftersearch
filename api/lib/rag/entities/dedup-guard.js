// entities/dedup-guard — catch CROSS-NAME duplicates that same-name merge (entities/merge) and name-recall
// reconcile both miss: the same person entered under a different transliteration/name/epithet across two
// books. For each candidate entity (typically those just CREATED for this book) it searches the GROUNDED
// corpus by the entity's DISTINCTIVE FACTS (death place/year, kinship, office) — never its name — to surface
// an existing entity with the same facts, then a model confirms same-vs-namesake on the two fact sets. A
// confirmed match becomes a PROPOSED merge decision (append-only, reversible) — never an auto-edit. This is
// "hard claims as evidence for merging/splitting". Uses store.searchGrounded (resolve-by-fact) + a grounded
// corpus, so it is only meaningful AFTER prior books are grounded (the point of cumulative ordering).
import { pool } from '../kernel/run.js';
import { IDENTITY_DOCTRINE } from './evidence-doctrine.js';

export const SYSTEM = `${IDENTITY_DOCTRINE}

You decide whether TWO person records are the SAME individual recorded under different names/spellings — judged by their FACTS, not their names (names may be transliterated differently, or one may be an epithet).
The SUBJECT and one or more CANDIDATES each come with distinctive facts (birth/death place & year, kinship, office/title, participation).
Rules: SAME only when the load-bearing facts AGREE — same death (place+year), same kin, same office/era. ONE contradicting load-bearing fact (different death place/year, different father, incompatible era) → DISTINCT (namesakes). A shared role or era alone is NOT enough. Prefer DISTINCT when evidence is thin — a false merge fabricates one person from two.
Return ONLY JSON: {"same":<candidate id or null>,"canonical":<id whose record is richer/more authoritative, or null>,"reason":"<=20 words"}.`;

export async function run(ctx, opts = {}) {
  const ids = opts.entityIds || [];
  const route = { model: opts.model ?? ctx.config.models?.merge, fallback: opts.fallback ?? ctx.config.models?.mergeFallback };
  const stats = { checked: 0, searched: 0, adjudicated: 0, proposed: 0, failed: 0 };
  const decisions = [];

  await pool(opts.concurrency ?? 4, ids, async (id) => {
    stats.checked++;
    const self = await ctx.store.getEntityFacts(id, { limit: 6 });
    if (!self?.facts?.length) return;                                 // no evidence → cannot dedup by fact
    self.id = id;
    const query = self.facts.map((f) => f.statement).join(' ').slice(0, 300);
    const hits = ((await ctx.store.searchGrounded?.(query, { limit: 8 })) || []).filter((h) => h.entityId && h.entityId !== id);
    if (!hits.length) return;
    stats.searched++;
    const cands = groupCandidates(hits);
    const { parsed } = await ctx.model.runLadder({ route, system: SYSTEM, user: buildUser(self, cands), parse: parseDedup, maxTokens: 300 });
    if (!parsed) { stats.failed++; return; }
    stats.adjudicated++;
    if (!parsed.same || !cands.some((c) => c.entityId === parsed.same)) return;   // distinct → keep apart
    const canonical = parsed.canonical || parsed.same;                            // default: keep the pre-existing entity
    const merge = canonical === id ? [parsed.same] : [id];
    decisions.push({ kind: 'merge', targetKind: 'entity', targetIds: [canonical, ...merge],
      payload: { canonical, merge }, evidence: { via: 'grounded-facts', candidates: cands.map((c) => c.entityId) },
      rationale: parsed.reason, actor: 'model', actorTier: 2, confidence: parsed.confidence ?? 0.7, status: 'proposed' });
  }, opts.onProgress);

  if (!opts.dryRun && decisions.length) stats.proposed = await ctx.store.saveDecisions(decisions);
  ctx.log.info?.(stats, 'entities/dedup-guard');
  return opts.dryRun ? { ...stats, decisions } : stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

// Fold grounded hits (each a fact bound to an entity) into per-candidate fact bundles.
export function groupCandidates(hits) {
  const by = new Map();
  for (const h of hits) {
    if (!by.has(h.entityId)) by.set(h.entityId, { entityId: h.entityId, name: h.name, facts: [] });
    by.get(h.entityId).facts.push(h.fact);
  }
  return [...by.values()].slice(0, 4);
}

export function parseDedup(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return { same: j.same ?? null, canonical: j.canonical ?? null, reason: j.reason || '', confidence: j.confidence ?? null };
  } catch { return null; }
}

export function buildUser(self, cands) {
  const selfBlock = `SUBJECT #${self.id} "${self.name}"\n  facts: ${self.facts.map((f) => f.statement).join(' · ').slice(0, 300)}`;
  const candBlock = cands.map((c) => `CANDIDATE #${c.entityId} "${c.name}"\n  facts: ${c.facts.join(' · ').slice(0, 300)}`).join('\n');
  return `${selfBlock}\n\n${candBlock}\n\nIs the SUBJECT the SAME individual as any CANDIDATE (same person, different name/spelling)? Decide by the FACTS, not the names.`;
}
