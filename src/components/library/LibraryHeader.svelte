<script>
  /**
   * LibraryHeader Component
   * Hero header for the main library page - matches ReligionHeader style
   */

  let {
    totalDocuments = 0,
    totalReligions = 0,
    totalCollections = 0
  } = $props();
</script>

<header class="relative min-h-[160px] rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-accent via-accent/60 to-surface-1">
  <div class="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-surface-1/50"></div>

  <!-- Large artistic background ocean logo -->
  <div class="absolute -right-8 -bottom-8 select-none pointer-events-none">
    <img src="/ocean-noback.svg" alt="" class="w-48 h-48 opacity-[0.15]" />
  </div>

  <div class="relative z-10 p-6 flex flex-col gap-3">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-[0.8125rem]">
      <span class="flex items-center gap-1.5 text-white font-medium">
        <img src="/ocean-noback.svg" alt="" class="w-4 h-4" />
        Library
      </span>
    </nav>

    <!-- Title row with icon -->
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 flex items-center justify-center bg-white/15 backdrop-blur rounded-xl border border-white/20 shrink-0">
        <img src="/ocean-noback.svg" alt="" class="w-9 h-9" />
      </div>
      <div class="flex-1">
        <h1 class="text-[2rem] font-bold text-white leading-tight drop-shadow-lg">Sacred Texts Library</h1>
      </div>
    </div>

    <!-- Description -->
    <p class="text-white/85 text-base leading-relaxed max-w-[600px]">Explore scriptures and writings from world religions</p>

    <!-- Stats -->
    <div class="flex items-center gap-4 mt-1">
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
