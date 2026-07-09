// Transliteration-invariant candidate-generation key — RECALL BACKSTOP ONLY, never a binding decision.
// Perso-Arabic romanization varies in vowels AND consonants (Arabic↔Persian): th↔s (Kawthar/Kosar), ḍ/d↔z + w↔v
// (Riḍván/Rezvan), q↔gh, ṭ↔t, ẓ/ż↔z. We fold those classes and, where a romanized letter is genuinely ambiguous,
// emit BOTH variants. Over-generating candidates is fine — AI+evidence makes the actual bind. Two names are
// candidate-matches iff their key-sets intersect on a distinctive (non-honorific) token.
const HON = new Set('mirza mulla molla siyyid sayyid seyyed haji hajji hajj aqa aqay agha shaykh sheikh shaikh ustad ustadh karbilai karbalai mashhadi mir khan the of ibn bin abu abi umm son daughter'.split(' '));

// fold one token to its consonant skeleton(s); returns a Set (variants for ambiguous letters)
function tokenSkeletons(tok) {
  let s = tok.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['`ʻ‘’ʼ]/g, '');
  // vowel-carrying digraphs first (aw/ow/au → the w is a vowel here: Kawthar→kosar)
  s = s.replace(/[aeiou]w(?=[bcdfghjklmnpqrstvwxz]|$)/g, 'o').replace(/[aeiou]y(?=[bcdfghjklmnpqrstvwxz]|$)/g, 'i');
  // consonant digraphs → single placeholder, folding Arabic↔Persian shifts (th→s, dh→z, gh→q)
  s = s.replace(/kh/g, 'X').replace(/[gq]h/g, 'Q').replace(/sh/g, 'C').replace(/ch/g, 'C')
    .replace(/zh/g, 'Z').replace(/th/g, 'S').replace(/dh/g, 'Z').replace(/ph/g, 'F').replace(/ck/g, 'K');
  // single letters → classes; drop vowels; w/v and d are ambiguous (handled via variants below)
  const cls = { b: 'b', p: 'p', t: 't', s: 'S', S: 'S', c: 'S', C: 'S', j: 'j', x: 'X', X: 'X', q: 'Q', Q: 'Q', k: 'K', g: 'g', f: 'F', F: 'F', z: 'Z', Z: 'Z', h: 'h', m: 'm', n: 'n', l: 'l', r: 'r' };
  const chars = [...s];
  // build base with placeholders for ambiguous d (د/ض) and w/v
  const seq = [];
  for (const ch of chars) {
    if ('aeiouyáéíóúàèìòùâêîôûäëïöü'.includes(ch)) continue;            // drop vowels
    if (ch === 'd') seq.push('D?');                                     // د (d) OR ض (→z)
    else if (ch === 'w' || ch === 'v') seq.push('W?');                  // و: consonant v/w OR long-vowel (drop)
    else if (cls[ch]) seq.push(cls[ch]);
    // else: unknown/punct → skip
  }
  // expand variants
  let variants = [''];
  for (const sym of seq) {
    if (sym === 'D?') variants = variants.flatMap((v) => [v + 'd', v + 'Z']);       // d-class or z-class
    else if (sym === 'W?') variants = variants.flatMap((v) => [v + 'V', v]);        // keep v OR drop (vowel)
    else variants = variants.map((v) => v + sym);
  }
  return new Set(variants.map((v) => v.replace(/(.)\1+/g, '$1')).filter((v) => v.length >= 2)); // collapse doubles, drop trivial
}

export function skeletonKeys(name) {
  const toks = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((t) => t.length > 1 && !HON.has(t));
  const keys = new Set();
  for (const t of toks) for (const k of tokenSkeletons(t)) keys.add(k);
  return keys;
}
export const shareKey = (a, b) => { const B = skeletonKeys(b); for (const k of skeletonKeys(a)) if (B.has(k)) return true; return false; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const pairs = [['Kawthar', 'Kosar'], ['Riḍván', 'Rezvan'], ['Ṣádiq', 'Sadeq'], ['Ṣádiq', 'Sadegh'], ['Ḥusayn', 'Hossein'], ['Muḥammad', 'Mohammad'], ['Ṭáhirih', 'Tahereh'], ['Vaḥíd', 'Wahid'], ['Quddús', 'Ghoddus'], ['Mírzá Aḥmad-i-Azghandí', 'Mirza Ahmad Azgandi'], ['Kawthar', 'Ridvan']];
  for (const [a, b] of pairs) console.log(`${shareKey(a, b) ? '✓ MATCH ' : '✗ no    '} ${a}  ~  ${b}   [${[...skeletonKeys(a)].join(',')}] vs [${[...skeletonKeys(b)].join(',')}]`);
  process.exit(0);
}
