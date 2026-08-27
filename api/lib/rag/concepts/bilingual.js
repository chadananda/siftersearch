// Bilingual concept extraction — the prompt contract for reading a doctrinal passage with BOTH the
// original and Shoghi Effendi's rendering in front of the model, in a single call.
//
// The doctrine this encodes (Chad, 2026-08-25): "Shoghi Effendi's translation has unique doctrinal
// authority, so both the original and the chosen translation are important for understanding the whole."
//
// The naive reading — "translations are lossy, trust the original" — is WRONG and would corrupt every
// extraction. The two carry different authority over different questions:
//
//   THE ORIGINAL  → WHICH TERM. Identity and differentiation. English is a lossy projection of a more
//                   differentiated vocabulary: Ṣalát (ص-ل-و), Duʿá (د-ع-و) and Dhikr (ذ-ك-ر) all surface
//                   as "prayer"; ʿadl (ع-د-ل) and insáf (ن-ص-ف) both as "justice". Merging those would
//                   attach the obligations of one to another — a doctrinal error manufactured by
//                   translation. Only the root keeps them apart.
//
//   SE's RENDERING → WHICH SENSE. His word-choice is an authoritative INTERPRETIVE ACT, fixing which
//                   sense of a polysemous term is operative in this passage. "Clouds of Heaven-sent
//                   trials" for غمام امتحانات ربّانی is not an approximation to be improved on; it is the
//                   authoritative reading, and no scholar's retranslation overturns it.
//
// Neither alone is sufficient, so the prompt states both roles explicitly rather than implying a ranking.
// Deps: none (pure prompt construction).

// The concept's ORIGINAL TERM must be quoted verbatim from the source text above — which is checkable
// against that text, unlike a root the model derives from memory. No external lexicon is consulted here
// (Chad, 2026-08-25: the per-word concordance is a translator's tool, not part of paragraph ingest).
export const ROOT_REQUIRED_NOTE =
  'Quote the concept\'s ORIGINAL TERM verbatim from the original text above. Concept identity is the original term, never the English gloss. If the term is not present in the text shown, omit it rather than supplying one from memory.';

