// concepts/lexicon — SEED the interpretive lexicon: the cumulative, authority-ranked, CITED map of
// symbol → interpretation. Deterministic aggregation (no AI) of the interpretation-claims the extract found
// in a higher text (the higher texts ARE interpretation, so extracting them POPULATES the lexicon). Grows
// TOP-DOWN as books are processed in authority order; later spent bottom-up by concepts/reconcile. Each entry
// carries its authority + interpretive tier + verbatim proof.
export async function seed(ctx, docId, opts = {}) {
  const authority = opts.authority ?? (await ctx.store.getDocMeta(docId)).title ?? String(docId);
  const authorityTier = opts.authorityTier ?? ctx.config.authorityTiers?.[docId] ?? 50; // lower = higher authority
  const version = opts.version ?? ctx.config.versions?.conceptExtract ?? 'concept-extract-v1';
  const claims = await ctx.store.getConceptInterpretations(docId);
  const entries = claims.map((c) => lexiconEntry(c, { authority, authorityTier, methodVersion: version }));
  // Idempotent: clear this doc's prior lexicon entries (same method version) before re-seeding, so a re-run
  // after more claims are extracted refreshes rather than duplicates.
  if (!opts.dryRun) await ctx.store.clearLexicon?.(docId, version);
  const written = opts.dryRun ? 0 : await ctx.store.saveLexiconEntries(entries);
  const stats = { claims: claims.length, entries: entries.length, written };
  ctx.log.info?.({ docId, ...stats }, 'concepts/lexicon.seed');
  return stats;
}

// An interpretation claim (symbol → what an authority says it means) becomes a cited lexicon entry.
// §6 requires literal and metaphorical to be DISTINCT, ATTRIBUTED layers. This used to be hardcoded to
// 'metaphorical', so every entry claimed to be a metaphor — including "Chicago = the first Bahá'í center in
// the Western world", a plain fact about a city, which is precisely the over-binding §6 warns against.
//
// Only three of the extractor's relations are unambiguously figurative. `means` and `teaches` span both —
// "the Sun of Truth MEANS Bahá'u'lláh" is metaphor, "Chicago MEANS the first Bahá'í center" is not — and only
// the extractor sees enough to tell. So an undetermined layer is NULL, never a default guess: under-bind
// rather than assert. A claim that states its own layer is always honoured.
//
// The complete fix is for the extractor to emit `layer` per claim; that needs a column on concept_claims
// (migration 90 has none) and so a migration + CURRENT_VERSION bump. Deliberately not smuggled in here.
const FIGURATIVE = new Set(['symbolizes', 'interprets', 'fulfills']);
export function layerOf(c) {
  if (c?.layer === 'literal' || c?.layer === 'metaphorical') return c.layer;
  return FIGURATIVE.has(String(c?.relation || '').toLowerCase()) ? 'metaphorical' : null;
}

