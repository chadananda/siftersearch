<script>
  /**
   * CollectionHeader Component
   * Hero header for collection pages - matches ReligionHeader style
   */
  import { getUserId } from '../../lib/api.js';

  let { node = null, documentCount = 0, isAdmin = false, onEdit = null } = $props();

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  // State for AI generation
  let generating = $state(false);
  let generatedDescription = $state('');
  let generationError = $state('');

  // Derived description (prefer generated, then existing)
  const description = $derived(generatedDescription || node?.description || '');

  // Generate description with AI
  async function generateDescription() {
    if (!node?.id || generating) return;

    generating = true;
    generationError = '';

    try {
      const headers = { 'Content-Type': 'application/json' };
      const uid = getUserId();
      if (uid) headers['X-User-ID'] = uid;

      const res = await fetch(`${API_BASE}/api/library/nodes/${node.id}/generate-description`, {
        method: 'POST',
        credentials: 'include',
        headers
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate');
      }

      const data = await res.json();
      generatedDescription = data.description;

      // Also save it to the database
      await fetch(`${API_BASE}/api/library/nodes/${node.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: JSON.stringify({ description: data.description })
      });
    } catch (err) {
      generationError = err.message;
    } finally {
      generating = false;
    }
  }
</script>

<header class="relative min-h-[160px] rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-accent via-accent/60 to-surface-1">
  {#if node?.cover_image_url}
    <img src={node.cover_image_url} alt="" class="absolute inset-0 w-full h-full object-cover brightness-[0.4] saturate-[1.2]" />
  {/if}
  <div class="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-surface-1/50"></div>

  <!-- Large artistic background icon -->
  <div class="absolute -right-8 -bottom-8 select-none pointer-events-none">
    <svg class="w-48 h-48 text-white/[0.07]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.75">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  </div>

  <div class="relative z-10 p-6 flex flex-col gap-3">
    <!-- Breadcrumb -->
    {#if node?.parent}
      <nav class="flex items-center gap-2 text-[0.8125rem]">
        <a href="/library" class="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors">
          <img src="/ocean-noback.svg" alt="" class="w-4 h-4" />
          Library
        </a>
        <span class="text-white/40">›</span>
        <a href="/library/{node.parent.slug}" class="text-white/70 hover:text-white transition-colors">{node.parent.name}</a>
        <span class="text-white/40">›</span>
        <span class="text-white font-medium">{node.name}</span>
      </nav>
    {/if}

    <!-- Title row with icon -->
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 flex items-center justify-center bg-white/15 backdrop-blur rounded-xl border border-white/20 shrink-0">
        <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-[2rem] font-bold text-white leading-tight drop-shadow-lg">{node?.name || 'Collection'}</h1>
          {#if isAdmin && onEdit}
            <button
              class="p-2 bg-white/15 backdrop-blur border border-white/20 rounded-lg text-white cursor-pointer hover:bg-white/25 hover:border-white/40 transition-all shrink-0"
              onclick={onEdit}
              title="Edit collection"
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
      <div class="flex items-center gap-3 flex-wrap">
        <p class="text-white/50 text-base italic m-0">No description.</p>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white/90 bg-white/15 backdrop-blur border border-white/20 rounded-lg cursor-pointer hover:bg-white/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={generateDescription}
          disabled={generating}
        >
          {#if generating}
            <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
            Generating...
          {:else}
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Generate with AI
          {/if}
        </button>
        {#if generationError}
          <span class="text-sm text-red-300">{generationError}</span>
        {/if}
      </div>
    {/if}

    <!-- Stats -->
    <div class="flex items-center gap-4 mt-1">
      <div class="flex items-baseline gap-1.5 text-white">
        <span class="text-xl font-bold">{documentCount.toLocaleString()}</span>
        <span class="text-[0.8125rem] opacity-80">{documentCount === 1 ? 'document' : 'documents'}</span>
      </div>
      {#if isAdmin && node?.authority_default}
        <div class="w-px h-6 bg-white/30"></div>
        <div class="flex items-baseline gap-1.5 text-white/70">
          <span class="text-[0.8125rem]">Authority:</span>
          <span class="text-sm font-medium">{node.authority_default}</span>
        </div>
      {/if}
    </div>
  </div>
</header>
