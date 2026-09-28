// Search TARGET: a query that names a person or place ("iderne", "Edirne", "Adrianople") is resolved to that entity,
// and search + highlighting follow the ENTITY, not the typed string (Chad, 2026-09-27: "searching for iderne should
// return results for adrianople highlighted. The highlighting should be the search target, not a string match").
// Names come from the texts: the surfaces the corpus's own mentions use for the entity, plus recorded aliases. Recall
// is the transliteration-invariant lookup (so a misspelling still lands); a candidate becomes the target only when it
// is clearly ahead — otherwise search carries on unchanged, never guessing. Deps: entity-api (lookup), db.
import { queryAll } from './db.js';

const TTL = 60 * 60 * 1000;
const namesCache = new Map();
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
 * Exact spelling (any of its names) beats a sound-alike; among equals the entity the texts mention most. A sound-alike
 * wins only when it is clearly ahead (3× the mentions of the next) — "iderne" → Adrianople over Boris Dorn.
 */
export function pickTarget(name, cands) {
  const q = fold(name);
  const scored = cands.filter((c) => (c.mentions || 0) > 0).map((c) => ({ ...c, exact: [c.name, ...(c.names || [])].some((n) => fold(n) === q) }));
  if (!scored.length) return null;
  scored.sort((a, b) => Number(b.exact) - Number(a.exact) || (b.mentions || 0) - (a.mentions || 0));
  const [top, next] = scored;
  if (top.exact) return top;
  if (!next || (top.mentions || 0) >= 3 * (next.mentions || 0)) return top;
  return null;
}

/** The names the texts use for an entity: its mention surfaces (Latin and original script) + recorded aliases. */
async function namesFor(ids, db = { queryAll }) {
  const out = new Map();
  const need = ids.filter((id) => { const h = namesCache.get(id); if (h && Date.now() - h.at < TTL) { out.set(id, h.v); return false; } return true; });
  if (need.length) {
    const ph = need.map(() => '?').join(',');
    const surf = await db.queryAll(`SELECT entity_id id, surface, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IN (${ph}) GROUP BY 1, 2 ORDER BY n DESC`, need);
    const ali = await db.queryAll(`SELECT ge.id, er.aliases FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name AND er.entity_type = ge.entity_type WHERE ge.id IN (${ph})`, need);
    for (const id of need) {
      const s = surf.filter((r) => r.id === id);
      let aliases = [];
      try { const a = JSON.parse(ali.find((r) => r.id === id)?.aliases || '[]'); if (Array.isArray(a)) aliases = a.map(String); } catch { /* none */ }
      // Surfaces used at least twice (a one-off surface is often a pronoun or a slip), plus every recorded alias.
      const names = [...new Set([...s.filter((r) => r.n >= 2 || s.length <= 3).map((r) => String(r.surface).trim()), ...aliases])]
        .filter((n) => n.length >= 3 && !/^(he|she|him|his|her|they|it|this|that|there)$/i.test(n)).slice(0, 12);
      const v = { names, mentions: s.reduce((a, r) => a + r.n, 0) };
      namesCache.set(id, { at: Date.now(), v }); out.set(id, v);
    }
  }
  return out;
}

/** Resolve a query to its target entity, or null. → { id, name, type, names, matched } */
export async function resolveTarget(query, { lookup, db } = {}) {
  const name = nameOf(query);
  if (!name) return null;
  const find = lookup || (await import('./entity-api.js')).entityLookup;
  const cands = (await find(name, { limit: 8 }).catch(() => [])).filter((c) => ['person', 'place', 'event', 'work', 'group'].includes(c.type));
  if (!cands.length) return null;
  const names = await namesFor(cands.map((c) => c.id), db);
  const t = pickTarget(name, cands.map((c) => ({ ...c, ...(names.get(c.id) || { names: [], mentions: 0 }) })));
  return t ? { id: t.id, name: t.name, type: t.type, names: [...new Set([t.name.replace(/\s*\([^)]*\)/g, '').trim(), ...t.names])], matched: name } : null;
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
