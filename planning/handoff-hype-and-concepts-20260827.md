# Handoff — bilingual originals, concept extraction, HyPE quality (2026-08-27)

Read this, then `GET /api/admin/concepts/status` and the HyPE history file. Everything below is measured,
not remembered.

Auth for every call: `-H "X-Internal-Key: $DEPLOY_SECRET"` (from `.env-secrets`), base
`https://api.siftersearch.com/api/admin`. Live version must match `package.json` — check `/health`.

---

## 1. Originals — DONE except Bahá'í Prayers

Every canonical translation now carries its original text, per paragraph, with provenance in `align_ref`.

| book | coverage | | book | coverage |
|---|---|---|---|---|
| Will & Testament | 100% | | Memorials of the Faithful | 94% |
| Íqán · SAQ · Secret of Divine Civilization | 99% | | Gleanings | 94% |
| Selections from ‘Abdu'l-Bahá | 97% | | Seven + Four Valleys | 88% |
| Summons of the Lord of Hosts | 97% | | Tablets of the Divine Plan | 86% |
| Selections from the Báb | 96% | | Epistle to the Son of the Wolf | 81% |
| Prayers and Meditations · Hidden Words | 96% | | Tablets after the Aqdas | 79% |

Remaining gaps are **not** missing originals: they are short liturgical formulae the original doesn't break
out ("Upon you be greeting and praise!"), and — in the Epistle and Gleanings — **duplicate rows in our own
text** (317 rows for 268 real paragraphs). Aqdas 62% is the notes. Bahá'í Prayers 9% may have no parallel
publication (Chad's read).

**Method order, cheapest first** — `api/lib/rag/concepts/originals-targets.js` holds the target list:
1. `POST /concepts/probe-stems {docId, all:true}` — FREE. Sweeps the sitemap catalogue and reports which
   published works are inside a document and where. Use for any compilation. Never hand-list contents.
2. `POST /concepts/align-bahai-org` — deterministic ordinal pairing when editions are paragraph-for-paragraph.
   Free, 0.65s, and it REFUSES unless the offset beats its runner-up decisively.
3. `POST /concepts/align-ool-work` — verse numbers, where both sides carry them.
4. `POST /concepts/segment-ool-work` / `segment-bahai-org` — PAID Sonnet segmentation of a continuous original.

---

## 2. Concept extraction — WORKING, two books done

| doc | book | claims |
|---|---|---|
| 20810 | Kitáb-i-Íqán | **3,523** (was 153) |
| 20911 | Some Answered Questions | **6,252** |

Bilingual extraction produces **two claims per term, one per authority** — which is the design working:

```
withdrawal from remembrance — teaches — "Shoghi Effendi renders يَعْشُ as 'withdraw'…"   ← English proof
withdrawal from remembrance — means   — "The verb يَعْشُ (to be dim-sighted)…"           ← Arabic proof
```

Read back: `GET /concepts/claims?docId=&limit=`. Run: `POST /concepts/start {docId, only:"extract"}`.

**PREREQUISITE — disambiguation gates extraction.** Only these are ready:

| ready | not ready |
|---|---|
| Íqán 292/292 · SAQ 789/789 · Aqdas 304/304 | Gleanings **28**/746 · Hidden Words **46**/163 · Epistle **3**/317 |

Every newly-aligned book (Memorials, both Selections, Summons, TDP, Valleys, SDC, Tablets after Aqdas) also
needs disambiguation first. **This is the long pole, not extraction.**

---

## 3. HyPE — v12 live, measured, NOT finished

**Currently mid-regeneration on SAQ.** Version mix as of handoff:
`v12: 93, v11: 30, v10: 74, v6: 71, v5: 511, none: 10`. Relaunch to finish:

```
POST /grounding/stop  {docId:20911}
POST /grounding/start {docId:20911, only:"hype", rehype:true, cc:40}
```

### Measurement (this is the important part)

`node tests/quality/score-hype.mjs --doc=20911 --sample=30` — a second model grades questions four ways.
History in `tests/quality/hype-history.json`:

```
n=10 q=136  searchable 76%  answered 65%  distinct 70%  missed 2      ← scorer was blind to the original
n=10 q=136  searchable 90%  answered 89%  distinct 65%  missed 2
n=10 q=129  searchable 97%  answered 77%  distinct 77%  missed 1.7
n=10 q=126  searchable 88%  answered 78%  distinct 71%  missed 1.8
n=30 q=367  searchable 92%  answered 78%  distinct 78%  missed 2.13   ← first stable reading
n=30 q=360  searchable 95%  answered 80%  distinct 77%  missed 2.07
```

**USE sample=30 OR MORE.** At sample=10 the numbers swing ±10 points between identical runs and I tuned
against that noise for two revisions.

**v12's effect is not yet measured** — it deployed while regeneration was still running. Measure it first.

### What "good" looks like and where it stands

- `answered` is the defining property (Chad: *"The paragraph should always be an answer or a major partial
  answer of every question. Otherwise the question does not belong to the paragraph. This is basic HyPE
  logic!"*). **80% is not good enough.** One question in five sends a reader to the wrong passage.
- `missed` ~2/paragraph is the number no mechanical check can approach, and the one that silently gets
  worse when you tighten the prompt. Watch it on every revision.

### v12's unmeasured change — the most promising lead

The heading was available on every paragraph (`p.heading`, selected by the adapter all along) and
`retrieval.js` **never read it**. In SAQ the heading IS the question — 85 of them, "Proof and Arguments for
the Existence of God", "The Need for an Educator". Chad: *"SAQ is the ideal document for HyPE… if we don't
get solid HyPE questions here, we will not get them anywhere. Notice how ‘Abdu'l-Bahá answers one question
and tries to address all related philosophical questions related to that question within each answer."*

v12 feeds the heading and tells the model a single answer legitimately settles several distinct asks.
**Measure whether it moved `answered` and `missed`.**

---

## 4. Rules learned the hard way tonight — do not relearn these

**A prompt change IS a version change.** Rewrote the HyPE prompt, ran `--rehype`, got byte-identical
output: `isHyped` matched the unchanged `HYPE_VERSION` and skipped all 292 paragraphs. Bump the version.

**A stage that discards most of its work must say WHAT it discarded.** "claims 103, written 1" cost two
wrong fixes; drop samples named the cause in one run (the field was `relation`, not the proof).

**Never conclude from one index of a source.** Three times: the Íqán re-fetched at 99% coverage; the
whole-book TDP page read as the work (it's published per chapter, 86% now); the Súriy-i-Haykal declared
unpublished (it's at `bahaullah-pub06-090-ar`, a different series). **The sitemap has 13,454 stems; the
best-known-works tables have 112.** `data/oceanoflights-stems.json`.

**Thresholds that drop content produce absence, not errors** — and absence reads as a fact about the world.
A `text.length > 20` filter deleted `هو الأبهى`. A `minMatches: 3` floor hid 28 of 76 Báb pieces.
Chad: *"you keep making up rules that mangle our content."*

**Never fix a count problem with a cap.** Chad: *"we cannot guess in advance how many questions a paragraph
will answer. You fixed the too many questions problem with a cap before and that is broken thinking."*
Distinctness is tested by whether the ANSWER differs.

**Enforce monotonicity as a conclusion, not a ratchet.** One spurious match advanced a greedy cursor and
cost 25 real alignments, which I read as "the site only publishes half the work".

**Optional ports degrade silently.** `getParaClaims`/`getParaConceptClaims` did not exist, so
"knowledge-informed HyPE" was never once true. Check `stats.factFed`.

**Two policies that must agree will diverge.** `anthropic-policy.js` and `rag-adapter/usage.js` both gated
spend; usage.js now imports the policy instead of copying it.

**Doctrine:** Shoghi Effendi's rendering ESTABLISHES a sense — authoritatively, uniquely (sole designated
interpreter) — but does NOT foreclose others. Chad: *"'his word-choice fixes which sense' is both
under-appreciating and over-simplifying interpretation."* Never name a book inside a HyPE question: the
point is to tie concepts ACROSS works, and scoping is a filter's job.

---

## 5. Next, in order

1. **Measure v12** on SAQ at sample≥30. If `answered` did not move, the next lever is the judge's own
   feedback loop — feed its rejections back as negative examples.
2. **Disambiguate** Gleanings, Hidden Words, the Epistle, then the newly-aligned books. Gate for everything.
3. **Then bulk**: extract → hype across books with originals, then Shoghi Effendi's English works.
4. Open from earlier: de-index 23 scraped copies; re-anchor 218 Hidden Words claims from 28628 → 20809.

**Throughput:** HyPE 14 paragraphs/min at `cc=40` (was 5 — `cc` was never passed to the stage, and the pool
worked over segments rather than paragraphs). Concept extraction ~150 claims/min.

**Spend:** roughly $25 of the authorised $200.
