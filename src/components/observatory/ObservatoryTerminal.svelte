<script>
  // The terminal (Chad 10-16: "a computer terminal looking window with the logging of our activity constantly scrolling
  // up … the console should always be typing"). Every line is real: the machinery's activity log (jobs, indexer progress,
  // writer pulse, vector growth, ledger, findability probes, Anís turns — content-free). It TYPES continuously: the queue
  // is typed at a speed that drains it about when the next lines arrive; if it ever runs dry it types a status line from
  // the live telemetry (`status`, real numbers) — never invented events.
  import { onMount } from 'svelte';
  import { observatory } from '../../lib/api.js';
  import { lineTone } from '../../lib/observatory.js';

  let { status = [] } = $props();

  const MAX = 90;
  const HORIZON_MS = 14000;            // ≈ the pulse cadence: the queue should last until fresh lines arrive
  let shown = $state([]);
  let typing = $state({ id: null, n: 0 });
  let nowSec = $state(Date.now() / 1000);
  let queue = [];
  let lastId = 0;
  let box;
  let reduced = false;
  let statusIdx = 0;

  const clock = (sec) => new Date(sec * 1000).toISOString().slice(11, 19);
  const scroll = () => queueMicrotask(() => { if (box) box.scrollTop = box.scrollHeight; });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** ms per character so that everything queued is typed in about HORIZON_MS (never slower than readable). */
  function perChar(line) {
    const chars = queue.reduce((n, l) => n + l.text.length, line.text.length);
    return Math.max(5, Math.min(38, HORIZON_MS / Math.max(1, chars)));
  }

  function typeLine(line, msPerChar) {
    shown = [...shown.slice(-(MAX - 1)), line];
    scroll();
    if (reduced) return Promise.resolve();
    return new Promise((ok) => {
      const t0 = performance.now(), len = line.text.length;
      const step = (t) => {
        const n = Math.min(len, Math.floor((t - t0) / msPerChar));
        typing = { id: line.id, n };
        if (n < len) requestAnimationFrame(step); else { typing = { id: null, n: 0 }; ok(); }
      };
      requestAnimationFrame(step);
    });
  }

  async function poll() {
    try {
      const r = await observatory.activity(80);
      const fresh = (r.data.lines || []).filter((l) => l.id > lastId);
      if (fresh.length) { lastId = fresh[fresh.length - 1].id; queue.push(...fresh); }
    } catch { /* the next poll retries; the status lines keep the window honest meanwhile */ }
  }

  onMount(() => {
    reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let stop = false;
    const clockTick = setInterval(() => { nowSec = Date.now() / 1000; }, 1000);
    (async () => {
      const r = await observatory.activity(80).catch(() => null);
      const lines = r?.data?.lines || [];
      lastId = lines.length ? lines[lines.length - 1].id : 0;
      // the last few appear at once; the recent past before them is TYPED, paced to finish as new lines arrive
      const tail = lines.slice(-24);
      shown = tail.slice(0, 5); scroll();
      queue.push(...tail.slice(5));
      const polling = setInterval(poll, 5000);
      while (!stop) {
        if (queue.length) {
          const line = queue.shift();
          await typeLine(line, perChar(line));
          await sleep(queue.length ? 90 : 300);
        } else if (status.length) {
          // dry: type a live reading (real telemetry), then look for fresh lines again
          const text = status[statusIdx++ % status.length];
          await typeLine({ id: `s${Date.now()}`, at: Date.now() / 1000, kind: 'status', text }, 32);
          await sleep(1800);
        } else await sleep(500);
      }
      clearInterval(polling);
    })();
    return () => { stop = true; clearInterval(clockTick); };
  });
</script>

