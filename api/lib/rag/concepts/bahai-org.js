// concepts/bahai-org — read an authoritative text's ORIGINAL from bahai.org's library.
//
// Chad, 2026-08-26, supplying the source himself: "Here is Some Answered Questions:
// https://www.bahai.org/fa/library/authoritative-texts/abdul-baha/some-answered-questions/5#464216225"
//
// Needed because oceanoflights publishes only the ENGLISH of this work (its -ar and -fa pages 404), and
// Some Answered Questions is the one core-roster book still without an original.
//
// WHY THE NUMBER IS THE FILTER: bahai.org numbers every body paragraph and numbers nothing else. The page
// furniture around the text ("مجموعه‌ای از متن گفتگوهای…", the copy-with-citation instructions, the table of
// contents) is prose in the same script inside the same tags, so no length or language rule separates it —
// but none of it is numbered. Keeping only numbered paragraphs takes the text and leaves the chrome, with
// no allow-list of CSS classes to rot when the site is redesigned.
//
// The numbers restart per chapter, so they are a FILTER here, not a key.
// Deps: none (regex over static HTML; these pages are server-rendered).

const HOST = 'https://www.bahai.org';
const TIMEOUT_MS = 45000;
const UA = 'Mozilla/5.0 (compatible; SifterSearch/1.0; +https://siftersearch.com)';

const clean = (html) => String(html)
  .replace(/<sup[\s\S]*?<\/sup>/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

/** Persian/Arabic-Indic digits at the head of a body paragraph, and the text with the number removed. */
export function splitParagraphNumber(text) {
  const m = String(text).match(/^\s*([۰-۹٠-٩]+)\s+(.+)$/s);
  if (!m) return { n: null, text: String(text).trim() };
  const digits = m[1].replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  return { n: Number(digits), text: m[2].trim() };
}

/** The numbered body paragraphs of one section. Unnumbered blocks are page chrome and are dropped. */
export function bodyParagraphs(html) {
  return [...String(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => clean(m[1]))
    .map(splitParagraphNumber)
    .filter((p) => p.n != null && p.text.length > 20);
}

/**
 * Every numbered paragraph of a work, in order, across its sections.
 *
 * Sections with NO numbered paragraphs are front matter (title page, prefaces, the publisher's note) and
 * fall out on their own — which is why the section list can be a plain range rather than a curated one.
 */
export async function fetchWorkParagraphs(path, { lang = 'fa', sections = 12, log } = {}) {
  // CONCURRENT, and not as an optimisation. Twelve serial fetches cost ~35 seconds before the model is even
  // called, and the tunnel in front of this API closes the connection at ~125s — so the fetch alone was
  // spending a quarter of the budget for the whole request. Order is restored from the section number.
  const results = await Promise.all(Array.from({ length: sections }, async (_, i) => {
    const n = i + 1;
    try {
      const res = await fetch(`${HOST}/${lang}/library/authoritative-texts/${path}/${n}`,
        { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return { n, status: res.status, paras: [] };
      const paras = bodyParagraphs(await res.text());
      return { n, paras, words: paras.reduce((a, p) => a + p.text.split(/\s+/).length, 0) };
    } catch (err) {
      log?.warn?.({ path, lang, n, err: err.message }, 'bahai-org: section fetch failed');
      return { n, error: err.message, paras: [] };
    }
  }));
  results.sort((a, b) => a.n - b.n);
  return {
    paragraphs: results.flatMap((r) => r.paras),
    perSection: results.map(({ paras, ...rest }) => ({ ...rest, paragraphs: paras.length })),
  };
}
