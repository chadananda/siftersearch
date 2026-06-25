// Shared biography data layer — the single source of truth for person records (list + dossier) and source-book
// facets, used by BOTH the internal /api/graph/bio/* routes and the official /api/v1/people API.
import { queryAll, queryOne, graphQueryAll } from './db.js';
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
    let aliases = [], kinship = []; try { aliases = JSON.parse(r.aliases || '[]'); } catch {} try { kinship = JSON.parse(r.kinship || '[]'); } catch {}
    const m = man[r.id]; const hasPortrait = !!(m && m.cdn);
    return { id: r.id, name: r.name, importance: r.importance || 0, side: r.side || null,
      summary: r.summary || null, aliases, kinship, hasPortrait, sources: [...(bookOf[r.id] || [])],
      portrait: m?.cdn || null,
      wiki: m?.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(m.title).replace(/ /g, '_'))}` : null };
  });
  const sides = [...new Set(persons.map(p => p.side).filter(Boolean))].sort();
  const books = SOURCE_BOOKS.map(b => ({ key: b.key, label: b.label, count: persons.filter(p => p.sources.includes(b.key)).length }));
  _listCache = { count: persons.length, withPortraits: persons.filter(p => p.hasPortrait).length, sides, books, persons };
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
  return { id: row.id, name: row.name, importance: row.importance || 0, side: row.side || null,
    summary: row.summary || null, aliases: arr(row.aliases), kinship: arr(row.kinship), relations: arr(row.relations),
    dates: arr(row.dates), facts: notes.facts || [], firewall: notes.firewall || [], contested: notes.contested || [],
    possible_ids: notes.possible_ids || [], wiki, portrait, portraitFull, bahai, mentionCount, books, gpbRefs };
}
