# Handoff — Canonical Restore + Conceptual Extraction
**2026-08-25.** Written for a fresh session. Everything below is verified unless marked ⚠ UNVERIFIED.

---

## 0. The headline: search is at 11.6% and the cause is now known

`node tests/quality/score-search.mjs` on tower-nas, run **before** today's restore:

| category | pass | note |
|---|---|---|
| phrase-match | 10 / 168 (5%) | |
| concept-match | 34 / 271 (12%) | the largest category |
| cross-tradition | 16 / 52 (30%) | |
| lay-paraphrase | **0 / 12** | **was 8/12 (67%) in the earlier recorded baseline** |
| entity-aware | 0 / 9 | |
| authority-ranking | 0 / 4 | |
| **TOTAL** | **60 / 516 (11.6%)** | |

Basic queries — *patience*, *prayer*, *purity*, *prophet-moses* — returned **nothing found**.

**Why:** 20 canonical OceanLibrary books (14,588 paragraphs) had all their content soft-deleted and were
therefore absent from the index. Restored today. **The battery has NOT been re-run since.** Doing so is
the first task below, and it is the measurement that tells us how much of the 11.6% was the gutting.

---

## 1. What was restored today

20 docs / 14,588 paragraphs, all soft-deleted on **2026-06-12** by the sites-ingester `reconcileDeletes`
bug (the one found that same day, which was "re-gutting ~30 restored canonicals/day"). The June sweep
missed them.

Recovered includes: Divine Philosophy (4,166¶), Secret of Divine Civilization (1,394¶), Priceless Pearl
(1,364¶), Paris Talks (725¶), **Bahá'í Administration (693¶)**, Selections from the Writings of the Báb
(610¶), Memorials of the Faithful (597¶), Summons of the Lord of Hosts (497¶), This Decisive Hour (424¶),
**Epistle to the Son of the Wolf (317¶)**, A Traveler's Narrative (219¶), Gems of Divine Mysteries (124¶).

**Four were invisible to the obvious query** because they carried `duplicate_of` pointing at an
OceanLibrary doc with **zero live content** — an empty shell. Their only real copy was suppressed in
favour of nothing. Those flags were cleared: 8317→20896, 8273→20780, 16276→20899, 8253→20782.

- Snapshot before the restore: `fast/siftersearch-db@pre-canonical-restore-20260825`
  (rollback: `sudo zfs rollback fast/siftersearch-db@pre-canonical-restore-20260825`)
- Method: single writer `:7849/write`, one bounded `UPDATE … SET deleted_at=NULL, synced=0` per doc.
- Verified after: 269 OL docs, **316,800 live paragraphs**, `synced=0` count is 0.
- Proof the deletion was spurious: the source file was on disk the whole time —
  `Ocean Library/-sites/oceanlibrary.com/Bahá'í/Bahá'u'lláh/Epistle to the Son of the Wolf.md`, 593 lines.
  Restored DB text matches the file's opening verbatim.

---

## PLAN A — Fix and index every OceanLibrary canonical

### A1. Verify the restored content is actually retrievable ⚠ UNVERIFIED
`synced=1` is set **optimistically** — the worker marks it before Meilisearch confirms, so it is not proof
of indexing. Meili holds 4,221,827 docs.

```bash
# pick a restored paragraph and prove it is findable
sqlite3 data/sifter.db "SELECT external_para_id, substr(text,1,60) FROM content WHERE doc_id=8273 AND deleted_at IS NULL LIMIT 1"
curl -s -H "Authorization: Bearer $MEILISEARCH_KEY" -X POST http://localhost:7700/indexes/paragraphs/search \
  -d '{"q":"Eternal that perisheth not","limit":3}' -H 'Content-Type: application/json'
```
If missing, force re-sync: `UPDATE content SET synced=0 WHERE doc_id IN (…)` via the writer, then let
`siftersearch-worker` drain. Embeddings are cached by normalized hash (`embedding-cache.js`), so re-index
is cheap — no re-embedding cost.

