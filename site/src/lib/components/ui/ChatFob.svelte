<script>
  import Icon from './Icon.svelte';
  import { fade, fly } from 'svelte/transition';
  import Chat from './Chat.svelte';

  let showChat = false;
</script>

<!-- Floating Chat Button -->
<div class="fixed bottom-6 right-6 z-50">
  {#if showChat}
    <div
      class="absolute bottom-16 right-0 w-[400px] h-[600px] bg-surface rounded-lg shadow-lg overflow-hidden"
      transition:fly={{ y: 20, duration: 200 }}
    >
      <Chat />
    </div>
  {/if}

  <button
    on:click={() => showChat = !showChat}
    class="bg-accent hover:bg-accent/90 text-white rounded-full p-3 shadow-lg transition-colors"
    title={showChat ? 'Close Chat' : 'Open Chat'}
  >
    <Icon
      path={showChat 
        ? 'M6 18L18 6M6 6l12 12' 
        : 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z'}
      class="w-6 h-6"
    />
  </button>
</div>

<style>
  /* Add a subtle bounce animation when the chat opens/closes */
  button {
    transform-origin: center;
    transition: transform 0.2s;
  }
  
  button:hover {
    transform: scale(1.05);
  }
  
  button:active {
    transform: scale(0.95);
  }
</style>
