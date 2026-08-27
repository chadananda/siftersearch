# HyPE v12 measured on SAQ — and the bug the measurement uncovered (2026-08-27)

Live version 2.186.370 = `package.json` (checked `/health`). Doc 20911 (Some Answered Questions),
778/779 eligible paragraphs at `hype-v12-heading-aware` when scored.

## 0. The run the handoff called "mid-regeneration" was dead

`/grounding/books/20911` showed pid 1240320 stalled at 128/779, `updatedAt` 35 minutes stale;
`/grounding/monitor` had `live:[]`. `POST /grounding/stop` returned `signalled:false` — already gone.
Relaunched `{only:"hype", rehype:true, cc:40}` → pid 1254844, finished 16:11 UTC at 778/779.
`rehype` maps to `upgrade:true`, which is version-aware (`retrieval.js:62`), so it resumed rather than
redoing the 136 paragraphs already at v12.

The one holdout is ¶788 (12,339 chars — the longest in the book), still at v5. The 10 paragraphs at
`none` are 12–59 chars, below `MIN_LEN`; correctly ineligible.

## 1. The score

`node tests/quality/score-hype.mjs --doc=20911 --sample=30`

| | v5-mix (last two n=30 runs) | **v12** |
|---|---|---|
| searchable | 95% / 92% | **85%** |
| answered | 80% / 78% | **91%** |
| distinct | 77% / 78% | **90%** |
| missed / paragraph | 2.07 / 2.13 | **2.23** |

`answered` moved 11 points — what §5.1 of the handoff asked for. **Do not act on that number.**

## 2. The population shrank underneath the score

Same book, same paragraphs, before and after the regeneration:

| paragraphs previously at | n | q/para before | q/para after v12 |
|---|---|---|---|
| hype-v5-distinct | 510 | 12.62 | **1.37** |
| hype-v6-crosswork | 71 | 12.61 | **1.49** |
| hype-v10-answer-gated | 58 | 2.16 | 0.97 |

**536 of 778 v12 paragraphs (69%) carry ZERO questions.** Book-wide: 1,179 questions where v5 had ~9,800.

Empty is not a no-op. `retrieval.js:168` stamps the version and writes `[]` — the paragraph is *processed*,
`isDone` is true, and it is unreachable by search. It will never be retried.

And `score-hype.mjs:78` filters rows to `qsOf(r).length`. **The scorer has only ever graded paragraphs that
produced questions.** All six historical rows and this one measure survivors. Quality rose because coverage
fell: the 69% that failed left the denominator. This is the "measure the matched population" error, this
time built into the instrument.

Failure is monotonic in paragraph length — the tell that it is mechanical, not editorial:

| text length | % emptied |
|---|---|
| <200 | 23% |
| 200–400 | 53% |
| 400–600 | 73% |
| 600–900 | 85% |
| 900–1500 | 92% |
| >1500 | **100%** |

Every substantial paragraph in SAQ is now empty.

## 3. It is not the prompt and not the span gate

The collapse begins exactly at v10 (`answer-gated`), so the v10 span gate (`spanIsPresent` — exact ≤90-char
substring of either text) was the obvious suspect. It is innocent.

Replayed 12 emptied paragraphs through the real `buildSystem`/`buildUser`/`parseHype`/`spanIsPresent`
(`tmp` harness, production prompt, production model):

| how `thinking` was sent | truncated | parse-fail | q/para kept | gate rejection |
|---|---|---|---|---|
| `extra_body:{thinking:{type:'disabled'}}` — **what production sends** | 7/12 | 7/12 | 2.6 | 3% |
| `thinking:{type:'disabled'}` — top level | **0/12** | **0/12** | **8.0** | 7% |

The gate never emptied a single paragraph in either arm.

## 4. Root cause: `extra_body` is a Python-SDK idiom and does nothing in Node

`api/lib/ai.js:248`

```js
params.extra_body = { thinking: { type: thinking ? 'enabled' : 'disabled' } };
```

with the comment *"extra_body passes non-standard params through the OpenAI SDK to the underlying API"* —
true of the **Python** SDK, false of the Node one. `openai@6.10.0` contains no reference to `extra_body`
(`grep -rl extra_body node_modules/openai/` → nothing). The field is serialized literally, DeepSeek ignores
an unknown key, and the model keeps its default.

So **thinking has never once been disabled on any DeepSeek call in this codebase.** v4-flash reasons, the
reasoning counts against `max_tokens`, the budget is exhausted before any content is emitted
(`finish_reason:"length"`, `content` length **0**), `parseHype` returns null, the ladder retries 4× (`profile.js:13`),
`markHypeExhausted` stamps the version with `[]`.

Longer paragraph → more questions to plan → more reasoning → truncation. That is the length curve in §2.

This is the same fault already recorded twice without its cause being found:
- `retrieval.js:~66` — *"at 4000, 481/500 pilot calls truncated"*, patched by raising `max_tokens` to 8000.
  The budget was never the problem.
- `profile.js:8` — *"under-budgeting truncates → continuation thrash. That is a CALL bug to fix"*. Correct
  diagnosis, wrong call identified.
- memory `project_reasoning_tax_output_cost` — *"v4-flash reasoning tax ~88%"*. That tax is this bug.

