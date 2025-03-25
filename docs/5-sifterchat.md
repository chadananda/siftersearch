# 5. SifterChat Web Component

## Overview

SifterChat is a sophisticated voice and text-enabled AI assistant built as a web component. It provides a floating chat interface that combines modern visual design with powerful conversational capabilities powered by Ultravox.ai. The component offers seamless voice interaction with real-time transcription, visualization, and tool integration.

The SifterChat interface features:
- A minimized "fob" state that floats in the corner of the screen
- An expanded chat interface with message history
- Real-time voice visualization during speech
- Typing capability with smart suggestions
- Tool execution with visual feedback
- Adaptive theming for light/dark modes

This document outlines how to integrate this existing component into the SifterSearch platform while configuring its personality and tool access.

## Agent-Friendly API Platform

SifterSearch serves as a powerful backend for AI assistants like SifterChat:

### Structured API for AI Consumption

- **Consistent Response Formats**: All API responses follow a standardized format optimized for LLMs
- **Context-Aware Retrieval**: Endpoints that understand and maintain conversation context
- **Metadata-Rich Responses**: All search results include comprehensive metadata and attribution
- **Pagination and Filtering**: Built-in support for refining large result sets

### Tool Integration

- **Function Calling Interface**: Standardized interface for AI agents to invoke platform capabilities
- **Specialized Endpoints**: Purpose-built endpoints for different agent capabilities
- **Authentication and Rate Limiting**: Secure access control for agent operations
- **Error Handling**: Consistent error formats with helpful recovery suggestions

### SifterChat Integration

- **Seamless Access**: Direct access to document collections through the API
- **Personality-Based Interaction**: Configurable personalities with different expertise areas
- **Role-Specific Tool Access**: Tools available based on user roles and permissions
- **Context Preservation**: Maintaining conversation context across interactions

## Integration Approach

### Dual Development/Distribution Model

The key insight for SifterChat integration is utilizing Svelte's automatic web component compilation to achieve two goals simultaneously:

1. **Native Development**: Develop SifterChat as a standard Svelte component within the SvelteKit application
2. **Automatic Distribution**: Leverage Svelte's compilation to generate the standalone web component

This approach means:
- No separate development environment needed
- Continuous testing of the web component functionality
- Immediate validation of changes
- Single source of truth for the component

### Component Placement

The SifterChat component will be placed within the standard SvelteKit structure:
```
/siftersearch/                  # Project root
├── src/                        # SvelteKit source directory
│   ├── lib/                    # Shared libraries and components
│   │   ├── components/         # UI components
│   │   │   └── chat/           # Chat components
│   │   │       └── SifterChat.svelte  # Main component
│   │   │       └── ChatMessage.svelte # Message component
│   │   │       └── VoiceVisualizer.svelte # Voice visualization
│   │   │
│   │   ├── server/             # Server-only code
│   │   │   └── chat/           # Chat server utilities
│   │   │       └── ultravox.js # Enhanced API integration
│   │   │       └── personalities.js # Personality loader
│   │   │
│   │   └── utils/              # Utility functions
│   │       └── chat/           # Chat-specific utilities
│   │
│   ├── routes/                 # SvelteKit routes
│   │   ├── api/                # API endpoints
│   │   │   └── chat/           # Chat API
│   │   │       └── +server.js  # Chat endpoint with role-based access
│   │   │
│   │   └── chat/               # Chat UI routes
│   │       └── +page.svelte    # Chat interface page
│   │       └── +page.server.js # Server-side chat logic
│   │
│   └── static/                 # Static assets
│       └── chatbot/            # Compiled web component output
│
└── config/                     # Configuration
    └── personalities/          # Chatbot personality configurations
        ├── default.js
        ├── librarian.js
        ├── researcher.js
        └── educator.js
```

## Chatbot Personality System

### Personality Configuration

The personality of SifterChat is defined through detailed configuration files that shape its tone, knowledge focus, and interaction style. Each configuration file includes:

```javascript
// /config/personalities/librarian.js
export default {
  // Core identity
  name: "Librarian",
  role: "I am a knowledgeable librarian assistant for the SifterSearch platform",
  expertise: ["library science", "document management", "research methodology", "information organization"],

  // Tone and communication style
  tone: {
    formality: 0.7,        // 0-1 scale (informal to formal)
    warmth: 0.8,           // 0-1 scale (clinical to warm)
    enthusiasm: 0.6,        // 0-1 scale (reserved to enthusiastic)
    humor: 0.3,            // 0-1 scale (serious to humorous)
    patience: 0.9          // 0-1 scale (direct to patient)
  },

  // Response characteristics
  responseStyle: {
    verbosity: 0.6,         // 0-1 scale (concise to verbose)
    structurePreference: "organized", // "conversational", "organized", "academic"
    exampleFrequency: 0.7,  // 0-1 scale (rarely to frequently uses examples)
    technicalLevel: 0.5     // 0-1 scale (simplified to technical)
  },

  // Conversation management
  conversationStyle: {
    initiatesTopics: 0.4,    // 0-1 scale (responsive to proactive)
    followUpQuestions: 0.7,  // 0-1 scale (rarely to frequently asks follow-ups)
    conversationalContinuity: 0.8, // 0-1 scale (discrete to continuous conversations)
    interruptibility: 0.6    // 0-1 scale (completes thoughts to allows interruption)
  },

  // Decision-making characteristics
  decisionMaking: {
    certainty: 0.7,          // 0-1 scale (tentative to confident)
    thoroughness: 0.9,       // 0-1 scale (quick to thorough)
    creativity: 0.5,         // 0-1 scale (conventional to creative)
    risktaking: 0.3          // 0-1 scale (cautious to risk-taking)
  },

  // Knowledge and focus areas
  knowledgeFocus: {
    primary: ["document organization", "metadata management", "collection development"],
    secondary: ["research methods", "digital archiving", "knowledge classification"],
    avoids: ["technical implementation details", "system administration"]
  },

  // Ethical guidelines
  ethics: {
    primaryValues: ["accuracy", "accessibility", "privacy", "intellectual freedom"],
    boundaries: [
      "Does not share personal data between users",
      "Respects copyright and intellectual property",
      "Acknowledges limitations in specialized domains",
      "Directs to human expertise for complex legal or medical questions"
    ]
  },

  // Detailed personality description
  personalityDescription: `As a Librarian assistant, I embody the helpful, organized nature of a skilled librarian. I approach conversations with warmth and patience, prioritizing accuracy and thoroughness in my responses. I'm knowledgeable about document management, metadata, and information organization, and I take pride in helping users find, organize, and understand their content.

I communicate in a moderately formal tone that remains approachable and conversational. I use clear structure in my responses, especially when explaining complex topics, and provide examples to illustrate concepts when helpful. While I'm confident in my expertise areas, I readily acknowledge limitations and avoid speculation.

In conversations, I primarily respond to user queries rather than steering the discussion, though I'll ask clarifying questions to ensure I understand needs correctly. I maintain conversation context well, remembering previous interactions within a session to provide continuity.

I value intellectual freedom and privacy, never judging users' research interests while maintaining appropriate boundaries around sensitive information. I'm particularly helpful with organizing information, suggesting classification approaches, and improving document metadata.`,

  // Example interactions demonstrating personality
  exampleInteractions: [
    {
      user: "I have about 200 PDFs about climate science that need organizing. Can you help?",
      assistant: "I'd be happy to help organize your climate science documents. With a collection that size, we should start with a good metadata structure. Would you like to create a classification system based on sub-topics like atmospheric science, ocean systems, etc., or would you prefer a chronological approach? I can also suggest ways to extract and standardize author information and publication dates to improve searchability."
    },
    {
      user: "What's the best way to tag these documents?",
      assistant: "For climate science documents, I'd recommend a multi-faceted tagging system that includes:\n\n1. Subject categories (e.g., sea level rise, carbon sequestration, climate modeling)\n2. Document type (research paper, review, policy brief, data report)\n3. Geographic focus when applicable\n4. Time period covered\n5. Key methodologies used\n\nThis approach gives you flexibility when searching later. Would you like me to suggest some specific subject tags based on common climate science taxonomy systems?"
    }
  ],

  // System prompt generation template
  systemPromptTemplate: `You are {{name}}, {{role}}. {{personalityDescription}}

