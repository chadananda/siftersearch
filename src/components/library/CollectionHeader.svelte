<script>
  let { node = null, documentCount = 0, isAdmin = false, onEdit = null } = $props();

  const authorityConfig = {
    10: { label: 'Sacred Text', stars: '★★★' },
    9: { label: 'Authoritative', stars: '★★☆' },
    8: { label: 'Official', stars: '★☆☆' },
    7: { label: 'Compiled', stars: '◆' },
    6: { label: 'Reliable', stars: '◇' },
    5: { label: 'Standard', stars: '○' },
  };

  let authority = $derived(authorityConfig[node?.authority_default] || { label: 'Standard', stars: '○' });
</script>

<header class="relative min-h-[180px] rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-accent via-accent/60 to-surface-1">
  {#if node?.cover_image_url}
    <img src={node.cover_image_url} alt="" class="absolute inset-0 w-full h-full object-cover brightness-[0.4] saturate-[1.2]" />
    <div class="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-surface-1"></div>
  {/if}

  <div class="relative z-10 p-6 flex flex-col gap-3">
    {#if node?.parent}
      <nav class="flex items-center gap-2 text-[0.8125rem]">
        <a href="/library" class="flex items-center gap-1 text-white/70 hover:text-white transition-colors">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          Library
        </a>
        <span class="text-white/40">›</span>
        <a href="/library/{node.parent.slug}" class="text-white/70 hover:text-white transition-colors">{node.parent.name}</a>
        <span class="text-white/40">›</span>
        <span class="text-white font-medium">{node.name}</span>
      </nav>
    {/if}

    <div class="flex items-start gap-4">
      <h1 class="flex-1 text-[2rem] font-bold text-white leading-tight drop-shadow-lg">{node?.name || 'Collection'}</h1>
      {#if isAdmin && onEdit}
        <button
          class="p-2 bg-white/15 backdrop-blur border border-white/20 rounded-lg text-white cursor-pointer hover:bg-white/25 hover:border-white/40 transition-all shrink-0"
          onclick={onEdit}
          title="Edit collection"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      {/if}
    </div>

    {#if node?.description}
      <p class="text-white/85 text-base leading-relaxed max-w-[600px]">{node.description}</p>
    {/if}

    <div class="flex items-center gap-4 mt-2">
      <div class="flex items-baseline gap-1.5 text-white">
        <span class="text-xl font-bold">{documentCount.toLocaleString()}</span>
        <span class="text-[0.8125rem] opacity-80">{documentCount === 1 ? 'document' : 'documents'}</span>
      </div>
      <div class="w-px h-6 bg-white/30"></div>
      <div class="flex items-center gap-2 text-amber-400">
        <span class="text-sm tracking-wide">{authority.stars}</span>
        <span class="text-[0.8125rem] opacity-80">{authority.label}</span>
      </div>
    </div>
  </div>
</header>
