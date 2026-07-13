// Shared biography data layer — the single source of truth for person records (list + dossier) and source-book
// facets, used by BOTH the internal /api/graph/bio/* routes and the official /api/v1/people API.
import { queryAll, queryOne } from './db.js';
import { INTEGRATION_PHASES } from './integration-phases.js';
import { chatCompletion } from './ai.js';
import fs from 'fs';
import path from 'path';

export const BIO_ROOT = path.join(process.env.HOME || '/home/chad', 'sifter', 'bio-assets');
export const readBioManifest = () => { try { return JSON.parse(fs.readFileSync(path.join(BIO_ROOT, 'manifest.json'), 'utf8')); } catch { return {}; } };

// Source books with full person-mention coverage today. Add the Pillars (Balyuzi 462/466/467/3887,
// Taherzadeh 429-432, Mázandarání 420/16564/12262/11322, Momen 11557) here as each is run through the
// entity pipeline — their filter facets light up automatically once they appear in entity_mentions.
export const SOURCE_BOOKS = [
  { key: 'gpb', label: 'God Passes By', docs: [21310, 57347] },
  { key: 'dawn-breakers', label: 'The Dawn-Breakers', docs: [21308] },
];

// entity_id → Set(book keys). Grounding comes from the DISAMBIGUATED evidence layer — an entity is "in" a book
// if it has a bound v2 mention OR a bound hard-claim there (both carry doc_id + entity_id directly, so no
// content-id join). The legacy NER entity_mentions table is retired: identity is now resolved by disambiguation
// + claim evidence, never by raw name-extraction.
export async function computeBookSources() {
  const bookOf = {};
  for (const b of SOURCE_BOOKS) {
    const ph = b.docs.map(() => '?').join(',');
    const ents = await queryAll(
      `SELECT DISTINCT entity_id FROM entity_mentions_v2 WHERE doc_id IN (${ph}) AND entity_id IS NOT NULL
       UNION SELECT DISTINCT entity_id FROM entity_claims WHERE doc_id IN (${ph}) AND entity_id IS NOT NULL`,
      [...b.docs, ...b.docs]);
    for (const e of ents) (bookOf[e.entity_id] ||= new Set()).add(b.key);
  }
  return bookOf;
}

// Integration progress for the biography "progress" popup — the phased roadmap (integration-phases.js) with
// each book's LIVE grounded-person count (distinct entities bound in this book, same "grounded" definition the
// browser uses). A book counts as integrated once it has grounded persons. Cached briefly.
let _progCache = null, _progAt = 0;
export async function getIntegrationProgress() {
  if (_progCache && Date.now() - _progAt < 300000) return _progCache;
  const docs = [...new Set(INTEGRATION_PHASES.flatMap(p => p.docs))];
  const ph = docs.map(() => '?').join(',');
  const counts = {};
  (await queryAll(`SELECT doc_id, COUNT(*) n FROM (
      SELECT doc_id, entity_id FROM entity_mentions_v2 WHERE doc_id IN (${ph}) AND entity_id IS NOT NULL
      UNION SELECT doc_id, entity_id FROM entity_claims WHERE doc_id IN (${ph}) AND entity_id IS NOT NULL
    ) GROUP BY doc_id`, [...docs, ...docs])).forEach(r => { counts[r.doc_id] = r.n; });
  const meta = {};
  (await queryAll(`SELECT id, title, author FROM docs WHERE id IN (${ph})`, docs)).forEach(d => { meta[d.id] = d; });
  const phases = INTEGRATION_PHASES.map(p => {
    const books = p.docs.map(id => ({ id, title: meta[id]?.title || `doc ${id}`, author: meta[id]?.author || null,
      persons: counts[id] || 0, done: (counts[id] || 0) > 0 }));
    return { key: p.key, label: p.label, blurb: p.blurb, upcoming: !!p.upcoming, books,
      done: books.filter(b => b.done).length, total: books.length, persons: books.reduce((s, b) => s + b.persons, 0) };
  });
  const doneBooks = phases.reduce((s, p) => s + (p.upcoming ? 0 : p.done), 0);
  const totalBooks = phases.reduce((s, p) => s + (p.upcoming ? 0 : p.total), 0);
  _progCache = { phases, doneBooks, totalBooks, goal: 'all history absorbed' };
  _progAt = Date.now();
  return _progCache;
}

