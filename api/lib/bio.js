// Shared biography data layer — the single source of truth for person records (list + dossier) and source-book
// facets, used by BOTH the internal /api/graph/bio/* routes and the official /api/v1/people API.
import { queryAll, queryOne, graphQueryAll } from './db.js';
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

// entity_id → Set(book keys), from graph.db mentions mapped through content→docs (chunked under SQLite's 999-param cap)
export async function computeBookSources() {
  const bookOf = {};
  for (const b of SOURCE_BOOKS) {
    const cids = (await queryAll(`SELECT id FROM content WHERE doc_id IN (${b.docs.join(',')})`)).map(r => String(r.id));
    for (let i = 0; i < cids.length; i += 800) {
      const chunk = cids.slice(i, i + 800);
      const ents = await graphQueryAll(`SELECT DISTINCT entity_id FROM entity_mentions WHERE content_id IN (${chunk.map(() => '?').join(',')})`, chunk);
      for (const e of ents) (bookOf[e.entity_id] ||= new Set()).add(b.key);
    }
  }
  return bookOf;
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
  const row = await queryOne(`SELECT ge.id, ge.canonical_name AS name, ge.importance, er.side, er.summary,
      er.aliases, er.kinship, er.relations, er.research_notes, er.dates
    FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.id = ?`, [id]);
  if (!row) return null;
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
    const ms = await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id = ?', [id]);
    mentionCount = ms.length;
    const cids = [...new Set(ms.map(m => String(m.content_id)))].slice(0, 900);
    if (cids.length) {
      const ph = cids.map(() => '?').join(',');
      books = (await queryAll(`SELECT DISTINCT d.title FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id IN (${ph}) AND d.title IS NOT NULL`, cids)).map(b => b.title);
      const gp = await queryAll(`SELECT c.external_para_id AS pid, c.text, c.heading, d.source_url AS url FROM content c JOIN docs d ON d.id = c.doc_id
        WHERE c.id IN (${ph}) AND d.id IN (21310, 57347) AND c.external_para_id IS NOT NULL ORDER BY c.id LIMIT 24`, cids);
      gpbRefs = gp.map(r => ({ paraId: r.pid, url: r.url ? `${r.url}?paraId=${r.pid}` : null, heading: r.heading || null, snippet: String(r.text || '').replace(/\s+/g, ' ').slice(0, 200) }));
    }
  } catch { /* graph optional */ }
  const notes = obj(row.research_notes);
  // prefer the cited fact catalog (facts2: relation-tagged, paragraph-cited); map to the {quote,...} shape the UI reads
  const characterizations = Array.isArray(notes.facts2) && notes.facts2.length
    ? notes.facts2.map(f => ({ quote: f.statement, proof: f.quote || null, relation: f.relation || null, when: f.when || null, source: f.source, paraId: f.paraId, url: f.url || null }))
    : (notes.characterizations || []);
  // shared EPISODES (real events with rosters) — the connection evidence; show them with the facts, tagged by episode
  if (Array.isArray(notes.episodes)) for (const e of notes.episodes) characterizations.push({ quote: e.statement, proof: e.quote || null, relation: 'episode', episode: e.name, when: e.when || null, source: e.source, paraId: e.paraId, url: e.url || null });
  // compact citation label per fact: source abbrev + paragraph number (e.g. "GPB ¶72", "DB ¶467")
  try {
    const pids = [...new Set(characterizations.map(c => c.paraId).filter(Boolean))];
    if (pids.length) {
      const ixRows = await queryAll(`SELECT doc_id, external_para_id pid, paragraph_index pix FROM content WHERE external_para_id IN (${pids.map(() => '?').join(',')}) AND doc_id IN (21310,57347,21308)`, pids);
      const ix = {}; for (const r of ixRows) ix[`${r.doc_id}:${r.pid}`] = r.pix;
      for (const c of characterizations) {
        const abbr = c.source === 'The Dawn-Breakers' ? 'DB' : 'GPB';
        const docs = c.source === 'The Dawn-Breakers' ? [21308] : [21310, 57347];
        let n = null; for (const d of docs) if (ix[`${d}:${c.paraId}`] != null) { n = ix[`${d}:${c.paraId}`]; break; }
        c.cite = n != null ? `${abbr} ¶${n}` : abbr;
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

  // Candidate catalog = each person's CITED FACT CATALOG (facts2: clear, paragraph-cited facts incl. connections).
  // The meaning-search is a LOOKUP over these typed cited facts — the answer is what the facts say, and a person
  // with no fact supporting the query is not returned (no guessing). Evidence = the matched fact + its citation.
  const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, er.aliases, er.research_notes
    FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
    WHERE ge.entity_type='person' AND ge.religion='' AND (er.research_notes LIKE '%"facts2"%' OR er.research_notes LIKE '%"episodes"%')
    ORDER BY (ge.importance IS NULL), ge.importance DESC LIMIT 900`);
  const exById = {}; const epById = {}; const cand = []; const nameById = {};
  const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
  // SUBJECT GATE — a facts2 roster artifact like "Muṣṭafá — dervish converted by Bahá'u'lláh" is a fact whose
  // grammatical SUBJECT is a DIFFERENT named person that got mis-filed under this entity (a co-mention that leaked
  // across the em-dash). If such a fact is the only one naming, say, "Bahá'u'lláh", the search will grab it to
  // justify a "who met Bahá'u'lláh" clause and fabricate a narrative. So: any fact in the "<Subject> — description"
  // roster form whose Subject shares NO significant name-token with this person is dropped before it can be cited.
  // Only the spaced em/en-dash roster form is judged (prose facts like "Next to Mullá Ḥusayn, Vaḥíd was…" are left
  // alone), and a hyphen inside a name (Qurbán-‘Alí) is never treated as the delimiter.
  const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai karbala mashhadi hajj the of son daughter dervish native an outstanding figure community known as one'.split(' '));
  const sigToks = (s) => new Set(nrm(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
  const allToks = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));   // keep parenthetical names
  const factSubjectOk = (name, aliasArr, statement) => {
    const m = String(statement || '').match(/^\s*([^—–]{2,60}?)\s+[—–]\s+\S/);   // "Subject — description" roster form only
    if (!m) return true;                                                          // not the roster form → don't judge
    if (/^\s*(his|her|their|its)\b/i.test(m[1])) return true;                      // possessive subject ("His sons —") → about the entity
    const subj = sigToks(m[1]); if (!subj.size) return true;                       // no name-like subject → keep
    const mine = sigToks(name); for (const a of (aliasArr || [])) for (const t of sigToks(a)) mine.add(t);
    const whole = allToks(statement);                                             // entity named ANYWHERE (incl. "…not Peter…") → keep
    for (const t of mine) if (subj.has(t) || whole.has(t)) return true;
    return false;                                                                 // a DIFFERENT named subject, entity absent → drop
  };
  for (const r of rows) {
    nameById[r.id] = r.name;
    const aliasArr = (() => { try { return JSON.parse(r.aliases || '[]'); } catch { return []; } })();
    const rn = (() => { try { return JSON.parse(r.research_notes || '{}'); } catch { return {}; } })();
    if (Array.isArray(rn.episodes) && rn.episodes.length) { epById[r.id] = rn.episodes; const nm = nrm(r.name); if (nm.length >= 5) cand.push({ id: r.id, nm, n: rn.episodes.length }); }
    const eps = (Array.isArray(rn.episodes) ? rn.episodes : []).map((e) => ({ statement: e.statement, quote: e.quote || null, when: e.when || null, source: e.source, url: e.url || null, episode: e.name, slug: e.slug || null }));
    const f2 = Array.isArray(rn.facts2) ? rn.facts2 : [];
    // death fact FIRST so "who died at X" queries always see it (a long episode list would otherwise truncate it),
    // and give it a citation borrowed from a martyrdom/fate fact so the death evidence is linkable
    const d = rn.death;
    let death = [];
    if (d && (d.cause || d.place)) {
      const dsrc = [...eps, ...f2].find((f) => f.url && /martyr|killed|slain|put to death|beheaded|strangled|died|execut|fell|perished/i.test(f.statement || ''));
      death = [{ statement: `Died: ${[d.cause, d.place, d.year].filter(Boolean).join(', ')}`, quote: dsrc?.quote || null, source: d.source || dsrc?.source || null, url: d.url || dsrc?.url || null, when: d.year || null }];
    }
    const fx = [...death, ...eps, ...f2].filter((f) => factSubjectOk(r.name, aliasArr, f.statement));   // death + episodes first; drop cross-filed roster facts
    if (!fx.length) continue;
    exById[r.id] = fx;
  }

  // ---- candidate scoping: judge the predicate over a SMALL relevant set, not 900 lines (which over/under-includes) ----
  const connQ = /\b(met|meet|with|accompan|knew|know|present|encounter|together|companion|recogni)\b/i.test(q);
  let connTarget = null;
  if (connQ) { const nq = nrm(q); connTarget = cand.filter((c) => nq.includes(c.nm) && c.nm.length >= 5).sort((a, b) => (b.nm.length - a.nm.length) || (b.n - a.n))[0]; }
  // the connection target's shared-episode roster — everyone who appears in an episode the target is also in
  const tSlugs = connTarget ? new Set((epById[connTarget.id] || []).map((e) => e.slug).filter(Boolean)) : null;
  const roster = (tSlugs && tSlugs.size) ? Object.keys(epById).map(Number).filter((id) => id !== connTarget.id && (epById[id] || []).some((e) => tSlugs.has(e.slug))) : null;
  let candidateIds = null;
  if (best && memberIds.length) candidateIds = roster ? memberIds.filter((id) => roster.includes(id)) : memberIds.slice();   // group ∩ connection-roster (deterministic recall)
  else if (roster) candidateIds = roster;                                                    // pure connection query → the roster
  if (candidateIds && !candidateIds.length) candidateIds = best ? memberIds.slice() : null;   // fallback if intersection empties
  // Does the query name a specific PLACE/EVENT beyond the target's name, the resolved group, and generic connection
  // verbs? ("imprisoned with the Báb at Máh-Kú" → {imprisoned,mahku,chihriq}; "who met Bahá'u'lláh" → {}). The display
  // name is tokenized the same way as q so name fragments ("Bahá'u'lláh"→{baha,llah}) are removed, not mistaken for a place.
  const tokOf = (s) => new Set(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 2 && !STOP.has(t)));
  const GEN = ['met', 'meet', 'with', 'accompan', 'knew', 'know', 'present', 'encounter', 'together', 'companion', 'compani', 'recogni', 'who', 'whom'];
  const specificToks = connTarget ? [...tokOf(q)].filter((t) => !tokOf(nameById[connTarget.id] || connTarget.nm).has(t) && !(best ? tokOf(best.name) : new Set()).has(t) && !GEN.some((g) => t.startsWith(g))) : [];
  // DETERMINISTIC broad-connection answer (NO specific place/event): the roster (people sharing an episode with X) IS the
  // answer — recall is deterministic; the LLM only writes a concise clause per member and may NOT prune the set (it kept
  // dropping Ṭáhirih/Báqir). Place/event-specific queries skip this and fall through to the LLM precision path below.
  if (connTarget && roster && candidateIds && candidateIds.length && !specificToks.length) {
    const cl = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const tName = nameById[connTarget.id] || 'them';
    const grp = best ? cl(best.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+group$/i, '').replace(/^the\s+/i, '')) : '';
    const members = [];
    for (const id of candidateIds) {
      const shared = (epById[id] || []).filter((e) => tSlugs.has(e.slug));
      if (!shared.length) continue;
      const ev = shared.find((e) => nrm(e.statement).includes(connTarget.nm)) || shared[0];    // prefer the episode naming the target (better citation)
      members.push({ id, name: nameById[id] || `#${id}`, ev, text: shared.map((e) => cl(e.statement)).join(' ').slice(0, 320) });
    }
    if (members.length) {
      const CSYS = `For each person listed, write a SHORT clause (≤14 words, beginning with a verb) that answers the QUESTION for that person, drawn ONLY from the facts given for them. Include EVERY id — never omit anyone. Return ONLY JSON: {"lead":"<one short sentence stating the overall answer>","clauses":[{"id":<number>,"clause":"<verb phrase>"}]}.`;
      const body = members.map((m) => `${m.id}|${m.name}: ${m.text}`).join('\n');
      let lead = ''; const byId = {};
      try {
        const res = await chatCompletion([{ role: 'system', content: CSYS }, { role: 'user', content: `QUESTION: ${q}\n\n${body}` }],
          { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 700, responseFormat: { type: 'json_object' } });
        const mm = (res.content || '').match(/\{[\s\S]*\}/); const p = mm ? JSON.parse(mm[0]) : {};
        lead = cl(p.lead || '');
        for (const c of (Array.isArray(p.clauses) ? p.clauses : [])) if (c && c.id != null) byId[Number(c.id)] = cl(c.clause).slice(0, 120);
      } catch { /* fall back to cleaned statements below */ }
      const stripName = (id, s) => { const nm = nameById[id] || ''; const re = new RegExp('^(' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')[\\s,;:]*', 'i'); return cl(s).replace(re, '').replace(/^[\s,;:]+/, ''); };
      const evidence = {}; const parts = [];
      for (const m of members) {
        const clause = byId[m.id] || stripName(m.id, m.ev.statement).split(/[;.]/)[0].slice(0, 110);
        evidence[m.id] = { quote: cl(m.ev.statement), proof: m.ev.quote || null, source: m.ev.source, url: m.ev.url || null };
        parts.push(m.ev.url ? `${m.name} [${clause}](${m.ev.url})` : `${m.name} ${clause}`);
      }
      const ids = members.map((m) => m.id);
      const summary = `${lead || `${ids.length}${grp ? ' of the ' + grp : ''} connected to ${tName}.`} ${parts.join('; ')}.`.replace(/\s+/g, ' ').trim();
      return { ids, q, ...(best ? { group: best.id } : {}), reasoning: { summary, evidence } };
    }
  }
  const pool = (candidateIds ? rows.filter((r) => candidateIds.includes(r.id) && exById[r.id]) : rows.filter((r) => exById[r.id]).slice(0, 200));
  const aliasOf = (r) => { try { return JSON.parse(r.aliases || '[]').slice(0, 3); } catch { return []; } };
  const lines = pool.map((r) => {
    const al = aliasOf(r);
    // for connection queries, float the episode(s) shared with the target to the front so the LLM always sees the link
    const fx = tSlugs ? [...exById[r.id]].sort((a, b) => (b.slug && tSlugs.has(b.slug) ? 1 : 0) - (a.slug && tSlugs.has(a.slug) ? 1 : 0)) : exById[r.id];
    return `${r.id}|${r.name}${al.length ? ' (' + al.join('; ') + ')' : ''}: ${fx.slice(0, 20).map((f) => `• ${String(f.statement).replace(/\s+/g, ' ')}${f.when ? ' [' + f.when + ']' : ''}`).join(' ')}`;
  });
  const catalog = lines.join('\n');

  const SYS = `You answer a question about people in early Bábí/Bahá'í history from a CATALOG of cited facts — one person per line: "id|name (aliases): • fact [period] • fact …" (from God Passes By and The Dawn-Breakers).
A person qualifies ONLY if one of their listed facts DIRECTLY satisfies the QUERY — the right event AND place AND period. Reject mere group membership. Reject "promised / prophesied / expected" when the query asks who actually MET or DID something. For a place/period query (e.g. "at Ṭabarsí", "during the Baghdád period") the supporting fact must match that place/period.
For each qualifying person output {"id":<number>, "fact":"<the exact supporting fact copied from their line>", "clause":"<a SHORT phrase, beginning with a verb, that answers the query FOR THIS PERSON — drawn from that fact; e.g. 'was shot by ‘Abbás-Qulí Khán at the fort', 'was taken to Bárfurúsh and killed', 'attained His presence at Badasht'>"}.
Also output "lead": one short sentence stating the overall answer (e.g. "Several Letters of the Living were martyred at Fort Ṭabarsí.").
Return ONLY JSON: {"lead":"...","matches":[{"id","fact","clause"}]} — most relevant first, clear matches only.`;
  try {
    const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `QUERY: ${q}\n\nCATALOG:\n${catalog}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 2600, responseFormat: { type: 'json_object' } });
    // tolerant parse: DeepSeek occasionally emits malformed/truncated JSON (an unescaped quote, or the array cut off at
    // maxTokens) — rather than lose the whole answer, salvage the lead + every COMPLETE {...} object from the text.
    const looseParse = (txt) => {
      const whole = (txt || '').match(/\{[\s\S]*\}/);
      if (whole) { try { return JSON.parse(whole[0]); } catch { /* fall through to salvage */ } }
      const out = {}; const lead = (String(txt).match(/"lead"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1]; if (lead) out.lead = lead;
      const objs = []; const re = /\{[^{}]*\}/g; let o; while ((o = re.exec(String(txt)))) { try { objs.push(JSON.parse(o[0])); } catch { /* skip incomplete object */ } }
      if (objs.length) out.matches = objs.filter((x) => x && x.id != null);
      return out;
    };
    const parsed = looseParse(res.content);
    const nz = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, "'").replace(/\s+/g, ' ').toLowerCase().trim();
    const evidence = {}; const aiIds = []; const parts = [];
    for (const mm of (Array.isArray(parsed.matches) ? parsed.matches : [])) {
      const id = Number(mm.id); if (!id || aiIds.includes(id) || !exById[id]) continue;
      if (candidateIds && !candidateIds.includes(id)) continue;                               // never escape the candidate scope
      const fx = exById[id]; const want = nz(mm.fact);
      const hit = fx.find((f) => want && (nz(f.statement).includes(want) || want.includes(nz(f.statement)))) || fx[0];   // bind to the STORED fact (for citation)
      const clause = String(mm.clause || hit.statement).replace(/\s+/g, ' ').trim().slice(0, 160);
      aiIds.push(id); evidence[id] = { quote: hit.statement, proof: hit.quote || null, source: hit.source, url: hit.url || null, clause };
      const nm = nameById[id] || `#${id}`;
      parts.push(hit.url ? `${nm} [${clause}](${hit.url})` : `${nm} ${clause}`);
    }
    // integrated explanation: lead sentence + each person's query-matched evidence woven in, inline-linked to its source
    const explanation = `${(parsed.lead || '').trim()}${parts.length ? ' ' + parts.join('; ') + '.' : ''}`.trim();
    return { ids: aiIds, q, ...(best ? { group: best.id } : {}), reasoning: { summary: explanation, evidence } };
  } catch (e) { return { ids: memberIds, q, error: String(e).slice(0, 80) }; }
}
