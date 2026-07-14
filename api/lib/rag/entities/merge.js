// entities/merge — deduplicate entities by EVIDENCE. Same-name groups are adjudicated: which rows are the
// SAME person (merge into one canonical) vs DISTINCT namesakes (keep apart). Role/era/place/connection must
// agree — a shared name ALONE never merges (namesakes abound; the project's core doctrine). Repoints
// mentions + claims to the canonical and records an append-only merge decision (reversible). The projection
// (graph_entities) rows for merged ids become empty and can be dropped by a later projection rebuild.
import { pool } from '../kernel/run.js';

export const SYSTEM = `You deduplicate PERSON entities that share a name: decide which are the SAME individual (merge) vs DISTINCT namesakes (keep apart), judged by EVIDENCE CONSISTENCY — NOT by whether their facts overlap.
MERGE when the records are CONSISTENT. The same person recorded in different books or episodes carries DIFFERENT but COMPATIBLE facts (one source covers their lineage, another a later event) — that is NOT a reason to keep them apart. Two same-name records are a FAILED SPLIT to merge whenever nothing CONTRADICTS. This includes the common case where one record is thin or has no facts yet — merge it into the richer one.
KEEP APART (distinct) ONLY when a LOAD-BEARING fact truly CONTRADICTS: a different nisba/place-of-origin (Yazdí vs Turshízí), an incompatible era/lifespan (1850 vs 1912), a different death (place or year), a different father/kin, or an incompatible role/side. A contradiction is decisive; mere non-overlap or thin evidence is NOT a contradiction.
The ONLY caution: a BARE, very common given-name with NOTHING distinguishing on either side (several bare "Aḥmad"/"Muḥammad"/"‘Alí", no role/kin/event) may be different people — keep apart unless a positive signal ties them. A distinctive or qualified name (full name, nisba, epithet, title, foreign statesman) with no contradiction → MERGE.
Pick "canonical" = the entity with the richest evidence (most claims/mentions/fullest summary).
Return ONLY JSON: {"canonical":<id>,"same":[<ids to merge INTO canonical>],"distinct":[<ids that genuinely CONTRADICT — keep>],"reason":"<=20 words"}.`;

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
