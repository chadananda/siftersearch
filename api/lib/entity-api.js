// Entity API — the shared TOOL layer over the new evidence-reconciled substrate (entity_claims + entity_mentions_v2 +
// deduped graph_entities). Consumed by BOTH the biography browser routes and the general search / Jafar chat tools.
// Reads cited claims (proof-gated, temporal) + occurrences; legacy entity_research only supplies enrichment (summary,
// aliases) the new pipeline doesn't produce yet. Merged-duplicate entities (last_assessed_version LIKE 'merged-into-%')
// are excluded everywhere.
import { queryOne, queryAll } from './db.js';
import { skeletonKeys } from './translit-key.js';
import { LIVE_SQL, isMergedRow } from './entity-live.js';   // ONE definition of live/merged (see entity-live.js header)

const parse = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const abbrOf = (t) => t === 'The Dawn-Breakers' ? 'DB' : t === 'God Passes By' ? 'GPB' : (String(t || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || null);
// Resolve source documents (title + public url) from the docs table — NOT a hardcoded book list. Every claim carries
// doc_id + para_id by construction, so a citation always exists; the clickable oceanlibrary link is added when the
// book has a source_url. Returns Map(doc_id → { title, url }).
async function resolveDocs(docIds) {
  const ids = [...new Set(docIds.filter(Boolean))];
  const m = new Map();
  for (let i = 0; i < ids.length; i += 800) { const ch = ids.slice(i, i + 800);
    (await queryAll(`SELECT id, title, source_url FROM docs WHERE id IN (${ch.map(() => '?').join(',')})`, ch)).forEach((r) => m.set(r.id, { title: r.title || null, url: r.source_url || null })); }
  return m;
}

// entity_lookup(name) — fast transliteration-invariant candidate recall (RECALL only; bind by evidence).
export async function entityLookup(q, { type = null, limit = 20 } = {}) {
  const keys = [...skeletonKeys(q || '')];
  if (!q || !keys.length) return [];
  const rows = await queryAll(
    `SELECT lk.entity_id id, ge.canonical_name name, ge.entity_type type, ge.importance importance,
            COUNT(DISTINCT lk.skeleton_key) shared, MAX(lk.is_canonical) canon
       FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
      WHERE lk.skeleton_key IN (${keys.map(() => '?').join(',')})${type ? ' AND ge.entity_type=?' : ''}
        AND ${LIVE_SQL('ge.')}
      GROUP BY lk.entity_id ORDER BY canon DESC, shared DESC, (ge.importance IS NULL), ge.importance DESC LIMIT ?`,
    [...keys, ...(type ? [type] : []), Math.min(50, +limit || 20)]);
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, importance: r.importance, shared_keys: r.shared, canonical_match: !!r.canon }));
}

