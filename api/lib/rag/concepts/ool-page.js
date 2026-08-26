// concepts/ool-page — read a whole work from an oceanoflights PAGE rather than its .docx.
//
// Chad, 2026-08-26: "you can always download the page from oceanoflights.org and extract content."
// The page is the better source, because its markup SEPARATES what the .docx flattens:
//
//   .docx  — Aqdas: EN 318 paragraphs vs AR 195. Notes, headings and body run together as plain
//            paragraphs, so the two languages cannot be paired by position.
//   page   — the same work: AR 191 <p> of body, EN's ~211 footnotes sitting in their own
//            `fn-last-paragraph-wrapper` blocks that can simply be removed. What is left is the text.
//
// AND THE ARABIC CARRIES ITS VERSE NUMBERS — "١ انّ اوّل ما کتب الله…" is paragraph 1. That is a
// deterministic anchor, not a similarity guess: the source states which verse each paragraph is.
// Deps: none (regex over HTML; no parser dependency for a shape this fixed).

const PAGE = 'https://oceanoflights.org';
const TIMEOUT_MS = 45000;

const clean = (html) => String(html)
  .replace(/<sup[\s\S]*?<\/sup>/g, '')                 // footnote markers
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

/** Arabic-Indic ٠١٢٣٤٥٦٧٨٩ and Western digits both appear; normalise for parsing. Pure. */
const toWestern = (s) => String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

/**
 * Leading verse number, if the paragraph states one. Returns { n, text } with the number stripped.
 *
 * This is the anchor that makes binding deterministic rather than probabilistic: the source itself says
 * "this is verse 105", so we are not inferring correspondence from similarity.
 */
export function splitVerseNumber(text) {
  const m = toWestern(text).match(/^\s*(\d{1,3})\s+(.+)$/s);
  if (!m) return { n: null, text: String(text).trim() };
  // Strip the number from the ORIGINAL string, not the transliterated one, so the script is preserved.
  const stripped = String(text).replace(/^\s*[\d٠-٩۰-۹]{1,3}\s+/, '').trim();
  return { n: Number(m[1]), text: stripped };
}

/**
 * THE PAGE DECLARES WHETHER IT IS THE ORIGINAL. Read it; do not guess.
 *
 *   نسخه اصل فارسی        — "Persian original text"
 *   النسخة العربية الأصلية — "the original Arabic version"
 *   ترجمه شده / مترجم     — "translated"
 *
 * This matters because preferring Arabic by default is WRONG for a Persian work, and wrong in the way that
 * cannot be detected afterwards. The Secret of Divine Civilization was written in Persian; oceanoflights
 * also publishes an ARABIC TRANSLATION of it, and my ar-first rule would have stored that translation in
 * `original_text` — a translation filed as the original, silently (caught 2026-08-26, Chad pointing at the
 * -fa URL).
 */
export function declaredRole(html) {
  const t = String(html).replace(/<[^>]+>/g, ' ');
  if (/نسخه اصل فارسی|النسخة العربية الأصلية|نسخه اصل عربی|النسخة الأصلية/.test(t)) return 'original';
  if (/ترجمه شده|مترجم|الترجمة/.test(t)) return 'translation';
  return 'unknown';
}

/**
 * Which language of this work is the ORIGINAL, by the site's own declaration.
 * Returns { lang, role } or null when neither page claims to be one.
 */
export async function findOriginalLanguage(stem, { log, langs = ['ar', 'fa'] } = {}) {
  const seen = [];
  for (const lang of langs) {
    try {
      const res = await fetch(`${PAGE}/${stem}-${lang}/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) continue;
      const role = declaredRole(await res.text());
      seen.push({ lang, role });
      if (role === 'original') return { lang, role };
    } catch (err) { log?.warn?.({ stem, lang, err: err.message }, 'ool-page: role probe failed'); }
  }
  // Nothing declared itself the original — say so rather than falling back to a language preference, which
  // is the guess this function exists to remove.
  return seen.find((x) => x.role !== 'translation') ?? null;
}

/** Fetch and extract the body paragraphs of one language of one work. */
export async function fetchPageParagraphs(stem, lang, { log, minLen = 40 } = {}) {
  try {
    const res = await fetch(`${PAGE}/${stem}-${lang}/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    let html = await res.text();
    // Drop footnotes BEFORE collecting paragraphs. In the English Aqdas these are ~211 blocks; left in,
    // they outnumber the text and destroy any correspondence with the original.
    html = html.replace(/<div[^>]*class="[^"]*fn-last-paragraph-wrapper[^"]*"[\s\S]*?<\/div>/g, '')
      .replace(/<li[\s\S]*?<\/li>/g, '');
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => clean(m[1]))
      .filter((t) => t.length >= minLen);
    return paras.map(splitVerseNumber);
  } catch (err) {
    log?.warn?.({ stem, lang, err: err.message }, 'ool-page: fetch failed');
    return null;
  }
}

/**
 * Pair one work's languages by VERSE NUMBER where both sides state one, falling back to position only when
 * BOTH sides are unnumbered and the same length.
 *
 * Numbering is preferred because it is the source's own claim about correspondence. Position is an
 * assumption about it, and this file exists because that assumption failed on exactly this book.
 */
export function pairByVerse(enParas, srcParas) {
  const enByN = new Map();
  for (const p of enParas) if (p.n != null) enByN.set(p.n, p.text);
  const srcByN = new Map();
  for (const p of srcParas) if (p.n != null) srcByN.set(p.n, p.text);

  if (enByN.size && srcByN.size) {
    const rows = [];
    for (const [n, source] of srcByN) {
      const en = enByN.get(n);
      if (en) rows.push({ n, en, source });
    }
    return { rows, basis: 'verse-number' };
  }

  // ONE SIDE NUMBERED (the usual case): the original states its verse numbers and the English page does not.
  // The English list is then read by ORDINAL — index N is verse N, because index 0 is the unnumbered
  // preamble and the numbered verses follow in order.
  //
  // VERIFIED on the Kitáb-i-Aqdas at three points spanning the book (2026-08-26):
  //   ¶1   "The first duty prescribed by God…"            ↔ انّ اوّل ما کتب الله علی العباد عرفان مشرق وحيه
  //   ¶105 "Whoso interpreteth what hath been sent down…" ↔ انّ الّذی يأوّل ما نزّل من سمآء الوحی
  //   ¶190 "It hath been forbidden you to smoke opium"    ↔ قد حرّم عليکم شرب الافيون
  // and "Whoso interpreteth" sits at English index 105 exactly, as the rule requires.
  //
  // Guarded: a verse whose ordinal falls outside the English list is SKIPPED, never wrapped or clamped.
  if (srcByN.size && !enByN.size) {
    const rows = [];
    for (const [n, source] of srcByN) {
      const en = enParas[n]?.text;
      if (en) rows.push({ n, en, source });
    }
    if (rows.length) return { rows, basis: 'source-numbered-english-ordinal' };
  }

  // Neither side numbered: position, and ONLY when the counts agree, so a missing paragraph cannot silently
  // shift the whole book.
  const en = enParas.map((p) => p.text), src = srcParas.map((p) => p.text);
  if (en.length && en.length === src.length) {
    return { rows: en.map((t, i) => ({ n: srcParas[i].n ?? i + 1, en: t, source: src[i] })), basis: 'position' };
  }
  return { rows: [], basis: 'none', reason: `no shared numbering and lengths differ (en ${en.length}, src ${src.length})` };
}