// The full person dataset for the browser + API list endpoint. Cached briefly (data changes rarely; the book-
// source computation is ~2s) so per-request API calls stay fast.
let _listCache = null, _listAt = 0;
export async function listBioPersons() {
  if (_listCache && Date.now() - _listAt < 300000) return _listCache;
  const man = readBioManifest();
  const bookOf = await computeBookSources();
  const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, ge.importance,
      er.side, er.summary, er.aliases, er.kinship, er.research_notes
    FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
    WHERE ge.entity_type = 'person' AND ge.religion = ''
      AND (ge.last_assessed_version IS NULL OR ge.last_assessed_version NOT LIKE 'merged-into-%')
    ORDER BY (ge.importance IS NULL), ge.importance DESC, ge.canonical_name`);
  const persons = rows.map(r => {
    let aliases = [], kinship = [], death = null;
    try { aliases = JSON.parse(r.aliases || '[]'); } catch {}
    try { kinship = JSON.parse(r.kinship || '[]'); } catch {}
    try { death = JSON.parse(r.research_notes || '{}').death || null; } catch {}
    const m = man[r.id]; const hasPortrait = !!(m && m.cdn);
    return { id: r.id, name: r.name, importance: r.importance || 0, side: r.side || null,
      summary: r.summary || null, aliases, kinship, death, hasPortrait, sources: [...(bookOf[r.id] || [])],
      portrait: m?.cdn || null,
      wiki: m?.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(m.title).replace(/ /g, '_'))}` : null };
  });
  // QA scope: the browser shows the genuine cast of the core books — only persons grounded by a GPB/Dawn-Breakers
  // mention. This excludes ungrounded artifacts (duplicate "Bahá'u'lláh", generic "Bahá'í pilgrim", out-of-corpus
  // names) without deleting them. As the Pillars books are ingested, their mentions will admit more of the cast.
  const grounded = persons.filter(p => p.sources.length);
  const sides = [...new Set(grounded.map(p => p.side).filter(Boolean))].sort();
  const books = SOURCE_BOOKS.map(b => ({ key: b.key, label: b.label, count: grounded.filter(p => p.sources.includes(b.key)).length }));
  _listCache = { count: grounded.length, withPortraits: grounded.filter(p => p.hasPortrait).length, sides, books, persons: grounded };
  _listAt = Date.now();
  return _listCache;
}