// entity_dossier(id) — a person's cited claims + occurrences (+ legacy enrichment where present).
export async function entityDossier(rawId) {
  const id = +String(rawId).replace(/\D/g, '');
  const ge = await queryOne(`SELECT id, canonical_name cn, entity_type et, importance, last_assessed_version lav FROM graph_entities WHERE id=?`, [id]);
  if (!ge || isMergedRow({ canonical_name: ge.cn, last_assessed_version: ge.lav })) return null;
  const er = await queryOne(`SELECT side, summary, aliases FROM entity_research WHERE canonical_name=? AND entity_type=?`, [ge.cn, ge.et]);
  const rows = await queryAll(`SELECT relation, target_entity_id tid, statement, proof_verbatim proof, doc_id, para_id, time_value tv, time_basis tb, time_precision tp, time_anchor ta
     FROM entity_claims WHERE entity_id=? AND (status IS NULL OR status='supported') ORDER BY (tv IS NULL), tv, relation`, [id]);
  const tids = [...new Set(rows.map((c) => c.tid).filter(Boolean))];
  const tname = new Map();
  if (tids.length) (await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE id IN (${tids.map(() => '?').join(',')})`, tids)).forEach((r) => tname.set(r.id, r.cn));
  const occ = await queryAll(`SELECT doc_id, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id=? GROUP BY doc_id`, [id]);
  const dmap = await resolveDocs([...rows.map((c) => c.doc_id), ...occ.map((o) => o.doc_id)]);
  const claims = rows.map((c) => { const d = dmap.get(c.doc_id) || {}; return {
    relation: c.relation, object_id: c.tid || null, object: c.tid ? (tname.get(c.tid) || null) : null,
    statement: c.statement, proof: c.proof || null,
    when: c.tv ? `${c.tv}${c.tb ? ' [' + c.tb + ']' : ''}` : null,
    // R6 — the structured form alongside the prose one. These columns were always stored; only
    // `when` was ever serialized, so consumers had to parse a display string to get a date back.
    // `when` is kept unchanged for existing clients. ~26% of claims carry value+precision; 99% carry basis.
    time: (c.tv || c.tb || c.tp || c.ta)
      ? { value: c.tv ?? null, precision: c.tp ?? null, basis: c.tb ?? null, anchor: c.ta ?? null }
      : null,
    source: d.title || null, sourceAbbr: abbrOf(d.title), paraId: c.para_id,
    url: d.url && c.para_id ? `${d.url}?paraId=${c.para_id}` : null,
  }; });
  const dossier = {
    id: ge.id, name: ge.cn, type: ge.et, importance: ge.importance || 0, side: er?.side || null,
    summary: er?.summary || null, aliases: parse(er?.aliases),
    claims, claimCount: claims.length,
    occurrences: occ.map((o) => ({ book: (dmap.get(o.doc_id)?.title) || `doc${o.doc_id}`, mentions: o.n })),
    mentionCount: occ.reduce((s, o) => s + o.n, 0), source: 'entity-substrate-v2',
  };

  // AN EVENT/PLACE/GROUP NODE CARRIES NO CLAIMS OF ITS OWN, AND MUST NOT LOOK UNUSED BECAUSE OF IT.
  //
  // Claims hang off the PERSON: "Quddús — participated-in Badasht conference". The link to the event lives
  // in the claim's PROSE, not in target_entity_id — of 92 participated-in claims on Quddús exactly ONE
  // carries an object_id. So `GET /entities/{Badasht Conference}` returned claims:[] and read as an empty
  // record for an event the corpus discusses at length, and an agent reasonably concluded the event graph
  // was unpopulated and fell back to passage search.
  //
  // There is no structured edge to join, so participants are assembled the only way the data allows — by
  // matching the node's name against claim prose, the same path /entities/search takes. That is a weaker
  // guarantee than a graph edge and is labelled as such in `participantsProvenance` rather than presented
  // as one. /entities/capabilities already tells this truth about place; this extends it to the node itself.
  if (!claims.length && ['event', 'place', 'group'].includes(ge.et)) {
    // A GROUP HAS A REAL MEMBERSHIP EDGE. USE IT INSTEAD OF GUESSING FROM PROSE.
    //
    // graph_relations(source_entity_id → target_entity_id) carries person→group membership, and bio.js has
    // been reading it all along. Matching the name against claim prose instead produced the Letters of the
    // Living as a 30-name dump including Shoghi Effendi ("related-to terraces named for the 18 Letters of
    // the Living"), the Báb ("prophesied thirteen Letters") and Bahá'u'lláh ("characterized-as NOT included
    // among the Letters") — every one of those sentences contains the group's name, so no name-matching rule
    // could ever separate them. The edge can: it returns the canonical 18, indexed, in a quarter-second.
    //
    // EVENTS AND PLACES HAVE NO SUCH EDGE (`/api/graph/entity/1264029` → connected: []), so they keep the
    // prose path below. Do not assume symmetry between node types; it does not hold.
    const members = await queryAll(
      `SELECT gr.source_entity_id id, ge2.canonical_name name, ge2.importance imp, gr.relation_type rel,
              gr.source_doc_id doc_id, gr.source_content_id para
         FROM graph_relations gr JOIN graph_entities ge2 ON ge2.id = gr.source_entity_id
        WHERE gr.target_entity_id = ? AND ge2.entity_type = 'person' AND ${LIVE_SQL('ge2.')}
        ORDER BY (ge2.importance IS NULL), ge2.importance DESC`, [id]);
    if (members.length) {
      const mdocs = await resolveDocs(members.map((m) => m.doc_id));
      const byId = new Map();
      for (const m of members) {
        if (!byId.has(m.id)) byId.set(m.id, { id: m.id, name: m.name, importance: m.imp || 0, relations: [], evidence: [] });
        const e = byId.get(m.id);
        if (m.rel && !e.relations.includes(m.rel)) e.relations.push(m.rel);
        const d = mdocs.get(m.doc_id) || {};
        e.evidence.push({ relation: m.rel || null, statement: `${m.name} — ${m.rel || 'member-of'} ${ge.cn}`,
          source: d.title || null, sourceAbbr: abbrOf(d.title), paraId: m.para ? `p${m.para}` : null,
          url: d.url && m.para ? `${d.url}?paraId=p${m.para}` : null });
      }
      dossier.participants = [...byId.values()];
      dossier.participantCount = dossier.participants.length;
      dossier.participantsProvenance = {
        derivedFrom: 'graph-relations',
        matchedOn: null,
        note: `Structured membership edge (graph_relations), not a name match — these are the recorded members `
          + `of this ${ge.et}. People who merely MENTION it (Shoghi Effendi on the terraces named for the `
          + `Letters of the Living, for instance) are correctly absent; find those with the search call below.`,
        equivalentCall: `GET /api/v1/entities/search?q=${encodeURIComponent(ge.cn)}`,
      };
    } else {
    const found = await entitySearch(ge.cn, { limit: 60 });
    // RARITY FROM THE CANDIDATES, NOT FROM EXTRA FULL SCANS.
    // Scoring rarity with one COUNT(*) per term added a whole folded scan of entity_claims per word — the
    // Letters node has four, which is most of why it took 31s. The candidate set is every claim mentioning
    // any part of the name, so which of the name's own words is the generic one is already visible in it.
    const primaryName = ge.cn.replace(/\([^)]*\)/g, ' ').trim();
    const nameTerms = searchTerms(primaryName).length ? searchTerms(primaryName) : searchTerms(ge.cn);
    const allEvidence = found.results.flatMap((r) => r.evidence.map((e) => foldText(e.statement)));
    let required = null;
    if (nameTerms.length > 1 && allEvidence.length) {
      const byRarity = nameTerms
        .map((t) => ({ t, n: allEvidence.filter((f) => f.includes(t)).length }))
        .sort((x, y) => x.n - y.n);
      const narrow = (term) => found.results
        .map((r) => ({ ...r, evidence: r.evidence.filter((e) => foldText(e.statement).includes(term)) }))
        .filter((r) => r.evidence.length);
      for (const { t } of byRarity) {
        const kept = narrow(t);
        if (kept.length) { required = t; found.results = kept; break; }
      }
    }
    // MENTIONING AN EVENT IS NOT ATTENDING IT. Same lesson as the group above, applied where no edge exists:
    // the relation separates presence from reference. Nothing is discarded — the rest come back as `mentions`.
    const parts = [], mentions = [];
    for (const r of found.results) {
      const keep = r.evidence.filter((e) => !GENERIC_RELATIONS.has(e.relation));
      const rest = r.evidence.filter((e) => GENERIC_RELATIONS.has(e.relation));
      const base = { id: r.id, name: r.name, importance: r.importance };
      if (keep.length) parts.push({ ...base, relations: [...new Set(keep.map((e) => e.relation).filter(Boolean))], evidence: keep });
      else if (rest.length) mentions.push({ ...base, relations: [...new Set(rest.map((e) => e.relation).filter(Boolean))], evidence: rest });
    }
    dossier.participants = parts.slice(0, 30);
    dossier.participantCount = dossier.participants.length;
    dossier.mentions = mentions.slice(0, 30);
    dossier.mentionsCount = dossier.mentions.length;
    dossier.participantsProvenance = {
      derivedFrom: 'claim-prose',
      matchedOn: required || null,
      note: `No structured edge points at this ${ge.et}. Participants are people whose CITED claims mention `
        + `"${ge.cn}" AND assert presence — the relation, not the name, separates being there from being `
        + `mentioned. Claims that only reference it are returned under \`mentions\` rather than dropped. `
        + `Verify each with its proof span and paraId; a name match is recall, not proof.`,
      equivalentCall: `GET /api/v1/entities/search?q=${encodeURIComponent(ge.cn)}`,
    };
    }
  }
  return dossier;
}

