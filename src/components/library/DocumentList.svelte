<script>
  import { createEventDispatcher } from 'svelte';

  let { documents = [], selectedId = null, isAdmin = false } = $props();

  const dispatch = createEventDispatcher();

  function selectDocument(doc) {
    dispatch('select', doc);
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'indexed': return { icon: '✓', color: 'success', label: 'Indexed' };
      case 'processing': return { icon: '⏳', color: 'warning', label: 'Processing' };
      case 'unindexed': return { icon: '○', color: 'muted', label: 'Not indexed' };
      default: return { icon: '?', color: 'muted', label: 'Unknown' };
    }
  }

  // Format paragraph count as size indicator
  function getSizeLabel(count) {
    if (!count) return '';
    if (count < 50) return 'Brief';
    if (count < 200) return 'Medium';
    if (count < 500) return 'Long';
    return 'Book';
  }

  // Get authority display info
  function getAuthorityInfo(authority) {
    if (!authority) return null;
    if (authority >= 10) return { label: '★★★', title: 'Sacred Text', class: 'text-accent' };
    if (authority >= 9) return { label: '★★☆', title: 'Authoritative', class: 'text-accent' };
    if (authority >= 8) return { label: '★☆☆', title: 'Institutional', class: 'text-success' };
    if (authority >= 7) return { label: '◆', title: 'Official', class: 'text-success' };
    if (authority >= 5) return { label: '◇', title: 'Published', class: 'text-secondary' };
    if (authority >= 3) return { label: '○', title: 'Research', class: 'text-muted' };
    return { label: '·', title: 'Unofficial', class: 'text-muted' };
  }
</script>

<div class="flex flex-col gap-0.5">
  {#each documents as doc}
    {@const status = getStatusIcon(doc.status)}
    {@const size = getSizeLabel(doc.paragraph_count)}
    {@const auth = getAuthorityInfo(doc.authority)}
    <button
      class="flex items-center gap-3 px-3 py-2 text-left rounded-lg border border-transparent
             hover:bg-surface-2 hover:border-border transition-colors
             {selectedId === doc.id ? 'bg-accent/5 border-accent' : ''}"
      onclick={() => selectDocument(doc)}
    >
      <span class="text-sm flex-shrink-0 w-5 text-center
                   {status.color === 'success' ? 'text-success' : ''}
                   {status.color === 'warning' ? 'text-warning' : ''}
                   {status.color === 'muted' ? 'text-muted' : ''}"
            title={status.label}>
        {status.icon}
      </span>

      <div class="flex-1 min-w-0 flex items-baseline gap-2">
        <span class="text-sm font-medium text-primary truncate">{doc.title || 'Untitled'}</span>
        {#if doc.author}
          <span class="text-xs text-secondary truncate flex-shrink-0">{doc.author}</span>
        {/if}
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        {#if isAdmin && auth}
          <span class="text-xs {auth.class}" title="{auth.title} (authority {doc.authority})">{auth.label}</span>
        {/if}
        {#if size}
          <span class="text-xs text-muted px-1.5 py-0.5 rounded bg-surface-2" title="{doc.paragraph_count?.toLocaleString()} paragraphs">{size}</span>
        {/if}
        {#if doc.collection}
          <span class="text-xs text-muted hidden sm:inline">{doc.collection}</span>
        {/if}
      </div>
    </button>
  {/each}
</div>
