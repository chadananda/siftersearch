// Search TARGET: a query that names a person or place ("iderne", "Edirne", "Adrianople") is resolved to that entity,
// and search + highlighting follow the ENTITY, not the typed string (Chad, 2026-09-27: "searching for iderne should
// return results for adrianople highlighted. The highlighting should be the search target, not a string match").
// Names come from the texts: the surfaces the corpus's own mentions use for the entity, plus recorded aliases. Recall
// is the transliteration-invariant lookup (so a misspelling still lands); a candidate becomes the target only when it
// is clearly ahead — otherwise search carries on unchanged, never guessing. Deps: entity-api (lookup), read pool
// (entity-names-repo on a thread). Entity names are cached per process AND in data/run/entity-names.json, shared by all
// API processes (O_EXCL lock, like excluded-docs.js): the surface count is a ~1 s statement for a well-mentioned entity
// and names change only with the entity pipeline.
import fs from 'node:fs';
import path from 'node:path';
import { skeletonKeys } from './translit-key.js';

const TTL = Number(process.env.ENTITY_NAMES_TTL_MS) || 12 * 60 * 60 * 1000;
const SHARED_MAX = 5000, LOCK_STALE_MS = 30_000;
// Tests get no shared file unless they set one (_setSharedPath), so a test run never writes into data/run.
const IN_TEST = !!process.env.VITEST || process.env.NODE_ENV === 'test';
let SHARED = process.env.ENTITY_NAMES_CACHE || (IN_TEST ? null : path.resolve(new URL('.', import.meta.url).pathname, '../../data/run/entity-names.json'));
export const _setSharedPath = (p) => { SHARED = p; sharedSeen = { mtime: 0, map: {} }; };
const namesCache = new Map();
export const clearTargetCache = () => { namesCache.clear(); sharedSeen = { mtime: 0, map: {} }; };
let sharedSeen = { mtime: 0, map: {} };
/** The shared file's entries ({ id: { at, v } }); re-parsed only when another process has rewritten it. */
function readShared() {
  if (!SHARED) return sharedSeen.map;
  try {
    const { mtimeMs } = fs.statSync(SHARED);
    if (mtimeMs !== sharedSeen.mtime) sharedSeen = { mtime: mtimeMs, map: JSON.parse(fs.readFileSync(SHARED, 'utf8')) || {} };
  } catch { /* none yet / torn — the per-process cache still works */ }
  return sharedSeen.map;
}
/** Merge fresh entries into the shared file. Whoever holds the lock writes; a busy lock skips (the entries are still in
 *  this process's cache, and the next miss elsewhere writes them). Never throws. */
export function writeShared(entries) {
  if (!SHARED) return false;
  const lock = `${SHARED}.lock`;
  try { if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmSync(lock, { force: true }); } catch { /* no lock */ }
  let fd;
  try { fs.mkdirSync(path.dirname(SHARED), { recursive: true }); fd = fs.openSync(lock, 'wx'); } catch { return false; }
  try {
    const now = Date.now();
    const map = Object.fromEntries(Object.entries({ ...readShared(), ...entries }).filter(([, e]) => now - (e?.at || 0) < TTL)
      .sort((a, b) => b[1].at - a[1].at).slice(0, SHARED_MAX));
    fs.writeFileSync(`${SHARED}.tmp`, JSON.stringify(map));
    fs.renameSync(`${SHARED}.tmp`, SHARED);
    return true;
  } catch { return false; } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}
const QWORDS = new Set(['who', 'what', 'where', 'when', 'was', 'is', 'the', 'about', 'tell', 'me', 'in', 'at', 'of', 'history', 'city', 'place', 'person']);
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ'‘’`´]/g, '').toLowerCase().trim();

/** The words of a query that could be a name (question words dropped). A long query is not a name lookup. */
export function nameOf(query) {
  const words = String(query || '').replace(/[?!.,]/g, ' ').split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !QWORDS.has(fold(w)));
  return kept.length >= 1 && kept.length <= 4 && words.length <= 7 ? kept.join(' ') : null;
}

/**
 * Pick the target from lookup candidates. Pure. Each candidate: { id, name, type, mentions, names:[…] }.
 * `mentions` = the entity's weight in the texts (mentions + claims pointing at it). Exact spelling (any of its names)
 * beats a sound-alike; among equals the entity the texts use most. A sound-alike
 * wins only when it is clearly ahead (3× the mentions of the next) — "iderne" → Adrianople over Boris Dorn.
 */