export function lexiconEntry(c, { authority, authorityTier, methodVersion }) {
  return {
    symbol: c.subject,
    interpretation: c.target || c.statement || '',
    authority, authorityTier, layer: layerOf(c),
    proofDocId: c.doc_id, proofParaId: c.para_id, proofVerbatim: c.proof_verbatim,
    methodVersion,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The interpretive lexicon as a VALUE (conceptual track §3/§6).
//
// Everything above builds the lexicon from the DB. Everything below operates on it as a plain
// in-memory structure: rank an authority, admit a cited entry, key a concept, bind an occurrence.
// Pure and dependency-free so the doctrine can be tested without a database.
// ─────────────────────────────────────────────────────────────────────────────

// Precedence among authorized interpreters is by DESIGNATED ROLE AND TIMELINE, not by station.
// The revealed Word is supreme AS REVELATION; interpreting it was Shoghi Effendi's exclusive
// authorized function, and he was the LAST authorized interpreter — so where readings appear to
// differ, his governs. An earlier statement reaches us already filtered through our own reading,
// which a later authorized interpreter resolves. This is why the ordering looks inverted against
// station and is nonetheless correct: it ranks interpretive authority, not rank in the Faith.
//
// Every authorized voice outranks every scholar. Scholars fill gaps the authorized texts leave;
// they never re-characterize what those texts have characterized.
// INTERPRETIVE authority — a claim about designated ROLE and TIMELINE, never about station. Authorized
// interpretation ended with Shoghi Effendi, the last authorized interpreter, so his written word ranks
// highest FOR INTERPRETATION. That is not a statement about the rank of the Revelation itself.
//
// The subtle part, and the one the first version of this ladder got backwards (Chad, 2026-08-25):
// "non-authoritative" is RELATIVE. A pilgrim's note is non-authoritative *relative to the written works*
// of the same figure — it is unauthenticated recollection. But it remains more authoritative than every
// human and every institution that comes AFTER Shoghi Effendi, because none of them holds the
// interpretive role at all. Scholars and later institutions constantly advance readings, and treating
// those readings as carrying weight is only defensible if they are understood to sit BENEATH even a
// pilgrim's note. The old ladder had SCHOLAR as a real tier with no pilgrim tier above it, which encodes
// precisely the inversion this comment exists to forbid.
export const RANK = Object.freeze({
  NONE: 0,             // unrecognized / unattributed — carries no interpretive weight at all
  // The NON-DOCTRINAL tier. Scholars (Balyuzi, Momen, Saiedi…), every House of Justice, and the
  // appointed branch that advises it (Hands of the Cause, Counsellors, Auxiliary Board).
  // A House of Justice HAS authority — legislative, real and binding — but doctrinal authority is a
  // different kind, and it ended with the Guardian: "Any house of justice has legislative authority but
  // no doctrinal authority. They are even guided by the appointed branch of scholars who act as advisors
  // who also have no doctrinal authority" (Chad, 2026-08-25). So for deciding what a symbol MEANS they
  // carry no interpretive weight — above unattributed, because a cited institutional statement is not
  // nothing, and below a pilgrim note, because none of them holds the interpretive role at all.
  SCHOLAR: 5,
  PILGRIM: 12,         // reported words of an authorized interpreter, source not further specified
  PILGRIM_ABDUL_BAHA: 14,
  PILGRIM_SHOGHI: 16,  // reported words of the LAST interpreter — highest of the reported tiers
  THE_BAB: 20,
  BAHAULLAH: 30,
  ABDUL_BAHA: 40,
  SHOGHI_EFFENDI: 50,
});

const AUTHORITY = new Map([
  ['shoghi-effendi', RANK.SHOGHI_EFFENDI], ['shoghieffendi', RANK.SHOGHI_EFFENDI], ['guardian', RANK.SHOGHI_EFFENDI],
  ['abdul-baha', RANK.ABDUL_BAHA], ['abdulbaha', RANK.ABDUL_BAHA], ["'abdu'l-baha", RANK.ABDUL_BAHA],
  ['bahaullah', RANK.BAHAULLAH], ["baha'u'llah", RANK.BAHAULLAH],
  ['the-bab', RANK.THE_BAB], ['bab', RANK.THE_BAB],
  ['shoghi-effendi-pilgrim', RANK.PILGRIM_SHOGHI], ['pilgrim-shoghi', RANK.PILGRIM_SHOGHI],
  ['abdul-baha-pilgrim', RANK.PILGRIM_ABDUL_BAHA], ['pilgrim-abdul-baha', RANK.PILGRIM_ABDUL_BAHA],
  ['pilgrim', RANK.PILGRIM], ['pilgrim-note', RANK.PILGRIM],
  ['scholar', RANK.SCHOLAR], ['institution', RANK.SCHOLAR],
  // Houses of Justice — legislative authority, no doctrinal authority.
  ['universal-house-of-justice', RANK.SCHOLAR], ['uhj', RANK.SCHOLAR],
  ['house-of-justice', RANK.SCHOLAR], ['national-spiritual-assembly', RANK.SCHOLAR],
  ['local-spiritual-assembly', RANK.SCHOLAR], ['spiritual-assembly', RANK.SCHOLAR],
  // The appointed branch — advisers to the Houses, and no more doctrinally authoritative than they are.
  ['hands-of-the-cause', RANK.SCHOLAR], ['hand-of-the-cause', RANK.SCHOLAR],
  ['counsellor', RANK.SCHOLAR], ['counselor', RANK.SCHOLAR],
  ['auxiliary-board', RANK.SCHOLAR], ['auxiliary-board-member', RANK.SCHOLAR],
]);

// Works whose AUTHOR is the authority. The lexicon stored the BOOK TITLE in its `authority` column, so
// interpretiveRank('God Passes By') found no key and fell to NONE — leaving 938 entries, including the
// whole of GPB, at tier 0 while four other Shoghi Effendi works sat at 50 (found 2026-08-25). Resolving
// titles here fixes the ordering without a schema change.
const WORK_AUTHOR = new Map([
  ['god passes by', RANK.SHOGHI_EFFENDI], ['the world order of bahaullah', RANK.SHOGHI_EFFENDI],
  ['the promised day is come', RANK.SHOGHI_EFFENDI], ['the advent of divine justice', RANK.SHOGHI_EFFENDI],
  ['citadel of faith', RANK.SHOGHI_EFFENDI], ['messages to the bahai world', RANK.SHOGHI_EFFENDI],
  ['the dispensation of bahaullah', RANK.SHOGHI_EFFENDI],
  ['some answered questions', RANK.ABDUL_BAHA], ['paris talks', RANK.ABDUL_BAHA],
  ['the secret of divine civilization', RANK.ABDUL_BAHA], ['tablets of the divine plan', RANK.ABDUL_BAHA],
  ['the kitab-i-iqan', RANK.BAHAULLAH], ['the kitab-i-aqdas', RANK.BAHAULLAH],
  ['the hidden words', RANK.BAHAULLAH], ['hidden words', RANK.BAHAULLAH],
  ['gleanings from the writings of bahaullah', RANK.BAHAULLAH],
  ['the seven valleys', RANK.BAHAULLAH], ['the four valleys', RANK.BAHAULLAH],
  ['the persian bayan', RANK.THE_BAB], ['the arabic bayan', RANK.THE_BAB],
  ['selections from the writings of the bab', RANK.THE_BAB],
]);

// Title normalisation for WORK_AUTHOR: fold diacritics and drop the punctuation that varies between
// editions, so "The World Order of Bahá'u'lláh" and "the world order of bahaullah" are one key.
const titleKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[''`\u2018\u2019".,:;]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

// Unknown sources return NONE rather than a floor value: an unattributed interpretation must not be
// able to win a tie against a cited one merely by existing.
export function interpretiveRank(authority) {
  const k = String(authority || '').toLowerCase().replace(/[‘’]/g, "'").trim();
  const direct = AUTHORITY.get(k);
  if (direct !== undefined) return direct;
  // Fall back to resolving a work title to its author. A pilgrim-note source is detected by marker so a
  // note ABOUT an interpreter never inherits that interpreter's written-work rank.
  const t = titleKey(authority);
  if (/pilgrim/.test(t)) {
    if (/shoghi|guardian/.test(t)) return RANK.PILGRIM_SHOGHI;
    if (/abdu.?l.?baha|master/.test(t)) return RANK.PILGRIM_ABDUL_BAHA;
    return RANK.PILGRIM;
  }
  // Free-text institutional attributions ("The Universal House of Justice, 1968") must not fall to NONE
  // and thereby lose a tie to an unattributed reading.
  if (/house of justice|spiritual assembly|hand of the cause|hands of the cause|counsell?or|auxiliary board/.test(t)) {
    return RANK.SCHOLAR;
  }
  return WORK_AUTHOR.get(t) ?? RANK.NONE;
}

// Concept identity is the ORIGINAL-LANGUAGE ROOT, never the English gloss. Two distinct concepts
// routinely share one English word — insáf (انصاف, personal equity) and 'adl (عدل, societal justice)
// both gloss as "justice" — and keying on the gloss silently merges them into one wrong concept.
// Conversely one root under different romanizations is ONE concept, so the key must be script-based.
// NFC-normalized so visually identical Arabic composed differently still keys the same.
export function conceptKey(entry) {
  const root = String(entry?.root || '').normalize('NFC').trim();
  if (!root) throw new Error('conceptKey: entry has no root — concept identity is the root, never the English gloss');
  return `root:${root}`;
}

// An entry is a CITED interpretation or it is not an entry. Both guards below exist because an
// uncited gloss is indistinguishable from an invented one once it is in the lexicon, and the whole
// value of this structure is that every reading in it can be traced to a text.
export function addEntry(lex = [], entry) {
  const c = entry?.citation;
  if (!c || c.docId == null || c.paraId == null) {
    throw new Error('lexicon entry requires a citation {docId, paraId} — interpretations are cited, never invented');
  }
  if (!String(c.span || '').trim()) {
    throw new Error('lexicon entry citation requires a verbatim proof span — a locator without the words proves nothing');
  }
  return [...lex, { ...entry, key: conceptKey(entry), rank: interpretiveRank(entry.authority) }];
}

// Positive evidence that a passage is speaking in the interpretive/eschatological register, and
// evidence that it is speaking plainly about the physical world. Deliberately NOT a general
// classifier — see judgeFit below for why this stays small and why it is only a fallback.
// Registers that RAISE the likelihood of a doctrinal reading. Their absence lowers a score; it never
// zeroes one, because a symbolic work can carry a symbolic sense in an ordinary-sounding sentence.
const REGISTER = /\b(advent|manifestation|revelation|prophec|promised|awaited|son of man|day of god|resurrection|dispensation|the qa'im|covenant|divine|spiritual)/i;
// Concrete/physical vocabulary. This USED TO BE A VETO (`if (MUNDANE.test(ctx)) return false`), which is
// precisely the error Chad corrected on 2026-08-23: in a symbolic work the weather is also a sign, so a
// concrete reading must never be allowed to delete the symbolic one. It now only shifts the RANKING.
const CONCRETE = /\b(rain|sky|weather|storm|fields|grey|gray|drizzle|forecast|umbrella|thunder|overcast)/i;
// A sense whose own wording is literal/physical — used to tell which way CONCRETE context should tilt.
const LITERAL_SENSE = /\b(literal|physical|natural world|actual)\b/i;

/**
 * DEFAULT SCORER — a deterministic BACKSTOP, not an understanding of the text.
 *
 * Returns a fit score in (0,1]. Never returns 0 for a real lexicon sense: under this doctrine a sense
 * can be less likely, but a concrete context is not evidence that the symbolic reading is absent.
 * Real sense-scoring is a judgment call and belongs to a model with the passage in front of it —
 * inject `judge` for that. This exists so the pipeline degrades to something honest without one.
 */
export function scoreSense(entry, occ = {}) {
  const ctx = String(occ?.context || '');
  const literalSense = LITERAL_SENSE.test(String(entry?.sense || ''));
  const doctrinalCtx = REGISTER.test(ctx);
  const concreteCtx = CONCRETE.test(ctx);

  let score = 0.35;                                  // every catalogued sense stays on the table
  if (literalSense) {
    if (concreteCtx) score = 0.85;                   // concrete words, literal sense → strong fit
    else if (doctrinalCtx) score = 0.40;             // still available, just less likely
  } else {
    if (doctrinalCtx) score = 0.90;                  // doctrinal words, symbolic sense → strong fit
    else if (concreteCtx) score = 0.45;              // LOWERED, never eliminated — the whole correction
  }
  return score;
}

/**
 * Bind an occurrence to EVERY sense it may carry, ranked by fit then interpretive authority.
 *
 * Returns an ARRAY, always — `[]` when the surface is unknown. It deliberately does NOT choose: a
 * symbolic text means several things at once, and collapsing that to a winner destroys the thing we
 * are trying to index. Callers that need a headline sense take the first element and must keep the
 * rest; callers that search should index all of them.
 *
 * Ranking is presentation. Membership is the claim.
 */
export function bindSenses(lex = [], occ = {}, { judge = scoreSense, minScore = 0 } = {}) {
  const surface = String(occ.surface || '').toLowerCase().trim();
  if (!surface) return [];
  const candidates = lex.filter((e) =>
    String(e.gloss || '').toLowerCase() === surface ||
    (e.aliases || []).some((a) => String(a).toLowerCase() === surface));
  if (!candidates.length) return [];

  return candidates
    .map((e) => ({
      root: e.root, gloss: e.gloss, sense: e.sense,
      authority: e.authority, rank: interpretiveRank(e.authority),
      citation: e.citation, key: conceptKey(e),
      score: judge(e, occ),
      // §6: the interpretive layer is ADDITIVE. Scripture read metaphorically does not thereby become
      // false read literally, and this structure must never encode that it does — hence replacesLiteral
      // is a stated false, not an omission a caller could read either way.
      layer: LITERAL_SENSE.test(String(e.sense || '')) ? 'literal' : 'metaphorical',
      replacesLiteral: false,
    }))
    .filter((s) => s.score > minScore)
    .sort((a, b) => b.score - a.score || b.rank - a.rank);
}
