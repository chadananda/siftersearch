# Anís tradition rollout (Chad 11-10)

Order of work. Each step finishes before the next starts being tested; data preparation for later traditions may run ahead.

1. **Strategies good on Anís chat.** The 17 showcase samples (src/lib/anis-samples.js) pass the live battery AND hand review.
   Status 11-10: 12/17 showcase-ready; round 5 fixes for timeline/original/term/compilation/history_fact deployed (9ca35bfe), not yet
   verified live (test spend cap reached 11-10). Open: justice retrieval (Hidden Words/Gleanings), prayer fetch 13.6 s, hindus card 6.07 s.
2. **Existing questions + the Bahá'í bank.** Live battery cases, then tests/quality/question-bank/bahai.json (100; every 5th held out).
3. **Traditions, in order:** Christianity → Islam → Judaism → Buddhism → Hinduism → Sikhism → Confucianism → Taoism → Jainism → Zoroastrianism.

## Readiness gate (before a tradition's bank is put to the test)
Measured per tradition by the ops report `tradition-readiness` (one row per layer, % of the tradition's documents/paragraphs done):
phrase index · document + sub-document lists · translations (linked originals ↔ translations) · disambiguation · history extraction ·
concept extraction · HyPE questions. A tradition is tested only when every layer is complete (or a gap is explained and accepted).

## HyPE from the bank, from the outset
HyPE generation for a tradition includes the measured top-100 questions: each bank question is attached as a HyPE question to the
paragraphs that answer it (found by retrieval, confirmed by the HyPE program's grader), before the general HyPE pass for that tradition.
Held-out bank questions are NOT seeded (they stay a fair test). Spend: the hype-program budget key ($1000/month, batch).

## Budgets
Live answers for testing bill to the test cap ($5/day): ~100 bank questions/day at ~$0.05. Never raise caps.
