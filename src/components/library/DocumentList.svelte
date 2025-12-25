<script>
  import { createEventDispatcher } from 'svelte';

  let { documents = [], selectedId = null } = $props();

  const dispatch = createEventDispatcher();

  function selectDocument(doc) {
    dispatch('select', doc);
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'indexed': return { icon: '✓', color: 'success', label: 'Indexed' };
      case 'processing': return { icon: '⏳', color: 'warning', label: 'Processing' };
      case 'unindexed': return { icon: '○', color: 'muted', label: 'Not indexed' };
      default: return { icon: '?', color: 'muted', label: 'Unknown' };
    }
  }
</script>

<div class="document-list">
  {#each documents as doc}
    {@const status = getStatusIcon(doc.status)}
    <button
      class="document-card"
      class:selected={selectedId === doc.id}
      onclick={() => selectDocument(doc)}
    >
      <!-- Cover image or placeholder -->
      <div class="document-cover">
        {#if doc.cover_url}
          <img src={doc.cover_url} alt="" loading="lazy" />
        {:else}
          <div class="cover-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
        {/if}
      </div>

      <!-- Document info -->
      <div class="document-info">
        <h3 class="document-title">{doc.title || 'Untitled'}</h3>

        {#if doc.author}
          <div class="document-author">{doc.author}</div>
        {/if}

        <div class="document-meta">
          {#if doc.religion}
            <span class="meta-tag religion">{doc.religion}</span>
          {/if}
          {#if doc.collection}
            <span class="meta-tag collection">{doc.collection}</span>
          {/if}
          {#if doc.language}
            <span class="meta-tag language">{doc.language}</span>
          {/if}
          {#if doc.year}
            <span class="meta-tag year">{doc.year}</span>
          {/if}
        </div>

        <div class="document-footer">
          <span class="status-badge {status.color}" title={status.label}>
            {status.icon}
          </span>
          {#if doc.paragraph_count}
            <span class="paragraph-count">{doc.paragraph_count.toLocaleString()} paragraphs</span>
          {/if}
        </div>
      </div>
    </button>
  {/each}
</div>

<style>
  .document-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .document-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border-default);
    border-radius: 0.75rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .document-card:hover {
    background: var(--surface-2);
    border-color: var(--border-strong);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .document-card.selected {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 5%, var(--surface-1));
  }

  .document-cover {
    width: 60px;
    height: 80px;
    flex-shrink: 0;
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--surface-2);
  }

  .document-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .cover-placeholder svg {
    width: 2rem;
    height: 2rem;
  }

  .document-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .document-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.3;
  }

  .document-author {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .document-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: auto;
  }

  .meta-tag {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: var(--surface-2);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .meta-tag.religion {
    background: color-mix(in srgb, var(--accent-tertiary) 15%, transparent);
    color: var(--accent-tertiary);
  }

  .meta-tag.collection {
    background: color-mix(in srgb, var(--accent-secondary) 15%, transparent);
    color: var(--accent-secondary);
  }

  .document-footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .status-badge {
    font-size: 0.875rem;
    line-height: 1;
  }

  .status-badge.success {
    color: var(--success);
  }

  .status-badge.warning {
    color: var(--warning);
  }

  .status-badge.muted {
    color: var(--text-muted);
  }

  .paragraph-count {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  @media (max-width: 640px) {
    .document-list {
      grid-template-columns: 1fr;
    }
  }
</style>
