<script>
  let {
    node = null,
    documentCount = 0,
    isAdmin = false,
    onEdit = null
  } = $props();

  // Authority level display
  const authorityLabels = {
    10: 'Sacred Text',
    9: 'Authoritative',
    8: 'Official',
    7: 'Compiled',
    6: 'Reliable',
    5: 'Standard',
    4: 'Historical',
    3: 'Academic',
    2: 'Secondary',
    1: 'Informal'
  };

  let authorityLabel = $derived(
    authorityLabels[node?.authority_default] || 'Standard'
  );
</script>

<header class="collection-header">
  {#if node?.cover_image_url}
    <div class="cover-image">
      <img src={node.cover_image_url} alt={node.name} />
      <div class="cover-overlay"></div>
    </div>
  {:else}
    <div class="cover-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </div>
  {/if}

  <div class="header-content">
    {#if node?.parent}
      <nav class="breadcrumb">
        <a href="/library">Library</a>
        <span class="separator">/</span>
        <a href="/library/{node.parent.slug}">{node.parent.name}</a>
        <span class="separator">/</span>
        <span class="current">{node.name}</span>
      </nav>
    {/if}

    <div class="title-row">
      <h1 class="collection-title">{node?.name || 'Collection'}</h1>
      {#if isAdmin && onEdit}
        <button class="edit-btn" onclick={onEdit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>
      {/if}
    </div>

    {#if node?.description}
      <p class="collection-description">{node.description}</p>
    {/if}

    <div class="collection-stats">
      <div class="stat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span>{documentCount.toLocaleString()} {documentCount === 1 ? 'document' : 'documents'}</span>
      </div>
      <div class="stat authority">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span>{authorityLabel}</span>
      </div>
    </div>
  </div>
</header>

<style>
  .collection-header {
    position: relative;
    background: var(--surface-1);
    border-radius: 0.75rem;
    overflow: hidden;
    margin-bottom: 1.5rem;
    border: 1px solid var(--border-default);
  }

  .cover-image {
    position: relative;
    height: 160px;
    overflow: hidden;
  }

  .cover-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 0%, var(--surface-1) 100%);
  }

  .cover-placeholder {
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%);
    color: var(--text-muted);
  }

  .cover-placeholder svg {
    width: 3rem;
    height: 3rem;
    opacity: 0.5;
  }

  .header-content {
    padding: 1.25rem 1.5rem;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .breadcrumb a {
    color: var(--text-secondary);
    text-decoration: none;
  }

  .breadcrumb a:hover {
    color: var(--accent-primary);
  }

  .breadcrumb .separator {
    color: var(--text-muted);
  }

  .breadcrumb .current {
    color: var(--text-primary);
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .collection-title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .edit-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--surface-2);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .edit-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .edit-btn svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  .collection-description {
    margin: 0 0 1rem;
    font-size: 0.9375rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .collection-stats {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .stat svg {
    width: 1rem;
    height: 1rem;
  }

  .stat.authority {
    color: var(--accent-primary);
  }

  @media (max-width: 640px) {
    .cover-image {
      height: 120px;
    }

    .header-content {
      padding: 1rem;
    }

    .collection-title {
      font-size: 1.5rem;
    }

    .title-row {
      flex-direction: column;
      gap: 0.75rem;
    }

    .edit-btn {
      align-self: flex-start;
    }

    .collection-stats {
      flex-wrap: wrap;
      gap: 1rem;
    }
  }
</style>
