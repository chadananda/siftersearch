// Transliteration-invariant name key — RECALL / LOOKUP ONLY, never a binding decision.
// Perso-Arabic romanization varies in vowels AND consonants (Arabic↔Persian): th↔s (Kawthar/Kosar), ḍ/d↔z + w↔v
// (Riḍván/Rezvan), q↔gh, ṭ↔t. We COARSELY bucket names so any spelling finds its candidates fast (no AI). This is a
// recall net that over-generates and claims NO equivalence — the actual fold/identity decision is evidence-based.
// Used by the entity-lookup API (fast, AI-free) and the reconcile candidate-gen.
const HON = new Set('mirza mulla molla siyyid sayyid seyyed haji hajji hajj aqa aqay agha shaykh sheikh shaikh ustad ustadh karbilai karbalai mashhadi mir khan the of ibn bin abu abi umm son daughter'.split(' '));

function tokenSkeletons(tok) {
  let s = tok.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['`ʻ‘’ʼ]/g, '');
  s = s.replace(/[aeiou]w(?=[bcdfghjklmnpqrstvwxz]|$)/g, 'o').replace(/[aeiou]y(?=[bcdfghjklmnpqrstvwxz]|$)/g, 'i');
  s = s.replace(/kh/g, 'X').replace(/[gq]h/g, 'Q').replace(/sh/g, 'C').replace(/ch/g, 'C')
    .replace(/zh/g, 'Z').replace(/th/g, 'S').replace(/dh/g, 'Z').replace(/ph/g, 'F').replace(/ck/g, 'K');
  const cls = { b: 'b', p: 'p', t: 't', s: 'S', S: 'S', c: 'S', C: 'S', j: 'j', x: 'X', X: 'X', q: 'Q', Q: 'Q', k: 'K', g: 'g', f: 'F', F: 'F', z: 'Z', Z: 'Z', h: 'h', m: 'm', n: 'n', l: 'l', r: 'r' };
  const seq = [];
  for (const ch of [...s]) {
    if ('aeiouyáéíóúàèìòùâêîôûäëïöü'.includes(ch)) continue;
    if (ch === 'd') seq.push('D?');
    else if (ch === 'w' || ch === 'v') seq.push('W?');
    else if (cls[ch]) seq.push(cls[ch]);
  }
  let variants = [''];
  for (const sym of seq) {
    if (sym === 'D?') variants = variants.flatMap((v) => [v + 'd', v + 'Z']);
    else if (sym === 'W?') variants = variants.flatMap((v) => [v + 'V', v]);
    else variants = variants.map((v) => v + sym);
  }
  return new Set(variants.map((v) => v.replace(/(.)\1+/g, '$1')).filter((v) => v.length >= 2));
}

export function skeletonKeys(name) {
  const toks = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((t) => t.length > 1 && !HON.has(t));
  const keys = new Set();
  for (const t of toks) {
    for (const k of tokenSkeletons(t)) keys.add(k);
    // Short/title names (Báb, Alí, Vaḥíd) collapse to a <2-char skeleton and would be UNFINDABLE. Add a
    // vowel-kept fallback key ("~bab", "~ali") so they still bucket (exact short-name recall; over-gen is fine).
    if (t.length <= 4) keys.add(`~${t}`);
  }
  return keys;
}
export const shareKey = (a, b) => { const B = skeletonKeys(b); for (const k of skeletonKeys(a)) if (B.has(k)) return true; return false; };
