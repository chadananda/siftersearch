// BOOK HUNT jobs (Chad 10-23: "go on an ISBN hunt … author image, publishing date, Amazon link"). Four ops jobs:
//   book-hunt          — hunt every BOOK (docType 'book', canonical or not): checkpoint per book in book_hunt, yields to a drain
//                        and resumes. params { limit, redo, ids, pauseMs }
//   book-hunt-apply    — fill EMPTY doc fields from 'high'-confidence finds only (covers downloaded + stored); dry run unless write
//   book-meta-coverage — how many books have an ISBN, publisher, year, purchase link, author image, cover
//   rights-publisher   — Chad's publisher rule: a non-canonical book from a commercial/private press, or with a found ISBN →
//                        encumbered; Bahá'í Publishing Trusts → review (pending). Dry run unless write.
import { huntScanPage, huntRowsByIds, allHuntRows, saveHunt, applyBookMeta, encumberForPublisher } from '../repos/book-hunt-repo.js';
import { frontParagraphs } from '../repos/rights-repo.js';
import { canonicalOf, docType } from '../rights/canonical.js';
import { huntBook, HUNT_VERSION } from '../books/hunt.js';
import { publisherClass } from '../books/publishers.js';
import { isDraining } from '../drain.js';
import { modelFor } from '../model-roles.js';

const parse = (s) => { if (!s) return null; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return null; } };
const isBook = (d) => docType({ ...d, document_type: parse(d.metadata)?.documentType }) === 'book';

/** Every live book, in id order (keyset pages). */
async function* books(page = huntScanPage) {
  for (let afterId = 0; ;) {
    const rows = await page({ afterId, limit: 500 });
    if (!rows.length) return;
    afterId = rows[rows.length - 1].id;
    for (const d of rows) if (isBook(d)) yield d;
  }
}

async function jevClient() {
  if (!process.env.TYPESAFE_API_KEY) return null;
  const { jevFetch } = await import('../systemone.js');
  const f = jevFetch('book-match');
  return async ({ state, questions }) => {
    const r = await f('https://api.typesafe.ai/v1/systemone', { method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('book-match').model, state, questions }) });
    return r.ok ? (await r.json()).answers : null;
  };
}

