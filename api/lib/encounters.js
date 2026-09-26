// Who-met-whom fast path: an in-memory join over encounter claims (met/accompanied/visited/…) + group rosters.
// Only ~22% of encounter claims carry target_entity_id, so a claim also links to a person when one of their names
// appears in its statement as a PHRASE that (a) belongs to nobody else and (b) is not part of a longer name at that
// spot ("Mullá ‘Alí" inside "Mullá ‘Alí Mardan", "Bahá" inside "‘Abdu’l-Bahá"). Loaded once (~100k rows), refreshed
// stale-while-revalidate; a query is milliseconds. Returns null when the question is not who-met-whom.
// Deps: db, entity-live, source-links.
import { queryAll } from './db.js';
import { LIVE_SQL } from './entity-live.js';
import { linkFor } from './source-links.js';

export const ENCOUNTER_RELATIONS = ['met', 'accompanied', 'companion-of', 'knew', 'visited', 'hosted', 'host-of',
  'interviewed-by', 'summoned', 'summoned-by', 'recognized', 'taught-by', 'teacher-of', 'disciple-of', 'converted-by'];
const VERB = /\b(met|meet|meets|meeting|accompan\w*|knew|know|known|visit\w*|encounter\w*|companions?|presence|attain\w*|host\w*|interview\w*|summon\w*|saw|seen|see)\b/;
// The verb picks the edge ("accompanied" is not "met"); verbs not listed accept every encounter relation.
const ASKED = [
  [/\baccompan|\bcompanion/, ['accompanied', 'companion-of']],
  [/\bvisit/, ['visited', 'hosted', 'host-of']],
  [/\bhost/, ['hosted', 'host-of', 'visited']],
  [/\bknew\b|\bknow/, ['knew', 'met']],
  [/\bsummon/, ['summoned', 'summoned-by']],
  [/\binterview/, ['interviewed-by', 'met']],
];
// Honorifics separate Mullá Ḥusayn from Imám Ḥusayn: required in a statement, optional in the question (a bare
// "Ḥusayn" falls to the most prominent bearer).
const HON = new Set('mirza mulla haji hajji siyyid sayyid aqa shaykh sheikh imam ustad hajj karbilai mashhadi'.split(' '));
const QWORDS = new Set(('who whom whose which what when where why how did does do ever was were is are the of and in to at a an '
  + 'with from for on all list name tell me any many first by his her their they them he she it that this there').split(' '));
// "(of Baghdád)", "(son of …)" are qualifiers, not names.
const QUALIFIER = /^\s*(of|from|in|at|son|daughter|wife|husband|brother|sister|father|mother|known|called|later|a|an|surnamed|titled|d\.|b\.|\d)/i;

export const fold = (s) => ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[ʼʻ‘’'`´]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const parseArr = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const splitParens = (n) => [String(n || '').replace(/\([^)]*\)/g, ' '),
  ...[...String(n || '').matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).filter((x) => !QUALIFIER.test(x))];

/** Every word-aligned start offset of phrase p in padded hay (a trailing possessive "s" is allowed). */
function occurrences(hay, p) {
  const out = [];
  for (const needle of [` ${p} `, ` ${p}s `]) {
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) out.push(i);
  }
  return out;
}

function formsOf(names, canonicalCount) {
  const seen = new Set(), out = [];
  names.forEach((n, i) => {
    for (const part of splitParens(n)) {
      const phrase = fold(part).trim().replace(/^(the|a) /, '');
      // An alias made only of function words ("they", "he") is extraction debris, not a name.
      if (!phrase || seen.has(phrase) || phrase.length < 3 || phrase.split(' ').every((w) => QWORDS.has(w))) continue;
      seen.add(phrase);
      const w = phrase.split(' ');
      let k = 0; while (k < w.length - 1 && HON.has(w[k])) k++;
      out.push({ phrase, bare: w.slice(k).join(' '), canonical: i < canonicalCount });
    }
  });
  return out;
}

/** Pure: build the index. persons {id,cn,imp,aliases}, groups {id,name,aliases}, members {group,id},
 *  claims {id,eid,rel,tid,st,prf,doc,pid,tv}, places [name]. */