// ── entity_search term handling ───────────────────────────────────────────────────────────────────────────
//
// WHAT WAS WRONG (2026-08-28): the query joined `LOWER(statement) LIKE ?` for EVERY token longer than two
// characters with AND — "the" included — and required them all inside ONE claim statement. The tool then
// failed on the very examples its own description advertises, while the evidence sat in the table:
//     "amanuensis"   → 11 people        "amanuensis of the Báb"  → 0
//     "Fort Ṭabarsí" → 12 people        "died at Fort Ṭabarsí"   → 0
// A claim says "was martyred at Fort Ṭabarsí", the reader asks "died at" — one absent word deleted every
// result. Chat, getting nothing, answered person questions with "not listed in the text".
//
// Second fault: terms were diacritic-folded but `statement` was not, so a folded "bab" could not reach the
// stored "Báb" and the corpus's most central figure matched a single claim.
//
// A missing word must DEMOTE a match, never delete it (this codebase has paid for greedy all-or-nothing
// matching before). So: fold both sides, drop stop-words, match on OR, and RANK — exact phrase first, then
// by how many distinct terms a claim carries.
// Relations that only REFERENCE a node rather than place someone at or in it. Membership and presence are
// everything else. Derived from the failure, not invented: "related-to terraces named for the 18 Letters of
// the Living" (Shoghi Effendi), "prophesied thirteen Letters" (the Báb) and "characterized-as not included
// among the Letters" (Bahá'u'lláh) all name the group without joining it.
const GENERIC_RELATIONS = new Set([
  'related-to', 'characterized-as', 'associated-with', 'prophesied', 'testified-about',
  'mentioned', 'referenced', 'named-after', 'decreed', 'compared-to', 'described-as',
]);