// Full dossier for one person: DB record + gathered portrait/bio.json + cross-corpus reach + GPB citations.
export async function getBioPerson(rawId) {
  const id = String(rawId).replace(/[^0-9]/g, '');
  const row = await queryOne(`SELECT ge.id, ge.canonical_name AS name, ge.importance, ge.last_assessed_version AS lav, er.side, er.summary,
      er.aliases, er.kinship, er.relations, er.research_notes, er.dates
    FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.id = ?`, [id]);
  if (!row || /^merged-into-/.test(row.lav || '')) return null;   // merged duplicate → gone (references live on the survivor)
  const arr = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
  const obj = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
  let wiki = null, portrait = null, portraitFull = null, bahai = null;
  portrait = readBioManifest()[id]?.cdn || null;
  try {
    const d = fs.readdirSync(BIO_ROOT).find(x => x.startsWith(id + '-'));
    if (d) { const bj = JSON.parse(fs.readFileSync(path.join(BIO_ROOT, d, 'bio.json'), 'utf8'));
      wiki = bj.wikipedia || null; bahai = bj.bahai_media || null;
      portraitFull = bj.portrait_fullres || bj.wikipedia?.image_url || bahai?.full || null; }
  } catch { /* no bio.json */ }
  let mentionCount = 0, books = [], gpbRefs = [];
  try {
    // Cross-corpus reach from the disambiguated v2 substrate (doc_id + para_id carried directly).
    const ms = await queryAll('SELECT doc_id, para_id FROM entity_mentions_v2 WHERE entity_id = ?', [id]);
    mentionCount = ms.length;
    const dids = [...new Set(ms.map(m => m.doc_id))];
    if (dids.length) {
      books = (await queryAll(`SELECT DISTINCT title FROM docs WHERE id IN (${dids.map(() => '?').join(',')}) AND title IS NOT NULL`, dids)).map(b => b.title);
      const gpids = [...new Set(ms.filter(m => m.doc_id === 21310 || m.doc_id === 57347).map(m => m.para_id))].slice(0, 24);
      if (gpids.length) {
        const ph = gpids.map(() => '?').join(',');  // para_id stores either external_para_id or 'p'||content.id — match both
        const gp = await queryAll(`SELECT c.external_para_id AS pid, c.text, c.heading, d.source_url AS url FROM content c JOIN docs d ON d.id = c.doc_id
          WHERE c.doc_id IN (21310, 57347) AND (c.external_para_id IN (${ph}) OR 'p'||c.id IN (${ph})) ORDER BY c.id LIMIT 24`, [...gpids, ...gpids]);
        gpbRefs = gp.map(r => ({ paraId: r.pid, url: r.url ? `${r.url}?paraId=${r.pid}` : null, heading: r.heading || null, snippet: String(r.text || '').replace(/\s+/g, ' ').slice(0, 200) }));
      }
    }
  } catch { /* mentions optional */ }
  const notes = obj(row.research_notes);
  // NEW substrate first: cited claims (proof-gated, temporal, source-linked) from entity_claims — the reconciled
  // evidence base. Fall back to legacy facts2/episodes only for entities the pipeline hasn't covered. Same UI shape.
  const claimRows = await queryAll(`SELECT relation, statement, proof_verbatim AS proof, doc_id, para_id, time_value AS tv, time_basis AS tb
     FROM entity_claims WHERE entity_id = ? AND (status IS NULL OR status = 'supported') ORDER BY (tv IS NULL), tv`, [id]);
  let characterizations;
  if (claimRows.length) {
    // Resolve each cited claim's source document (title + public url) from the docs table — NOT a hardcoded book list.
    // Every claim carries doc_id + para_id, so every fact shows its book + paragraph citation, clickable when online.
    const dids = [...new Set(claimRows.map(c => c.doc_id).filter(Boolean))];
    const dmap = new Map();
    if (dids.length) (await queryAll(`SELECT id, title, source_url FROM docs WHERE id IN (${dids.map(() => '?').join(',')})`, dids)).forEach(r => dmap.set(r.id, { title: r.title || null, url: r.source_url || null }));
    characterizations = claimRows.map(c => { const d = dmap.get(c.doc_id) || {}; return { quote: c.statement, proof: c.proof || null, relation: c.relation || null,
      when: c.tv ? `${c.tv}${c.tb ? ' [' + c.tb + ']' : ''}` : null, source: d.title || null, paraId: c.para_id, _doc: c.doc_id,
      url: d.url && c.para_id ? `${d.url}?paraId=${c.para_id}` : null }; });
  } else {  // fallback: legacy fact catalog for entities not yet re-extracted
    characterizations = Array.isArray(notes.facts2) && notes.facts2.length
      ? notes.facts2.map(f => ({ quote: f.statement, proof: f.quote || null, relation: f.relation || null, when: f.when || null, source: f.source, paraId: f.paraId, url: f.url || null }))
      : (notes.characterizations || []);
    if (Array.isArray(notes.episodes)) for (const e of notes.episodes) characterizations.push({ quote: e.statement, proof: e.quote || null, relation: 'episode', episode: e.name, when: e.when || null, source: e.source, paraId: e.paraId, url: e.url || null });
  }
  // compact citation label per fact: short source + paragraph number (e.g. "GPB ¶72", "DB ¶467"); works for any book.
  try {
    const pids = [...new Set(characterizations.map(c => c.paraId).filter(Boolean))];
    if (pids.length) {
      const ixRows = await queryAll(`SELECT doc_id, external_para_id pid, paragraph_index pix FROM content WHERE external_para_id IN (${pids.map(() => '?').join(',')})`, pids);
      const ix = {}; for (const r of ixRows) ix[`${r.doc_id}:${r.pid}`] = r.pix;
      const abbrOf = (s) => s === 'The Dawn-Breakers' ? 'DB' : s === 'God Passes By' ? 'GPB' : (String(s || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'SRC');
      for (const c of characterizations) {
        const n = c._doc != null ? ix[`${c._doc}:${c.paraId}`] : null;
        c.cite = n != null ? `${abbrOf(c.source)} ¶${n}` : abbrOf(c.source);
        delete c._doc;
      }
    }
  } catch { /* citation labels optional */ }
  return { id: row.id, name: row.name, importance: row.importance || 0, side: row.side || null,
    summary: row.summary || null, aliases: arr(row.aliases), kinship: arr(row.kinship), relations: arr(row.relations),
    dates: arr(row.dates), death: notes.death || null, characterizations,
    facts: notes.facts || [], firewall: notes.firewall || [], contested: notes.contested || [],
    possible_ids: notes.possible_ids || [], wiki, portrait, portraitFull, bahai, mentionCount, books, gpbRefs };
}

// Intelligent meaning-search over the cast (descriptive/reasoning queries the token filter can't do, e.g.
// "letters of the living who died at Shaykh Ṭabarsí"). Resolves known groups deterministically from
// graph_relations; otherwise asks DeepSeek to judge from summaries. Returns { ids, q, group?, reasoning }.
export async function bioSearch(rawQ) {
  const q = String(rawQ || '').trim().slice(0, 200);
  if (!q) return { ids: [], q };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/gi, ' ').toLowerCase();
  const STOP = new Set(['the', 'of', 'and', 'who', 'a', 'an', 'in', 'at', 'to', 'is', 'are', 'were', 'all', 'show', 'me', 'list', 'group']);
  const qtok = new Set(norm(q).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)));

  // deterministic group resolution: if the query names a modeled group, return its members from graph_relations
  let memberIds = [], bareGroup = false, best = null;
  const groups = await queryAll(`SELECT ge.id, ge.canonical_name AS name, er.aliases, er.summary FROM graph_entities ge
    LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.entity_type='group'`);
  for (const g of groups) {
    const names = [g.name, ...(() => { try { return JSON.parse(g.aliases || '[]'); } catch { return []; } })()];
    for (const nm of names) {
      const gtok = norm(nm).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
      const overlap = gtok.filter((t) => qtok.has(t)).length;
      if (overlap >= 2 && (!best || overlap > best.ov)) best = { id: g.id, ov: overlap, name: g.name, summary: g.summary };
    }
  }
  if (best) {
    const mem = await queryAll(`SELECT gr.source_entity_id AS id FROM graph_relations gr JOIN graph_entities ge ON ge.id = gr.source_entity_id
      WHERE gr.target_entity_id = ? AND ge.entity_type='person' ORDER BY (ge.importance IS NULL), ge.importance DESC`, [best.id]);
    memberIds = [...new Set(mem.map((r) => r.id))];
    bareGroup = best.ov >= qtok.size;
  }
  if (bareGroup && memberIds.length) return { ids: memberIds, q, group: best.id, reasoning: { summary: best.summary || `${best.name} — ${memberIds.length} members.`, evidence: {} } };

  // ── Candidate catalog = each person's PROOF-GATED CLAIMS (entity_claims): every fact carries a verbatim proof span
  //    AND a source-paragraph citation, and connections are TYPED (relation + target-entity id). This replaces the
  //    legacy facts2/episodes catalog, whose uncited research-minted facts produced fabrications — e.g. a "genuine
  //    dervish who embraced the Faith under Bahá'u'lláh" fact miscited to GPB ¶369 (actually the Azal-poisoning
  //    paragraph) wrongly filed on the 1850 martyr Mírzá Qurbán-‘Alí. A claim with no proof span is not evidence.
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
  const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai karbala mashhadi hajj the of son daughter dervish native known as'.split(' '));
  const tokize = (s) => [...new Set(fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t) && !HON.has(t)))];

  const claimRows = await queryAll(`SELECT ec.entity_id eid, ge.canonical_name name, ge.importance imp, ec.relation, ec.target_entity_id tid,
      ec.statement, ec.proof_verbatim proof, ec.doc_id doc, ec.para_id pid, ec.time_value tv, ec.time_basis tb
    FROM entity_claims ec JOIN graph_entities ge ON ge.id = ec.entity_id
    WHERE ge.entity_type = 'person' AND ge.religion = '' AND (ec.status IS NULL OR ec.status = 'supported')
      AND ec.proof_verbatim IS NOT NULL AND TRIM(ec.proof_verbatim) <> ''
      AND (ge.last_assessed_version IS NULL OR ge.last_assessed_version NOT LIKE 'merged-into-%')`);
  // Resolve the SOURCE DOCUMENT for every cited claim from the docs table (NOT a hardcoded book list). Every claim
  // carries doc_id + para_id by construction, so every fact shows its book + paragraph citation; the clickable
  // oceanlibrary link is added when the book has a source_url. A fact without a citation cannot exist here.
  const docIds = [...new Set(claimRows.map((c) => c.doc).filter(Boolean))];
  const docMap = new Map();
  for (let i = 0; i < docIds.length; i += 800) { const ch = docIds.slice(i, i + 800); (await queryAll(`SELECT id, title, source_url FROM docs WHERE id IN (${ch.map(() => '?').join(',')})`, ch)).forEach((r) => docMap.set(r.id, { title: r.title || null, url: r.source_url || null })); }
  // resolve target-entity display names so typed connections read naturally
  const tids = [...new Set(claimRows.map((c) => c.tid).filter(Boolean))];
  const tname = new Map();
  for (let i = 0; i < tids.length; i += 800) { const ch = tids.slice(i, i + 800); (await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE id IN (${ch.map(() => '?').join(',')})`, ch)).forEach((r) => tname.set(r.id, r.cn)); }
  const exById = {}; const nameById = {}; const impById = {};
  for (const c of claimRows) {
    nameById[c.eid] = c.name; impById[c.eid] = c.imp || 0;
    const target = c.tid ? (tname.get(c.tid) || null) : null;
    const d = docMap.get(c.doc) || {};
    const claim = { relation: c.relation || null, tid: c.tid || null, target,
      statement: c.statement, proof: c.proof, when: c.tv ? `${c.tv}${c.tb ? ' [' + c.tb + ']' : ''}` : null,
      source: d.title || null, paraId: c.pid || null, url: d.url && c.pid ? `${d.url}?paraId=${c.pid}` : null,
      hay: fold(`${c.statement} ${c.proof} ${target || ''}`) };
    (exById[c.eid] || (exById[c.eid] = [])).push(claim);
  }

  // ── Connection target: does the query name a person the subjects must be CONNECTED to? Resolve to an ENTITY. The
  //    group's own name tokens are excluded so the SUBJECT group ("Seven Martyrs") can't be mistaken for the OBJECT
  //    ("Bahá'u'lláh"). A connection then counts when a claim's TARGET is that entity OR the claim's verbatim proof
  //    NAMES it — object_id binding is incomplete, so the proof text carries the cited connection ("visited Bahá'u'lláh").
  const cl = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const connQ = /\b(met|meet|with|accompan|knew|know|present|encounter|together|companion|recogni|imprison|attain|visit|serv|correspond)\b/i.test(q);
  let connTarget = null;
  if (connQ) {
    const gtoks = new Set(best ? tokize(best.name) : []);
    const persons = await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE entity_type = 'person'
      AND (last_assessed_version IS NULL OR last_assessed_version NOT LIKE 'merged-into-%')`);
    const qf = ' ' + fold(q) + ' ';
    for (const p of persons) {
      if (best && p.id === best.id) continue;
      const pt = tokize(p.cn).filter((t) => !gtoks.has(t)); if (!pt.length) continue;   // ignore tokens shared with the subject group
      if (pt.every((t) => qf.includes(t))) { const score = pt.join('').length; if (!connTarget || score > connTarget.score) connTarget = { id: p.id, name: p.cn, tok: pt, score }; }
    }
  }
  // a claim connects a subject to the target if it's typed to the target OR its proof/statement names the target
  const namesTarget = (c) => connTarget && (c.tid === connTarget.id || (connTarget.tok.length && connTarget.tok.every((t) => c.hay.includes(t))));

  // place/event tokens beyond the target name, the group name, and generic connection verbs — these reveal whether a
  // matched group is the query's SUBJECT ("Seven Martyrs who met X" → specificToks empty) or just an incidental
  // name-token overlap ("companions imprisoned with X in the Síyáh-Chál" matching a "…of Bahá'u'lláh" group).
  const GEN = new Set(['met', 'meet', 'with', 'accompanied', 'accompany', 'knew', 'know', 'present', 'encounter', 'together', 'companion', 'companions', 'recognized', 'recognize', 'imprisoned', 'attained', 'visited', 'served', 'who', 'whom', 'did']);
  const nameTokens = new Set([...(connTarget ? tokize(connTarget.name) : []), ...(best ? tokize(best.name) : [])]);
  const specificToks = [...tokize(q)].filter((t) => !nameTokens.has(t) && !GEN.has(t));

  // candidate scoping
  let candidateIds = null;
  const connected = connTarget ? Object.keys(exById).map(Number).filter((eid) => eid !== connTarget.id && exById[eid].some(namesTarget)) : null;
  if (best && connTarget) {
    candidateIds = memberIds.filter((id) => connected.includes(id));   // group ∩ cited connection
    if (!candidateIds.length) {
      // group IS the query's subject (no extra place/event token) and none of its members connect → honest "none".
      if (!specificToks.length) {
        const grpName = cl(best.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^the\s+/i, ''));
        return { ids: [], q, group: best.id, reasoning: { summary: `No cited connection between the ${grpName} and ${connTarget.name} is recorded in God Passes By or The Dawn-Breakers.`, evidence: {} } };
      }
      candidateIds = connected;   // group was an incidental name-overlap → search the general cited-connected set
    }
  } else if (connTarget) {
    candidateIds = connected;
  }
  // NB: a group named WITHOUT a connection target (e.g. "Letters who died at Ṭabarsí") is left unscoped — the modeled
  // graph_relations membership is sparser than the claim data, so restricting to it under-returns; the term-matched
  // claim pool + the LLM's place/event judgement recovers the right people with better recall.

  // ── DETERMINISTIC broad-connection answer (a target, no extra place/event token): the cited-connected set IS the
  //    recall; the LLM only writes a clause per member from their connecting claim(s), and may drop one only if its
  //    proof does not actually bear the connection (SKIP). Place/event queries fall through to the precision path.
  if (connTarget && candidateIds && candidateIds.length && !specificToks.length) {
    const grp = best ? cl(best.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+group$/i, '').replace(/^the\s+/i, '')) : '';
    const members = [];
    for (const id of candidateIds) {
      let conn = (exById[id] || []).filter(namesTarget);
      if (!conn.length) continue;
      // Every claim is cited, so choose for VIVIDNESS: drop claims whose proof merely "describes / refers to / extols"
      // the connection when a concrete sibling exists (one that shows the actual encounter — the embrace, the place),
      // prefer linkable, then the proof-richest. This is what lifts "met Bahá'u'lláh" → "…entered His presence in Ṭihrán".
      // vividness + support ranking. `vague` = a proof that only TALKS ABOUT the connection ("described/referred to/
      // mentioned/account of…") rather than showing it — PREFIX match so "described"/"mentioned" are caught. `pNames` =
      // the proof itself names the target (strong support), vs a claim that qualified only by its typed target_id with a
      // proof that names neither party (the inaccurate Ṭáhirih ¶754 case). Prefer proof-names-target, then non-vague,
      // then clickable, then proof-rich.
      const vague = (c) => /\b(describ|referr|mention|account|recount|allud|extol|prais|letter)/i.test(c.proof || '');
      const pNames = (c) => connTarget.tok.length > 0 && connTarget.tok.every((t) => fold(c.proof || '').includes(t));
      conn = [...conn].sort((a, b) => (pNames(b) ? 1 : 0) - (pNames(a) ? 1 : 0) || (vague(a) ? 1 : 0) - (vague(b) ? 1 : 0)
        || (b.url ? 1 : 0) - (a.url ? 1 : 0) || (b.proof || '').length - (a.proof || '').length).slice(0, 6);
      members.push({ id, name: nameById[id] || `#${id}`, conn });
    }
    if (members.length) {
      const CSYS = `For each person, choose the ONE fact that most CONCRETELY shows the connection the QUESTION asks about, and write a SPECIFIC clause (≤16 words, begin with a verb) that names the PLACE, TIME, or CIRCUMSTANCE of the connection. PREFER THE BOOK'S OWN WORDING taken verbatim from that fact's « proof » — lightly trimmed to a clean phrase — rather than paraphrasing (e.g. "was privileged to enter the presence of Bahá'u'lláh in Ṭihrán", "walked with Bahá'u'lláh in the streets of Badasht", "tenderly embraced Him and conducted Him to the place of honour"). NEVER write a bare "met X": do NOT choose a fact whose proof merely says someone "described", "referred to", or "mentioned" the person — prefer a fact whose proof shows the actual encounter (where/when/how it happened). Each fact is indexed "[i] statement « verbatim proof »". If NO fact actually shows the connection, use clause "SKIP". Return ONLY JSON: {"lead":"<one short sentence>","clauses":[{"id":<number>,"i":<chosen fact index>,"clause":"<specific book-worded verb phrase or SKIP>"}]}.`;
      const body = members.map((m) => `${m.id}|${m.name}:\n` + m.conn.map((c, i) => `  [${i}] ${cl(c.statement)} « ${cl(c.proof)} »`).join('\n')).join('\n');
      let lead = ''; const byId = {};
      try {
        const res = await chatCompletion([{ role: 'system', content: CSYS }, { role: 'user', content: `QUESTION: ${q}\n\n${body}` }],
          { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 900, responseFormat: { type: 'json_object' } });
        const mm = (res.content || '').match(/\{[\s\S]*\}/); const p = mm ? JSON.parse(mm[0]) : {};
        lead = cl(p.lead || '');
        for (const c of (Array.isArray(p.clauses) ? p.clauses : [])) if (c && c.id != null) byId[Number(c.id)] = { i: Number.isInteger(+c.i) ? +c.i : 0, clause: cl(c.clause).slice(0, 140) };
      } catch { /* fall back to statements below */ }
      const stripName = (id, s) => { const nm = nameById[id] || ''; const re = new RegExp('^(' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')[\\s,;:—-]*', 'i'); return cl(s).replace(re, '').replace(/^[\s,;:—-]+/, ''); };
      const SKIP = /^\s*skip\s*$|\bno mention\b|\bno explicit\b|\bnot (?:mention|meet|met|present|clearly|established|recorded)\b|\bunclear\b|\bno (?:evidence|record|meeting)\b|\bdid not\b/i;
      const evidence = {}; const parts = []; const ids = [];
      for (const m of members) {
        const pick = byId[m.id] || {};
        const claim = m.conn[pick.i] || m.conn.find((c) => c.url) || m.conn[0];   // the claim the clause is drawn from → link to IT
        const clause = (pick.clause || stripName(m.id, claim.statement).split(/[;.]/)[0].slice(0, 120)).replace(/[\s.;,]+$/, '');
        if (SKIP.test(clause)) continue;   // proof doesn't bear the connection → drop, never assert
        // link ONLY to this claim's own citation (never borrow another's — that would miscite); show the book as text
        // when the source has no public URL, so the citation is ALWAYS visible.
        evidence[m.id] = { quote: cl(claim.statement), proof: cl(claim.proof) || null, source: claim.source, paraId: claim.paraId, url: claim.url || null, clause };
        parts.push(claim.url ? `${m.name} [${clause}](${claim.url})` : `${m.name} ${clause}${claim.source ? ' — ' + claim.source : ''}`);
        ids.push(m.id);
      }
      if (ids.length) {
        // the per-person clauses ARE the answer (each: name + book-worded evidence + link) — no enumerating lead that
        // just repeats the names. `lead`/`grp` are computed above but deliberately not prepended.
        const summary = `${parts.join('; ')}.`.replace(/\s+/g, ' ').trim();
        return { ids, q, ...(best ? { group: best.id } : {}), reasoning: { summary, evidence } };
      }
      if (best) return { ids: [], q, group: best.id, reasoning: { summary: `No cited connection between the ${grp} and ${connTarget.name} is borne out by the sources.`, evidence: {} } };
    }
  }
  // ── Precision path (place/event/meaning, incl. connection+place): judge the query over each candidate's cited claims.
  //    Pool = the cited-connected set (if a target was named) else entities whose claim proof/statement matches the query
  //    terms. Every candidate line carries the claim's VERBATIM PROOF so the model judges on evidence, not paraphrase.
  const qterms = tokize(q);
  const matchScore = (eid) => exById[eid].reduce((s, c) => s + qterms.filter((t) => c.hay.includes(t)).length, 0);
  let poolIds = candidateIds || Object.keys(exById).map(Number).filter((eid) => matchScore(eid) > 0);
  poolIds = poolIds.filter((id) => exById[id]).sort((a, b) => matchScore(b) - matchScore(a) || (impById[b] - impById[a])).slice(0, 60);
  const lines = poolIds.map((id) => {
    const fx = [...exById[id]].sort((a, b) => qterms.filter((t) => b.hay.includes(t)).length - qterms.filter((t) => a.hay.includes(t)).length);
    return `${id}|${nameById[id]}: ${fx.slice(0, 14).map((c) => `• ${cl(c.statement)} « ${cl(c.proof).slice(0, 160)} »${c.when ? ' [' + c.when + ']' : ''}`).join(' ')}`;
  });
  const catalog = lines.join('\n');

  const SYS = `You answer a question about people in early Bábí/Bahá'í history from a CATALOG of cited claims — one person per line: "id|name: • statement « verbatim proof » [period] • …" (from God Passes By and The Dawn-Breakers).
A person qualifies ONLY if one of their claims, AS SHOWN BY ITS VERBATIM PROOF, DIRECTLY satisfies the QUERY — the right act AND place AND period. Reject mere group membership. Reject "promised/prophesied/expected" when the query asks who actually DID or MET something. For a place/period query the proof must name that place/period.
For each qualifying person output {"id":<number>, "clause":"<a SHORT phrase answering the query for this person — PREFER the book's OWN wording taken verbatim from their « proof », lightly trimmed to a clean phrase, rather than paraphrasing; e.g. 'fell a martyr at the fort of Shaykh Ṭabarsí', 'was admitted into the presence of Bahá'u'lláh in Baghdád'>"}.
Also output "lead": one short sentence stating the overall answer.
Return ONLY JSON: {"lead":"...","matches":[{"id","clause"}]} — most relevant first, clear matches only.`;
  try {
    const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `QUERY: ${q}\n\nCATALOG:\n${catalog}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 2600, responseFormat: { type: 'json_object' } });
    // tolerant parse: DeepSeek occasionally emits malformed/truncated JSON — salvage the lead + every COMPLETE {...}.
    const looseParse = (txt) => {
      const whole = (txt || '').match(/\{[\s\S]*\}/);
      if (whole) { try { return JSON.parse(whole[0]); } catch { /* fall through to salvage */ } }
      const out = {}; const lead = (String(txt).match(/"lead"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1]; if (lead) out.lead = lead;
      const objs = []; const re = /\{[^{}]*\}/g; let o; while ((o = re.exec(String(txt)))) { try { objs.push(JSON.parse(o[0])); } catch { /* skip */ } }
      if (objs.length) out.matches = objs.filter((x) => x && x.id != null);
      return out;
    };
    const parsed = looseParse(res.content);
    const evidence = {}; const aiIds = []; const parts = [];
    for (const mm of (Array.isArray(parsed.matches) ? parsed.matches : [])) {
      const id = Number(mm.id); if (!id || aiIds.includes(id) || !exById[id]) continue;
      if (candidateIds && !candidateIds.includes(id)) continue;                       // never escape the candidate scope
      const fx = exById[id];
      // bind to the claim best matching the query (term overlap), preferring one that names the connection target
      const ranked = [...fx].sort((a, b) => qterms.filter((t) => b.hay.includes(t)).length - qterms.filter((t) => a.hay.includes(t)).length);
      const hit = (connTarget ? ranked.find(namesTarget) : null) || ranked[0];
      const clause = String(mm.clause || hit.statement).replace(/\s+/g, ' ').trim().slice(0, 160).replace(/[\s.;,]+$/, '');
      aiIds.push(id); evidence[id] = { quote: cl(hit.statement), proof: cl(hit.proof) || null, source: hit.source, paraId: hit.paraId, url: hit.url || null, clause };
      const nm = nameById[id] || `#${id}`;
      parts.push(hit.url ? `${nm} [${clause}](${hit.url})` : `${nm} ${clause}${hit.source ? ' — ' + hit.source : ''}`);
    }
    // no qualifying match: say so plainly rather than return a blank banner — especially for a connection query, where
    // the honest answer ("no cited connection with X") is itself the useful result (e.g. Seven Martyrs met Bahá'u'lláh).
    const explanation = parts.length
      ? `${parts.join('; ')}.`.trim()   // per-person clauses are the answer; no enumerating lead
      : (connTarget ? `No cited connection with ${connTarget.name} is recorded for anyone matching this query in God Passes By or The Dawn-Breakers.` : '');
    return { ids: aiIds, q, ...(best ? { group: best.id } : {}), reasoning: { summary: explanation, evidence } };
  } catch (e) { return { ids: memberIds, q, error: String(e).slice(0, 80) }; }
}
