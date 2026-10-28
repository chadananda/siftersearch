// "Published" means rendered AND searchable (Chad 10-28): the document exists in the live scope and its search points exist in Qdrant.
// → { live, doc, points } ; points null = Qdrant unreachable (unknown, never "live").
export async function isLive(docId, { getDoc, count } = {}) {
  const get = getDoc || (await import('../../docs-repo.js')).getDoc;
  const cnt = count || (await import('../../repos/coverage-repo.js')).qdrantCount;
  if (!docId) return { live: false, doc: false, points: 0 };
  const doc = await get(docId, { scope: 'live', follow: false }).catch(() => null);
  if (!doc) return { live: false, doc: false, points: 0 };
  const [kw, ph] = await Promise.all([cnt('paragraphs_kw', docId), cnt('phrases', docId)]);
  if (kw == null && ph == null) return { live: false, doc: true, points: null };
  const points = (kw || 0) + (ph || 0);
  return { live: points > 0, doc: true, points };
}
export const docUrl = (docId) => `https://siftersearch.com/document/${Number(docId)}`;
