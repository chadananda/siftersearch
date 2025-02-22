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
    console.log('Key pressed:', e.key);
    
    // Ignore if typing in an input or using modifier keys
    if (e.target.matches('input, textarea, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) {
      console.log('Ignoring due to target or modifier');
      return;
    }

    // Focus the chat input for any printable character
    if (e.key.length === 1) {
      console.log('Attempting to focus chat input');
      const chatInput = document.querySelector('#chat-input');
      if (chatInput) {
        e.preventDefault();
        chatInput.focus();
        console.log('Chat input focused');
      } else {
        console.log('Chat input not found');
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="min-h-screen bg-surface text-text-primary" >
  <header class="fixed top-0 left-0 right-0 h-16 bg-surface-2 backdrop-blur-md z-50 header-shadow">
    <Header on:toggleSidebar={handleSidebarToggle} sidebarCollapsed={$sidebarCollapsed} />
  </header>

  <div class="flex min-h-screen pt-16 pb-16">
    <aside class="fixed left-0 top-16 bottom-16 bg-surface-2 backdrop-blur-md z-40 transition-all duration-300 ease-in-out overflow-hidden sidebar-shadow"
           class:collapsed={$sidebarCollapsed}>
      <Sidebar 
        collapsed={$sidebarCollapsed}
        on:toggleCollapse={handleSidebarToggle}
      />
    </aside>

    <main class="flex-1 transition-all duration-300 ease-in-out h-[calc(100vh-8rem)]" class:collapsed={$sidebarCollapsed}>
      <slot />
    </main>
  </div>

  <ChatFob />

  <footer class="fixed bottom-0 left-0 right-0 h-16 bg-surface-2 backdrop-blur-md z-50 footer-shadow">
    <Footer />
  </footer>
</div>

<style>
  :global(body) {
    min-height: 100vh;
  }
</style>
