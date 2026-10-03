// Compilation attribution trailers: "(From a letter written on behalf of Shoghi Effendi …, 8 February 1949)",
// "(Bahá’u’lláh, Gleanings, p. 287)", "(Selections from the Writings of ‘Abdu’l-Bahá, no. 58)". Markdown italics are
// stripped first ("(_Selections_ _from the Writings…_)" otherwise misses the work). Pure. Used by the reader + dry runs.
const A = "['’‘ʼ`]?";
const PEOPLE = [
  ['Bahá’u’lláh', new RegExp(`Bah[aá]${A}u${A}ll[aá]h`, 'i')],
  ['‘Abdu’l-Bahá', new RegExp(`${A}Abdu${A}l[- ]Bah[aá]|the Master\\b`, 'i')],
  ['The Báb', /\bthe B[aá]b\b/i],
  ['Shoghi Effendi', /Shoghi Effendi|\bthe Guardian\b/i],
  ['Universal House of Justice', /Universal House of Justice/i],
  ['International Teaching Centre', /International Teaching Cent(re|er)/i],
  ['Research Department', /Research Department/i],
];
// Works whose author is unambiguous, for trailers that cite the work without naming the author.
const WORKS = [
  ['‘Abdu’l-Bahá', /Selections from the Writings of .?Abdu|Some Answered Questions|Paris Talks|Promulgation of Universal Peace|Tablets of the Divine Plan|Secret of Divine Civilization|Memorials of the Faithful|Will and Testament|Tablet to the (Executive Committee|Hague)|Divine Philosophy|.?Abdu.?l-Bah[aá] in London/i],
  ['Bahá’u’lláh', /Gleanings|Kit[aá]b-i-Aqdas|Kit[aá]b-i-[IÍ]q[aá]n|Tablets of Bah|Hidden Words|Epistle to the Son of the Wolf|Summons of the Lord|Prayers and Meditations|Seven Valleys|Gems of Divine Mysteries|Tabernacle of Unity|Days of Remembrance/i],
  ['The Báb', /Selections from the Writings of the B[aá]b/i],
  ['Shoghi Effendi', /World Order of Bah|Advent of Divine Justice|God Passes By|Promised Day is Come|Citadel of Faith|Messages to America|Bah[aá].? Administration|Unfolding Destiny|Directives from the Guardian|Dawn of a New Day|Arohanui|Letters from the Guardian|Messages to the Bah[aá].?[ií] World|High Endeavours|Light of Divine Guidance|Messages to Canada|This Decisive Hour/i],
  ['Universal House of Justice', /Messages from the Universal House|Wellspring of Guidance|Messages 1963|Turning Point|Century of Light|One Common Faith/i],
];

