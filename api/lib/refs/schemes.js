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

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
/** "CXXV" → 125 (null when not a Roman numeral). */
export function romanToInt(r) {
  const s = String(r || '').toUpperCase();
  if (!/^[IVXLCDM]+$/.test(s)) return null;
  let n = 0;
  for (let i = 0; i < s.length; i++) n += ROMAN[s[i]] < (ROMAN[s[i + 1]] || 0) ? -ROMAN[s[i]] : ROMAN[s[i]];
  return n;
}
const isInvocation = (t) => /^\s*(In the name of|He is|He Is)\b/i.test(String(t || '')) && String(t).length < 160;
const isNote = (p) => /\{language="[a-z-]+"\}\s*$/.test(String(p.text || '')) || /^(END|Notes?)$/i.test(String(p.heading || '').trim());

/** Gleanings from the Writings of Bahá'u'lláh: sections I–CLXVI (the headings, "– CXXV –"); a section's first paragraph is
 *  "CXXV", later ones "CXXV.2", "CXXV.3". Sections must run I…CLXVI in order, none missing. */
export function gleanings(paras) {
  const pn = new Array(paras.length).fill(null);
  let sec = null, k = 0, last = 0;
  const issues = [];
  for (let i = 0; i < paras.length; i++) {
    const m = String(paras[i].heading || '').match(/\b([IVXLC]+)\b/);
    const n = m ? romanToInt(m[1]) : null;
    if (!n) continue;
    if (n !== sec) {
      if (n !== last + 1) issues.push(`section ${m[1]} follows ${last}`);
      sec = n; last = n; k = 0;
    }
    pn[i] = ++k === 1 ? m[1] : `${m[1]}.${k}`;
  }
  if (last !== 166) issues.push(`last section ${last}, expected 166 (CLXVI)`);
  return { pn, counts: { sections: last }, issues: issues.slice(0, 10) };
}

/** The Kitáb-i-Aqdas: its text ¶1–190 and the Questions and Answers Q&A 1–107 (by heading); the invocation and any
 *  note rows have none. Each part must come to exactly its total. */
export function aqdas(paras) {
  const pn = new Array(paras.length).fill(null);
  const count = { text: 0, qa: 0 };
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i], h = String(p.heading || '');
    if (isNote(p)) continue;
    if (/questions and answers/i.test(h)) pn[i] = `Q&A ${++count.qa}`;
    else if (/most holy book|aqdas/i.test(h)) { if (count.text === 0 && isInvocation(p.text)) continue; pn[i] = String(++count.text); }
  }
  const issues = [];
  if (count.text !== 190) issues.push(`text paragraphs ${count.text}, expected 190`);
  if (count.qa !== 107) issues.push(`questions ${count.qa}, expected 107`);
  return { pn, counts: count, issues };
}

/** The Kitáb-i-Íqán: ¶1–290 in reading order across both parts; the opening invocation and note rows have none. */
export function iqan(paras) {
  const pn = new Array(paras.length).fill(null);
  let n = 0;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (isNote(p) || (n === 0 && isInvocation(p.text))) continue;
    pn[i] = String(++n);
  }
  return { pn, counts: { paragraphs: n }, issues: n === 290 ? [] : [`paragraphs ${n}, expected 290`] };
}

export const SCHEMES = { 'hidden-words': hiddenWords, gleanings, aqdas, iqan };
