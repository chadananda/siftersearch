# AI calls review — quality up, price down (2026-10-10)

Chad 10-10: "assess all available AI calls to improve quality and reduce price … Haiku 5.5 just came out … or install
Strata on Boss". Prices checked 10-10 against the vendors' own pages; they move monthly — re-check before acting.

## What we spend (last 30 days, ledger + sources that were outside it until today)

| Caller | Model | Calls | Avg in / out tokens | $ / 30 d | Note |
|---|---|---:|---|---:|---|
| Clef shadows + page-role | Workers AI clef / clef-flash | ~440k | ~10k (window run) | **~554** (CF, since 09-11) | 10-08/09 window run; now sampled 2%, Jev first |
| phrase index build | gemini-embedding-2 | — | 682M tokens | **322.55** | in the ledger since today (backfilled) |
| segmenter | **gpt-4o** | 24,512 | 1,085 / 261 | **130.53** | Arabic/Persian paragraph boundaries |
| Jev | jev-latest | ~250k | ~5k | ~67 (since 10-03) | window run was $63 of it |
| corpus-rag (grounding) | deepseek-v4-flash | 203,699 | 7,118 / 104 | 43.24 | |
| authorship-window | deepseek-v4-flash | 52,242 | 2,387 / 171 | 32.42 | the 10-08 window run |
| embeddings (several) | text-embedding-3-large | ~27k | — | ~23 | legacy 512-d index; goes with Meili |
| verify-encounters, extract-scenes, authorship-brief, bio, catalog | deepseek-v4-flash | ~51k | | ~19 | |
| search:summarize / synthesis | groq llama-3.3-70b | 5,345 | 630 / 186 | 2.60 | model now enterprise-only at Groq |
| assessment audits | claude-sonnet-4-6 | 54 | | 1.30 | audits.db, not yet in ai_usage |
| Anís replies | gemini-3.5-flash-lite | few | 3,556 / 464 | ~0 | |

Also unpriced/unlogged: ElevenLabs (Narrator), deep-research.

## Current prices that matter (per 1M tokens)

| Model | Input | Output | Batch | Note |
|---|---:|---:|---|---|
| **Claude Haiku 5.5** (`claude-haiku-5-5`, 10-07) | $0.10 | $0.50 | $0.05 / $0.25 | ≤100k prompt; new tokenizer ≈1.3× more tokens; effort low…max (default medium — set **low** for checks); cache read $0.01 |
| DeepSeek V4 Flash | $0.30 peak / $0.15 off | $1.20 / $0.60 | — | peak = 01–04 + 06–10 UTC Mon–Fri only; cache hit $0.006 |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | $0.15 / $1.25 | Anís's reply model |
| GPT-4o | $2.50 | $10.00 | | the segmenter |
| Gemini Embedding 2 | $0.20 | — | **$0.10** | batch = 50% off, 24 h turnaround |
| Jev | $0.042 | free | | System-1 |
| Clef / Clef-flash | $0.24 / $0.038 | — | | System-1, Workers AI |
| Strata + Qwen3.8-Flash-Next on boss | $0 | $0 | | local; being built — see below |

## Candidates (each needs a measured A/B on our own data before switching)

1. **Segmenter: GPT-4o → Haiku 5.5 (low effort) or Strata.** Same 24.5k calls ≈ **$8/month on Haiku** (vs $130), $0 on
   Strata. Test: 200 segmentation requests, boundary agreement with GPT-4o + a judged sample.
2. **Phrase vectors: Gemini Embedding 2 online → Batch API** for any non-urgent build: **half price** (the October build
   would have been ~$160 instead of $322). Online stays for incremental/nightly.
3. **System-1 escalation tier:** Jev/Laya answer; below the job's confidence threshold → **Haiku 5.5** (batch for
   offline jobs, $0.05/M) or **Strata** (free) re-decides; disagreements go to session review. The escalated answers
   become labelled examples for Laya.
4. **DeepSeek bulk work (corpus-rag, extraction):** Haiku 5.5 is cheaper per token than DeepSeek peak and comparable
   off-peak; test quality on a grounding sample. Meanwhile the pipeline now runs in DeepSeek's real off-peak hours
   (was idling 16 h/day on a retired schedule — fixed 10-10).
5. **Anís replies: Flash-Lite → Haiku 5.5** is cheaper ($0.10/$0.50 vs $0.30/$2.50) — test reply quality + latency on
   the audit battery.
6. **Groq Llama summaries → Haiku 5.5 or Strata** (Groq moved the model to enterprise-only).
7. **Audits: Sonnet 4.6 → Sonnet 5 or Haiku 5.5** — judge quality matters most here; test on audited exchanges.

## Strata on boss (in progress, 10-10)

Strata (github.com/Niko1221/Strata, MIT, ~20k stars) runs Qwen3.8-Flash-Next (125B MoE) locally with OpenAI- and
Anthropic-compatible APIs. Strix Halo support is **experimental** (Linux, build from source with ROCm 7.14.1 for gfx1151).
Reports from the same hardware: maintainers 53.8 tok/s output, 1,293 tok/s prompt (UD-IQ4_XS, fast config); a laptop
59 tok/s; an independent desktop with boss's exact memory split (96 GiB carve-out + 31 GB OS) 39–41 tok/s single, 30 each
at 2 parallel, no crashes. Known traps: ROCm 7.14.1 can fail host→device copies on some kernels (run
`~/ai395/hip_memcpy_check.c` first); throughput drops ~4.5× when another model shares the GPU. Plan: build → memcpy check →
IQ3_S model (54.8 GB) → first launch watched (no autostart) → bake-off on items 1, 3, 6 above.
