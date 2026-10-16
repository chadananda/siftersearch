<script>
  // The terminal (Chad 10-16: "a computer terminal looking window with the logging of our activity constantly scrolling
  // up … a living moving window into the library work"). Every line is real: the machinery's activity log (jobs, indexer
  // progress, ledger, findability probes, Anís turns — content-free) and this page's own API polls. Lines are released
  // from a buffer at a steady pace (faster when a backlog builds) so the window keeps moving between polls.
  import { onMount } from 'svelte';
  import { observatory } from '../../lib/api.js';
  import { lineTone } from '../../lib/observatory.js';

  const MAX = 80;
  let shown = $state([]);
  let queue = [];
  let lastId = 0;
  let lastShownAt = Date.now();
  let lastPoll = null;
  let box;
  let reduced = false;
  let nowSec = $state(Date.now() / 1000);
  // TYPING (Chad 10-16: "a typing effect for new text, to keep it moving"): a streamed line types out over ≤ ~1 s; the
  // next waits until it finishes. The backlog shown on load appears at once.
  let typing = $state({ id: null, n: 0 });
  let typingDone = Promise.resolve();
  function typeOut(line) {
    const len = line.text.length;
    const perChar = Math.max(4, Math.min(22, 900 / Math.max(1, len)));
    typing = { id: line.id, n: 0 };
    typingDone = new Promise((ok) => {
      const t0 = performance.now();
      const step = (t) => {
        const n = Math.min(len, Math.floor((t - t0) / perChar));
        typing = { id: line.id, n };
        if (n < len) requestAnimationFrame(step); else ok();
      };
      requestAnimationFrame(step);
    });
    return typingDone;
  }

  const clock = (sec) => new Date(sec * 1000).toISOString().slice(11, 19);
  function push(line, type = false) {
    shown = [...shown.slice(-(MAX - 1)), line];
    lastShownAt = Date.now();
    queueMicrotask(() => { if (box) box.scrollTop = box.scrollHeight; });
    return type && !reduced ? typeOut(line) : Promise.resolve();
  }

  async function poll() {
    try {
      const r = await observatory.activity(80);
      lastPoll = r;
      const fresh = (r.data.lines || []).filter((l) => l.id > lastId);
      if (fresh.length) { lastId = fresh[fresh.length - 1].id; queue.push(...fresh); }
    } catch (err) { queue.push({ id: `e${Date.now()}`, at: Date.now() / 1000, kind: 'error', text: `api · activity poll failed · ${err.message}` }); }
  }

  onMount(() => {
    reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let stop = false;
    (async () => {
      const r = await observatory.activity(80).catch(() => null);
      const lines = r?.data?.lines || [];
      // the recent past appears at once; what follows streams in
      for (const l of lines.slice(-24)) push(l);
      lastId = lines.length ? lines[lines.length - 1].id : 0;
      lastPoll = r;
    })();
    const polling = setInterval(poll, 5000);
    const clockTick = setInterval(() => { nowSec = Date.now() / 1000; }, 1000);
    const pace = async () => {
      if (stop) return;
      if (queue.length) await push(queue.shift(), queue.length < 25);   // a big backlog scrolls without typing
      else if (Date.now() - lastShownAt > 25000 && lastPoll) {
        // nothing new from the machinery: show the page's own (real) API round trip
        await push({ id: `p${Date.now()}`, at: Date.now() / 1000, kind: 'api',
          text: `GET /api/observatory/activity · ${lastPoll.ms} ms${lastPoll.cache ? ` · edge ${lastPoll.cache}` : ''} · ${lastId ? `head #${lastId}` : 'no lines yet'}` }, true);
      }
      setTimeout(pace, reduced ? 1500 : queue.length > 20 ? 60 : queue.length > 6 ? 200 : 450);
    };
    pace();
    return () => { stop = true; clearInterval(polling); clearInterval(clockTick); };
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
      <div class="line {lineTone(l)}"><span class="ts">{clock(l.at)}</span><span class="tag">{l.kind}</span><span class="txt">{#if typing.id === l.id && typing.n < l.text.length}{l.text.slice(0, typing.n)}<span class="caret">▍</span>{:else}{l.text}{/if}</span></div>
    {/each}
    <div class="line prompt"><span class="ts">{clock(nowSec)}</span><span class="cursor">▍</span></div>
  </div>
</div>

<style>
  /* smoked liquid glass: always dark (a terminal), translucent over the background, lit top edge */
  .term { container-type: inline-size; border-radius: 18px; overflow: hidden; background: rgba(5, 9, 16, 0.78); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 24px 60px -24px rgba(2, 6, 23, 0.8); color: #cbd5e1; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 9px 14px; background: linear-gradient(rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01)); border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    font: 500 11.5px/1 var(--obs-mono); color: #9fb0c8; }
  .dots { display: flex; gap: 6px; }
  .dots i { width: 10px; height: 10px; border-radius: 50%; background: #1e293b; }
  .dots i:nth-child(1) { background: #ef4444; opacity: 0.75; } .dots i:nth-child(2) { background: #f59e0b; opacity: 0.75; } .dots i:nth-child(3) { background: #22c55e; opacity: 0.75; }
  .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .live { display: flex; align-items: center; gap: 6px; color: #22c55e; letter-spacing: 0.12em; }
  .led { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: blink 1.6s ease-in-out infinite; }
  .body { height: 300px; overflow-y: auto; overflow-x: hidden; padding: 10px 14px 12px; font: 400 12.5px/1.65 var(--obs-mono);
    scrollbar-width: thin; scrollbar-color: #1e293b transparent;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 36px); mask-image: linear-gradient(to bottom, transparent 0, #000 36px); }
  .line { display: grid; grid-template-columns: 64px 74px minmax(0, 1fr); gap: 10px; animation: rise 0.35s ease-out; }
  .ts { color: #8b9bb4; }
  .tag { color: #9fb0c8; text-transform: uppercase; letter-spacing: 0.06em; font-size: 11px; }
  .txt { color: #e2e8f0; overflow-wrap: anywhere; unicode-bidi: isolate; direction: ltr; }
  .job .tag, .job .txt { color: #fbbf24; }
  .warn .tag, .warn .txt { color: #fb923c; }
  .error .tag, .error .txt { color: #f87171; }
  .index .tag { color: #38bdf8; } .index .txt { color: #bae6fd; }
  .ledger .tag { color: #a5b4cb; } .ledger .txt { color: #c5d0e0; }
  .writer .tag { color: #2dd4bf; } .writer .txt { color: #99f6e4; }
  .qdrant .tag { color: #f472b6; } .qdrant .txt { color: #fbcfe8; }
  .telemetry .tag { color: #a78bfa; } .telemetry .txt { color: #ddd6fe; }
  .hit1 .tag, .hit1 .txt { color: #4ade80; }
  .hit .tag { color: #86efac; } .hit .txt { color: #bbf7d0; }
  .miss .tag { color: #f87171; } .miss .txt { color: #fca5a5; }
  .anis .tag { color: #f0abfc; } .anis .txt { color: #f5d0fe; }
  .api .tag { color: #93a3bd; } .api .txt { color: #b8c4d6; }
  .cursor { color: #22c55e; animation: blink 1s steps(2) infinite; }
  .caret { color: #4ade80; margin-left: 1px; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes blink { 50% { opacity: 0.25; } }
  @container (max-width: 520px) { .line { grid-template-columns: 56px minmax(0, 1fr); gap: 8px; } .tag { display: none; } .body { font-size: 11.5px; } }
  @media (prefers-reduced-motion: reduce) { .line { animation: none; } .led, .cursor { animation: none; } }
</style>
