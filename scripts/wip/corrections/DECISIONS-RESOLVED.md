# Entity-Foundation Decisions — RESOLVED by user 2026-06-17

The spec the apply-script (`scripts/apply-entity-corrections.mjs`) MUST follow. Source verdicts: `verify/*.md` (~58 clusters). Apply via `graph-db.js` mergeEntities/splitEntity/addAlias through the single-writer; dry-run first.

## Blockers
1. **Write-path — APPROVED.** Build `apply-entity-corrections.mjs`: manifest-driven, DRY-RUN default (report per-op: validate ids exist, count LIVE entity_mentions), `--apply` executes via graph-db.js through single-writer (:7849), audit log. NEVER act on a keyword — only explicit id lists.
2. **Promoter — NOT boss-vLLM.** Real cause (stdout): (a) multi-model "detail vote" sends `claude-haiku-4-5-20251001` to the DeepSeek endpoint → `400 supported names are deepseek-v4-pro/deepseek-v4-flash`; (b) promoting GARBAGE non-Bahá'í entities ("Alberto Socarras's Latin Band", "Jivin' in Bebop", "Massey Hall"). FIX = route each vote model to its provider (deepseek-v4-flash→DeepSeek, haiku/sonnet→Anthropic) + SCOPE extraction to canonical content. User: "We should be using deepseek-v4-flash for extraction."
3. **extract-v2 (#3) == #2** — same pipeline; once routing fixed + scoped to the 6 canonical books, it runs and CREATES the missing entities (Sang-Sar 18, martyr rolls, half the Letters of the Living, Seven Martyrs).

## Modeling policy
4. **Concept vs work (Revelation, Bayán):** split into per-dispensation CONCEPTs + break book-titles out as WORKs. APPROVED.
5. **Place ↔ event:** keep BOTH place + event entities, BUT bare place-name mentions are frequently event-contractions ("Badasht"=Conference of Badasht; "Ṭabarsí"=Mázindarán Upheaval; "Nayríz"=Nayríz Upheaval) → resolve bare mentions to the EVENT by context, not a rigid place-only split. Disambiguation is per-mention/context.
6. **"the ‘ulamás" = a CLASS/COLLECTIVE** (the Islamic learned/clergy) — keep as collective entity. Same for "followers of the Báb" (collective). Do NOT drop.
7. **Hidden Words AND Bayán: Persian vs Arabic are SEPARATE WORKS, not translations.** → Hidden Words = 2 works (Persian Kalimát-i-Maknúnih Fársí + Arabic ‘Arabí); Bayán = 2 works (Persian 1219348 + Arabic 1219474, already split). (Corrects the earlier "Hidden Words = one work" call.)
8. **Segmentation (Phase 2) — APPROVED.** Need a clean ON-THE-FLY segmentation for the 289 empty docs + ~553 oversized (>6000ch) paragraphs. ⚠ Hard part: some languages (Arabic/Farsi/etc.) lack punctuation → naive sentence-split fails; use the AI segmenter (segmenter.js / segmentation-v2 three-pass) for non-punctuated scripts. Separate work item.
9. **Fix removal-on-delete (task #2) — APPROVED.** `entity_mentions` not pruned on delete → `graph_entities.mention_count` is stale corpus-wide. Apply logic counts live entity_mentions; add removal-on-delete so counts stay honest.

## Hard rule (#10) — NEVER keyword-merge
**NEVER blanket-merge entities on a name/keyword match. Ever.** Only explicit, verified id lists. The ~6 contaminated buckets ("the Prophet" 1220747, Fáṭimih 638207, Antichrist 619821, Sulaymán 983869, Badí‘ 1233337, Juvayní/Sárí 1060801) require PER-MENTION AI adjudication during apply. **"the Prophet" is NOT Bahá'u'lláh** (the prophetic era is closed) — it's Muḥammad (Seal of the Prophets) or earlier prophets; resolve per-mention.
