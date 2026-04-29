// Smart-quote transformation for inline strings rendered in Astro templates
// (titles, descriptions, questions, excerpts). Markdown body content uses
// remark-smartypants automatically — this helper covers the non-markdown text.
//
// Rules: order matters
//   1. Triple/double primes (don't smarten — measurements like 5'2" pass through)
//   2. Em/en dashes (-- → —, --- → —, .. → … etc)
//   3. Single quotes — apostrophes between letters first, then directional
//   4. Double quotes — directional based on neighboring char

export function smartQuotes(text) {
  if (!text) return text;
  let s = String(text);

  // Em-dash and ellipsis
  s = s.replace(/---/g, '\u2014').replace(/--/g, '\u2014');
  s = s.replace(/\.{3}/g, '\u2026');

  // Apostrophe between word characters: don't, 'Abdu'l-Bahá, Bahá'u'lláh
  s = s.replace(/([A-Za-z\u00C0-\u024F])'([A-Za-z\u00C0-\u024F])/g, '$1\u2019$2');

  // Leading single quote (start of string or after whitespace/open-bracket): 'word
  s = s.replace(/(^|[\s({[])'/g, '$1\u2018');
  // Closing single quote (everything else)
  s = s.replace(/'/g, '\u2019');

  // Leading double quote
  s = s.replace(/(^|[\s({[\u2014])"/g, '$1\u201C');
  // Closing double quote
  s = s.replace(/"/g, '\u201D');

  return s;
}
