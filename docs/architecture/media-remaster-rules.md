# Media remaster rules — decision record (Chad, 10-29 and 10-31)

These are owner decisions. They are not tuning knobs. Code, tests and agents must follow them; changing one needs Chad.

## 1. Never splice (10-29, restated 10-31)
> "We cannot mix remastered and non-remastered audio together." · "There is no reason to ever splice a remaster. That is not allowed."

- A listening copy is ONE continuous output of the remaster chain. It never contains a sentence, word or span of the original.
- The word guard (re-ASR of the remaster vs the transcript) **measures only**. Its result is an assessment number shown to Chad; it never edits audio.
- **History, so it is not repeated:** before 10-29 the guard "fell back" by splicing original sentences into the remaster (`remaster.swapped`,
  `fallback_sent_pct`). Splices sound broken, and Chad rejected them. They were also never needed: Chad judges the remaster, not a patched copy.
  Getting rid of the spliced files is one reason the library is being reprocessed. Spliced files are deleted and rebuilt from the pure UniPASE output
  (`enhanced/unipase.cloud.flac`).
- **Enforced by** verdict `spliced` (never publishable) in `api/lib/media/remaster-quality.js` and `scripts/media/worker/post.py`, plus tests asserting that no splice path exists.

## 2. Every talk is remastered; the original never plays (10-31)
> "I do not want any audio to play the original. All of these audios should be improvable."

- Remastering = UniPASE (the only stack so far that improves) plus any other automated cleanup that helps. There is no "whether to remaster" decision,
  only which tools.
- A talk is on air only with its remaster. Until the remaster is done, the talk is unfinished and stays in the pipeline, off air.

## 2a. Every remaster gets the quiet pass (Chad 10-31: "we had to silence gaps between speech")
UniPASE makes the gaps between speech worse, so every remaster is followed by the quiet pass, which silences or fades the word-free stretches
(`api/lib/media/quiet-repair.js`, `scripts/media/worker/quiet.py`; runs on a worker). Quiet is not a splice: it attenuates the remaster's own gaps
and never inserts original audio. A remaster without quiet is not complete. Any rebuilt or new remaster chain must keep it.

## 3. Same or better publishes; only worse is held (10-31)
> "If they are actually worse, they should be held for review. If they are the same or better, they should be published with the remaster.
> Very few will actually be worse. When we review, we might be reviewing the assessment."

- "Not proven better" is NOT "worse". A hold needs a measured regression: overall or speech quality down, a bad excerpt, clipping, a real
  length change (decoded audio, never MP3 header estimates), or a high word mismatch.
- Pipeline failures (failed realign, missing assessment) are re-run, never held.
- **History:** on 10-31, 404 talks sat held while playing the original. 271 came from a length check that compared against the MP3 header
  estimate, 34 from an old "no proven gain" rule, and ~13 from a "0 % > 15 %" bug. Only ~30–40 were plausibly worse.

## 4. Held talks go to Chad: publish or archive (10-31)
> "Held audio needs to be presented somewhere that I can actually make a decision (publish or archive). Archived audio are not in the
> queue but are saved for later improved technology."

- Page: `/admin/media-held`. Each talk shows the reason in plain words, scores before → after, and the original vs the PURE remaster at the flagged spots.
- **Publish** puts the remaster on air. **Archive** is terminal: out of every queue and re-judge, files kept for future technology.
- A held talk is never silently returned to a queue.

## 5. Priority is order, never a filter (10-31)
> "You take 'upgrade the worst first' and turn it into 'upgrade the worst only' and then cannot complete the job."

Every rule must leave each talk with a terminal outcome: on air, held for Chad, archived, duplicate or excluded. Measure talks on air, not deliveries.

## 6. Stages are an ordered checklist that records its tools (10-31)
Each talk's stages are complete or incomplete. Each ticked stage records the tool and settings that did it, so a re-run selects
"talks whose stage X was done by tool T with old settings". It unticks that stage and the stages after it that depend on it, never earlier audio
stages, and the talk stays on air until it is complete again. Design: `planning/stage-queue-20261031.md`.
