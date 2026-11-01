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
ones they them r n rember right real realy really teacher used first given origin taken word advance being who's what's where's
toward towards place english`.split(/\s+/));
// Generic nouns that frame a title ("the text 'The Most Holy Book'") but can also BE part of one ("Most Holy Book"): trimmed only at the edges, as a second try.
const GENERIC = new Set('book work works text document title phrase writing'.split(' '));
// small words and the honorifics the lookup's keys ignore too (translit-key HON): "Mullá Ḥusayn" is matched on "Ḥusayn"
const SMALL = new Set(`the of in by and a an i al el ul l mirza mulla molla siyyid sayyid seyyed haji hajji hajj aqa aqay agha shaykh sheikh shaikh
ustad ustadh khan ibn bin abu abi umm son daughter`.split(/\s+/));
// a central figure's name at the end of a residue (an attribution being asked about, not part of a title)
const FIGURE_TAIL = /\s+(?:by\s+|of\s+|as\s+)?(?:shoghi\s+eff?endi|the\s+guardian|bah[aá][’'ʼ]?u[’'ʼ]?ll[aá]h[’'ʼ]?s?|bahaullah|[’'ʼ]?abdu[’'ʼ]?l[- ]bah[aá]|abdul[- ]baha|the\s+b[aá]b)\s*$/i;
const tokens = (s) => fold(s).replace(/\([^)]*\)/g, ' ').split(/:/)[0].replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((t) => t && !SMALL.has(t));

/** The candidate object phrases of a turn, most literal first: the residue after the request frame, its generic edges
 *  trimmed, and a WORK before "by/of <someone>" ("Hidden Words by Shoghi Effendi" → workOnly). → [{ phrase, workOnly? }]; [] when too long to be a name. */
export function objectPhrases(text) {
  const t = String(text || '').replace(/\b(and )?by whom\b/gi, ' ').replace(/["“”«»?!.,;:()]/g, ' ');
  const words = t.split(/\s+/).map((w) => w.replace(/^['‘’`]+|['‘’`]+$/g, '')).filter(Boolean);
  const kept = words.filter((w) => !WRAP.has(fold(w)) && !/^\d+$/.test(w));
  // a name is at most six significant words ("of", "by" do not count: "text of the Hidden Words by Shoghi Effendi")
  if (!kept.length || kept.filter((w) => !SMALL.has(fold(w))).length > 6) return [];
  const out = [{ phrase: kept.join(' ') }];
  let a = 0, b = kept.length;
  // a generic noun at an edge goes with the connectives beside it ("text of Hidden Words" → "Hidden Words")
  //   (a trailing "by" stays: "God Passes By")
  const edge = (w, lead) => GENERIC.has(fold(w)) || (lead ? /^(of|by|in)$/i : /^(of|in)$/i).test(w);
  while (a < b && edge(kept[a], true)) a++;
  while (b > a && edge(kept[b - 1], false)) b--;
  // lead trimmed, tail trimmed, both: "text Most Holy Book" → "Most Holy Book" (the tail is part of the title)
  for (const [x, y] of [[a, kept.length], [0, b], [a, b]]) if (y > x && (x > 0 || y < kept.length)) out.push({ phrase: kept.slice(x, y).join(' ') });
  const split = kept.slice(a, b).join(' ').split(/\s+(?:by|of)\s+/i);
  if (split.length > 1 && split[0].split(/\s+/).length >= 2) out.push({ phrase: split[0], workOnly: true });
  // a work with the (often wrong) author tacked on: "Hidden Words Shoghi Effendi", "paris talks bahaullah" → the work
  const bare = kept.slice(a, b).join(' ').replace(FIGURE_TAIL, '').trim();
  if (bare && bare !== kept.slice(a, b).join(' ') && bare.split(/\s+/).length >= 2) out.push({ phrase: bare, workOnly: true });
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
export function nameMatches(phrase, candName, { ordered = false } = {}) {
  const q = tokens(phrase), c = tokens(candName);
  if (!q.length || !c.length) return false;
  const k = (t) => skeletonKeys(t);
  // same spelling bucket AND recognisably the same word (the buckets are coarse: "nirvana" shares one with "Núrániyya")
  const share = (x, y) => { if (similar(x, y) < 0.5) return false; const Y = k(y); for (const key of k(x)) if (Y.has(key)) return true; return false; };
  // one word per name word: "nirvana" alone is not "Núrayn-i-Nayyirayn" though its skeleton fits both halves
  if (q.length !== c.length) return false;
  // a person's name keeps its order ("‘Alí-Muḥammad" is not "Muḥammad-‘Alí"); a title may be turned ("paris talks")
  if (ordered) return q.every((x, i) => share(x, c[i]));
  return q.every((x) => c.some((y) => share(x, y))) && c.every((y) => q.some((x) => share(x, y)));
}

// One phrase's candidates → the person/work it names, false when it names a concept/place outright, else null.
function pick(p, workOnly, cands) {
  // the phrase names a concept or place outright ("nirvana", "Shiraz") → it is not a person/work request
  //   — unless a person/work bears exactly that name too ("Vahid" the man and the 19-year cycle: the man is the object)
  const exact = (c) => fold(c.name).trim() === fold(p).trim();
  if ((cands || []).some((c) => !['person', 'work'].includes(c.type) && exact(c)) && !(cands || []).some((c) => ['person', 'work'].includes(c.type) && exact(c))) return false;
  // a "<work> by <person>" split names a WORK; the person is only the attribution being asked about
  //   a person before a work of the same name ("Qurratu'l-'Ayn" the woman, not a book titled after her)
  //   the canonical name or any matched alias surface (entityLookup returns them): "Bábu'l-Báb" is Mullá Ḥusayn's title
  const fits = (c, type) => c.type === type && [c.name, ...(c.surfaces || [])].some((n) => nameMatches(p, n, { ordered: type === 'person' }));
  const hit = (!workOnly && (cands || []).find((c) => fits(c, 'person'))) || (cands || []).find((c) => fits(c, 'work'));
  return hit ? { type: hit.type, id: hit.id, name: hit.name, matched: p } : null;
}

/** → { type: 'person'|'work', id, name, matched } for the first object phrase that names one entity, else null. Never throws. */
export async function resolveNamed(text, { lookup } = {}) {
  const phrases = objectPhrases(text);
  if (!phrases.length) return null;
  try {
    const find = lookup || (await import('./entity-api.js')).entityLookup;
    const results = await Promise.all(phrases.map((o) => find(o.phrase, { limit: 20 }).then((cands) => ({ ...o, cands })).catch(() => ({ ...o, cands: [] }))));
    for (const { phrase: p, workOnly, cands } of results) {
      const hit = pick(p, workOnly, cands);
      if (hit === false) return null;
      if (hit) return hit;
    }
  } catch { /* no lookup → no rule */ }
  return null;
}

// Words that open a sentence or a clause, capitalised only by position — never the start of a name.
const OPENER = new Set(`a an the and but or so then now also yes no ok okay thanks thank please hello hi hey dear does do did is are
was were can could would should will what which who whom whose when where why how in on of for if it its this that these those there he she
they you your we my our his her their let lets regarding as at by from with about given since because though although while after before
once both each every some many most my say said tell give show find quote compare cite explain list send point you'd you're that's it's
isn't doesn't don't`.split(/\s+/));
// …and the ones that are never a name wherever they stand
const NEVER = new Set('i im ive id ill anis'.split(' '));
// connectives that may sit INSIDE a title or a name ("City of God", "John the Baptist", "Kitáb-i-Íqán", "Lights of Guidance")
const INNER = /^(of|the|de|du|la|le|al|el|ul|i|y|von|van|der|and|on|to)$/i;
const CAP = /^[‘’'ʻ`"“*_(]*[\p{Lu}]/u;

/** The spans of a LONG text that may name a work or a person: text set apart in quotation marks or *italics* (≤ 8 words),
 *  and runs of capitalised words joined by title connectives ("City of God", "John the Baptist", "Lights of Guidance"),
 *  a sentence opener dropped. Most specific first, ≤ max. Pure. */
export function nameSpans(text, max = 12) {
  const t = String(text || '');
  const out = [];
  const add = (s) => {
    const x = String(s || '').replace(/^[\s‘’'"“”*_(]+|[\s‘’'"“”*_),.;:!?]+$/g, '').replace(/['’]s$/, '').trim();
    if (x.length >= 3 && x.split(/\s+/).length <= 8 && !out.some((o) => fold(o) === fold(x))) out.push(x);
  };
  for (const m of t.matchAll(/[“"«]([^”"»\n]{3,80})[”"»]|\*([^*\n]{3,80})\*|_([^_\n]{3,80})_/g)) add(m[1] || m[2] || m[3]);
  // a "/" ("Augustine/Plato") parts two names like a comma
  for (const sent of t.replace(/\//g, ', ').split(/(?<=[.!?:;\n]["”’']?)\s+|\s+[—–]\s+|,\s+/)) {
    const words = sent.split(/\s+/).filter(Boolean);
    let run = [];
    const flush = () => { while (run.length && INNER.test(run.at(-1))) run.pop(); if (run.length) add(run.join(' ')); run = []; };
    words.forEach((w, i) => {
      const bare = w.replace(/^[‘’'ʻ`"“*_(]+|[’'"”*_),.;:!?]+$/g, '');
      const f = fold(bare);
      if (CAP.test(w) && !NEVER.has(f) && !(i === 0 && OPENER.has(f))) {
        run.push(bare);
        if (/[,.;:!?)"”]$/.test(w)) flush();
      } else if (run.length && INNER.test(bare)) run.push(bare);
      else flush();
    });
    flush();
  }
  return out.slice(0, max);
}

/** Every person and work a long text names (the whole text scanned, not just a ≤ 6-word object): each span of nameSpans
 *  resolved like a short object, strict whole-name match. → [{ type, id, name, matched }] (distinct, ≤ max). Never throws. */
export async function resolveNamedAll(text, { lookup, max = 6 } = {}) {
  const spans = nameSpans(text);
  if (!spans.length) return [];
  try {
    const find = lookup || (await import('./entity-api.js')).entityLookup;
    const per = await Promise.all(spans.map(async (s) => {
      const phrases = objectPhrases(s);
      const results = await Promise.all(phrases.map((o) => find(o.phrase, { limit: 20 }).then((cands) => ({ ...o, cands })).catch(() => ({ ...o, cands: [] }))));
      for (const { phrase: p, workOnly, cands } of results) {
        const hit = pick(p, workOnly, cands);
        if (hit === false) return null;
        if (hit) return hit;
      }
      return null;
    }));
    const seen = new Set();
    return per.filter((h) => h && !seen.has(h.id) && seen.add(h.id)).slice(0, max);
  } catch { return []; }
}
