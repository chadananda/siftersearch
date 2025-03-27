<!--
  Sidebar.svelte
  IMPORTANT: This component uses Svelte 5 with Runes syntax
  - Uses $props() for props
  - Uses $state() for reactive state
  - Uses $derived for computed values
-->
<script>
  import { page } from '$app/stores';
  import Shadow from '../shared/Shadow.svelte';
  import SignedIn from 'clerk-sveltekit/client/SignedIn.svelte';
  import SignedOut from 'clerk-sveltekit/client/SignedOut.svelte';
  import { userHasRole as checkUserRole, authStore } from '$lib/client/auth.js';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  
  // Use Svelte 5 props syntax
  const { collapsed } = $props();

  // Get user from both auth store and page data
  // Prioritize auth store as it's more up-to-date with client-side state
  const user = $derived($authStore.user || $page.data.user);
  
  // Development mode detection
  const isDev = browser && import.meta.env.DEV;
  
  // Enable/disable debug logging
  const debugMode = browser && import.meta.env.DEV && false; // Set to true to enable debug logging
  
  // Create a reactive effect to log debug info whenever user or page changes
  $effect(() => {
    if (user || $page) {
      logDebugInfo();
    }
  });
  
  // Add debugging on mount
  onMount(() => {
    logDebugInfo();
    
    // In development mode, add listeners to refresh the sidebar when auth state changes
    if (isDev && browser) {
      // Listen for localStorage changes (for cross-tab updates)
      const handleStorageChange = (event) => {
        if (event.key === 'auth_state') {
          console.log('[DEV] Auth state changed in localStorage, refreshing sidebar');
          logDebugInfo();
        }
      };
      
      // Listen for custom role change events (for same-tab updates)
      const handleRoleChange = (event) => {
        console.log('[DEV] Role changed event received:', event.detail);
        // Force a refresh of the sidebar
        setTimeout(() => {
          logDebugInfo();
        }, 10);
      };
      
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('dev-role-changed', handleRoleChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('dev-role-changed', handleRoleChange);
      };
    }
  });
  
  function logDebugInfo() {
    if (debugMode) {
      console.log('Sidebar: Current user role:', user?.role);
      console.log('Sidebar: Current pathname:', $page.url.pathname);
      console.log('Sidebar: Auth store user:', $authStore.user);
      console.log('Sidebar: Page store user:', $page.data.user);
      
      // Force re-evaluation of active states
      navItems.forEach(item => {
        const active = isActive(item.href);
        const hasAccess = hasRequiredRole(item);
        console.log(`Item ${item.name}: active = ${active}, access = ${hasAccess}, href = ${item.href}, requiredRole = ${item.requiredRole}`);
      });
    }
  }
  
  // Check if user has required role for an item
  function hasRequiredRole(item) {
    // If no role is required, everyone can access
    if (item.requiredRole === null) {
      return true;
    }
    
    // Define role hierarchy
    const roleHierarchy = {
      'visitor': 0,
      'subscriber': 1,
      'editor': 2,
      'librarian': 3,
      'admin': 4,
      'superuser': 5
    };
    
    // Get the required role level
    const requiredRoleLevel = roleHierarchy[item.requiredRole] || 0;
    
    // First check JWT claims from auth store (most authoritative)
    const authStoreRole = $authStore.user?.role;
    if (authStoreRole) {
      const userRoleLevel = roleHierarchy[authStoreRole] || 0;
      if (debugMode) {
        console.log(`[DEV] Checking access with JWT role: ${authStoreRole} (level ${userRoleLevel}) against required: ${item.requiredRole} (level ${requiredRoleLevel})`);
      }
      return userRoleLevel >= requiredRoleLevel;
    }
    
    // In development mode, check for role override in localStorage as fallback
    if (isDev && browser) {
      // Get the role from localStorage (set by ProfileButton.svelte)
      const devRole = localStorage.getItem('dev_user_role');
      if (devRole) {
        if (debugMode) {
          console.log(`[DEV] Using role from localStorage for access check: ${devRole}`);
        }
        
        // Check if the dev role has sufficient access
        const userRoleLevel = roleHierarchy[devRole] || 0;
        
        return userRoleLevel >= requiredRoleLevel;
      }
    }
    
    // Use the userHasRole function to check if user has the required role
    return checkUserRole(user, item.requiredRole);
  }
  
  // Check if the current path matches the item's href
  function isActive(href) {
    const pathname = $page.url.pathname;
    
    // Debug log in development mode
    if (debugMode) {
      console.log('Sidebar: Checking active state', { 
        pathname, 
        href, 
        isExactMatch: pathname === href,
        isHomeMatch: href === '/' && pathname === '/',
        isNestedMatch: pathname.startsWith(href + '/')
      });
    }
    
    // Exact match for any path
    if (pathname === href) {
      return true;
    }
    
    // Special case for home page - only exact match
    if (href === '/') {
      return pathname === '/';
    }
    
    // For other pages, check if current path starts with href
    // This handles nested routes like /edit/123
    if (href !== '/' && pathname.startsWith(href)) {
      // Check if it's a true subpath or just a partial match
      // e.g., /edit should match /edit/123 but not /editor
      if (pathname === href || pathname.startsWith(href + '/')) {
        return true;
      }
    }
    
    return false;
  }
  
  // Define navigation items with required roles
  const navItems = [
    {
      name: 'Librarian',
      href: '/',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>`,
      requiredRole: 'visitor' // Accessible to visitors and above
    },
    {
      name: 'Documents',
      href: '/documents',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`,
      requiredRole: 'editor' // Editors and above
    },
    {
      name: 'Edit',
      href: '/edit',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>`,
      requiredRole: 'editor' // Editors and above
    },
    {
      name: 'Sites',
      href: '/sites',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>`,
      requiredRole: 'editor' // Editors and above
    },
    {
      name: 'Config',
      href: '/config',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`,
      requiredRole: 'librarian' // Librarians and above
    },
    {
      name: 'Activity',
      href: '/activity',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
      requiredRole: 'librarian' // Librarians and above
    },
    {
      name: 'Users',
      href: '/users',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>`,
      requiredRole: 'admin' // Admins and above
    },
    {
      name: 'Analytics',
      href: '/analytics',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
      requiredRole: 'admin' // Admins and above
    }
  ];
  
  // Get authentication status from auth store
  const isAuthenticated = $derived($authStore.isAuthenticated);
  const isLoading = $derived($authStore.isLoading);
