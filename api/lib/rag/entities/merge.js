// entities/merge — deduplicate entities by EVIDENCE. Same-name groups are adjudicated: which rows are the
// SAME person (merge into one canonical) vs DISTINCT namesakes (keep apart). Role/era/place/connection must
// agree — a shared name ALONE never merges (namesakes abound; the project's core doctrine). Repoints
// mentions + claims to the canonical and records an append-only merge decision (reversible). The projection
// (graph_entities) rows for merged ids become empty and can be dropped by a later projection rebuild.
import { pool } from '../kernel/run.js';

export const SYSTEM = `You deduplicate PERSON entities. Given a GROUP of entities that share a name (each with its evidence — mention count, summary, sample facts), decide which are the SAME individual and which are DISTINCT namesakes.
Rules: merge ONLY when role, era, place, and connections agree; a shared NAME alone is NEVER enough (many people share a name — keep them apart). Different nisbas/roles/eras = different people. Prefer keeping apart over a wrong merge (a false merge fabricates one person from two).
Pick as "canonical" the entity with the richest evidence (most mentions / fullest summary).
Return ONLY JSON: {"canonical":<id>,"same":[<ids that ARE the canonical, to merge in>],"distinct":[<ids that are DIFFERENT people, keep>],"reason":"<=20 words"}.`;

export async function run(ctx, opts = {}) {
  const groups = await ctx.store.getDuplicateGroups({ type: 'person', minSize: opts.minSize ?? 2, limit: opts.limit });
  const route = { model: opts.model ?? ctx.config.models?.merge, fallback: opts.fallback ?? ctx.config.models?.mergeFallback };
  const stats = { groups: groups.length, adjudicated: 0, failed: 0, merges: 0, entitiesMerged: 0, kept: 0 };
  const plans = [];

  await pool(opts.concurrency ?? 4, groups, async (g) => {
    const { parsed } = await ctx.model.runLadder({ route, system: SYSTEM, user: buildUser(g), parse: parseMerge, maxTokens: 500 });
    if (!parsed || !parsed.canonical) { stats.failed++; return; }
    stats.adjudicated++;
    const same = (parsed.same || []).filter((id) => id !== parsed.canonical && g.ids.includes(id));
    stats.kept += (parsed.distinct || []).length;
    if (!same.length) return;
    plans.push({ canonical: parsed.canonical, merge: same, reason: parsed.reason, key: g.key });
  });

  if (opts.dryRun) return { ...stats, plans };
  for (const p of plans) {
    stats.entitiesMerged += await ctx.store.applyMerge(p.canonical, p.merge, p.reason);
    stats.merges++;
  }
  ctx.log.info?.(stats, 'entities/merge');
  return stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function parseMerge(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!j.canonical) return null;
    return { canonical: j.canonical, same: Array.isArray(j.same) ? j.same : [], distinct: Array.isArray(j.distinct) ? j.distinct : [], reason: j.reason || '' };
  } catch { return null; }
}

export function buildUser(group) {
  const lines = group.entities.map((e) => `  #${e.id} "${e.canonical}" — ${e.mentions} mentions${e.summary ? ' — ' + String(e.summary).slice(0, 120) : ''}${e.facts ? ' · facts: ' + String(e.facts).slice(0, 120) : ''}`).join('\n');
  return `NAME GROUP "${group.key}" — entities that share this name:\n${lines}\n\nWhich are the SAME person (merge) and which are distinct namesakes (keep)?`;
}
