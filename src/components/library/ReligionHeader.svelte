<script>
  /**
   * ReligionHeader Component
   * Hero header for religion pages with symbol, name, description, and stats
   */

  let {
    religion = null,
    documentCount = 0,
    collectionCount = 0,
    isAdmin = false,
    onEdit = null
  } = $props();

  // Default symbol if none set
  const symbol = $derived(religion?.symbol || '📚');
  const name = $derived(religion?.name || 'Unknown');
  const description = $derived(religion?.description || '');
  const isBahai = $derived(name?.toLowerCase().includes('baha'));
</script>

<header class="relative min-h-[160px] rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-accent via-accent/60 to-surface-1">
  <div class="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-surface-1/50"></div>

  <!-- Large artistic background symbol -->
  <div class="absolute -right-8 -bottom-8 select-none pointer-events-none">
    {#if isBahai}
      <img src="/bahai-star.svg" alt="" class="w-48 h-48 opacity-[0.07] invert" />
    {:else}
      <span class="text-[12rem] leading-none text-white/[0.07] font-normal">{symbol}</span>
    {/if}
  </div>

  <div class="relative z-10 p-6 flex flex-col gap-3">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-[0.8125rem]">
      <a href="/library" class="flex items-center gap-1 text-white/70 hover:text-white transition-colors">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        Library
      </a>
      <span class="text-white/40">›</span>
      <span class="text-white font-medium">{name}</span>
    </nav>

    <!-- Title row with symbol -->
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 flex items-center justify-center bg-white/15 backdrop-blur rounded-xl border border-white/20 shrink-0">
        {#if isBahai}
          <img src="/bahai-star.svg" alt="Baha'i" class="w-9 h-9 invert" />
        {:else}
          <span class="text-4xl">{symbol}</span>
        {/if}
      </div>
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-[2rem] font-bold text-white leading-tight drop-shadow-lg">{name}</h1>
          {#if isAdmin && onEdit}
            <button
              class="p-2 bg-white/15 backdrop-blur border border-white/20 rounded-lg text-white cursor-pointer hover:bg-white/25 hover:border-white/40 transition-all shrink-0"
              onclick={() => onEdit(religion)}
              title="Edit religion details"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Description -->
    {#if description}
      <p class="text-white/85 text-base leading-relaxed max-w-[600px]">{description}</p>
    {:else if isAdmin}
      <p class="text-white/50 text-base italic">No description. Click Edit to add one.</p>
    {/if}

    <!-- Stats -->
    <div class="flex items-center gap-4 mt-1">
      <div class="flex items-baseline gap-1.5 text-white">
        <span class="text-xl font-bold">{documentCount.toLocaleString()}</span>
        <span class="text-[0.8125rem] opacity-80">{documentCount === 1 ? 'document' : 'documents'}</span>
      </div>
      <div class="w-px h-6 bg-white/30"></div>
      <div class="flex items-baseline gap-1.5 text-white">
        <span class="text-xl font-bold">{collectionCount}</span>
        <span class="text-[0.8125rem] opacity-80">{collectionCount === 1 ? 'collection' : 'collections'}</span>
      </div>
    </div>
  </div>
</header>
