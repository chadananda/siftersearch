// bio-slug-repo — graph_entities.slug + bio_slug_aliases (migration 182): the store behind biography URLs.
// Writes are one-row UPDATE/INSERTs through the single writer. Deps: db.js, bio-slug.js, entity-live.js.
import { query, queryAll, queryOne } from '../db.js';
import { LIVE_SQL } from '../entity-live.js';
import { slugService, birthYear } from '../bio-slug.js';

export const bioSlugStore = {
  async entity(id) {
    const r = await queryOne(`SELECT ge.id, ge.canonical_name AS name, ge.slug, er.dates FROM graph_entities ge
      LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.id = ? AND ${LIVE_SQL('ge.')}`, [id], 'bio-slug:entity');
    return r ? { id: r.id, name: r.name, slug: r.slug || null, born: birthYear(r.dates) } : null;
  },
  async ownerCurrent(slug) { return (await queryOne('SELECT id FROM graph_entities WHERE slug = ?', [slug], 'bio-slug:owner'))?.id ?? null; },
  async aliasOf(slug) { return (await queryOne('SELECT entity_id AS id FROM bio_slug_aliases WHERE slug = ?', [slug], 'bio-slug:alias'))?.id ?? null; },
  async owner(slug) { return (await this.ownerCurrent(slug)) ?? (await this.aliasOf(slug)); },
  async claim(id, slug) {
    try { const r = await query('UPDATE graph_entities SET slug = ? WHERE id = ? AND slug IS NULL', [slug, id], 'bio-slug:claim'); return Number(r?.rows?.[0]?.changes ?? 1) > 0; }
    catch (e) { if (/unique|constraint/i.test(e.message)) return false; throw e; }
  },
  async swap(id, slug) { try { await query('UPDATE graph_entities SET slug = ? WHERE id = ?', [slug, id], 'bio-slug:swap'); return true; } catch (e) { if (/unique|constraint/i.test(e.message)) return false; throw e; } },
  async addAlias(slug, id) { await query('INSERT OR IGNORE INTO bio_slug_aliases (slug, entity_id) VALUES (?, ?)', [slug, id], 'bio-slug:add-alias'); },
};
export const bioSlugs = slugService(bioSlugStore);
export const resolveBioKey = (key) => bioSlugs.resolve(key);
export const ensureBioSlug = (id) => bioSlugs.ensureSlug(id);

/** id → slug for these ids (already minted only; no writes). */
export async function slugsFor(ids) {
  const list = [...new Set(ids.map(Number).filter(Boolean))]; const out = new Map();
  for (let i = 0; i < list.length; i += 400) {
    const part = list.slice(i, i + 400);
    for (const r of await queryAll(`SELECT id, slug FROM graph_entities WHERE slug IS NOT NULL AND id IN (${part.map(() => '?').join(',')})`, part, 'bio-slug:for')) out.set(r.id, r.slug);
  }
  return out;
}

/** The next `limit` live biography people without a slug (the people the browser lists), for the batched backfill. */
export async function unslugged(ids, limit = 25) {
  const list = ids.map(Number).filter(Boolean); const have = await slugsFor(list);
  return list.filter((i) => !have.has(i)).slice(0, limit);
}