// retryGoogle: re-hunt only books Google Books never answered (its free quota ran out) and that still lack a high ISBN —
// the daily book-google pulse (reports-worker) queues this after the quota resets; resumable like any hunt.
export async function bookHuntJob({ limit = 1000, redo = false, ids = null, pauseMs = 400, prior = null, retryGoogle = false } = {}, deps = {}) {
  const { page = huntScanPage, rows = huntRowsByIds, front = frontParagraphs, save = saveHunt, hunt = huntBook, draining = isDraining,
    speakers = async () => (await import('../repos/media-repo.js')).listSpeakers(), photoUrl = (await import('../media/gallery.js')).photoUrl,
    jev = await jevClient(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = deps;
  const out = { hunted: 0, skipped_done: 0, errors: 0, review: 0, with: {}, ...(prior || {}) };
  const sp = await speakers().catch(() => []);
  const idSet = ids?.length ? new Set(ids.map(Number)) : null;
  let n = 0;
  for await (const d of books(page)) {
    if (idSet && !idSet.has(d.id)) continue;
    if (n >= limit) break;
    if (retryGoogle) {
      const [have] = await rows([d.id]);
      const f = parse(have?.found);
      // hunts before 10-23 evening did not record Google's answer: unknown counts as unanswered
      if (!f || ['ok', 'not-needed'].includes(f.google) || f.fields?.isbn13?.conf === 'high') { out.skipped_done++; continue; }
    } else if (!redo) {
      const [have] = await rows([d.id]);
      if (have && have.state === 'done' && have.version === HUNT_VERSION) { out.skipped_done++; continue; }
    }
    if (draining()) return { ...out, yielded: true, resume: { limit: limit - n, prior: out } };
    n++;
    try {
      const found = await hunt({ doc: d, paragraphs: await front(d.id, 40), speakers: sp }, { photoUrl, jev });
      await save(d.id, { state: 'done', version: HUNT_VERSION, found, review: found.review });
      out.hunted++; if (found.review) out.review++;
      if (found.google) out[`google_${found.google}`] = (out[`google_${found.google}`] || 0) + 1;
      for (const [k, f] of Object.entries(found.fields)) if (f) out.with[`${k}:${f.conf}`] = (out.with[`${k}:${f.conf}`] || 0) + 1;
    } catch (err) {
      out.errors++;
      await save(d.id, { state: 'error', version: HUNT_VERSION, error: String(err?.message || err).slice(0, 300) }).catch(() => {});
    }
    if (pauseMs) await sleep(pauseMs);   // polite to Open Library / Google / Wikimedia
  }
  return out;
}

/** The fields a hunt row may apply: 'high' confidence only. Pure. → { values, meta, cover } */
export function applicable(found) {
  const f = found?.fields || {};
  const hi = (k) => (f[k]?.conf === 'high' ? f[k] : null);
  const meta = {};
  for (const k of ['isbn13', 'isbn10', 'publisher', 'publisher_class', 'year', 'edition', 'purchase_url', 'author_image', 'author_born', 'author_died', 'cover']) {
    if (hi(k)) meta[k] = { value: hi(k).value, source: hi(k).source, evidence: hi(k).evidence };
  }
  if (found?.held_edition) meta.held_edition = found.held_edition;
  meta.hunt = { version: found?.version, matched: found?.matched || null };
  return {
    values: { isbn: hi('isbn13')?.value, publisher: hi('publisher') ? publisherClass(hi('publisher').value)?.name ?? hi('publisher').value : undefined, pub_year: hi('year')?.value, edition: hi('edition')?.value,
      // a portrait is applied only from our verified speaker gallery; any other goes through the photo audit (face + identity
      // check, copied to our CDN — scripts/books/author_photo_audit.py), never hotlinked (Chad: never the wrong person)
      purchase_url: hi('purchase_url')?.value, author_image: hi('author_image')?.source === 'speaker-gallery' ? hi('author_image').value : undefined },
    meta, cover: hi('cover')?.value || null,
  };
}

export async function bookHuntApplyJob({ write = false, ids = null, sample = 40 } = {}, deps = {}) {
  const { rows = allHuntRows, apply = applyBookMeta, fetchImpl = fetch,
    storeCover = async (id, buf, m) => (await import('../covers.js')).storeCover(id, buf, m),
    setCover = async (id, url) => (await import('../docs-repo.js')).setDocCover(id, url),
    sniff = async (buf) => (await import('../covers.js')).sniffFormat(buf) } = deps;
  const out = { write, rows: 0, would_apply: {}, applied: 0, covers: 0, cover_failed: 0, review: 0 };
  for (const r of await rows()) {
    if (r.state !== 'done' || (ids && !ids.includes(r.doc_id))) continue;
    out.rows++;
    const found = parse(r.found);
    if (r.review) out.review++;
    const { values, meta, cover } = applicable(found);
    for (const [k, v] of Object.entries(values)) if (v != null) out.would_apply[k] = (out.would_apply[k] || 0) + 1;
    if (cover) out.would_apply.cover = (out.would_apply.cover || 0) + 1;
    if ((out.sample ||= []).length < sample && Object.values(values).some((v) => v != null)) out.sample.push({ doc_id: r.doc_id, ...values, cover, evidence: Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'hunt').map(([k, v]) => [k, v?.evidence ?? v])) });
    if (!write) continue;
    if (Object.values(values).some((v) => v != null) || Object.keys(meta).length) { await apply(r.doc_id, { ...values, meta }); out.applied++; }
    if (cover) {
      try {
        const res = await fetchImpl(cover, { signal: AbortSignal.timeout(20000) });
        const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
        if (!buf || buf.length < 2000 || !(await sniff(buf))) throw new Error('not a cover image');
        const s = await storeCover(r.doc_id, buf, { source: meta.cover?.source || 'book-hunt', url: cover });
        await setCover(r.doc_id, s.url); out.covers++;
      } catch { out.cover_failed++; }
    }
  }
  return out;
}

export async function bookMetaCoverageReport(_params = {}, deps = {}) {
  const { page = huntScanPage, rows = allHuntRows } = deps;
  const hunted = new Map((await rows()).map((r) => [r.doc_id, r]));
  const blank = () => ({ books: 0, isbn: 0, publisher: 0, pub_year: 0, purchase_url: 0, author_image: 0, cover: 0, hunted: 0 });
  const out = { canonical: blank(), noncanonical: blank() };
  for await (const d of books(page)) {
    const o = out[canonicalOf(d).canonical ? 'canonical' : 'noncanonical'];
    o.books++;
    if (d.isbn) o.isbn++; if (d.publisher) o.publisher++; if (d.pub_year) o.pub_year++; if (d.purchase_url) o.purchase_url++;
    if (d.author_image) o.author_image++; if (d.cover_url) o.cover++; if (hunted.has(d.id)) o.hunted++;
  }
  return out;
}

