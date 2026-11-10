<!-- Chat passage card: one found passage, phrase marked, small cover; the whole card is one link. Cover via image-service srcset. -->
<script>
  let { passage } = $props();
  // excerpt carries **phrase** marks: split into text/mark parts, rendered as text nodes (no HTML injection)
  const parts = $derived(String(passage?.excerpt || '').split(/\*\*(.+?)\*\*/s).map((t, i) => ({ t, mark: i % 2 === 1 })).filter((x) => x.t));
  const ext = $derived(/^https?:\/\//.test(passage?.url || '') && !/oceanlibrary\.com/.test(passage.url));
  const sep = $derived(passage?.cover_url?.includes('?') ? '&' : '?');
  const tr = (w) => `${passage.cover_url}${sep}tr=w-${w},q-80,e-sharpen`;
</script>
{#if passage?.excerpt}
  <svelte:element this={passage.url ? 'a' : 'div'} href={passage.url || undefined} target={passage.url ? '_blank' : undefined} rel={passage.url ? 'noopener' : undefined}
    class="flex gap-3 p-3 mb-3 w-full max-w-full overflow-hidden rounded-lg border border-border bg-surface-1 hover:bg-surface-2 no-underline text-primary">
    {#if passage.cover_url}
      <img class="shrink-0 w-14 sm:w-16 h-auto self-start rounded shadow" src={tr(128)} srcset={`${tr(64)} 64w, ${tr(128)} 128w, ${tr(192)} 192w`} sizes="(min-width: 640px) 64px, 56px" alt={`Cover of ${passage.title}`} loading="lazy" decoding="async" />
    {:else}
      <div class="shrink-0 w-14 sm:w-16 aspect-[2/3] self-start rounded bg-surface-2 border border-border-subtle flex items-center justify-center p-1 text-center"><span class="italic text-secondary text-xs">{passage.title}</span></div>
    {/if}
    <div class="min-w-0 flex-1 flex flex-col gap-1.5">
      <blockquote class="m-0 p-0 border-0 text-secondary text-sm sm:text-base leading-relaxed">“{#each parts as x}{#if x.mark}<mark class="bg-accent/20 text-primary rounded-sm px-0.5">{x.t}</mark>{:else}{x.t}{/if}{/each}”</blockquote>
      <p class="m-0 text-xs sm:text-sm text-muted">{[passage.author].filter(Boolean).join('')}{passage.author ? ' · ' : ''}<em class="text-primary">{passage.title}</em>{passage.place ? ` · ${passage.place}` : ''}</p>
    </div>
  </svelte:element>
{/if}
