// Verify encounter claims against their FULL paragraph (the proof span alone often omits who is speaking — "held a
// conversation with the Bab" — or negates the claim — "she never met the Báb"). Pure prompt + parse here; the runner
// (scripts/verify-encounters.mjs) loads paragraphs, calls the model, stores verdicts in claim_verifications.
export const VERIFY_VERSION = 1;
export const VERDICTS = ['met', 'denied', 'not_stated', 'wrong_person'];

export const SYSTEM = `You check claims that two people MET — were physically in each other's presence — against the source paragraph they were extracted from. For each numbered claim, read the WHOLE paragraph and return one verdict:
- "met": the paragraph states that SUBJECT and OBJECT were in each other's presence (met, visited, accompanied, received, travelled with, were imprisoned together, conversed face to face).
- "denied": the paragraph states they did NOT meet ("never attained His presence", "never saw", "without ever seeing Him").
- "not_stated": the paragraph does not say they met in person — only belief, recognition, correspondence, a dream, a letter, hearing about someone, or a meeting of OTHER people.
- "wrong_person": the paragraph describes such a meeting but between different people than SUBJECT and OBJECT (e.g. the claim names the Báb but the text is about Bahá'u'lláh).
Rules: judge only what THIS paragraph says, never your own knowledge of history. A pronoun counts when the paragraph makes clear whom it means. Quote the paragraph's own decisive words verbatim (max 25 words).
Why: these verdicts decide answers to "did X meet Y?" for scholars; a wrong "met" is worse than a missing one.
Example: claim "Ṭáhirih — met the Báb", paragraph "…a woman, the only one of her sex, who, unlike her fellow-disciples, never attained the presence of the Báb…" → {"n":1,"verdict":"denied","quote":"unlike her fellow-disciples, never attained the presence of the Báb"}.
Return ONLY JSON: {"verdicts":[{"n":<claim number>,"verdict":"met|denied|not_stated|wrong_person","quote":"...","reason":"<=12 words"}]}`;

export function buildUser(paragraph, claims) {
  return `PARAGRAPH (${paragraph.title || 'source'}):\n${String(paragraph.text || '').slice(0, 3500)}\n\nCLAIMS:\n`
    + claims.map((c, i) => `${i + 1}. SUBJECT: ${c.subject} | OBJECT: ${c.object} | claim: "${c.statement}"`).join('\n');
}

export function parseVerdicts(raw, n) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const out = new Array(n).fill(null);
    for (const v of j.verdicts || []) {
      const i = Number(v.n) - 1;
      if (i >= 0 && i < n && VERDICTS.includes(v.verdict)) out[i] = { verdict: v.verdict, quote: String(v.quote || '').slice(0, 300), reason: String(v.reason || '').slice(0, 120) };
    }
    return out;
  } catch { return null; }
}
