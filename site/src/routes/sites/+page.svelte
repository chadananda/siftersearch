<script>
  import { enhance } from '$app/forms';
  import Toolbar from '$lib/components/ui/Toolbar.svelte';
  import EditBar from '$lib/components/ui/EditBar.svelte';
  
  export let data;

  const breadcrumbs = [
    { text: 'Home', href: '/' },
    { text: 'Sites', href: '/sites' }
  ];

  const actions = [
    { 
      text: 'Add Site', 
      icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
      primary: true,
      onClick: () => showAddSite = true
    }
  ];

  let selectedSite = null;
  let statusMessage = '';
  let showAddSite = false;
  let newPath = '';
  
  function handleSiteSelect(site) {
    selectedSite = site;
    newPath = '';
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString();
  }

  async function handleAddPath(event) {
    event.preventDefault();
    if (!newPath) return;

    const form = event.target;
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form)
    });
    const result = await response.json();
    
    if (result.success) {
      statusMessage = 'Path added successfully';
      newPath = '';
    } else {
      statusMessage = result.error || 'Failed to add path';
    }
  }
</script>

<div class="flex flex-col h-full">
  <Toolbar {breadcrumbs} title="Site Management" {actions} />

  {#if statusMessage}
    <div class="p-4 bg-success/10 text-success">
      {statusMessage}
    </div>
  {/if}

  <div class="flex-1 p-6">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y">
        <thead>
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Domain</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Paths</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Last Crawled</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Documents</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          {#each data.sites as site}
            <tr 
              class="hover:bg-tertiary cursor-pointer"
              on:click={() => handleSiteSelect(site)}
            >
              <td class="px-6 py-4 whitespace-nowrap">{site.domain}</td>
              <td class="px-6 py-4">
                <ul class="list-disc list-inside">
                  {#each site.paths as path}
                    <li class="text-sm">{path}</li>
                  {/each}
                </ul>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">{formatDate(site.lastCrawled)}</td>
              <td class="px-6 py-4 whitespace-nowrap">{site.documentCount}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {site.enabled ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}">
                  {site.enabled ? 'Active' : 'Paused'}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <form 
                  method="POST" 
                  action="?/updateStatus"
                  use:enhance
                  class="inline-block"
                >
                  <input type="hidden" name="id" value={site.id}>
                  <input type="hidden" name="enabled" value={!site.enabled}>
                  <button 
                    type="submit"
                    class="text-primary hover:text-primary-dark mr-2"
                  >
                    {site.enabled ? 'Pause' : 'Activate'}
                  </button>
                </form>
                <form 
                  method="POST" 
                  action="?/delete"
                  use:enhance
                  class="inline-block"
                >
                  <input type="hidden" name="id" value={site.id}>
                  <button 
                    type="submit"
                    class="text-error hover:text-error-dark"
                  >
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  {#if selectedSite}
    <div class="border-t p-6">
      <h3 class="text-lg font-medium mb-4">Add Path for {selectedSite.domain}</h3>
      <form 
        method="POST" 
        action="?/addPath"
        class="flex gap-4"
        on:submit={handleAddPath}
      >
        <input type="hidden" name="id" value={selectedSite.id}>
        <input
          type="text"
          name="path"
          bind:value={newPath}
          placeholder="/path/*"
          class="flex-1 p-2 rounded border"
        >
        <button 
          type="submit"
          class="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark"
        >
          Add Path
        </button>
      </form>
    </div>
  {/if}
</div>

<style>
  th {
    color: var(--text-secondary);
    background-color: var(--bg-primary);
  }

  tbody {
    background-color: var(--bg-primary);
  }

  tr {
    border-color: var(--border-color);
  }

  input {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    border-color: var(--border-color);
  }

  input:focus {
    outline: none;
    border-color: var(--color-primary);
  }
</style>
