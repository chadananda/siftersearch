// Who-met-whom fast path: an in-memory join over encounter claims (met/accompanied/visited/…) + group rosters.
// Only ~22% of encounter claims carry target_entity_id, so each claim is matched by its typed target OR by the
// person's name forms appearing as whole words in its statement. Loaded once (≈100k rows), refreshed stale-while-
// revalidate; a query is a few ms, never a LIKE scan. Returns null when the question is not who-met-whom.
// Deps: db, entity-live, source-links.
import { queryAll } from './db.js';
import { LIVE_SQL } from './entity-live.js';
import { linkFor } from './source-links.js';

export const ENCOUNTER_RELATIONS = ['met', 'accompanied', 'companion-of', 'knew', 'visited', 'hosted', 'host-of',
  'interviewed-by', 'summoned', 'summoned-by', 'recognized', 'taught-by', 'teacher-of', 'disciple-of', 'converted-by'];
const REL_RANK = new Map(ENCOUNTER_RELATIONS.map((r, i) => [r, i]));
const VERB = /\b(met|meet|meets|meeting|accompan\w*|knew|know|known|visit\w*|encounter\w*|companions?|presence|attain\w*|host\w*|interview\w*|summon\w*|saw|seen|see)\b/;
// Honorifics are features (they separate Mullá Ḥusayn from Imám Ḥusayn) — required when matching a statement,
// optional-but-scored when matching the query, so a bare "Ḥusayn" still falls to the most prominent bearer.
const HON = new Set('mirza mulla haji hajji siyyid sayyid aqa shaykh sheikh imam ustad hajj karbilai mashhadi'.split(' '));
const GLUE = new Set(['the', 'of', 'i', 'al', 'ul', 'a']);