/**
 * Chad's publisher rule over the hunted books (non-canonical only): → { would_encumber, review, by_reason, by_publisher,
 * sample (20 with evidence), george_ronald (all) }. A finding counts at 'high' confidence, or at 'medium' when it is a publisher
 * our own copyright page names. write: encumbers the would_encumber list (never un-encumbers).
 */
export async function rightsPublisherJob({ write = false, samples = 20, random = Math.random } = {}, deps = {}) {
  const { page = huntScanPage, rows = allHuntRows, encumber = encumberForPublisher } = deps;
  const hunted = new Map((await rows()).map((r) => [r.doc_id, parse(r.found)]));
  const out = { write, books: 0, noncanonical: 0, already_encumbered: 0, would_encumber: 0, review: 0, no_evidence: 0, institutional: 0,
    by_reason: {}, by_publisher: {}, encumbered_now: 0 };
  const flagged = [], review = [], gr = [], inst = [];
  for await (const d of books(page)) {
    out.books++;
    if (canonicalOf(d).canonical) continue;
    out.noncanonical++;
    const f = hunted.get(d.id)?.fields || {};
    const pub = f.publisher && (f.publisher.conf === 'high' || f.publisher.source === 'copyright-page') ? f.publisher : null;
    // a Publishing Trust / institution named at ANY confidence holds the book back from an ISBN-only encumbrance (review, not guess)
    const anyCls = f.publisher ? publisherClass(f.publisher.value)?.class || null : null;
    const cls = pub ? publisherClass(pub.value)?.class || null : ['review', 'institutional'].includes(anyCls) ? anyCls : null;
    const isbn = f.isbn13?.conf === 'high' ? f.isbn13 : null;
    const row = { id: d.id, title: d.title, author: d.author, collection: d.collection, publisher: (pub || f.publisher)?.value || null, publisher_class: cls,
      isbn: isbn?.value || null, evidence: (pub || f.publisher)?.evidence || isbn?.evidence || null, source: (pub || f.publisher)?.source || isbn?.source || null };
    if (publisherClass(pub?.value)?.name === 'George Ronald') gr.push({ ...row, encumbered: !!d.encumbered });
    if (cls === 'review') { out.review++; review.push(row); continue; }
    if (cls === 'institutional') { out.institutional++; inst.push(row); continue; }
    const reason = cls === 'commercial' ? 'publisher-commercial' : isbn ? 'isbn-noncanonical' : null;
    if (!reason) { out.no_evidence++; continue; }
    if (d.encumbered) { out.already_encumbered++; continue; }
    out.would_encumber++;
    out.by_reason[reason] = (out.by_reason[reason] || 0) + 1;
    if (pub) { const nm = publisherClass(pub.value)?.name || pub.value; out.by_publisher[nm] = (out.by_publisher[nm] || 0) + 1; }
    flagged.push({ ...row, reason });
    if (write) { const r = await encumber(d.id, reason); if (r.changed) out.encumbered_now++; }
  }
  const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
  return { ...out, sample: pick(flagged, samples), george_ronald: gr, review_list: review, institutional_list: inst, flagged_ids: flagged.map((x) => x.id), flagged_all: flagged };
}

/** The applied author photos with their evidence (the photo audit's input). */
export async function bookAuthorPhotosReport(_p = {}, deps = {}) {
  const { rows = (await import('../repos/book-hunt-repo.js')).authorPhotoRows } = deps;
  const list = (await rows()).map((r) => ({ id: r.id, title: r.title, author: r.author, url: r.author_image, meta: parse(r.meta) }));
  return { count: list.length, photos: list };
}

/** The photo audit's verdicts → docs (Chad's rule: never an image of the wrong person; no hotlinks).
 *  params { fixes: [{ id, url | null, evidence: { source, credit, licence, check } }], write } — dry run unless write. */
export async function bookAuthorPhotoSetJob({ fixes = [], write = false } = {}, deps = {}) {
  const { set = (await import('../repos/book-hunt-repo.js')).setAuthorImage } = deps;
  const out = { write, replaced: 0, removed: 0, invalid: [] };
  for (const f of fixes) {
    if (!Number.isInteger(f?.id) || (f.url != null && !/^https:\/\/siftersearch\.com\/img\/cdn\/siftersearch\.com\//.test(f.url))) { out.invalid.push(f?.id ?? null); continue; }
    if (write) await set(f.id, f.url ?? null, f.evidence || null);
    if (f.url) out.replaced++; else out.removed++;
  }
  return out;
}
