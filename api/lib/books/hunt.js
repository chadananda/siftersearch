// BOOK METADATA HUNT (Chad 10-23: "go on an ISBN hunt … We have to look for author image, publishing date, Amazon link etc.
// anyway, so might as well find the ISBN while we are at it"). One book → every field with { value, conf, source, evidence }.
// Cheapest first: our own front pages → Open Library (ISBN / search / editions / author) → Google Books → Wikidata/Commons
// (author dates + portrait) → the speaker gallery (an author we already hold verified photos of). Deterministic title/author
// matching; Jev only picks among several matching works. conf 'high' may be applied; anything less goes to review.
// Network + Jev injectable. Deps: rights/isbn, books/publishers, dewey/research (titleMatches).
import { ownIsbn, normalizeIsbn } from '../rights/isbn.js';
import { imprintFromText, publisherClass } from './publishers.js';
import { titleMatches } from '../dewey/research.js';
import { norm } from '../rights/canonical.js';

export const HUNT_VERSION = 'book-hunt-v3';   // v2: citations / also-by / approval lines no longer name the publisher; v3: citation tails, acknowledgements
const UA = 'SifterSearch book metadata (https://siftersearch.com; chadananda@gmail.com)';
const MIN_SHORT = 400;   // the speaker-gallery size gate: a portrait's short side
const GROUP = /\b(and|with|family|group|children|couple|wedding|conference|members|delegates|convention|gathering|meeting|friends|participants|assembly|council|staff|tomb|grave|house|book|cover|letter|signature|map)\b/i;

export async function getJson(fetchImpl, url) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA, Accept: 'application/json' } }).catch(() => null);
  return r?.ok ? r.json().catch(() => null) : null;
}
const F = (value, conf, source, evidence) => (value == null || value === '' ? null : { value, conf, source, evidence: evidence == null ? null : String(evidence).slice(0, 240) });
/** "The Revelation of Bahá’u’lláh, vol. 1: Baghdad 1853-63" → "The Revelation of Bahá’u’lláh, vol. 1" — the part a catalogue shares. */
export const mainTitle = (t) => String(t || '').split(/:|\s[—–-]\s/)[0].replace(/^"+|"+$/g, '').trim();
/** Our author's surname appears among theirs. */
export function authorAgrees(ours, theirs = []) {
  const surnames = norm(ours).split(/\s+/).filter((w) => w.length > 2 && !/^(dr|the|and|editor|compiler|ed|comp|translator)$/.test(w));
  if (!surnames.length) return false;
  const hay = ` ${norm([].concat(theirs).join(' '))} `;
  return surnames.some((w) => hay.includes(` ${w} `));
}
const yearOf = (s) => { const m = String(s || '').match(/(1[5-9]|20)\d{2}/); return m ? Number(m[0]) : null; };

/** Wikidata person → { born, died, image: commons filename, label } */
export async function wikidataPerson(qid, { fetchImpl = fetch } = {}) {
  if (!/^Q\d+$/.test(qid || '')) return null;
  const j = await getJson(fetchImpl, `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const e = j?.entities?.[qid];
  if (!e) return null;
  const c = (p) => e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
  const human = (e.claims?.P31 || []).some((x) => x.mainsnak?.datavalue?.value?.id === 'Q5');
  return { qid, human, label: e.labels?.en?.value || null, born: yearOf(c('P569')?.time), died: yearOf(c('P570')?.time), image: typeof c('P18') === 'string' ? c('P18') : null };
}
/** A Commons file → { url (800px), w, h, credit, licence, page } or null */
export async function commonsImage(file, { fetchImpl = fetch } = {}) {
  if (!file) return null;
  const q = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '800', titles: `File:${file}` });
  const j = await getJson(fetchImpl, `https://commons.wikimedia.org/w/api.php?${q}`);
  const ii = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0];
  if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime || '')) return null;
  const md = ii.extmetadata || {};
  const v = (k) => String(md[k]?.value || '').replace(/<[^>]+>/g, '').trim();
  return { url: ii.thumburl || ii.url, w: ii.width, h: ii.height, credit: (v('Artist') || v('Credit')).slice(0, 200) || null,
    licence: v('LicenseShortName') || v('UsageTerms') || null, page: ii.descriptionurl || null };
}
/** The speaker-gallery verification rules a portrait must pass (size gate, a single person, a licence). → reason or null */
export function portraitProblem(img, file = '') {
  if (!img) return 'no image';
  if (Math.min(img.w || 0, img.h || 0) < MIN_SHORT) return `short side < ${MIN_SHORT}px`;
  if (GROUP.test(String(file).replace(/[_-]/g, ' '))) return 'not a single portrait';
  if (!img.licence) return 'no licence';
  return null;
}

