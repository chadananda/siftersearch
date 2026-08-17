// Treat a web answer as a LEAD for our own retrieval, never as the answer.
//
// Chad, 2026-08-17: "Let's not repeat perplexity results but use those results for our answering logic."
// And: "even if we had gotten the oceanoflights reference correctly from perplexity, we still should have
// translated such a common canonical book into a OceanLibrary link."
//
// The justice miss showed why this matters twice over. Perplexity, asked properly, replies:
//   "'Abdu'l-Bahá … 'Know that justice consists in rendering to each his due' … Some Answered Questions,
//    chapter 'The Justice and Mercy of God'"
// That reply contains the two things our own search was missing: the VERBATIM WORDING (which our corpus can
// match exactly, unlike the user's paraphrase) and the WORK NAME (a book we hold in full). Relaying that prose
// with a bare "here" link is the worst possible use of it — we own the text, so we can cite our own paragraph
// anchor instead of pointing a reader off-site.
//
// So: mine the web answer for search terms, re-query the library, and answer from OUR passage.

/**
 * Quoted phrases in a web answer, longest first — these are candidate verbatim needles for a phrase search.
 * Straight and curly quotes both; markdown bold is stripped, since these answers are usually formatted.
 */
export function extractQuotedPhrases(text) {
  const s = String(text || '').replace(/\*\*/g, '').replace(/[’‘]/g, "'");
  const out = [];
  for (const re of [/"([^"]{12,300})"/g, /[“]([^”]{12,300})[”]/g]) {
    for (const m of s.matchAll(re)) {
      const p = m[1].replace(/\s+/g, ' ').trim().replace(/[…\.]+$/, '').trim();
      // A phrase needs enough words to be a needle rather than a title fragment.
      if (p.split(' ').length >= 4) out.push(p);
    }
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

/**
 * Work titles a web answer names. Italic/bold markdown and backticks are the usual markers; a bare
 * Title Case run is too noisy to trust, so we do not guess at one.
 */
export function extractWorkTitles(text) {
  let s = String(text || '');
  const out = [];
  const keep = (raw) => {
    const t = String(raw).replace(/\s+/g, ' ').trim().replace(/^[“"']|[”"',.]+$/g, '').trim();
    if (!t) return;
    if (/^(chapter|section|page|vol)\b/i.test(t)) return;      // a pointer INTO a work, not the work
    if (t.split(' ').length > 12) return;                       // prose, not a title
    if (!/[a-z]{4}/i.test(t)) return;                           // rejects " in ", "78", punctuation runs
    out.push(t);
  };
  // BOLD FIRST, and REMOVED as we go. Scanning single-asterisk italics over a string that still contains
  // `**` matches across those delimiters, consumes them, and then skips the very title we want — which is how
  // *Some Answered Questions* went missing while " in " was collected instead.
  for (const re of [/\*\*([^*]{2,80})\*\*/g, /__([^_]{2,80})__/g]) {
    s = s.replace(re, (_m, g1) => { keep(g1); return ' '; });
  }
  for (const re of [/\*([^*\n]{2,80})\*/g, /_([^_\n]{2,80})_/g, /`([^`\n]{2,80})`/g]) {
    s = s.replace(re, (_m, g1) => { keep(g1); return ' '; });
  }
  return [...new Set(out)];
}

/** @returns {{phrases:string[], works:string[], usable:boolean}} */
export function extractWebLeads(webText) {
  const phrases = extractQuotedPhrases(webText);
  const works = extractWorkTitles(webText);
  return { phrases, works, usable: phrases.length > 0 || works.length > 0 };
}
