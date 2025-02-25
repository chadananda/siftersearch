<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let sites = [
    {
      id: 1,
      domain: "bahai-library.com",
      status: "active",
      lastCrawled: "2024-02-20",
      screenshot: "https://placehold.co/600x400",
      stats: {
        totalDocuments: 1234,
        totalPages: 5678,
        pdfDocuments: 145,
        textDataSize: 1567, // MB
        topAuthors: ["John Smith", "Jane Doe", "Robert Brown"],
        documentTypes: {
          articles: 567,
          books: 234,
          letters: 189,
          transcripts: 244
        }
      },
      crawlFrequency: "weekly",
      tags: ["primary", "authoritative"]
    },
    // More sites would be loaded from the API
  ];

  let selectedSite = null;
  let filters = {
    status: '',
    crawlFrequency: '',
    tags: []
  };

  let activeTab = 'sites';
  let recentActivity = {
    documents: [
      {
        id: 1,
        title: "Introduction to World Religions",
        type: "article",
        action: "added",
        timestamp: "2025-02-23T10:30:00",
        user: "John Smith",
        site: "bahai-library.com"
      },
      {
        id: 2,
        title: "Letters of Shoghi Effendi",
        type: "letter",
        action: "modified",
        timestamp: "2025-02-23T09:15:00",
        user: "Jane Doe",
        site: "bahai-library.com"
      },
      {
        id: 3,
        title: "History of the Faith",
        type: "book",
        action: "added",
        timestamp: "2025-02-22T16:45:00",
        user: "Robert Brown",
        site: "bahai-library.com"
      }
    ],
    users: [
      {
        name: "John Smith",
        avatar: "https://placehold.co/100",
        activity: {
          additions: 45,
          modifications: 23,
          lastActive: "2025-02-23T15:30:00"
        }
      },
      {
        name: "Jane Doe",
        avatar: "https://placehold.co/100",
        activity: {
          additions: 32,
          modifications: 56,
          lastActive: "2025-02-23T17:45:00"
        }
      },
      {
        name: "Robert Brown",
        avatar: "https://placehold.co/100",
        activity: {
          additions: 28,
          modifications: 19,
          lastActive: "2025-02-23T12:20:00"
        }
      }
    ]
  };

  function handleSiteSelect(site) {
    selectedSite = site;
  }

  function handleAddSite() {
    // TODO: Implement site addition wizard
  }

  function handleCrawlNow(siteId) {
    // TODO: Implement immediate crawl
  }

  function formatDataSize(mb) {
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  function getTimeAgo(timestamp) {
    const now = new Date('2025-02-23T18:52:16-07:00');
    const date = new Date(timestamp);
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<div class="h-full flex">
  <!-- Main Content -->
  <div class="flex-1 p-6 {selectedSite ? 'pr-0' : ''} overflow-auto">
    <!-- Header -->
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Websites</h1>
      <button
        on:click={handleAddSite}
        class="px-4 py-2 bg-accent text-on-accent rounded-lg hover:bg-accent/90 transition-colors flex items-center gap-2 shadow-sm hover:shadow-md"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Site
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex gap-4 mb-6 border-b border-subtle">
      <button
        class="px-4 py-2 font-medium {activeTab === 'sites' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary hover:text-text-primary'}"
        on:click={() => activeTab = 'sites'}
      >
        Sites
      </button>
      <button
        class="px-4 py-2 font-medium {activeTab === 'activity' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary hover:text-text-primary'}"
        on:click={() => activeTab = 'activity'}
      >
        Recent Activity
      </button>
    </div>

    {#if activeTab === 'sites'}
      <!-- Filters -->
      <div class="bg-surface-2 rounded-lg p-4 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Status</label>
            <select
              bind:value={filters.status}
              class="w-full px-3 py-2 bg-surface-3 rounded-lg border border-subtle"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Crawl Frequency</label>
            <select
              bind:value={filters.crawlFrequency}
              class="w-full px-3 py-2 bg-surface-3 rounded-lg border border-subtle"
            >
              <option value="">All Frequencies</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Tags</label>
            <input
              type="text"
              placeholder="Filter by tags"
              class="w-full px-3 py-2 bg-surface-3 rounded-lg border border-subtle"
            />
          </div>
        </div>
      </div>

      <!-- Sites Grid -->
      <div class="grid grid-cols-1 gap-6">
        {#each sites as site}
          <div class="bg-surface-2 rounded-lg overflow-hidden shadow-sm">
            <div class="flex">
              <!-- Screenshot -->
              <div class="w-64 h-48 flex-shrink-0">
                <img 
                  src={site.screenshot} 
                  alt={site.domain}
                  class="w-full h-full object-cover"
                />
              </div>

              <!-- Content -->
              <div class="flex-1 p-6">
                <div class="flex justify-between items-start">
                  <div>
                    <h2 class="text-xl font-semibold mb-2">{site.domain}</h2>
                    <div class="flex items-center gap-3 text-sm text-text-secondary mb-4">
                      <span class="px-2 py-1 rounded-full {
                        site.status === 'active' ? 'bg-success/10 text-success' :
                        site.status === 'paused' ? 'bg-warning/10 text-warning' :
                        'bg-error/10 text-error'
                      }">
                        {site.status}
                      </span>
                      <span>Last crawled: {new Date(site.lastCrawled).toLocaleDateString()}</span>
                      <span>Crawls {site.crawlFrequency}</span>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button
                      on:click={() => handleSiteSelect(site)}
                      class="p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-3"
                    >
                      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      on:click={() => handleCrawlNow(site.id)}
                      class="p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-3"
                    >
                      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Stats Grid -->
                <div class="grid grid-cols-2 gap-6">
                  <div>
                    <h3 class="text-sm font-medium text-text-secondary mb-2">Content Overview</h3>
                    <div class="space-y-2">
                      <div class="flex justify-between">
                        <span class="text-sm">Total Pages:</span>
                        <span class="text-sm font-medium">{site.stats.totalPages.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm">Total Documents:</span>
                        <span class="text-sm font-medium">{site.stats.totalDocuments.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm">PDF Documents:</span>
                        <span class="text-sm font-medium">{site.stats.pdfDocuments.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm">Total Data Size:</span>
                        <span class="text-sm font-medium">{formatDataSize(site.stats.textDataSize)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 class="text-sm font-medium text-text-secondary mb-2">Document Types</h3>
                    <div class="space-y-2">
                      {#each Object.entries(site.stats.documentTypes) as [type, count]}
                        <div class="flex justify-between">
                          <span class="text-sm capitalize">{type}:</span>
                          <span class="text-sm font-medium">{count.toLocaleString()}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>

                <!-- Top Authors -->
                <div class="mt-4">
                  <h3 class="text-sm font-medium text-text-secondary mb-2">Top Authors</h3>
                  <div class="flex flex-wrap gap-2">
                    {#each site.stats.topAuthors as author}
                      <span class="px-2 py-1 bg-surface-3 rounded-full text-sm">
                        {author}
                      </span>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Recent Activity -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Recent Documents -->
        <div class="bg-surface-2 rounded-lg p-6">
          <h2 class="text-xl font-semibold mb-4">Recent Documents</h2>
          <div class="space-y-4">
            {#each recentActivity.documents as doc}
              <div class="flex items-start gap-4 p-3 rounded-lg hover:bg-surface-3 transition-colors">
                <div class="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                  <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm px-2 py-0.5 rounded-full {
                      doc.action === 'added' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                    }">
                      {doc.action}
                    </span>
                    <span class="text-sm text-text-tertiary">{getTimeAgo(doc.timestamp)}</span>
                  </div>
                  <h3 class="font-medium mt-1 truncate">{doc.title}</h3>
                  <div class="text-sm text-text-secondary mt-1">
                    <span class="capitalize">{doc.type}</span> • {doc.site} • by {doc.user}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- User Activity -->
        <div class="bg-surface-2 rounded-lg p-6">
          <h2 class="text-xl font-semibold mb-4">User Activity</h2>
          <div class="space-y-4">
            {#each recentActivity.users as user}
              <div class="flex items-center gap-4 p-3 rounded-lg hover:bg-surface-3 transition-colors">
                <img src={user.avatar} alt={user.name} class="w-10 h-10 rounded-full bg-surface-3" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <h3 class="font-medium truncate">{user.name}</h3>
                    <span class="text-sm text-text-tertiary">{getTimeAgo(user.activity.lastActive)}</span>
                  </div>
                  <div class="text-sm text-text-secondary mt-1">
                    <span class="text-success">{user.activity.additions} additions</span> • 
                    <span class="text-warning">{user.activity.modifications} modifications</span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Right Panel - Site Details -->
  {#if selectedSite}
    <div class="w-96 bg-surface-2 border-l border-subtle p-6 overflow-y-auto">
      <div class="flex justify-between items-start mb-6">
        <h2 class="text-xl font-semibold">{selectedSite.domain}</h2>
        <button
          on:click={() => selectedSite = null}
          class="text-text-tertiary hover:text-text-secondary"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Spider Rules editor will go here -->
      <div class="text-text-secondary">
        Spider configuration coming soon...
      </div>
    </div>
  {/if}
</div>

<style>
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
