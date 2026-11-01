// The works and authors a question NAMES (plan.mentions from the named-object index, plan.spans its capitalised/quoted spans)
// → the library documents that hold them, so planned-search can fetch each named work's own passages on every route.
// A work = a document whose TITLE the name answers (title-rank tiers); an author = documents whose author is that name.
// Deps: docs-repo findDocuments (docs_fts, SQLite) — injected in tests. Never throws.
import { titleTier, TIER } from '../title-rank.js';
import { keywordAuthor } from '../search-plan.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼʻ`']/g, '').replace(/[^a-z0-9]+/gi, ' ').toLowerCase().trim();
const nWords = (s) => fold(s).split(' ').filter((w) => w.length > 2).length;
const DOCS_PER_WORK = 2, DOCS_PER_AUTHOR = 25, MAX_SCOPES = 4;

/** Rows of findDocuments for a name → the work it names: the best title tier, strict for an unresolved span. Pure. */
export function workDocs(name, docs, { resolved = false } = {}) {
  const tiered = (docs || []).map((d) => ({ d, tier: titleTier(name, d.title) }));
  // a resolved work (the entity index named it) may match its title by all its words ("Íqán" → "The Kitáb-i-Íqán");
  // a bare span must BE the title or begin it with 2+ words ("Lights of Guidance" → "Lights of Guidance: A Bahá'í Reference File")
  const need = resolved ? TIER.ALL_WORDS : nWords(name) >= 2 ? TIER.PREFIX : TIER.EXACT;
  const best = Math.max(0, ...tiered.map((x) => x.tier));
  if (best < need) return [];
  return tiered.filter((x) => x.tier === best).slice(0, DOCS_PER_WORK).map((x) => x.d);
}

/** Rows of findDocuments for a person's name → the documents they WROTE (author field holds the name). Pure. */
export function authorDocs(name, docs) {
  const n = fold(name);
  if (n.length < 4) return [];
  return (docs || []).filter((d) => ` ${fold(d.author)} `.includes(` ${n} `)).slice(0, DOCS_PER_AUTHOR);
}

/**
 * → [{ kind: 'work'|'author', name, docIds, religion }] (≤ 4). Works resolved by the entity index first, then bare spans;
 * a central figure as author is left to the plan's author preference (search-plan AUTHORS).
 */
export async function namedScopes(plan, { find } = {}) {
  const mentions = plan?.mentions || [], spans = plan?.spans || [];
  if (!mentions.length && !spans.length) return [];
  const lookup = find || (async (q, o) => (await import('../docs-repo.js')).findDocuments(q, o));
  const fields = ['id', 'title', 'author', 'religion'];
  const resolvedNames = new Set(mentions.map((m) => fold(m.matched)));
  const asks = [
    ...mentions.filter((m) => m.type === 'work').map((m) => ({ name: m.name, kind: 'work', resolved: true })),
    ...mentions.filter((m) => m.type === 'person' && !keywordAuthor(m.name)).map((m) => ({ name: m.name, kind: 'author' })),
    // a central figure's name is no title ("Shoghi Effendi" would begin a biography's) and no author scope
    ...spans.filter((s) => !resolvedNames.has(fold(s)) && !keywordAuthor(s)).map((s) => ({ name: s, kind: 'span' })),
  ].slice(0, 10);
  const out = [], seen = new Set();
  const found = await Promise.all(asks.map(async (a) => ({ a, docs: (await lookup(a.name, { limit: DOCS_PER_AUTHOR, fields }).catch(() => null))?.docs || [] })));
  for (const { a, docs } of found) {
    let kind = a.kind === 'author' ? 'author' : 'work';
    let hit = kind === 'work' ? workDocs(a.name, docs, { resolved: a.resolved }) : authorDocs(a.name, docs);
    // a bare span that is no title may be a writer ("Augustine", "Plotinus") — not a central figure (the plan prefers those)
    if (!hit.length && a.kind === 'span') { hit = authorDocs(a.name, docs); kind = 'author'; }
    const ids = hit.map((d) => Number(d.id)).filter((id) => id && !seen.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => seen.add(id));
    out.push({ kind, name: a.name, docIds: ids, religion: hit[0]?.religion || null });
    if (out.length >= MAX_SCOPES) break;
  }
  return out;
}

/** The named scopes' own passages joined to the hits: each scope's best passage first (in the order named), then the plan's
 *  leading hits, then each scope's second. Nothing is dropped from `hits` but the tail past `limit`. Pure. */
export function withNamed(hits, perScope, limit = 10) {
  const seen = new Set(), out = [];
  const push = (h) => { if (h && !seen.has(h.id)) { seen.add(h.id); out.push(h); } };
  const lists = (perScope || []).map((l) => (l || []).filter((h) => h?.id != null));
  if (!lists.some((l) => l.length)) return hits;
  lists.forEach((l) => push(l.find((h) => !seen.has(h.id))));
  (hits || []).slice(0, Math.max(2, limit - 2 * lists.length)).forEach(push);
  lists.forEach((l) => push(l.find((h) => !seen.has(h.id))));
  (hits || []).forEach(push);
  return out.slice(0, Math.max(limit, 1));
}
