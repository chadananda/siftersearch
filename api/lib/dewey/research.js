// Dewey's RESEARCH on a wanted work (Chad 10-17: "do research on that book, pull down the image, isbn etc."): OpenLibrary
// (editions, ISBNs, publisher, year, pages, subjects, cover, archive.org scans) and Google Books (description, ISBNs,
// thumbnail), merged; the cover image downloaded. A record is accepted only when its title matches what was asked for —
// a near miss is reported as a candidate, never written as the book's metadata. Network deps injectable for tests.
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { sniffFormat } from '../covers.js';

export const deweyDir = () => process.env.DEWEY_DIR || '/tank/sifter/dewey';
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Same work? — the asked title's words all appear in the record's title (subtitles and articles allowed). */
export const titleMatches = (asked, found) => { const a = fold(asked).replace(/^(the|a|an) /, '').split(' ').filter((w) => w.length > 2); const f = ` ${fold(found)} `; return a.length > 0 && a.every((w) => f.includes(` ${w} `)); };

async function json(fetchImpl, url) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'SifterSearch-Dewey/1.0 (librarian; chadananda@gmail.com)' } }).catch(() => null);
  return r?.ok ? r.json().catch(() => null) : null;
}

export async function researchWork({ title, author }, { fetchImpl = fetch } = {}) {
  const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const [ol, gb] = await Promise.all([
    json(fetchImpl, `https://openlibrary.org/search.json?${q({ title, author, limit: 5, fields: 'key,title,subtitle,author_name,first_publish_year,isbn,publisher,cover_i,number_of_pages_median,subject,language,edition_count,ia' })}`),
    json(fetchImpl, `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent([`intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join('+'))}&maxResults=5`),
  ]);
  const olDoc = (ol?.docs || []).find((d) => titleMatches(title, [d.title, d.subtitle].filter(Boolean).join(' ')));
  const gbVol = (gb?.items || []).map((i) => i.volumeInfo).find((v) => v && titleMatches(title, [v.title, v.subtitle].filter(Boolean).join(' ')));
  const isbns = [...new Set([...(olDoc?.isbn || []), ...(gbVol?.industryIdentifiers || []).map((x) => x.identifier)])];
  const out = {
    matched: !!(olDoc || gbVol),
    title: olDoc?.title || gbVol?.title || null,
    author: olDoc?.author_name?.[0] || gbVol?.authors?.[0] || null,
    isbn13: isbns.find((x) => /^\d{13}$/.test(x)) || null, isbn10: isbns.find((x) => /^\d{9}[\dX]$/.test(x)) || null,
    publisher: olDoc?.publisher?.[0] || gbVol?.publisher || null,
    year: olDoc?.first_publish_year || Number(String(gbVol?.publishedDate || '').slice(0, 4)) || null,
    pages: olDoc?.number_of_pages_median || gbVol?.pageCount || null,
    editions: olDoc?.edition_count || null,
    language: olDoc?.language?.[0] || gbVol?.language || null,
    subjects: (olDoc?.subject || gbVol?.categories || []).slice(0, 12),
    description: gbVol?.description || null,
    sources: [
      olDoc && { kind: 'openlibrary', url: `https://openlibrary.org${olDoc.key}` },
      gbVol?.infoLink && { kind: 'google-books', url: gbVol.infoLink },
      ...(olDoc?.ia || []).slice(0, 5).map((ia) => ({ kind: 'archive.org', url: `https://archive.org/details/${ia}`, pdf: `https://archive.org/download/${ia}/${ia}.pdf` })),
    ].filter(Boolean),
    candidates: !olDoc && !gbVol ? [...(ol?.docs || []).slice(0, 3).map((d) => `${d.title} — ${d.author_name?.[0] || '?'} (${d.first_publish_year || '?'})`)] : [],
    cover: olDoc?.cover_i ? { source: 'openlibrary', url: `https://covers.openlibrary.org/b/id/${olDoc.cover_i}-L.jpg?default=false` }
      : gbVol?.imageLinks?.thumbnail ? { source: 'google-books', url: gbVol.imageLinks.thumbnail.replace('http:', 'https:').replace('&edge=curl', '') } : null,
  };
  return out;
}

/** Download the cover to Dewey's store; → path or null (not an image, or none). */
export async function fetchCover(itemId, cover, { fetchImpl = fetch } = {}) {
  if (!cover?.url) return null;
  const r = await fetchImpl(cover.url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r?.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const fmt = sniffFormat(buf);
  if (!fmt || buf.length < 2000) return null;   // a placeholder pixel is not a cover
  const dir = join(deweyDir(), 'covers');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${Number(itemId)}.${fmt}`);
  await writeFile(path, buf);
  return path;
}
