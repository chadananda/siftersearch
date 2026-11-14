<!-- Chat quote card: a quoted passage in a research answer — tiny cover, the quote (rendered by the caller), "— author, Work, place" linking to the place. Cover via image-service srcset. -->
<script>
  import { coverAt, coverSrcset } from '../../../api/lib/quote-blocks.js';
  let { card, html = '' } = $props();
  const ext = $derived(/^https?:\/\//.test(card?.url || '') && !/oceanlibrary\.com/.test(card.url));
</script>
<figure class="quote-card flex gap-3 my-3 p-3 w-full max-w-full overflow-hidden rounded-lg border border-border bg-surface-1">
  {#if card.cover_url}
    <a href={card.url} class="shrink-0 self-start" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
      <img class="block w-10 sm:w-12 aspect-[2/3] object-cover rounded shadow" src={coverAt(card.cover_url, 96)} srcset={coverSrcset(card.cover_url)} sizes="(min-width: 640px) 48px, 40px" alt="" loading="lazy" decoding="async" />
    </a>
  {:else}
    <div class="shrink-0 self-start w-10 sm:w-12 aspect-[2/3] rounded bg-surface-2 border border-border-subtle" aria-hidden="true"></div>
  {/if}
  <div class="min-w-0 flex-1 flex flex-col gap-1.5">
    <div class="quote-card-text m-0 p-0 text-sm sm:text-base leading-relaxed">{@html html}</div>
    <p class="m-0 text-xs sm:text-sm text-muted">—
      <a href={card.url} class="text-muted hover:text-accent no-underline" target="_blank" rel="noopener" title={ext ? 'Opens the source' : 'Opens the passage in the library'}>{#if card.author}{card.author}, {/if}<em class="text-primary">{card.title}</em>{#if card.place}, {card.place}{/if}</a>
    </p>
    {#if card.image?.thumb}
      <!-- the card's picture (Dawn-Breakers plate, chosen by code: api/lib/illustrations.js); opens the larger image; box reserved -->
      <figure class="m-0 mt-1">
        <a href={card.image.large} class="inline-block leading-none" target="_blank" rel="noopener"><img class="block rounded shadow h-auto" style="width:{card.image.thumb.width}px" src={card.image.thumb.src} srcset={card.image.thumb.srcset} sizes={card.image.thumb.sizes} width={card.image.thumb.width} height={card.image.thumb.height} alt={card.image.caption} loading="lazy" decoding="async" /></a>
        <figcaption class="mt-1 text-xs text-muted">{card.image.caption} · Illustration from <em>The Dawn-Breakers</em></figcaption>
      </figure>
    {/if}
  </div>
</figure>
<style>
  .quote-card-text { color: var(--quote); }   /* the quotation ink: book words apart from Anís's own (Chad 11-04) */
  .quote-card-text :global(p) { margin: 0 0 .5em; }
  .quote-card-text :global(p:last-child) { margin-bottom: 0; }
</style>
