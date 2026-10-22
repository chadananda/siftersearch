<script>
  // The docked "now playing" bar shared by every preview button: what is playing, its progress, pause/stop, and the talk's
  // title as the link to the whole recording.
  import { preview, playExcerpt, stop } from '../../../lib/media-preview.svelte.js';
  import RecordLabel from './RecordLabel.svelte';
  const it = $derived(preview.item);
  const pct = $derived(preview.end > preview.start ? Math.min(1, Math.max(0, (preview.t - preview.start) / (preview.end - preview.start))) : 0);
</script>

{#if it}
  <div class="dock" role="region" aria-label="Now playing">
    <div class="bar" style={`transform:scaleX(${pct})`} aria-hidden="true"></div>
    <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
      <div class="h-11 w-11 flex-none overflow-hidden rounded-full" class:spin={preview.playing}>
        <RecordLabel name={preview.speaker?.n || it.sp || it.t} photo={preview.speaker?.p} year={it.y} size={44} />
      </div>
      <div class="min-w-0 flex-1">
        <a href={`/media/${it.s}?t=${it.hl?.[0] || 0}`} class="block truncate font-semibold text-radio-on-dark hover:text-radio-amber">{it.t}</a>
        <p class="truncate text-sm text-radio-on-dark opacity-80" aria-live="polite">
          {preview.error || (preview.loading ? 'Tuning in…' : `${it.sp || 'Excerpt'}${it.y ? ` · ${it.y}` : ''} · 20-second excerpt`)}
        </p>
      </div>
      <button type="button" class="ctl" onclick={() => playExcerpt(it, preview.speaker)} aria-label={preview.playing ? 'Pause' : 'Play'}>
        {#if preview.playing}
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
        {/if}
      </button>
      <button type="button" class="ctl ghost" onclick={stop} aria-label="Stop and close the player">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .dock { position: fixed; left: 0.75rem; right: 0.75rem; bottom: 0.75rem; z-index: 50; border-radius: 1rem; overflow: hidden; background: var(--radio-walnut-deep);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), inset 0 0 0 1px var(--radio-brass); animation: up 0.35s cubic-bezier(0.3, 0.7, 0.4, 1); }
  @keyframes up { from { transform: translateY(120%); } to { transform: none; } }
  .bar { position: absolute; left: 0; top: 0; height: 3px; width: 100%; background: var(--radio-amber); transform-origin: left; transition: transform 0.25s linear; }
  .ctl { flex: none; display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 9999px; background: var(--radio-amber); color: var(--radio-walnut-deep); }
  .ctl svg { width: 1.2rem; height: 1.2rem; }
  .ctl.ghost { background: transparent; color: var(--radio-on-dark); box-shadow: inset 0 0 0 1px var(--radio-brass); }
  .ctl:focus-visible, a:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .spin { animation: spin 1.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .dock, .spin { animation: none; } .bar { transition: none; } }
</style>
