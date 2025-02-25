<script>
  import '../app.css';
  import Header from '$lib/components/ui/header/Header.svelte';
  import Footer from '$lib/components/ui/footer/Footer.svelte';
  import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';
  import { browser } from '$app/environment';
  import { ClerkProvider } from 'svelte-clerk';

  let sidebarCollapsed = false;

  // Initialize from localStorage if available
  if (browser) {
    const stored = localStorage.getItem('sidebarCollapsed');
    if (stored) {
      sidebarCollapsed = JSON.parse(stored);
    }
  }

  // Watch for changes and save to localStorage
  $: if (browser && sidebarCollapsed !== undefined) {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }

  function handleSidebarCollapsed(event) {
    sidebarCollapsed = event.detail;
  }

  // Get Clerk key from environment
  const publishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;
</script>

<ClerkProvider publishableKey={publishableKey}>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="h-16 bg-surface-2 z-[100] relative isolate">
      <Header {sidebarCollapsed} on:sidebarCollapsed={handleSidebarCollapsed} />
    </header>

    <!-- Middle section with sidebar and main content -->
    <div class="flex-1 flex min-h-0">
      <!-- Sidebar -->
      <nav class="bg-surface-2 transition-all duration-300 z-40 relative isolate overflow-y-auto" style:width={sidebarCollapsed ? 'min(48px, 15vw)' : '256px'}>
        <Sidebar collapsed={sidebarCollapsed} />
      </nav>

      <!-- Main content -->
      <main class="flex-1 overflow-auto" style="margin-left: 0;">
        <slot />
      </main>
    </div>

    <!-- Footer -->
    <footer class="h-16 bg-surface-2 z-40 relative isolate">
      <Footer />
    </footer>
  </div>
</ClerkProvider>

<style>
  /* Only keep scrollbar styling here since it's global and layout-specific */
  :global(*::-webkit-scrollbar) {
    width: 4px;
  }

  :global(*::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(*::-webkit-scrollbar-thumb) {
    background-color: var(--text-tertiary);
    border-radius: 2px;
  }

  :global(*) {
    scrollbar-width: thin;
    scrollbar-color: var(--text-tertiary) transparent;
  }
</style>
