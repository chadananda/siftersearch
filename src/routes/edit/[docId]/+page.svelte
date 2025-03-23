<script>
  import Toolbar from '$lib/components/ui/Toolbar.svelte';
  import EditBar from '$lib/components/ui/EditBar.svelte';
  
  // Mock data - will be replaced with real data from API
  const document = {
    id: 1,
    title: 'Introduction to SifterSearch',
    content: `# Introduction to SifterSearch

SifterSearch is a powerful library management system that combines traditional search capabilities with modern AI technologies.

## Key Features

1. Advanced Search
2. AI-powered suggestions
3. Version control
4. Collaborative editing

## Getting Started

To get started with SifterSearch, first...`,
    metadata: {
      author: 'John Doe',
      dateCreated: '2025-02-20',
      lastModified: '2025-02-22',
      status: 'published',
      tags: ['documentation', 'getting-started']
    }
  };

  const breadcrumbs = [
    { text: 'Home', href: '/' },
    { text: 'Documents', href: '/documents' },
    { text: document.title, href: `/edit/${document.id}` }
  ];

  const actions = [
    { 
      text: 'Save', 
      icon: 'M5 13l4 4L19 7',
      primary: true,
      onClick: () => console.log('Save clicked')
    },
    {
      text: 'Preview',
      icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      onClick: () => console.log('Preview clicked')
    }
  ];

  let showMetadata = true;
</script>

<div class="flex flex-col h-full">
  <Toolbar {breadcrumbs} title={document.title} {actions} />

  <div class="flex flex-1">
    <!-- Editor -->
    <div class="flex-1 p-6">
      <div class="card h-full">
        <div class="p-4">
          <textarea
            class="w-full h-[calc(100vh-16rem)] p-4 rounded-lg font-mono text-sm resize-none"
            value={document.content}
          ></textarea>
        </div>
      </div>
    </div>

    <!-- Metadata Panel -->
    <EditBar 
      item={document.metadata}
      onSave={(metadata) => console.log('Saving metadata:', metadata)}
      onClose={() => showMetadata = false}
    />
  </div>
</div>

<style>
  textarea {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
</style>
