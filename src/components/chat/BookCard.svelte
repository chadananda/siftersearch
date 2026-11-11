<!-- Chat book card: cover + title/author/year + description + "Read the book". Cover via image-service srcset. -->
<script>
  import { inlineParts } from '../../lib/inline-md.js';
  let { book } = $props();
  const desc = $derived(inlineParts(book?.description));
  const ext = $derived(/^https?:\/\//.test(book?.url || '') && !/oceanlibrary\.com/.test(book.url));
  const sep = $derived(book?.cover_url?.includes('?') ? '&' : '?');
  const tr = (w) => `${book.cover_url}${sep}tr=w-${w},q-80,e-sharpen`;
</script>
{#if book?.title}
  <div class="flex flex-col sm:flex-row gap-4 p-4 mb-3 w-full max-w-full overflow-hidden rounded-lg border border-border bg-surface-1">
    {#if book.cover_url}
      <a href={book.url} class="shrink-0 self-center sm:self-start" target={ext ? '_blank' : undefined} rel={ext ? 'noopener' : undefined}>
        <img class="w-32 sm:w-36 h-auto rounded shadow" src={tr(240)} srcset={`${tr(160)} 160w, ${tr(240)} 240w, ${tr(320)} 320w, ${tr(480)} 480w`} sizes="(min-width: 640px) 144px, 128px" alt={`Cover of ${book.title}`} loading="lazy" decoding="async" />
      </a>
    {:else}
      <div class="shrink-0 self-center sm:self-start w-32 sm:w-36 aspect-[2/3] rounded bg-surface-2 border border-border-subtle flex items-center justify-center p-3 text-center">
        <span class="italic text-secondary text-sm">{book.title}</span>
      </div>
    {/if}
    <div class="min-w-0 flex-1 flex flex-col gap-2">
      <h3 class="m-0 text-xl sm:text-2xl font-semibold leading-tight"><a href={book.url} class="italic text-primary hover:text-accent" target={ext ? '_blank' : undefined} rel={ext ? 'noopener' : undefined}>{book.title}</a></h3>
      {#if book.author || book.year}<p class="m-0 text-sm text-muted">{[book.author, book.year].filter(Boolean).join(' · ')}</p>{/if}
      {#if desc.length}<p class="m-0 text-secondary text-sm sm:text-base leading-relaxed">{#each desc as d}{#if d.strong}<strong>{d.t}</strong>{:else if d.em}<em>{d.t}</em>{:else}{d.t}{/if}{/each}</p>{/if}
      {#if book.url}<a href={book.url} class="self-start mt-1 px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white font-medium no-underline" target={ext ? '_blank' : undefined} rel={ext ? 'noopener' : undefined}>Read the book</a>{/if}
    </div>
  </div>
{/if}