export function createEncounterIndex({ persons, groups, members, claims, places = [] }) {
  const placeKeys = new Set(places.map((n) => fold(String(n).replace(/\([^)]*\)/g, ' ')).trim()).filter(Boolean));
  const people = new Map(), owners = new Map(), byWord = new Map();
  for (const p of persons) {
    // A name that is exactly a place ("Shíráz") would make every "in Shiraz" a person.
    const forms = formsOf([p.cn, ...parseArr(p.aliases)], 1).filter((f) => !placeKeys.has(f.phrase) && !placeKeys.has(f.bare));
    people.set(p.id, { id: p.id, name: p.cn, imp: p.imp || 0, forms });
    for (const f of forms) {
      (owners.get(f.phrase) || owners.set(f.phrase, new Set()).get(f.phrase)).add(p.id);
      for (const w of new Set(f.bare.split(' '))) (byWord.get(w) || byWord.set(w, new Set()).get(w)).add(p.id);
    }
  }
  // Longer names of OTHER people that contain this phrase — an occurrence inside one of them is not this person.
  const phrasesByWord = new Map();
  for (const ph of owners.keys()) for (const w of new Set(ph.split(' '))) (phrasesByWord.get(w) || phrasesByWord.set(w, []).get(w)).push(ph);
  for (const p of people.values()) {
    for (const f of p.forms) {
      f.unique = owners.get(f.phrase).size === 1;
      const rare = f.phrase.split(' ').reduce((a, w) => ((phrasesByWord.get(w)?.length ?? 0) < (phrasesByWord.get(a)?.length ?? Infinity) ? w : a));
      f.supers = (phrasesByWord.get(rare) || []).filter((s) => s !== f.phrase && ` ${s} `.includes(` ${f.phrase} `)
        && [...owners.get(s)].some((o) => o !== p.id)).map((s) => ({ s, off: ` ${s} `.indexOf(` ${f.phrase} `) }));
    }
  }
  const roster = new Map();
  for (const m of members) if (people.has(m.id)) (roster.get(m.group) || roster.set(m.group, []).get(m.group)).push(m.id);
  const grp = groups.map((g) => ({ id: g.id, name: g.name,
    phrases: formsOf([g.name, ...parseArr(g.aliases)], 1).map((f) => f.phrase).filter((ph) => ph.includes(' ')) }));
  const all = [], bySubject = new Map();
  for (const c of claims) {
    const row = { ...c, hay: fold(c.st), topic: fold(`${c.st} ${c.prf || ''}`) };
    delete row.prf;
    all.push(row);
    (bySubject.get(c.eid) || bySubject.set(c.eid, []).get(c.eid)).push(row);
  }
  return { people, byWord, roster, groups: grp, all, bySubject, placeKeys, builtAt: Date.now() };
}

// Does the statement name this person? Unique phrase, not inside another person's longer name at that spot.
export function namedBy(hay, person, { canonicalOnly = false, anyForm = false } = {}) {
  for (const f of person.forms) {
    if ((!f.unique && !anyForm) || (canonicalOnly && !f.canonical)) continue;
    for (const at of occurrences(hay, f.phrase)) {
      const covered = f.supers.some(({ s, off }) => occurrences(hay, s).some((j) => j + off === at));
      if (!covered) return f.phrase;
    }
  }
  return null;
}
const linkOf = (row, person, opts) => {
  if (row.tid === person.id) return 'typed';
  const f = namedBy(row.hay, person, opts);
  return f ? `named:${f}` : null;
};