**Blast radius is every DeepSeek call in the system**, not just HyPE: disambiguate, extract, reconcile, link,
bio, deep-research. All have been paying for reasoning nobody asked for and, where budgets are tight,
silently returning nothing.

Waste on this run alone: ~536 paragraphs × 4 ladder tries × 8,000 output tokens ≈ **17M output tokens spent
to write zero questions**.

## 5. What this means for the numbers already in `hype-history.json`

Every row is a survivor-only reading. The v5-era rows (12.6 q/para, ~92% searchable) are the closest thing
to a whole-population measurement, because at v5 the failure rate was low enough not to distort. The v12 row
is 31% of the book. **They are not comparable and the file should not be read as a trend.**
v12's prompt is unmeasured — no clean reading of it exists yet.

## 6. Next, in order

1. Fix `ai.js:248` — send `thinking` as a top-level param (**decision pending: it changes every DeepSeek
   call in the system**).
2. Re-run SAQ HyPE and re-score. Only then is v12's prompt measured.
3. Teach `score-hype.mjs` to report coverage — paragraphs with zero questions as a share of eligible ones —
   so a yield collapse can never again read as a quality gain.
4. Re-examine what else was silently emptied: any book hyped or extracted since v4-flash came in.
5. Only then: disambiguation (Gleanings, Hidden Words, Epistle) and bulk extract.

## 7. Unrelated defect found while reading the v12 prompt (not touched — a prompt edit forces a version bump)

`retrieval.js:325` — "NEVER NAME THE BOOK OR WORK IN A QUESTION" — and eleven lines later the worked example
is `"What does ʿirfán mean in the Kitáb-i-Íqán?"`, which violates it.

---

# ADDENDUM — fix shipped, SAQ re-run, and the honest reading of v12's prompt

Committed `b36862c7`, version **2.187.1** in `package.json` and live on `/health`. Both DeepSeek call sites
(`ai.js`, `ai-services.js`) now send `thinking` top-level. `HYPE_VERSION` → `hype-v13-thinking-fixed`
(the v12 PROMPT is unchanged; only the generator's call config is — and the bump is what lets `rehype`
regenerate paragraphs already stamped v12).

## The fix works, and it is not marginal

| | v12 (broken call) | **v13 (fixed call)** |
|---|---|---|
| eligible paragraphs with questions | 242/778 (31%) | **773/779 (99%)** |
| processed-but-empty | 536 | **6** |
| q/para book-wide | 1.52 | **6.74** |
| paragraphs >900 chars that came back empty | 92% | **0%** |
| wall-clock for the whole book at cc=40 | ~95 min | **~6 min** |

The 6 remaining empties are 0.8% — a normal failure floor, not a pattern.

**The 16× speedup is the same bug seen from the cost side.** Every call had been buying reasoning tokens
nobody asked for, on every DeepSeek stage in the system. This is the "reasoning tax" from
`project_reasoning_tax_output_cost`, and it was never a property of the model — it was a dropped parameter.

## v12's prompt, measured on a whole population for the first time

`score-hype.mjs --doc=20911 --sample=30`, coverage 99%:

| | v5-era (n=30, ~92% coverage) | v12 (31% coverage — survivors) | **v13 = v12 prompt, 99% coverage** |
|---|---|---|---|
| searchable | 95% / 92% | 85% | **87%** |
| answered | 80% / 78% | 91% | **80%** |
| distinct | 77% / 78% | 90% | **88%** |
| missed / para | 2.07 / 2.13 | 2.23 | **2.13** |

**`answered` did not move.** 80% then, 80% now. The 91% was entirely the survivor effect — the paragraphs
that failed were the ones that would have scored badly, and they left the denominator. The handoff's §5.1
condition is met exactly as written: *"If `answered` did not move, the next lever is the judge's own
feedback loop — feed its rejections back as negative examples."*

What v10→v12 did buy, honestly:
- **distinct 77% → 88%.** Real. The span gate and the one-question-per-teaching rule work.
- **searchable 92-95% → 87%.** A real regression, and the largest remaining defect after `answered`.
- **q/para 12.6 → 6.7** with **`missed` flat at ~2.1**. Halving the questions cost no measured coverage of
  what the paragraph teaches — the questions removed were the redundant ones. This is the one place a
  smaller number is the good news, and `missed` is what licenses saying so.

The judge's rejections cluster on one shape, which is what §5.1's feedback loop should target first:
a passage that MENTIONS a term without explaining it still attracts "what does X mean?" — ¶29 "what does it
mean to be a material educator", ¶55 "what is the meaning of the crown of thorns". The prompt already
forbids this in prose ("MENTIONING IS NOT ANSWERING") and the model still does it. It needs examples, not
more rules.

## Still open

- 5 of the 6 remaining empties, and ¶788 (12,339 chars), are unexamined.
- **Every other book hyped or extracted while this bug was live is suspect.** SAQ is one document; the
  fault was in the shared call path. Sweep for paragraphs stamped with any generator version and carrying
  zero output before trusting any book's coverage.
- Prompt defect from §7 still unfixed (the `Kitáb-i-Íqán` example contradicting "never name the book").
