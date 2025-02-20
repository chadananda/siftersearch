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

## Integration Approach

### Dual Development/Distribution Model

The key insight for SifterChat integration is utilizing Svelte's automatic web component compilation to achieve two goals simultaneously:

1. **Native Development**: Develop SifterChat as a standard Svelte component within the SvelteKit admin interface
2. **Automatic Distribution**: Leverage Svelte's compilation to generate the standalone web component

This approach means:
- No separate development environment needed
- Continuous testing of the web component functionality
- Immediate validation of changes
- Single source of truth for the component

### Component Placement

The SifterChat component will be placed within the standard SvelteKit structure:
```
/siftersearch
├── /admin
│   ├── /src
│   │   ├── /lib
│   │   │   └── /components
│   │   │       └── /SifterChat  # Native Svelte component
│   │   │           └── SifterChat.svelte
│   │   └── /routes
│   └── /static
│       └── /chatbot             # Compiled web component output
├── /server
│   └── /routes
│       └── /chat
│           └── ultravox.js      # Enhanced API endpoint
└── /config
    └── /personalities          # Chatbot personality configurations
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

The selection process:
```javascript
// server/routes/chat/ultravox.js
const getPersonalityForContext = async (libraryId, clientInfo) => {
  // Library-specific personality if available
  const libraryPersonality = await getLibraryPersonality(libraryId);
  if (libraryPersonality) return libraryPersonality;

  // Client-specified personality if authorized
  if (clientInfo?.personality && await isAuthorizedPersonality(clientInfo.personality)) {
    return loadPersonality(clientInfo.personality);
  }

  // Default to "librarian" for admin interfaces and "default" for external sites
  return clientInfo?.isAdminInterface
    ? loadPersonality('librarian')
    : loadPersonality('default');
};
```

## Tool Configuration

### Tool Registry Integration

SifterChat connects to the existing tool registry system, with tools provided based on user permissions and context:

```javascript
// server/utils/chatbot-tools.js
export const getToolsForChatbot = async (userId, libraryId, isAdminInterface) => {
  // Get user permissions
  const permissions = await getUserPermissions(userId, libraryId);

  // Filter available tools based on permissions
  const availableTools = toolRegistry.filter(tool =>
    hasPermission(permissions, `tools:${tool.name}`)
  );

  // Add context-specific tools
  if (isAdminInterface) {
    const adminTools = getAdminTools(permissions);
    availableTools.push(...adminTools);
  }

  // Format for chatbot consumption
  return formatToolsForChatbot(availableTools);
};
```

### Tool Categories

Tools are organized into categories for the chatbot:

1. **Search Tools**
   - `search` - General library search
   - `findSimilar` - Find content similar to a reference
   - `advancedSearch` - Complex query builder

2. **Content Tools**
   - `getDocument` - Retrieve document content
   - `summarize` - Generate content summaries
   - `translate` - Translate content between languages
   - `extractEntities` - Identify people, places, and concepts

3. **Admin Tools** (admin interface only)
   - `analyzeQuality` - Assess document quality
   - `suggestMetadata` - Generate metadata suggestions
   - `findGaps` - Identify collection gaps
   - `generateCompilation` - Create topic compilations

4. **User Tools**
   - `saveToCollection` - Save content to user collection
   - `shareContent` - Generate shareable links
   - `exportFormatted` - Export in various formats

### Tool Access Control

Tool access is determined by:
1. User authentication status
2. Assigned permissions
3. Library context
4. Interface type (admin vs external)

## Component Configuration

### Web Component Attributes

The SifterChat component accepts these attributes:

```html
<sifter-chat
  library="ocean"              <!-- Target library ID -->
  sitemap="/sitemap.xml"       <!-- Site navigation assistance -->
  about="/about"               <!-- About page for context -->
  message="..."                <!-- Initial greeting -->
  chatbot-color="#4A90E2"      <!-- Theme color -->
  chatbot-name="SifterChat"    <!-- Display name -->
  personality="researcher"     <!-- Personality configuration -->
  api-key="user_provided_key"  <!-- Optional API key -->
