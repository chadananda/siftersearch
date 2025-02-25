<script>
  import { onMount, afterUpdate, createEventDispatcher } from 'svelte';
  import { marked } from 'marked';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';

  export let messages = [];
  let messageContainer;
  let textarea;
  let input = '';
  let isMobile = false;
  let previousMessageCount = 0;
  const dispatch = createEventDispatcher();

  function cleanMathInput(text) {
    // Remove any problematic characters
    return text.replace(/[\f\v\u0000-\u0008\u000b-\u001f]/g, '')
              .trim();
  }

  function renderKaTeX(math, displayMode = false) {
    try {
      const cleanMath = cleanMathInput(math);
      return katex.renderToString(cleanMath, {
        displayMode,
        throwOnError: false,
        strict: false
      });
    } catch (e) {
      console.error('KaTeX error:', e);
      return `<code>${math}</code>`;
    }
  }

  function parseMarkdown(text) {
    // First pass: Extract and replace math blocks
    let mathBlocks = [];
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
      mathBlocks.push(renderKaTeX(math, true));
      return `@@MATH_BLOCK_${mathBlocks.length - 1}@@`;
    });

    // Handle inline math
    text = text.replace(/\$([^\$]+?)\$/g, (match, math) => {
      return renderKaTeX(math, false);
    });

    // Configure marked
    const renderer = new marked.Renderer();
    
    // Set basic options
    marked.setOptions({
      renderer,
      gfm: true,
      breaks: true,
      sanitize: false,
      smartLists: true,
      smartypants: true
    });

    // Convert markdown to HTML
    let html = marked(text);

    // Restore math blocks
    html = html.replace(/@@MATH_BLOCK_(\d+)@@/g, (match, index) => {
      return mathBlocks[parseInt(index)];
    });

    return html;
  }

  function handleInput(event) {
    const target = event.target;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    if (!input.trim()) return;

    const text = input;
    input = '';
    textarea.style.height = '48px';
    
    dispatch('message', { text });
  }

  function scrollToBottom() {
    if (messageContainer) {
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  }

  function checkMobile() {
    isMobile = window.innerWidth < 640;
  }

  onMount(() => {
    window.addEventListener('resize', checkMobile);
    textarea?.focus();
    scrollToBottom();
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  });

  afterUpdate(() => {
    scrollToBottom();
  });

  $: {
    if (messages.length > previousMessageCount) {
      scrollToBottom();
      previousMessageCount = messages.length;
    }
  }
</script>

<div class="h-full flex flex-col bg-surface">
  <div class="flex-1 overflow-y-auto" bind:this={messageContainer}>
    <div class="px-4 py-6">
      {#each messages as message}
        {#if message.speaker === 'user'}
          <div class="relative mb-6 mr-5">
            <div class="flex justify-end">
              <div class="bg-accent text-accent-content p-4 rounded-2xl rounded-br-none max-w-[80%] sm:max-w-[70%] text-lg whitespace-pre-wrap">
                {message.message}
              </div>
            </div>
          </div>
        {:else if message.speaker === 'assistant'}
          <div class="relative mb-6">
            <div class="flex">
              <div class="text-primary max-w-full markdown-content">
                {@html parseMarkdown(message.message)}
              </div>
            </div>
          </div>
        {:else}
          <div class="relative mb-6">
            <div class="flex">
              <div class="text-primary max-w-full markdown-content">
                {@html parseMarkdown(message.message)}
              </div>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <div class="flex-none bg-surface-2 border-t border-subtle">
    <div class="flex gap-4 items-end p-4">
      <textarea
        bind:this={textarea}
        bind:value={input}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        placeholder="Ask me anything..."
        class="flex-1 h-12 bg-surface-3 border-none resize-none text-lg text-primary focus:outline-none focus:ring-0 p-3 m-0 placeholder:text-primary/50 rounded-xl"
        rows="1"
      ></textarea>
      <button
        class="shrink-0 p-2 rounded-xl bg-accent text-accent-content hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity sm:hidden"
        onclick={handleSubmit}
        disabled={!input.trim()}
        aria-label="Send message"
      >
        <div class="w-6 h-6">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </div>
      </button>
    </div>
  </div>
</div>

<style>
  :global(.markdown-content table) {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
  }

  :global(.markdown-content th),
  :global(.markdown-content td) {
    border: 1px solid var(--border-subtle);
    padding: 0.5em;
    text-align: left;
  }

  :global(.markdown-content th) {
    background-color: var(--surface-2);
    font-weight: 600;
  }

  :global(.markdown-content tr:nth-child(even)) {
    background-color: var(--surface-2);
  }

  :global(.markdown-content tr:hover) {
    background-color: var(--surface-3);
  }

  :global(.markdown-content) {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
  }

  :global(.markdown-content pre) {
    margin: 1em 0;
    padding: 1em;
    background-color: var(--surface-2);
    border-radius: 0.5em;
    overflow-x: auto;
  }

  :global(.markdown-content code) {
    background-color: var(--surface-2);
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
    font-size: 0.9em;
  }

  :global(.markdown-content pre code) {
    background-color: transparent;
    padding: 0;
    border-radius: 0;
  }

  :global(.markdown-content blockquote) {
    border-left: 4px solid var(--border-subtle);
    margin: 1em 0;
    padding: 0.5em 1em;
    background-color: var(--surface-2);
  }

  :global(.markdown-content h1) {
    font-size: 2.5rem;
    line-height: 1.2;
    font-weight: 800;
    margin: 2rem 0 1.5rem;
    color: var(--text-primary);
    letter-spacing: -0.025em;
  }

  :global(.markdown-content h2) {
    font-size: 2rem;
    line-height: 1.3;
    font-weight: 700;
    margin: 2rem 0 1rem;
    color: var(--text-primary);
    letter-spacing: -0.025em;
  }

  :global(.markdown-content h3) {
    font-size: 1.5rem;
    line-height: 1.4;
    font-weight: 600;
    margin: 1.5rem 0 1rem;
    color: var(--text-primary);
  }

  :global(.markdown-content h4) {
    font-size: 1.25rem;
    line-height: 1.5;
    font-weight: 600;
    margin: 1.5rem 0 1rem;
    color: var(--text-primary);
  }

  :global(.markdown-content h5) {
    font-size: 1.1rem;
    line-height: 1.5;
    font-weight: 600;
    margin: 1.5rem 0 1rem;
    color: var(--text-primary);
  }

  :global(.markdown-content h6) {
    font-size: 1rem;
    line-height: 1.5;
    font-weight: 600;
    margin: 1.5rem 0 1rem;
    color: var(--text-primary);
  }

  :global(.markdown-content p) {
    margin: 1em 0;
    line-height: 1.6;
  }

  :global(.markdown-content ul),
  :global(.markdown-content ol) {
    margin: 1em 0;
    padding-left: 2em;
  }

  :global(.markdown-content li) {
    margin: 0.5em 0;
    line-height: 1.6;
  }

  :global(.katex) {
    font-size: 1.1em;
  }

  :global(.katex-display) {
    margin: 1em 0;
    overflow-x: auto;
    overflow-y: hidden;
  }
</style>
