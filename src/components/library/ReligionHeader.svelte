<script>
  /**
   * ReligionHeader Component
   * Hero header for religion pages with symbol, name, description, and stats
   */

  let {
    religion = null,
    documentCount = 0,
    collectionCount = 0,
    isAdmin = false,
    onEdit = null
  } = $props();

  // Default symbol if none set
  const symbol = $derived(religion?.symbol || '📚');
  const name = $derived(religion?.name || 'Unknown');
  const description = $derived(religion?.description || religion?.overview || '');
</script>

<div class="religion-header">
  <div class="header-content">
    <div class="symbol-container">
      <span class="symbol">{symbol}</span>
    </div>

    <div class="info-container">
      <div class="title-row">
        <h1 class="religion-name">{name}</h1>
        {#if isAdmin && onEdit}
          <button
            class="edit-btn"
            onclick={() => onEdit(religion)}
            title="Edit religion details"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
        {/if}
      </div>

      {#if description}
        <p class="description">{description}</p>
      {:else if isAdmin}
        <p class="description placeholder">
          No description yet. Click Edit to add one or generate with AI.
        </p>
      {/if}

      <div class="stats">
        <span class="stat">
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          {documentCount.toLocaleString()} {documentCount === 1 ? 'document' : 'documents'}
        </span>
        <span class="stat-divider">·</span>
        <span class="stat">
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {collectionCount} {collectionCount === 1 ? 'collection' : 'collections'}
        </span>
      </div>
    </div>
  </div>
</div>

<style>
  .religion-header {
    background: linear-gradient(135deg, var(--surface-1) 0%, var(--surface-2) 100%);
    border: 1px solid var(--border-subtle);
    border-radius: 1rem;
    padding: 2rem;
    margin-bottom: 1.5rem;
  }

  .header-content {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .symbol-container {
    flex-shrink: 0;
    width: 5rem;
    height: 5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-0);
    border-radius: 1rem;
    border: 1px solid var(--border-subtle);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .symbol {
    font-size: 2.75rem;
    line-height: 1;
  }

  .info-container {
    flex: 1;
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .religion-name {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.2;
  }

  .edit-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--accent);
    background: var(--surface-0);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .edit-btn:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .description {
    font-family: 'Libre Caslon Text', Georgia, serif;
    font-size: 1rem;
    line-height: 1.6;
    color: var(--text-secondary);
    margin: 0 0 1rem 0;
    max-width: 60ch;
  }

  .description.placeholder {
    font-style: italic;
    color: var(--text-muted);
  }

  .stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .stat {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .stat-icon {
    width: 1rem;
    height: 1rem;
    opacity: 0.7;
  }

  .stat-divider {
    color: var(--text-muted);
    opacity: 0.5;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .religion-header {
      padding: 1.25rem;
    }

    .header-content {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .symbol-container {
      width: 4rem;
      height: 4rem;
    }

    .symbol {
      font-size: 2.25rem;
    }

    .title-row {
      flex-direction: column;
      gap: 0.5rem;
    }

    .religion-name {
      font-size: 1.5rem;
    }

    .description {
      text-align: center;
    }

    .stats {
      justify-content: center;
    }
  }
</style>
