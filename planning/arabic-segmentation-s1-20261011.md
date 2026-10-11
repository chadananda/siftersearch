# Arabic segmentation: Haiku 5.5 + System-1 (2026-10-11)

Chad's direction: "test haiku 5.5 (non-thinking) together with Jev … a faster, system-1 model, perhaps for the sentence
parsing part"; "paragraphs into arrays … break decisions are simple indexes"; "phrase first, then phrases → sentences,
then sentences → paragraphs, all by index output"; "phrases are always within sentences"; "test Jev on each job … if it
helps, it is a good sign we might be able to train Laya".

Sample: 24 paragraphs (al-Istibsar 12, Dala'il al-Nubuwwah 12); Jev scored against Haiku. Scripts: `tower:~/sifter/siftersearch/tmp/s1-*.mjs`.

## Results

| method | result | cost (24 ¶) | time |
|---|---|---|---|
| Haiku, vowelled text, quoting each sentence's ending (current tool) | works; an 8–12k-char batch is reliable | ~$0.027 | — |
| Jev **pointer** over a word window (choose the index) | F1 0.07 (random) | $0.012 / 188 calls | 0.15 s/call |
| Jev **per word gap** (noul) | F1 0.04 | $0.016 | 0.19 s/call |
| Phrases (lib/phrases.js, free) → **Haiku, no thinking**, undiacritized numbered phrases, indices out | over-splits continuations (~2× the reference) | **$0.0024** (input 5× smaller, output 30× smaller) | 1 s/¶ |
| same + two worked examples (cached system prompt) | recall 0.91, precision 0.35 vs reference: still over-splits | $0.003 | 1 s/¶ |
| same, **Haiku with adaptive thinking** — the REFERENCE (read by hand: correct where the others differ) | 110 sentence starts | $0.013 | 4 s/¶ |
| **Jev per phrase, whole paragraph** (job A1) vs reference | conf ≥ 0.7 → **63% of decisions at 93.5%**; confident-YES 100% precise | $0.002 | — |
| **Jev per phrase, short local state** (job A2, Laya-sized) | conf ≥ 0.7 → 49% at 91.6%; ≥ 0.8 → 24% at **98.7%** | — | — |

Majority baseline ("continues") = 65%. Phrases ARE inside sentences: every reference boundary is a phrase start once the
splitter also opens a phrase at a numbered report («10-»).

## Reading
- The hierarchy works: phrases free (rules), sentences = which phrase starts are sentence starts, index output.
  Undiacritized numbered phrases cut Haiku's input ~5× and output ~30× vs the vowelled ending-quoting prompt.
- Quality needs Haiku's THINKING at the sentence step. Without it Haiku splits quoted speech, answers, exceptions and
  completing clauses off their sentence, and two worked examples do not fix it.
- **Jev is confidently right on about half of the phrase decisions (≈92–94%), untrained.** That makes "does this phrase
  start a sentence?" (job A2, short state) a strong Laya candidate. Every Haiku-thinking run yields labels at ~$0.04 per 1,000 decisions.

## Recommended pipeline
1. Phrases: lib/phrases.js + numbered-report rule (free).
2. Sentences: Haiku 5.5 with thinking over undiacritized numbered phrases, indices out. All 10 held books (106M chars)
   ≈ $34 list / ≈ $17 via Batch API. Every decision is logged as a Laya label (task `seg-sentence-start-local`).
3. Laya: train on those labels (scripts/laya/finetune.py; same as the role pilot). Then Laya decides its confident
   phrases, and Haiku sees only paragraphs with uncertain phrases. Measure before switching.
4. Paragraphs (sentences → paragraphs): only for texts with no edition paragraphs; same index pattern. Not yet tested.
   The hadith books keep their edition paragraphs.
