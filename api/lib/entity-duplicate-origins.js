// Read-only: WHERE do duplicate people come from? For each prominent person that has same-name duplicates, find
// the decision that created each duplicate (entity_decisions kind=create, payload.applied_entity_id) and report
// whether the real person was among the candidates the adjudicator saw — recall failure (absent) vs judgement
// failure (present, still created) — or whether no decision created it at all (a script/seed/other creator).
// Deps: db, encounters (name owners).
import { queryAll } from './db.js';
import { getEncounterIndex } from './encounters.js';

const parse = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } };

export async function duplicateOrigins({ minImportance = 50, maxGroups = 40 } = {}) {
  const idx = await getEncounterIndex();
  // Group live persons by their canonical core phrase; a group led by a prominent person is a duplicate family.
  const byPhrase = new Map();
  for (const p of idx.people.values()) {
    const ph = p.forms[0]?.phrase; if (!ph) continue;
    (byPhrase.get(ph) || byPhrase.set(ph, []).get(ph)).push(p);
  }
  // Also count persons whose canonical CONTAINS a prominent person's name as a parenthetical/descriptor twin.
  const prominent = [...idx.people.values()].filter((p) => p.imp >= minImportance);
  const families = [];
  for (const anchor of prominent) {
    const ph = anchor.forms[0]?.phrase; if (!ph) continue;
    const twins = (byPhrase.get(ph) || []).filter((p) => p.id !== anchor.id && p.imp < anchor.imp);
    if (twins.length) families.push({ anchor, twins });
  }
  families.sort((a, b) => b.anchor.imp - a.anchor.imp || b.twins.length - a.twins.length);
  const chosen = families.slice(0, maxGroups);
  const want = new Set(chosen.flatMap((f) => f.twins.map((t) => t.id)));

  const creates = await queryAll(`SELECT id, payload, evidence, rationale, confidence, method_version, status
    FROM entity_decisions WHERE kind = 'create'`, [], 'dup-origins:creates');
  const byEntity = new Map();
  for (const d of creates) {
    const p = parse(d.payload);
    const eid = Number(p.applied_entity_id);
    if (want.has(eid)) byEntity.set(eid, { ...d, p, ev: parse(d.evidence) });
  }
  const ids = [...want];
  const meta = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const ch = ids.slice(i, i + 500);
    for (const r of await queryAll(`SELECT * FROM graph_entities WHERE id IN (${ch.map(() => '?').join(',')})`, ch, 'dup-origins:ents')) meta.set(r.id, r);
  }
  const tally = { twins: 0, noDecision: 0, anchorWasCandidate: 0, anchorNotCandidate: 0 };
  const groups = chosen.map(({ anchor, twins }) => ({
    anchor: `${anchor.name} #${anchor.id} (imp ${anchor.imp})`,
    twins: twins.map((t) => {
      tally.twins++;
      const d = byEntity.get(t.id);
      const m = meta.get(t.id) || {};
      if (!d) { tally.noDecision++; return { id: t.id, name: t.name, origin: 'no create decision', entity: { created_at: m.created_at ?? null, source: m.source ?? m.origin ?? null, lav: m.last_assessed_version ?? null } }; }
      const cands = (d.ev.candidates || []).map(Number);
      const seen = cands.includes(anchor.id);
      tally[seen ? 'anchorWasCandidate' : 'anchorNotCandidate']++;
      return { id: t.id, name: t.name, origin: seen ? 'judgement: anchor WAS a candidate' : 'recall: anchor NOT among candidates',
        resolvedAs: d.p.resolvedAs, docId: d.p.docId, rationale: d.rationale, confidence: d.confidence, method: d.method_version, status: d.status, candidates: cands };
    }),
  }));
  return { families: families.length, tally, groups };
}
