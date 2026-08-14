// Guard against relabelling an ENGLISH work as foreign because its BODY is full of foreign text.
//
// Found in the live proposal queue (2026-08-14): "Preliminary Bibliography of works in French making
// mention of the Babi or Baha'i religions (1945-2000)" was proposed en → fr. It is an English work whose
// content is largely French TITLES — exactly the shape a content-based detector misreads.
//
// The cost of getting this wrong is not cosmetic: a doc relabelled to a language the extraction models
// cannot handle is PARKED by the language-capability gate and never grounds again (pipeline/plan.js).
//
// The rule: when the TITLE reads as English and carries none of the target language's orthography, the body
// signal alone is not enough — because a bibliography, an index, or a study OF foreign sources will always
// look foreign by word frequency. Such a proposal is HELD for a human rather than applied.
// Deps: none (pure).

// Words that mark a title as an English scholarly apparatus ABOUT something, rather than a work IN a language.
const ENGLISH_APPARATUS = /\b(preliminary|bibliograph|catalogue of|works in|making mention|index|concordance|checklist|survey of|guide to|notes on|translations? of|selections? from|studies in|history of)\b/i;
// Orthography that would corroborate the target language in the title itself.
const ORTHOGRAPHY = {
  fr: /[àâçéèêëîïôùûüœ]/i,
  es: /[áéíóúñ¡¿]/i,
  de: /[äöüß]/i,
  pt: /[ãõçáéíóú]/i,
  it: /[àèéìòù]/i,
};

/**
 * Should this proposal be applied automatically?
 * Returns { apply, reason }. `apply:false` means HOLD for review — never "reject", because the detector may
 * still be right; it means the evidence is not strong enough to change a live document unattended.
 */
export function checkRelabelProposal({ title = '', to = '', bodyConfidence = null } = {}) {
  const t = String(title);
  const ortho = ORTHOGRAPHY[to];
  const titleLooksTarget = ortho ? ortho.test(t) : false;
  const looksEnglishApparatus = ENGLISH_APPARATUS.test(t);

  if (looksEnglishApparatus && !titleLooksTarget) {
    return { apply: false, reason: `title reads as an English work ABOUT ${to} sources; body language alone cannot distinguish that from a work IN ${to}` };
  }
  // A very short or filename-ish title carries no signal either way — lean on the body, which is what the
  // detector already measured. (journal_constantinople_1848-05-11_p1 is genuinely French; its title says nothing.)
  return { apply: true, reason: titleLooksTarget ? `title orthography corroborates ${to}` : 'no contrary signal in the title' };
}
