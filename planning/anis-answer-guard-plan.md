# Anís answer guard — plan (11-11, from the Dawn-Breakers manual pass)

Chad 11-10: "put a guard in place where a wrong answer is detected and corrected and then noted for system correction. Guards are relatively cheap."

## What the manual pass showed is still wrong after the code fixes
Most remaining errors are claims the passages do not support, not formatting:
- **Person identity conflation**: "Mullá Ḥusayn (known as Vaḥíd)" (r14). Seen once in about 40 replies.
- **Wrong author of a passage**: Balyuzi's and Ruhe's passages traced to "Siyyid Káẓim", the speaker they quote. The writer handled it this time.
- **Over-reading an untranslated original**: Quddús r19 paraphrased an untranslated Persian tablet of 'Abdu'l-Bahá ("a shadow that shelters thirteen Unities").
- **Dates and numbers** stated without a passage. None seen wrong this pass, but it is the same class of error.

The formatting defects (links, slugs, retrieval talk, link asides) are already fixed by free code checks in lint.js formPass.

## Design
1. **Detect** with one cheap model call after the writer (DeepSeek or Haiku, about 1–2 ¢/turn).
   - Input: the reply, the writer's numbered passages, and the reader's question.
   - Output: JSON `{claims:[{text, kind: identity|attribution|date|number|translation, supported_by:[n]|null, verdict: ok|unsupported|contradicted}]}`.
   - Only `contradicted`, and `identity` or `attribution` marked `unsupported`, count as wrong.
2. **Correct**, only when something is wrong.
   - One rewrite call gets the reply plus the flagged claims and returns the reply with those sentences fixed or removed.
   - Nothing else changes, and the reply is never shortened (never-truncate rule).
3. **Note** each catch for the system fix.
   - One row per catch: turn id, claim, kind, passages, and the strategy and tree path, via a repo. Not in a script.
   - The rows appear in `anis-improve-digest`.
   - Each catch leads to a root-cause fix: retrieval, rank, own-source, or the prompt.

## Decision Chad needs to make: replies stream
The first words reach the reader at about 5 s, before a guard could run. Options:
- **A. Hold the reply until the guard passes** (adds about 1.5–3 s per turn). Simplest and always correct, but slower.
- **B. Stream, then replace the message if the guard corrects it** (a `revise` event; the widget and site swap the text). Fast, but a corrected message visibly changes.
- **C. Note only, with no correction to the reader**: detection and the digest only. Cheapest, but the reader still sees the error.

Recommendation: **B on chat** and **A on letters and email** (not streamed, so no latency cost there).

## Cost
Detect on every turn costs about $0.01. Corrections happen on a small fraction of turns: 1 in 40 in this pass.
Real readers are metered, never capped. Test turns bill to `improve-anis-test`.
