<script>
  import { logout, getAuthState } from '../../lib/auth.svelte.js';
  import { performUpdate, getPWAState } from '../../lib/pwa.svelte.js';
  import ThemeToggle from '../ThemeToggle.svelte';
  import TierBadge from '../TierBadge.svelte';
  import AuthModal from '../AuthModal.svelte';

  // Props
  let { currentPage = 'search', showAboutModal = $bindable(false) } = $props();

  // App version
  const APP_VERSION = import.meta.env.PUBLIC_APP_VERSION || '0.0.1';
  const SHORT_VERSION = APP_VERSION.replace(/^0\./, '');

  // Auth and PWA state
  const auth = getAuthState();
  const pwa = getPWAState();

  // Local state
  let showAuthModal = $state(false);
  let showNavMenu = $state(false);
  let showUserDropdown = $state(false);

  // Close nav menu
  function closeNavMenu() {
    showNavMenu = false;
  }

  // Close user dropdown
  function closeUserDropdown() {
    showUserDropdown = false;
  }

  // Handle click outside to close dropdowns
  function handleClickOutside(event) {
    if (showUserDropdown && !event.target.closest('.user-menu-container')) {
      showUserDropdown = false;
    }
    if (showNavMenu && !event.target.closest('.nav-hamburger') && !event.target.closest('.nav-dropdown')) {
      showNavMenu = false;
    }
  }

  // Check if user is admin
  let isAdmin = $derived(auth.user?.tier === 'admin' || auth.user?.tier === 'superadmin');

  // Navigation items
  const navItems = [
    { href: '/', page: 'search', label: 'Search', icon: 'search', priority: 1 },
    { href: '/library', page: 'library', label: 'Library', icon: 'book', priority: 2 },
    { href: '/community', page: 'community', label: 'Community', icon: 'users', priority: 3 },
    { href: '/docs', page: 'docs', label: 'Docs', icon: 'file', priority: 4 }
  ];
</script>

<svelte:window onclick={handleClickOutside} />

<AuthModal bind:isOpen={showAuthModal} />

