// Episodes of a predigested history (Chad 10-17: God Passes By and The Dawn-Breakers "should be very easy since the
// subheaders call out the episodes/scenes … I want those to be perfect"). The book's own headings ARE the episode
// boundaries: an episode is one section's OWN paragraphs — its range minus its sub-sections' ranges — so "The
// anecdote of Shaykh Ḥasan" keeps its opening paragraph while "b. The Báb's attendance…" is its own episode, and no
// paragraph is in two episodes. Narrative only: from the first "Chapter" heading on (Foreword, Introduction, Preface
// left out), stopping at back matter (Notes, Appendix, Glossary, Index, Bibliography). Pure: sections in, episodes out.
import { foldWord } from './search/spell.js';

const CHAPTER = /^chapter\b/i;
// the bare heading only: 'References to the mother and to the wife of the Báb' is an episode, 'Notes' is not
const BACK_MATTER = /^(notes?|appendi(x|ces)|glossary|index|bibliography|references|sources)(\s+([ivxlc]+|\d+|[a-z]))?\.?$/i;

/** Sections (ordered, with level and inclusive start/end paragraph_index) → episodes with chapter, path and own spans. */
export function episodesFromSections(sections = []) {
  const first = sections.findIndex((s) => CHAPTER.test(s.title));
  if (first < 0) return [];
  const out = [], stack = [];
  let chapter = null;
  for (let i = first; i < sections.length; i++) {
    const s = sections[i];
    if (BACK_MATTER.test(s.title)) break;
    while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
    // a chapter's number heading and its title heading ("CHAPTER I" › "THE MISSION OF SHAYKH AḤMAD") name ONE chapter
    if (CHAPTER.test(s.title) || (stack.length && CHAPTER.test(stack[stack.length - 1].title) && s.start_index === stack[stack.length - 1].start_index && s.end_index === stack[stack.length - 1].end_index)) {
      chapter = CHAPTER.test(s.title) ? s.title : `${stack[stack.length - 1].title} · ${s.title}`;
    } else if (!stack.length) chapter = s.title;   // a top-level part after the chapters: Epilogue, Retrospect and Prospect
    // its nearest sub-sections: deeper sections that follow, not already inside an earlier sub-section (levels may skip)
    const children = [];
    for (let j = i + 1; j < sections.length && sections[j].level > s.level; j++) {
      const t = sections[j];
      if (!children.some((c) => t.start_index >= c.start_index && t.end_index <= c.end_index)) children.push(t);
    }
    const spans = ownSpans(s, children);
    const path = [...stack.map((p) => p.title), s.title];
    out.push({ section_id: s.section_id, ord: s.ord, level: s.level, title: s.title, chapter, path: path.join(' › '), spans });
    stack.push(s);
  }
  return out.filter((e) => e.spans.length);
}

/** A section's range minus its children's ranges → [[from, to], …] inclusive paragraph_index spans. */
export function ownSpans(section, children = []) {
  const spans = [];
  let at = section.start_index;
  for (const c of [...children].sort((a, b) => a.start_index - b.start_index)) {
    if (at > section.end_index) break;
    if (c.start_index > at) spans.push([at, Math.min(c.start_index - 1, section.end_index)]);
    at = Math.max(at, c.end_index + 1);
  }
  if (at <= section.end_index) spans.push([at, section.end_index]);
  return spans;
}

/** Keep only participants whose name appears in the episode's own text — pass the heading with it: the author named them
 *  there too (folded: case, diacritics, apostrophes, possessives, hyphens). */
export function verifyParticipants(participants = [], text = '') {
  // possessives ("‘Abdu’l-Bahá’s", "the Báb’s") and every apostrophe form (ʻ U+02BB too) fold away before comparing
  const norm = (s) => ` ${String(s || '').replace(/[ʻʼ’‘']s\b/g, '').replace(/[ʻ]/g, '').split(/[\s\-‑–—,.;:()“”"!?]+/).map(foldWord).filter(Boolean).join(' ')} `;
  const hay = norm(text);
  const kept = [], dropped = [];
  for (const p of participants) (p?.name && hay.includes(norm(p.name)) ? kept : dropped).push(p);
  return { kept, dropped };
}