You have access to the SifterSearch system which contains a comprehensive library of documents, books, and research materials. You can help users search, organize, and understand this content.

When helping users, remember:
1. Your primary goal is to assist with library and document management
2. Maintain the conversational style described in your personality
3. Use the available tools appropriately to find information
4. Always provide accurate information and cite sources when available
5. If you don't know something, acknowledge limitations rather than speculating

Follow these ethical guidelines: {{ethics.boundaries}}

{{additionalInstructions}}`
};
```

### Available Personalities

The system includes several personality configurations:

1. **Librarian** - Helpful, organized, knowledgeable about document management
2. **Researcher** - Analytical, thorough, focused on critical evaluation of sources
3. **Educator** - Approachable, patient, skilled at explaining complex concepts
4. **Default** - Balanced, versatile assistant with general knowledge focus

### Personality Selection

The personality is selected based on:
1. The library context (ocean, javascript, etc.)
2. The implementation environment (admin interface vs external site)
3. Explicit configuration when embedding the component
4. The user's role in the system

The selection process:
```javascript
// src/lib/server/chat/personalities.js
export const getPersonalityForContext = async (libraryId, userInfo) => {
  const { role } = userInfo;
  
  // Library-specific personality if available
  const libraryPersonality = await getLibraryPersonality(libraryId);
  if (libraryPersonality) return libraryPersonality;

  // Role-based personality selection
  switch (role) {
    case 'SuperUser':
    case 'Librarian':
      return loadPersonality('librarian');
    case 'Editor':
      return loadPersonality('researcher');
    case 'AuthUser':
      return loadPersonality('educator');
    case 'AnonUser':
    default:
      return loadPersonality('default');
  }
};
```

## Tool Configuration

### Tool Registry Integration

SifterChat integrates with the SifterSearch tool system to provide AI capabilities. Tools are registered with access control based on user roles:

```javascript
// src/lib/server/chat/tools.js
import { registerTool } from '../tools/registry';

// Register chat tools with role-based access
export function registerChatTools() {
  // Basic search tools (available to all authenticated users)
  registerTool('searchDocuments', {
    description: 'Search for documents in the library',
    requiredRoles: ['AuthUser', 'Editor', 'Librarian', 'SuperUser'],
    handler: searchDocumentsHandler
  });
  
  // Content tools (available to editors and above)
  registerTool('summarizeDocument', {
    description: 'Generate a summary of a document',
    requiredRoles: ['Editor', 'Librarian', 'SuperUser'],
    handler: summarizeDocumentHandler
  });
  
  // Admin tools (available to librarians and superusers)
  registerTool('analyzeQuality', {
    description: 'Assess document quality',
    requiredRoles: ['Librarian', 'SuperUser'],
    handler: analyzeQualityHandler
  });
  
  // SuperUser only tools
  registerTool('generateCompilation', {
    description: 'Create topic compilations',
    requiredRoles: ['SuperUser'],
    handler: generateCompilationHandler
  });
}
```

### Available Tool Categories

The tools are organized into categories with role-based access:

1. **Basic Search Tools** (all authenticated users)
   - `searchDocuments` - Find relevant documents
   - `askQuestion` - Question answering from content
   - `findSimilar` - Find similar documents

2. **Content Tools** (editors and above)
   - `summarizeDocument` - Generate document summaries
   - `extractKeyPoints` - Extract key information
   - `translateContent` - Translate document content

3. **Admin Tools** (librarians and superusers)
   - `analyzeQuality` - Assess document quality
   - `suggestMetadata` - Generate metadata suggestions
   - `findGaps` - Identify collection gaps
   - `generateCompilation` - Create topic compilations

## API Integration

### Chat API Endpoint

The chat API endpoint handles requests with role-based access control:

```javascript
// src/routes/api/chat/+server.js
import { json, error } from '@sveltejs/kit';
import { getPersonalityForContext } from '$lib/server/chat/personalities';
import { getAvailableTools } from '$lib/server/chat/tools';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST({ request, locals }) {
  const { role, user } = locals;
  
  // Only authenticated users can access chat
  if (role === 'AnonUser') {
    throw error(403, 'Authentication required to use chat');
  }
  
  const { messages, libraryId } = await request.json();
  
  try {
    // Get personality based on context and user role
    const personality = await getPersonalityForContext(libraryId, { role });
    
    // Get available tools based on user role
    const tools = await getAvailableTools(role);
    
    // Create system message from personality
    const systemMessage = generateSystemMessage(personality, tools);
    
    // Prepare messages for API
    const apiMessages = [
      { role: 'system', content: systemMessage },
      ...messages
    ];
    
    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: apiMessages,
      tools: tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })),
      temperature: 0.7
    });
    
    // Log chat usage
    await logChatUsage(user.id, messages, response);
    
    return json({
      message: response.choices[0].message,
      personality: personality.name
    });
  } catch (err) {
    throw error(500, err.message);
  }
}
```

## Web Component Implementation

### SifterChat Component

The main SifterChat component is implemented as a Svelte component that can be compiled to a web component:

```svelte
<!-- src/lib/components/chat/SifterChat.svelte -->
<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import ChatMessage from './ChatMessage.svelte';
  import VoiceVisualizer from './VoiceVisualizer.svelte';
  import { chatStore } from '$lib/stores/chat';
  
  // Props with defaults
  export let theme = 'auto';
  export let position = 'bottom-right';
  export let libraryId = 'default';
  export let apiEndpoint = '/api/chat';
  
  // State
  let expanded = false;
  let recording = false;
  let messages = [];
  let inputText = '';
  
  // Handle chat submission
  async function handleSubmit() {
    // Implementation details
  }
  
  // Toggle chat expansion
  function toggleChat() {
    expanded = !expanded;
  }
  
  // Initialize component
  onMount(() => {
    // Setup code
  });
</script>

<div class="sifter-chat {theme} {position} {expanded ? 'expanded' : 'collapsed'}">
  {#if expanded}
    <div class="chat-container" transition:fly={{ y: 20, duration: 200 }}>
      <div class="chat-header">
        <h3>SifterChat</h3>
        <button on:click={toggleChat}>Minimize</button>
      </div>
      
      <div class="messages-container">
        {#each messages as message}
          <ChatMessage {message} />
        {/each}
      </div>
      
      <div class="input-container">
        {#if recording}
          <VoiceVisualizer on:stop={handleVoiceStop} />
        {:else}
          <form on:submit|preventDefault={handleSubmit}>
            <input 
              type="text" 
              bind:value={inputText} 
              placeholder="Type your message..." 
            />
            <button type="submit">Send</button>
            <button type="button" on:click={startVoiceRecording}>
              Voice
            </button>
          </form>
        {/if}
      </div>
    </div>
  {:else}
    <button 
      class="chat-fob" 
      on:click={toggleChat} 
      transition:fade={{ duration: 150 }}
    >
      <span class="fob-icon">💬</span>
    </button>
  {/if}
</div>

<style>
  /* Component styles */
</style>
```

## Implementation Steps

1. **Create Component Files**
   - Implement the SifterChat Svelte component
   - Create supporting components (ChatMessage, VoiceVisualizer)
   - Set up chat store for state management

2. **Implement Chat API**
   - Create the chat API endpoint with role-based access
   - Implement personality selection logic
   - Set up tool registry and access control

3. **Configure Personalities**
   - Create personality configuration files
   - Implement personality loading system
   - Set up role-based personality selection

4. **Test Integration**
   - Test chat functionality with different user roles
   - Verify personality changes based on context
   - Test tool access based on user roles
   - Validate appearance customization

5. **Compile Web Component**
   - Configure Svelte to compile the component as a web component
   - Generate distribution files
   - Create documentation for external usage