export const fold = (s) => ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[ʼʻ‘’'`´]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const words = (s) => fold(s).trim().split(' ').filter((t) => t && !GLUE.has(t));
const has = (hay, t) => hay.includes(` ${t} `) || hay.includes(` ${t}s `);
const parseArr = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

function formsOf(names) {
  const seen = new Set();
  return names.map((n) => words(n)).filter((all) => {
    const core = all.filter((t) => !HON.has(t));
    const key = all.join(' ');
    if (!core.length || seen.has(key)) return false;
    seen.add(key); return true;
  }).map((all) => ({ all, core: all.filter((t) => !HON.has(t)), hon: all.filter((t) => HON.has(t)) }));
}

/** Pure: build the index from rows. persons {id,cn,imp,aliases}, groups {id,name,aliases}, members {group,id}, claims {id,eid,rel,tid,st,doc,pid,tv}. */
export function createEncounterIndex({ persons, groups, members, claims }) {
  const people = new Map();
  const byToken = new Map();
  for (const p of persons) {
    const forms = formsOf([p.cn, ...parseArr(p.aliases)]);
    people.set(p.id, { id: p.id, name: p.cn, imp: p.imp || 0, forms });
    for (const f of forms) for (const t of f.core) (byToken.get(t) || byToken.set(t, new Set()).get(t)).add(p.id);
  }
  const roster = new Map();
  for (const m of members) if (people.has(m.id)) (roster.get(m.group) || roster.set(m.group, []).get(m.group)).push(m.id);
  const grp = groups.map((g) => ({ id: g.id, name: g.name, forms: formsOf([g.name, ...parseArr(g.aliases)]).filter((f) => f.core.length >= 2) }));
  const all = [], bySubject = new Map();
  for (const c of claims) {
    const row = { ...c, hay: fold(c.st) };
    all.push(row);
    (bySubject.get(c.eid) || bySubject.set(c.eid, []).get(c.eid)).push(row);
  }
  return { people, byToken, roster, groups: grp, all, bySubject, builtAt: Date.now() };
}

// A statement names a person when every word of one of their forms (honorifics included) is in it.
const names = (row, person) => person.forms.some((f) => f.all.every((t) => has(row.hay, t)));
const links = (row, person) => row.tid === person.id || names(row, person);

function findParties(q, index) {
  let hay = fold(q);
  let group = null;
  for (const g of index.groups) {
    for (const f of g.forms) {
      if (f.core.every((t) => has(hay, t)) && (!group || f.core.length > group.len)) group = { id: g.id, name: g.name, len: f.core.length, core: f.core };
    }
  }
  if (group) for (const t of group.core) hay = hay.replace(` ${t} `, ' ').replace(` ${t}s `, ' ');
  const cand = new Set();
  for (const t of hay.trim().split(' ')) for (const id of index.byToken.get(t) || []) cand.add(id);
  const matches = [];
  for (const id of cand) {
    const p = index.people.get(id);
    let best = null;
    for (const f of p.forms) {
      if (!f.core.every((t) => has(hay, t))) continue;
      const score = f.core.join('').length * 10 + f.hon.filter((t) => has(hay, t)).length * 5;
      if (!best || score > best.score) best = { score, core: f.core };
    }
    if (best) matches.push({ p, ...best });
  }
  matches.sort((a, b) => b.score - a.score || b.p.imp - a.p.imp);
  const out = [];
  for (const m of matches) {
    if (out.some((o) => o.core.some((t) => m.core.includes(t)))) continue;   // same words → same mention
    out.push(m);
    if (out.length === 2) break;
  }
  return { group, persons: out.map((m) => m.p) };
}

/** Pure + synchronous: { pattern, target, group, people:[{id,name,importance,evidence[]}] } or null. */
export function encounterSearch(q, { index, maxPeople = 20, maxEvidence = 6 } = {}) {
  if (!index || !VERB.test(fold(q))) return null;
  const { group, persons } = findParties(q, index);
  if (!persons.length) return null;
  const found = new Map();   // personId → Map(claimId → row)
  const add = (pid, row) => (found.get(pid) || found.set(pid, new Map()).get(pid)).set(row.id, row);
  const T = persons[0];
  let pattern;
  if (group) {
    pattern = 'group-target';
    const ids = (index.roster.get(group.id) || []).filter((id) => id !== T.id);
    for (const id of ids) for (const row of index.bySubject.get(id) || []) if (links(row, T)) add(id, row);
    for (const row of index.bySubject.get(T.id) || []) {
      for (const id of ids) if (links(row, index.people.get(id))) add(id, row);
    }
  } else if (persons.length === 2) {
    pattern = 'pair';
    const [A, B] = persons;
    for (const row of index.bySubject.get(A.id) || []) if (links(row, B)) add(A.id, row);
    for (const row of index.bySubject.get(B.id) || []) if (links(row, A)) add(B.id, row);
  } else {
    pattern = 'target';
    for (const row of index.all) {
      if (row.eid !== T.id && links(row, T)) add(row.eid, row);
      else if (row.eid === T.id && row.tid && row.tid !== T.id && index.people.has(row.tid)) add(row.tid, row);
    }
  }
  const byWhen = (a, b) => (REL_RANK.get(a.rel) ?? 99) - (REL_RANK.get(b.rel) ?? 99) || String(a.tv || '9999').localeCompare(String(b.tv || '9999'));
  const people = [...found.entries()].map(([id, rows]) => {
    const p = index.people.get(id) || { id, name: String(id), imp: 0 };
    const seen = new Set();
    const evidence = [...rows.values()].sort(byWhen).filter((r) => {
      const k = `${r.doc}:${r.pid}`; if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, maxEvidence).map((r) => ({ statement: r.st, relation: r.rel, doc_id: r.doc ?? null, paraId: r.pid || null, when: r.tv || null }));
    return { id, name: p.name, importance: p.imp, score: rows.size, evidence };
  }).filter((p) => p.evidence.length);
  const first = (p) => String(p.evidence.map((e) => e.when).filter(Boolean).sort()[0] || '9999');
  people.sort((a, b) => first(a).localeCompare(first(b)) || b.importance - a.importance);
  return { pattern, target: { id: T.id, name: T.name }, group: group ? { id: group.id, name: group.name } : null,
    with: persons[1] ? { id: persons[1].id, name: persons[1].name } : null, people: people.slice(0, maxPeople) };
}

// ── Loader: one build, refreshed in the background (stale-while-revalidate) ──
const TTL = 30 * 60 * 1000;
let _index = null, _building = null;

async function build() {
  const rels = ENCOUNTER_RELATIONS.map(() => '?').join(',');
  const [persons, groups, claims] = await Promise.all([
    queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases FROM graph_entities ge
      LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
      WHERE ge.entity_type = 'person' AND ${LIVE_SQL('ge.')}`, [], 'encounters:persons'),
    queryAll(`SELECT ge.id, ge.canonical_name name, er.aliases FROM graph_entities ge
      LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.entity_type = 'group'`, [], 'encounters:groups'),
    queryAll(`SELECT ec.id, ec.entity_id eid, ec.relation rel, ec.target_entity_id tid, ec.statement st, ec.doc_id doc,
        ec.para_id pid, ec.time_value tv
      FROM entity_claims ec WHERE ec.relation IN (${rels}) AND (ec.status IS NULL OR ec.status = 'supported')
        AND ec.proof_verbatim IS NOT NULL AND ec.proof_verbatim <> ''`, ENCOUNTER_RELATIONS, 'encounters:claims'),
  ]);
  const gids = groups.map((g) => g.id);
  const members = gids.length ? await queryAll(`SELECT gr.target_entity_id "group", gr.source_entity_id id
    FROM graph_relations gr WHERE gr.target_entity_id IN (${gids.map(() => '?').join(',')})`, gids, 'encounters:members') : [];
  const live = new Set(persons.map((p) => p.id));
  return createEncounterIndex({ persons, groups, members, claims: claims.filter((c) => live.has(c.eid)) });
}

export async function getEncounterIndex() {
  const stale = !_index || Date.now() - _index.builtAt > TTL;
  if (stale && !_building) _building = build().then((ix) => { _index = ix; return ix; }).finally(() => { _building = null; });
  return _index ?? _building;
}

/** Async wrapper for the claims layer: encounterSearch + each cited paragraph's source title and policy link. */
export async function encounterPeople(q) {
  if (!VERB.test(fold(q))) return null;
  const t = Date.now();
  const index = await getEncounterIndex();
  const res = encounterSearch(q, { index });
  if (!res) return null;
  const docIds = [...new Set(res.people.flatMap((p) => p.evidence.map((e) => e.doc_id)).filter(Boolean))];
  const docs = new Map();
  if (docIds.length) {
    const rows = await queryAll(`SELECT id, title, source_url, metadata, religion, collection, slug FROM docs WHERE id IN (${docIds.map(() => '?').join(',')})`, docIds, 'encounters:docs');
    for (const d of rows) docs.set(d.id, d);
  }
  for (const p of res.people) {
    for (const e of p.evidence) {
      const d = docs.get(e.doc_id);
      if (!d) continue;
      e.source = d.title || null;
      e.url = /^para_/.test(e.paraId || '') ? linkFor({ ...d, external_para_id: e.paraId }).url : linkFor(d).url;
    }
  }
  return { ...res, ms: Date.now() - t };
}
