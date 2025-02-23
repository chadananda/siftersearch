<script>
  import '../app.css';
  import Header from '$lib/components/ui/Header.svelte';
  import Sidebar from '$lib/components/ui/Sidebar.svelte';
  import Footer from '$lib/components/ui/Footer.svelte';
  import ChatFob from '$lib/components/ui/ChatFob.svelte';
  import { browser } from '$app/environment';
  import { writable } from 'svelte/store';

  const sidebarCollapsed = writable(false);
  
  // Subscribe to changes and save to localStorage
  if (browser) {
    sidebarCollapsed.subscribe(value => {
      localStorage.setItem('sidebarCollapsed', value);
    });
  }

  function handleSidebarToggle() {
    sidebarCollapsed.update(v => !v);
  }

  function handleKeydown(e) {
    // Ignore if typing in an input or using modifier keys
    if (e.target.matches('input, textarea, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // Focus the chat input for any printable character
    if (e.key.length === 1) {
      const chatInput = document.querySelector('#chat-input');
      if (chatInput) {
        e.preventDefault();
        chatInput.focus();
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="min-h-screen bg-surface text-text-primary">
  <div class="fixed top-0 left-0 right-0 h-16 bg-surface-2 backdrop-blur-md z-50 header-shadow">
    <Header on:toggleSidebar={handleSidebarToggle} sidebarCollapsed={$sidebarCollapsed} />
  </div>

  <div class="pt-16">
    <aside class="fixed left-0 top-16 h-[calc(100vh-4rem)] bg-surface-2 transition-all duration-300 z-40 sidebar-shadow overflow-y-auto {$sidebarCollapsed ? 'w-16' : 'w-64'}">
      <Sidebar collapsed={$sidebarCollapsed} />
    </aside>
    <main class="transition-all duration-300 min-h-screen {$sidebarCollapsed ? 'ml-16' : 'ml-64'}">
      <slot />
    </main>
  </div>

  <ChatFob />
  <Footer />
</div>

<style>
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
