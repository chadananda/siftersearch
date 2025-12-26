<script>
  let {
    node = null,
    documentCount = 0,
    isAdmin = false,
    onEdit = null
  } = $props();

  // Authority level display with colors
  const authorityConfig = {
    10: { label: 'Sacred Text', class: 'sacred' },
    9: { label: 'Authoritative', class: 'authoritative' },
    8: { label: 'Official', class: 'official' },
    7: { label: 'Compiled', class: 'compiled' },
    6: { label: 'Reliable', class: 'reliable' },
    5: { label: 'Standard', class: 'standard' },
    4: { label: 'Historical', class: 'historical' },
    3: { label: 'Academic', class: 'academic' },
    2: { label: 'Secondary', class: 'secondary' },
    1: { label: 'Informal', class: 'informal' }
  };

  let authority = $derived(
    authorityConfig[node?.authority_default] || { label: 'Standard', class: 'standard' }
  );
</script>

<header class="collection-hero">
  <!-- Background layer -->
  <div class="hero-background">
    {#if node?.cover_image_url}
      <img src={node.cover_image_url} alt="" class="cover-image" />
    {/if}
    <div class="gradient-overlay"></div>
  </div>

  <!-- Content layer -->
  <div class="hero-content">
    <!-- Breadcrumb navigation -->
    {#if node?.parent}
      <nav class="breadcrumb">
        <a href="/library" class="crumb">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          Library
        </a>
        <span class="separator">›</span>
        <a href="/library/{node.parent.slug}" class="crumb">{node.parent.name}</a>
        <span class="separator">›</span>
        <span class="current">{node.name}</span>
      </nav>
    {/if}

    <!-- Title section -->
    <div class="title-section">
      <h1 class="title">{node?.name || 'Collection'}</h1>
      {#if isAdmin && onEdit}
        <button class="edit-btn" onclick={onEdit} title="Edit collection">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      {/if}
    </div>

    <!-- Description -->
    {#if node?.description}
      <p class="description">{node.description}</p>
    {/if}

    <!-- Stats bar -->
    <div class="stats-bar">
      <div class="stat documents">
        <span class="stat-value">{documentCount.toLocaleString()}</span>
        <span class="stat-label">{documentCount === 1 ? 'document' : 'documents'}</span>
      </div>

      <div class="stat-divider"></div>

      <div class="stat authority {authority.class}">
        <span class="authority-stars">
          {#if node?.authority_default >= 10}★★★
          {:else if node?.authority_default >= 8}★★☆
          {:else if node?.authority_default >= 5}★☆☆
          {:else}☆☆☆
          {/if}
        </span>
        <span class="stat-label">{authority.label}</span>
      </div>
    </div>
  </div>
</header>

<style>
  .collection-hero {
    position: relative;
    min-height: 180px;
    border-radius: 1rem;
    overflow: hidden;
    margin-bottom: 1.5rem;
  }

  /* Background layer */
  .hero-background {
    position: absolute;
    inset: 0;
  }

  .cover-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: brightness(0.4) saturate(1.2);
  }

  .gradient-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent-primary) 85%, black) 0%,
      color-mix(in srgb, var(--accent-primary) 60%, var(--surface-0)) 50%,
      var(--surface-1) 100%
    );
  }

  .collection-hero:has(.cover-image) .gradient-overlay {
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(0, 0, 0, 0.3) 50%,
      var(--surface-1) 100%
    );
  }

  /* Content layer */
  .hero-content {
    position: relative;
    z-index: 1;
    padding: 1.5rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Breadcrumb */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .crumb {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .crumb:hover {
    color: white;
  }

  .crumb svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  .separator {
    color: rgba(255, 255, 255, 0.4);
  }

  .current {
    color: white;
    font-weight: 500;
  }

  /* Title section */
  .title-section {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .title {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    color: white;
    line-height: 1.2;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    flex: 1;
  }

  .edit-btn {
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    color: white;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .edit-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .edit-btn svg {
    width: 1rem;
    height: 1rem;
    display: block;
  }

  /* Description */
  .description {
    margin: 0;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.5;
    max-width: 600px;
  }

  /* Stats bar */
  .stats-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .stat {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
  }

  .stat.documents {
    color: white;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .stat-label {
    font-size: 0.8125rem;
    opacity: 0.8;
  }

  .stat-divider {
    width: 1px;
    height: 1.5rem;
    background: rgba(255, 255, 255, 0.3);
  }

  .stat.authority {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .authority-stars {
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  /* Authority color classes */
  .stat.sacred { color: #fbbf24; }
  .stat.authoritative { color: #f59e0b; }
  .stat.official { color: #34d399; }
  .stat.compiled { color: #60a5fa; }
  .stat.reliable { color: #a78bfa; }
  .stat.standard { color: rgba(255, 255, 255, 0.9); }
  .stat.historical { color: #fb923c; }
  .stat.academic { color: #94a3b8; }
  .stat.secondary { color: #cbd5e1; }
  .stat.informal { color: #94a3b8; }

  /* Responsive */
  @media (max-width: 640px) {
    .collection-hero {
      min-height: 160px;
      border-radius: 0.75rem;
    }

    .hero-content {
      padding: 1rem 1.25rem;
    }

    .title {
      font-size: 1.5rem;
    }

    .description {
      font-size: 0.875rem;
    }

    .stats-bar {
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .stat-divider {
      display: none;
    }

    .stat-value {
      font-size: 1.125rem;
    }
  }
</style>
