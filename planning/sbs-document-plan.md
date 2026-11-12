# Side-by-side (SBS) document — plan (Chad 11-12)

"Do we have a strategy for generating a SBS document? Let's make one. … split by sentence with hidden horizontal lines and by
paragraph with visible horizontal lines. That way the beginning of each sentence is on matching lines." "Look at ctai.info for how we
do side-by-side PDF generation. that one is nice." "We want a very nice presentation."

## What exists (11-12)
- No SBS document anywhere. Anís `original` tree (strategy-trees-seed.js:281-296) shows ONE passage side by side in chat.
- `/print/study` (PrintStudy.svelte): phrase pairs, browser print only.
- Tower PDF (`assistant/pdf/render.js`, pdfkit): Latin fonts only, DROPS Arabic script — unusable for SBS.
- Data: our translations = phrase segments `{id, original, translation}` (sentence id lost when flattened, services/translation.js:1465-1513);
  originals carry ⁅sN⁆ markers; Phelps / Partial Inventory English = paragraph pairs only (~139k ¶, translator-coverage #72). No sentence pairs.
- CTAI.info (scripts/generate-pdfs.js): grid per paragraph `1fr 15px 1fr`, one row per `\n` segment (= Chad's idea), gold centre
  line + ¶ number, Scheherazade New 15pt / Source Serif 4 11pt / EB Garamond, warm ink + gold palette, cover + QR, Puppeteer A4.
  Alignment: Haiku inserts `\n` on both sides, equal segment counts (scripts/align-sentences.js). Missing there: page numbers,
  running heads, TOC, breaks inside long paragraphs.

## Design
1. **Sentence rows (data).** Per paragraph → `rows: [{o, t}]`, equal counts, N:M allowed (a row may hold 2 sentences of one side).
   - free first: our own translations — regroup phrase segments by the original's ⁅sN⁆ spans.
   - else Haiku alignment (CTAI prompt: insert breaks only, equal counts, text unchanged — verified by code; mismatch → one row).
   - cached per paragraph keyed by hash(original, translation) — computed once, ever. Reader-triggered, on demand only;
     a whole-corpus pre-run (~139k ¶) is a spend decision for Chad.
2. **The page** `/print/sbs/<doc>` (edge SSR, print CSS): cover (title, original title, author, translator, QR), contents from
   sections, section title pages; body = one grid per paragraph, one grid ROW per sentence pair; sentence rows separated by
   spacing only (hidden rule), paragraphs by a visible hairline; centre gutter = gold line + ¶ number; breaks allowed between
   sentence rows, never inside one. Running head (work title) + page numbers via `@page` margin boxes (Chrome 131+).
   A4 portrait. Fonts self-hosted.
3. **PDF.** The same page printed by Cloudflare Browser Rendering at the edge (never Chrome on tower), stored in R2, linked.
4. **Anís.** Tool `sbs_document {work}` → the link (page + PDF); Jev card for "a side-by-side / bilingual / parallel text of <work>";
   in the `original` tree, offered after a passage is shown.

## Order
1 data (repo + endpoint + tests) → 2 page → 3 PDF → 4 Anís. Each step ships on its own.