const TRAILER = /^\((Ibid|From |Written |Letter |Bah|.?Abdu|Shoghi|The Universal|Universal|The B[aá]b|Memorandum|Extract|Cable|Selections from|Tablet |Gleanings|Kit[aá]b|Some Answered|Paris Talks|Promulgation|Tablets of|Talk |Words of|Postscript|Questions answered)/i;
const PG = /\s*\[pg\.?\s*\d+\]\s*$/i;                       // "(From a letter … 1971) [pg 614]" — a page marker after it
export const isTrailer = (t) => {
  const x = String(t).replace(PG, '').trim();
  if (x.length < 500 && /^\(.*\)\s*\.?$/s.test(x) && TRAILER.test(x)) return true;
  // a bare attribution line under an extract: "—Bahá’u’lláh", "_—‘Abdu’l-Bahá_" (prayer books, Additional Tablets)
  const bare = x.replace(/[_*]/g, '').match(/^[—–]{1,2}\s*(.{3,60})$|^--\s*(.{3,60})$/);
  return !!bare && PEOPLE.some(([, re]) => { const m = (bare[1] || bare[2]).match(re); return m && m.index === 0; });
};
// Lines that carry no one's words: source notes, dates, addressee brackets, page/compiler notes. Transparent to spans.
const META = [/^USBN\s*#/i, /^\\?\[(to|To)\s[^\]]+\\?\]$/, /^(Published|Compiled|Reprinted|Cited|Source)\b[^"“”]{0,160}$/i,
  /^[—–-]?\s*(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\s+\d{4})\.?$/, /^(Haifa|Akka|‘Akká|Bahjí),?\s+[^.]{0,40}\d{4}\.?$/i, /^\\?=+$/, /^\[pg\.?\s*\d+\]$/i,
  // bare citation lines: "The Priceless Pearl, Rúḥíyyih Ḵhánum, p346", "Unlocking the Power of Action, #52", "BW XIII pp895-9"
  /^[^"“”.!?]{3,150}?,?\s+(p|pp|page)\.?\s*\d+([-–]\d+)?\.?$/i, /^[^"“”.!?]{3,120},?\s*#\d+$/, /^\(See also:?[^)]{0,80}\)$/i,
  // a whole-line parenthetical that is not a named trailer ("(27 December 1932 to an individual believer)"); "Extract 67.";
  // "Cablegram received April 28, 1947"; an endnote "Qur’án 39:12."; a bracketed title line "[Your True Brother: …]"
  /^\([^()]{0,200}\)\.?$/, /^Extract \d+\.?$/i, /^(Cablegram|Cable|Telegram|Message|Letter)\s+(received|dated|sent)\b[^"“”]{0,80}$/i,
  /^[“"]?(Qur[’']?[aá]n|Sura|Súrih)\s+\d+(:\d+)?\.?$/i, /^\\?\[[^\]]{3,160}\\?\]$/,
  /^[^"“”]{0,120}\bcompiled by\b[^"“”]{0,120}$/i, /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\.?$/i,
  /^[^"“”]{3,60},\s*(Interpreter|Translator|Secretary)\.?$/i, /^Guardian of the Bah/i,
  // a page header / footer ("OBS:Online Journal of Bahá’í Studies       502       1 (2007)"), "↑" endnotes, footnote bodies
  /^(?=.*\d)[^"“”]{3,150}$(?<=\S\s{5,}\S.*)/, /↑/, /^>?\s*\[\^\d+\]:/,
  /\.{5,}\s*\d+\s*$/, /^<!--[\s\S]*-->$/];   // table-of-contents lines, HTML comments
export const isMeta = (t) => { const x = String(t).replace(/\s*\{[^}]*\}\s*$/, '').trim();   // drop a trailing {language="en"}
  return x.length < 200 && META.some((re) => re.test(x)); };
// "1772. What is Commonly Called Evil Spirits …" — a numbered item heading without markup (no closing punctuation, no quote)
export const isNumberedHeading = (t) => /^\d{1,4}\.\s+[A-Z][^"“.!?]{3,180}$/.test(String(t).trim());
export const isHeading = (row, t) => /^heading/.test(row.blocktype || '') || /^\*\*[^*]+\*\*$/.test(t) || /^#{1,6}\s/.test(t);

// A speaker heading in a record of talks: "ADDRESS BY ‘ABDU’L-BAHÁ", "READING BY REV. BRADFORD LEAVITT", "Talk of the Master".
// Returns the speaker's name (a known figure where one is named), else null.
export function bylineSpeaker(heading) {
  const m = String(heading).replace(/^#+\s*|[*_]/g, '').trim().match(/^(?:an?\s+)?(?:address|talk|reading|remarks|prayer|introduction|words|speech|sermon|lecture|response|reply|answer)s?\s+(?:by|of|from)\s+(.{2,80})$/i);
  if (!m) return null;
  for (const [n, re] of PEOPLE) if (re.test(m[1])) return n;
  return m[1].replace(/[.:]+$/, '').toLowerCase().replace(/(^|[\s.‘’'-])(\p{L})/gu, (x, a, b) => a + b.toUpperCase());
}

export function parseTrailer(raw) {
  const t = String(raw).replace(PG, '').replace(/[_*]/g, '').replace(/^\(|\)\s*\.?$/g, '').trim();
  if (/^ibid\b/i.test(t)) return { ibid: true, name: null, date: (t.match(/\b(\w+ \d{1,2},? \d{4}|\d{1,2} \w+ \d{4})\b/) || [])[1] || null };
  const head = t.split(/,?\s+(?:cited|quoted) in\s+/i)[0];
  const citedIn = (t.match(/(?:cited|quoted) in\s+(.+)$/i) || [])[1] || null;
  const onBehalfM = head.match(/on behalf of (the Guardian|Shoghi Effendi|the Universal House of Justice|the House of Justice)/i);
  let name = null, pos = Infinity;
  if (onBehalfM) name = /Guardian|Shoghi/i.test(onBehalfM[1]) ? 'Shoghi Effendi' : 'Universal House of Justice';
  else for (const [n, re] of PEOPLE) { const m = head.match(re); if (m && m.index < pos) { name = n; pos = m.index; } }
  let basis = 'trailer';
  if (!name) for (const [n, re] of WORKS) if (re.test(head)) { name = n; basis = 'trailer-work'; break; }
  const kind = /\btalk\b|address|spoken/i.test(head) ? 'talk' : /cable|telegram/i.test(head) ? 'cable' : /letter/i.test(head) ? 'letter'
    : /tablet/i.test(head) ? 'tablet' : /memorandum/i.test(head) ? 'memorandum' : 'work';
  const date = (head.match(/\b(\d{1,2} \w+ \d{4}|\w+ \d{1,2},? \d{4}|\d{4})\b/) || [])[1] || null;
  return { name, on_behalf: !!onBehalfM, kind, date, cited_in: citedIn, basis };
}

