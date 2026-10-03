// OceanLibrary heading hierarchy → SECTION author ("From the Writings of Bahá’u’lláh", "From Letters Written on Behalf of
// Shoghi Effendi") and the frontmatter author list (author, author_2 …). The content table keeps only the nearest heading,
// so the file is read; paragraphs join by their file id (external_para_id = para_N). Pure except readers taking text.
const A = "['’‘ʼ`]?";
const NAMES = [
  ['Bahá’u’lláh', new RegExp(`Bah[aá]${A}u${A}ll[aá]h`, 'i')], ['The Báb', /\bthe B[aá]b\b/i],
  ['‘Abdu’l-Bahá', new RegExp(`${A}Abdu${A}l[- ]Bah[aá]`, 'i')], ['Shoghi Effendi', /Shoghi Effendi|the Guardian/i],
  ['Universal House of Justice', /Universal House of Justice/i],
];
export const clean = (h) => h.replace(/\{[^}]*\}\s*$/, '').replace(/<br\s*\/?>/gi, ' ').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();

// A heading that names whose words follow. Returns null for headings that don't (numbers, topics).
export function sectionAuthor(heading) {
  const h = clean(heading);
  if (!/^(From|Extracts? from|Selections? from|Letters?|Writings?|Messages?|Tablets?|Talks?|Prayers?)\b/i.test(h)) return null;
  const found = NAMES.filter(([, re]) => re.test(h)).map(([n]) => n);
  const mixed = /\bby (and|or) on behalf\b/i.test(h);
  const onBehalf = !mixed && /on behalf of/i.test(h);
  if (/stenographic notes|table talks|pilgrim/i.test(h)) return { names: found, role: 'reported', heading: h };
  if (!found.length) {
    const by = h.match(/\bby\s+([A-Z][^,;]+)$/);          // "From ‘Letters and Life,’ by James Spedding"
    return by ? { names: [by[1].trim()], role: 'author', heading: h, other: true } : null;
  }
  // "the Writings of Bahá’u’lláh and ‘Abdu’l-Bahá" names several → the section is mixed; trailers decide each item
  return { names: found, role: 'author', on_behalf: onBehalf, mixed: mixed || found.length > 1, heading: h };
}

export function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) { const kv = line.match(/^([A-Za-z_0-9]+):\s*(.*)$/); if (kv) fm[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '').replace(/''/g, "'"); }
  return fm;
}


/** Frontmatter author list (author, author_2, author_3 …) of a source file's text. */
export function frontmatterAuthors(text) {
  const fm = frontmatter(text);
  return Object.keys(fm).filter((k) => /^author(_\d+)?$/.test(k)).sort().map((k) => fm[k]).filter(Boolean);
}

/** Map para_N → { section, path } for a source file's text (section = the nearest heading that names a writer). */
export function sectionMap(text) {
  const map = new Map(), stack = [];
  for (const line of text.split('\n')) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const id = (line.match(/\bid="(para_\d+)"/) || [])[1];
    if (h) {
      const level = h[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, heading: clean(h[2]), section: sectionAuthor(h[2]) });
      if (id) map.set(id, { heading: true, path: stack.map((s) => s.heading).filter(Boolean) });
      continue;
    }
    if (!id) continue;
    const sec = [...stack].reverse().find((s) => s.section)?.section || null;
    // `.reference` = the file's own mark for an attribution line ("‘Abdu’l-Bahá, from a Tablet — translated from the Persian")
    map.set(id, { section: sec, reference: /\{[^}]*\.reference\b/.test(line), path: stack.map((s) => s.heading).filter(Boolean) });
  }
  return map;
}