<header class="navbar">
  <div class="navbar-container">
    <!-- Logo and brand -->
    <a href="/" class="navbar-brand">
      <img src="/ocean.svg" alt="SifterSearch" class="navbar-logo" />
      <span class="navbar-title">
        <span class="title-full">SifterSearch</span>
        <span class="title-short">Sifter</span>
        {#if pwa.updateAvailable}
          <button class="version version-update" onclick={performUpdate} title="Click to update">UPDATE</button>
        {:else}
          <span class="version">v.{SHORT_VERSION}</span>
        {/if}
      </span>
    </a>

    <!-- Center section: Nav links that progressively collapse -->
    <nav class="navbar-nav" aria-label="Main navigation">
      <!-- Always visible nav links (priority 1-2) -->
      <a href="/" class="nav-link show-sm" class:active={currentPage === 'search'}>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span class="nav-label">Search</span>
      </a>
      <a href="/library" class="nav-link show-sm" class:active={currentPage === 'library'}>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span class="nav-label">Library</span>
      </a>

      <!-- Medium breakpoint nav links (priority 3) -->
      <a href="/community" class="nav-link show-md" class:active={currentPage === 'community'}>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span class="nav-label">Community</span>
      </a>

      <!-- Large breakpoint nav links (priority 4) -->
      <a href="/docs" class="nav-link show-lg" class:active={currentPage === 'docs'}>
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span class="nav-label">Docs</span>
      </a>

      <!-- Hamburger menu for collapsed items -->
      <div class="nav-hamburger">
        <button
          class="hamburger-btn"
          onclick={() => showNavMenu = !showNavMenu}
          aria-label="More navigation"
          aria-expanded={showNavMenu}
        >
          <svg class="hamburger-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if showNavMenu}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            {/if}
          </svg>
        </button>

        <!-- Dropdown for collapsed nav items -->
        {#if showNavMenu}
          <div class="nav-dropdown" role="menu">
            <!-- Only show items that are currently hidden -->
            <a href="/" class="nav-dropdown-item hide-above-sm" class:active={currentPage === 'search'} role="menuitem" onclick={closeNavMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Search
            </a>
            <a href="/library" class="nav-dropdown-item hide-above-sm" class:active={currentPage === 'library'} role="menuitem" onclick={closeNavMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Library
            </a>
            <a href="/community" class="nav-dropdown-item hide-above-md" class:active={currentPage === 'community'} role="menuitem" onclick={closeNavMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              Community
            </a>
            <a href="/docs" class="nav-dropdown-item hide-above-lg" class:active={currentPage === 'docs'} role="menuitem" onclick={closeNavMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Docs
            </a>
            <a href="/about" class="nav-dropdown-item" role="menuitem" onclick={closeNavMenu}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              About
            </a>
          </div>
        {/if}
      </div>
    </nav>

    <!-- Right side: Theme toggle + User menu (always visible) -->
    <div class="navbar-right">
      <ThemeToggle />

      {#if auth.isAuthenticated}
        <div class="user-menu-container">
          <button
            class="user-button"
            onclick={() => showUserDropdown = !showUserDropdown}
            aria-expanded={showUserDropdown}
            aria-haspopup="true"
          >
            <TierBadge />
            <span class="user-email">{auth.user?.email}</span>
            <svg class="dropdown-arrow" class:open={showUserDropdown} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {#if showUserDropdown}
            <div class="user-dropdown" role="menu">
              <a href="/profile" class="dropdown-item" role="menuitem" onclick={closeUserDropdown}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Profile
              </a>
              <a href="/settings" class="dropdown-item" role="menuitem" onclick={closeUserDropdown}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
              </a>
              <a href="/referrals" class="dropdown-item" role="menuitem" onclick={closeUserDropdown}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Referrals
              </a>
              <a href="/support" class="dropdown-item" role="menuitem" onclick={closeUserDropdown}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Support
              </a>
              {#if isAdmin}
                <div class="dropdown-divider"></div>
                <a href="/admin" class="dropdown-item admin-item" role="menuitem" onclick={closeUserDropdown}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Admin Panel
                </a>
              {/if}
              <div class="dropdown-divider"></div>
              <button class="dropdown-item signout-item" role="menuitem" onclick={() => { logout(); closeUserDropdown(); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <TierBadge />
        <button class="btn-primary" onclick={() => showAuthModal = true}>
          Sign In
        </button>
      {/if}
    </div>
  </div>
</header>

<style>
  .navbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--surface-0);
    border-bottom: 1px solid var(--border-default);
    backdrop-filter: blur(12px);
  }

  .navbar-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .navbar-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: inherit;
    flex-shrink: 0;
  }

  .navbar-logo {
    width: 2rem;
    height: 2rem;
  }

  .navbar-title {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    font-weight: 600;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .title-full { display: none; }
  .title-short { display: inline; }

  @media (min-width: 480px) {
    .title-full { display: inline; }
    .title-short { display: none; }
  }

  .version {
    font-size: 0.625rem;
    font-weight: 500;
    color: var(--text-muted);
    padding: 0.125rem 0.375rem;
    background: var(--surface-2);
    border-radius: 0.25rem;
    margin-left: 0.25rem;
  }

  .version-update {
    background: var(--accent-primary);
    color: white;
    cursor: pointer;
    border: none;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* Navigation section */
  .navbar-nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    justify-content: center;
  }

  .nav-link {
    display: none;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
  }

  .nav-link:hover {
    color: var(--text-primary);
    background: var(--hover-overlay);
  }

  .nav-link.active {
    color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  .nav-icon {
    width: 1rem;
    height: 1rem;
    stroke-width: 2;
  }

  .nav-label {
    display: none;
  }

  /* Progressive visibility for nav links */
  /* Small screens (640px+): Show priority 1-2 (Search, Library) */
  @media (min-width: 640px) {
    .nav-link.show-sm { display: flex; }
    .nav-label { display: inline; }
  }

  /* Medium screens (900px+): Show priority 3 (Community) */
  @media (min-width: 900px) {
    .nav-link.show-md { display: flex; }
  }

  /* Large screens (1100px+): Show priority 4 (Docs) */
  @media (min-width: 1100px) {
    .nav-link.show-lg { display: flex; }
  }

  /* Hamburger for collapsed items */
  .nav-hamburger {
    position: relative;
  }

  .hamburger-btn {
    padding: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: 0.5rem;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hamburger-btn:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .hamburger-icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  /* Nav dropdown for collapsed items */
  .nav-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    min-width: 160px;
    background: var(--surface-solid);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    padding: 0.5rem;
    z-index: 200;
  }

  .nav-dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-decoration: none;
    background: none;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .nav-dropdown-item:hover,
  .nav-dropdown-item.active {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .nav-dropdown-item.active {
    color: var(--accent-primary);
  }

  .nav-dropdown-item svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  /* Hide dropdown items that are visible in navbar */
  @media (min-width: 640px) {
    .nav-dropdown-item.hide-above-sm { display: none; }
  }

  @media (min-width: 900px) {
    .nav-dropdown-item.hide-above-md { display: none; }
  }

  @media (min-width: 1100px) {
    .nav-dropdown-item.hide-above-lg { display: none; }
  }

  /* Right side controls */
  .navbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* User menu */
  .user-menu-container {
    position: relative;
  }

  .user-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .user-button:hover {
    background: var(--surface-2);
    border-color: var(--border-strong);
  }

  .user-email {
    font-size: 0.75rem;
    color: var(--text-secondary);
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: none;
  }

  @media (min-width: 768px) {
    .user-email {
      display: block;
      max-width: 150px;
    }
  }

  .dropdown-arrow {
    width: 0.875rem;
    height: 0.875rem;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .dropdown-arrow.open {
    transform: rotate(180deg);
  }

  .user-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    min-width: 200px;
    background: var(--surface-solid);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    padding: 0.5rem;
    z-index: 200;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-decoration: none;
    background: none;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--hover-overlay);
    color: var(--text-primary);
  }

  .dropdown-item svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--border-default);
    margin: 0.375rem 0;
  }

  .admin-item {
    color: var(--accent-tertiary);
  }

  .admin-item:hover {
    color: var(--accent-tertiary);
    background: color-mix(in srgb, var(--accent-tertiary) 10%, transparent);
  }

  .signout-item {
    color: var(--error);
  }

  .signout-item:hover {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 10%, transparent);
  }

  /* Primary button */
  .btn-primary {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--accent-primary-text);
    background: var(--accent-primary);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background 0.15s ease;
    white-space: nowrap;
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }
</style>
