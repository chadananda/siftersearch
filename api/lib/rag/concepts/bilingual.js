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

export function buildBilingualSystem(profile = {}, meta = {}) {
  const book = [meta.title, meta.author].filter(Boolean).join(' — ');
  return `You extract DOCTRINAL CONCEPTS from a passage of ${book || 'a sacred text'}, reading the ORIGINAL and Shoghi Effendi's authorised English rendering TOGETHER.

TWO SOURCES, TWO DIFFERENT AUTHORITIES. You need both; neither outranks the other, because they answer different questions.

1. THE ORIGINAL tells you WHICH TERM — the concept's identity.
   English is broader than the original and silently merges distinct concepts. "Prayer" renders Ṣalát (ص-ل-و, obligatory prayer), Duʿá (د-ع-و, supplication) and Dhikr (ذ-ك-ر, remembrance) — three different roots, three different concepts, with different laws attached. "Justice" renders both ʿadl (ع-د-ل, rectitude) and insáf (ن-ص-ف, equity). Treating these as one concept because English uses one word is a doctrinal error created by translation. ALWAYS key the concept to its root.

2. SHOGHI EFFENDI'S RENDERING tells you WHICH SENSE — the authoritative interpretation.
   His English is not an approximation of the original and is NEVER something to correct, improve, or read past. As the authorised interpreter his word-choice FIXES which sense of a polysemous term is operative in this passage. When he renders غمام as "clouds of Heaven-sent trials", he is telling you which of that term's senses is meant here. Treat his rendering as interpretive evidence of equal standing to the original, not as a lossy copy of it.

WHAT TO EXTRACT
For each significant doctrinal concept or symbol the passage DEVELOPS:
- the concept, named in English as Shoghi Effendi renders it
- its ORIGINAL term, copied verbatim from the original text (${ROOT_REQUIRED_NOTE})
- what the passage says it means or teaches
- a VERBATIM proof span, quoted exactly from the passage — never paraphrased

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
