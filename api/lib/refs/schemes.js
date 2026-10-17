// Traditional references (Chad 10-17: "all books with traditional referencing should get support for traditional
// referencing … Hidden Words get traditional numbering"). A SCHEME turns one work's paragraphs into the number a reader
// cites (block_attrs.pn — the reader margin and the citation index read it). Each scheme is checked against the work's
// known totals and refuses to number a copy that does not match: a wrong number is worse than none. Interim: OceanLibrary
// display ids carry exactly this numbering but are not exported yet. Pure: paragraphs in reading order in, pn[] out.

/** The Hidden Words (Bahá'u'lláh): Arabic 1–71, Persian 1–82. A saying opens with its address ("O Son of Spirit!",
 *  "Alas! Alas! O Lovers of Worldly Desire!"); a lead-in ("In the eighth of the most holy lines … He saith:") belongs to
 *  the saying it introduces; continuation paragraphs keep their saying's number; the invocation and the closing passage
 *  have none. English part headings: "From the Arabic" / "From the Persian". */
export function hiddenWords(paras) {
  const OPENS = /^\s*(O\s|Alas!)/;
  const CLOSING = /^\s*The mystic and wondrous Bride\b/;
  const LEAD_IN = /^\s*In the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|\w+) (of the most holy )?lines?\b/i;
  const pn = new Array(paras.length).fill(null);
  const count = { Arabic: 0, Persian: 0 };
  let current = null;
  for (let i = 0; i < paras.length; i++) {
    const part = /arabic/i.test(paras[i].heading || '') ? 'Arabic' : /persian/i.test(paras[i].heading || '') ? 'Persian' : null;
    if (!part) { current = null; continue; }
    const text = String(paras[i].text || '');
    if (CLOSING.test(text)) { current = null; continue; }   // the closing passage is not a saying
    if (OPENS.test(text)) { current = `${part} ${++count[part]}`; pn[i] = current; continue; }
    if (LEAD_IN.test(text)) { pn[i] = `${part} ${count[part] + 1}`; continue; }   // the next saying's number
    if (current && current.startsWith(part)) pn[i] = current;   // continuation of the saying
  }
  // a lead-in's number must be the one the following saying took
  for (let i = 0; i < paras.length; i++) if (pn[i] && LEAD_IN.test(String(paras[i].text || '')) && pn[i + 1] !== pn[i]) pn[i] = null;
  const issues = [];
  if (count.Arabic !== 71) issues.push(`Arabic sayings ${count.Arabic}, expected 71`);
  if (count.Persian !== 82) issues.push(`Persian sayings ${count.Persian}, expected 82`);
  return { pn, counts: count, issues };
}

export const SCHEMES = { 'hidden-words': hiddenWords };
