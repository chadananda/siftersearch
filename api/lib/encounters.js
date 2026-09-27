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
// A PHYSICAL MEETING — what "met / meet / saw / presence" asks. Knowing of, recognising, discipleship and conversion
// are not meetings: Nabíl's "knew the Báb" is "made me acquainted with the Revelation of the Báb" (2026-09-27).
const MEETING = ['met', 'visited', 'accompanied', 'hosted', 'host-of', 'interviewed-by', 'companion-of'];
// A proof that DENIES the meeting. Extraction turned "she never attained the presence of the Báb" and "She never
// met the Bab" into "Ṭáhirih — met the Báb" (5 of her 10 "met" claims); such a claim is evidence AGAINST.
export const NEGATED = new RegExp([
  // "never" within a few words of the verb — a wider window read "With the exception of Siyyid Ḥusayn …, neither
  // the public …" (which says he DID see the Báb) as a denial.
  String.raw`\bnever\b(\s+\S+){0,4}?\s+(met|meet|seen|saw|see|attain\w*|visit\w*)\b`,
  String.raw`\bwithout\s+(ever\s+|even\s+|having\s+)?(seeing|meeting|seen|met)\b`,
  String.raw`\b(did|could|had|has|was|were|would)\s*(not|n't)\b[^.;]{0,30}?\b(meet|met|see|seen|attain\w*)`,
  String.raw`ملاقات\s*ن(کرد|نمود|شد|کرده)|ندید|نرسید|موف?ّ?ق\s*به\s*(ملاقات|لقا\S*)\s*نشد`,
].join('|'), 'i');
// The verb picks the edge ("accompanied" is not "met"). STRICT: a person whose only evidence is another relation
// is not answered as having met anyone.
const ASKED = [
  [/\baccompan|\bcompanion/, ['accompanied', 'companion-of']],
  [/\bvisit/, ['visited', 'hosted', 'host-of']],
  [/\bhost/, ['hosted', 'host-of', 'visited']],
  [/\bknew\b|\bknow/, ['knew', 'met']],
  [/\bsummon/, ['summoned', 'summoned-by']],
  [/\binterview/, ['interviewed-by', 'met']],
  [/\b(met|meet|meets|meeting|saw|seen|see|presence|attain\w*|encounter\w*)\b/, MEETING],
];
// Honorifics separate Mullá Ḥusayn from Imám Ḥusayn: required in a statement, optional in the question (a bare
// "Ḥusayn" falls to the most prominent bearer).
const HON = new Set('mirza mulla haji hajji siyyid sayyid aqa shaykh sheikh imam ustad hajj karbilai mashhadi'.split(' '));
const QWORDS = new Set(('who whom whose which what when where why how did does do ever was were is are the of and in to at a an '
  + 'with from for on all list name tell me any many first by his her their they them he she it that this there').split(' '));
