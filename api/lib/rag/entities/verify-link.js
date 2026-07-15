// entities/verify-link — EEWA deterministic contradiction check. Compares cluster facts vs candidate
// facts across 6 discriminative axes; any hard conflict → REJECT (prevents fabrication via false merge).
// Pure function: no async, no ports, no DB. Called by reconcile/project AFTER a LINK is proposed.

// ── consonant-skeleton helper (inline — boundary forbids import) ──────────────
// Strips vowels + diacritics so transliteration variants compare equal (Turshízí = Torshizi).
// NFD decomposes combined chars; strip combining marks (U+0300–U+036F); drop a e i o u; collapse repeats.
function skeleton(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip combining diacritics
    .replace(/[ʼʻ'''`]/g, '')                           // strip apostrophe variants
    .replace(/[aeiou]/g, '')                             // drop vowels
    .replace(/(.)\1+/g, '$1');                           // collapse repeats
}

// ── nisba extraction ──────────────────────────────────────────────────────────
// Nisbas are trailing -í adjectives in Persian/Arabic names (romanized with acute accent).
// Detect: after NFD+strip-diacritics+lowercase the token ends with 'i' (de-accented -í).
// Store as the consonant-skeleton of the WHOLE token so transliteration variants compare equal
// (Turshízí and Torshizi both → trshz). Single-char tokens (iẓáfa 'i') are skipped.
function nisbas(name) {
  const tokens = name.split(/[\s-]+/);
  const out = new Set();
  for (const t of tokens) {
    // Check if original token (after NFD+strip-diacritics+lowercase) ends with 'i' → nisba marker
    const plain = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ''`]/g, '');
    if (plain.length < 2 || !plain.endsWith('i')) continue;
    const sk = skeleton(t);            // consonant root (vowels gone; 'i' ending already stripped by vowel-drop)
    if (sk.length >= 2) out.add(sk);  // ≥2 consonants = a real place root, not just a suffix
  }
  return out;
}

// ── year extraction ──────────────────────────────────────────────────────────
// Extract the first 4-digit year from a fact's `when` field; ignore context-only years on non-anchor
// facts (a scene year is not the person's lifespan anchor unless relation is born/died).
const BORN_RELS = new Set(['born']);
const DIED_RELS = new Set(['died', 'death-place', 'martyred']);
function yearFromFact(f) {
  if (!f.when) return null;
  const m = f.when.match(/\b(\d{4})\b/);
  return m ? +m[1] : null;
}
function lifespan(facts) {
  let born = null, died = null;
  for (const f of facts) {
    const y = yearFromFact(f);
    if (!y) continue;
    if (BORN_RELS.has(f.relation)) born = y;
    if (DIED_RELS.has(f.relation)) died = y;
  }
  return { born, died };
}

// ── text normalization for role / kinship comparison ─────────────────────────
// Strip the most common filler words so "governor of Zanján" ≠ "governor of Shíráz"
// is caught, but "teacher" ≈ "teacher of Islamic studies" stays compatible.
const FILLER = /\b(of|the|a|an|in|at|and|or|was|served|as|his|her|their)\b/gi;
function normalizeRole(s) { return skeleton(s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim()); }

// ── side classification ───────────────────────────────────────────────────────
// Bábí and Bahá'í are the same allegiance arc (final shift is normal). Opponent is distinct.
function sideClass(s) {
  const l = s.toLowerCase();
  if (/bah[aá]/.test(l) || /bab[ií]/.test(l)) return 'believer';
  if (/opponent|adversar|enemy|foe|antagonist/.test(l)) return 'opponent';
  return 'other';
}

// ── role compatibility ────────────────────────────────────────────────────────
// Two role strings are INCOMPATIBLE only when both are specific and clearly name different roles.
// Compatible when: skeletons equal, or one is a strict substring of the other (specialization).
// Incompatible when: different after normalization and neither contains the other.
// "governor of Zanján" vs "governor of Shíráz" → skeletons gvrnrznjn vs gvrnrshrz → neither
// contains the other → incompatible. "teacher" vs "teacher of Islamic studies" → former is a
// substring of the latter → compatible (same role, one more specific).
function rolesIncompatible(a, b) {
  const sa = normalizeRole(a), sb = normalizeRole(b);
  if (sa === sb) return false;
  if (sa.includes(sb) || sb.includes(sa)) return false;  // one is a specialization of the other
  return true;
}

// ── kinship: extract relation-type prefix + target ────────────────────────────
// "son of X" → { rel: 'son', target: 'of x' }; we extract the first word as the relation type
// and the rest (after 'of') as the target to compare by skeleton.
function parseKinship(statement) {
  const m = statement.match(/^(son|daughter|father|mother|brother|sister|wife|husband|uncle|aunt|nephew|niece|cousin)\s+of\s+(.+)/i);
  if (!m) return null;
  return { rel: m[1].toLowerCase(), target: skeleton(m[2]) };
}

// ── the verification gate ────────────────────────────────────────────────────
export function verifyLink(cluster, candidate) {
  const cFacts = cluster.facts || [];
  const eFacts = candidate.facts || [];
  const NO_CONFLICT = { ok: true, axis: null, reason: 'no contradiction' };

  // 1. nisba — disjoint nisba sets (both non-empty, no overlap) → REJECT
  const cn = nisbas(cluster.name), en = nisbas(candidate.name);
  if (cn.size > 0 && en.size > 0) {
    // Disjoint: no skeleton in cn appears in en
    const shared = [...cn].some((s) => en.has(s));
    if (!shared) return { ok: false, axis: 'nisba', reason: `nisba mismatch: cluster '${cluster.name}' vs candidate '${candidate.name}'` };
  }

  // 2. era — only reject when BOTH have birth+death anchors that form an impossible lifespan.
  // A scene-year alone (when but no born/died relation) is NOT a lifespan anchor → do not reject.
  const cls = lifespan(cFacts), els = lifespan(eFacts);
  if (cls.born !== null && els.died !== null && cls.born > els.died)
    return { ok: false, axis: 'era', reason: `era impossible: born ${cls.born} > died ${els.died}` };
  if (els.born !== null && cls.died !== null && els.born > cls.died)
    return { ok: false, axis: 'era', reason: `era impossible: born ${els.born} > died ${cls.died}` };

  // 3. death — if BOTH have a death year and they differ → REJECT
  if (cls.died !== null && els.died !== null && cls.died !== els.died)
    return { ok: false, axis: 'death', reason: `death year conflict: ${cls.died} vs ${els.died}` };
  // death-place conflict: both have 'death-place' fact and they differ by skeleton
  const cdp = cFacts.find((f) => f.relation === 'death-place');
  const edp = eFacts.find((f) => f.relation === 'death-place');
  if (cdp && edp && skeleton(cdp.statement) !== skeleton(edp.statement))
    return { ok: false, axis: 'death', reason: `death-place conflict: '${cdp.statement}' vs '${edp.statement}'` };

  // 4. role — incompatible specific offices (held-office only; has-title is too generic to reject on)
  // "governor of Zanján" vs "governor of Shíráz" both held-office with different places → REJECT.
  // "has-title" (honorifics, epithets) can legitimately differ between sources → never reject on it.
  const cRoles = cFacts.filter((f) => f.relation === 'held-office');
  const eRoles = eFacts.filter((f) => f.relation === 'held-office');
  for (const cr of cRoles) {
    for (const er of eRoles) {
      if (rolesIncompatible(cr.statement, er.statement))
        return { ok: false, axis: 'role', reason: `office conflict: '${cr.statement}' vs '${er.statement}'` };
    }
  }

  // 5. kinship — same relation type (son-of / daughter-of etc) pointing to DIFFERENT people
  const cKin = cFacts.filter((f) => f.relation === 'related-to').map((f) => parseKinship(f.statement)).filter(Boolean);
  const eKin = eFacts.filter((f) => f.relation === 'related-to').map((f) => parseKinship(f.statement)).filter(Boolean);
  for (const ck of cKin) {
    for (const ek of eKin) {
      if (ck.rel === ek.rel && ck.target !== ek.target)
        return { ok: false, axis: 'kinship', reason: `kinship conflict: ${ck.rel} of '${ck.target}' vs '${ek.target}'` };
    }
  }

  // 6. side — soft FLAG only; Bábí/Bahá'í are the same arc; only opponent-vs-believer is notable
  const cSide = cFacts.find((f) => f.relation === 'side');
  const eSide = eFacts.find((f) => f.relation === 'side') || (candidate.side ? { statement: candidate.side } : null);
  if (cSide && eSide) {
    const cc = sideClass(cSide.statement), ec = sideClass(eSide.statement);
    if (cc !== ec && (cc === 'opponent' || ec === 'opponent'))
      return { ok: true, axis: 'side', reason: `side mismatch: '${cSide.statement}' vs '${eSide.statement}' (flag)` };
  }

  return NO_CONFLICT;
}
