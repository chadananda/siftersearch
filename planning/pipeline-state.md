# Pipeline State (typed media pipeline rollout, Chad 10-31)
last_tick: 2026-11-01T01:05Z
tick_number: 14
status: IN_PROGRESS
gate: 1 PASSED (verified by me tick 1); phase 2+3 underway
tick1: |
  Published typed talks, verify ran and quiet ran: 1994, 1990, 1997, 1989 (source: items/:id on tower).
  Quiet runs only when the remaster is pure (item.js:586).
  Duplicates eliminated: 1996, 1998, 1995. 1672 still running. 1947 retrying (speech-gap fix e05dd54d).
  pull_errors: 27 total; the latest are cpu-prep "grade did not finish" (2657–2663).
  RunPod account: 0 pods.
  Pause lifted 19:45Z. The ramp code (media-jobs ~1975) runs 1 pod until podsProven, then +1 while every pod is busy.
  pod_plan: supportable 6, binding finish, staged 105 talks / 133 h, r_prep 121, r_finish 97, r_pod 15.3.
tick2 (20:15Z): |
  Verified: 1672 published, verify and quiet ran. Gate-1 talks: 1994, 1990, 1997, 1989, 1672.
  Only 1 typed adoption in 35 min. Pod 382 ($0.50/h): 100% GPU (RunPod API), 5 edge leases, up 16 min. pull_errors new 0.
  pods_wanted 7, proof ok ("5 pure remasters adopted from pod gpu steps").
  Measured finish (lan-queue capacity): boss 21.1 + tower 9.9 audio-h/h. Aorus types=[gpu] only.
  So real finish ≈ 31 audio-h/h → about 2 pods, not 6–7. Agent told to fix r_finish and ramp on the published rate.
tick3 (20:45Z): |
  Verified good (verdict usable, verify and quiet ran, published): 1519 (pod 382 → finish aorus), 2556 (aorus → tower).
  Running good total: 1994, 1990, 1997, 1989, 1672, 1519, 2556 = 7.
  BREACH: 485 published 20:16Z, verdict review, verify skipped "not remastered", quiet skipped (gpu pod 382, finish boss).
    Agent told: unpublish/hold, fix the publish gate, audit all typed-era publishes, add a test.
  pull_errors: 2 new "chain record lost" (cpu-finish-2488, -2489).
  Pods: 382 $0.50/h at 100% GPU (46 min up); 386 $0.89/h booting (0%, 4 min).
  Plan: r_pod 7.7, r_finish 55, supportable 7. Actual: 3 finishes in 32 min.
  items/:id endpoint takes 60–150 s.
tick4 (20:50Z tower clock): |
  Verified good: 2079 (pod 382 → tower, published 20:45:15Z) and 2557 (aorus → tower, published 20:45:33Z).
    Both have verdict usable, verify and quiet ran.
  Running good total: 9 (1994, 1990, 1997, 1989, 1672, 1519, 2556, 2079, 2557).
  1999: pure remaster (verify and quiet ran), but render blocked by a p0 speech-gap at 2954–2969 s. The gate is correct; sent to the agent.
  485 STILL on air: published 20:16Z, verdict review, verify and quiet skipped. Escalated to the agent: hold it, fix the gate, audit, add a test.
  RunPod: only 387 ($0.89/h, booting). 382 and 386 are gone, but q_last still shows leases on them (8 and 5). Agent told to requeue them.
  pull_errors: 4 new, all speaker-exclusion prep refusals (expected).
  Plan: wanted 3, supportable 3, r_finish 26, r_pod 6.
