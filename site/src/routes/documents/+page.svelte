<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  // Mock data - would be replaced with API calls
  let documents = Array(50).fill(null).map((_, i) => ({
    id: i + 1,
    title: `Document ${i + 1}`,
    author: `Author ${(i % 5) + 1}`,
    size: Math.floor(Math.random() * 1000000),
    type: ['book', 'document', 'article', 'manuscript'][i % 4],
    textQuality: Math.floor(Math.random() * 100),
    collection: ['Sacred Texts', 'Commentary', 'History', 'Research'][i % 4],
    dateAdded: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
    dateModified: new Date(Date.now() - Math.random() * 1000000000).toISOString(),
    isWebDocument: i % 3 === 0 // Every third document is from web
  }));

  let selectedDocs = new Set();
  let searchQuery = '';
  let loading = false;
  let hasMore = true;
  let sortField = 'title';
  let sortDirection = 'asc';
  let showWebDocuments = true;

  // Filter settings
  let filters = {
    collections: [],
    types: [],
    qualityMin: 0,
    showWebDocuments: true
  };

  function toggleSort(field) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'asc';
    }
  }

  function getSortIcon(field) {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  // Infinite scroll handling
  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newDocs = Array(20).fill(null).map((_, i) => ({
      id: documents.length + i + 1,
      title: `Document ${documents.length + i + 1}`,
      author: `Author ${((documents.length + i) % 5) + 1}`,
      size: Math.floor(Math.random() * 1000000),
      type: ['book', 'document', 'article', 'manuscript'][i % 4],
      textQuality: Math.floor(Math.random() * 100),
      collection: ['Sacred Texts', 'Commentary', 'History', 'Research'][i % 4],
      dateAdded: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
      dateModified: new Date(Date.now() - Math.random() * 1000000000).toISOString(),
      isWebDocument: i % 3 === 0
    }));
    
    documents = [...documents, ...newDocs];
    loading = false;
    hasMore = documents.length < 200; // Example limit
  }

  function handleScroll(e) {
    const bottom = e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 100;
    if (bottom) loadMore();
  }

  function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  function toggleDocument(doc) {
    if (selectedDocs.has(doc.id)) {
      selectedDocs.delete(doc.id);
    } else {
      selectedDocs.add(doc.id);
    }
    selectedDocs = selectedDocs; // Trigger reactivity
  }

  $: filteredDocuments = documents
    .filter(doc => 
      (filters.showWebDocuments || !doc.isWebDocument) &&
      (searchQuery === '' || 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.collection.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (filters.collections.length === 0 || filters.collections.includes(doc.collection)) &&
      (filters.types.length === 0 || filters.types.includes(doc.type)) &&
      doc.textQuality >= filters.qualityMin
    )
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'author':
          comparison = a.author.localeCompare(b.author);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'quality':
          comparison = a.textQuality - b.textQuality;
          break;
        case 'modified':
          comparison = new Date(a.dateModified) - new Date(b.dateModified);
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  // Get unique values for filters
  $: collections = [...new Set(documents.map(d => d.collection))];
  $: types = [...new Set(documents.map(d => d.type))];
</script>

<div class="h-full flex flex-col">
  <!-- Fixed Header -->
  <div class="p-6 bg-surface-1 border-b border-subtle">
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold">Library Documents</h1>
      <button
        class="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Documents
      </button>
    </div>

    <!-- Search and Filters -->
    <div class="mt-4 space-y-4">
      <!-- Search Bar -->
      <div class="flex gap-4 items-center">
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search documents..."
            class="w-full pl-10 pr-4 py-2 bg-surface-2 rounded-lg border border-subtle"
          />
          <svg class="w-5 h-5 absolute left-3 top-2.5 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <!-- Filter Options -->
      <div class="flex flex-wrap gap-4 bg-surface-2 p-4 rounded-lg">
        <!-- Collections Filter -->
        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm font-medium mb-1">Collections</label>
          <select
            multiple
            bind:value={filters.collections}
            class="w-full px-3 py-2 bg-surface-3 rounded-lg border border-subtle"
          >
            {#each collections as collection}
              <option value={collection}>{collection}</option>
            {/each}
          </select>
        </div>

        <!-- Types Filter -->
        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm font-medium mb-1">Types</label>
          <select
            multiple
            bind:value={filters.types}
            class="w-full px-3 py-2 bg-surface-3 rounded-lg border border-subtle"
          >
            {#each types as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>

        <!-- Quality Filter -->
        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm font-medium mb-1">Minimum Quality</label>
          <input
            type="range"
            bind:value={filters.qualityMin}
            min="0"
            max="100"
            class="w-full"
          />
          <div class="text-sm text-text-secondary text-center">{filters.qualityMin}%</div>
        </div>

        <!-- Web Documents Toggle -->
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={filters.showWebDocuments}
              class="form-checkbox h-5 w-5 text-primary rounded border-subtle"
            />
            <span>Show Web Documents</span>
          </label>
        </div>
      </div>
    </div>
  </div>

  <!-- Table Container -->
  <div class="flex-1 overflow-auto" on:scroll={handleScroll}>
    <table class="w-full border-collapse">
      <thead class="sticky top-0 bg-surface-2 shadow-sm z-10">
        <tr>
          <th class="w-8 px-4 py-3 text-left">
            <input type="checkbox" class="form-checkbox rounded border-subtle" />
          </th>
          <th class="px-4 py-3 text-left font-medium text-text-secondary cursor-pointer" on:click={() => toggleSort('title')}>
            Title {getSortIcon('title')}
          </th>
          <th class="px-4 py-3 text-left font-medium text-text-secondary cursor-pointer" on:click={() => toggleSort('author')}>
            Author {getSortIcon('author')}
          </th>
          <th class="px-4 py-3 text-left font-medium text-text-secondary cursor-pointer" on:click={() => toggleSort('type')}>
            Type {getSortIcon('type')}
          </th>
          <th class="px-4 py-3 text-left font-medium text-text-secondary cursor-pointer" on:click={() => toggleSort('size')}>
            Size {getSortIcon('size')}
          </th>
          <th class="px-4 py-3 text-left font-medium text-text-secondary cursor-pointer" on:click={() => toggleSort('quality')}>
            Quality {getSortIcon('quality')}
          </th>
          <th class="px-4 py-3 text-left font-medium text-text-secondary">Collection</th>
          <th class="px-4 py-3 text-left font-medium text-text-secondary cursor-pointer" on:click={() => toggleSort('modified')}>
            Modified {getSortIcon('modified')}
          </th>
        </tr>
      </thead>
      <tbody>
        {#each filteredDocuments as doc (doc.id)}
          <tr
            class="border-b border-subtle hover:bg-surface-2 transition-colors cursor-pointer"
            class:bg-surface-2={selectedDocs.has(doc.id)}
            class:opacity-75={doc.isWebDocument}
            on:click={() => toggleDocument(doc)}
          >
            <td class="w-8 px-4 py-2">
              <input
                type="checkbox"
                checked={selectedDocs.has(doc.id)}
                class="form-checkbox rounded border-subtle"
              />
            </td>
            <td class="px-4 py-2 font-medium">
              {doc.title}
              {#if doc.isWebDocument}
                <span class="ml-2 text-xs text-text-tertiary">(Web)</span>
              {/if}
            </td>
            <td class="px-4 py-2 text-text-secondary">{doc.author}</td>
            <td class="px-4 py-2">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-3">
                {doc.type}
              </span>
            </td>
            <td class="px-4 py-2 text-text-secondary">{formatSize(doc.size)}</td>
            <td class="px-4 py-2">
              <div class="flex items-center gap-2">
                <div class="w-16 h-2 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full"
                    class:bg-red-500={doc.textQuality < 40}
                    class:bg-yellow-500={doc.textQuality >= 40 && doc.textQuality < 70}
                    class:bg-green-500={doc.textQuality >= 70}
                    style="width: {doc.textQuality}%"
                  ></div>
                </div>
                <span class="text-xs text-text-secondary">{doc.textQuality}%</span>
              </div>
            </td>
            <td class="px-4 py-2">{doc.collection}</td>
            <td class="px-4 py-2 text-text-secondary">
              {new Date(doc.dateModified).toLocaleDateString()}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if loading}
      <div class="py-4 text-center text-text-secondary">
        Loading more documents...
      </div>
    {/if}
  </div>

  <!-- Right Panel - Document Details -->
  {#if selectedDocs.size > 0}
    <div class="w-96 bg-surface-2 border-l border-subtle p-6 overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-semibold">
          {selectedDocs.size} {selectedDocs.size === 1 ? 'Document' : 'Documents'} Selected
        </h2>
        <button class="text-text-tertiary hover:text-text-secondary">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <!-- Metadata editor will go here -->
      <div class="text-text-secondary">
        Metadata editor coming soon...
      </div>
    </div>
  {/if}
</div>

<style>
  th {
    font-weight: 500;
  }

  /* Custom scrollbar for Webkit browsers */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--surface-2);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--surface-3);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--surface-4);
  }
</style>
