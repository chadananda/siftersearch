<script>
  import { marked } from 'marked';
  import { onMount } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let messageContainer;
  let inputMessage = '';
  let inputElement;
  let chatContainer;
  let totalDocs = 1234; // This will come from props later
  
  let messages = [
    {
      speaker: 'assistant',
      message: `# Greetings, I'm Jaffar your Sifter Librarian.

I have full conceptual access to over ${totalDocs} books and documents. I can search, summarize and compile by concept, title, author or any people or places mentioned in the library. I can assist you with:

- Finding specific documents and topics
- Explaining concepts and their relationships
- Compiling thematic summaries
- Tracking historical figures and places
- Answering questions about the library

How may I assist you today?`
    }
  ];

  onMount(() => {
    // Focus input on mount
    inputElement?.focus();
  });

  function handleSubmit() {
    if (!inputMessage.trim()) return;
    
    messages = [...messages, { speaker: 'user', message: inputMessage }];
    inputMessage = '';
    
    // Reset height after clearing
    inputElement.style.height = '2.75rem';
    
    // Re-focus input after sending
    setTimeout(() => inputElement?.focus(), 0);
    
    // Scroll to bottom
    setTimeout(() => {
      messageContainer?.scrollTo({
        top: messageContainer.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
    
    // Simulate assistant response
    setTimeout(() => {
      messages = [...messages, { 
        speaker: 'assistant', 
        message: "I'm processing your request. This is a placeholder response that will be replaced with actual AI responses." 
      }];
    }, 1000);
  }

  function handleKeydown(e) {
    // Ignore if typing in the textarea or if using modifier keys
    if (e.target === inputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    
    // Ignore if typing in another input or contenteditable
    if (e.target.matches('input, textarea, [contenteditable]')) return;

    // Focus the input for any printable character
    if (e.key.length === 1) {
      e.preventDefault();
      inputElement?.focus();
    }
  }

  function adjustTextareaHeight() {
    // Reset height to auto first to get the correct scrollHeight for shrinking
    inputElement.style.height = 'auto';
    // Set the height to scrollHeight to expand/shrink as needed
    const newHeight = Math.min(inputElement.scrollHeight, 128); // 8rem = 128px
    inputElement.style.height = `${newHeight}px`;
  }

  $: if (messageContainer && messages.length) {
    setTimeout(() => {
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }, 0);
  }
</script>

<div class="flex flex-col h-full" bind:this={chatContainer} on:keydown={handleKeydown}>
  <div 
    class="flex-1 overflow-y-auto p-6 space-y-6"
    role="log"
    aria-label="Chat messages"
    bind:this={messageContainer}
  >
    <div class="max-w-3xl mx-auto">
      {#each messages as message}
        {#if message.speaker === 'user'}
          <div class="flex justify-end mb-6">
            <div class="bg-blue-500 text-white rounded-2xl px-4 py-2 max-w-[80%] shadow-sm">
              <p>{message.message}</p>
            </div>
          </div>
        {:else}
          <div class="prose prose-sm dark:prose-invert max-w-none mb-4">
            {@html marked(message.message)}
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <div class="p-6 pt-0">
    <div class="max-w-3xl mx-auto">
      <div class="border-t border-subtle bg-surface-2 rounded-lg px-4 py-3">
        <form on:submit|preventDefault={handleSubmit} class="flex gap-2 items-center">
          <div class="flex-1">
            <textarea
              id="chat-input"
              rows="1"
              placeholder="Ask me anything about the library..."
              class="w-full resize-none bg-transparent border-none focus:outline-none text-text-primary placeholder-text-tertiary"
              bind:value={inputMessage}
              bind:this={inputElement}
              on:input={adjustTextareaHeight}
              on:keydown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            ></textarea>
          </div>
          <button
            type="submit"
            class="text-text-secondary hover:text-text-primary p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors h-11 flex-shrink-0"
            title="Send message"
          >
            <Icon path="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </button>
        </form>
      </div>
    </div>
  </div>
</div>

<style>
  /* Add Tailwind Typography styles for markdown */
  :global(.prose) {
    color: rgb(var(--text-primary));
  }

  :global(.prose strong) {
    color: rgb(var(--text-primary));
  }

  :global(.prose a) {
    color: #3b82f6;
  }

  :global(.prose h1) {
    color: rgb(var(--text-primary));
    font-weight: 700;
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }

  :global(.prose ul) {
    list-style-type: disc;
    padding-left: 1.5rem;
  }

  :global(.prose li) {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
  }

  :global(.prose p) {
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
  }

  textarea {
    transition: height 0.2s ease-in-out;
  }
  
  /* Hide scrollbar in WebKit browsers */
  textarea::-webkit-scrollbar {
    display: none;
  }
  
  /* Hide scrollbar in Firefox */
  textarea {
    scrollbar-width: none;
  }
</style>
