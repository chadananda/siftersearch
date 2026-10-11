# Strata on Boss: watched first launch (not done unattended)

**State (10-10 21:20):**
- Strata is built on Boss: `~/strata`, gfx1151, ROCm 7.14.1.
- The Qwen3.8-Flash-Next GSQ-RCO **IQ3_S** model is at `~/strata-models/IQ3_S/`. Both parts passed SHA-256 against Hugging Face's LFS oids.
- Nothing has been launched yet.

## Why it waits for a watched launch
- Boss is shared with Chad's other projects (herdr sessions).
- On 10-03, starting a ~20 GB llama.cpp model there took the whole machine offline. It needed a power cycle
  (memory: feedback_boss_llm_hangs_host).
- Strata's README says the PC "can be slow or stop responding for 1-3 minutes" while the model loads.
- Strata's README sizes models by **system RAM**: 32 GB → the *Coder* model; "64 GB runs every size".
- Boss has **31 GB system RAM** (21 GB free) plus a **96 GB VRAM carve-out** (Strix Halo unified memory).
- IQ3_S (83.6 GB) is therefore above what the README recommends for Boss's RAM. Whether the 96 GB carve-out
  changes that is exactly what the first launch would test.

## Options (Chad's call)
1. **Try IQ3_S, guarded.** Run under `systemd-run --user --scope -p MemoryMax=12G -p MemorySwapMax=0`, with a watchdog
   that kills the scope if `MemAvailable` drops below 4 GB.
   - Have someone at hand who can power-cycle Boss.
   - Pause the other herdr sessions first.
2. **Use the Coder model** the README recommends for 32 GB RAM. It's a smaller download, but it's a different model, so
   the bake-off results would apply to that model only.
3. **Rebalance Boss's BIOS carve-out** (e.g. 64 GB VRAM / 64 GB RAM). This affects the other projects on Boss.

## Smoke test once it is up
- `curl localhost:8080/v1/models`.
- One chat call, recording tokens/s and time-to-first-token.
- Then the System-1 bake-off from `planning/ai-calls-review-20261010.md`: author identification and strategy choice,
  ~200 cases each, against Jev's answers.
