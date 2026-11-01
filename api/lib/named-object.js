// A turn whose OBJECT is a person or a work ("find where Ghoddus is discussed", "most holy book source") — resolved
// against the entity lookup (entity-api entityLookup: skeleton keys, AI-free, ~10-60 ms) with a strict whole-name match,
// so search-plan.js can route it as a lookup whatever the request frame says ("where", "find", "quotes").
// Pure: objectPhrases / nameMatches. resolveNamed takes the lookup injected (tests) or loads entity-api lazily.
import { skeletonKeys } from './translit-key.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ'‘’`´]/g, '').toLowerCase();
// The request frame around a name: question words, politeness, chat filler and "where in the library" talk.
const WRAP = new Set(`a an the and or to in on at for from about with into is are was were be been am it its that this these those there here
what whats wat which wich who whos whom whose where wheres wher whre when how why do does did can could would will shall should may might
please pls plz thx thanks thank ty you u me my i im ive we our us your find fnd locate search show point look up read get see tell know
wonder if lol so much just quick one hey hi hello ok okay then now also again any anything every everything all stuff info information
more name named called mention mentions mentioned mentioning appear appears appearing appeared discussed discuss discusses discussing
say says said come comes came anywhere somewhere books passages passage entries entry quotes quote quotation quotations sources source
reference references identified identify cant cannot rmbr remember forgot forget saw seen him her he she his hers library librarys libary
collection collections help need want looking cn whos let lets give list texts writings titled something add wrote written writer author
auther not sure whenever have has moment pull full txt online available anywher great complete summary version copy keep keeps seeing grateful
using approach out figure identity biography bio person guy refers refer term think exact exactly possible explain understand understanding
knowing wanting searching good fine sumthing start abt shows account story homework student background meaning relevant thing things asap
ones they them r n rember right real realy really teacher used first given origin taken word advance being who's what's where's`.split(/\s+/));
// Generic nouns that frame a title ("the text 'The Most Holy Book'") but can also BE part of one ("Most Holy Book"): trimmed only at the edges, as a second try.
const GENERIC = new Set('book work works text document title phrase writing'.split(' '));
// small words and the honorifics the lookup's keys ignore too (translit-key HON): "Mullá Ḥusayn" is matched on "Ḥusayn"
const SMALL = new Set(`the of in by and a an i al el ul l mirza mulla molla siyyid sayyid seyyed haji hajji hajj aqa aqay agha shaykh sheikh shaikh
ustad ustadh khan ibn bin abu abi umm son daughter`.split(/\s+/));
const tokens = (s) => fold(s).replace(/\([^)]*\)/g, ' ').split(/:/)[0].replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((t) => t && !SMALL.has(t));

/** The candidate object phrases of a turn, most literal first: the residue after the request frame, its generic edges
 *  trimmed, and a WORK before "by/of <someone>" ("Hidden Words by Shoghi Effendi" → workOnly). → [{ phrase, workOnly? }]; [] when too long to be a name. */
export function objectPhrases(text) {
  const t = String(text || '').replace(/\b(and )?by whom\b/gi, ' ').replace(/["“”«»?!.,;:()]/g, ' ');
  const words = t.split(/\s+/).map((w) => w.replace(/^['‘’`]+|['‘’`]+$/g, '')).filter(Boolean);
  const kept = words.filter((w) => !WRAP.has(fold(w)) && !/^\d+$/.test(w));
  if (!kept.length || kept.length > 6) return [];
  const out = [{ phrase: kept.join(' ') }];
  let a = 0, b = kept.length;
  while (a < b && GENERIC.has(fold(kept[a]))) a++;
  while (b > a && GENERIC.has(fold(kept[b - 1]))) b--;
  // lead trimmed, tail trimmed, both: "text Most Holy Book" → "Most Holy Book" (the tail is part of the title)
  for (const [x, y] of [[a, kept.length], [0, b], [a, b]]) if (y > x && (x > 0 || y < kept.length)) out.push({ phrase: kept.slice(x, y).join(' ') });
  const split = kept.slice(a, b).join(' ').split(/\s+(?:by|of)\s+/i);
  if (split.length > 1 && split[0].split(/\s+/).length >= 2) out.push({ phrase: split[0], workOnly: true });
  return out.filter((o, i) => o.phrase.length >= 3 && out.findIndex((x) => x.phrase === o.phrase) === i);
}

const similar = (a, b) => {
  if (a === b) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
};

/** Every word of the phrase and every significant word of the candidate's name share a spelling key (the lookup's own
 *  transliteration buckets): "mulla hosein" ≡ Mullá Ḥusayn, "bok of certitude" ≡ Book of Certitude — but "peace" is
 *  not Pope Pius IX and "thoughts of war" is not the Minister of War. Parentheticals and subtitles are not the name. */
export function nameMatches(phrase, candName) {
  const q = tokens(phrase), c = tokens(candName);
  if (!q.length || !c.length) return false;
  const k = (t) => skeletonKeys(t);
  // same spelling bucket AND recognisably the same word (the buckets are coarse: "nirvana" shares one with "Núrániyya")
  const share = (x, y) => { if (similar(x, y) < 0.5) return false; const Y = k(y); for (const key of k(x)) if (Y.has(key)) return true; return false; };
  // one word per name word: "nirvana" alone is not "Núrayn-i-Nayyirayn" though its skeleton fits both halves
  if (q.length !== c.length) return false;
  return q.every((x) => c.some((y) => share(x, y))) && c.every((y) => q.some((x) => share(x, y)));
}

/** → { type: 'person'|'work', id, name, matched } for the first object phrase that names one entity, else null. Never throws. */
export async function resolveNamed(text, { lookup } = {}) {
  const phrases = objectPhrases(text);
  if (!phrases.length) return null;
  try {
    const find = lookup || (await import('./entity-api.js')).entityLookup;
    const results = await Promise.all(phrases.map((o) => find(o.phrase, { limit: 20 }).then((cands) => ({ ...o, cands })).catch(() => ({ ...o, cands: [] }))));
    for (const { phrase: p, workOnly, cands } of results) {
      // the phrase names a concept or place outright ("nirvana", "Shiraz") → it is not a person/work request
      //   — unless a person/work bears exactly that name too ("Vahid" the man and the 19-year cycle: the man is the object)
      const exact = (c) => fold(c.name).trim() === fold(p).trim();
      if ((cands || []).some((c) => !['person', 'work'].includes(c.type) && exact(c)) && !(cands || []).some((c) => ['person', 'work'].includes(c.type) && exact(c))) return null;
      // a "<work> by <person>" split names a WORK; the person is only the attribution being asked about
      const hit = (cands || []).find((c) => (workOnly ? c.type === 'work' : ['person', 'work'].includes(c.type)) && nameMatches(p, c.name));
      if (hit) return { type: hit.type, id: hit.id, name: hit.name, matched: p };
    }
  } catch { /* no lookup → no rule */ }
  return null;
}
