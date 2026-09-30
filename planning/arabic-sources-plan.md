# Arabic classical sources — segment & clean BEFORE ingest (Chad, 2026-09-30)
"These MD documents are derivative, so it is preferable to paragraph segment and clean up before ingestion so that
re-ingestion always remains cheap." Source = finished result (paragraphs + ⁅sN⁆ sentence markers + <pb/> print pages +
<!-- fn: --> notes); ingest = parsing only, no model. Backups of originals: Dropbox/Ocean2.0 Supplemental/source-backups-20260930/.

## Method
- Text is ALWAYS ours (Shamela copy: vocalised, complete, footnotes). OpenITI (same edition) gives only print page
  numbers + paragraph starts, located by letters (scripts/openiti-paginate.py). OpenITI texts are unvocalised and
  sometimes incomplete — never substitute them (Ibn Ḥibbān 0001729 = 85% of our letters).
- <pb vol="v" n="p"/> = where print page p BEGINS (TEI). OpenITI PageVvPp marks a page END. Empty <pb/> = a join with no
  known number (kept for later approximation). Bracketed gaps (105, ?, 107) are filled exactly.
- Footnotes (text after a page's ____ rule) → <!-- fn: … --> beside that page. Page cuts mid-sentence merged, <pb> inline.
- Sentence markers: scripts/mark-sentences.py (punctuation . ! ? ؟ ؛; per-paragraph numbering from 1).
- Ingest: api/lib/page-breaks.js strips tags/comments from stored text, pdf_page + block_attrs.{pdf_vol,pb}; a source
  with page tags is never rebuilt by marker write-back; punctuated RTL uses punctuation sentence detection;
  reingest-document.js runs localOnly + --force (clears hashes).

## Rules (Chad, 2026-09-30)
- NEVER segment on arbitrary boundaries (no word/length/sentence-grouping splits). Paragraphs = edition (OpenITI '#',
  headings, numbered entries; page cuts merged) or SEMANTIC. Sentence markers only at the text's own punctuation.
- Ingest for SEARCH now; sentence segmentation of unpunctuated text DEFERRED (`sentence_markers: defer`).
- A paragraph too long to embed (>~12k chars) waits for semantic paragraph segmentation.

## State (evening 09-30)
- Library restored from backups once (length-split versions were never ingested); 14 backups in source-backups-20260930/.
- Written + ingesting (force, localOnly, no model): 66546 al-Shifā' (defer), 66551 Minhāj (defer), 66548 Ḥalabiyya,
  66547 Dalā'il, 66533 Tārīkh al-Kabīr, 66570 Jāmiʿ al-Uṣūl (247/13,130 pages numbered — Shamela screens), 66558 Futūḥāt
  (defer, no pagination: thahabi edition).
- WAITING for semantic paragraph segmentation of 342 over-long paragraphs (6.4M chars ≈ 4.3M tokens; ~$15 Sonnet 5 /
  ~$35 Opus 5.5, half with Batch): Tahdhīb 89, Tārīkh al-Islām 125, Qūt 57, al-Umm 46, al-Bidāya 22, Iḥyā' 2, Ibn Ḥibbān 1.
  Their derived files (paginated, no splits): scratchpad v3/<doc>.w.md; al-Umm v3/66554.md.
- OPEN: which model answered the 18:33 Qūt sentence detection (LMSTUDIO_HOST 100.103.78.63 is not visible from the Mac's
  tailnet); spend meter is admin-JWT only.

## Semantic segmentation batches (submitted 2026-09-30 ~20:30Z) — scripts/semantic-paragraphs.py
Jobs + results live in the session scratchpad (/private/tmp/claude-501/-Users-chad-Dropbox-Public-JS-Projects-siftersearch-com/8724669c-aaa3-43b1-ba6f-921ec0f4512c/scratchpad/sem, /private/tmp/claude-501/-Users-chad-Dropbox-Public-JS-Projects-siftersearch-com/8724669c-aaa3-43b1-ba6f-921ec0f4512c/scratchpad/opus) — the ids below are enough to re-collect.
- Sonnet 5 (Chad: "use Sonnet 5 batch for the 342 paragraphs"), over-long paragraphs only:
  66575 msgbatch_017SiCJJXeUtyLoSGWMfP6vX · 66539 msgbatch_01Y1SV3ZEPrRsV29gjc6quHT · 66536 msgbatch_018ztb8ZzykWASnKaADfSnGN ·
  66560 msgbatch_01SpLKX43YPTkZpr8sKJh9rf · 66569 msgbatch_019ADTYp8FGRGe2j8zijJSyS · 66559 msgbatch_01Bjyn1CoxoS25nxVuQECURD ·
  66554 msgbatch_01XzmWZXhPfzM6S7zVPeTeJ6
  then: collect → apply (into v3 derived md) → mark-sentences (punctuated) → finalize → write → force re-ingest.
- Opus 5 (Chad: "if any of the Baha'i materials still need segmentation, use Opus"), whole documents, 89 docs /
  267 requests: msgbatch_01Ko2TKqXtn63uSbWQyy1BnE. Scope = Bahá'í docs chunked by length (≥20% of paragraphs at the 1,500 cap):
  21 sources cut into 5,000-char blocks (rejoined — mid-word cuts joined without space) + 66 whose blocks are meaningful
  (the model groups blocks) + 2 English. SKIPPED (PDF presentation-form glyphs, text repair first): 20331, 20338 Awakening;
  20332 'Abdu'l-Bahá in New York.
- 13 English Bahá'í docs cut only in the DB (source paragraphs sound): free force re-ingest, no model.
