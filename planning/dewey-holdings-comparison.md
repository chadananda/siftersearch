# Dewey: is this document already in the library? (2026-10-17)

Chad: "determine if this document is already in the library considering that no exact match can likely be expected."

## Method (api/lib/dewey/compare.js + holdings.js)
1. **Titles only say where to look.** The decision is made on the text whenever we have text (a file, a pasted passage, a photographed page).
2. **Normalize hard, both sides:** fold diacritics/transliteration (Bahá'u'lláh = Baha'u'llah), rejoin line-end hyphens, drop `[page N]`, running headers/footers (short lines repeated ≥3×) and Markdown.
3. **Shingles:** word 4-grams. Survive OCR slips, reflow and punctuation; unrelated texts share almost none.
4. **Candidates:** ~30 probes spread through the document → BM25 top 5 each → a hit counts only if the paragraph really holds ≥80% of the probe's words; a probe held by k books gives each 1/k (common quotations count little). Plus exact-title docs and section hits. ≤8 candidates.
5. **Full comparison per candidate, both directions + order** (longest increasing run of matched positions):

| relation | rule | verdict |
|---|---|---|
| same | ≥45% each way, ≥60% in order | held |
| inside | ≥45% of ours in theirs, in order, theirs >1.5× longer | held (inside a compilation) |
| partial | ≥45% of theirs in ours, theirs <0.67× ours | partly-held → worth adding the fuller text |
| overlap / quotes | ≥12% shared; in order / out of order | possible |
| unrelated | <12% | — |

## Calibration (real pairs, SE pilgrim notes folder)
| pair | ours→theirs / theirs→ours | relation |
|---|---|---|
| Fires in Many Hearts .txt vs .pdf (OCR) | 96% / 96% | same |
| Edith McLaren 1952 vs 1954 | 99.8% / 99.9% | same |
| Defection talk transcript vs 250-word excerpt | 11% / 82% | partial |
| different pilgrim notes | ≤2% | unrelated |
| Imbrie NYT article vs Imbrie's own account | 1% | unrelated (same event, different text) |

## Not covered yet
- Translations (cross-lingual vectors were 5% in the 09-30 test) → "held in another language" needs the bilingual layer.
- Scans: needs OCR (SearchLayerPDF) first; until then title/metadata only → "possible" at best.
- Audio: no transcription.