/** Jev picks which candidate work is the book whose first pages we have (only when several match). → index or null */
export async function pickWithJev({ doc, front, candidates }, { jev } = {}) {
  if (!jev || candidates.length < 2) return null;
  const criteria = Object.fromEntries(candidates.map((c, i) => [`c${i}`, `${c.title} — ${(c.author_name || []).join(', ')} (${c.first_publish_year || '?'}; ${(c.publisher || []).slice(0, 3).join(', ')})`]));
  criteria.none = 'none of these is the book';
  const state = `BOOK WE HOLD: "${doc.title}" by ${doc.author}\nITS FIRST PAGES:\n${front.slice(0, 1500)}`;
  const a = await jev({ state, questions: { which: { type: 'choice', instructions: 'Which catalogue record is the book we hold (same work; any edition)?', criteria } } }).catch(() => null);
  const ch = a?.which?.choice ?? a?.which?.value;
  const conf = a?.which?.confidence ?? 0;
  return ch && ch !== 'none' && conf >= 0.6 ? Number(String(ch).slice(1)) : null;
}

/**
 * Hunt one book. doc: { id, title, author, cover_url, purchase_url, isbn, metadata }; paragraphs: its first pages;
 * speakers: [{ key, name, file, sha }] (verified photos). deps: { fetchImpl, jev, photoUrl }.
 * → { version, fields: { isbn13, isbn10, publisher, publisher_class, year, edition, purchase_url, cover, author_image,
 *     author_born, author_died }, held_edition, matched: { via, work, edition }, review, notes }
 */
