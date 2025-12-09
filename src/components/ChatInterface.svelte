<script>
  import { onMount } from 'svelte';
  import { search } from '../lib/api.js';

  let messages = $state([]);
  let input = $state('');
  let loading = $state(false);
  let searchMode = $state('hybrid'); // hybrid, keyword, semantic
  let inputEl;

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    input = '';
    messages = [...messages, { role: 'user', content: userMessage }];
    loading = true;

    try {
      const results = await search.query(userMessage, {
        mode: searchMode,
        limit: 10
      });

      if (results.hits && results.hits.length > 0) {
        // Format search results as a response
        const formattedResults = results.hits.map((hit, i) => {
          const text = hit._formatted?.text || hit.text || '';
          const title = hit.title || 'Untitled';
          const author = hit.author || 'Unknown';
          return `**${i + 1}. ${title}** - ${author}\n${text.substring(0, 300)}${text.length > 300 ? '...' : ''}`;
        }).join('\n\n');

        messages = [...messages, {
          role: 'assistant',
          content: `Found ${results.estimatedTotalHits || results.hits.length} results (${results.processingTimeMs}ms):\n\n${formattedResults}`,
          results: results.hits
        }];
      } else {
        messages = [...messages, {
          role: 'assistant',
          content: 'No results found. Try a different search query or check that Meilisearch is running.'
        }];
      }
    } catch (err) {
      console.error('Search error:', err);
      messages = [...messages, {
        role: 'assistant',
        content: `Search error: ${err.message}. Make sure the API server and Meilisearch are running.`,
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
      <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-teal-400 rounded-lg flex items-center justify-center">
        <span class="text-white font-bold text-sm">S</span>
      </div>
      <h1 class="text-lg font-semibold">SifterSearch</h1>
    </div>
    <nav class="flex items-center gap-4">
      <select
        bind:value={searchMode}
        class="text-sm bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-slate-300"
      >
        <option value="hybrid">Hybrid Search</option>
        <option value="keyword">Keyword Only</option>
        <option value="semantic">Semantic Only</option>
      </select>
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
        <div class="w-20 h-20 mb-6 bg-gradient-to-br from-blue-500/20 to-teal-400/20 rounded-2xl flex items-center justify-center">
          <span class="text-4xl font-bold bg-gradient-to-br from-blue-400 to-teal-300 bg-clip-text text-transparent">S</span>
        </div>
        <h2 class="text-2xl font-semibold mb-2">Explore Sacred Texts</h2>
        <p class="text-slate-400 max-w-md mb-8">
          Search across interfaith scriptures and scholarly works using AI-powered semantic search.
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          {#each ['What is the nature of the soul?', 'Compare creation stories', 'Teachings on compassion'] as suggestion}
            <button
              onclick={() => { input = suggestion; sendMessage(); }}
              class="text-sm px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-full transition-colors border border-slate-700/50"
            >
              {suggestion}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      {#each messages as message}
        <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl {message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800/90 text-slate-100 backdrop-blur-sm'} {message.error ? 'border border-red-500/50' : ''}">
            <p class="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          </div>
        </div>
      {/each}
      {#if loading}
        <div class="flex justify-start">
          <div class="px-4 py-3 rounded-2xl bg-slate-800/90 backdrop-blur-sm">
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
        placeholder="Search sacred texts..."
        disabled={loading}
        class="flex-1 px-4 py-3 bg-slate-800/80 border border-slate-700/50 rounded-xl focus:outline-none focus:border-blue-500/50 placeholder-slate-500 disabled:opacity-50 backdrop-blur-sm"
      />
      <button
        type="submit"
        disabled={!input.trim() || loading}
        class="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </form>
  </div>
</div>
