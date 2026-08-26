// Concept identity — the prerequisite for cross-referencing a concept found in a historical text back to
// its expression in the core Writings. Without it, "the clouds" in the Dawn-Breakers and "the clouds" in
// the Kitáb-i-Íqán are two unrelated strings.
//
// Measured 2026-08-25: 6,449 distinct subjects across 9,707 claims, only 162 appearing in 3+ books.
// `Mashriqu'l-Adhkár` had NINE surface forms differing only in diacritics and apostrophe style;
// `Administrative Order` / `the Administrative Order` were two identities holding 117 claims between them.
// Deterministic folding collapses 674 such groups covering 3,626 claims — 37% of everything extracted.
//
// TWO TIERS, and conflating them is exactly how an identity model over-merges:
//   canonicalSurface() — folds TRUE variants (article, case, diacritics, apostrophe style). Safe to merge.
//   recallKeys()       — translit-invariant skeletons, reusing the entity track's skeletonKeys. RECALL
//                        ONLY: it proposes candidates and must never decide a merge by itself, exactly as
//                        entityLookup is documented ("bind by evidence, not by this list").
//
// Deps: translit-key.js (the ONE transliteration-invariant key owner — do not write a second normaliser).
import { skeletonKeys } from '../../translit-key.js';

/**
 * Canonical form for merging true surface variants. Folds: leading article, case, combining diacritics,
 * apostrophe/quote style, and whitespace. Deliberately conservative — it must never merge two genuinely
 * different concepts, so nothing semantic happens here.
 */
export function canonicalSurface(surface) {
  return String(surface ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')     // diacritics: Aḏhkár → Adhkar
    .replace(/[‘’'`ʻʼ"]/g, '')        // apostrophe zoo: Mashriqu’l → Mashriqul
    .toLowerCase()
    .replace(/^\s*(the|a|an)\s+/, '')                     // article: "the Administrative Order"
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Translit-invariant recall keys. RECALL ONLY — never a merge decision. */
export function recallKeys(surface) {
  if (!surface) return new Set();
  try { return new Set(skeletonKeys(String(surface))); } catch { return new Set(); }
}

/**
 * Group surfaces by canonical form.
 * @returns [{ canonical, key, members[], count }] — `members` is kept so every merge is auditable rather
 *          than a silent rewrite, and `canonical` is the MOST FREQUENT surface (the form readers actually
 *          see), not whichever happened to be encountered first.
 */
export function groupBySurface(surfaces = []) {
  const buckets = new Map();
  for (const s of surfaces) {
    const k = canonicalSurface(s);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, { key: k, members: [], counts: new Map() });
    const b = buckets.get(k);
    if (!b.members.includes(s)) b.members.push(s);
    b.counts.set(s, (b.counts.get(s) || 0) + 1);
  }
  return [...buckets.values()].map((b) => {
    let canonical = b.members[0], best = -1;
    for (const [surface, n] of b.counts) if (n > best) { best = n; canonical = surface; }
    return { canonical, key: b.key, members: b.members, count: [...b.counts.values()].reduce((a, c) => a + c, 0) };
  });
}

// ── Concept-worthiness ───────────────────────────────────────────────────────
// The half of the problem folding cannot fix. The extractor emits ad-hoc noun phrases from the passage
// alongside real concepts — sampled singles included "pioneering at home", "double crusade", "Teaching
// Conferences", "garb of a prisoner". Project doctrine is explicit: the concept type is significant
// doctrinal/technical terms, NEVER generic phrases.
//
// This is a FLAG, not a filter. It marks a subject as probably-not-a-concept for review; nothing is
// deleted on its strength. The real fix belongs in the extractor prompt, which alone sees enough context
// to judge — this exists so the existing 9,707 claims can be triaged without another extraction run.

// Marks of a doctrinal term: transliterated Arabic/Persian, or a capitalised term of art.
const TRANSLITERATED = /[ء-ي]|[áíúéóāīūḥḍṣṭẓʻʼ‘’]|(?:í|á|ú)\b/i;
const SUPERLATIVE = /\b(most great|all-|divine|holy|sacred|supreme|primal|eternal|manifestation|covenant|dispensation|revelation)\b/i;

// Marks of a passage phrase: an activity, an ordinary plural, a mundane modifier.
const ACTIVITY = /\b(pioneering|teaching conferences?|crusade|campaign|conventions?|committees?|budgets?|schedules?)\b/i;
const MUNDANE_HEAD = /\b(garb|structure|adherents?|children|home|conference|meeting|programme|program)\b/i;

/**
 * @returns true when the surface looks like a doctrinal concept worth indexing.
 *
 * NEVER consults frequency. "the two Witnesses" occurs once today only because 61% of the Íqán has never
 * been extracted — pruning by count would encode our coverage gaps as doctrinal judgements, the same
 * error as reading "plan exhausted" off an unfinished run.
 */
export function isLikelyConcept(surface) {
  const s = String(surface ?? '').trim();
  if (!s) return false;
  if (ACTIVITY.test(s)) return false;
  if (TRANSLITERATED.test(s) || SUPERLATIVE.test(s)) return true;   // doctrinal marks win outright
  if (MUNDANE_HEAD.test(s)) return false;
  const bare = canonicalSurface(s);
  const words = bare.split(' ').filter(Boolean);
  if (words.length > 4) return false;                               // a clause, not a term
  // A capitalised term of art ("the Covenant", "the Sun of Truth") reads as a concept; an all-lowercase
  // descriptive phrase ("lowliest adherents") does not.
  return /[A-Z]/.test(s.replace(/^\s*(The|A|An)\s+/, ''));
}
