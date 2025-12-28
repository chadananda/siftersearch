<script>
  /**
   * LibraryHeader Component
   * Hero header for the main library page with overall statistics
   */

  let {
    totalDocuments = 0,
    totalReligions = 0,
    totalCollections = 0
  } = $props();
</script>

<header class="relative min-h-[140px] rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-accent via-accent/60 to-surface-1">
  <div class="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-surface-1/50"></div>

  <!-- Large artistic background book icon -->
  <div class="absolute -right-6 -bottom-6 text-white/[0.07] select-none pointer-events-none">
    <svg class="w-48 h-48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.75">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  </div>

  <div class="relative z-10 p-6 flex flex-col gap-3">
    <!-- Title row with icon -->
    <div class="flex items-center gap-4">
      <div class="w-14 h-14 flex items-center justify-center bg-white/15 backdrop-blur rounded-xl border border-white/20 shrink-0">
        <svg class="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      </div>
      <div class="flex-1">
        <h1 class="text-[1.75rem] font-bold text-white leading-tight drop-shadow-lg">Sacred Texts Library</h1>
        <p class="text-white/70 text-sm mt-1">Explore scriptures and writings from world religions</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="flex items-center gap-6 mt-2">
      <div class="flex items-baseline gap-1.5 text-white">
        <span class="text-xl font-bold">{totalDocuments.toLocaleString()}</span>
        <span class="text-[0.8125rem] opacity-80">{totalDocuments === 1 ? 'document' : 'documents'}</span>
      </div>
      <div class="w-px h-6 bg-white/30"></div>
      <div class="flex items-baseline gap-1.5 text-white">
        <span class="text-xl font-bold">{totalReligions}</span>
        <span class="text-[0.8125rem] opacity-80">{totalReligions === 1 ? 'tradition' : 'traditions'}</span>
      </div>
      <div class="w-px h-6 bg-white/30"></div>
      <div class="flex items-baseline gap-1.5 text-white">
        <span class="text-xl font-bold">{totalCollections}</span>
        <span class="text-[0.8125rem] opacity-80">{totalCollections === 1 ? 'collection' : 'collections'}</span>
      </div>
    </div>
  </div>
</header>
