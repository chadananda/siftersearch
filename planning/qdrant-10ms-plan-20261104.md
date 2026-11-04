# Qdrant 10 ms plan — 2026-11-04

Contract: no indexed Qdrant search over 10 ms (Qdrant's own time, `qdrant_server_by`). Starting point (search-bench
`--mode plan --conc 3 --rounds 6`): p50/p95 ms — paragraphs_kw 19/25, phrases 18/29, concepts 16/31, hype 8/16, phrases_hot 7/10.

Method: read-only, on tower, while a battery ran. 30 real queries (16 topical, 6 who/which, 8 mixed), Gemini vectors cached
once. App request shapes from `api/lib/search/qdrant-layers.js` + `multiIndexSearch` (search.js:1289-1420), one knob at a time,
conc 1 unless noted. Times are the server `time` field (ms). Recall = top-30 overlap with a high-recall reference
(oversampling 4, hnsw_ef 512, rescore) or with exact search where stated. Bench: `scripts/search/qdrant-knobs.mjs`.
No collection config was changed.

## Where the time goes (summary)

1. **Cold vectors/payload on disk.** Warm vs cold differ by 2-4x for phrases and concepts. Rescoring and payload reads hit
   pages that the 125 G cgroup keeps evicting (cgroup at 115/125 G, 67 G of it file cache).
2. **Payload reads.** 2-3 ms of each dense search is reading the payload blob (on disk), even for one field.
3. **Fan-out contention.** The engine fires 5-7 Qdrant calls at once; at 3 engine calls in flight each one gets 4-6 ms slower
   while the box is idle (load ~6/80). Not diagnosed.
4. **paragraphs_kw is BM25 over stopwords.** No stopword list: "the/of/and" walk posting lists of millions. That is the
   whole 15-17 ms; filter and payload are noise.
5. ef above need: default ef (= ef_construct 100) costs 1-1.5 ms more than ef 64 for no measurable recall.

## Per collection

Environment: Qdrant 1.19.1, `qdrant-main` :6343 (/faster MP44 NVMe, MemoryMax 125G, MemoryLow 60G, Nice 5,
MAX_SEARCH_THREADS 0, MAX_OPTIMIZATION_THREADS 8); `qdrant-hot` :6335 on tmpfs /srv/qram (44G, 13G used). Tower 188 GiB,
MemAvailable 86-90 GiB, ARC 16.9 GiB (c_max 56), no swap, no AVX-512. All collections green; every filter field the app uses
(scope, doc_id, author_fold, religion) has a payload index, so no filter does a full scan.

### paragraphs_kw (BM25 sparse, `using: bm25`, limit 60, scope filter, payload paragraph_id/doc_id/rank fields)
- 11.16 M points, 8 segments (7 of 1.06-2.3 M + one of 61 k); 11.93 M indexed vectors, so ~770 k deleted entries (~7 %)
  still in postings. Sparse index ImmutableRam, vectors mmap 2.5 GB, payload on disk 2.95 GB, 16 GB on disk total.
- Telemetry per segment: filtered sparse avg 13-19 ms, unfiltered 3.5-4.8 ms.
- Measured: cold 18.5/24.1, warm 16.6/21.9. No filter 16.2 (filter is free, but needed: overlap 0.598 without it).
  No payload 15.0. limit 10: 15.8.
- **Stopwords are the cost.** Query without stopwords: 7.9/14.5 (per query 14-23 ms → 3.6-13.7 ms) but overlap 0.653.
- Two-stage (prefetch without stopwords, rescore with the full query):

  | prefetch | p50/p95 ms | overlap @30 | overlap @10 |
  |---|---|---|---|
  | 100 | 8.7/12.0 | 0.919 | 0.943 |
  | 300 | 10.7/16.5 | 0.974 | 0.990 |
  | 1000 | 18.4 | 0.997 | — |

### phrases (alias → phrases_f16; dense, binary quantization always_ram, rescore, os 1, limit 60, payload 7 fields)
- 36.3 M points, 26 segments (25 × ~1.5 M). Vectors float16 on disk (223 GB), HNSW m16 / ef_construct 100 in RAM,
  payload on disk 11.6 GB. Per segment: vectors 9.2 G, payload storage 484 M, payload index 611 M, HNSW 285 M.
  default_segment_number 24, max_segment_size 10 M.
- Measured: cold 15/34.1, warm 8.7/11.2 (overlap 0.990). Cold without rescore 14.3, so cold cost is payload + pages,
  not only the rescore.
- ef 64: 7.3/8.1 (0.983). ef 32: 6.1/11.1 (0.961).
- No payload 5.5/6.1; paragraph_id only 8.4. So ~3 ms is the payload blob read, whatever fields are asked.
- No filter is slower (12.7); the scope filter prunes.
- Filtered: doctrinal shape (author_fold any 4, writerOnly, primary) 7.2 → 5.6 with ef 64, overlap 0.982 both;
  Bahá'í scope limit 60 9.6 → 7.9 (0.994 → 0.990). Canon (`doc_id any` 691 ids, stand-in for the OL list) 8.5 cold / 7.1 warm.

### phrases_hot (qdrant-hot, tmpfs)
- 1.72 M points, 8 segments, float16. Cold ≈ warm (4.6 vs 4.5): the RAM disk removes the cold penalty entirely.
- ef 64: 3.6/4.3 (0.990). No payload 2.7.

