// The prayer WORKS of a tradition, from library metadata (title / collection), never one hard-wired book. Deps: docs-repo findDocuments (injected as ctx.deps.findDocuments), tradition-name.
// Not intent: it classifies catalogue rows. A real per-tradition `prayer-books` collection (fetch.collection is not built yet) would replace this ranking.
import { canonicalTradition, RELIGIONS } from './tradition-name.js';

// words a prayer work's title or collection carries across the library's traditions (du‘á’, siddur, yasht, hymn, psalm…)
export const PRAYER_TERMS = ['prayer', 'prayers', 'dua', 'supplication', 'devotion', 'liturgy', 'hymn', 'psalm'];
const KIND = /prayer|\bdu['’‘]?[aá]|supplic|devotion|liturg|hymn|psalm|siddur|ziyarat|munajat|khordeh|yasht|mantra|bhajan|aarti/i;
const FIELDS = ['id', 'title', 'author', 'religion', 'collection', 'language', 'paragraph_count'];
export const TRADITIONS = RELIGIONS.filter((r) => r !== 'Other');

/** A work's prayer score from its title and collection: a "Prayers" book first, then a prayer/devotion/liturgy collection. Pure. */
export const prayerScore = (d) => (/prayers/i.test(d.title || '') ? 5 : /prayer/i.test(d.title || '') ? 4 : 0) + (KIND.test(d.collection || '') ? 2 : 0) + (KIND.test(d.title || '') ? 1 : 0);

/** The prayer works of ONE tradition, best first (score, then size: the big books before single tablets). Talks (collection "Media") are never prayer books. */
// The catalogue changes by ingest, not by turn: one tradition's works are found once per process per hour (the several-traditions path is ~90 FTS reads).
const CACHE = new Map(); const CACHE_MS = 3600_000;
export async function prayerWorksOf(tradition, { findDocuments, language = null, limit = 12 } = {}) {
  const religion = canonicalTradition(tradition);
  if (!religion || !findDocuments) return [];
  const key = `${religion}|${language || ''}|${limit}`, hit = CACHE.get(key);
  if (hit && hit.fn === findDocuments && Date.now() - hit.at < CACHE_MS) return hit.works;
  const works = await findWorks(religion, { findDocuments, language, limit });
  if (works.length) CACHE.set(key, { at: Date.now(), fn: findDocuments, works });
  return works;
}

async function findWorks(religion, { findDocuments, language, limit }) {
  const rows = await Promise.all(PRAYER_TERMS.map((t) => Promise.resolve().then(() => findDocuments(t, { religion, ...(language ? { language } : {}), fields: FIELDS, limit: 200 })).then((r) => r?.docs || []).catch(() => [])));
  const seen = new Map(); for (const d of rows.flat()) if (!seen.has(d.id)) seen.set(d.id, d);
  return [...seen.values()].filter((d) => d.collection !== 'Media' && (d.paragraph_count ?? 1) > 0 && prayerScore(d) > 0)
    .sort((a, b) => prayerScore(b) - prayerScore(a) || (b.paragraph_count ?? 0) - (a.paragraph_count ?? 0)).slice(0, limit).map((d) => ({ ...d, tradition: religion }));
}

/** Every tradition's best prayer work (one each): the interfaith answer when no tradition is known. */
export const prayerWorksAcross = async (deps, { language = null } = {}) => (await Promise.all(TRADITIONS.map((t) => prayerWorksOf(t, { ...deps, language, limit: 1 })))).flat();

/** Which tradition, as units: the tradition named (Jev this turn, conversation, site default — layered upstream into scope) → the named work's tradition → the host default → null (several traditions). Pure. */
export function traditionOf({ tradition = null, workDoc = null, scope = null, defaultTradition = null } = {}) {
  const sc = Array.isArray(scope?.religions_specified) && scope.religions_specified.length === 1 ? scope.religions_specified[0] : scope?.religion;
  const t = tradition || sc || workDoc?.religion || defaultTradition || null;
  return t ? canonicalTradition(t) : null;
}