<div class="term" aria-label="Live activity log">
  <div class="bar">
    <span class="dots"><i></i><i></i><i></i></span>
    <span class="title">siftersearch@observatory: ~/activity — tail -f</span>
    <span class="live"><span class="led"></span>LIVE</span>
  </div>
  <div class="body" bind:this={box} role="log" aria-live="off">
    {#each shown as l (l.id)}
      <div class="line {lineTone(l)}"><span class="ts">{clock(l.at)}</span><span class="tag">{l.kind}</span><span class="txt">{#if typing.id === l.id}{l.text.slice(0, typing.n)}<span class="caret">▍</span>{:else}{l.text}{/if}</span></div>
    {/each}
    <div class="line prompt"><span class="ts">{clock(nowSec)}</span><span class="cursor">▍</span></div>
  </div>
  <div class="scan" aria-hidden="true"></div>
</div>

<style>
  /* smoked liquid glass: always dark (a terminal), translucent over the background, lit top edge */
  .term { position: relative; container-type: inline-size; border-radius: 18px; overflow: hidden; background: rgba(5, 9, 16, 0.74);
    backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.13); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 24px 60px -24px rgba(2, 6, 23, 0.8); color: #e2e8f0; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 9px 14px; background: linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.01));
    border-bottom: 1px solid rgba(148, 163, 184, 0.14); font: 500 11.5px/1 var(--obs-mono); color: #a9b8cf; }
  .dots { display: flex; gap: 6px; }
  .dots i { width: 10px; height: 10px; border-radius: 50%; }
  .dots i:nth-child(1) { background: #ef4444; } .dots i:nth-child(2) { background: #f59e0b; } .dots i:nth-child(3) { background: #22c55e; }
  .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .live { display: flex; align-items: center; gap: 6px; color: #4ade80; letter-spacing: 0.12em; }
  .led { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: blink 1.6s ease-in-out infinite; }
  .body { height: 300px; overflow-y: auto; overflow-x: hidden; padding: 10px 14px 12px; font: 400 12.5px/1.6 var(--obs-mono);
    scrollbar-width: thin; scrollbar-color: #334155 transparent;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 30px); mask-image: linear-gradient(to bottom, transparent 0, #000 30px); }
  .line { display: grid; grid-template-columns: 64px 74px minmax(0, 1fr); gap: 10px; animation: rise 0.25s ease-out; }
  /* readable everywhere (Chad: "no dark-gray text which is unreadable") */
  .ts { color: #9aabc4; }
  .tag { color: #b3c1d6; text-transform: uppercase; letter-spacing: 0.06em; font-size: 11px; }
  .txt { color: #e8eef7; overflow-wrap: anywhere; unicode-bidi: isolate; direction: ltr; }
  .job .tag, .job .txt { color: #fcd34d; }
  .warn .tag, .warn .txt { color: #fdba74; }
  .error .tag, .error .txt { color: #fca5a5; }
  .index .tag { color: #7dd3fc; } .index .txt { color: #e0f2fe; }
  .writer .tag { color: #5eead4; } .writer .txt { color: #ccfbf1; }
  .qdrant .tag { color: #f9a8d4; } .qdrant .txt { color: #fce7f3; }
  .ledger .tag { color: #c4b5fd; } .ledger .txt { color: #ddd6fe; }
  .telemetry .tag { color: #a5b4fc; } .telemetry .txt { color: #e0e7ff; }
  .status .tag { color: #93c5fd; } .status .txt { color: #dbeafe; }
  .hit1 .tag, .hit1 .txt { color: #86efac; }
  .hit .tag { color: #bbf7d0; } .hit .txt { color: #dcfce7; }
  .miss .tag { color: #fca5a5; } .miss .txt { color: #fecaca; }
  .anis .tag { color: #f5d0fe; } .anis .txt { color: #fae8ff; }
  .api .tag { color: #b3c1d6; } .api .txt { color: #d6deea; }
  .cursor { color: #4ade80; animation: blink 1s steps(2) infinite; }
  .caret { color: #4ade80; }
  /* a faint scanline drifting down the glass */
  .scan { position: absolute; left: 0; right: 0; top: 0; height: 60px; pointer-events: none;
    background: linear-gradient(to bottom, transparent, rgba(125, 211, 252, 0.06), transparent); animation: scan 6s linear infinite; }
  @keyframes rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @keyframes blink { 50% { opacity: 0.25; } }
  @keyframes scan { from { transform: translateY(-60px); } to { transform: translateY(360px); } }
  @container (max-width: 520px) { .line { grid-template-columns: 56px minmax(0, 1fr); gap: 8px; } .tag { display: none; } .body { font-size: 11.5px; } }
  @media (prefers-reduced-motion: reduce) { .line { animation: none; } .led, .cursor, .scan { animation: none; } .scan { display: none; } }
</style>
