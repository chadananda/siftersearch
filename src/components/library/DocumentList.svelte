<script>
  import { createEventDispatcher } from 'svelte';
  import { authenticatedFetch } from '../../lib/api.js';
  import ReligionIcon from '../ReligionIcon.svelte';

  let { documents = [], selectedId = null, isAdmin = false } = $props();

  /**
   * Generate a URL-safe slug from a string (for religion/collection paths)
   * Matches the server-side slugifyPath function
   */
  function slugifyPath(str) {
    if (!str) return '';
    // Diacritics mapping
    const diacritics = {
      'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ā': 'a',
      'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'ē': 'e',
      'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ī': 'i',
      'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'ō': 'o',
      'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ū': 'u',
      'ñ': 'n', 'ç': 'c',
      'Á': 'a', 'À': 'a', 'Ä': 'a', 'Â': 'a', 'Ā': 'a',
      'É': 'e', 'È': 'e', 'Ë': 'e', 'Ê': 'e', 'Ē': 'e',
      'Í': 'i', 'Ì': 'i', 'Ï': 'i', 'Î': 'i', 'Ī': 'i',
      'Ó': 'o', 'Ò': 'o', 'Ö': 'o', 'Ô': 'o', 'Ō': 'o',
      'Ú': 'u', 'Ù': 'u', 'Ü': 'u', 'Û': 'u', 'Ū': 'u',
      'Ñ': 'n', 'Ç': 'c'
    };
    return str
      .toLowerCase()
      .split('').map(c => diacritics[c] || c).join('')
      .replace(/[''`']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  /**
   * Generate a document slug from title/filename + language
   * Matches server-side generateDocSlug function
   */
  function generateDocSlug(doc) {
    // Use title if available, otherwise filename without extension
    let base = doc.title;
    if (!base && doc.filename) {
      base = doc.filename.replace(/\.[^.]+$/, '');
    }
    if (!base) return '';

    const slug = slugifyPath(base);

    // Add language suffix for non-English documents
    if (doc.language && doc.language !== 'en') {
      return `${slug}_${doc.language}`;
    }
    return slug;
  }

  /**
   * Get the semantic URL for a document
   */
  function getDocumentUrl(doc) {
    // Prefer stored slug, fall back to generated slug
    const docSlug = doc.slug || generateDocSlug(doc);
    if (!docSlug || !doc.religion || !doc.collection) {
      // Fallback to query param style if no slug
      return `/library/view?doc=${doc.id}`;
    }
    return `/library/${slugifyPath(doc.religion)}/${slugifyPath(doc.collection)}/${docSlug}`;
  }

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';
  const dispatch = createEventDispatcher();

  let expandedDocId = $state(null);
  let translating = $state(null); // Document ID being translated
  let reingesting = $state(null); // Document ID being re-ingested
  let activeJobs = $state(new Map()); // docId → jobId for active translation jobs
  let pollingInterval = $state(null);
  let rawYamlDocId = $state(null); // Document ID showing raw YAML
  let rawYamlContent = $state(null); // Raw YAML content from source file
  let rawYamlLoading = $state(false);

  /**
   * Fetch raw YAML frontmatter from source file
   */
  async function fetchRawYaml(docId) {
    if (rawYamlDocId === docId) {
      // Toggle off
      rawYamlDocId = null;
      rawYamlContent = null;
      return;
    }

    rawYamlLoading = true;
    rawYamlDocId = docId;
    try {
      const response = await authenticatedFetch(`${API_BASE}/api/library/documents/${docId}/raw`);
      if (!response.ok) throw new Error('Failed to fetch raw content');
      const data = await response.json();
      // Extract just the frontmatter portion (between --- markers)
      const match = data.content.match(/^---\n([\s\S]*?)\n---/);
      rawYamlContent = match ? match[1] : 'No frontmatter found';
    } catch (err) {
      rawYamlContent = `Error: ${err.message}`;
    } finally {
      rawYamlLoading = false;
    }
  }

  // RTL languages that need special handling
  const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

  /**
   * Strip sentence/phrase markers from text before display
   * Handles both Unicode markers ⁅s1⁆ and bracket markers [s1]
   */
  function stripMarkers(text) {
    if (!text) return '';
    return text
      // Unicode markers: ⁅s1⁆, ⁅/s1⁆, ⁅p1⁆, etc.
      .replace(/⁅\/?[sp]\d+⁆/g, '')
      // Bracket markers: [s1], [/s1], [p1], etc.
      .replace(/\[\/?[sp]\d+\]/g, '')
      // Markdown links: [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Markdown bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Clean up any double spaces left behind
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Language display names
  const LANG_NAMES = {
    en: 'English', ar: 'Arabic', fa: 'Persian', he: 'Hebrew', ur: 'Urdu',
    es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese'
  };

  function toggleDocument(doc) {
    // Accordion: toggle this doc, auto-close previous (no fetch needed - preview preloaded)
    expandedDocId = expandedDocId === doc.id ? null : doc.id;
    dispatch('select', doc);
  }

  function isRTL(language) {
    return RTL_LANGUAGES.includes(language);
  }


  function getLangName(code) {
    return LANG_NAMES[code] || code?.toUpperCase() || '';
  }

  // Track which documents have translation stats loaded
  let docTranslationStats = $state({}); // doc.id → { translated: n, total: n }
  let loadingStats = $state({}); // doc.id → true if loading

  // Load translation stats for non-English docs when documents change
  $effect(() => {
    // Find non-English docs that need stats loaded
    const docsNeedingStats = documents.filter(doc =>
      doc.language && doc.language !== 'en' &&
      !docTranslationStats[doc.id] &&
      !loadingStats[doc.id]
    );

    if (docsNeedingStats.length > 0) {
      // Load stats for each (limit to first 10 to avoid overwhelming API)
      docsNeedingStats.slice(0, 10).forEach(doc => {
        loadTranslationStats(doc);
      });
    }
  });

  // Load translation stats for a single doc
  async function loadTranslationStats(doc) {
    if (!doc.language || doc.language === 'en' || docTranslationStats[doc.id] || loadingStats[doc.id]) {
      return;
    }
    loadingStats = { ...loadingStats, [doc.id]: true };
    try {
      // Fetch translation stats directly
      const url = `${API_BASE}/api/library/documents/${doc.id}/translation-stats`;
      const statsRes = await authenticatedFetch(url);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        docTranslationStats = {
          ...docTranslationStats,
          [doc.id]: {
            translated: stats.translated || 0,
            total: stats.total || 0
          }
        };
      } else {
        // Mark as checked but no stats available
        docTranslationStats = { ...docTranslationStats, [doc.id]: { translated: 0, total: 0 } };
      }
    } catch (err) {
      console.error('[TranslationStats] Error for', doc.id, ':', err);
      // Mark as checked to prevent retry loops
      docTranslationStats = { ...docTranslationStats, [doc.id]: { translated: 0, total: 0 } };
    } finally {
      const { [doc.id]: _, ...rest } = loadingStats;
      loadingStats = rest;
    }
  }

  // Get translation percentage for a doc
  function getTranslationPercent(docId) {
    const stats = docTranslationStats[docId];
    if (!stats || !stats.total) return null;
    return Math.round((stats.translated / stats.total) * 100);
  }


  // Request re-ingestion of document (admin only)
  async function requestReingest(docId, docTitle) {
    if (!confirm(`Re-import "${docTitle || docId}"?\n\nThis will re-read the source file and re-segment the document. Unchanged paragraphs will keep their embeddings.`)) {
      return;
    }

    reingesting = docId;

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/admin/server/reingest-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }

      await res.json();
      // Poll for completion
      await pollReingestStatus(docId);

    } catch (err) {
      console.error('[Re-Import] Error:', err);
      alert(`Re-import failed: ${err.message}`);
    } finally {
      reingesting = null;
    }
  }

  // Poll for re-ingest task status and log details
  async function pollReingestStatus(docId) {
    const startTime = Date.now();
    const maxWait = 5 * 60 * 1000; // 5 minutes max

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, 2000)); // Poll every 2 seconds

      try {
        const res = await authenticatedFetch(`${API_BASE}/api/admin/server/tasks/reingest`);
        if (!res.ok) continue;

        const status = await res.json();
        if (status.status === 'completed') {

          // Parse JSON summary from output if available
          let summary = null;
          if (status.output?.length > 0) {
            // Find the JSON summary line
            for (let i = status.output.length - 1; i >= 0; i--) {
              const line = status.output[i];
              if (line.startsWith('{') && line.includes('paragraphCount')) {
                try {
                  summary = JSON.parse(line);
                  break;
                } catch {}
              }
            }
          }

          if (summary) {
            alert(`Re-import complete!\n\n` +
              `Total paragraphs: ${summary.paragraphCount}\n` +
              `Reused: ${summary.reusedParagraphs}\n` +
              `New/changed: ${summary.newParagraphs}\n` +
              `Deleted: ${summary.deletedParagraphs}`);
          } else {
            alert('Re-import complete!\n\nCheck browser console for details.');
          }
          // Tell parent to refresh document list
          dispatch('refresh');
          return;
        }

        if (status.status === 'failed') {
          console.error('[Re-Import] ❌ Failed:', status.error);
          alert(`Re-import failed: ${status.error || 'Unknown error'}`);
          return;
        }

        // Still running...

      } catch (err) {
        console.warn('[Re-Import] Poll error:', err);
      }
    }

    console.warn('[Re-Import] Timeout waiting for completion');
    alert('Re-import is taking longer than expected. Check server logs for status.');
  }

  // Queue document for translation (background job)
  async function requestTranslation(docId) {
    translating = docId;
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${docId}/queue-translation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to queue translation');
      }

      const data = await res.json();

      // Update local translation stats
      if (data.total) {
        docTranslationStats = {
          ...docTranslationStats,
          [docId]: {
            translated: data.progress || 0,
            total: data.total
          }
        };
      }

      // Track active job for polling
      if (data.jobId && data.status !== 'completed') {
        activeJobs = new Map(activeJobs).set(docId, data.jobId);
        startPolling();
      }

    } catch (err) {
      console.error('Translation queue error:', err);
      alert(`Failed to queue translation: ${err.message}`);
    } finally {
      translating = null;
    }
  }

  // Poll for translation job status
  function startPolling() {
    if (pollingInterval) return; // Already polling

    pollingInterval = setInterval(async () => {
      if (activeJobs.size === 0) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        return;
      }

      // Check status for each active job
      for (const [docId, _jobId] of activeJobs) {
        try {
          const res = await authenticatedFetch(`${API_BASE}/api/library/documents/${docId}/translation-status`);
          if (res.ok) {
            const status = await res.json();

            // Update stats
            if (status.stats) {
              docTranslationStats = {
                ...docTranslationStats,
                [docId]: {
                  translated: status.stats.translated || 0,
                  total: status.stats.total || 0
                }
              };
            }

            // Remove from active jobs if completed or failed
            if (!status.job || status.job.status === 'completed' || status.job.status === 'failed') {
              const newJobs = new Map(activeJobs);
              newJobs.delete(docId);
              activeJobs = newJobs;
            }
          }
        } catch (err) {
          console.error('Polling error for', docId, err);
        }
      }
    }, 3000); // Poll every 3 seconds
  }

  // Cleanup polling on component destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  });

</script>

<div class="flex flex-col gap-1 w-full" role="list" aria-label="Document list">
  {#each documents as doc (doc.id)}
    {@const isExpanded = expandedDocId === doc.id}
    {@const langName = getLangName(doc.language)}
    {@const isNonEnglish = doc.language && doc.language !== 'en'}
    {@const needsTranslation = isExpanded && doc.language && doc.language !== 'en'}
    {@const docStats = docTranslationStats[doc.id]}
    {@const translationPercent = docStats && docStats.total > 0 ? Math.round((docStats.translated / docStats.total) * 100) : null}
    {@const statsLoading = !!loadingStats[doc.id]}

    <div class="group border rounded-lg overflow-hidden transition-colors
                {isExpanded ? 'border-accent' : 'border-border-subtle hover:border-border'}" role="listitem">
      <!-- Title row - full row clickable -->
      <div
        aria-label="{doc.title || 'Untitled'}{doc.author ? ' by ' + doc.author : ''}"
        aria-expanded={isExpanded}
        class="w-full flex items-center gap-2 py-2.5 px-3 transition-colors cursor-pointer
               {isExpanded ? 'bg-accent/10 border-b border-border-subtle' : 'bg-surface-1 hover:bg-surface-2'}"
        onclick={() => toggleDocument(doc)}
        onkeydown={(e) => e.key === 'Enter' && toggleDocument(doc)}
        role="button"
        tabindex="0"
      >
        <span class="text-[0.625rem] text-muted w-4 shrink-0">{isExpanded ? '▼' : '▶'}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-medium text-primary truncate">{doc.title || 'Untitled'}</span>
            {#if doc.author}
              <span class="text-xs text-secondary shrink-0">{doc.author}</span>
            {/if}
          </div>
          {#if doc.description}
            <p class="text-xs italic text-muted mt-0.5 truncate">{doc.description.length > 150 ? doc.description.slice(0, 150) + '...' : doc.description}</p>
          {/if}
        </div>
        <div class="flex items-center gap-1.5 shrink-0" onclick={(e) => e.stopPropagation()}>
          <!-- Language + Translation compound pill -->
          {#if langName && langName !== 'English'}
            <div class="inline-flex items-center rounded-sm overflow-hidden text-[0.6875rem] font-semibold border border-accent/40">
              <!-- Language section (left) -->
              <span class="px-2 py-0.5 bg-accent text-white">{langName}</span>

              <!-- Translation action/progress section (right) -->
              {#if statsLoading}
                <span class="px-2 py-0.5 bg-surface-1 text-primary flex items-center">
                  <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                </span>
              {:else if translating === doc.id || activeJobs.has(doc.id)}
                <!-- Translating: show spinner + percent -->
                <span class="px-2 py-0.5 bg-warning text-white flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>
                  <span>{translationPercent ?? 0}%</span>
                </span>
              {:else if translationPercent === 100}
                <!-- Complete: show checkmark + 100% -->
                <span class="px-2 py-0.5 bg-success text-white flex items-center gap-1">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>100%</span>
                </span>
              {:else if translationPercent !== null && translationPercent > 0}
                <!-- Partially translated: show progress -->
                {#if isAdmin}
                  <button
                    onclick={(e) => { e.stopPropagation(); requestTranslation(doc.id); }}
                    class="px-2 py-0.5 bg-info/20 text-info hover:bg-info hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    title="Continue translation"
                  >
                    <span>{translationPercent}%</span>
                  </button>
                {:else}
                  <span class="px-2 py-0.5 bg-info/20 text-info">{translationPercent}%</span>
                {/if}
              {:else if docStats}
                <!-- Stats loaded but 0% translated -->
                {#if isAdmin}
                  <button
                    onclick={(e) => { e.stopPropagation(); requestTranslation(doc.id); }}
                    class="px-2 py-0.5 bg-warning/20 text-warning hover:bg-warning hover:text-white transition-colors cursor-pointer"
                    title="Start translation (0%)"
                  >0%</button>
                {:else}
                  <span class="px-2 py-0.5 bg-warning/20 text-warning">0%</span>
                {/if}
              {:else if isAdmin}
                <!-- Not translated: admin can start translation -->
                <button
                  onclick={(e) => { e.stopPropagation(); requestTranslation(doc.id); }}
                  class="px-2 py-0.5 bg-surface-1 text-muted hover:bg-accent hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  title="Translate to English"
                >
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>
                  </svg>
                </button>
              {:else}
                <!-- Not translated: show indicator for non-admins -->
                <span class="px-2 py-0.5 bg-surface-1 text-muted text-[0.625rem]">—</span>
              {/if}
            </div>
          {/if}

          <!-- View button - always visible -->
          <a
            class="p-1.5 text-secondary hover:text-accent rounded transition-colors cursor-pointer"
            href={getDocumentUrl(doc)}
            target="_blank"
            rel="noopener"
            onclick={(e) => e.stopPropagation()}
            title="View document"
            aria-label="View {doc.title || 'document'}"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
          <!-- Edit button - admin only, always visible -->
          {#if isAdmin}
            <a
              class="p-1.5 text-secondary hover:text-accent rounded transition-colors cursor-pointer"
              href="/admin/edit?id={doc.id}"
              target="_blank"
              rel="noopener"
              onclick={(e) => e.stopPropagation()}
              title="Edit document"
              aria-label="Edit {doc.title || 'document'}"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </a>
            <!-- Re-import button - admin only -->
            <button
              class="p-1.5 text-secondary hover:text-warning rounded transition-colors cursor-pointer
                     {reingesting === doc.id ? 'text-warning animate-pulse' : ''}"
              onclick={(e) => { e.stopPropagation(); requestReingest(doc.id, doc.title); }}
              disabled={reingesting === doc.id}
              title="Re-import document (force re-ingestion)"
              aria-label="Re-import {doc.title || 'document'}"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 21h5v-5"/>
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Expanded preview - instant, no fetch needed -->
      {#if isExpanded}
        <div class="border-t border-border bg-surface-0 p-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Frontmatter -->
            <div>
              <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Metadata</h4>
              <div class="bg-surface-2 rounded-lg p-3 font-mono text-xs space-y-1 max-h-40 overflow-auto">
                {#if doc.id}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">id:</span>
                    <span class="text-primary">{doc.id}</span>
                  </div>
                {/if}
                {#if doc.file_path}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">file_path:</span>
                    <span class="text-primary break-all text-[10px] leading-relaxed">{doc.file_path}</span>
                  </div>
                {/if}
                {#if doc.title}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">title:</span>
                    <span class="text-primary break-all">{doc.title}</span>
                  </div>
                {/if}
                {#if doc.description}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">description:</span>
                    <span class="text-primary break-all">{doc.description}</span>
                  </div>
                {/if}
                {#if doc.author}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">author:</span>
                    <span class="text-primary break-all">{doc.author}</span>
                  </div>
                {/if}
                {#if doc.language}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">language:</span>
                    <span class="text-primary">{getLangName(doc.language)} ({doc.language})</span>
                  </div>
                {/if}
                {#if doc.religion}
                  <div class="flex gap-2 items-center">
                    <span class="text-accent font-medium">religion:</span>
                    <span class="text-primary flex items-center gap-1">
                      <ReligionIcon religion={doc.religion} size="sm" />
                      {doc.religion}
                    </span>
                  </div>
                {/if}
                {#if doc.collection}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">collection:</span>
                    <span class="text-primary">{doc.collection}</span>
                  </div>
                {/if}
                {#if isAdmin && doc.authority}
                  <div class="flex gap-2">
                    <span class="text-accent font-medium">authority:</span>
                    <span class="text-primary">{doc.authority}</span>
                  </div>
                {/if}
              </div>
            </div>
            <!-- Content preview -->
            <div>
              <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Content Preview</h4>
              <div class="bg-surface-2 rounded-lg p-3 text-xs text-secondary max-h-40 overflow-auto" class:rtl={isRTL(doc.language)}>
                {#if doc.previewParagraphs?.length > 0}
                  <div class="space-y-2" dir={isRTL(doc.language) ? 'rtl' : 'ltr'}>
                    {#each doc.previewParagraphs as para}
                      <p class="leading-relaxed">{stripMarkers(para.t)}</p>
                    {/each}
                  </div>
                {:else}
                  <p class="italic text-muted">No preview available</p>
                {/if}
              </div>
            </div>
          </div>
          <!-- Raw YAML toggle button and content (admin only) -->
          {#if isAdmin}
            <div class="mt-4 border-t border-border pt-4">
              <button
                class="text-xs font-semibold text-muted uppercase tracking-wide mb-2 hover:text-accent flex items-center gap-1"
                onclick={() => fetchRawYaml(doc.id)}
                disabled={rawYamlLoading && rawYamlDocId === doc.id}
              >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  {#if rawYamlDocId === doc.id}
                    <polyline points="6 9 12 15 18 9"/>
                  {:else}
                    <polyline points="9 18 15 12 9 6"/>
                  {/if}
                </svg>
                {rawYamlDocId === doc.id ? 'Hide' : 'Show'} Raw YAML from Source File
              </button>
              {#if rawYamlDocId === doc.id}
                <div class="bg-surface-2 rounded-lg p-3 font-mono text-xs max-h-64 overflow-auto">
                  {#if rawYamlLoading}
                    <p class="text-muted animate-pulse">Loading...</p>
                  {:else}
                    <pre class="text-primary whitespace-pre-wrap break-all">{rawYamlContent}</pre>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