const ROLE = new Set('narrator author writer historian chronicler speaker translator master teacher guide host guest visitor pilgrim believer youth elder'.split(' '));
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
      // An alias made only of function words ("they", "he") is extraction debris, not a name; a bare ROLE ("the
      // narrator", "the Master") names whoever holds it in THAT book — "narrator" bound another memoirist's father's
      // guest to Nabíl (2026-09-27). Neither identifies anyone across the corpus.
      if (!phrase || seen.has(phrase) || phrase.length < 3 || phrase.split(' ').every((w) => QWORDS.has(w) || ROLE.has(w))) continue;
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
  // A phrase that is exactly ONE person's CANONICAL name belongs to that person even when twins carry it as an alias
  // or parenthetical ("Siyyid ‘Alí-Muḥammad (the Báb)"): otherwise one unmerged twin makes "the Báb" unmatchable
  // everywhere and every statement naming Him stops counting (2026-09-27: six Letters showed "no evidence").
  const canonicalOwner = new Map();
  for (const p of people.values()) {
    const f = p.forms.find((x) => x.canonical);
    if (f) canonicalOwner.set(f.phrase, canonicalOwner.has(f.phrase) ? null : p.id);
  }
  for (const p of people.values()) {
    for (const f of p.forms) {
      f.unique = owners.get(f.phrase).size === 1 || (f.canonical && canonicalOwner.get(f.phrase) === p.id);
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
    // A target typed to its own SUBJECT is a mis-bind (the object "the Báb" bound to the man who met Him): drop the
    // type, keep the claim — its statement can still name the real object.
    const row = { ...c, tid: c.tid === c.eid ? null : c.tid, hay: fold(c.st), topic: fold(`${c.st} ${c.prf || ''}`), neg: NEGATED.test(c.prf || '') };
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
export function encounterSearch(q, { index, maxPeople = 40, maxEvidence = 6 } = {}) {
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
  // The asked relation constrains the edge — strictly (see ASKED); a question with no relation verb takes them all.
  const asked = ASKED.find(([re]) => re.test(fq))?.[1] || null;
  const topicHit = (r) => topic.length > 0 && topic.some((w) => r.topic.includes(` ${w}`));
  const rank = (r) => (topicHit(r) ? 4 : 0) + (r.via === 'typed' ? 2 : 0) + (r.rel === 'met' ? 1 : 0);
  const shape = (rs) => {
    const seen = new Set();
    return rs.sort((a, b) => rank(b) - rank(a) || String(a.tv || '9999').localeCompare(String(b.tv || '9999'))).filter((r) => {
      const k = `${r.doc}:${r.pid}`; if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, maxEvidence).map((r) => ({ statement: r.st, relation: r.rel, doc_id: r.doc ?? null, paraId: r.pid || null,
      when: r.tv || null, via: r.via, proof: r.prf || null, ...(r.neg ? { negated: true } : {}), ...(topicHit(r) ? { topic: true } : {}) }));
  };
  // Every answer carries its proof. Evidence FOR (a claim whose proof does not deny it) and AGAINST (a proof that
  // says the meeting never happened) are kept apart: for only → people; against only → notMet; both → contested.
  const people = [], notMet = [], contested = [];
  for (const [id, rows] of found) {
    const p = index.people.get(id) || { id, name: String(id), imp: 0 };
    const kept = [...rows.values()].filter((r) => !asked || asked.includes(r.rel));
    const pos = kept.filter((r) => !r.neg), neg = kept.filter((r) => r.neg);
    const base = { id, name: p.name, importance: p.imp };
    if (pos.length && neg.length) contested.push({ ...base, evidence: shape(pos), against: shape(neg) });
    else if (neg.length) notMet.push({ ...base, evidence: shape(neg) });
    else if (pos.length) people.push({ ...base, topic: pos.filter(topicHit).length, typed: pos.filter((r) => r.via === 'typed').length, evidence: shape(pos) });
  }
  people.sort((a, b) => b.topic - a.topic || b.typed - a.typed || b.evidence.length - a.evidence.length || b.importance - a.importance);
  // A group answer accounts for EVERY member: one with no cited evidence either way is named, not silently dropped.
  const accounted = new Set([...people, ...notMet, ...contested].map((p) => p.id));
  const noEvidence = group ? (index.roster.get(group.id) || []).filter((id) => id !== T.id && !accounted.has(id))
    .map((id) => ({ id, name: index.people.get(id)?.name ?? String(id) })) : [];
  return { pattern, target: { id: T.id, name: T.name, matched: T.matched }, group: group ? { id: group.id, name: group.name } : null,
    with: persons[1] ? { id: persons[1].id, name: persons[1].name, matched: persons[1].matched } : null,
    topic, relations: asked,
    people: people.slice(0, maxPeople).map(({ topic: _t, typed: _y, ...p }) => p), contested, notMet, noEvidence };
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
  // Every piece of evidence — for, against, contested — gets its source title and policy link.
  const allEvidence = [...res.people, ...res.notMet, ...res.contested].flatMap((p) => [...p.evidence, ...(p.against || [])]);
  const docIds = [...new Set(allEvidence.map((e) => e.doc_id).filter(Boolean))];
  const docs = new Map();
  if (docIds.length) {
    const rows = await queryAll(`SELECT id, title, source_url, metadata, religion, collection, slug FROM docs WHERE id IN (${docIds.map(() => '?').join(',')})`, docIds, 'encounters:docs');
    for (const d of rows) docs.set(d.id, d);
  }
  {
    for (const e of allEvidence) {
      const d = docs.get(e.doc_id);
      if (!d) continue;
      e.source = d.title || null;
      e.url = /^para_/.test(e.paraId || '') ? linkFor({ ...d, external_para_id: e.paraId }).url : linkFor(d).url;
    }
  }
  return { ...res, ms: Date.now() - t };
}
