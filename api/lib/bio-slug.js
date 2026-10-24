// Biography page slugs: /biography/<slug> from the entity's canonical full name. Pure logic + a store-injected service
// (repo: repos/bio-slug-repo.js). A slug is minted ONCE and never regenerated; old slugs live on as aliases (301).
const FOLD = { 'ł': 'l', 'đ': 'd', 'ø': 'o', 'ı': 'i', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'þ': 'th', 'ð': 'd' };
const MARKS = /[ʻʼʿʾ‘’‛ʹ'`´]/g;   // ʻ ʼ ʿ ʾ ‘ ’ ‛ ʹ ' ` ´ — dropped, never a word break (ʻAbdu’l → abdul)

/** Canonical full name → ascii-folded, lowercase, hyphenated slug (≤ 80 chars, never purely numeric, never empty). */
export function slugify(name) {
  let s = String(name ?? '').replace(/\([^)]*\)/g, ' ').replace(/⟨[^⟩]*⟩/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(MARKS, '').replace(/[łđøıæœßþð]/g, (c) => FOLD[c])
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 80) s = s.slice(0, 80).replace(/-[^-]*$/, '') || s.slice(0, 80);
  if (!s) s = 'person';
  return /^\d+$/.test(s) ? `person-${s}` : s;
}

/** Best-effort birth year from entity_research.dates (JSON array of strings/objects), else null. */
export function birthYear(datesRaw) {
  let d = datesRaw; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return null; } }
  for (const it of Array.isArray(d) ? d : []) {
    const t = typeof it === 'string' ? it : JSON.stringify(it);
    if (!/\b(born|birth|b\.)/i.test(t)) continue;
    const m = t.match(/\b(\d{3,4})\b/); if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Slug service over a store { entity(id) → {id,name,slug,born}|null (null = no live page), owner(slug) → id|null (current slug OR alias),
 * claim(id,slug) → bool (set only while the row has none; false on a unique clash), aliasOf(slug) → id|null, addAlias(slug,id),
 * swap(id,slug) → bool }.
 */
export function slugService(store) {
  async function ensureSlug(id) {
    const e = await store.entity(Number(id));
    if (!e) return null;
    if (e.slug) return e.slug;                 // stable: a name change never regenerates
    const base = slugify(e.name);
    const tries = [base, ...(e.born ? [`${base}-${e.born}`] : [])];
    for (let n = 2; n < 60; n++) tries.push(`${base}-${n}`);
    for (const cand of tries) {
      if (await store.owner(cand)) continue;
      if (await store.claim(e.id, cand)) return cand;
      const again = await store.entity(e.id); if (again?.slug) return again.slug;   // a concurrent request won
    }
    const last = `${base}-${e.id}`; await store.claim(e.id, last); return last;
  }
  /** Change a person's slug on purpose: the old one becomes an alias that 301s here. */
  async function renameSlug(id, newSlug) {
    const e = await store.entity(Number(id)); if (!e) return null;
    const next = slugify(newSlug); if (e.slug === next) return next;
    const o = await store.owner(next); if (o && o !== e.id) throw new Error(`slug ${next} belongs to ${o}`);
    if (e.slug) await store.addAlias(e.slug, e.id);
    if (!(await store.swap(e.id, next))) throw new Error('slug swap failed');
    return next;
  }
  /** key (numeric id | current slug | old slug) → { kind:'id'|'current'|'alias', id, slug } | null */
  async function resolve(key) {
    const k = String(key ?? '').trim().toLowerCase();
    if (/^\d+$/.test(k)) { const slug = await ensureSlug(Number(k)); return slug ? { kind: 'id', id: Number(k), slug } : null; }
    if (!/^[a-z0-9-]{1,100}$/.test(k)) return null;
    const cur = await store.ownerCurrent(k);
    if (cur) return { kind: 'current', id: cur, slug: k };
    const a = await store.aliasOf(k); if (!a) return null;
    const slug = await ensureSlug(a); return slug ? { kind: 'alias', id: a, slug } : null;
  }
  return { ensureSlug, renameSlug, resolve };
}
