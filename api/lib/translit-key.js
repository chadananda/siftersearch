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

// ── Arabic/Persian-script keys ────────────────────────────────────────────────
// The TRUE identity key for Perso-Arabic names: the script itself. Transliteration (skeletonKeys) is a lossy,
// model-produced derivative that fragments Persian sources; the original script (stored on entity_mentions_v2.surface)
// is unambiguous. Perso-Arabic script already omits short vowels, so the letters ARE the consonantal skeleton — we
// only normalise script variants (ك↔ک, ي↔ی, ة↔ه, hamza forms) + strip harakat/tatweel/ZWNJ + honorifics/article.
// RECALL / compare ONLY (like skeletonKeys) — never a binding decision. Keys are `ar:<token>` (namespaced from Latin).
const AR_MARKS = /[ً-ْٰـ‌‍‎‏ؐ-ؚۖ-ۭ]/g; // harakat, tatweel, ZWNJ/ZWJ, marks
const AR_HON = new Set(['حضرت', 'آقا', 'آقاى', 'آقای', 'اقا', 'میرزا', 'ميرزا', 'ملا', 'ملّا', 'مولا', 'شیخ', 'شيخ', 'سید', 'سيد', 'سیّد', 'حاجی', 'حاجى', 'حاجّی', 'حاج', 'جناب', 'مولانا', 'خان', 'بیگ', 'بگ', 'امیر', 'امير', 'مير', 'ابن', 'بن', 'ابو', 'ام', 'الحاج', 'کربلایی', 'مشهدی', 'استاد', 'ملّای']);
function arNorm(s) {
  return String(s || '').replace(AR_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ء/g, '')          // hamza-alef variants → bare alef; drop standalone hamza
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ی')              // hamza carriers → base letter
    .replace(/ك/g, 'ک').replace(/[يى]/g, 'ی').replace(/[ةۀ]/g, 'ه'); // Arabic→Persian kaf/yeh; teh-marbuta/heh→heh
}
const arTokens = (name) => arNorm(name).split(/[\s\-ـ.,،؛]+/).map((t) => t.replace(/^ال/, '')).filter((t) => t.length >= 2 && !AR_HON.has(t));
export function arabicKeys(name) {
  const n = arNorm(name);
  if (!/[؀-ۿ]/.test(n)) return new Set();     // no Perso-Arabic script → nothing to key
  return new Set(arTokens(name).filter((t) => /[؀-ۿ]/.test(t)).map((t) => `ar:${t}`));
}
// The nisba (place/tribe adjective, e.g. رشتی/یزدی) — a distinctive namesake discriminator, unambiguous in Arabic
// script. CONSERVATIVE (a false nisba would cause a wrong verify-gate reject): need ≥2 tokens (a bare name has no
// nisba), the last ی-ending token of ≥4 chars, and NOT a common given name that happens to end in ی (علی/تقی are
// only 3 chars so already excluded by length; یحیی/مهدی/هادی need the stoplist). Returns `ar:<token>` or null.
const AR_GIVEN_YE = new Set(['یحیی', 'مهدی', 'هادی', 'نبی', 'زکی', 'ولی', 'صفی', 'وفی']);
export function arabicNisba(name) {
  const toks = arTokens(name).filter((t) => /[؀-ۿ]/.test(t));
  if (toks.length < 2) return null;
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i];
    if (t.length >= 4 && t.endsWith('ی') && !AR_GIVEN_YE.has(t)) return `ar:${t}`;
  }
  return null;
}
// Union recall net: transliteration skeletons ∪ Arabic-script keys. Use this wherever a name may be Latin OR
// Perso-Arabic (candidate recall, lookup index) so both scripts bucket into the same net.
export function nameKeys(name) {
  const keys = skeletonKeys(name);
  for (const k of arabicKeys(name)) keys.add(k);
  return keys;
}
