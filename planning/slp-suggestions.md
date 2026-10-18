# SearchLayerPDF — suggestions from SifterSearch's Dewey pilot (2026-10-18)

From ~20 real jobs (privacy `open`, quality `economy`): typed and printed scans of pilgrim notes, letters and
books, plus handwritten letters. Every output is checked by Dewey against its own preliminary read of sampled
pages before import. Job ids are given so each point can be reproduced.

## What works well
- **Typed/printed scans are excellent.** 11 of 11 passed our cross-check (our sampled pages 74–99% found), with
  SLP scores 81–97 and cost ≤ $0.03. Diacritics are preserved, footnotes are kept, and the print page arrives in
  the markers (`<!-- pdf:2, pg:98 -->`).
- **The frontmatter metadata is genuinely useful.** Title, author and description read from the title page
  (e.g. "Copy of Notes of Miss Rosenberg on the reading of the Will of 'Abdu'l-Bahá", Ethel J. Rosenberg). We
  use it when our own appraisal has nothing.
- **The receipt narrative is clear** and is shown to readers on our import board.

## Suggestions, most important first

1. **Handwriting: say "illegible", never invent text.** On two handwritten Sears letters the Markdown was mostly
   noise, and in one it **invented a fluent phrase** that is not on the page ("Congratulations on the new double
   grandchild - How wonderful. Professor and Margaret and all…"; the page says "Congratulations on being double
   grandparents! You are now professionals…"). Jobs `job_625ANQWmqMllhzvu`, `job_85UI0ioRFdEWJVN2`.
   - Detect handwriting (per page or block) and either route it to a vision model (the receipt already has a
     `pages_vision` field, always 0 so far) or mark it `[illegible]` with low confidence.
   - A fluent invention is worse than noise, because noise fails a check and fluent text passes.
   - A vision model read the same pages almost perfectly for us.

2. **Emit paragraphs, not printed lines.** Blocks end at every printed line ("There were probably fewer than
   6,000 ⏎⏎ Baha'is in the United States…"), so one sentence becomes several paragraphs downstream. Use the layout
   (line width, indentation, vertical gaps) to reflow lines into paragraphs. We now rejoin on our side, but
   SLP has the geometry to do it properly.

3. **Per-block confidence in the Markdown.** The receipt has engine confidences per block, but the Markdown
   doesn't. An optional `<!-- conf:0.42 -->` (or a JSON side-car keyed by page and block) would let clients keep
   good pages and re-read bad ones, instead of accepting or rejecting a whole document.

4. **Make the quality score consistent.** `quality.after` is sometimes **lower** than `before` on outputs that are
   clearly good. For example the Wilkin notes went 0.12 → 0.08 yet passed every check at 80% overlap, and a Weeden
   letter went 0.76 → 0.75. Either calibrate it or document what it measures; as it stands a client can't use it
   to decide anything.

5. **Mark footnote references, stamps and marginalia.** Superscript footnote numbers are flattened into words
   ("fewer than 500 of them were a4 ⏎ African Americans"). Archive stamps and margin notes appear as junk lines
   ("(42d", "(PE Clee", "5, Box 7: ETHEL J. ROSENBERG"). Suggested: `[^4]` for footnote references, and a class or
   comment for stamps, marginalia and running headers, kept out of the body text.

6. **Flag front matter and excerpts.** A 4-page file holding only a title page and table of contents (Knitter,
   *The Myth of Religious Superiority*, `job_mmrS5hvpk6iH07zF`) came back as if it were the book. A receipt flag
   such as `document.part: "front-matter" | "excerpt" | "complete"` would save a human check.

7. **Throughput for small jobs.** 1–7-page jobs took 7–16 minutes end to end, mostly queueing and GPU start-up.
   Ideas:
   - a fast path for jobs of 1–3 pages;
   - queue position and an ETA in `GET /v1/jobs/:id`;
   - a batch endpoint, so a client can submit 50 small scans at once and keep one pod warm.

8. **API details.**
   - The receipt's `stages` array is always empty.
   - `pages_done` / `pages_total` progress is great; please keep it.
   - Returning `markdown` inline in `/result` for small documents would save a second request.
   - Please document the page-marker format (`pdf:N[, pg:P]`) as stable.

## How Dewey checks SLP output (for reference)
- **Real words:** at least 75% real word shapes on Latin text.
- **Enough text:** at least 40 words per page.
- **Consistency:** at least 40% of the distinctive (5+ letter) words from pages we read ourselves (tesseract, or
  vision for handwriting) must appear in SLP's text.
- **Failures:** a failed check sends the document to a person. For handwriting, Dewey's own vision transcription
  is used instead, under the same check.
