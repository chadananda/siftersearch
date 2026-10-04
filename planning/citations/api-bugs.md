# API bugs found while sourcing Shoghi Effendi's citations by hand (2026-09-30) — fix later

1. **/api/search/multi (plan:false) ignores `filters.language`** — a `language: "fa"` search returned English papers.
2. **Public key rate limit (1,000 req/h) blocks citation work** — /search/quick and /paragraph/:id exhaust it; only
   /search/original/batch is batch-shaped. Paragraph reads need a batch form too.
3. **Link graph lands on the wrong paragraph of the right book** — e.g. "A just king enjoyeth nearer access…" (PDC ¶179)
   linked to the Persian Epistle ¶1; the passage is ¶91. 252 of 461 linked originals held none of the quotation.
   Investigate the quote→source→original resolution (source link or translation alignment granularity).
4. **No book+language-narrowed text search on a public route** — /server/meili-vector (internal) is the only route that
   takes an arbitrary filter (doc_id / language). /search/original should accept `documentId`/`language`.
5. (pipeline, not API) the quotation extractor glues separate quotations joined by an attribution verb into one row
   ("…Most Great Prison." + "the majesty of kingship is one of the signs of God") — split before sourcing.
6. **Translation alignment drifts (likely the ROOT of #3)** — Summons of the Lord of Hosts ↔ Súriy-i-Haykal: English [1.66]
   ("Within the treasury of Our Wisdom…") is aligned to Haykal ¶48 (a different passage); [1.88] to ¶62 and to a
   paragraph of ANOTHER Haykal copy (924993). Re-verify aligned pairs by content (cross-lingual similarity) before trusting.
7. **Admin paragraph rows carry no alignment** — /api/admin/docs/:id/paragraphs returns original_text/align_ref null for
   aligned English; the only way to an aligned original is the rate-limited public /paragraph/:id/links.
8. **Keyword search is weak on Arabic/Persian** — hamza/yeh/kaf forms and diacritics defeat Meili keyword matching
   («طوبی لمن اطاعه» found nothing); a letter-form-normalised probe of the document text finds it.
9. **Súriy-i-Haykal has two recensions; Summons translates the LATER one** — doc 926567 (Akka recension) numbers its
   paragraphs «ب N» = Summons [1.N] (an exact, model-free alignment key). Summons was aligned to 925310 (earlier
   Adrianople recension, different paragraphing) → drift (#6). Shoghi Effendi's renderings also follow the later text.
10. **scripts/reingest-document.js never exited after finishing** — an open handle kept it alive for hours after
    "Re-ingestion complete", so the API task stayed 'running' and queued re-ingests waited. FIXED: explicit exit.
11. **Semantic ranking is binary-quantized** — paragraphs and hype_questions use `binaryQuantized: true`. An exact float
    re-score of Meili's candidates was built and MEASURED (aaf1556e): no gain — ranks got slightly worse (2→4, 9→13, 3→7)
    and an exact Arabic quote still ranked its own paragraph 8th. Quantization is not the cause; REVERTED. The stored
    paragraph vectors themselves are too coarse (#12).
12. **One vector per paragraph dilutes quotations in long paragraphs** (any language) — needs sentence/window vectors
    in a side index; see planning/search-precision-plan.md.
