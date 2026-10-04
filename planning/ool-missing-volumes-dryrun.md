# Makátíb 1–2 and Muntakhabát 3–6: what the library already holds (dry run, 2026-10-02)

Nothing was ingested or deleted. OOL's per-tablet docx for these six volumes were fetched to
`/tank/sifter/staging/ool-ab-missing/` (tower, outside the library; the watcher stays off) and each tablet's text was
looked for in the library. Per-tablet results are in `planning/ool-missing-volumes-dryrun.json`.

**Method.** The two longest paragraphs of each tablet go through BM25 on the new keyword index (`paragraphs_kw`, library
docs only). A tablet counts as held when ≥60% of its 5-word shingles appear in one library document. The control case is
Makátíb 3 #1, #100, #218 and Muntakhabát 1 #4, which are known held: all four were found (containment 0.72–1.00). "New" is an
upper bound, because a tablet whose wording differs a lot in the held edition can be missed.

| Volume | Tablets | Already held | of which Partial Inventory records | Not found (new) | New words |
|---|---:|---:|---:|---:|---:|
| Makátíb 1 | 139 | **139** | 0 (held as `Abdul-Baha-MK01-NNN`) | 0 | 0 |
| Makátíb 2 | 111 | 104 | 80 | 7 | 2,490 |
| Muntakhabát 3 | 304 | 202 | 182 | 102 | 14,493 |
| Muntakhabát 4 | 190 | 142 | 135 | 48 | 10,725 |
| Muntakhabát 5 | 315 | 187 | 177 | 128 | 18,481 |
| Muntakhabát 6 | 621 | 499 | 483 | 122 | 17,982 |
| **Total** | **1,680** | **1,273** | **1,057** | **407** | **64,171** |

## What this changes

- **Makátíb vol. 1 was never missing.** The library holds it as the `Abdul-Baha-MK01-NNN` files (OOL code MK = Makátíb). Those 139
  docs have now been renamed, along with the MK02 (4) and MK03 (3) docs whose text matches the same-numbered tablet, to
  "Makátíb-i-‘Abdu’l-Bahá, vol. N" and "… (Makátíb N:M)". The backup is `/tank/sifter/backups/ool-names-mk-2026-10-02.json`. Five Arabic MK
  files whose text does not match the same-numbered tablet (MK02-040/078/100, MK03-056, MK04-95) were left alone.
- **Most of the "missing" volumes are already in the library as Stephen Phelps' Partial Inventory records**
  (`Core Tablets/Partial Inventory/'Abdu'l-Bahá/ABnnnnn.md`). These are filed by inventory number, so nothing ties them to
  the published volume.

## Decisions for Chad

1. **Ingest the ~407 new tablets** (one doc per tablet, like the OOL Core Tablets, collection = the published volume)?
   Cost: ~64k words of Arabic/Persian, no AI segmentation (`needs_segmentation: false`), plus ~$0.10 of phrase-vector
   embedding.
2. **The 1,057 Partial Inventory records that are also published tablets:** record the publication on the PI record (e.g.
   `published_in: Muntakhabát 3:45`) rather than duplicating the text? The PI record stays the identity; the published
   reference becomes searchable/filterable.
3. **The staged docx** (1,680 files, 134 MB) can be deleted once 1–2 are decided.
