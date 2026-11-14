// STAMP DOCS: re-stamp the index payload of named documents after a metadata correction (paragraph authors via section-author,
// a collection move) — index payloads are written at index time and otherwise never restamped. Per doc: `collection` (+ religion)
// on every point by doc_id, then author / author_fold / voices_fold per paragraph group (the same paragraphAuthor and
// paragraphVoices the indexers use). Payload only, no re-embedding; wait=true paces it (see doc-author-restamp). Runs in the INDEXER service. params { docs: [ids] }.
import { getDoc } from '../docs-repo.js';
import { authorsInRange } from '../repos/authors-repo.js';
import { paragraphAuthor, paragraphVoices } from '../authorship/effective.js';
import { authorKey, qdrantRequest } from '../search/qdrant-layers.js';

const COLLECTIONS = ['phrases', 'paragraphs_kw', 'hype'];
const MAX_DOCS = 50;

/** Pure: paragraph rows + doc → [{ payload, ids }] groups, one per distinct (author, voices). */
export function authorGroups(rows, doc) {
  const groups = new Map();
  for (const r of rows) {
    const author = paragraphAuthor({ authors: r.authors, author: doc.author }) || null;
    const voices = paragraphVoices({ authors: r.authors, author: doc.author }).map(authorKey).filter(Boolean);
    const payload = { author, author_fold: authorKey(author) || null, voices_fold: voices };
    const k = JSON.stringify(payload);
    if (!groups.has(k)) groups.set(k, { payload, ids: [] });
    groups.get(k).ids.push(Number(r.id));
  }
  return [...groups.values()];
}

export async function stampDocsJob({ docs = [], collections = COLLECTIONS } = {}, deps = {}) {
  const { doc: loadDoc = (id) => getDoc(id, { follow: false, fields: ['id', 'author', 'collection', 'religion'] }),
    rows = (id) => authorsInRange(id, 0, 1e9), qd = (path, body) => qdrantRequest(path, body, 120000) } = deps;
  const ids = [...new Set((docs || []).map(Number).filter(Boolean))];
  if (!ids.length) throw new Error('stamp-docs: docs [ids] required');
  if (ids.length > MAX_DOCS) throw new Error(`stamp-docs: at most ${MAX_DOCS} docs a run`);
  const out = { docs: {}, calls: 0, errors: 0 };
  for (const id of ids) {
    const doc = await loadDoc(id);
    if (!doc) { out.docs[id] = { missing: true }; continue; }
    const groups = authorGroups(await rows(id), doc);
    const send = async (c, payload, filter) => {
      try { await qd(`/collections/${c}/points/payload?wait=true`, { payload, filter }); out.calls++; } catch { out.errors++; }
    };
    for (const c of collections) {
      await send(c, { collection: doc.collection ?? null, religion: doc.religion ?? null }, { must: [{ key: 'doc_id', match: { value: id } }] });
      for (const g of groups) for (let i = 0; i < g.ids.length; i += 1000) {
        await send(c, g.payload, { must: [{ key: 'paragraph_id', match: { any: g.ids.slice(i, i + 1000) } }] });
      }
    }
    out.docs[id] = { collection: doc.collection, paragraphs: groups.reduce((n, g) => n + g.ids.length, 0),
      authors: groups.reduce((m, g) => ({ ...m, [g.payload.author]: (m[g.payload.author] || 0) + g.ids.length }), {}) };
  }
  return out;
}
