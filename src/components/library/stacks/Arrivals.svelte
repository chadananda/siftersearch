<script>
  // NEW ARRIVALS: the newest books Dewey has catalogued (talks excluded; they are in the Fireside Room), as a row of
  // covers with the day each arrived. SSR renders the cached row; the live feed slides newly added books in.
  import { onMount } from 'svelte';
  import { onLanding } from '../../../lib/library-feed.js';
  import { renderBook } from '../../../lib/library-stacks.js';

  let { landing = null } = $props();
  let items = $state(landing?.arrivals || []);
  let fresh = $state(new Set());
  onMount(() => onLanding((x) => {
    if (!Array.isArray(x?.arrivals) || !x.arrivals.length) return;
    const had = new Set(items.map((b) => b.id));
    fresh = new Set(x.arrivals.filter((b) => !had.has(b.id)).map((b) => b.id));
    items = x.arrivals;
  }, landing));
  const day = (iso) => { const d = iso ? new Date(String(iso).replace(' ', 'T')) : null; return d && !isNaN(d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''; };
</script>

{#if items.length}
  <section class="arrivals" aria-labelledby="arrivals-h">
    <div class="head">
      <div>
        <p class="eyebrow">Just catalogued</p>
        <h2 id="arrivals-h" class="display">New arrivals</h2>
      </div>
      <p class="serif note">Added by Dewey, our AI librarian, after a holdings check, OCR where needed and a quality gate. Newest first.</p>
    </div>
    <div class="rowwrap">
      <button class="arrow l" type="button" aria-label="Scroll new arrivals back">←</button>
      <button class="arrow r" type="button" aria-label="Scroll new arrivals on">→</button>
      <div class="row" role="list" aria-label="New arrivals, newest first">
        {#each items as b (b.id)}<div role="listitem" class="li">{@html renderBook(b, b.religion, { cls: `lift${fresh.has(b.id) ? ' arrive' : ''}`, note: day(b.added) })}</div>{/each}
      </div>
    </div>
  </section>
{/if}

<style>
  .head { display: grid; gap: 0.5rem 3rem; align-items: end; margin-bottom: 1.4rem; }
  @media (min-width: 900px) { .head { grid-template-columns: auto 1fr; } }
  h2 { margin: 0.35rem 0 0; font-size: clamp(2rem, 4.6vw, 3.2rem); }
  .note { margin: 0; max-width: 34rem; font-size: 1rem; line-height: 1.5; color: var(--lib-ink-soft); }
  @media (min-width: 900px) { .note { justify-self: end; text-align: right; } }
</style>
