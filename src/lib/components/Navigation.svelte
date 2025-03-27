<!--
  Navigation Component
  
  Displays the main navigation with role-based access control.
  All links are shown, but disabled when the user doesn't have the required role.
-->
<script>
  import { page } from '$app/stores';
  import { userHasRole, userRole } from '$lib/client/auth.js';
  import { browser } from '$app/environment';
  
  // Development mode detection
  const isDev = browser && import.meta.env.DEV;
  
  // Define navigation items with their paths and required roles
  const navItems = [
    { label: 'Home', path: '/', role: null }, // Accessible to everyone
    { label: 'Documents', path: '/documents', role: 'subscriber' },
    { label: 'Edit', path: '/edit', role: 'editor' },
    { label: 'Analytics', path: '/analytics', role: 'librarian' },
    { label: 'Sites', path: '/sites', role: 'admin' },
    { label: 'Users', path: '/users', role: 'admin' },
    { label: 'Config', path: '/config', role: 'admin' },
    { label: 'Activity', path: '/activity', role: 'visitor' } // Changed to visitor so it's accessible
  ];
  
  // Determine if a link should be active
  function isActive(path) {
    return $page.url.pathname === path || 
           ($page.url.pathname !== '/' && $page.url.pathname.startsWith(path) && path !== '/');
  }
  
  // Subscribe to user role for reactivity
  let currentRole = 'anonymous';
  $: if ($page.data.user) {
    currentRole = $page.data.user.role;
  }
</script>

<nav class="main-navigation">
  {#if isDev}
    <div class="dev-mode-indicator">DEV MODE</div>
  {/if}
  <ul>
    {#each navItems as item}
      {@const hasAccess = isDev || item.role === null || userHasRole($page.data.user, item.role)}
      <li class:active={isActive(item.path)} class:disabled={!hasAccess}>
        {#if hasAccess}
          <a href={item.path}>
            {item.label}
            {#if isDev && item.role && item.role !== 'visitor' && item.role !== null}
              <span class="role-badge">{item.role}</span>
            {/if}
          </a>
        {:else}
          <!-- Show link but make it non-clickable with tooltip -->
          <span title="You don't have permission to access this area" class="disabled-link">
            {item.label}
            <span class="role-badge">{item.role}</span>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</nav>

<style>
  .main-navigation {
    background-color: var(--surface-2);
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    margin-bottom: 1rem;
    position: relative;
  }
  
  .dev-mode-indicator {
    position: absolute;
    top: -1.5rem;
    right: 0;
    background-color: #8b5cf6;
    color: white;
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem 0.25rem 0 0;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  ul {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0;
    gap: 1rem;
  }
  
  li {
    position: relative;
  }
  
  li.active a, 
  li.active span {
    font-weight: bold;
    color: var(--primary);
  }
  
  a {
    color: var(--text);
    text-decoration: none;
    padding: 0.5rem;
    border-radius: 0.25rem;
    transition: background-color 0.2s, color 0.2s;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  
  a:hover {
    background-color: var(--surface-3);
    color: var(--primary);
  }
  
  .disabled-link {
    color: var(--text-tertiary);
    padding: 0.5rem;
    cursor: not-allowed;
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  
  li.disabled {
    position: relative;
  }
  
  li.disabled::after {
    content: '🔒';
    font-size: 0.7rem;
    position: absolute;
    top: 0;
    right: -0.5rem;
  }
  
  .role-badge {
    font-size: 0.6rem;
    background-color: var(--surface-3);
    color: var(--text-tertiary);
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-weight: normal;
  }
</style>
