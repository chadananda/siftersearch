<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  // Mock data - will be replaced with real data from API
  let timeRange = '7d';
  let stats = {
    totalQueries: 12543,
    averageResponseTime: '1.2s',
    activeUsers: 234,
    documentViews: 5678,
    crawledPages: 45678,
    indexedDocuments: 8765,
    totalStorage: '234.5 GB',
    errorRate: '0.12%'
  };

  let queryData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Queries',
        data: [1200, 1900, 3000, 5000, 8000, 12543, 11000]
      }
    ]
  };

  let topSearches = [
    { term: "ocean of light", count: 234 },
    { term: "revelation", count: 189 },
    { term: "mysticism", count: 156 },
    { term: "prayer", count: 145 },
    { term: "meditation", count: 123 }
  ];

  let recentErrors = [
    { time: "2024-02-23T17:45:23", type: "Crawl Error", site: "bahai-library.com", message: "Connection timeout" },
    { time: "2024-02-23T16:32:11", type: "Parse Error", site: "ocean.org", message: "Invalid document structure" },
    { time: "2024-02-23T15:15:45", type: "API Error", site: "N/A", message: "Rate limit exceeded" }
  ];

  function handleTimeRangeChange() {
    // TODO: Fetch new data based on timeRange
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="p-6 pb-0">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Analytics Dashboard</h1>
      <select
        bind:value={timeRange}
        on:change={handleTimeRangeChange}
        class="px-3 py-2 bg-surface-3 rounded-lg border border-subtle"
      >
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="90d">Last 90 Days</option>
      </select>
    </div>
  </div>

  <!-- Dashboard Content -->
  <div class="flex-1 p-6 space-y-6 overflow-auto">
    <!-- Stats Overview -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each Object.entries(stats) as [key, value]}
        <div class="bg-surface-2 rounded-lg p-4">
          <div class="text-sm text-text-secondary capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
          <div class="text-2xl font-semibold mt-1">{value}</div>
        </div>
      {/each}
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-surface-2 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Queries Over Time</h2>
        <div class="h-64 bg-surface-3 rounded-lg">
          <!-- Chart will be rendered here -->
        </div>
      </div>
      
      <div class="bg-surface-2 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Storage Usage</h2>
        <div class="h-64 bg-surface-3 rounded-lg">
          <!-- Chart will be rendered here -->
        </div>
      </div>
    </div>

    <!-- Additional Metrics -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Top Searches -->
      <div class="bg-surface-2 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Top Searches</h2>
        <div class="space-y-3">
          {#each topSearches as search}
            <div class="flex justify-between items-center">
              <span class="text-text-secondary">{search.term}</span>
              <span class="px-2 py-1 bg-surface-3 rounded-full text-sm">{search.count}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Recent Errors -->
      <div class="bg-surface-2 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Recent Errors</h2>
        <div class="space-y-3">
          {#each recentErrors as error}
            <div class="bg-surface-3 rounded-lg p-3">
              <div class="flex justify-between text-sm">
                <span class="text-error">{error.type}</span>
                <span class="text-text-tertiary">{new Date(error.time).toLocaleTimeString()}</span>
              </div>
              <div class="text-sm mt-1">{error.site}</div>
              <div class="text-sm text-text-secondary mt-1">{error.message}</div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
