<script>
  // VOICES: every speaker ONCE, as a record in a slowly drifting rack (two rows going opposite ways on wide screens) —
  // portrait label (face-centred) or a generated one, name, talk count. Hover spins the record; click tunes the listing to
  // that voice (the link works without JS: /media?speaker=<key>). Drift pauses on hover/focus/offscreen; reduced motion →
  // a still, scrollable shelf.
  import { onMount } from 'svelte';
  import RecordLabel from './RecordLabel.svelte';

  let { speakers = [], active = '', onpick = () => {} } = $props();

  const ROLE = { hand: 'Hand of the Cause', uhj: 'Universal House of Justice', scholar: null };
  const shown = $derived(speakers.slice(0, 64));
  const rows = $derived(shown.length > 14 ? [shown.filter((_, i) => i % 2 === 0), shown.filter((_, i) => i % 2 === 1)] : [shown]);
  let root, offscreen = $state(false);

  onMount(() => {
    const io = new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; });
    io.observe(root);
    return () => io.disconnect();
  });

  const pick = (e, s) => { e.preventDefault(); onpick(s.k); };
</script>

<section bind:this={root} class="voices relative -mx-4 sm:-mx-6 lg:-mx-8" class:lr-paused={offscreen} aria-labelledby="voices-h">
  <div class="mx-4 mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 sm:mx-6 lg:mx-8">
    <h2 id="voices-h" class="font-marquee text-3xl text-radio-ink sm:text-4xl">The voices</h2>
    <p class="font-dial text-sm font-semibold uppercase tracking-[0.2em] text-radio-ink-soft">{speakers.length} speakers · one record each</p>
  </div>
  {#each rows as row, r (r)}
    <div class="rack" style={`--dur:${Math.max(40, row.length * 4.5)}s`}>
      <ul class="track" class:reverse={r === 1}>
        {#each [0, 1] as copy (copy)}
          {#each row as s (s.k + copy)}
            <li aria-hidden={copy ? 'true' : undefined}>
              <a href={`/media?speaker=${encodeURIComponent(s.k)}`} tabindex={copy ? -1 : undefined} class="voice group" class:active={active === s.k}
                onclick={(e) => pick(e, s)} aria-label={`${s.n}: ${s.c} talk${s.c === 1 ? '' : 's'}${ROLE[s.role] ? `, ${ROLE[s.role]}` : ''}`}>
                <span class="disc"><span class="label"><RecordLabel name={s.n} photo={s.p} year={s.y0} size={64} /></span></span>
                <span class="min-w-0">
                  <span class="block truncate font-marquee text-lg leading-tight text-radio-ink group-hover:text-radio-amber">{s.n}</span>
                  <span class="block font-dial text-sm font-semibold uppercase tracking-wider text-radio-ink-soft">{s.c} talk{s.c === 1 ? '' : 's'}{ROLE[s.role] ? ` · ${s.role === 'hand' ? 'Hand' : 'House'}` : ''}</span>
                </span>
              </a>
            </li>
          {/each}
        {/each}
      </ul>
    </div>
  {/each}
</section>

<style>
  .rack { overflow: hidden; padding: 0.4rem 0; mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
  .track { display: flex; width: max-content; gap: 0.75rem; animation: drift var(--dur) linear infinite; }
  .track.reverse { animation-direction: reverse; }
  .rack:hover .track, .rack:focus-within .track, .lr-paused .track { animation-play-state: paused; }
  @keyframes drift { from { transform: translateX(0); } to { transform: translateX(calc(-50% - 0.375rem)); } }
  .voice { display: flex; align-items: center; gap: 0.75rem; width: 16.5rem; padding: 0.5rem 0.9rem 0.5rem 0.5rem; border-radius: 9999px;
    background: var(--radio-paper); box-shadow: inset 0 0 0 1px var(--radio-line); transition: box-shadow 0.25s, transform 0.25s; }
  .voice:hover, .voice.active { box-shadow: inset 0 0 0 2px var(--radio-brass), 0 6px 18px var(--radio-glow); transform: translateY(-2px); }
  .voice:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .disc { position: relative; flex: none; width: 4.5rem; height: 4.5rem; border-radius: 9999px;
    background: repeating-radial-gradient(circle, var(--radio-groove) 0 1.5px, color-mix(in srgb, var(--radio-groove) 78%, var(--radio-on-dark)) 1.5px 2.5px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3); transition: transform 0.6s cubic-bezier(0.3, 0.7, 0.4, 1); }
  .label { position: absolute; inset: 14%; border-radius: 9999px; overflow: hidden; box-shadow: 0 0 0 2px var(--radio-brass); }
  .voice:hover .disc, .voice:focus-visible .disc { animation: spin 1.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .rack { overflow-x: auto; mask-image: none; }
    .track { animation: none; }
    .track li[aria-hidden='true'] { display: none; }
    .voice:hover .disc { animation: none; }
  }
</style>
