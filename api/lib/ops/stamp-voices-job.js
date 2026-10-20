// STAMP VOICES (Chad 10-19: "If some scholar like Mazindarani quotes the Báb on some topic, I want it to be findable when
// someone asks 'What did the Báb say about X'"). Every Qdrant point of a paragraph that QUOTES someone gets `voices_fold`
// — its author and every quoted voice, folded like author_fold — so the author filter (qdrant-layers.js) finds the Báb
// whether he wrote the paragraph or a scholar quotes him. Payload only (no re-embedding); paragraphs grouped by their exact
// voice set so one call stamps many; the content table read in short id windows. Runs in the INDEXER service after each
// paragraph-authors run. params { span = 100000, collections, after = 0 }. Yields between windows when the service drains,
// returning `resume: { after }` so the requeued run continues there.
import { quotedVoiceRows, maxContentId } from '../paragraphs-repo.js';
import { paragraphVoices } from '../authorship/effective.js';
import { authorKey, qdrantRequest } from '../search/qdrant-layers.js';
import { isDraining } from '../drain.js';

const COLLECTIONS = ['phrases', 'paragraphs_kw', 'hype'];

export async function stampVoicesJob({ span = 100000, collections = COLLECTIONS, after: from = 0 } = {}, deps = {}) {
  const { rows = quotedVoiceRows, top = maxContentId, qd = qdrantRequest, index = ensureIndex, draining = isDraining } = deps;
  for (const c of collections) await index(c).catch(() => {});
  const end = await top();
  const out = { paragraphs: 0, groups: 0, calls: 0, errors: 0 };
  for (let after = Number(from) || 0; after < end; after += span) {
    if (draining()) return { ...out, yielded: true, resume: { after } };
    const groups = new Map();   // voices key → [paragraph ids]
    for (const r of await rows({ afterId: after, span })) {
      const voices = paragraphVoices(r).map(authorKey).filter(Boolean);
      if (voices.length < 2) continue;   // no quoted voice beyond the author: author_fold already covers it
      const k = JSON.stringify(voices);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(Number(r.id));
      out.paragraphs++;
    }
    for (const [k, ids] of groups) {
      out.groups++;
      for (const c of collections) {
        for (let i = 0; i < ids.length; i += 1000) {
          try {
            await qd(`/collections/${c}/points/payload?wait=false`, { payload: { voices_fold: JSON.parse(k) }, filter: { must: [{ key: 'paragraph_id', match: { any: ids.slice(i, i + 1000) } }] } });
            out.calls++;
          } catch { out.errors++; }
        }
      }
    }
    await new Promise((r) => setTimeout(r, 25));   // a breath between windows: the API and the writer share the database
  }
  return out;
}

/** A keyword payload index on voices_fold, so the filter is an index lookup (idempotent). */
async function ensureIndex(collection) {
  await fetch(`${process.env.QDRANT_URL || 'http://127.0.0.1:6333'}/collections/${collection}/index?wait=false`, { method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.QDRANT_KEY || '' }, body: JSON.stringify({ field_name: 'voices_fold', field_schema: 'keyword' }) });
}
