<script>
  import { page } from '$app/stores';
  import { createEventDispatcher } from 'svelte';
  import DocumentIcon from '$lib/components/icons/Document.svelte';
  import SearchIcon from '$lib/components/icons/Search.svelte';
  import SettingsIcon from '$lib/components/icons/Settings.svelte';
  import UsersIcon from '$lib/components/icons/Users.svelte';
  import FileIcon from '$lib/components/icons/File.svelte';
  import PlusIcon from '$lib/components/icons/Plus.svelte';
  import QuestionIcon from '$lib/components/icons/Question.svelte';
  import EditIcon from '$lib/components/icons/Edit.svelte';

  export let collapsed = false;
  const dispatch = createEventDispatcher();

  $: navItems = [
    {
      href: '/',
      label: 'Home',
      icon: SearchIcon,
      active: $page.url.pathname === '/'
    },
    {
      href: '/library',
      label: 'Library',
      icon: DocumentIcon,
      active: $page.url.pathname === '/library'
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: SettingsIcon,
      active: $page.url.pathname === '/settings'
    }
  ];
</script>

<nav class="h-full flex flex-col">
  <!-- Navigation Items -->
  <div class="flex-1 py-4 overflow-y-auto">
    <nav class="px-3 space-y-1">
      {#each navItems as item}
        <a
          href={item.href}
          class="flex items-center gap-3 px-2 py-2 text-sm rounded-lg transition-colors"
          class:justify-center={collapsed}
          class:text-text-primary={item.active}
          class:text-text-secondary={!item.active}
          class:hover:bg-surface-3={!item.active}
          class:bg-surface-3={item.active}
        >
          <svelte:component this={item.icon} class="w-5 h-5" />
          {#if !collapsed}
            <span>{item.label}</span>
          {/if}
        </a>
      {/each}
    </nav>

    {#if !collapsed}
      <!-- Library Overview Card -->
      <div class="mt-6 px-3">
        <div class="bg-surface-2 rounded-lg p-4 space-y-4">
          <h3 class="text-sm font-medium text-text-primary">Library Overview</h3>
          
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-2xl font-semibold text-text-primary">1,234</div>
                <div class="text-sm text-text-tertiary">Total Documents</div>
              </div>
              <FileIcon class="w-5 h-5 text-text-tertiary" />
            </div>

            <div class="flex items-center justify-between">
              <div>
                <div class="text-xl font-semibold text-text-primary flex items-center gap-1">
                  15
                  <span class="text-sm text-text-tertiary">+12%</span>
                </div>
                <div class="text-sm text-text-tertiary">Recent Additions</div>
              </div>
              <PlusIcon class="w-5 h-5 text-text-tertiary" />
            </div>

            <div class="flex items-center justify-between">
              <div>
                <div class="text-xl font-semibold text-text-primary">8</div>
                <div class="text-sm text-text-tertiary">Active Editors</div>
              </div>
              <UsersIcon class="w-5 h-5 text-text-tertiary" />
            </div>
          </div>
        </div>
      </div>

      <!-- Getting Started Card -->
      <div class="mt-4 px-3">
        <div class="bg-surface-2 rounded-lg p-4">
          <h3 class="text-sm font-medium text-text-primary mb-2">Getting Started</h3>
          <p class="text-sm text-text-tertiary mb-3">Welcome to SifterSearch! Ask me anything about the library or how to get started.</p>
          
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm text-text-secondary">
              <SearchIcon class="w-4 h-4" />
              <span>Find specific documents or topics</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-text-secondary">
              <QuestionIcon class="w-4 h-4" />
              <span>Explain concepts and relationships</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-text-secondary">
              <EditIcon class="w-4 h-4" />
              <span>Guide you through the editing process</span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</nav>
