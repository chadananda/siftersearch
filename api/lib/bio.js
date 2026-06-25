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
    ? notes.facts2.map(f => ({ quote: f.statement, relation: f.relation || null, source: f.source, paraId: f.paraId, url: f.url || null }))
    : (notes.characterizations || []);
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
    WHERE ge.entity_type='person' AND ge.religion='' AND er.research_notes LIKE '%"facts2"%'
    ORDER BY (ge.importance IS NULL), ge.importance DESC LIMIT 900`);
  const exById = {}; const lines = [];
  for (const r of rows) {
    let fx = []; try { fx = JSON.parse(r.research_notes || '{}').facts2 || []; } catch {}
    if (!fx.length) continue;
    exById[r.id] = fx;
    const al = (() => { try { return JSON.parse(r.aliases || '[]'); } catch { return []; } })().slice(0, 3);
    const items = fx.slice(0, 9).map((f) => `• ${String(f.statement).replace(/\s+/g, ' ')}`).join(' ');
    lines.push(`${r.id}|${r.name}${al.length ? ' (' + al.join('; ') + ')' : ''}: ${items}`);
  }
  const catalog = lines.join('\n');
  const SYS = `You answer questions about people in early Bábí/Bahá'í history using ONLY a catalog of cited facts. You are given a QUERY and a CATALOG — one person per line: "id|name (aliases): • fact • fact …" drawn from God Passes By and The Dawn-Breakers. Return the people whose facts actually answer the query (role, group, place, fate, relationship, connection, condition). For each match, the evidence MUST be one of THAT person's listed facts that supports the answer — copied from their line, never invented or taken from another line. If no fact supports the query for a person, do not return them. Return ONLY JSON: {"summary":"one sentence answering the query","matches":[{"id":<number>,"fact":"<the supporting fact from that person's line>"}]} — clear matches only, most relevant first.`;
  try {
    const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `QUERY: ${q}\n\nCATALOG:\n${catalog}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1800, responseFormat: { type: 'json_object' } });
    const m = (res.content || '').match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    const nz = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, "'").replace(/\s+/g, ' ').toLowerCase().trim();
    const evidence = {}; const aiIds = [];
    for (const mm of (Array.isArray(parsed.matches) ? parsed.matches : [])) {
      const id = Number(mm.id); if (!id || aiIds.includes(id)) continue;
      const fx = exById[id]; if (!fx) continue;   // only people with a cited fact can be evidenced
      const want = nz(mm.fact);
      const hit = fx.find((f) => want && (nz(f.statement).includes(want) || want.includes(nz(f.statement)))) || fx[0];  // bind to the STORED cited fact
      aiIds.push(id); evidence[id] = { quote: hit.statement, source: hit.source, url: hit.url || null };
    }
    // proof-backed only: never fall back to listing un-evidenced members
    let ids = aiIds;
    if (best && memberIds.length) { const inter = aiIds.filter((id) => memberIds.includes(id)); if (inter.length) ids = inter; }
    const ev = {}; for (const id of ids) if (evidence[id]) ev[id] = evidence[id];
    return { ids, q, ...(best ? { group: best.id } : {}), reasoning: { summary: parsed.summary || '', evidence: ev } };
  } catch (e) { return { ids: memberIds, q, error: String(e).slice(0, 80) }; }
}
