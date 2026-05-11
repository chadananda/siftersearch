# Zoroastrian Library Restoration Plan

## Problem
- 3 bad WZSE dump files (283K/144K/120K paras) — deleted 2026-05-11
- 70+ existing Zoroastrian files in the primary library have full SBE Darmesteter
  text from avesta.org BUT footnotes are interleaved with body text, confusing
  the segmenter → only 4-17 paras per file instead of 30-80
- OceanLibrary.com has clean but thin coverage (~5,100 paras total)

## Root Cause
avesta.org formats notes inline (numbered, interspersed with stanzas).
sacred-texts.com has the same Darmesteter translation with footnotes at bottom
— much cleaner for extraction.

## Approach: Replace file content, keep file structure

The existing folder/file structure is correct. Replace body content in each
existing file with clean sacred-texts.com extraction. Keep frontmatter.
Do NOT create new files — rewrite existing ones.

## Source URLs (sacred-texts.com — public domain SBE translations)

### Vendidad (22 Fargards) — SBE Vol. 4
Index: https://www.sacred-texts.com/zor/sbe04/index.htm
Pattern: https://www.sacred-texts.com/zor/sbe04/sbe04NNN.htm
Files: Zoroastrian/Avesta - Vendidad/Vendidad Fargard {N} (SBE) (en).md
Note: Rename folder from "Avesta - Visperad and Vendidad" to "Avesta - Vendidad"

### Yasna (72 chapters, incl. Gathas) — SBE Vol. 31
Index: https://www.sacred-texts.com/zor/sbe31/index.htm
Files: Zoroastrian/Avesta - Yasna and Gathas/ (existing files cover sections)

### Visperad (24 chapters) — SBE Vol. 31
Index: https://www.sacred-texts.com/zor/sbe31/index.htm
Files: Zoroastrian/Avesta - Visperad and Yashts/

### Yashts (21 hymns) — SBE Vol. 23
Index: https://www.sacred-texts.com/zor/sbe23/index.htm
Files: Zoroastrian/Avesta - Yashts/

### Khordeh Avesta (daily prayers) — SBE Vol. 23
Index: https://www.sacred-texts.com/zor/sbe23/index.htm
Files: Zoroastrian/Avesta - Khordeh Avesta/

## Script: scripts/restore-zoroastrian.mjs

Single script, run once locally. Writes files to library path via ssh or directly.

Steps per file:
1. Fetch URL → parse HTML
2. Strip: nav, headers, boilerplate ("AVESTA:", "Sacred Books of the East",
   digital edition notices), footnote elements (p.footnote, small tags)
3. Extract: numbered stanzas in <p> and <blockquote> tags
4. Strip inline footnote refs ([1], (1)) from body text
5. Keep frontmatter, replace body only
6. Update frontmatter sourceUrl to sacred-texts.com URL

## URL Map (confirm with --dry-run before writing)

Run `node scripts/restore-zoroastrian.mjs --dry-run` to fetch index pages,
confirm chapter URL patterns, and print what would be written.

## After ingestion

Library watcher picks up changed files automatically.

Expected para counts after fix:
- Vendidad: 22 Fargards × ~40 paras = ~880 (vs 183 now)
- Yasna: 72 chapters × ~15 paras = ~1,080 (vs 74 now)
- Yashts: 21 hymns × ~20 paras = ~420 (vs 142 now)
- Visperad: ~200 paras (already 381, keep as-is)
- Khordeh Avesta: ~300 paras (vs 14 now)
Total: ~2,880 paras (vs ~814 now)

Mark OceanLibrary.com duplicates deleted after primary lib versions ingest:
- 21356 Vendīdād OL
- 21305 Avesta Selections OL
- 21303 Avesta - Selections OL
Keep: 21306 Gathas, 21301 Teachings of Zoroaster (no primary lib equivalent)

Add to PRIMARY_DOCTRINAL_PATHS in api/lib/doc-tier.js:
  '/Zoroastrian/Avesta'  — covers all Avesta subfolders

Queue for Sonnet HyPE: ~2,880 paras × $3.59/1000 ≈ $10

## Session plan

Session 1: Plan written ✅
Session 2: Write scripts/restore-zoroastrian.mjs — fetch + dry-run
Session 3: Run dry-run → confirm URLs → run for real → verify para counts
Session 4: Delete OL duplicates + add PRIMARY_DOCTRINAL_PATHS + queue HyPE
