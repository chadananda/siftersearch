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

## State
| doc | work | pages numbered | source written | markers | ingested |
|---|---|---|---|---|---|
| 66533 | Tārīkh al-Kabīr | 99% | ✓ | 31,155 | |
| 66536 | al-Bidāya | 98% | ✓ | 108,456 | |
| 66539 | Tārīkh al-Islām | 99% | ✓ | 280,052 | |
| 66547 | Dalā'il | 95% | ✓ | 23,069 | |
| 66548 | Ḥalabiyya | 99% | ✓ | 20,091 | |
| 66560 | Qūt al-Qulūb | 100% | ✓ | 3,514 | (force re-ingest ran BEFORE markers — rerun) |
| 66575 | Tahdhīb al-Kamāl | 99% | ✓ | 111,084 | |
| 66546 | al-Shifā' | 98% (paged, not written) | — | unpunctuated → needs local LLM | |
| 66559 | Iḥyā' | 100% (paged, not written) | — | unpunctuated → needs local LLM | |
| 66570 | Jāmiʿ al-Uṣūl | 2%: Shamela version is P000; use JK009336 by POSITION | — | | |
| 66569 | Ibn Ḥibbān | 63%: our printing ≠ OpenITI's; by POSITION | — | | |
| 66551/66554 | Minhāj / al-Umm | our text = OpenITI JK; openiti-convert.py | — | unpunctuated → local LLM | |
| 66558 | Futūḥāt | thahabi.org edition ≠ OpenITI | — | unpunctuated → local LLM | |

BLOCKER: no LLM is running on boss (no vLLM/LM Studio process) — unpunctuated works wait for Chad.
Spend incident 09-30: first Qūt re-ingest billed gpt-4o via fallback (cancelled; fixed 0bef9444).