</script>

<div class="h-full flex flex-col overflow-x-hidden">
  <nav class="p-3 {collapsed ? 'px-1' : ''} space-y-1">
    {#each navItems as item, i}
      {@const hasAccess = hasRequiredRole(item)}
      {@const active = isActive(item.href)}
      
      <!-- Debug output for each item -->
      {#if isDev}
        <div class="hidden">
          Item {i}: {item.name}, href: {item.href}, active: {active ? 'true' : 'false'}
        </div>
      {/if}
      
      <div class="relative group">
        <a
          href={hasAccess ? item.href : null}
          class="flex items-center px-2 py-2 text-xl font-medium rounded-md transition-all duration-300 
            {active 
              ? 'bg-primary text-white' 
              : 'text-primary-muted hover:bg-surface hover:text-primary'} 
            {!hasAccess ? 'opacity-50 cursor-not-allowed' : ''}"
          aria-disabled={!hasAccess}
          title={!hasAccess ? `You need ${item.requiredRole} role or higher to access this` : item.name}
          data-active={active}
          data-href={item.href}
        >
          <!-- Icon (always aligned left) -->
          <span class="w-6 h-6 flex-shrink-0" aria-hidden="true">
            {@html item.icon}
          </span>
          
          <!-- Label (hidden when collapsed with smooth transition) -->
          <span class="ml-3 {collapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} transition-all duration-300 overflow-hidden whitespace-nowrap flex items-center justify-between">
            <span>{item.name}</span>
            
            <!-- Lock icon for items user can't access -->
            {#if !hasAccess}
              <span class="text-xs text-primary-muted ml-auto">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </span>
            {/if}
          </span>
        </a>
        
        <!-- Tooltip for collapsed state -->
        {#if collapsed}
          <div class="absolute left-full ml-2 top-0 w-auto whitespace-nowrap bg-surface-3 text-primary-text px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 pointer-events-none">
            {item.name}
            {#if !hasAccess}
              <span class="block text-xs text-primary-muted">Requires {item.requiredRole} role</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </nav>

  {#if !collapsed}
    <div class="px-3 mt-6">
      <!-- Library Overview -->
      <div class="bg-surface rounded-lg p-3">
        <h3 class="text-xl font-medium text-primary mb-2 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Library Overview
        </h3>
        
        <div class="space-y-2 text-lg">
          <!-- Documents count -->
          <div class="flex justify-between items-center">
            <span class="text-primary-muted">Documents:</span>
            <span class="font-medium text-primary">{$page.data.stats?.documentsCount || 0}</span>
          </div>
          
          <!-- Collections count -->
          <div class="flex justify-between items-center">
            <span class="text-primary-muted">Collections:</span>
            <span class="font-medium text-primary">{$page.data.stats?.collectionsCount || 0}</span>
          </div>
        </div>
      </div>
      
      <!-- System Status -->
      <div class="bg-surface rounded-lg p-3 mt-4">
        <h3 class="text-xl font-medium text-primary mb-2 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          System Status
        </h3>
        
        <div class="space-y-2 text-lg">
          <!-- Authentication status -->
          <div class="flex justify-between items-center">
            <span class="text-primary-muted">Auth:</span>
            {#if isLoading}
              <span class="font-medium text-yellow-500 flex items-center gap-1">
                <span class="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
              </span>
            {:else if isAuthenticated}
              <span class="font-medium text-green-500 flex items-center gap-1">
                <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                Active
              </span>
            {:else}
              <span class="font-medium text-primary-muted flex items-center gap-1">
                <span class="inline-block w-2 h-2 rounded-full bg-gray-500"></span>
                Inactive
              </span>
            {/if}
          </div>
          
          <!-- Database status -->
          <div class="flex justify-between items-center">
            <span class="text-primary-muted">Database:</span>
            <span class="font-medium text-green-500 flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
              Connected
            </span>
          </div>
          
          <!-- API status -->
          <div class="flex justify-between items-center">
            <span class="text-primary-muted">API:</span>
            <span class="font-medium text-green-500 flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
              Online
            </span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<Shadow direction="right" />