### A2. Re-run the search battery — the payoff measurement
```bash
nohup node tests/quality/score-search.mjs --json > /tmp/search-after-restore.json 2>&1 &
```
Takes ~68 min (516 fixtures × ~8s). **Do not pipe through `tail`** — a timeout discards the buffer, which
cost two runs today. Compare against the 60/516 baseline above.

### A3. Sweep for any remaining gutted canonicals
```sql
SELECT d.id, d.title, COUNT(*) FROM docs d JOIN content c ON c.doc_id=d.id
WHERE d.deleted_at IS NULL AND d.source_site='oceanlibrary.com'
GROUP BY d.id HAVING SUM(c.deleted_at IS NULL)=0;
```
Currently 7 remain — all with a `duplicate_of` target that genuinely **has** live content, so they are
correctly suppressed. Re-check after any watcher/ingester run.

### A4. De-index competing scraped copies (small, reversible)
Audit result: 532 OL canonical titles; only **13** have competing indexed copies (23 docs — 13
bahai-library.com, 10 main library). De-index, do **not** delete.

⚠ **The wrong-search-links problem is mostly RANKING, not duplication.** The corpus holds 147,477 scraped
docs (oceanoflights 72,420 + bahai-library 75,057) against oceanlibrary's 565. For a given work,
commentary outweighs source roughly 10:1 — the Íqán is 292¶ against thousands of paragraphs of study
guides, companions and third-party translations, which are legitimately distinct works. Deleting
duplicates will not fix that; a canonical-preference boost will (see `core-roster.js`, Plan B).

### A5. Add the missing detector to `docs/audit-checklist.md`
This survived two months because nothing watched for it. The June integrity tripwire alarms on live-content
*drops*; these were already-deleted rows sitting quietly.

> **Invariant:** no `source_site='oceanlibrary.com'` doc has zero live content.
> **Check:** the A3 query. **Expected:** 0, or every exception explained by a duplicate target that holds content.

Add to `scripts/audit-invariants.mjs` as an AUTO check.

### ⚠ Never blanket-delete "duplicates"
`duplicate_of` flags are corrupted by the same bug — four today pointed at empty shells. Restore first,
adjudicate second. `api/lib/dedup-adjudicator.js` exists and fails safe to DISTINCT.

---

## PLAN B — Conceptual extraction from the core books

### The design decided today

**Identity is the ROOT, never the English gloss.** English is a lossy projection of a more differentiated
vocabulary. Verified via CTAI: `الصلاة` → ص-ل-و, `الدعاء` → د-ع-و, `الذكر` → ذ-ك-ر — three unrelated roots
all surfacing as "prayer". Likewise ʿadl (ع-د-ل) and insáf (ن-ص-ف) both → "justice". Merging those would
attach the obligations of one to another: a doctrinal error manufactured by translation.

**But Shoghi Effendi's rendering is NOT an approximation to correct.** As authorised interpreter his
word-choice *fixes which sense* of a polysemous term is operative. So:
- **the original** → WHICH TERM (identity, differentiation)
- **his rendering** → WHICH SENSE (authoritative interpretation)
- neither outranks the other; the prompt says so explicitly.

### CTAI is the tool, and it works in one direction only

`POST https://ctai.info/api/v1/jafar {text, filter:false}` — glosses **original-language** text. Returns
per term: `root`, `transliteration`, `literal`, **`root_slug`** (e.g. `dl-justice-just`,
`nsf-fairness-equity`) and `rendering_spectrum` (`[{en:"justice",count:104},…]`).

⚠ It returns **all nulls for English input**. It cannot work backwards from a translation.
`GET /passages?q=…&align=true` returns aligned pairs: `focus.source` (original), `focus.translation`,
plus `source_span`/`target_span`. Verified: "clouds of heaven" → Gleanings pair_index 45, source
`غمام امتحانات ربّانی`.