export function buildBilingualSystem(profile = {}, meta = {}, { translationAuthority = null } = {}) {
  const book = [meta.title, meta.author].filter(Boolean).join(' — ');
  // THE WEIGHT OF THE ENGLISH DEPENDS ON WHO RENDERED IT (Chad, 2026-08-25): "Shoghi Effendi originals are
  // important for comparison but the english carries weight as well. Non-Shoghi-Effendi translations have no
  // doctrinal weight in the translation, so the original is MORE load-bearing."
  //
  // So this is not one prompt with a footnote — the two cases invert which text governs. Telling the model
  // that a committee's or a provisional rendering "fixes which sense is operative" would grant a translator
  // an interpretive authority they do not have, and bake it into every concept extracted from that book.
  const authoritative = translationAuthority === 'shoghi-effendi';
  return `You extract DOCTRINAL CONCEPTS from a passage of ${book || 'a sacred text'}, reading the ORIGINAL and Shoghi Effendi's authorised English rendering TOGETHER.

${authoritative
  ? `TWO SOURCES, TWO DIFFERENT AUTHORITIES. You need both; neither outranks the other, because they answer different questions.`
  : `THE ORIGINAL GOVERNS HERE. This English is NOT Shoghi Effendi's rendering, so it carries no interpretive authority of its own — it is a careful reading by a translator, useful for orientation and nothing more. Where the English and the original diverge, or where the English is vaguer or more specific than the original, THE ORIGINAL DECIDES. Never treat this translator's word-choice as fixing which sense of a term is meant; that is a power only the authorised interpreter has.`}

1. THE ORIGINAL tells you WHICH TERM — the concept's identity.
   English is broader than the original and silently merges distinct concepts. "Prayer" renders Ṣalát (ص-ل-و, obligatory prayer), Duʿá (د-ع-و, supplication) and Dhikr (ذ-ك-ر, remembrance) — three different roots, three different concepts, with different laws attached. "Justice" renders both ʿadl (ع-د-ل, rectitude) and insáf (ن-ص-ف, equity). Treating these as one concept because English uses one word is a doctrinal error created by translation. ALWAYS key the concept to its root.

2. ${authoritative
  ? `SHOGHI EFFENDI'S RENDERING ESTABLISHES A SENSE — authoritatively, but not exclusively.
   His English is not an approximation of the original and is NEVER something to correct, improve, or read past. When he renders غمام as "clouds of Heaven-sent trials", he is disclosing a sense that is genuinely there — often the principal one — with an authority no other translator has. Treat his rendering as interpretive evidence of equal standing to the original, not as a lossy copy of it.
   THIS STANDING IS UNIQUE AND UNREPEATABLE. He is the sole designated interpreter, so his is the ONLY translation that carries doctrinal authority in its own right — no other rendering of these texts, however scholarly, has it or can acquire it. A reading you would rightly question from any other translator is authoritative here.
   BUT AN AUTHORITATIVE READING DOES NOT EXHAUST THE PASSAGE, AND DOES NOT MAKE THE OTHERS FALSE. Interpretation here OPENS meaning; it does not narrow the text to a single sense. Revealed language is deliberately capable of more than one true reading at once, and his choosing one English word does not delete the other senses the original carries — it tells you that THIS sense is certainly among them, and is the one he saw fit to bring into English. So: record the sense his rendering establishes, marked as authoritative, AND the further senses the original supports. Do not present them as rivals and do not let his choice veto them. Treating his word-choice as merely selecting one meaning from a list both understates what an authorised interpretation is and oversimplifies what the passage is doing.`
  : `THE TRANSLATION is a guide to meaning, not a determination of it.
   This rendering was NOT made by the designated interpreter. Read it for orientation and quote it where it is faithful, but never let its word-choice settle which sense of a term is operative — only the original can do that here. Where it is vaguer, more specific, or more confident than the original, that is the translator's judgement and not doctrine.`}

WHAT TO EXTRACT
For each significant doctrinal concept or symbol the passage DEVELOPS:
- the concept, named in English as Shoghi Effendi renders it
- its ORIGINAL term, copied verbatim from the original text (${ROOT_REQUIRED_NOTE})
- what the passage says it means or teaches
- a VERBATIM proof span, quoted exactly — never paraphrased. Quote from EITHER text: from the ORIGINAL when the claim is about which term is meant, from the ENGLISH when it rests on ${authoritative ? 'the interpreter\'s word-choice' : 'the rendering'}. Copy the characters exactly as they appear in the text you quote.

POLYSEMY
A symbolic text carries more than one meaning at once. Where the passage supports several senses, record them ALL. Do NOT choose between them, and do not let a concrete or literal reading rule out a symbolic one — in a symbolic work the literal image is also a sign.

RESTRAINT
Extract significant doctrinal or technical TERMS, never ordinary descriptive phrases from the passage. If the passage has no aligned original available, say so and omit the root rather than guessing at one. Under-extract rather than invent: a concept you are unsure of is better left out than recorded wrongly.

Return ONLY JSON: {"concepts":[{"concept","root","root_translit","original_term","sense","proof"}]}`;
}

/**
 * The user message. Carries the original and Shoghi Effendi's rendering side by side, each explicitly
 * labelled, so the model is never left to infer which text is which.
 */
export function buildBilingualUser(p = {}, aligned = null) {
  const ctx = `CONTEXT (for resolving references only): ${p.context || '(none)'}`;

  if (!aligned) {
    // Honest degradation: say the original is missing rather than letting the model supply a root from
    // its own memory of the text, which would be an invented citation.
    return `${ctx}

NO ALIGNED ORIGINAL is available for this paragraph — the original text is unavailable. Extract from the English alone, and OMIT the root rather than guessing it.

SHOGHI EFFENDI'S RENDERING [${p.pid}]:
${p.text}`;
  }

  return `${ctx}

ORIGINAL TEXT:
${aligned.source}

SHOGHI EFFENDI'S AUTHORISED RENDERING [${p.pid}] — his word-choice fixes which sense is meant:
${aligned.translation || p.text}`;
}
