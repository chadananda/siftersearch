// Citations typed as queries (Chad 10-17: numbering + searchability): "Gleanings CXXV", "Gleanings 125:3", "Íqán ¶12",
// "Kitab-i-Iqan 12", "Arabic Hidden Words 5", "Hidden Words, Persian 45", "PHW 45" → the work's document and the pn
// its refs-assign scheme wrote. Only works whose numbering is VERIFIED are listed (refs/schemes.js); the Aqdas waits
// for a copy that reproduces 190/107. Pure; refs-repo looks the pn up.
import { romanToInt } from './schemes.js';

export const CITABLE = { gleanings: 20783, iqan: 20810, 'hidden-words': 20809 };

const toRoman = (n) => [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();
const NUM = String.raw`(?:no\.?|number|nr\.?|#|§|¶|para(?:graph)?\.?|p\.?|section|sec\.?)?\s*`;

/** → { work, doc, pn } or null. */
export function parseCitation(query) {
  const q = fold(query);
  let m;
  // Gleanings: Roman or Arabic section number, optional paragraph within it ("CXXV.2", "125:2", "125 para 2")
  if ((m = q.match(new RegExp(`^(?:gleanings|gwb)(?: from the writings of bahaullah)?\\s+${NUM}([ivxlc]+|\\d{1,3})(?:\\s*[.:]\\s*(\\d{1,2})|\\s+(?:para(?:graph)?\\.?|¶)\\s*(\\d{1,2}))?$`)))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : romanToInt(m[1]);
    if (!n || n > 166) return null;
    const k = Number(m[2] || m[3] || 1);
    const sec = toRoman(n);
    return { work: 'gleanings', doc: CITABLE.gleanings, pn: k > 1 ? `${sec}.${k}` : sec };
  }
  // Kitáb-i-Íqán ¶n
  if ((m = q.match(new RegExp(`^(?:the )?(?:kitab-?i-? ?iqan|iqan|book of certitude|ki)\\s+${NUM}(\\d{1,3})$`)))) {
    const n = Number(m[1]);
    return n >= 1 && n <= 290 ? { work: 'iqan', doc: CITABLE.iqan, pn: String(n) } : null;
  }
  // Hidden Words: "Arabic Hidden Words 5", "Hidden Words Persian 45", "AHW 5", "PHW 45", "Hidden Words A5"
  const hw = q.match(new RegExp(`^(?:(arabic|persian) hidden words?|hidden words?\\s+(arabic|persian|a|p))\\s*${NUM}(\\d{1,2})$`))
    || q.match(/^(a|p)hw\s*(?:no\.?|#)?\s*(\d{1,2})$/);
  if (hw) {
    const part = (hw.length === 4 ? (hw[1] || hw[2]) : hw[1]).startsWith('a') ? 'Arabic' : 'Persian';
    const n = Number(hw.length === 4 ? hw[3] : hw[2]);
    if (n < 1 || n > (part === 'Arabic' ? 71 : 82)) return null;
    return { work: 'hidden-words', doc: CITABLE['hidden-words'], pn: `${part} ${n}` };
  }
  return null;
}
