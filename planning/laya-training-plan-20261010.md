# Laya training plan (2026-10-10)

Chad 10-10, after the Clef bill: "use Jev first … or get serious about training Laya". Laya is the way off paid
System-1: a local model on boss, ~40 ms a decision, $0 a call. Today it is **running but untrained** — nothing routes to
it (`routing.json` has no `laya_model`), and it has never been fine-tuned.

## What we have

**Laya:** `convaiinnovations/laya-multilingual` (mmBERT-base, 322M parameters, **1,024-token input limit**, 100+
languages). Served on boss by `~/laya-svc/server.py` (Jev-compatible `{state, questions}`). The `laya` package (0.3.23)
can calibrate confidence (`fit_temperatures`) but has **no fine-tuning API**; we write the training loop (PyTorch).
Boss's torch is the CPU build.

**Training data** — every Jev call is logged in `/tank/sifter/systemone/calls.db` with its state, questions and full
answer distribution (soft targets for distillation). Gold labels: **none yet**.

| Task | Jev-labelled calls | Avg tokens | Fits Laya (≤1,024)? |
|---|---:|---:|---|
| paragraph-speaker-window | 150,243 | 9,799 | **no** — must be redesigned to short states |
| paragraph-attribution | 64,478 | 776 | yes (exported 10-03: `/tank/sifter/systemone/laya-export/`) |
| identity-audit | 8,328 | 707 | yes |
| search-plan | 5,270 | 1,299 | mostly — trim the state |
| source-resolve | 4,925 | 4,254 | no — trim |
| sourcehunt-holds | 4,206 | 3,936 | no — trim |
| sourcehunt-span | 2,991 | 2,306 | partly |
| talk-speaker | 2,688 | 580 | yes |
| page-role | 76,331 (Clef-served, 97.8% vs Jev) | short | yes (Clef labels) |
| anis-triage / persona-check / format | 96 | 600–1,050 | yes, but too few yet |

## The rule for every System-1 task from now on

**Short states.** A decision's state is the item plus the minimum context — a few hundred tokens, never a whole window.
That is what makes Jev cheap now and Laya possible later (it cannot read past 1,024 tokens).

## Steps

1. **Training loop (no cost).** Read how `laya.agent` scores `(state, question, options)` and write a fine-tune script
   (`scripts/laya/finetune.py`): KL loss against Jev's distribution, per task, 10% held out by call-id hash (as
   `export-laya.py` already does). Then `fit_temperatures` on the held-out set.
2. **Pilot on `paragraph-attribution`** (64k labels, already exported, fits). Train on boss.
3. **Evaluate before any switch:** agreement with Jev on the held-out 10%, plus a **gold set** — 200 disagreements
   judged in session from the passages (free). Switch rule (Chad 10-01): Laya dependably as good as Jev on two eval windows
   → Laya primary with Jev fallback below the task's `min_conf`.
4. **Then, in order of volume × fit:** identity-audit, talk-speaker, page-role, search-plan (trimmed), Anís triage/format
   as they accumulate. Redesign paragraph-speaker-window, source-resolve and sourcehunt-holds to short states first.
5. **Keep it running:** monthly re-export → re-train → re-evaluate per task; the routing battery decides.

## Progress

**10-10 night: step 1 done.** `scripts/laya/finetune.py` distils Jev's answer distribution into Laya. It uses laya's
own `_encode_state` + `collate_items(target=…)`, so training sees exactly what inference sees, and it saves a checkpoint
that `laya.load(<dir>)` reads.
- Smoke run on tower CPU (8 threads, nice 19): `paragraph-attribution` role task, 200 train records, 25 steps, 4.5 min.
  Agreement with Jev on 200 held-out went **7% → 93%** (KL 2.08 → 0.17).
- For comparison, always answering the majority class ("continues") scores 65.6%.
- The checkpoint reloaded and predicted fine (`/tank/sifter/laya-models/smoke`).
- venv: `/tank/sifter/laya-venv` (laya 0.3.23 on tower's torch 2.10).
- Full pilot cost on tower CPU: ~10 s per batch-8 step at 8 threads → one epoch of the 38.7k role set ≈ 13 h. That is
  the GPU-or-CPU decision below.

## Decisions for Chad

- **Train on boss's GPU?** Fine-tuning needs a ROCm build of torch on boss and ~6–10 GB of GPU memory for a few hours per
  task. Boss went offline once under a 20 GB service (feedback_boss_llm_hangs_host); training would be run in the
  foreground, capped, and stopped on any sign of trouble. Alternative: tower's CPU (80 cores) — slower (~10 h per epoch
  for the pilot) and competes with production.
- **Gold labels:** session-judged only (free), or a budgeted frontier-model labelling round for the hardest tasks
  (quoted before running)?