const STOP = new Set(('the of at in on a an and or to for with by from as was were is are be been his her their its ' +
  'who whom which that this it he she they them had has have who\'s about into during after before').split(' '));

// The transliteration set actually used in this corpus, both cases. SQLite's LOWER() is ASCII-only, so the
// accented capitals must be mapped explicitly rather than lower-cased.
const FOLD = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ā': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'ō': 'o',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ū': 'u', 'ḍ': 'd', 'ḥ': 'h', 'ṭ': 't', 'ẓ': 'z', 'ṣ': 's',
  'ṇ': 'n', 'ġ': 'g', 'š': 's', 'č': 'c', 'ž': 'z', 'ñ': 'n', 'ç': 'c',
};

/** Fold a string to its plain-ASCII, mark-free, lower-case form. Used on BOTH sides of every comparison. */
export function foldText(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ʼʻ‘’'`´]/g, '')
    .split('').map((ch) => FOLD[ch] ?? FOLD[ch.toLowerCase()] ?? ch).join('')
    .toLowerCase();
}

/** The content words a claim must be matched on. Stop-words are kept ONLY if the query is nothing else. */
export function searchTerms(q) {
  const all = foldText(q).split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const content = all.filter((t) => !STOP.has(t));
  return content.length ? content : all;
}

/**
 * How well one claim answers the query. 0 = no match (excluded).
 * Exact phrase outranks scattered terms, per the search doctrine; each additional distinct term adds one.
 */
export function scoreStatement(statement, terms, foldedQuery = null) {
  const f = foldText(statement);
  let score = 0;
  for (const t of terms) if (f.includes(t)) score += 1;
  if (!score) return 0;
  if (foldedQuery && f.includes(foldedQuery)) score += 10;   // exact phrase first
  return score;
}

