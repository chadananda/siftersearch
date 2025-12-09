<script>
  import { onMount } from 'svelte';

  let messages = $state([]);
  let input = $state('');
  let loading = $state(false);
  let inputEl;

  const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    input = '';
    messages = [...messages, { role: 'user', content: userMessage }];
    loading = true;

    try {
      // TODO: Implement actual search/chat API call
      // For now, show a placeholder response
      await new Promise(resolve => setTimeout(resolve, 500));
      messages = [...messages, {
        role: 'assistant',
        content: 'Search functionality coming soon. This will connect to the Meilisearch backend for hybrid semantic + keyword search across interfaith texts.'
      }];
    } catch (err) {
      messages = [...messages, {
        role: 'assistant',
        content: 'Sorry, an error occurred. Please try again.',
        error: true
      }];
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  onMount(() => {
    inputEl?.focus();
  });
</script>

<div class="flex flex-col h-screen">
  <!-- Header -->
  <header class="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
    <div class="flex items-center gap-3">
      <img src="/logo.svg" alt="SifterSearch" class="w-8 h-8" />
      <h1 class="text-lg font-semibold">SifterSearch</h1>
    </div>
    <nav class="flex items-center gap-4">
      <button class="text-sm text-slate-400 hover:text-white transition-colors">
        About
      </button>
      <button class="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md transition-colors">
        Sign In
      </button>
    </nav>
  </header>

  <!-- Messages area -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if messages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center px-4">
        <img src="/logo.svg" alt="" class="w-16 h-16 mb-6 opacity-60" />
        <h2 class="text-2xl font-semibold mb-2">Explore Sacred Texts</h2>
        <p class="text-slate-400 max-w-md mb-8">
          Search across interfaith scriptures and scholarly works using AI-powered semantic search.
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          {#each ['What is the nature of the soul?', 'Compare creation stories', 'Teachings on compassion'] as suggestion}
            <button
              onclick={() => { input = suggestion; sendMessage(); }}
              class="text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
            >
              {suggestion}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      {#each messages as message}
        <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[80%] md:max-w-[60%] px-4 py-3 rounded-2xl {message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-100'} {message.error ? 'border border-red-500/50' : ''}">
            <p class="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      {/each}
      {#if loading}
        <div class="flex justify-start">
          <div class="px-4 py-3 rounded-2xl bg-slate-800">
            <div class="flex gap-1">
              <span class="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
              <span class="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
              <span class="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Input area -->
  <div class="p-4 border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
    <form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="flex gap-3 max-w-3xl mx-auto">
      <input
        bind:this={inputEl}
        bind:value={input}
        onkeydown={handleKeydown}
        placeholder="Ask about sacred texts..."
        disabled={loading}
        class="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 placeholder-slate-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!input.trim() || loading}
        class="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </form>
  </div>
</div>