></sifter-chat>
```

### Admin Interface Configuration

When used in the admin interface, SifterChat is configured with:

```javascript
// admin/src/lib/config/chatbot.js
export default {
  library: "current", // Dynamically set to current library
  sitemap: "/api/admin/sitemap",
  about: "/about",
  message: "How can I assist with library management today?",
  "chatbot-color": "var(--primary-color)",
  "chatbot-name": "Librarian",
  personality: "librarian",
  isAdminInterface: true
};
```

## API Integration

### Enhanced Ultravox Connector

The Ultravox API connector generates system prompts from personality configurations:

```javascript
// server/routes/chat/ultravox.js
const generateSystemPrompt = async (personality, tools, clientInfo) => {
  // Get appropriate personality configuration
  const personalityConfig = await getPersonalityForContext(
    clientInfo?.libraryId,
    clientInfo
  );

  // Format tools for inclusion
  const toolDescriptions = formatToolDescriptions(tools);

  // Generate system prompt using template
  let systemPrompt = personalityConfig.systemPromptTemplate
    .replace('{{name}}', personalityConfig.name)
    .replace('{{role}}', personalityConfig.role)
    .replace('{{personalityDescription}}', personalityConfig.personalityDescription);

  // Add tool information
  systemPrompt += `\n\nYou have access to the following tools:\n${toolDescriptions}`;

  // Add context-specific instructions
  if (clientInfo?.siteName) {
    systemPrompt += `\n\nYou are currently helping a user on the website: ${clientInfo.siteName}`;
  }

  // Add any additional instructions
  const additionalInstructions = getAdditionalInstructions(
    personalityConfig,
    clientInfo?.libraryId
  );
  systemPrompt = systemPrompt.replace('{{additionalInstructions}}', additionalInstructions);

  return systemPrompt;
};
```

## Component Styling

SifterChat's visual appearance can be customized while maintaining consistent behavior:

### Theme Integration

```css
/* Base styling with variables */
sifter-chat {
  --theme-color: #4A90E2;              /* Primary theme color */
  --fob-size: 60px;                    /* Size of minimized button */
  --chat-width: 400px;                 /* Width when expanded */
  --chat-height: 600px;                /* Maximum height when expanded */
  --font-family: 'Inter', sans-serif;  /* Font family */
  --border-radius: 20px;               /* Border radius for components */
  --animation-speed: 0.3s;             /* Transition duration */

  /* Auto light/dark mode detection */
  --text-color: light-dark(#2C3E50, #FFFFFF);
  --background-color: light-dark(rgb(255 255 255 / 40%), rgba(0, 0, 0, 0.40));
  --ui-layer-color: light-dark(rgb(255 255 255 / 65%), rgba(0, 0, 0, 0.65));
}
```

### Animation Integration

SifterChat includes sophisticated animations:
- Voice visualization with WebGL
- Transition effects between states
- Typing indicators
- Tool execution feedback

These animations are self-contained within the component but can be customized through CSS variables.

## Migration Steps

1. **Import Existing Component**
   - Transfer the SifterChat component into the SvelteKit project
   - Move personality configurations to the config directory
   - Ensure all dependencies are available

2. **Enhance API Connection**
   - Implement the personality selection system
   - Connect to the tool registry
   - Add authentication integration

3. **Configure Web Component**
   - Set up proper compilation settings
   - Ensure attributes are properly mapped
   - Test in various contexts

4. **Test Personalities**
   - Verify each personality configuration works as expected
   - Test tool access based on context
   - Validate appearance customization

## Benefits of This Approach

1. **Consistent Experience**
   - Same core technology across platforms
   - Unified personality system
   - Consistent tool access patterns

2. **Flexible Deployment**
   - Works in admin interface
   - Distributable to third-party sites
   - Configurable through attributes

3. **Maintainable Structure**
   - Personality configurations in one location
   - Clear separation of concerns
   - Extensible for new tools and personalities

4. **Seamless Development**
   - Native Svelte development experience
   - Hot module replacement during development
   - Continuous testing in real context