// The SQL-side fold, so the OR pre-filter selects the same rows the JS scorer would. Generated from FOLD so
// the two can never drift apart.
const SQL_FOLD = (col) => {
  const pairs = [...new Set(Object.keys(FOLD).flatMap((c) => [c, c.toUpperCase()]))]
    .filter((c) => FOLD[c] || FOLD[c.toLowerCase()]);
  let e = col;
  for (const c of pairs) e = `REPLACE(${e}, '${c}', '${FOLD[c] ?? FOLD[c.toLowerCase()]}')`;
  for (const c of ['ʼ', 'ʻ', '‘', '’', "''", '`']) e = `REPLACE(${e}, '${c}', '')`;
  return `LOWER(${e})`;
};

// entity_search(query) — candidate people whose CITED claims match the query tokens. Returns each with the
// matching cited claims as evidence — the general search / chat can then read or verify them.
export async function entitySearch(q, { limit = 12, rows: preRows = null } = {}) {
  const terms = searchTerms(q);
  if (!terms.length) return { query: q, results: [] };
  const foldedQuery = foldText(q);
  // FOLD ONCE PER ROW, NOT ONCE PER TERM PER ROW.
  //
  // The first version inlined SQL_FOLD (a ~40-deep REPLACE chain) into every term test in WHERE, every term
  // test in the rank, and the phrase test — five evaluations per row for a two-word name, NINE for
  // "the Letters of the Living (Ḥurúf-i-Ḥayy)". Measured live: entities/search 9.8s, the Badasht node 20.8s,
  // the Letters node 31.2s against a 20s agent-client timeout. Latency scaled with the term count, which is
  // the fingerprint of exactly this mistake.
  //
  // A MATERIALIZED CTE folds each candidate row once and the rest of the query reads that column. SQLite
  // flattens a plain subquery (re-inlining the expression and changing nothing), so the hint is load-bearing.
  const rank = `(10 * (f LIKE ?) + ${terms.map(() => `(f LIKE ?)`).join(' + ')})`;
  const params = [`%${foldedQuery}%`, ...terms.map((t) => `%${t}%`), ...terms.map((t) => `%${t}%`)];
  const rows = preRows || await queryAll(
    `WITH c AS MATERIALIZED (
        SELECT ec.entity_id id, ge.canonical_name name, ge.importance imp, ec.statement, ec.relation,
               ec.doc_id, ec.para_id, ${SQL_FOLD('ec.statement')} f
          FROM entity_claims ec JOIN graph_entities ge ON ge.id=ec.entity_id
         WHERE (ec.status IS NULL OR ec.status='supported') AND ge.entity_type='person'
           AND ${LIVE_SQL('ge.')}
     )
     SELECT id, name, imp, statement, relation, doc_id, para_id, ${rank} rank
       FROM c
      WHERE ${terms.map(() => `f LIKE ?`).join(' OR ')}
      ORDER BY rank DESC LIMIT 2000`,
    [...params, ...terms.map((t) => `%${t}%`)]);
  const dmap = await resolveDocs(rows.map((r) => r.doc_id));
  const byEnt = new Map();
  for (const r of rows) {
    const score = scoreStatement(r.statement, terms, foldedQuery);
    if (!score) continue;
    if (!byEnt.has(r.id)) byEnt.set(r.id, { id: r.id, name: r.name, importance: r.imp || 0, score: 0, evidence: [] });
    const e = byEnt.get(r.id);
    e.score = Math.max(e.score, score);
    const d = dmap.get(r.doc_id) || {};
    e.evidence.push({ score, statement: r.statement, relation: r.relation, source: d.title || null,
      sourceAbbr: abbrOf(d.title), paraId: r.para_id, url: d.url && r.para_id ? `${d.url}?paraId=${r.para_id}` : null });
  }
  // Best-matching person first; strongest evidence first within each person.
  const results = [...byEnt.values()]
    .map((e) => ({ ...e, evidence: e.evidence.sort((a, b) => b.score - a.score).slice(0, 8) }))
    .sort((a, b) => b.score - a.score || b.evidence.length - a.evidence.length || b.importance - a.importance)
    .slice(0, Math.min(30, +limit || 12));
  return { query: q, results, note: 'cited-claim matches — read/verify evidence before asserting' };
}

