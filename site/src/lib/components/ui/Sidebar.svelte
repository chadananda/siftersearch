<script>
  import { page } from '$app/stores';
  export let collapsed = false;

  const navItems = [
    {
      name: 'Home',
      href: '/',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>`
    },
    {
      name: 'Search',
      href: '/search',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>`
    },
    {
      name: 'Documents',
      href: '/documents',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`
    },
    {
      name: 'Help',
      href: '/help',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>`
    }
  ];
</script>

<div class="space-y-1 px-3 py-4">
  {#each navItems as item}
    <a
      href={item.href}
      class="flex items-center h-10 px-3 text-lg font-medium rounded-lg transition-colors w-full
        {$page.url.pathname === item.href ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-3'}
      "
    >
      <div class="h-5 w-5 flex-shrink-0 {$page.url.pathname === item.href ? 'text-accent' : 'text-text-secondary'}">{@html item.icon}</div>
      {#if !collapsed}
        <span class="ml-3">{item.name}</span>
      {/if}
    </a>
  {/each}
</div>

{#if !collapsed}
  <div class="px-3 mt-8">
    <div class="bg-surface-3/50 rounded-lg p-4">
      <h3 class="text-sm font-medium text-text-primary mb-2">Library Overview</h3>
      <div class="space-y-3">
        <div>
          <div class="text-2xl font-semibold text-text-primary">1,234</div>
          <div class="text-sm text-text-tertiary">Total Documents</div>
        </div>
        <div>
          <div class="text-xl font-semibold text-text-primary flex items-center gap-1">
            15
            <span class="text-sm text-emerald-500">+12%</span>
          </div>
          <div class="text-sm text-text-tertiary">Recent Additions</div>
        </div>
        <div>
          <div class="text-xl font-semibold text-text-primary">8</div>
          <div class="text-sm text-text-tertiary">Active Editors</div>
        </div>
      </div>
    </div>

    <div class="mt-4 bg-surface-3/50 rounded-lg p-4">
      <h3 class="text-sm font-medium text-text-primary mb-2">Getting Started</h3>
      <p class="text-sm text-text-tertiary mb-3">Welcome to SifterSearch! Ask me anything about the library or how to get started.</p>
      <div class="space-y-2 text-sm text-text-secondary">
        <div class="flex items-center gap-2">
          <div class="w-4 h-4">{@html navItems[1].icon}</div>
          <span>Find specific documents or topics</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4">{@html navItems[4].icon}</div>
          <span>Explain concepts and relationships</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4">{@html navItems[2].icon}</div>
          <span>Guide you through the editing process</span>
        </div>
      </div>
    </div>
  </div>
{/if}
