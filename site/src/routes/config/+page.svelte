<script>
  import Card from '$lib/components/ui/Card.svelte';
  import { onMount } from 'svelte';

  let config = {
    // Basic information
    id: "ocean",
    displayName: "Ocean Library",
    description: "Interfaith religious and philosophical texts",
    domain: "ocean.siftersearch.com",

    // Search configuration
    search: {
      defaultLanguage: "en",
      vectorWeight: 0.6,
      bm25Weight: 0.4,
      minScore: 0.65,
      maxResults: 50
    },

    // Content settings
    content: {
      allowedTypes: ["book", "document", "webpage", "video"],
      defaultLicense: "research-only",
      customMetadataFields: [
        {name: "scriptureType", type: "string", options: ["primary", "commentary", "academic"]},
        {name: "religiousTradition", type: "string"},
        {name: "historicalPeriod", type: "string"}
      ]
    },

    // Chat configuration
    chat: {
      botName: "Scholar",
      personality: "helpful, knowledgeable, scholarly",
      defaultPrompt: "I am a research assistant specializing in interfaith studies..."
    },

    // Language settings
    language: {
      useUTF8: true,
      supportBidirectional: true,
      enabledLanguages: ["en", "ar", "fa", "he"],
      defaultDirection: "ltr"
    }
  };

  function handleSave() {
    // TODO: Implement save functionality
    console.log('Saving config:', config);
  }
</script>

<div class="h-full flex flex-col">
  <!-- Fixed header -->
  <div class="p-6 bg-surface-1">
    <h1 class="text-3xl font-bold">Library Configuration</h1>
  </div>
  
  <!-- Scrollable content -->
  <div class="flex-1 overflow-auto">
    <div class="p-6">
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Basic Settings -->
        <Card>
          <div class="p-6 space-y-6">
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <h2 class="text-xl font-semibold">Basic Settings</h2>
            </div>
            
            <div class="grid grid-cols-1 gap-6">
              <div class="space-y-2">
                <label class="block text-sm font-medium">Library ID</label>
                <input
                  type="text"
                  bind:value={config.id}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                />
                <p class="text-sm text-text-tertiary">Unique identifier for your library</p>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Display Name</label>
                <input
                  type="text"
                  bind:value={config.displayName}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                />
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Description</label>
                <textarea
                  bind:value={config.description}
                  rows="3"
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                ></textarea>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Domain</label>
                <input
                  type="text"
                  bind:value={config.domain}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                />
                <p class="text-sm text-text-tertiary">Your library's unique subdomain</p>
              </div>
            </div>
          </div>
        </Card>

        <!-- Search Settings -->
        <Card>
          <div class="p-6 space-y-6">
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h2 class="text-xl font-semibold">Search Settings</h2>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label class="block text-sm font-medium">Default Language</label>
                <select
                  bind:value={config.search.defaultLanguage}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="fa">Farsi</option>
                  <option value="he">Hebrew</option>
                </select>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Max Results</label>
                <input
                  type="number"
                  bind:value={config.search.maxResults}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                />
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Vector Weight</label>
                <input
                  type="range"
                  bind:value={config.search.vectorWeight}
                  min="0"
                  max="1"
                  step="0.1"
                  class="w-full"
                />
                <p class="text-sm text-text-tertiary">Weight: {config.search.vectorWeight}</p>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">BM25 Weight</label>
                <input
                  type="range"
                  bind:value={config.search.bm25Weight}
                  min="0"
                  max="1"
                  step="0.1"
                  class="w-full"
                />
                <p class="text-sm text-text-tertiary">Weight: {config.search.bm25Weight}</p>
              </div>
            </div>
          </div>
        </Card>

        <!-- Content Settings -->
        <Card>
          <div class="p-6 space-y-6">
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <h2 class="text-xl font-semibold">Content Settings</h2>
            </div>

            <div class="grid grid-cols-1 gap-6">
              <div class="space-y-2">
                <label class="block text-sm font-medium">Allowed Content Types</label>
                <div class="grid grid-cols-2 gap-2">
                  {#each ['book', 'document', 'webpage', 'video'] as type}
                    <label class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.content.allowedTypes.includes(type)}
                        class="form-checkbox rounded border-subtle"
                      />
                      <span class="capitalize">{type}</span>
                    </label>
                  {/each}
                </div>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Default License</label>
                <select
                  bind:value={config.content.defaultLicense}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                >
                  <option value="research-only">Research Only</option>
                  <option value="public-domain">Public Domain</option>
                  <option value="cc-by">Creative Commons BY</option>
                  <option value="cc-by-sa">Creative Commons BY-SA</option>
                </select>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Custom Metadata Fields</label>
                <div class="space-y-3">
                  {#each config.content.customMetadataFields as field}
                    <div class="flex items-center gap-3 bg-surface-2 p-3 rounded-lg">
                      <div class="flex-1">
                        <div class="font-medium">{field.name}</div>
                        <div class="text-sm text-text-tertiary">Type: {field.type}</div>
                      </div>
                      <button class="text-text-tertiary hover:text-text-secondary p-1">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                  <button class="w-full px-4 py-2 border border-accent/50 text-accent hover:bg-accent/10 rounded-lg">
                    Add Metadata Field
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <!-- Language Settings -->
        <Card>
          <div class="p-6 space-y-6">
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              <h2 class="text-xl font-semibold">Language Settings</h2>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label class="block text-sm font-medium">Default Direction</label>
                <select
                  bind:value={config.language.defaultDirection}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                >
                  <option value="ltr">Left to Right</option>
                  <option value="rtl">Right to Left</option>
                </select>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Features</label>
                <div class="space-y-2">
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      bind:checked={config.language.useUTF8}
                      class="form-checkbox rounded border-subtle"
                    />
                    <span>UTF-8 Support</span>
                  </label>
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      bind:checked={config.language.supportBidirectional}
                      class="form-checkbox rounded border-subtle"
                    />
                    <span>Bidirectional Text Support</span>
                  </label>
                </div>
              </div>

              <div class="col-span-2">
                <label class="block text-sm font-medium mb-2">Enabled Languages</label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {#each ['en', 'ar', 'fa', 'he'] as lang}
                    <label class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.language.enabledLanguages.includes(lang)}
                        class="form-checkbox rounded border-subtle"
                      />
                      <span>{lang === 'en' ? 'English' : lang === 'ar' ? 'Arabic' : lang === 'fa' ? 'Farsi' : 'Hebrew'}</span>
                    </label>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <!-- Chat Settings -->
        <Card>
          <div class="p-6 space-y-6">
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <h2 class="text-xl font-semibold">Chat Settings</h2>
            </div>

            <div class="grid grid-cols-1 gap-6">
              <div class="space-y-2">
                <label class="block text-sm font-medium">Bot Name</label>
                <input
                  type="text"
                  bind:value={config.chat.botName}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                />
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Personality</label>
                <input
                  type="text"
                  bind:value={config.chat.personality}
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                />
                <p class="text-sm text-text-tertiary">Comma-separated list of personality traits</p>
              </div>

              <div class="space-y-2">
                <label class="block text-sm font-medium">Default Prompt</label>
                <textarea
                  bind:value={config.chat.defaultPrompt}
                  rows="3"
                  class="w-full px-4 py-2 bg-surface-2 rounded-lg border border-subtle"
                ></textarea>
                <p class="text-sm text-text-tertiary">Initial system prompt for the chat bot</p>
              </div>
            </div>
          </div>
        </Card>

        <!-- Save Button -->
        <div class="flex justify-end pb-6">
          <button
            on:click={handleSave}
            class="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center gap-2"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
