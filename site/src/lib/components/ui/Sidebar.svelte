<script>
  import { page } from '$app/stores';
  import Icon from './Icon.svelte';
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  export let collapsed = false;

  const navigation = [
    {
      name: 'Home',
      href: '/',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
    },
    {
      name: 'Documents',
      href: '/documents',
      icon: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2'
    },
    {
      name: 'Sites',
      href: '/sites',
      icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9'
    },
    {
      name: 'Analytics',
      href: '/analytics',
      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
    },
    {
      name: 'Users',
      href: '/users',
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
    },
    {
      name: 'Config',
      href: '/config',
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
    }
  ];

  const libraryStats = {
    totalDocuments: 1234,
    recentAdditions: 15,
    recentAdditionsChange: 12,
    activeEditors: 8
  };
</script>

<aside class="bg-surface-2 border-r border-subtle h-full {collapsed ? 'w-16' : 'w-64'} transition-all duration-300">
  <nav class="h-full flex flex-col">
    <!-- Navigation -->
    <div class="flex-1 py-4">
      <div class="space-y-1 {collapsed ? 'w-16' : 'w-64'}">
        {#each navigation as item}
          <div class="px-5">
            <a
              href={item.href}
              class="flex items-center h-10 relative text-lg font-medium rounded-lg transition-colors w-full
                {$page.url.pathname === item.href ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-3'}
              "
            >
              <Icon
                path={item.icon}
                class="h-6 w-6 flex-shrink-0 absolute left-3 top-1/2 -translate-y-1/2 {$page.url.pathname === item.href ? 'text-accent' : 'text-text-secondary group-hover:text-text-primary'}"
              />
              {#if !collapsed}
                <span class="absolute left-11 top-1/2 -translate-y-1/2">{item.name}</span>
              {/if}
            </a>
          </div>
        {/each}
      </div>

      {#if !collapsed}
        <!-- Library Overview Card -->
        <div class="mt-8 px-3">
          <div class="bg-surface-3/50 rounded-lg p-4 space-y-4">
            <h3 class="text-sm font-medium text-text-primary">Library Overview</h3>
            
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-2xl font-semibold text-text-primary">{libraryStats.totalDocuments.toLocaleString()}</div>
                  <div class="text-sm text-text-tertiary">Total Documents</div>
                </div>
                <Icon path="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" class="w-5 h-5 text-text-tertiary" />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xl font-semibold text-text-primary flex items-center gap-1">
                    {libraryStats.recentAdditions}
                    <span class="text-sm text-emerald-500">+{libraryStats.recentAdditionsChange}%</span>
                  </div>
                  <div class="text-sm text-text-tertiary">Recent Additions</div>
                </div>
                <Icon path="M12 6v6m0 0v6m0-6h6m-6 0H6a2 2 0 002 2v-2" class="w-5 h-5 text-text-tertiary" />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xl font-semibold text-text-primary">{libraryStats.activeEditors}</div>
                  <div class="text-sm text-text-tertiary">Active Editors</div>
                </div>
                <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" class="w-5 h-5 text-text-tertiary" />
              </div>
            </div>
          </div>
        </div>

        <!-- Getting Started Card -->
        <div class="mt-4 px-3">
          <div class="bg-surface-3/50 rounded-lg p-4">
            <h3 class="text-sm font-medium text-text-primary mb-3">Getting Started</h3>
            <p class="text-sm text-text-tertiary mb-4">Welcome to SifterSearch! Ask me anything about the library or how to get started.</p>
            
            <div class="space-y-3">
              <div class="flex items-center gap-2.5 text-sm text-text-secondary">
                <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" class="w-4 h-4" />
                <span>Find specific documents or topics</span>
              </div>
              <div class="flex items-center gap-2.5 text-sm text-text-secondary">
                <Icon path="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" class="w-4 h-4" />
                <span>Explain concepts and relationships</span>
              </div>
              <div class="flex items-center gap-2.5 text-sm text-text-secondary">
                <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" class="w-4 h-4" />
                <span>Guide you through the editing process</span>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </nav>
</aside>

<style>
  aside {
    scrollbar-width: thin;
    scrollbar-color: var(--text-tertiary) transparent;
  }

  aside::-webkit-scrollbar {
    width: 4px;
  }

  aside::-webkit-scrollbar-track {
    background: transparent;
  }

  aside::-webkit-scrollbar-thumb {
    background-color: var(--text-tertiary);
    border-radius: 2px;
  }
</style>