### concepts (dense float32, on_disk false = InRamMmap, binary always_ram, rescore, os 4)
- 104 k points, 2 segments (one empty). Telemetry filtered_large avg 17.7 ms.
- Cold app shape 7.3/45.8; cold rescore after a no-rescore pass 28.8/60 — the "in RAM" mmap pages had been evicted.
- Warm app shape 4.8/6.0, overlap 0.999 vs reference, 0.997 vs exact. os 2: 3.4/4.1 (0.993; vs exact 0.991).
  os 1: 3.1 (0.960). No filter 4.0. No payload 3.5. Exact 176 ms.

### hype (dense float32 on disk, binary always_ram, rescore, os 1, payload + k)
- 2.31 M points, 10 segments (one plain of 111 points); some segments carry 34-56 k deleted entries. Vectors 28 GB, payload 0.8 GB.
- Cold 5.4/8.4; cold rescore p95 17.7. Warm 4.8/5.7 (0.996). ef 64: 3.8/5.0 (0.998). ef 32: 3.1 (0.986).
- No payload 3.0 (payload ~1.8 ms; paragraph_id alone costs nearly as much).
- Doctrinal 3.8 → 3.4 with ef 64 (0.984 → 0.982); Bahá'í scope 5.0 → 4.8 (0.996 both).

### Fan-out (the 5 layers fired together per query, warm), p50 ms

| collection | conc 1 | conc 3 | conc 3, ef 64 |
|---|---|---|---|
| phrases | 9.3 | 15.1 | 13.3 |
| phrases_hot | 5.5 | 8.3 | 6.7 |
| hype | 5.9 | 11.6 | 8.4 |
| concepts | 7.1 | 9.9 | 9.3 |
| paragraphs_kw | 16.7 | 17.9 | 18.7 |

Without payload at conc 3, phrases is still 11.4. Contention adds 4-6 ms with the CPU idle — candidates: search thread pool
sizing (MAX_SEARCH_THREADS 0 = auto), NUMA (2 sockets), io_uring/mmap read queueing under Nice 5. Not diagnosed.

## Proposals, ranked by benefit per cost

| # | change | measured effect | cost | recall risk | status |
|---|---|---|---|---|---|
| 1 | hnsw_ef 64 on phrase + hype; concept oversampling 4 → 2 (request params only) | phrases −1.4 ms p50 / −3 p95, hype −1.0, concepts −1.4; conc 3: phrases −1.8, hype −3.2 | none | overlap within noise (phrases 0.990 → 0.983, hype 0.998, concepts vs exact 0.991, filtered shapes unchanged) | **done, commit 938b3992, not pushed** |
| 2 | move concepts + hype to qdrant-hot (tmpfs); hype as float16 | removes cold spikes (concepts p95 46-60 → ~6; hype cold p95 17.7 → ~warm); phrases_hot shows cold ≈ warm | ~15 GB (hype f16) + 1.4 GB (concepts) of the ~31 GB free on /srv/qram; rebuild hype ~15 min, concepts minutes; writers must target the hot URL | f16 vs f32: negligible (phrases already f16) — re-measure | needs Chad (RAM, config) |
| 3 | `on_disk_payload: false` for hype (0.8 GB) and paragraphs_kw (3 GB) | hype −1.8 ms, kw −1.6 ms (= no-payload measurements) | 3.8 GB anon RAM in qdrant-main (budget 30 GiB anon; cgroup already 115/125 G — raise MemoryMax or it evicts vectors) | none | needs Chad |
| 3b | phrases: `with_payload: false`, derive paragraph_id from point id (id = paragraph_id × 1000 + k), fetch payload only for the kept top-N | up to −3 ms p50 per phrases call (no-payload 5.5 vs 8.7) | app code; one extra small retrieve; scope/doc_id/author still come from filters | none if the retrieve is right | not measured end to end |
| 4 | paragraphs_kw two-stage: prefetch 100-300 without stopwords, rescore with the full query | 16.6 → 8.7 (pf 100) / 10.7 (pf 300) | app code + a stopword list in keyword-tokens.js; no rebuild | overlap@10 0.943 (pf 100) / 0.990 (pf 300) | needs a battery run + Chad |
| 5 | vacuum paragraphs_kw (~7 % deleted entries) and hype (34-56 k deleted per segment) | small; postings shorter by ~7 % | optimizer CPU on tower (in a quiet window) | none | not measured |
| 6 | find the fan-out contention (search threads, NUMA pinning, io priority) | worth 4-6 ms on every layer at conc 3 | investigation | none | not diagnosed |
| 7 | phrases cold rescore long term: 2-bit binary quantization or 1536-d Matryoshka vectors | would let rescore read less / stay in RAM | rebuild ~3.5 h per variant; quality change | real; needs a battery | needs Chad |
| 8 | more, smaller kw segments | unknown — per-segment time is not proportional to size | rebuild hours | none | not measured |

Expected after 1 + 2 + 3 + 3b at conc 3 (estimate from the parts, not measured together): phrases ~10, hype ~5,
concepts ~6, phrases_hot ~7. paragraphs_kw stays ~17 until #4; nothing short of a query change gets it under 10 ms.

## Not verified
- Cause of the fan-out contention (#6).
- Whether payload reads bypass the page cache (io_uring) — would explain why warm payload still costs 2-3 ms.
- Effect of splitting kw segments (#8) and of vacuuming (#5).
- Real OL canon id count — 691 doc ids is a stand-in.
- Answer-quality impact of any stopword change (#4); overlap is not quality.
- Cold-only numbers per variant (ef 64 / os 2 were measured warm; cold behaviour is dominated by pages, not ef).
- #1 has not been run through search-bench after deploy; re-run `search-bench.mjs --mode plan --conc 3 --rounds 6` once pushed.
