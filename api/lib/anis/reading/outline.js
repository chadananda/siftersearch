// Reading guide (Chad 10-12) — a book's reading outline from its OceanLibrary markdown: every body paragraph with its
// OceanLibrary id (para_N), the SECTION it belongs to (chapter number, Intro, Preface …), its number inside that section
// (the "#5.7" of a subject line) and the topic heading above it. Pure.

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
export const romanToInt = (r) => [...String(r).toUpperCase()].reduce((n, c, i, a) => n + (ROMAN[c] < (ROMAN[a[i + 1]] || 0) ? -ROMAN[c] : ROMAN[c]), 0);

const NAMED = [[/^INTRODUCTION$/i, 'Intro'], [/^PREFACE$/i, 'Preface'], [/^EPILOGUE$/i, 'Epilogue'], [/^FOREWORD$/i, 'Foreword'], [/^PROLOGUE$/i, 'Prologue']];

/** Display text of one markdown line: attribute block, page marks, footnote refs, tags and emphasis removed. */
export function cleanLine(s) {
  return String(s).replace(/\s*\{[^{}]*\}\s*$/, '').replace(/\[pg [^\]]*\]/gi, '').replace(/\[\^[^\]]*\]/g, '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/(\*\*|__|\*|_)(\S[^*_]*?)\1/g, '$2')
    .replace(/\\([-*_[\]()#.!])/g, '$1').replace(/\s+/g, ' ').trim();
}

/** → { sections: [{ key, title }], paragraphs: [{ pid, section, n, topic, text }] } */
export function parseOutline(md) {
  const paragraphs = [], sections = [];
  let section = 'Front', sectionTitle = null, topic = null, n = 0, awaitTitle = false;
  const open = (key, title = null) => { section = key; sectionTitle = title; topic = null; n = 0; sections.push({ key, title }); };
  open('Front');
  let pending = [];   // text lines of a block whose attribute line comes AFTER it (lists, poems, block quotes)
  for (const line of String(md).split('\n')) {
    if (!line.trim()) continue;   // the attribute line may follow its text after a blank line (para_1143)
    const attrs = line.match(/\{([^{}]*)\}\s*$/)?.[1] || '';
    if (!attrs && !/^#/.test(line)) { pending.push(line); continue; }
    const pid = attrs.match(/\bid="(para_\d+)"/)?.[1];
    const type = attrs.match(/\btype="(\w+)"/)?.[1];
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      pending = [];
      const text = cleanLine(h[2]);
      const chapter = text.match(/^CHAPTER\s+([IVXLCDM]+)\b/i);
      const named = NAMED.find(([re]) => re.test(text));
      if (chapter) { open(String(romanToInt(chapter[1]))); awaitTitle = true; continue; }
      if (named) { open(named[1], text); awaitTitle = false; continue; }
      if (awaitTitle) { sectionTitle = text; sections[sections.length - 1].title = text; awaitTitle = false; continue; }
      if (section !== 'Front' && text) topic = text;
      continue;
    }
    const own = cleanLine(line);
    const body = [...pending.map(cleanLine), own].filter(Boolean).join(' ');
    pending = [];
    if (!pid || type !== 'par') continue;
    const text = body;
    if (!text) continue;
    paragraphs.push({ pid, section, n: ++n, topic: topic || sectionTitle, text });
  }
  return { sections: sections.filter((s) => paragraphs.some((p) => p.section === s.key)), paragraphs };
}

/** "#Intro.3" / "#5.7" — the subject-line address of a paragraph. */
export const addressOf = (p) => `#${p.section}.${p.n}`;

/** One page from `from` (index into paragraphs): whole paragraphs until ~`words`, never crossing into a new section
 *  once the page has content (a chapter starts its own email). Pure. */
export function pageFrom(paragraphs, from, { words = 450, max = 8 } = {}) {
  const out = [];
  let count = 0;
  for (let i = from; i < paragraphs.length && out.length < max; i++) {
    const p = paragraphs[i];
    if (out.length && p.section !== out[0].section) break;
    const w = p.text.split(/\s+/).length;
    if (out.length && count + w > words * 1.25) break;
    out.push({ ...p, index: i });
    count += w;
    if (count >= words) break;
  }
  return { items: out, next: out.length ? out[out.length - 1].index + 1 : from, words: count };
}

/** Where a reader asked to start ("the introduction", "chapter 5", "preface") → paragraph index, or null. */
export function startIndex(paragraphs, want) {
  const w = String(want || '').toLowerCase();
  if (!w) return null;
  const ch = w.match(/chapter\s+(\d+|[ivxlc]+)\b/i);
  const key = ch ? String(/^\d+$/.test(ch[1]) ? Number(ch[1]) : romanToInt(ch[1]))
    : /intro/.test(w) ? 'Intro' : /preface/.test(w) ? 'Preface' : /epilogue/.test(w) ? 'Epilogue' : /begin|start|first/.test(w) ? '__first' : null;
  if (!key) return null;
  if (key === '__first') return 0;
  const i = paragraphs.findIndex((p) => p.section === key);
  return i >= 0 ? i : null;
}