export function pickTarget(name, cands) {
  const q = fold(name);
  const qk = [...skeletonKeys(name)].sort().join('|');
  // Eligible only by one of the candidate's OWN names: spelled exactly like the query, or the same WHOLE sound-key set
  // ("iderne" ≡ "Edirne"). Sharing one key is not enough — that made "iderne" Ṭáhirih, and "adrianople" Khurshíd Páshá
  // (alias "governor of Adrianople") when it was live-tested on 2026-09-27.
  const scored = cands.map((c) => {
    const names = [c.name, ...(c.names || [])];
    const via = names.filter((n) => [...skeletonKeys(n)].sort().join('|') === qk).map(fold);
    return { ...c, exact: names.some((n) => fold(n) === q), sound: !!(qk && via.length), via };
  }).filter((c) => c.exact || (c.sound && (c.mentions || 0) > 0));
  if (!scored.length) return null;
  const canon = (c) => fold(c.name.replace(/\s*\([^)]*\)/g, '')) === q;
  scored.sort((a, b) => Number(b.exact) - Number(a.exact) || (b.mentions || 0) - (a.mentions || 0) || Number(canon(b)) - Number(canon(a)));
  const [top] = scored;
  if (top.exact) return top;
  // Rivals are candidates reached only through DIFFERENT names; records reached through the same name ("Edirne" as a
  // place record and as Adrianople's alias) are one thing recorded twice, not an ambiguity.
  // A record sharing ANY matching spelling with the top ("Adirnih" and "Edirne" both sound like "iderne") is a twin.
  const twin = (c) => c.via.some((v) => top.via.includes(v));
  const rival = scored.find((c) => c !== top && !twin(c));
  // The place is weighed as ONE thing: its twin records' weight counts with it (Edirne 15 + Adrianople 8 were each
  // measured against "Adrienne D." 7 on their own).
  const weight = scored.filter((c) => c === top || twin(c)).reduce((a, c) => a + (c.mentions || 0), 0);
  if (!rival || weight >= 3 * (rival.mentions || 0)) return { ...top, twinsVia: scored.filter((c) => c !== top && twin(c)).map((c) => c.id) };
  return null;
}

/** The names the texts use for an entity: its mention surfaces (Latin and original script) + recorded aliases.
 *  `db` (tests only) runs the three reads in-process through db.queryAll; otherwise they run on a read-pool thread. */
async function namesFor(ids, db) {
  const out = new Map();
  const now = Date.now();
  let shared = null;
  const need = ids.filter((id) => {
    let h = namesCache.get(id);
    if (!(h && now - h.at < TTL)) { shared ??= readShared(); h = shared[id]; if (h && now - h.at < TTL) namesCache.set(id, h); else h = null; }
    if (h) { out.set(id, h.v); return false; }
    return true;
  });
  if (need.length) {
    const { surfaces: surf, aliases: ali, targets: tgt } = db ? await rowsVia(db, need)
      : await (await import('./search/read-pool.js')).runRead('entity:names', need);
    const fresh = {};
    for (const id of need) {
      const s = surf.filter((r) => r.id === id);
      let aliases = [];
      try { const a = JSON.parse(ali.find((r) => r.id === id)?.aliases || '[]'); if (Array.isArray(a)) aliases = a.map(String); } catch { /* none */ }
      // Surfaces used at least twice (a one-off surface is often a pronoun or a slip), plus every recorded alias.
      const names = [...new Set([...s.filter((r) => r.n >= 2 || s.length <= 3).map((r) => String(r.surface).trim()), ...aliases])]
        .filter((n) => n.length >= 3 && !/^(he|she|him|his|her|they|it|this|that|there)$/i.test(n)).slice(0, 12);
      // Places, works and events are rarely bound as mentions (reconcile types them and never applies the decision), so
      // their weight in the texts also counts the claims that point AT them ("exiled to Adrianople").
      const v = { names, mentions: s.reduce((a, r) => a + r.n, 0) + (tgt.find((r) => r.id === id)?.n || 0) };
      const e = { at: Date.now(), v };
      namesCache.set(id, e); out.set(id, v); fresh[id] = e;
    }
    if (!db) writeShared(fresh);
  }
  return out;
}
// Test seam: the same three reads as entity-names-repo.entityNameRows, through an injected db.
async function rowsVia(db, need) {
  const ph = need.map(() => '?').join(',');
  return {
    surfaces: await db.queryAll(`SELECT entity_id id, surface, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IN (${ph}) GROUP BY 1, 2 ORDER BY n DESC`, need),
    aliases: await db.queryAll(`SELECT ge.id, er.aliases FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name AND er.entity_type = ge.entity_type WHERE ge.id IN (${ph})`, need),
    targets: await db.queryAll(`SELECT target_entity_id id, COUNT(*) n FROM entity_claims WHERE target_entity_id IN (${ph}) GROUP BY 1`, need),
  };
}