function findParties(q, index) {
  const hay = fold(q);
  const used = [];   // [start,end) spans of the question already assigned to a party
  let group = null;
  for (const g of index.groups) {
    for (const ph of g.phrases) {
      const at = occurrences(hay, ph)[0];
      if (at != null && (!group || ph.length > group.len)) group = { id: g.id, name: g.name, len: ph.length, span: [at, at + ph.length + 1] };
    }
  }
  if (group) used.push(group.span);
  const cand = new Set();
  for (const w of hay.trim().split(' ')) for (const id of index.byWord.get(w) || []) cand.add(id);
  const matches = [];
  for (const id of cand) {
    const p = index.people.get(id);
    for (const f of p.forms) {
      for (const ph of new Set([f.phrase, f.bare])) {
        for (const at of occurrences(hay, ph)) {
          // Longest matched words win; on equal words the more prominent bearer ("Nabíl" → Nabíl-i-A‘ẓam, not an
          // obscure man whose canonical name is exactly "Nabíl"). Honorifics in the question lengthen the match.
          matches.push({ p, at, end: at + ph.length + 1, matched: ph, score: ph.length });
        }
      }
    }
  }
  matches.sort((a, b) => b.score - a.score || b.p.imp - a.p.imp);
  const out = [];
  for (const m of matches) {
    if (used.some(([s, e]) => m.at < e && s < m.end) || out.some((o) => o.p.id === m.p.id)) continue;
    used.push([m.at, m.end]);
    out.push(m);
    if (out.length === 2) break;
  }
  // The words that are neither a party, the group, a verb nor a question word are the topic ("Shiraz", "Baghdad").
  let rest = hay;
  for (const [s, e] of [...used].sort((a, b) => b[0] - a[0])) rest = rest.slice(0, s) + ' ' + rest.slice(e - 1);
  const topic = [...new Set(rest.trim().split(' ').filter((w) => w.length > 2 && !QWORDS.has(w) && !VERB.test(w)))];
  return { group, persons: out.map((m) => ({ ...m.p, matched: m.matched })), topic };
}

/** Pure + synchronous: { pattern, target, with, group, topic, relations, people:[{id,name,importance,evidence[]}] } or null. */
export function encounterSearch(q, { index, maxPeople = 20, maxEvidence = 6 } = {}) {
  const fq = fold(q);
  if (!index || !VERB.test(fq)) return null;
  const { group, persons, topic } = findParties(q, index);
  if (!persons.length) return null;
  const found = new Map();   // personId → Map(claimId → row+via)
  const add = (pid, row, via) => { if (via) (found.get(pid) || found.set(pid, new Map()).get(pid)).set(row.id, { ...row, via }); };
  const T = persons[0];
  let pattern;
  if (group) {
    pattern = 'group-target';
    const ids = (index.roster.get(group.id) || []).filter((id) => id !== T.id);
    for (const id of ids) for (const row of index.bySubject.get(id) || []) add(id, row, linkOf(row, T));
    // Reverse direction ("Bahá’u’lláh met Quddús"): only the member's typed id or CANONICAL name — an alias in the
    // target's own statements is how "Mírzá Muḥammad-Ḥasan" (another man) was filed under a Letter of the Living.
    for (const row of index.bySubject.get(T.id) || []) for (const id of ids) add(id, row, linkOf(row, index.people.get(id), { canonicalOnly: true }));
  } else if (persons.length === 2) {
    pattern = 'pair';
    const [A, B] = persons;
    for (const row of index.bySubject.get(A.id) || []) add(A.id, row, linkOf(row, B));
    for (const row of index.bySubject.get(B.id) || []) add(B.id, row, linkOf(row, A));
  } else {
    pattern = 'target';
    // A full pass over every encounter claim; memoised per target for the life of this index (the popular
    // targets — the Báb, Bahá’u’lláh — are asked about again and again).
    const memo = index.targetMemo || (index.targetMemo = new Map());
    let hitsT = memo.get(T.id);
    if (!hitsT) {
      hitsT = [];
      for (const row of index.all) {
        if (row.eid !== T.id) { const via = linkOf(row, T); if (via) hitsT.push([row.eid, row, via]); }
        else if (row.tid && row.tid !== T.id && index.people.has(row.tid)) hitsT.push([row.tid, row, 'typed']);
      }
      if (memo.size >= 200) memo.delete(memo.keys().next().value);
      memo.set(T.id, hitsT);
    }
    for (const [pid, row, via] of hitsT) add(pid, row, via);
  }
  // The asked relation constrains the edge when the evidence has it; otherwise every encounter stands.
  const asked = ASKED.find(([re]) => re.test(fq))?.[1] || null;
  const anyAsked = asked && [...found.values()].some((rows) => [...rows.values()].some((r) => asked.includes(r.rel)));
  const topicHit = (r) => topic.length > 0 && topic.some((w) => r.topic.includes(` ${w}`));
  const rank = (r) => (topicHit(r) ? 4 : 0) + (r.via === 'typed' ? 2 : 0) + (r.rel === 'met' ? 1 : 0);
  const people = [...found.entries()].map(([id, rows]) => {
    const p = index.people.get(id) || { id, name: String(id), imp: 0 };
    const kept = [...rows.values()].filter((r) => !anyAsked || asked.includes(r.rel));
    const seen = new Set();
    const ev = kept.sort((a, b) => rank(b) - rank(a) || String(a.tv || '9999').localeCompare(String(b.tv || '9999'))).filter((r) => {
      const k = `${r.doc}:${r.pid}`; if (seen.has(k)) return false; seen.add(k); return true;
    });
    return { id, name: p.name, importance: p.imp, topic: ev.filter(topicHit).length, typed: ev.filter((r) => r.via === 'typed').length,
      evidence: ev.slice(0, maxEvidence).map((r) => ({ statement: r.st, relation: r.rel, doc_id: r.doc ?? null, paraId: r.pid || null,
        when: r.tv || null, via: r.via, ...(topicHit(r) ? { topic: true } : {}) })) };
  }).filter((p) => p.evidence.length);
  people.sort((a, b) => b.topic - a.topic || b.typed - a.typed || b.evidence.length - a.evidence.length || b.importance - a.importance);
  return { pattern, target: { id: T.id, name: T.name, matched: T.matched }, group: group ? { id: group.id, name: group.name } : null,
    with: persons[1] ? { id: persons[1].id, name: persons[1].name, matched: persons[1].matched } : null,
    topic, relations: anyAsked ? asked : null,
    people: people.slice(0, maxPeople).map(({ topic: _t, typed: _y, ...p }) => p) };
}

