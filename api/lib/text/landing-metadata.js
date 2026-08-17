// Recover a document's REAL title and author from its bahai-library landing page.
//
// 1,605 docs carry filename-derived junk: author 'pdf-b-batebi', title 'batebi_bahais_higher_education',
// and in some cases outright 'PDF Support' / 'Error 404'. Recovery from the document's own text scores 3%.
// But the junk TITLE is a valid slug, and the landing page states both fields properly:
//
//   <h1>The Baha'is and Higher Education in Iran</h1>
//   <h3><a href=".../author/Ahmad_Batebi&type=exact">Ahmad Batebi</a></h3>
//   <h3><a href=".../author/Ahang_Rabbani...">Ahang Rabbani</a><span>, translator</span></h3>
//   <h4>2008-09-02</h4>
//
// Parsed off the MARKUP (the /author/ href is the giveaway) rather than by splitting visible text, because
// "Ahmad Batebi Ahang Rabbani , translator 2008-09-02" cannot be divided reliably by eye and a wrong split
// would write one person's name onto another's book (2026-08-17).

/** A dead slug: bahai-library serves a 200 with an "Error 404" title, so status alone cannot detect it. */
export function isDeadLandingPage(html) {
  const t = titleOf(html);
  return !t || /^error\s*404$/i.test(t.trim());
}

/** Real title: og:title is the most stable, <h1> is the fallback. */
export function titleOf(html) {
  const s = String(html || '');
  const og = s.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)
    || s.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:title"/i);
  if (og && og[1].trim()) return decodeEntities(og[1].trim());
  const h1 = s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h1 ? decodeEntities(stripTags(h1[1])).trim() : null;
}

/**
 * Contributors, in page order, each with the role the page gives it (translator, editor, compiler…).
 * The PRIMARY author is the first contributor carrying NO role — a translator is not the author, and
 * attributing a work to its translator is exactly the kind of quiet wrongness that corrupts a corpus.
 */
export function contributorsOf(html) {
  const out = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  for (const m of String(html || '').matchAll(re)) {
    const block = m[1];
    const a = block.match(/<a[^>]+href="[^"]*\/author\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const name = decodeEntities(stripTags(a[1])).trim();
    if (!name) continue;
    const roleM = block.match(/<span[^>]*>\s*,?\s*([^<]{1,40})<\/span>/i);
    const role = roleM ? roleM[1].replace(/^[\s,]+/, '').trim().toLowerCase() : null;
    out.push({ name, role });
  }
  return out;
}

/** @returns {{title:string|null, author:string|null, contributors:Array, dead:boolean}} */
export function parseLandingMetadata(html) {
  const dead = isDeadLandingPage(html);
  const contributors = dead ? [] : contributorsOf(html);
  const primary = contributors.find((c) => !c.role) || contributors[0] || null;
  return {
    title: dead ? null : titleOf(html),
    author: primary ? primary.name : null,
    contributors,
    dead,
  };
}

const stripTags = (s) => String(s).replace(/<[^>]+>/g, ' ');
const decodeEntities = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ');