/** Resolve a query to its target entity, or null. → { id, name, type, names, matched } */
export async function resolveTarget(query, { lookup, db, countText, explain } = {}) {
  const t0 = Date.now();
  const name = nameOf(query);
  if (!name) return null;
  const find = lookup || (await import('./entity-api.js')).entityLookup;
  const cands = (await find(name, { limit: 30 }).catch(() => [])).filter((c) => ['person', 'place', 'event', 'work', 'group'].includes(c.type));
  if (!cands.length) return null;
  const names = await namesFor(cands.map((c) => c.id), db);
  let enriched = cands.map((c) => ({ ...c, ...(names.get(c.id) || { names: [], mentions: 0 }) }));
  // Places and works are seldom bound as mentions, so a sound-alike is also weighed by how often its canonical name
  // actually occurs in the texts (one index count each, only for the few sound-alike candidates).
  const qk = [...skeletonKeys(name)].sort().join('|');
  const count = countText || (async (n) => { try { const { keywordSearch } = await import('./search.js'); return (await keywordSearch(n, { limit: 1 })).estimatedTotalHits || 0; } catch { return 0; } });
  // Every sound-alike (not only the weightless ones) takes the larger of its bound weight and its text count: bound
  // mentions undercount places badly (Adrianople: 8 bound, while the name runs through the histories).
  enriched = await Promise.all(enriched.map(async (c) => ([c.name, ...c.names].some((n) => [...skeletonKeys(n)].sort().join('|') === qk)
    ? { ...c, mentions: Math.max(c.mentions || 0, await count(c.name.replace(/\s*\([^)]*\)/g, '').trim())) } : c)));
  const t = pickTarget(name, enriched);
  // Internal diagnosis only: the candidates as scored, so a miss is read from the data, not guessed at.
  if (explain) explain.cands = enriched.map((c) => ({ id: c.id, name: c.name, type: c.type, mentions: c.mentions, names: c.names, via: c.names && [c.name, ...c.names].filter((n) => [...skeletonKeys(n)].sort().join('|') === qk) })), explain.key = qk;
  if (process.env.SEARCH_TARGET_DEBUG) console.log('[search-target]', name, Date.now() - t0, 'ms', enriched.filter((c) => c.mentions).map((c) => `${c.name}:${c.mentions}`).slice(0, 8).join(' '));
  if (!t) return null;
  // Several records carrying the same exact name are one thing under one spelling (duplicate place records): search and
  // highlight all their names together.
  const q = fold(name);
  const twins = t.exact ? enriched.filter((c) => c.id !== t.id && [c.name, ...c.names].some((n) => fold(n) === q))
    : enriched.filter((c) => (t.twinsVia || []).includes(c.id));
  const all = [t, ...twins].flatMap((c) => [c.name.replace(/\s*\([^)]*\)/g, '').trim(), ...c.names]);
  return { id: t.id, name: t.name, type: t.type, names: [...new Set(all)], matched: name, ...(twins.length ? { twins: twins.map((c) => c.id) } : {}) };
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Highlight the TARGET in a passage — every name of the entity that appears (diacritic-insensitive), not the typed
 * string. Returns HTML-safe text with <mark> around each occurrence, or null when no name of the target is present.
 */
export function markTarget(text, target, { pre = '<mark>', post = '</mark>' } = {}) {
  const src = String(text || '');
  if (!target?.names?.length || !src) return null;
  // Match on a folded copy, then map positions back: diacritics must not stop "Adirnih" matching "Adírnih".
  const foldedChars = [...src].map((ch) => (/\s/.test(ch) ? ' ' : fold(ch)));   // apostrophes fold to nothing
  const folded = foldedChars.join('');
  const map = []; foldedChars.forEach((f, i) => { for (let k = 0; k < f.length; k++) map.push(i); });
  const names = [...new Set(target.names.map(fold).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![\\p{L}])(${names.map(esc).join('|')})(?![\\p{L}])`, 'giu');
  const spans = [];
  for (const m of folded.matchAll(re)) spans.push([map[m.index], map[m.index + m[0].length - 1] + 1]);
  if (!spans.length) return null;
  const chars = [...src];
  const h = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '', at = 0;
  for (const [s, e] of spans) { if (s < at) continue; out += h(chars.slice(at, s).join('')) + pre + h(chars.slice(s, e).join('')) + post; at = e; }
  return out + h(chars.slice(at).join(''));
}