**`root_slug` is the concept key.** Note the rendering spectra OVERLAP (both ʿadl and insáf render as
"equity"), so English→root is a **recall** operation with weights, never a determination — recall widely,
bind on evidence, HOLD when ambiguous. Same doctrine as person names.

### The core roster — `api/lib/rag/concepts/core-roster.js` (built today)

Three classes, because the reading differs:

| class | works | the English is… |
|---|---|---|
| GUARDIAN_ORIGINAL | GPB 21310, World Order 20894, PDC 20893, Advent 20890, Citadel 20882, Messages 20887 | **the original** — he wrote in English; no CTAI needed |
| GUARDIAN_TRANSLATION | **Íqán 20810**, Gleanings 8312, Hidden Words **20809**, ESW **8273**, Dawn-Breakers 21308 | authoritative *interpretation* of an original |
| DESIGNATED | SAQ 20911, TDP 20914, Aqdas 21307 | **authoritative works** by his designation; only his sense-fixing word-choice is absent |

⚠ **Provenance is part of identity.** Canonical = `source_site='oceanlibrary.com'` or main library (NULL).
Nothing from oceanoflights.org or bahai-library.com. This caught two errors today:
- **Hidden Words: canonical is 20809, NOT 28628.** The 218 concept claims we hold came from the *scraped*
  copy and **must be re-extracted** against 20809.
- ESW canonical is 8273 (restored today); 20780 is an empty duplicate record.

### Current concept-track state

- `concept_claims` 9,707 · `concept_lexicon` 1,706 · `concept_entities` 1,331 · `concept_links` **0**
- Lexicon sources: **100% Shoghi Effendi's six works.** Íqán/SAQ/Aqdas/Hidden Words contributed **0** until
  today's Íqán seed (55 entries).
- Source-text extraction is **truncated**: Íqán stops at ¶115/292 (39%), SAQ ¶144/789 (18%), Aqdas 42%,
  Hidden Words 55%. GPB ran to 99%. Gleanings **0%**.
- Sense recall vs gold standard (`tests/quality/score-concepts.mjs`): clouds 75% (was 50% before today's
  relation fix), Sun of Truth 50%, Covenant 33%, Bayán 0%.
- `concept_mentions` = **0** — no occurrence layer. `concept_id` = 0 on all claims; reconcile has run
  (520 calls) but nothing was ever promoted.
- Roots present on **3.2%** of claims, **0%** of entities — so `conceptKey()` would throw for every entity.

### The concept→HyPE channel WORKS (verified)

`api/lib/rag/enrich/retrieval.js` pulls `getCastSeed` (persons), `getParaClaims` (entity claims) and
`getParaConceptClaims` (concepts) into the HyPE prompt, with an explicit block:
*"AUTHORITATIVE INTERPRETATIONS this passage develops (ASK ABOUT THESE — name the concept, do not echo
the wording)."*

Proof — Íqán ¶81 produced *"What are the dark clouds that veil man's understanding in every Dispensation?"*
naming the extracted concepts. **This is the channel by which concepts reach search.** `conceptsOf` is
deliberately optional, so concepts silently do nothing wherever absent.

**834 concept-bearing paragraphs have NO HyPE at all** → their concepts cannot reach search:
Messages 20887 (417), Citadel 20882 (381), Hidden Words (34), Íqán/SAQ (1 each).
Fill with `POST /api/admin/grounding/queue {"docIds":[20887,20882,…],"only":"hype"}` — **no `rehype`**, so
it resumes and only touches unstamped paragraphs.

### Execution order

1. **Fix root capture in the extractor** *before* any new extraction, or the new books arrive rootless and
   need re-running. Use `api/lib/rag/concepts/bilingual.js` (built today, 11 tests) — it carries the
   original + CTAI root gloss + SE rendering in ONE call, and degrades honestly (omits the root rather
   than inventing one) when no alignment exists.
