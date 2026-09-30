# Linking plan — maximise links before any translation (Chad, 2026-09-30)
"maximize linking first so we minimize the amount of translation needed" · translation itself HELD → CTAI.info.

## Done 2026-09-30
- Queue (Core Tablets ar/fa paragraphs with no English beside or linked): 53,975 ¶ / 11.8M chars → **17,655 ¶ / 3.3M chars**.
  - pi-text-v1 (planning/merge-review/pi_attach_text.py): our original ↔ Phelps' ORIGINAL by letter 5-gram overlap
    (same language), then his parallel English block (orig/eng files block-parallel for 94% of PINs). 16,336 ¶.
  - pi-global-v1 (pi_attach_global.py): same, but locate among ALL 24.5k PI texts (manuscript volumes, no/wrong PIN);
    kept only where the chosen blocks cover ≥0.7 of OUR paragraph (below 0.6 = heading/neighbour English — read).
    19,984 ¶. Short manuscript lines share a block's English (ref.cov, ref.blocks; old pi_attach did the same, shape k:1).
  - bahai-library.com provisional/published English → PI: 8,053 pairs (pi-english-links-balib.jsonl) — NOT yet written;
    all hit originals that already had Phelps' English (adds better English, shrinks nothing).

## Next — SOURCE links (not translation links) — Chad: "just so we can generate a reference link for the quote"
- A quote in a compilation/book → the paragraph it comes from. Deterministic first (free, no LLM tokens):
  1. ar/fa compilations & books → Core Tablets originals: letter-5-gram shingle index (as pi_attach_global).
  2. English books (GPB, WOB, PDC, secondary lit) → English Writings (Gleanings, SWAB, …): word-shingle index.
     Where that English is linked to an original, the quote reaches the original too.
  3. Only the residue (quote-shaped text with no match) → a very cheap model to flag "unsourced quote" (later).
- Store: new table content_source_links (quote_para_id, quote span, source_para_id, source_doc_id, basis, score,
  method) + bulk upsert + GET per paragraph → reader renders "Source: <work ¶>". Run as a server script (reads SQLite
  read-only, writes through the single writer in bulk) — no session tokens.

## Then
- Concept extraction + HyPE: take the LINKED passage too — generate once for original + translation together
  (Chad: "always better to generate for both passages at the same time").
- Remaining queue 17,655 ¶: 204+1,794 non-parallel PI files (align blocks by DP instead of count), write the balib pairs,
  then whatever is left goes to CTAI.
