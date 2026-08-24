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
export const RANK = Object.freeze({
  NONE: 0,          // unrecognized source — carries no interpretive weight at all
  SCHOLAR: 10,      // Balyuzi, Momen, Saiedi, Lawson… authoritative for FACTS, never for characterization
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
  ['scholar', RANK.SCHOLAR],
]);

// Unknown sources return NONE rather than a floor value: an unattributed interpretation must not be
// able to win a tie against a cited one merely by existing.
export function interpretiveRank(authority) {
  const k = String(authority || '').toLowerCase().replace(/[‘’]/g, "'").trim();
  return AUTHORITY.get(k) ?? RANK.NONE;
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
const REGISTER = /\b(advent|manifestation|revelation|prophec|promised|awaited|son of man|day of god|resurrection|dispensation|the qa'im|covenant|divine|spiritual)/i;
const MUNDANE = /\b(rain|sky|weather|storm|fields|grey|gray|drizzle|forecast|umbrella|thunder|overcast)/i;

// DEFAULT JUDGE — a deterministic BACKSTOP, not an understanding of the text.
//
// Deciding whether "clouds" carries the authoritative sense or just means weather is a judgment call,
// and judgment belongs to a model with the passage in front of it (inject `judge`). This fallback
// exists so the doctrine is testable offline and so a model outage degrades to silence rather than to
// guessing. It therefore UNDER-BINDS by construction: it binds only on positive register evidence and
// refuses whenever the passage looks plainly physical. A missed binding costs recall, which a later
// pass can recover; a wrong binding puts a fabricated interpretation into the corpus, which nothing
// downstream can detect. Those costs are not symmetric, so the tie goes to refusing.
function judgeFit(entry, occ) {
  const ctx = String(occ?.context || '');
  if (MUNDANE.test(ctx)) return false;
  return REGISTER.test(ctx);
}

// Bind an occurrence of a surface form to its authoritative interpretation — or to nothing.
// Returns null rather than a low-confidence guess; callers must handle null as the normal case.
export function bindOccurrence(lex = [], occ = {}, { judge = judgeFit } = {}) {
  const surface = String(occ.surface || '').toLowerCase().trim();
  if (!surface) return null;
  const candidates = lex.filter((e) =>
    String(e.gloss || '').toLowerCase() === surface ||
    (e.aliases || []).some((a) => String(a).toLowerCase() === surface));
  if (!candidates.length) return null;
  // Highest interpretive authority wins among candidates that fit; an unfit candidate never binds.
  const fit = candidates.filter((e) => judge(e, occ)).sort((a, b) => interpretiveRank(b.authority) - interpretiveRank(a.authority));
  if (!fit.length) return null;
  const e = fit[0];
  // §6: the interpretive layer is ADDITIVE. Scripture read metaphorically does not thereby become
  // false read literally, and this structure must never encode that it does — hence replacesLiteral
  // is a stated false, not an omission a caller could read either way.
  return {
    root: e.root, gloss: e.gloss, sense: e.sense,
    authority: e.authority, rank: interpretiveRank(e.authority),
    citation: e.citation, key: conceptKey(e),
    layer: 'metaphorical', replacesLiteral: false,
  };
}
