// WHO A COMPILATION IS BY — one rule for every ingester (Chad 10-19: "Compilations have author, author_2, author_3 when
// coming from OceanLibrary. This is different from the author array we use in siftersearch"). OceanLibrary lists a
// multi-author Bahá'í compilation's contributors as author, author_2, author_3…, and an ingester that read only `author`
// credited the whole book to its first contributor — Lights of Guidance arrived as "by Bahá'u'lláh" (the sites adapter was
// fixed 10-08; the main library ingester was not, so its copy, doc 20804, still was). A Bahá'í document with several
// authors is a compilation: credit its compiler. A named compiler wins; the folder names the Research Department;
// otherwise "Compilation (Bahá'í Writings)" — both have authority defaults in authority.js, so the revealed texts inside
// keep their rank, and each PARAGRAPH carries its own author (content.authors). Pure.
export const COMPILERS = Object.freeze({
  'lights-of-guidance': 'Helen Hornby (compiler)',
});
const slugOf = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** frontmatter's contributors (author, author_2, author_3 …) in order. */
export const contributors = (fm = {}) => Object.keys(fm).filter((k) => /^author(_\d+)?$/.test(k)).sort((a, b) => (Number(a.split('_')[1]) || 1) - (Number(b.split('_')[1]) || 1))
  .map((k) => String(fm[k] || '').trim()).filter(Boolean);

export function compilationAuthor(frontmatter = {}, relativePath = '', religion = null) {
  if (!String(frontmatter.author_2 || '').trim() || !/^bah/i.test(String(religion || ''))) return null;
  const named = COMPILERS[frontmatter.slug] || COMPILERS[slugOf(String(frontmatter.title || '').split(':')[0])];
  if (named) return named;
  if (/Research Department Compilations/i.test(relativePath)) return 'Research Department of the Universal House of Justice (compiler)';
  return "Compilation (Bahá'í Writings)";
}
