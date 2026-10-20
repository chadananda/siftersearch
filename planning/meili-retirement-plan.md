# Retire Meilisearch (Chad 10-20: "let's retire meilisearch")

Why: Meili holds ~42 GB RSS on tower; with Qdrant (~50 GB) it squeezes ZFS ARC to ~35 GB < the 57 GB SQLite DB, so
search hydration reads cold pages (searches 3–14 s, 0.2 s on 09-24). Qdrant already holds every layer Meili served
for the primary corpus (phrases 21.7M primary + 9.2M supplemental points, BM25 7.0M + 1.8M, HyPE 2.3M).

## Meili indexes on tower (10-20)
| index | entries | consumer | replacement | status |
|---|---|---|---|---|
| paragraphs | primary passages | search.js hybridSearch (main layer) | Qdrant phrase + BM25 + hype (`SEARCH_QDRANT=only`) | battery A/B running |
| hype_questions | HyPE sidecar | search.js (meili hype layer), worker syncHypeBatch | Qdrant `hype` collection | Qdrant ready |
| entity_mentions_idx | entity layer | search/entity.js | SQLite entity_mentions by entity_id (entity-mentions-repo) | DONE 876178b9 |
| concepts | lexicon proofs | search/concepts.js | lexicon in memory from SQLite | DONE 876178b9 |
| siftersearch_balib_paragraphs | 1.99M | default scope (supplemental) | Qdrant scope=supplemental | need: default-scope Qdrant query includes supplemental (verify) |
| siftersearch_ool_paragraphs | 1.95M | default scope (supplemental) | same | same |
| siftersearch_bt_paragraphs | 1.23M | site-only (bahaiteachings.org widget) | NOT in Qdrant (scope 'site' = 0 points) | need: index bt into Qdrant with a `site` payload, or drop if the widget is unused (ask Chad) |
| documents | docs | WRITE-ONLY (no searches found 10-20) | nothing — stop the writes | — |
| deep_research | research records | WRITE-ONLY (deep-research-worker syncs, nothing searches) | nothing — stop the writes | — |

## Battery 10-20 (--qdrant=only vs base, base valid 64/83; only INVALID 4 errors — a deploy landed mid-run, rerun)
Only 57/79. Lost 12, almost all FAMOUS PASSAGES: xp-one-country, xp-generous-prosperity, xp-justice-best-beloved,
xp-world-embracing, lp-hatred-by-hatred, lp-love-enemies, df-mashriq, sr-one-country/best-beloved/two-wings/essence-justice.
Cause (xp-one-country): Qdrant-only ranked a bahai-library paper ("rising tide of globalization…") above Bahá'u'lláh's
Tablets — the Qdrant fusion has NO authority weighting and no primary-over-supplemental preference (9.2M supplemental
phrase points compete). Meili had both. SAME GAP as the HyPE layer (pilgrim notes / low-authority PDFs ranking #1).
→ STEP 0 (blocking both): authority-aware fusion for the Qdrant layers (score × authority, primary > supplemental, canonical
copy over quoting copies), proven on this battery + the doctrinal battery.

## Direct Meili search callers (10-20) — ~20, all via search.js hybridSearch()/keywordSearch()/searchHypeQuestions()
public-api.js (/v1/search: widgets, external API), routes/search.js (keyword route), routes/chat.js executeSearch, routes/deep-research.js,
workers/deep-research-worker.js, rag-adapter/store.js (grounding name counts), search-target.js (count), agents/agent-librarian.js,
routes/grounding.js, ops/reports.js (meili_keyword probe), chat-pipeline.js (legacy).
→ PLAN: hybridSearch/keywordSearch/searchHypeQuestions route to Qdrant when SEARCH_QDRANT=only (hybrid → multiIndexSearch meili:false;
keyword → BM25 paragraphs_kw hydrated; hype → searchHypeQdrant) — every caller moves at once, same return shape.

## Steps
0. [x] Authority-aware Qdrant fusion (da42344a…0859aaa1: fusion, authoritative pass, canonical dedup, answer-band re-rank, authenticated-text cap, Bahá'í-scoped) (see above) — then rerun the battery with no deploys during it.
1. [x] Battery `--qdrant=only` 66/83 vs base 63/83 (p50 1.6 s vs 4.4 s) → SEARCH_QDRANT=only (10-20). Was: Battery `--qdrant=only` vs base (64/83) — flip `SEARCH_QDRANT=only` for api + anis only at parity or better.
2. [x] Concept + entity layers off Meili (876178b9).
3. [ ] Site scopes → folded into planning/site-databases-plan.md (one DB per scraped site, OceanLibrary stays primary; bt into Qdrant). Was: stamp `site` payload on supplemental points (balib, ool) so site filters work in Qdrant; decide bt.
4. [ ] Route hybridSearch/keywordSearch/searchHypeQuestions to Qdrant under SEARCH_QDRANT=only (see above). documents/deep_research are write-only → just stop writing.
5. [ ] Stop writers: unified-worker Meili sync cycles (paragraphs, hype sidecar, entity sidecar, outbox), library-watcher + indexer Meili writes, graph-meili-sync; admin Meili stats → Qdrant.
6. [ ] `systemctl --user stop meilisearch` (KEEP /fast/meilisearch-data for rollback ≥2 weeks); system-checks/critical-path stop probing Meili.
7. [ ] Measure: ARC size, search p50, battery.