export async function huntBook({ doc, paragraphs = [], speakers = [] }, deps = {}) {
  const { fetchImpl = fetch, jev = null, photoUrl = null } = deps;
  const fields = {}, notes = [];
  const meta = (() => { try { return typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata || {}; } catch { return {}; } })();
  const front = paragraphs.slice(0, 40).map((p) => p.text || '').join('\n');
  // 1. our own pages: the copyright page names the edition we hold
  const imprint = imprintFromText(paragraphs);
  const own = ownIsbn({ meta, paragraphs });
  if (own) fields.isbn13 = F(own.isbn13, 'high', own.source === 'metadata' ? 'metadata' : 'copyright-page', own.evidence);
  if (imprint.publisher) fields.publisher = F(imprint.publisher.value, 'high', 'copyright-page', imprint.publisher.evidence);
  if (imprint.year) fields.year = F(imprint.year.value, 'high', 'copyright-page', imprint.year.evidence);
  if (imprint.edition) fields.edition = F(imprint.edition.value, 'high', 'copyright-page', imprint.edition.evidence);

  // 2. Open Library: the ISBN's edition, else the work by title + author and its editions
  const title = mainTitle(doc.title);
  let work = null, edition = null, matchConf = null, via = null;
  if (own) {
    edition = await getJson(fetchImpl, `https://openlibrary.org/isbn/${own.isbn13}.json`);
    if (edition && !titleMatches(title, [edition.title, edition.subtitle].filter(Boolean).join(' ')) && !titleMatches(edition.title || '', title)) { notes.push(`OL edition for the ISBN has another title: ${edition.title}`); edition = null; }
    if (edition?.works?.[0]?.key) work = await getJson(fetchImpl, `https://openlibrary.org${edition.works[0].key}.json`);
    if (edition) { matchConf = 'high'; via = 'isbn'; }
  }
  if (!edition) {
    // catalogue spellings vary: diacritics and apostrophes off the title, the author by surname only ("Roy P. Mottahedeh")
    const plain = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['‘’ʼ`]/g, '');
    const surname = norm(String(doc.author || '').split(/[;,(]/)[0]).split(' ').filter((w) => w.length > 2 && !/^(dr|editor|compiler)$/.test(w)).pop();
    const q = new URLSearchParams({ title: plain(title), ...(surname && !/unknown/i.test(doc.author) ? { author: surname } : {}), limit: '8',
      fields: 'key,title,subtitle,author_name,author_key,first_publish_year,isbn,publisher,cover_i,edition_count,language' });
    const s = await getJson(fetchImpl, `https://openlibrary.org/search.json?${q}`);
    const good = (s?.docs || []).filter((d) => titleMatches(title, [d.title, d.subtitle].filter(Boolean).join(' ')) && authorAgrees(doc.author, d.author_name));
    let pick = good.length === 1 ? 0 : null;
    // Open Library often holds one work several times (same title, same author): that is one work — take the fullest record
    const last = (a) => norm(a).split(' ').pop();
    const sameWork = good.length > 1 && new Set(good.map((d) => `${norm(mainTitle(d.title))}|${last((d.author_name || [])[0])}`)).size === 1;
    const fullest = () => good.reduce((b, d, i) => ((d.edition_count || 0) > (good[b].edition_count || 0) ? i : b), 0);
    if (sameWork) pick = fullest();
    if (good.length > 1 && !sameWork) {
      // several: the one our imprint agrees with, else Jev decides (and the match stays below 'high')
      const byPub = good.findIndex((d) => fields.publisher && (d.publisher || []).some((p) => publisherClass(p)?.name === fields.publisher.value));
      pick = byPub >= 0 ? byPub : await pickWithJev({ doc, front, candidates: good }, { jev });
      if (pick != null) notes.push(byPub >= 0 ? 'several works matched; the imprint chose' : 'several works matched; Jev chose');
      else { pick = fullest(); notes.push('several works matched; the fullest record taken (review)'); }
    }
    if (pick != null) {
      const w = good[pick];
      work = { key: w.key, title: w.title, authors: (w.author_key || []).map((k) => ({ author: { key: `/authors/${k}` } })), covers: w.cover_i ? [w.cover_i] : [] };
      matchConf = good.length === 1 || sameWork ? 'high' : 'medium'; via = 'search';
      // which edition we hold: the one whose publisher/year our copyright page names
      const eds = (await getJson(fetchImpl, `https://openlibrary.org${w.key}/editions.json?limit=50`))?.entries || [];
      const withIsbn = eds.filter((e) => (e.isbn_13 || e.isbn_10 || []).length);
      const agrees = (e) => (fields.publisher && (e.publishers || []).some((p) => publisherClass(p)?.name === fields.publisher.value))
        && (!fields.year || Math.abs((yearOf(e.publish_date) || 0) - fields.year.value) <= 1);
      edition = withIsbn.find(agrees) || null;
      if (edition) notes.push('the edition matches our copyright page (publisher + year)');
      else if (withIsbn.length) {
        edition = withIsbn.slice().sort((a, b) => (yearOf(a.publish_date) || 9999) - (yearOf(b.publish_date) || 9999))[0];
        notes.push('an edition of this work — which edition we hold is not known');
        edition = { ...edition, _otherEdition: true };
      }
    }
  }
  if (edition) {
    const isbn = normalizeIsbn((edition.isbn_13 || [])[0] || (edition.isbn_10 || [])[0]);
    const conf = edition._otherEdition || matchConf !== 'high' ? 'medium' : 'high';
    if (isbn && !fields.isbn13) fields.isbn13 = F(isbn, conf, 'openlibrary', `${edition.key || ''} ${(edition.publishers || []).join(', ')} ${edition.publish_date || ''}`.trim());
    if (!fields.publisher && edition.publishers?.[0]) fields.publisher = F(publisherClass(edition.publishers[0])?.name || edition.publishers[0], conf, 'openlibrary', edition.key);
    if (!fields.year && yearOf(edition.publish_date)) fields.year = F(yearOf(edition.publish_date), conf, 'openlibrary', `${edition.key}: ${edition.publish_date}`);
    if (!fields.edition && edition.edition_name) fields.edition = F(edition.edition_name, conf, 'openlibrary', edition.key);
  }

  // 3. Google Books: corroboration, or the record Open Library lacks
  if (!fields.isbn13 || !fields.publisher || !fields.year) {
    const q = fields.isbn13 ? `isbn:${fields.isbn13.value}` : [`intitle:${title}`, doc.author && `inauthor:${doc.author.split(/[;,(]/)[0]}`].filter(Boolean).join('+');
    const g = await getJson(fetchImpl, `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`);
    const vol = (g?.items || []).map((i) => i.volumeInfo).find((v) => v && titleMatches(title, [v.title, v.subtitle].filter(Boolean).join(' ')) && (fields.isbn13 || authorAgrees(doc.author, v.authors)));
    if (vol) {
      const conf = fields.isbn13 ? fields.isbn13.conf : 'medium';
      const ids = vol.industryIdentifiers || [];
      const isbn = normalizeIsbn(ids.find((x) => x.type === 'ISBN_13')?.identifier || ids.find((x) => x.type === 'ISBN_10')?.identifier);
      if (isbn && !fields.isbn13) fields.isbn13 = F(isbn, 'medium', 'google-books', vol.infoLink);
      if (!fields.publisher && vol.publisher) fields.publisher = F(publisherClass(vol.publisher)?.name || vol.publisher, conf, 'google-books', vol.infoLink);
      if (!fields.year && yearOf(vol.publishedDate)) fields.year = F(yearOf(vol.publishedDate), conf, 'google-books', `${vol.infoLink} ${vol.publishedDate}`);
      if (!doc.cover_url && vol.imageLinks?.thumbnail && !fields.cover) fields.cover = F(vol.imageLinks.thumbnail.replace('http:', 'https:').replace('&edge=curl', ''), conf, 'google-books', vol.infoLink);
    }
  }
  if (fields.isbn13) fields.isbn10 = F(isbn10Of(fields.isbn13.value), fields.isbn13.conf, 'derived', 'from the ISBN-13');
  if (fields.publisher) { const c = publisherClass(fields.publisher.value); if (c) fields.publisher_class = F(c.class, fields.publisher.conf, 'publishers.js', c.name); }

  // 4. purchase link: Amazon search by ISBN (a search URL only — no scraping)
  if (fields.isbn13 && !doc.purchase_url) fields.purchase_url = F(`https://www.amazon.com/s?k=${fields.isbn13.value}`, fields.isbn13.conf, 'amazon-search', `ISBN ${fields.isbn13.value}`);
  // 5. cover (only when we lack one): Open Library by ISBN, else the work's cover
  if (!doc.cover_url && !fields.cover) {
    if (fields.isbn13) fields.cover = F(`https://covers.openlibrary.org/b/isbn/${fields.isbn13.value}-L.jpg?default=false`, fields.isbn13.conf, 'openlibrary-covers', `ISBN ${fields.isbn13.value}`);
    else if (work?.covers?.[0] > 0) fields.cover = F(`https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg?default=false`, matchConf || 'medium', 'openlibrary-covers', work.key);
  }

  // 6. the author: a speaker we hold verified photos of; else Open Library's author → Wikidata → Commons portrait
  const sp = speakers.find((s) => s.file && s.sha && norm(s.name) === norm(String(doc.author || '').split(/[;,(]/)[0]));
  if (sp && photoUrl) fields.author_image = F(photoUrl(sp.file, sp.sha), 'high', 'speaker-gallery', `media speaker ${sp.key}`);
  const aKey = work?.authors?.[0]?.author?.key;
  if (aKey && matchConf) {
    const a = await getJson(fetchImpl, `https://openlibrary.org${aKey}.json`);
    if (a && authorAgrees(doc.author, [a.name, a.personal_name].filter(Boolean))) {
      const conf = matchConf;
      if (yearOf(a.birth_date)) fields.author_born = F(yearOf(a.birth_date), conf, 'openlibrary-author', `${aKey}: ${a.birth_date}`);
      if (yearOf(a.death_date)) fields.author_died = F(yearOf(a.death_date), conf, 'openlibrary-author', `${aKey}: ${a.death_date}`);
      const qid = a.remote_ids?.wikidata;
      const p = qid ? await wikidataPerson(qid, { fetchImpl }) : null;
      if (p?.human) {
        if (!fields.author_born && p.born) fields.author_born = F(p.born, conf, 'wikidata', qid);
        if (!fields.author_died && p.died) fields.author_died = F(p.died, conf, 'wikidata', qid);
        if (!fields.author_image && p.image) {
          const img = await commonsImage(p.image, { fetchImpl });
          const why = portraitProblem(img, p.image);
          if (!why) fields.author_image = F(img.url, conf, 'wikidata-p18', `${qid} · ${img.page} · ${img.licence}${img.credit ? ` · ${img.credit}` : ''}`);
          else notes.push(`author portrait rejected: ${why}`);
        }
      }
    }
  }
  const all = Object.values(fields).filter(Boolean);
  const review = all.some((f) => f.conf !== 'high');
  return { version: HUNT_VERSION, fields, held_edition: fields.edition?.value || (fields.year?.source === 'copyright-page' ? `${fields.publisher?.value || '?'} ${fields.year.value}` : null),
    matched: { via, work: work?.key || null, edition: edition?.key || null, conf: matchConf }, review, notes };
}

/** ISBN-13 (978…) → ISBN-10, else null. */
export function isbn10Of(isbn13) {
  const d = String(isbn13 || '');
  if (!/^978\d{10}$/.test(d)) return null;
  const core = d.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return core + (c === 10 ? 'X' : String(c));
}
