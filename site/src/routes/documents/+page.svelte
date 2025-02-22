<script>
  import { enhance } from '$app/forms';
  import Toolbar from '$lib/components/ui/Toolbar.svelte';
  import EditBar from '$lib/components/ui/EditBar.svelte';
  
  export let data;

  const breadcrumbs = [
    { text: 'Home', href: '/' },
    { text: 'Documents', href: '/documents' }
  ];

  const actions = [
    { 
      text: 'Add Document', 
      icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
      primary: true,
      onClick: () => window.location.href = '/documents/new'
    },
    {
      text: 'Import',
      icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
      onClick: () => window.location.href = '/documents/import'
    }
  ];

  let selectedDocument = null;
  let statusMessage = '';
  
  function handleDocumentSelect(doc) {
    selectedDocument = doc;
  }

  async function handleStatusUpdate(event) {
    const form = event.target;
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form)
    });
    const result = await response.json();
    
    if (result.success) {
      statusMessage = 'Document updated successfully';
      selectedDocument = null;
    } else {
      statusMessage = result.error || 'Failed to update document';
    }
  }
</script>

<div class="flex flex-col h-full">
  <Toolbar {breadcrumbs} title="Documents" {actions} />

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
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Title</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Author</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Date Added</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          {#each data.documents as doc}
            <tr 
              class="hover:bg-tertiary cursor-pointer"
              on:click={() => handleDocumentSelect(doc)}
            >
              <td class="px-6 py-4 whitespace-nowrap">{doc.title}</td>
              <td class="px-6 py-4 whitespace-nowrap">{doc.author}</td>
              <td class="px-6 py-4 whitespace-nowrap">{doc.dateAdded}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {doc.status === 'published' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}">
                  {doc.status}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <form 
                  method="POST" 
                  action="?/updateStatus"
                  use:enhance
                  class="inline-block"
                >
                  <input type="hidden" name="id" value={doc.id}>
                  <input type="hidden" name="status" value={doc.status === 'published' ? 'draft' : 'published'}>
                  <button 
                    type="submit"
                    class="text-primary hover:text-primary-dark mr-2"
                  >
                    {doc.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                </form>
                <a 
                  href="/edit/{doc.id}" 
                  class="text-primary hover:text-primary-dark"
                >
                  Edit
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <EditBar 
    item={selectedDocument} 
    onClose={() => selectedDocument = null}
  />
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
</style>
