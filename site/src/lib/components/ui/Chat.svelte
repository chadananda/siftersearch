<script>
  import { marked } from 'marked';
  import { onMount, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();
  let totalDocs = 1234; // This will come from props later
  
  const initialMessage = {
    speaker: 'assistant',
    message: `# Greetings, I'm Jaffar your Sifter Librarian.

I have full conceptual access to over ${totalDocs.toLocaleString()} books and documents. I can search, summarize and compile by concept, title, author or any people or places mentioned in the library. I can assist you with:

- Finding specific documents and topics
- Explaining concepts and their relationships
- Compiling thematic summaries
- Tracking historical figures and places
- Answering questions about the library

How may I assist you today?`
  };

  let messages = [
    initialMessage,
    {
      speaker: 'user',
      message: "Could you help me find documents about the history of the Baha'i Faith in North America?"
    },
    {
      speaker: 'assistant',
      message: `I'll search through the library for relevant documents about the Baha'i Faith in North America. Here's what I found:

| Title | Author | Year | Type |
|-------|--------|------|------|
| Early Expansion of the Baha'i Faith in North America | Robert Stockman | 1995 | Book |
| The Baha'i Faith in America | William Garlington | 2005 | Academic |
| Green Acre and the Baha'i Faith | Anne Gordon Perry | 2018 | Article |
| Star of the West: Early American Baha'i Magazine | Various Authors | 1910-1935 | Periodical |

These documents provide comprehensive coverage of the early history and development of the Baha'i Faith in North America. Would you like me to summarize any of these sources?`
    },
    {
      speaker: 'user',
      message: "Could you show me a preview of the Green Acre article?"
    },
    {
      speaker: 'assistant',
      message: `## Green Acre and the Baha'i Faith
*by Anne Gordon Perry, 2018*

Green Acre Baha'i School, located in Eliot, Maine, stands as one of the most significant historical sites in the development of the Baha'i Faith in North America. Founded in 1894 by Sarah Farmer as a center for religious and philosophical discourse, Green Acre became a vital hub for the early American Baha'i community.

In 1912, 'Abdu'l-Bahá visited Green Acre during His historic journey to North America. His presence and talks at Green Acre marked a turning point in the institution's history. Speaking from the veranda of the Inn, He outlined a vision for Green Acre's future role in promoting unity and spiritual education.

**Key Points:**
- Established in 1894 as a conference center
- Hosted prominent speakers from various religious and philosophical traditions
- Site of 'Abdu'l-Bahá's historic visit in 1912
- Formally became a Baha'i institution in 1929

Would you like to know more about any specific aspect of Green Acre's history?`
    },
    {
      speaker: 'user',
      message: "What were some of 'Abdu'l-Bahá's key teachings during His visit to Green Acre?"
    },
    {
      speaker: 'assistant',
      message: `Based on the recorded talks from 'Abdu'l-Bahá's visit to Green Acre, here are the key themes He discussed:

## Unity of Humanity
'Abdu'l-Bahá emphasized the essential oneness of all people and the need to eliminate prejudices. He spoke about how Green Acre could become a model of racial harmony and international cooperation.

## Education
He stressed the importance of both spiritual and material education in human development:
- Integration of scientific and spiritual knowledge
- Character development as a foundation
- Universal education for all children
- Special emphasis on women's education

## Science and Religion
'Abdu'l-Bahá explained the harmony between scientific truth and religious belief:
- Religion must conform to science and reason
- Science without spiritual values can lead to materialism
- Both are necessary for human advancement

## Peace
His vision for universal peace included:
- Establishment of international cooperation
- Economic justice
- Elimination of extremes of wealth and poverty
- Universal auxiliary language

Would you like me to elaborate on any of these themes or explore other aspects of His teachings?`
    },
    {
      speaker: 'user',
      message: "Could you analyze the growth of the Baha'i Faith in North America between 1894-1912?"
    },
    {
      speaker: 'assistant',
      message: `# Growth Analysis: 1894-1912

Based on historical records, this period saw remarkable growth in the North American Baha'i community:

## Key Metrics

### Believers
- 1894: Less than 10
- 1912: Over 1,000
- Growth: 10,000%+

### Communities
- 1894: 1 city
- 1912: 32 cities
- Growth: 3,200%

### Publications
- 1894: 0 regular publications
- 1912: 3 regular publications
- Growth: 300%

## Timeline of Significant Events

1894: First Baha'i mention at World Parliament of Religions
1898: First Baha'i pilgrims from North America visit Akka
1902: Construction of House of Worship begun
1909: First Baha'i publication established
1912: Visit of 'Abdu'l-Bahá to North America

## Geographic Distribution (1912)
- Northeast: 40%
- Midwest: 35%
- West: 15%
- South: 10%

Would you like more detailed statistics about any particular aspect of this growth period?`
    },
    {
      speaker: 'user',
      message: "Tell me about the early Baha'i publications in North America"
    },
    {
      speaker: 'assistant',
      message: `# Early Baha'i Publications in North America

## Star of the West (1910-1935)
The most significant early Baha'i periodical in North America, originally named "Bahai News."

**Key Features:**
- First regular Baha'i periodical in the West
- Published in Chicago, Illinois
- Contained news, translations, and photographs
- Documented 'Abdu'l-Bahá's travels in North America

## Notable Articles from Star of the West:

| Issue | Date | Notable Content |
|-------|------|----------------|
| Vol. 1, No. 1 | March 21, 1910 | First publication of the periodical |
| Vol. 2, No. 1 | March 21, 1911 | Coverage of early American teachers |
| Vol. 3, No. 3 | April 28, 1912 | 'Abdu'l-Bahá's arrival in New York |
| Vol. 4, No. 1 | March 21, 1913 | Special issue on Green Acre |

## Other Early Publications:

1. **Reality Magazine (1919-1925)**
   - Published in New York
   - Focused on social and spiritual topics
   - Featured interfaith dialogue

2. **The Baha'i World (1925-present)**
   - International record of Baha'i activities
   - Published volumes every few years
   - Comprehensive documentation of growth

Would you like to explore any specific publication or time period in more detail?`
    }
  ];
  let input = ''; 
  let textarea;
  let messageContainer;
  let isMobile = false;
  let previousMessageCount = messages.length;
  let placeholder = "Ask me about the library";

  function updatePlaceholder() {
    placeholder = window.innerWidth >= 640 
      ? "Ask me anything about the library"
      : "Ask me about the library";
  }

  onMount(() => {
    document.documentElement.classList.add('chat-layout');
    checkMobile();
    updatePlaceholder();
    window.addEventListener('resize', () => {
      checkMobile();
      updatePlaceholder();
    });
    textarea?.focus();
    scrollToBottom();
    document.querySelector('.main-container')?.classList.add('no-container-scroll');
    return () => {
      document.documentElement.classList.remove('chat-layout');
      window.removeEventListener('resize', checkMobile);
      document.querySelector('.main-container')?.classList.remove('no-container-scroll');
    };
  });

  function checkMobile() {
    isMobile = window.innerWidth < 640;
  }

  function scrollToBottom() {
    if (messageContainer) {
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
  }

  $: {
    if (messageContainer && messages.length > previousMessageCount) {
      previousMessageCount = messages.length;
      scrollToBottom();
    }
  }

  function handleInput(event) {
    const textarea = event.target;
    textarea.style.height = '2.25rem';
    textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    if (input.trim()) {
      dispatch('message', { text: input.trim() });
      input = '';
      textarea.style.height = '2.25rem';
      setTimeout(() => textarea?.focus(), 0);
    }
  }
</script>

<div class="h-full flex flex-col relative isolate m-0 p-0">
  <div class="flex-1 overflow-y-auto m-0" bind:this={messageContainer}>
    {#each messages as message}
      {#if message.speaker === 'user'}
        <div class="relative mb-6 mr-5">
          <div class="flex justify-end">
            <div class="bg-accent text-accent p-4 rounded-2xl rounded-br-none max-w-[80%] sm:max-w-[70%] text-lg">
              {message.message}
            </div>
          </div>
        </div>
      {:else}
        <div class="relative mb-6 ml-5">
          <div class="flex">
            <div class="bg-surface-2 text-primary p-4 rounded-2xl rounded-bl-none max-w-[80%] sm:max-w-[70%] prose">
              {@html message.message}
            </div>
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <div class="flex gap-4 items-end p-4 bg-surface-2 border-t border-subtle">
    <textarea
      bind:this={textarea}
      bind:value={input}
      on:input={handleInput}
      on:keydown={handleKeyDown}
      placeholder="Ask me anything..."
      class="flex-1 bg-transparent border-none resize-none text-2xl focus:outline-none focus:ring-0 p-0 m-0 text-primary placeholder:text-primary/50"
      rows="1"
    />
    <button
      class="shrink-0 p-2 rounded-xl bg-accent text-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      on:click={handleSubmit}
      disabled={!input.trim()}
    >
      <div class="w-6 h-6">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </div>
    </button>
  </div>
</div>

<style>
  /* Chat layout */
  :global(.chat-layout) {
    @apply h-screen flex flex-col overflow-hidden;
  }

  :global(.chat-layout > header) {
    @apply flex-shrink-0;
  }

  :global(.chat-layout > main) {
    @apply flex-1 overflow-hidden relative;
  }

  :global(.chat-layout > footer) {
    @apply flex-shrink-0;
  }

  /* Prose styles for chat messages */
  :global(.prose) {
    @apply text-primary max-w-none;
  }

  :global(.prose strong) {
    @apply text-primary font-semibold;
  }

  :global(.prose a) {
    @apply text-accent;
  }

  :global(.prose h1) {
    @apply text-primary font-bold text-2xl mt-0 mb-4;
  }

  :global(.prose h2) {
    @apply text-primary font-semibold text-xl mt-6 mb-3;
  }

  :global(.prose ul) {
    @apply list-disc pl-6;
  }

  :global(.prose li) {
    @apply my-1;
  }

  :global(.prose p) {
    @apply my-3;
  }

  :global(.prose table) {
    @apply w-full my-4 border-collapse bg-surface;
  }

  :global(.prose th) {
    @apply bg-surface-3 border-b border-subtle p-2 text-left font-medium;
  }

  :global(.prose td) {
    @apply p-2 border-b border-subtle;
  }

  :global(.prose tr:hover) {
    @apply bg-surface-3;
  }

  textarea {
    @apply transition-[height] duration-200 ease-in-out min-h-[3rem];
  }

  textarea::-webkit-scrollbar {
    @apply w-0;
  }

  textarea::placeholder {
    @apply opacity-50;
  }

  /* Chat container */
  .messages-container {
    @apply h-full overflow-y-auto px-4 py-6;
    scroll-behavior: smooth;
  }

  .messages-container::-webkit-scrollbar {
    @apply w-2;
  }

  .messages-container::-webkit-scrollbar-track {
    @apply bg-transparent;
  }

  .messages-container::-webkit-scrollbar-thumb {
    @apply bg-[var(--text)]/10 rounded-full hover:bg-[var(--text)]/20;
  }
</style>
