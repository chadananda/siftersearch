// A paragraph's VOICE, as one line for the enrichment stages (Chad 2026-10-09: "use the classification in our
// disambiguation work and use both in our concept extraction and hype generation"). Built from content.authors (the reader +
// the window classifier, lib/authorship/window.js) through effectiveAuthor, so every stage reads speaker / quoted / on-behalf
// the same way: "He" in a letter by Queen Marie is not "He" in Nabíl's narrative, and an idea belongs to whoever speaks it.
// Pure.
import { effectiveAuthor } from './effective.js';

/**
 * @param {{ authors: string|object[]|null, author?: string }} row  authors = content.authors; author = the book's author
 * @returns {string} e.g. "VOICE: Queen Marie of Rumania (quoted in this book by Rúḥíyyih Rabbání) · quotes: Shoghi Effendi"
 *                   or "" when nothing is known beyond the book's own author
 */
export function voiceLine({ authors, author }) {
  if (!authors) return '';
  const e = effectiveAuthor({ authors, author });
  if (e.isReferenceLine) return 'VOICE: an attribution / reference line — it names the writer of the extracts it follows';
  const quoted = [...new Set(e.quoted)].filter((q) => q && q !== e.author);
  if (e.fromBook && !quoted.length) return '';                                  // the book's author, nothing quoted: nothing to add
  const who = !e.author ? 'unidentified (not the book’s author)'
    : e.fromBook ? `${e.author} (the book’s author)`
      : `${e.author}${e.onBehalf ? ' (written on their behalf)' : ''}${author && e.author !== author ? ` (quoted in this book by ${author})` : ''}`;
  return `VOICE: ${who}${quoted.length ? ` · quotes / cites: ${quoted.join(', ')}` : ''}`;
}

/** The speaker and quoted names as fields (for stages that store attribution with what they extract). */
export function voiceOf({ authors, author }) {
  const e = effectiveAuthor({ authors, author });
  return { speaker: e.author || null, fromBook: !!e.fromBook, onBehalf: !!e.onBehalf, quoted: [...new Set(e.quoted)].filter((q) => q && q !== e.author), referenceLine: !!e.isReferenceLine };
}
