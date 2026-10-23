// Speaker GALLERY picks for pages (Chad 10-23: "numerous photos of each speaker so we can rotate them"). A listing row's
// gallery (g: [{ u, x?, cr?, y? }] from /api/media/index) gives one photo per person per DAY — the same everywhere that day,
// the next one tomorrow, each person offset so a shelf does not change in lockstep. Pure; no fetches.

const h = (s) => { let x = 2166136261; for (const c of String(s)) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
const dayNo = (d) => Math.floor(d.getTime() / 86400_000);

/** The listing row with today's photo as p / px / cr (the row unchanged without a gallery). */
export function dayPick(s, date = new Date()) {
  const g = Array.isArray(s?.g) ? s.g.filter((x) => typeof x?.u === 'string') : [];
  if (g.length < 2) return s;
  const pick = g[(dayNo(date) + h(s.k || s.n || '')) % g.length];
  return { ...s, p: pick.u, px: pick.x || null, cr: pick.cr || null };
}

/** A talk's photos for its one portrait slot: the gallery when the API sent one, else the single portrait. */
export function galleryOf(item) {
  const t = item?.thumb;
  if (!t?.url || t.kind === 'tile') return [];
  const list = Array.isArray(t.gallery) && t.gallery.length ? t.gallery : [t];
  return list.filter((p) => p?.url).map((p) => ({ url: p.url, credit: p.credit || p.artist || null, licence: p.licence || null, year: p.year ?? null,
    source_url: p.source_url || null, page_url: p.page_url || null }));
}

/** Where the rotation starts for this person today (the same day-offset rule as dayPick). */
export const dayIndex = (key, n, date = new Date()) => (n > 1 ? (dayNo(date) + h(key || '')) % n : 0);