// ── Loader: one build, refreshed in the background (stale-while-revalidate) ──
const TTL = 30 * 60 * 1000;
let _index = null, _building = null;

async function build() {
  const rels = ENCOUNTER_RELATIONS.map(() => '?').join(',');
  const [persons, groups, claims, places] = await Promise.all([
    queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases FROM graph_entities ge
      LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
      WHERE ge.entity_type = 'person' AND ${LIVE_SQL('ge.')}`, [], 'encounters:persons'),
    queryAll(`SELECT ge.id, ge.canonical_name name, er.aliases FROM graph_entities ge
      LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.entity_type = 'group'`, [], 'encounters:groups'),
    queryAll(`SELECT ec.id, ec.entity_id eid, ec.relation rel, ec.target_entity_id tid, ec.statement st,
        substr(ec.proof_verbatim, 1, 300) prf, ec.doc_id doc, ec.para_id pid, ec.time_value tv
      FROM entity_claims ec WHERE ec.relation IN (${rels}) AND (ec.status IS NULL OR ec.status = 'supported')
        AND ec.proof_verbatim IS NOT NULL AND ec.proof_verbatim <> ''`, ENCOUNTER_RELATIONS, 'encounters:claims'),
    queryAll(`SELECT canonical_name n FROM graph_entities WHERE entity_type = 'place' AND ${LIVE_SQL()}`, [], 'encounters:places'),
  ]);
  const gids = groups.map((g) => g.id);
  const members = gids.length ? await queryAll(`SELECT gr.target_entity_id "group", gr.source_entity_id id
    FROM graph_relations gr WHERE gr.target_entity_id IN (${gids.map(() => '?').join(',')})`, gids, 'encounters:members') : [];
  const live = new Set(persons.map((p) => p.id));
  return createEncounterIndex({ persons, groups, members, claims: claims.filter((c) => live.has(c.eid)), places: places.map((r) => r.n) });
}

export async function getEncounterIndex() {
  const stale = !_index || Date.now() - _index.builtAt > TTL;
  if (stale && !_building) _building = build().then((ix) => { _index = ix; return ix; }).finally(() => { _building = null; });
  return _index ?? _building;
}

/** Synchronous, ms: is this a who-met-whom question the (already built) index can answer? false until built. */
export function isEncounterQuestion(q) {
  if (!_index || !VERB.test(fold(q))) return false;
  return findParties(q, _index).persons.length > 0;
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
