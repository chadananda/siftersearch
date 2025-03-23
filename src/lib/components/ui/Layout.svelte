<script>
  import Header from './header/Header.svelte';
  import Footer from './footer/Footer.svelte';
  import Sidebar from './sidebar/Sidebar.svelte';
  
  const { sidebarCollapsed, pageScrollable, default: children } = $props();
</script>

<div class="h-screen flex flex-col overflow-hidden">
  <!-- Header -->
  <header class="h-16 bg-surface-2 z-[100] relative isolate">
    <Header {sidebarCollapsed} />
  </header>

  <!-- Middle section with sidebar and main content -->
  <div class="flex-1 flex min-h-0">
    <!-- Sidebar -->
    <nav class="bg-surface-2 transition-all duration-300 z-40 relative isolate overflow-y-auto" style:width={sidebarCollapsed ? 'min(48px, 15vw)' : '256px'}>
      <Sidebar collapsed={sidebarCollapsed} />
    </nav>

    <!-- Main content -->
    <main class="flex-1" class:overflow-auto={pageScrollable}>
      {@render children?.()}
    </main>
  </div>

  <!-- Footer -->
  <footer class="h-16 bg-surface-2 z-40 relative isolate">
    <Footer />
  </footer>
</div>