# Dewey folder sweeps — overnight 10-17/18

Tool: `scripts/library/dewey-folder-sweep.mjs <folder> <out.jsonl> --chat --server-root "/Users/chad/Dropbox=/tank/dropbox"`
(every file through Dewey's chat as Chad; Dropbox files read in place on tower). Results: the two `.jsonl` files beside this.

| folder | files | held | partly | possible | not held (offered) | can't tell | audio | errors |
|---|---|---|---|---|---|---|---|---|
| SE pilgrim notes | 270 | 128 | 4 | 30 | 90 | 1 | 17 | 0 |
| Duane scans | 736 | 358 | 57 | 102 | 215 | 4 | — | 0 |

Median 11 s per file; the biggest (273 MB, 969 pages) 10–60 s. API restarts during the Duane run: 0.

## High-value, recommended to add (from the first 100 offered items — the full list is in Chad's /dewey thread)
The Messiah of Shiraz · Resurrection and Renewal · The Sources for Early Bábí Doctrine and History · Studies in Bábí and
Bahá'í Religions (vols incl. Balyuzi festschrift) · Le Livre des Sept Preuves (Nicolas) · Selections from E. G. Browne ·
Rituals in Babism and Baha'ism · The Seven Martyrs of Hurmuzak · The Station and Claims of Bahá'u'lláh · Origins of the
Bahá'í Community of Canada · Studies in Modern Religions… · The Qur'an and Its Exegesis · The Bahá'í Faith

## Known gaps
- Translations: a work held in another language is not matched (Winckler's Pilgrimage is held in Persian).
- Image-only scans and Word files that are pasted page images ("Metropolis of Satan.doc"): "can't tell" until full OCR.
- PDFs carrying their text twice (OCR layer + original) halve the length ratio (Wider Horizon) — verdict unaffected.
- `GET /api/dewey/items` returns 100 at most — a review UI for hundreds of offers needs paging + bulk "add recommended".
- Audio (17 pilgrim-note recordings): no transcription yet.
