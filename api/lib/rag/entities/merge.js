// entities/merge — deduplicate entities by EVIDENCE. Same-name groups are adjudicated: which rows are the
// SAME person (merge into one canonical) vs DISTINCT namesakes (keep apart). Role/era/place/connection must
// agree — a shared name ALONE never merges (namesakes abound; the project's core doctrine). Repoints
// mentions + claims to the canonical and records an append-only merge decision (reversible). The projection
// (graph_entities) rows for merged ids become empty and can be dropped by a later projection rebuild.
import { pool } from '../kernel/run.js';
import { IDENTITY_DOCTRINE } from './evidence-doctrine.js';

export const SYSTEM = `${IDENTITY_DOCTRINE}

You deduplicate PERSON entities that share a name: decide which are the SAME individual (merge) vs DISTINCT namesakes (keep apart), judged by EVIDENCE CONSISTENCY — NOT by whether their facts overlap.
MERGE when the records are CONSISTENT. The same person recorded in different books or episodes carries DIFFERENT but COMPATIBLE facts (one source covers their lineage, another a later event) — that is NOT a reason to keep them apart. Two same-name records are a FAILED SPLIT to merge whenever nothing CONTRADICTS. This includes the common case where one record is thin or has no facts yet — merge it into the richer one.
KEEP APART (distinct) ONLY when a LOAD-BEARING fact truly CONTRADICTS: a different nisba/place-of-origin (Yazdí vs Turshízí), an incompatible era/lifespan (1850 vs 1912), a different death (place or year), a different father/kin, or an incompatible role/side. A contradiction is decisive; mere non-overlap or thin evidence is NOT a contradiction.
CRITICAL over-merge guard for COMMON names: if a record is BARE or near-empty (no facts of its OWN — no role, kin, place, event) AND its name is a common given-name/patronymic (Muḥammad, Aḥmad, ‘Alí, Ḥusayn, Ḥasan, Mihdí, ‘Abdu'lláh, Riḍá, Faris, and the like), then absence-of-contradiction is NOT enough — such a record could be any of dozens of people. Keep it DISTINCT unless it carries its OWN POSITIVE tie (a shared distinctive role, kinship, event, or place). NEVER fold a bare factless "Muḥammad" into the Prophet, or a bare "‘Alí"/"Mihdí"/"‘Abdu'lláh" into a specific person, merely because the richer record exists and nothing contradicts.
By contrast, a DISTINCTIVE or QUALIFIED name — a full name, a nisba (-i-Yazdí), a title/epithet, a foreign name — merges on absence of contradiction (those thin records ARE failed splits of the same person).
Pick "canonical" = the entity with the richest evidence (most claims/mentions/fullest summary).
Return ONLY JSON: {"canonical":<id>,"same":[<ids to merge INTO canonical>],"distinct":[<ids that genuinely CONTRADICT — keep>],"reason":"<=20 words"}.`;

export async function run(ctx, opts = {}) {
  const groups = await ctx.store.getDuplicateGroups({ type: 'person', minSize: opts.minSize ?? 2, limit: opts.limit,
    minImportance: opts.minImportance ?? null, maxSize: opts.maxSize ?? 12 });
  const route = { model: opts.model ?? ctx.config.models?.merge, fallback: opts.fallback ?? ctx.config.models?.mergeFallback };
  const stats = { groups: groups.length, adjudicated: 0, failed: 0, merges: 0, entitiesMerged: 0, kept: 0 };
  const plans = [];

  await pool(opts.concurrency ?? 4, groups, async (g) => {
    const { parsed } = await ctx.model.runLadder({ route, system: SYSTEM, user: buildUser(g), parse: parseMerge, maxTokens: 500 });
    if (!parsed || !parsed.canonical) { stats.failed++; return; }
    stats.adjudicated++;
    const members = [parsed.canonical, ...(parsed.same || [])].filter((id, i, a) => g.ids.includes(id) && a.indexOf(id) === i);
    stats.kept += (parsed.distinct || []).length;
    if (members.length < 2) return;
    // The model decides WHO is the same person; the survivor is chosen by the record, not the model: it picked thin
    // new duplicates over curated originals, and the originals' importance and group membership went with them.
    const canonical = pickCanonical(g.entities, members);
    plans.push({ canonical, merge: members.filter((id) => id !== canonical), reason: parsed.reason, key: g.key });
  }, opts.onProgress);

  if (opts.dryRun) return { ...stats, plans };
  for (const p of plans) {
    stats.entitiesMerged += await ctx.store.applyMerge(p.canonical, p.merge, p.reason);
    stats.merges++;
  }
  ctx.log.info?.(stats, 'entities/merge');
  return stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Survivor of a merge: highest importance, then most mentions, then the oldest (lowest) id. */
export function pickCanonical(entities, ids) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return [...ids].sort((a, b) => ((byId.get(b)?.importance ?? -1) - (byId.get(a)?.importance ?? -1))
    || ((byId.get(b)?.mentions ?? 0) - (byId.get(a)?.mentions ?? 0)) || a - b)[0];
}

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