2. **Extract the five core books**: Íqán 20810, SAQ 20911, Gleanings 8312, Aqdas 21307, Hidden Words 20809.
   ~1,900¶ remaining. Then **assess deeply** before scaling (Chad's instruction).
3. Rehype those books so the new concepts reach HyPE.
4. Re-run `score-concepts.mjs` and `score-search.mjs`.
5. Only then: Core Tablets (259 docs / 8,744¶), then all doctrinal (58,600¶).

### Costs, from real token data

deepseek-v4-flash measured: 1,008¶ → **$2.05** (~$0.002/¶). Anthropic est. ~$0.02–0.04/¶.

| scope | ¶ | deepseek | Anthropic |
|---|---|---|---|
| five core books | ~1,900 | ~$4 | **$40–75** |
| + Core Tablets | 8,744 | ~$18 | $175–350 |
| all doctrinal | 58,600 | ~$120 | $1,200–2,300 |

---

## 2. DECISIONS NEEDED FROM CHAD

1. **`PAID_DOC_ALLOWLIST`** — Anthropic is fail-closed to approved Persian books
   (`api/lib/anthropic-policy.js`). DeepSeek is weak in Arabic, so bilingual core extraction wants
   Anthropic. The env var is the sanctioned hatch (same one used for the Dawn-Breakers/GPB flagship
   exception): **env-scoped, no deploy, removing it closes the exception**. Proposed ids:
   `20810,20911,8312,21307,20809`. *I did not widen the policy in code — that module exists because a past
   leak billed Sonnet on 421K non-Persian paragraphs.*
2. **Re-extract Hidden Words** against canonical 20809, discarding the 218 claims from scraped 28628?
3. **De-index the 13 competing scraped copies?**
4. **3 entity natural-key collisions** await a merge decision: `Collis Featherstone, Hand of the Cause`
   (1300671/1302375), `Raḥím` (1300837/1300845), `Ḥusayn` (1286251/1253976).

---

## 3. Doctrine established today (in memory, do not re-litigate)

- **Polysemy**: binding returns the SET of senses ranked, never picks one. A concrete reading never vetoes
  a symbolic one. `bindSenses()` in `concepts/lexicon.js`.
- **Authority ladder**: Shoghi Effendi written 50 · ‘Abdu'l-Bahá 40 · Bahá'u'lláh 30 · the Báb 20 ·
  **pilgrim notes 12–16** · **scholars AND all Houses of Justice + the appointed branch 5** · unattributed 0.
  "Non-authoritative" is *relative*: a pilgrim note ranks below the Guardian's written word and **above**
  every human and institution after him. A House of Justice holds real **legislative** authority;
  doctrinal authority is a different kind and ended with the last authorised interpreter.
- **Concept identity ≠ term**: same concept under different terms (Sun of Truth / Day-Star / divine
  Luminary), AND one term hiding several concepts (prayer → Ṣalát/Duʿá/Dhikr). Three tiers: spelling
  (done, `canonicalSurface`), root (blocked at 3%), evidence-bound synonymy (not built).
- **Relations**: `concepts/relations.js` is the ONE classification. `teaches` (7,280 claims, 75%) stays
  OUT of the lexicon deliberately — doctrine content, not symbol sense. `unknownRelations()` is the
  detector for the open-producer/closed-consumer gap.

## 4. Traps that cost time today — don't repeat

- **Grep the module that WRITES the artifact**, not one that shares its name. I concluded "HyPE has zero
  concept awareness" from `search/hype.js` (the indexer); the generator is `rag/enrich/retrieval.js`.
- **Filter by `source_site`** on every title search, or scrapes outnumber canonicals 128:1.
- **Editing an already-applied migration is dead code** — the runner runs each version exactly once.
  That is why migration 119 exists separately from 118.
- **Don't pipe long batteries through `tail`** — a timeout kills the buffer.
- **An empty result is usually my own query's fault.** It happened three times today (Bayán surface
  mismatch, ESW quoting, `asserted_at` on the wrong table).
- `api/routes/people.js` names its plugin param `server`, not `fastify`.
