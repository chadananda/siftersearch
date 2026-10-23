// SPEAKER GALLERIES (Chad 10-23: "numerous photos of each speaker so we can rotate them and never be at a loss for an image").
// Several verified photos per person (the media_speakers key), ordered, rank 0 = primary, each with its own credit. The
// curated list is data/media-speaker-gallery.json (built by scripts/media/speaker_gallery_*); originals live once in the
// cdn-assets R2 bucket and every crop comes from the image worker (fo-face). Pure: shaping, diffing, validation.

export const CDN = 'https://siftersearch.com/img/cdn/siftersearch.com/';
export const photoUrl = (file, sha) => `${CDN}${file}?v=${String(sha).slice(0, 16)}`;

/** One manifest entry is usable: an R2 file under media-speakers/, a sha, and where it came from. → error text or null */
export function entryProblem(e) {
  if (!e || typeof e !== 'object') return 'not an object';
  if (!/^(media-speakers|biography)\/[A-Za-z0-9._\-/]+\.(jpe?g|png|webp)$/i.test(e.file || '')) return `bad file ${e.file}`;
  if (!/^[0-9a-f]{16,64}$/.test(e.sha || '')) return 'bad sha';
  if (!e.origin) return 'no origin';
  if (!e.source_url && !e.page_url && e.origin !== 'current-primary') return 'no source';
  return null;
}

/** The manifest → rows per key, in order (rank = position; the entry marked primary first). Invalid entries are reported,
 *  never written. → { rows: Map key → [row], problems: [{ key, i, why }] } */
export function manifestRows(manifest) {
  const rows = new Map(), problems = [];
  for (const [key, list] of Object.entries(manifest?.speakers || {})) {
    if (!/^[a-z0-9-]{2,80}$/.test(key) || !Array.isArray(list)) { problems.push({ key, why: 'bad key or list' }); continue; }
    const ok = [];
    list.forEach((e, i) => { const why = entryProblem(e); if (why) problems.push({ key, i, why }); else ok.push(e); });
    ok.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    const seen = new Set();
    rows.set(key, ok.filter((e) => !seen.has(e.sha) && seen.add(e.sha)).map((e, rank) => ({
      speaker_key: key, sha: e.sha, rank, file: e.file, phash: e.phash || null, width: e.width || null, height: e.height || null,
      face: e.face ? JSON.stringify(e.face) : null, origin: e.origin, source_url: e.source_url || null, page_url: e.page_url || null,
      credit: e.credit || null, licence: e.licence || null, year: Number.isInteger(e.year) ? e.year : null, note: e.note || null, needs_ext: e.needs_ext ? 1 : 0,
    })));
  }
  return { rows, problems };
}

/** What a sync changes for one key: rows to upsert (new, or a changed field) and shas to delete. Pure. */
export function planGallerySync(wanted = [], have = []) {
  const bySha = new Map(have.map((r) => [r.sha, r]));
  const FIELDS = ['rank', 'file', 'phash', 'width', 'height', 'face', 'origin', 'source_url', 'page_url', 'credit', 'licence', 'year', 'note', 'needs_ext'];
  const upserts = wanted.filter((w) => { const h = bySha.get(w.sha); return !h || FIELDS.some((f) => (h[f] ?? null) !== (w[f] ?? null)); });
  const keep = new Set(wanted.map((w) => w.sha));
  return { upserts, deletes: have.filter((h) => !keep.has(h.sha)).map((h) => h.sha) };
}

/** A gallery row → the photo as pages use it (full credit; the extended master only when made from this photo). */
export function shapePhoto(r) {
  const ext = r.ext_file && r.ext_sha ? { url: photoUrl(r.ext_file, r.ext_sha), width: 1152, height: 2048, ai_extended: true, model: r.ext_model || null } : null;
  return { url: photoUrl(r.file, r.sha), extended: ext, width: r.width || null, height: r.height || null, credit: r.credit || null, licence: r.licence || null,
    year: r.year ?? null, origin: r.origin || null, source_url: r.source_url || null, page_url: r.page_url || null };
}

/** A person's gallery, primary first. primary: the speakerThumb of their media_speakers row (kept first when the gallery
 *  does not already hold that photo — every page that showed a portrait before keeps showing it). */
export function speakerGallery(rows = [], primary = null) {
  const list = [...rows].sort((a, b) => a.rank - b.rank).map(shapePhoto);
  // the primary's own extended master serves its gallery copy too (made once, never twice)
  for (const p of list) if (!p.extended && primary?.extended && p.url === primary.url) p.extended = primary.extended;
  if (primary?.url && !list.some((p) => p.url === primary.url)) {
    list.unshift({ url: primary.url, extended: primary.extended || null, width: null, height: null, credit: primary.credit || null, licence: primary.licence || null,
      year: null, origin: 'primary', source_url: primary.source_url || null, page_url: primary.page_url || null });
  }
  return list;
}

/** The compact form for the listing index: [{ u, x?, cr?, y? }] (x = the AI-extended 9:16 master's URL). */
export const compactGallery = (list) => list.map((p) => ({ u: p.url, ...(p.extended ? { x: p.extended.url } : {}), ...(p.credit ? { cr: p.credit.slice(0, 120) } : {}), ...(p.year ? { y: p.year } : {}) }));

/** Coverage counts over people → { people, none, one, two, three_plus } (a person = { photos }). */
export function coverage(people) {
  const c = { people: people.length, none: 0, one: 0, two: 0, three_plus: 0 };
  for (const p of people) { const n = p.photos || 0; if (!n) c.none++; else if (n === 1) c.one++; else if (n === 2) c.two++; else c.three_plus++; }
  return c;
}