tick5 (21:14Z): |
  Verified: 485 is off air (published_at null). Agent fixes deployed: e7642395 (published = on air) and cb0f6ce6 (silent holes don't block).
    Agent audit (unverified): 22 talks published on 10-31 with skipped checks had published_at set; it's now cleared. None had restored = 1.
  Verified published pure: 1999 (21:14Z), 1657 (pod 386 → boss), 2560 and 2563 (aorus → tower). Good total: 13.
  Published 20:14–21:14Z: 6 (2079, 2557, 1657, 2560, 2563, 1999). That's 6 talks/h.
  2558: render blocked by a speech gap at 15–30 s; I queued a render redo, run 61599.
  Pod 387: 100% GPU, up 24 min, $0.89/h, 7 leases. Plan: binding prep, r_prep = r_finish = 22.6, r_pod 6.0, target 3.
  Agent resumed for phase 2 (efficiency) and phase 3 (ramp).
tick6 (21:18Z, 4 min after tick 5): |
  No new typed done (still 19). pull_errors 33; none new since 20:44Z.
  Pod 387 at 99% GPU, 6 leases; keep it. Agent is on phases 2/3; no new commits yet.
tick7 (21:48Z): |
  Verified published pure (items/:id): 2561 (aorus → boss), 2167, 2145, 2146 (pod 387), 2562 (aorus → tower). 5 in 30 min, about 10/h. Good total: 18.
  Not published: 1728 (verdict light, not remastered); 2130 and 2558 (render blocked by speech gaps not silent in the copy). Sent to the agent.
  Pods: 387 (23% at that moment, 10 leases, 58 min up) and 388 (100%, 10 min up), both $0.89/h. Plan target 2, binding prep, r_pod 8.5.
  Agent commits: fec8d9ea (ramp on talks/h, rent by $/audio-h), 94a5cc20 (non-done talks carry no published_at), a6368de0 (video talks run on their audio track).
  pull_errors: 33, none new.
phase2/3 (agent report, ~22:05Z): |
  RATES, audio-h per hour, from step_log in data/run/cloud-remaster.json (rates.py), 1 h / 3 h:
    aorus prep 8.0 / 5.3 · aorus gpu 2.7 / 2.9 · aorus finish 1.6 / 0.9 · boss prep 5.4 / 3.0 · boss finish 7.0 / 3.2
    tower finish 6.0 / 6.1 · pod gpu 17.9 / 8.5 (2 pods in the last hour).
    Done: 12 talks / 15.2 audio-h in 1 h; 32 talks / 12.6 audio-h/h over 3 h (lane endpoint agrees: remastered_1h 12, audio_h_1h 15.2).
  BINDING is GPU, not prep: R2 holds 127 talks / 133.5 audio-h staged ahead of the GPU (pod_plan staged_h); prep runs ahead.
    The plan's "binding prep" label compares prep to a 2 h horizon only.
  AORUS GPU 2.7–3.3 audio-h/h: image t4 (e05dd54d) retried every speech hole in a NEW media_tool process (torch + Whisper + VAD + align
    load each time, 3–22 s per clip; up to 176 holes per talk). q-gpu-2555 (26 min of audio) sat 2 h+ in transcribe.
    Fix e46d3b4d: every hole window in ONE media_tool call (--windows). Ships with image t6. Before 2.7–3.3; after: measure.
  POD $/audio-h (pod-hours from pods, audio from step_log): 387 $0.118, 382 $0.103 ($0.50/h), 386 $0.298. Last hour, 2 × $0.89/h for
    17.9 audio-h = $0.099/audio-h. Pods also pay the per-hole retry cost until t6 is promoted (pods run the accepted image).
  POD 387 at 23% (21:48Z): not starvation. Gauges: starved 0 over 187 samples; dips to 21–27% at 21:50Z for about 1 min; 89–96% since
    21:53Z; 127 talks staged in R2. The dips are CPU phases inside a job (the per-hole retries among them).
  STAGING: 87 talks, 11.49 GB, 132 MB mean per talk (Opus only).
  ITEMS ENDPOINT: not reproduced (0.23–0.41 s; max 240 ms in the logs).
  MIGRATION 193: applied (table-schema report run 61846: idx_media_source_ref).
  PUBLISHED_AT: 94a5cc20. The repo clears published_at on every state write that leaves done; the verify pass repairs past rows (clearOffAirPublished), with a test.
  PHASE 3 STEP: pod 2 (388) at 21:33Z: talks/h 6.5 → 9 (pods_growth ok); pods_output published_rate_h 7.77; spent $142.74.
    Backlog: lane queue 1257 talks → about 105 h at 12 talks/h. No pod 3 until t6 lands (the same pods do more work per hour).
  PROBLEMS:
    (c) 1728: a MEASURED REGRESSION (judge hold 21:31:55Z, bad_excerpt, rule v2-2026-10-31), not a chain bug: verify and quiet skip because it is held.
        It was missing from /admin/media-held because qualityOf indexed it 'light' (grade B, light tier). Fix 3a5646ad: a judged hold is 'review';
        the verify pass re-indexes a changed verdict. Tests added.
    (b) 2558: one 195 s hole (2616–2811 s) runs through a SUNG passage: 40 words in 54 s, 0.74 words/s, lyric text ("…march in unison
        rank on rank… as the battalions of the Concourse"). The window retry recovered a few words and left 7 holes that were never retried.
        Fix eac9eaf4: retries run in ROUNDS; what a window leaves is retried in its own window, and nothing there = non-speech. Ships with t6.
    (a) 2130: REAL SPEECH LOST. The words jump mid-sentence from 899.2 s ("…cut the good from the bad,") to 920.1 s ("So the world follows…"),
        audience voice S1. Whole-file ASR (large-v3-turbo, tower, single mode) skipped it. The round retry re-transcribes it in a 25 s window (t6).
tick8 (22:18Z, checked by me): |
  Published pure (items/:id): 1714, 1498, 1767, 1761, 1515, 1511. 6 in 30 min, about 12/h. Good total: 24. 1601 is at assess.
  Pods 387 (100%) and 388 (98%), both $0.89/h. Plan: r_pod 10.1, staged 121.7 h, target 2.
  WASTE: 1504 was excluded (newer-generation UHJ) AFTER its GPU step; 2181 and 2172 resolved as duplicates AFTER their GPU step. Sent to the agent: gate them before feed.
  2130 now fails at transcribe: ffmpeg "No such file" (possible regression). 2161: new speech gap. 2555 and 1728 are held as 'review' (measured regression).
  Agent's numbers above are unverified by me, except that I confirmed 387 is now at about 100%.
tick9 (22:48Z, checked by me): |
  Published pure (items/:id), 22:18–22:48Z: 1615 2138 1787 1768 2109 1770 1712 1722 2127 1633 1713 1911 2564 1601 2558 = 15, about 30/h. Good total: 39.
  Gate fix 13022f0d is live (2558 published). 2161 is done but published_at null.
  Pods: 388 at 100%; 389 booting; 387 gone (cause unknown, asked the agent). Plan: wanted 3, binding finish, r_pod 16.9, r_finish 58.5, staged 114.7 h.
  pull_errors 35 (+2): gpu-1972 "missing diarization.json"; cpu-prep-1947 "chain record lost". 2130 still hits ffmpeg "No such file" (retry 2).
tick10 (23:18Z, checked by me): |
  Published pure, 22:48–23:18Z: 2439, 2567, 1934, 1906, 2161 = 5 (down from 15). Good total: 44.
  CAUSE: pods 387 and 388 closed by tower as "unreachable: ssh … Connection refused"; 388 was at 100% GPU at 22:48Z. Only 389 is live (100%) while wanted is 3, and nothing is renting.
    Sent to the agent as URGENT (media-jobs.js:2262 agent-beat guard did not save them).
  2188 is a duplicate but has published_at; 2073 is review (held); 2130 still hits ffmpeg "No such file".
  Agent commits: 57b31ab5 (plan counts Aorus CPU), 47843c99 (refeed cancels the old step).
  Chad decisions (23:1xZ): tower share NOT raised; CPU-strong pod for prep approved (agent building it after the urgent fix).
tick11 (23:49Z by tower clock, checked by me): |
  Published pure since tick 10 (items/:id: published_at, verdict usable, verify+quiet not skipped): 2083, 2205, 2570, 2568, 2274, 2440, 2443 = 7 in 31 min (~13.5/h). Last publish 23:40:55Z. Good total: 51.
  2566 dropped as a duplicate after the GPU step (wasted GPU; dup gate before feed still open). 2188's published_at is now cleared. 2187 running. 2130 still hits ffmpeg "No such file" (retry 2).
  Pods (RunPod, 5 samples 23:49–23:50Z): 389 85–96 %, 390 99–100 % (rented ~23:33Z, so the refill works: c3efd379). Live 2, plan target 3. KEEP both.
  My earlier report of "idle pods" (~23:45Z) caught 390 booting and a transient dip: they are busy now. I also mislabelled that time as 00:10Z.
  pull_errors: 35 total, 0 in the last 40 min. q_last fresh (119 s); leased 389 = 5, 390 = 8. media restarted ~23:45Z (agent pushes: 5 in 36 min, told to batch).
  Agent active: 4f61d5d1 (home/scale mode), a6b9efe6, 80bb77e3 (downmix first; parallel web encodes).
tick12 (00:20Z, checked by me): |
  Published pure since tick 11 (items/:id): 2447, 2453, 2444, 2448, 2445, 2446, 2455, 2449, 2468 = 9 in ~31 min (~17/h). Good total: 60.
  2187 is a duplicate (after its GPU step) but has published_at 23:57:17 (same bug as 2188). 2576 is a Dewey duplicate (after its GPU step). 2464 is in review (held, Chad).
  2639 and 2669 running; 2130 rescheduled through the typed chain.
  Pods (RunPod, 3 samples 00:18Z): 389 56 %, 390 100 %. Leased: 389 = 3, 390 = 11. KEEP.
  Plan: target 5 (binding finish, r_finish 64.8, r_pod 11.2, mode scale), but pods_growth holds at 2 (ref 22 vs 20.5); ramp_log suggests ref should be 6.5 after d7e5f347. Asked the agent.
  pull_errors: 35 total, 0 new.
  The ops service was draining during my first verify (empty replies); the agent's pushes (5 in 35 min) still drain media.
  Agent commits: f96bea8a (no FLAC/WAV in the cloud; Opus transit), 867b3108 and 12914383 (rejudge), d7e5f347 (ramp baseline), b9202fc9.
tick13 (00:48Z, checked by me): |
  Published pure since tick 12 (items/:id): 2669, 2639, 2466, 2467, 1698 = 5 in ~28 min. Good total: 65. 2187's published_at now null (the agent's off-air check: 0 rows left).
  INCIDENT: the cloud pass hung in phase 'lan' (SELF-HEAL at 00:40Z after 14 min); q_last was 2214 s stale at 00:48Z; only 3 typed done in 31 min.
    The lan-queue endpoint answers in 0.03 s. Media reloaded ~00:47Z for the agent's 3-commit batch (565bcbf5 CPU pod lane, 249fc76b dups before GPU, d272e483 prep pacing).
  Pods (RunPod 00:48Z): 389 100/100/0 %, 390 100 %. pods_growth ok (6.5 → 13.5), wanted 5, but no pod 3 rented while the pass is stuck.
  Waiting for a fresh pass (bg b6wbl6ev4). If none within 10 min, debug the 'lan' phase myself.
tick14 (01:03Z, checked by me): |
  CORRECTION to tick13: the 'lan' phase was NOT hung. It is SLOW. The pass that started ~00:49 finished ~01:03 after ~830 s (earlier passes took ~113 s).
    Proof: the open file advanced (fdinfo pos); 6 cpu-finish adoptions landed 20–35 s apart at the pass's end (1656, 2461, 2469, 2204, 2451, 2452).
  The 6 are adopted with verdict usable (1656 checked), now in the LLM stages (quotes/links/assess); not published yet. Good published total is still 65.
  Risk: SELF-HEAL abandons a pass older than 14 min, which now kills productive passes. While 'lan' runs, staging and pod rental wait (wanted 5, live 2).
  Coder agent a86a0043a9f101fc0 (bg): per-step timings in q_pass.sub, self-heal by progress not age, remove clearly wasted per-job work; one push; report the first pass's timings.
  No ptrace on tower (strace refused).
phase2/3 agent report (01:05Z, answers tick 12): |
  PUSHED 00:45Z as one batch (deploy-check: deployed d272e483): 565bcbf5 (CPU pod lane), 249fc76b (dup gate before feed + published_at), d272e483 (no prep feed while gpu buffer full).
  DUP GATE (249fc76b): feedTyped checks each NEW talk before cpu-prep: a recorded dedup verdict or a same-sha twin ahead of it → duplicate; the same duration
    (±0.05 s) in the same source folder → review (2576 = 2557 bahai-law: same folder, 2782.368 s both); the same duration elsewhere → fed last.
    Limit: a content twin of a different length (2187 vs 1558 hutchinson, 4234 vs 5673 s) needs a transcript and is still found after the GPU step. 2187 also has a same-sha twin #3735, which the gate now catches.
  PUBLISHED_AT: cause = markDuplicateItems (group re-pick), excludeItems and unreviveItem set the state without clearing published_at; the repair ran only once per process. All three now clear it (test).
    POST /ops/media/off-air-published (ops.mjs media off-air-published) at 00:48Z: cleared 0, i.e. no row now has published_at with state ≠ done. 2187, 2188, 2566, 2576: published_at null (items/:id).
    How many rows the 00:26Z restart's repair cleared (2187 among them) is not logged: unknown.
  STALE PLAN: q_pass sat in 'lan' from 00:26:56Z because feedTyped kept feeding prep (one stage dir every ~2.5 min while an archive rsync loaded /tank) with 168 h already staged vs 112 h wanted.
    d272e483: no feed while the gpu buffer is full and prep has work queued. First pass after the reload: 865 s (00:48:40–01:03:05Z), fed 0 ("gpu buffer full (168 h staged, want 112 h); 60 h of prep queued"), pulled 8 typed steps.
    Health 01:04Z: every section ok, stager ok.
  POD 3: sifter-unipase-391 rented 01:02:35Z ($0.89/h, ready, 0 leases at 01:04Z). pods_growth ok (talks/h 14.5 → 15). ramp_log pods=3 ref 14.5.
    Pod 4 needs 391 busy AND earned (a pure remaster from its gpu step) AND talks/h above 14.5. NOTE: 14.5 was measured in the post-drain dip, so it is a low bar; to hold at 3, use a decision, not a cap I add.
    Plan 01:03Z: mode scale, target 6, binding finish, r_pod 10.6, r_finish 66.1, staged 156.5 h / 162 talks, prep queued 60.4 h. Pods 389 (gpu 90 %, 8 leases), 390 (99 %, 6). Spent $147.30, $0.13/audio-h.
  AORUS CPU MODE (agent-lan.log, 00:06:46–~00:33Z): cpu-prep 27 talks / 38.26 audio-h = 84.9 audio-h/h, 142 s per talk, 4 containers at ~100 % CPU, RAM 2/15 GB. cpu-finish 2 talks (no backlog).
    Plan's prep_each: aorus 99.4, boss 64.5 audio-h/h. Prep is NOT binding (gpu buffer full), so the CPU trial pod (565bcbf5, ops.mjs media cpu-pod) is not rented: no work for it now.
    Unverified: the RunPod CPU API field names and that the CUDA image starts on a CPU instance (first rental will show).
  2130: state scheduled, stage whole, not in a chain (01:04Z).
next_tick_check: |
  Agent a86a0043 result: sub timings → where do the ~10 min go? Is pod 3 rented once the plan phase runs on time? Are 1656/2461/2469/2204/2451/2452 published?
  Did the pass recover? Is pod 3 rented? Does the 'lan' hang recur?
  Is pod 3 rented? Dup gate before feed? 2187 published_at cleared? 2130?
  Is the 3rd pod live? talks/h ≥ 20? Is a batch-push cadence holding? Aorus CPU-only rates, mp4 audio-only, finish-FLAC never to R2.
  Are healthy pods kept and the pool refilled to wanted? Is talks/h back to 30+?
  Is 389 busy, and does talks/h rise above 30 with 3 pods? Why did 387 go? 2130, 2161.
  Do exclusions/duplicates still reach the GPU? 2130 ffmpeg error? Has t6 (one-call hole retries) been promoted, and does r_pod rise? Then pod 3 if talks/h rises.
  Grade-did-not-finish prep errors are being fixed.
current_task: rollout agent a1d7c8efb822f2017 runs the 3-phase mandate (debug → efficiency → scale)
current_task_detail: |
  Known breaks:
  - cpu-finish refused "missing enhanced/pod/post.json"
  - adoption: verify skipped "not remastered", quiet skipped
  - speech gaps (1947)
  - prep "grade did not finish" / ffmpeg in.mp4
  Rentals paused via POST /ops/media/rentals.
  Pods 379, 380, 381 terminated via the RunPod API at 18:50Z; the account showed 0 pods.
  Pause bug: a pause never retires live pods (poolCap>0). Agent told to fix it.
gates:
  1: 3 typed talks published, verify ran, quiet ran, swapped 0, no p0 text problems → I verify each via items/:id → then I lift the pause
  2: before/after audio-h/h per GPU and per finish host, staging rate
  3: 1 pod, then +1 at a time while published output rises; report talks/h, $/audio-h, GPU %, ETA
verify_how: |
  ssh tower-nas; K = DEPLOY_SECRET from ~/sifter/siftersearch/.env-secrets.
  Check a talk: curl -H "X-Internal-Key: $K" 127.0.0.1:7839/api/admin/ops/media/items/<id>
  Lift the pause: POST /api/admin/ops/media/rentals {"pause":false}
  Lane state: data/run/cloud-remaster.json (done[] mode=typed, pull_errors, q_lan, pod_plan, pods)
  Pods on the account: RunPod GraphQL myself{pods} with RUNPOD_API_KEY from .env-secrets
completed_this_session: pods stopped; rentals paused; first typed adoption (1947) checked and NOT a success
next_priority: verify gate 1 when the agent reports; keep the agent moving; never relay unverified claims
project_dir: /Users/chad/Dropbox/Public/JS/Projects/siftersearch.com
