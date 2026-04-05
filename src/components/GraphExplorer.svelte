<script>
  import { onMount } from 'svelte';
  import ReligionIcon from './ReligionIcon.svelte';

  const API_BASE = import.meta.env.PUBLIC_API_URL || '';

  const RELIGIONS = [
    "Baha'i", 'Buddhist', 'Christian', 'Confucian',
    'Hindu', 'Islam', 'Jain', 'Judaism', 'Sikh', 'Tao', 'Zoroastrian'
  ];

  const TYPE_COLORS = {
    person: '#60a5fa',
    concept: '#4ade80',
    place: '#f87171',
    event: '#fb923c',
    document: '#c084fc',
    organization: '#94a3b8',
  };

  const TYPE_LABELS = {
    person: 'People',
    concept: 'Concepts',
    place: 'Places',
    event: 'Events',
    document: 'Documents',
    organization: 'Organizations',
  };

  const ALL_TYPES = Object.keys(TYPE_COLORS);

  let selectedReligion = $state(RELIGIONS[0]);
  let rawData = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let hoveredNode = $state(null);
  let selectedNode = $state(null);
  let searchQuery = $state('');
  let enabledTypes = $state(new Set(ALL_TYPES));
  let containerEl = $state(null);
  let graphInstance = $state(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let graphStats = $state(null);

  let typeCounts = $derived.by(() => {
    if (!rawData) return {};
    return ALL_TYPES.reduce((acc, t) => {
      acc[t] = rawData.nodes.filter(n => n.type === t).length;
      return acc;
    }, {});
  });

  let connectedEntities = $derived.by(() => {
    if (!selectedNode || !rawData) return [];
    const links = rawData.edges.filter(l => l.source === selectedNode.id || l.target === selectedNode.id);
    return links.map(l => {
      const otherId = l.source === selectedNode.id ? l.target : l.source;
      return rawData.nodes.find(n => n.id === otherId);
    }).filter(Boolean).sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0));
  });

  // Load graph stats on mount
  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/api/graph/stats`);
      if (res.ok) graphStats = await res.json();
    } catch { /* */ }
  }

  async function loadGraph(religion, types = null) {
    loading = true;
    error = null;
    rawData = null;
    selectedNode = null;
    hoveredNode = null;

    try {
      const slug = religion.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-');
      const typeParam = types ? `&types=${[...types].join(',')}` : '';
      const res = await fetch(`${API_BASE}/api/graph/${slug}?limit=200${typeParam}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('No graph data available yet');
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      rawData = data;
      renderGraph(data);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function nodeRadius(n) {
    const count = n.mentionCount ?? 1;
    // Tight log scale: 1→3px, 100→6px, 1000→8px, 10000→10px, 100000→12px
    return Math.max(3, Math.min(14, 3 + Math.log10(count + 1) * 2.2));
  }

  function nodeColor(n) {
    const base = TYPE_COLORS[n.type] || '#94a3b8';
    if (!enabledTypes.has(n.type)) return 'rgba(0,0,0,0)';
    return base;
  }

  async function renderGraph(data) {
    if (!containerEl || !data?.nodes?.length) return;

    // Dynamically import force-graph (client-side only)
    const ForceGraph = (await import('force-graph')).default;

    // Destroy previous
    if (graphInstance) {
      graphInstance._destructor?.();
      graphInstance = null;
    }

    // Clear container
    containerEl.querySelectorAll('canvas').forEach(c => c.remove());

    const w = containerEl.clientWidth || 800;
    const h = containerEl.clientHeight || 600;

    // Build link map for quick lookup
    const nodeSet = new Set(data.nodes.map(n => n.id));
    const links = data.edges
      .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map(e => ({ ...e }));

    // Compute neighbor sets for highlighting
    const neighbors = new Map();
    for (const link of links) {
      if (!neighbors.has(link.source)) neighbors.set(link.source, new Set());
      if (!neighbors.has(link.target)) neighbors.set(link.target, new Set());
      neighbors.get(link.source).add(link.target);
      neighbors.get(link.target).add(link.source);
    }

    const maxWeight = Math.max(1, ...links.map(l => l.weight || 1));

    const graph = ForceGraph()(containerEl)
      .width(w)
      .height(h)
      .graphData({ nodes: data.nodes.map(n => ({ ...n })), links })
      .nodeId('id')
      .linkSource('source')
      .linkTarget('target')
      .backgroundColor('rgba(0,0,0,0)')
      // Node rendering
      .nodeCanvasObject((node, ctx, globalScale) => {
        const r = nodeRadius(node);
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const isNeighbor = (hoveredNode && neighbors.get(hoveredNode.id)?.has(node.id)) ||
                          (selectedNode && neighbors.get(selectedNode.id)?.has(node.id));
        const isSearchMatch = searchQuery && node.name?.toLowerCase().includes(searchQuery.toLowerCase());
        const hasActive = hoveredNode || selectedNode;
        const isDimmed = hasActive && !isHovered && !isSelected && !isNeighbor;

        if (!enabledTypes.has(node.type)) return;

        const color = TYPE_COLORS[node.type] || '#94a3b8';
        const alpha = isDimmed ? 0.12 : 1;

        // Glow effect for hovered/selected nodes
        if ((isHovered || isSelected || isSearchMatch) && !isDimmed) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI);
          const glow = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 6);
          glow.addColorStop(0, color + '60');
          glow.addColorStop(1, color + '00');
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fill();

        // Border
        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else if (isHovered || isSearchMatch) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.strokeStyle = color + '80';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;

        // Label (show for larger nodes or when zoomed in)
        const showLabel = r > 6 || globalScale > 1.5 || isHovered || isSelected || isNeighbor;
        if (showLabel && !isDimmed) {
          const fontSize = Math.max(9, Math.min(14, r * 0.9));
          ctx.font = `${isHovered || isSelected ? 'bold ' : ''}${fontSize / globalScale}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          const label = node.name?.length > 20 ? node.name.slice(0, 18) + '...' : (node.name ?? '');
          const textY = node.y + r + 2 / globalScale;

          // Text shadow for readability
          ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
          ctx.fillText(label, node.x + 0.5 / globalScale, textY + 0.5 / globalScale);
          ctx.fillStyle = isDimmed ? 'rgba(148,163,184,0.4)' : 'rgba(226,232,240,0.95)';
          ctx.fillText(label, node.x, textY);
        }
      })
      .nodePointerAreaPaint((node, color, ctx) => {
        const r = nodeRadius(node) + 3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      })
      // Link rendering
      .linkCanvasObject((link, ctx) => {
        const src = link.source;
        const tgt = link.target;
        if (!src.x || !tgt.x) return;

        const isHighlighted = (hoveredNode && (src.id === hoveredNode.id || tgt.id === hoveredNode.id)) ||
                             (selectedNode && (src.id === selectedNode.id || tgt.id === selectedNode.id));
        const hasActive = hoveredNode || selectedNode;
        const isDimmed = hasActive && !isHighlighted;

        const weight = link.weight || 1;
        const normalizedWeight = weight / maxWeight;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);

        if (isHighlighted) {
          ctx.strokeStyle = 'rgba(250,204,21,0.5)';
          ctx.lineWidth = 1 + normalizedWeight * 2;
        } else if (isDimmed) {
          ctx.strokeStyle = 'rgba(100,116,139,0.04)';
          ctx.lineWidth = 0.5;
        } else {
          const alpha = 0.05 + normalizedWeight * 0.2;
          ctx.strokeStyle = `rgba(148,163,184,${alpha})`;
          ctx.lineWidth = 0.5 + normalizedWeight * 1.5;
        }
        ctx.stroke();
      })
      .linkDirectionalParticles(link => {
        const isHighlighted = (hoveredNode && (link.source.id === hoveredNode?.id || link.target.id === hoveredNode?.id)) ||
                             (selectedNode && (link.source.id === selectedNode?.id || link.target.id === selectedNode?.id));
        return isHighlighted ? 3 : 0;
      })
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(() => '#facc15')
      .linkDirectionalParticleSpeed(0.006)
      // Interactions
      .onNodeHover(node => {
        hoveredNode = node || null;
        if (containerEl) containerEl.style.cursor = node ? 'pointer' : 'default';
      })
      .onNodeClick(node => {
        selectedNode = selectedNode?.id === node.id ? null : node;
        // Center on selected node
        if (selectedNode) {
          graph.centerAt(node.x, node.y, 500);
          graph.zoom(2.5, 500);
        }
      })
      .onBackgroundClick(() => {
        selectedNode = null;
      })
      // Physics
      .d3AlphaDecay(0.02)
      .d3VelocityDecay(0.3)
      .d3Force('charge', null) // remove default, add custom
      .d3Force('link', null)
      .cooldownTime(3000)
      .warmupTicks(50);

    // Custom forces
    const d3 = await import('d3');
    graph
      .d3Force('charge', d3.forceManyBody().strength(-120))
      .d3Force('link', d3.forceLink(links).id(d => d.id).distance(60).strength(l => 0.05 + (l.weight || 1) / maxWeight * 0.15))
      .d3Force('center', d3.forceCenter(0, 0).strength(0.03))
      .d3Force('collision', d3.forceCollide().radius(n => nodeRadius(n) + 4));

    // Initial zoom to fit
    setTimeout(() => graph.zoomToFit(800, 40), 500);

    graphInstance = graph;
  }

  // Track mouse for tooltip positioning
  function handleMouseMove(e) {
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      tooltipX = e.clientX - rect.left;
      tooltipY = e.clientY - rect.top;
    }
  }

  // Re-render when search changes (client-side highlight only)
  $effect(() => {
    const _q = searchQuery;
    if (graphInstance) {
      graphInstance.refresh();
    }
  });

  // Re-fetch when religion or enabled types change
  $effect(() => {
    const types = enabledTypes.size === ALL_TYPES.length ? null : enabledTypes;
    loadGraph(selectedReligion, types);
  });

  function toggleType(t) {
    const next = new Set(enabledTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    enabledTypes = next;
  }

  function soloType(t) {
    // If already solo'd on this type, show all
    if (enabledTypes.size === 1 && enabledTypes.has(t)) {
      enabledTypes = new Set(ALL_TYPES);
    } else {
      enabledTypes = new Set([t]);
    }
  }

  function focusEntity(entity) {
    selectedNode = entity;
    if (graphInstance && entity) {
      // Find the node in the graph data
      const node = graphInstance.graphData().nodes.find(n => n.id === entity.id);
      if (node) {
        graphInstance.centerAt(node.x, node.y, 500);
        graphInstance.zoom(3, 500);
      }
    }
  }

  onMount(() => {
    loadStats();
    const ro = new ResizeObserver(() => {
      if (graphInstance && containerEl) {
        graphInstance.width(containerEl.clientWidth);
        graphInstance.height(containerEl.clientHeight);
      }
    });
    if (containerEl) ro.observe(containerEl);
    return () => {
      ro.disconnect();
      if (graphInstance) graphInstance._destructor?.();
    };
  });

  function formatNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n?.toString() ?? '0';
  }
</script>

<div class="graph-page">
  <!-- Header -->
  <div class="header">
    <div class="header-row">
      <h1>Knowledge Graph</h1>
      {#if graphStats}
        <span class="header-stat">
          {graphStats.religions?.reduce((s, r) => s + r.entityCount, 0).toLocaleString()} entities across {graphStats.religions?.length} traditions
        </span>
      {/if}
    </div>
    <div class="religion-tabs" role="tablist">
      {#each RELIGIONS as religion}
        {@const stats = graphStats?.religions?.find(r => r.religion === religion)}
        <button
          role="tab"
          aria-selected={selectedReligion === religion}
          class="tab-btn"
          class:active={selectedReligion === religion}
          onclick={() => { selectedReligion = religion; }}
        >
          <ReligionIcon {religion} size="sm" />
          <span class="tab-label">{religion}</span>
          {#if stats}
            <span class="tab-count">{formatNum(stats.entityCount)}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="workspace">
    <!-- Left sidebar -->
    <aside class="sidebar">
      <div class="panel">
        <label class="panel-label" for="graph-search">Search</label>
        <input
          id="graph-search"
          type="text"
          class="search-input"
          placeholder="Find entity..."
          bind:value={searchQuery}
        />
      </div>

      <div class="panel">
        <div class="panel-label">Entity Types <span class="panel-hint">(click name to solo)</span></div>
        {#each ALL_TYPES as t}
          <div class="type-filter">
            <input
              type="checkbox"
              checked={enabledTypes.has(t)}
              onchange={() => toggleType(t)}
            />
            <span class="type-dot" style="background:{TYPE_COLORS[t]}"></span>
            <button class="type-name-btn" class:solo={enabledTypes.size === 1 && enabledTypes.has(t)} onclick={() => soloType(t)}>{TYPE_LABELS[t] || t}</button>
            <span class="type-count">{typeCounts[t] ?? 0}</span>
          </div>
        {/each}
      </div>

      {#if rawData}
        <div class="panel stats-panel">
          <div class="panel-label">Graph Stats</div>
          <div class="stat-row"><span>Entities</span><strong>{rawData.nodes?.length?.toLocaleString()}</strong></div>
          <div class="stat-row"><span>Relations</span><strong>{rawData.edges?.length?.toLocaleString()}</strong></div>
        </div>
      {/if}

      <div class="panel controls-panel">
        <div class="panel-label">Controls</div>
        <div class="control-hint">Scroll to zoom</div>
        <div class="control-hint">Drag to pan</div>
        <div class="control-hint">Click node for details</div>
        {#if graphInstance}
          <button class="control-btn" onclick={() => graphInstance.zoomToFit(500, 40)}>
            Reset view
          </button>
        {/if}
      </div>
    </aside>

    <!-- Graph canvas -->
    <div
      class="graph-container"
      bind:this={containerEl}
      onmousemove={handleMouseMove}
    >
      {#if loading}
        <div class="overlay">
          <div class="spinner"></div>
          <span>Loading {selectedReligion} graph...</span>
        </div>
      {:else if error}
        <div class="overlay empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="0.5" fill="currentColor" />
          </svg>
          <p>{error}</p>
          <small>Make sure the graph has been built with <code>node scripts/build-graph.js</code></small>
        </div>
      {:else if !rawData}
        <div class="overlay empty-state">
          <p>Select a tradition to explore</p>
        </div>
      {/if}

      <!-- Hover tooltip -->
      {#if hoveredNode && !selectedNode}
        <div class="tooltip" style="left:{tooltipX + 12}px; top:{tooltipY - 10}px;">
          <div class="tooltip-header">
            <span class="tooltip-dot" style="background:{TYPE_COLORS[hoveredNode.type]}"></span>
            <strong>{hoveredNode.name}</strong>
          </div>
          <div class="tooltip-meta">
            <span class="tooltip-type">{hoveredNode.type}</span>
            <span class="tooltip-mentions">{hoveredNode.mentionCount?.toLocaleString()} mentions</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Right sidebar: node details -->
    {#if selectedNode}
      <aside class="details-panel">
        <div class="details-header">
          <span class="type-badge" style="background:{TYPE_COLORS[selectedNode.type] ?? '#6b7280'}">{selectedNode.type}</span>
          <button class="close-btn" onclick={() => { selectedNode = null; }} aria-label="Close">&#x2715;</button>
        </div>
        <h2 class="details-name">{selectedNode.name}</h2>
        <div class="details-meta">
          <span>{selectedNode.religion}</span>
          <span class="details-sep">|</span>
          <span>{selectedNode.mentionCount?.toLocaleString()} mentions</span>
        </div>
        {#if selectedNode.description}
          <p class="details-description">{selectedNode.description}</p>
        {/if}
        {#if connectedEntities.length > 0}
          <div class="connected-section">
            <div class="panel-label">Connected ({connectedEntities.length})</div>
            <ul class="connected-list">
              {#each connectedEntities.slice(0, 30) as entity}
                <li>
                  <button
                    class="connected-entity"
                    onclick={() => focusEntity(entity)}
                  >
                    <span class="type-dot" style="background:{TYPE_COLORS[entity.type] ?? '#6b7280'}"></span>
                    <span class="ce-name">{entity.name}</span>
                    <span class="ce-count">{entity.mentionCount}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<style>
  .graph-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 3.5rem);
    background: var(--surface-0, #0f172a);
    overflow: hidden;
  }
  .header {
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--border-default, #1e293b);
    background: var(--surface-1, #1e293b);
    flex-shrink: 0;
  }
  .header-row {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  h1 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #f1f5f9);
    margin: 0;
  }
  .header-stat {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
  }
  .religion-tabs {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    border-radius: 1rem;
    border: 1px solid var(--border-default, #334155);
    background: var(--surface-2, #334155);
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { background: var(--surface-3, #475569); color: var(--text-primary, #f1f5f9); }
  .tab-btn.active {
    background: var(--accent-primary, #3b82f6);
    color: #fff;
    border-color: var(--accent-primary, #3b82f6);
  }
  .tab-label { white-space: nowrap; }
  .tab-count {
    font-size: 0.6rem;
    opacity: 0.7;
    font-weight: 500;
  }
  .workspace {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .sidebar {
    width: 12.5rem;
    flex-shrink: 0;
    border-right: 1px solid var(--border-default, #1e293b);
    background: var(--surface-0, #0f172a);
    overflow-y: auto;
    padding: 0.625rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .panel { display: flex; flex-direction: column; gap: 0.3rem; }
  .panel-label {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #64748b);
    margin-bottom: 0.125rem;
  }
  .search-input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.75rem;
    background: var(--input-bg, #1e293b);
    border: 1px solid var(--input-border, #334155);
    border-radius: 0.375rem;
    color: var(--text-primary, #f1f5f9);
    outline: none;
  }
  .search-input:focus { border-color: var(--accent-primary, #3b82f6); }
  .type-filter {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    padding: 0.1rem 0;
  }
  .type-filter input { cursor: pointer; width: 14px; height: 14px; }
  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .type-name-btn {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .type-name-btn:hover { color: var(--text-primary, #f1f5f9); text-decoration: underline; }
  .type-name-btn.solo { color: var(--accent-primary, #3b82f6); font-weight: 600; }
  .panel-hint { font-weight: 400; opacity: 0.5; text-transform: none; letter-spacing: 0; }
  .type-count { font-size: 0.65rem; color: var(--text-muted, #64748b); }
  .stats-panel { margin-top: auto; }
  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--text-secondary, #94a3b8);
    padding: 0.1rem 0;
  }
  .stat-row strong { color: var(--text-primary, #f1f5f9); }
  .controls-panel { border-top: 1px solid var(--border-default, #1e293b); padding-top: 0.5rem; }
  .control-hint { font-size: 0.65rem; color: var(--text-muted, #64748b); padding: 0.05rem 0; }
  .control-btn {
    margin-top: 0.25rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.7rem;
    border: 1px solid var(--border-default, #334155);
    border-radius: 0.375rem;
    background: var(--surface-2, #334155);
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    width: 100%;
  }
  .control-btn:hover { background: var(--surface-3, #475569); color: var(--text-primary, #f1f5f9); }
  .graph-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: var(--surface-0, #0f172a);
  }
  .graph-container :global(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--text-muted, #64748b);
    font-size: 0.85rem;
    z-index: 10;
    pointer-events: none;
  }
  .empty-state { gap: 0.5rem; pointer-events: auto; }
  .empty-icon { color: var(--text-muted, #64748b); opacity: 0.4; }
  .empty-state small { font-size: 0.7rem; opacity: 0.6; }
  .empty-state code { font-size: 0.65rem; background: var(--surface-2, #334155); padding: 0.15rem 0.35rem; border-radius: 0.25rem; }
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--border-default, #334155);
    border-top-color: var(--accent-primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Tooltip */
  .tooltip {
    position: absolute;
    z-index: 20;
    pointer-events: none;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(51, 65, 85, 0.8);
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    max-width: 220px;
  }
  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8rem;
    color: #f1f5f9;
    line-height: 1.3;
  }
  .tooltip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .tooltip-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.65rem;
    color: #94a3b8;
    margin-top: 0.25rem;
  }
  .tooltip-type { text-transform: capitalize; }

  /* Details panel */
  .details-panel {
    width: 14rem;
    flex-shrink: 0;
    border-left: 1px solid var(--border-default, #1e293b);
    background: var(--surface-1, #1e293b);
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .details-header { display: flex; align-items: center; justify-content: space-between; }
  .type-badge {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    color: #fff;
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }
  .close-btn:hover { color: var(--text-primary, #f1f5f9); background: var(--hover-overlay, rgba(255,255,255,0.05)); }
  .details-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary, #f1f5f9);
    margin: 0;
    line-height: 1.3;
  }
  .details-meta {
    font-size: 0.7rem;
    color: var(--text-secondary, #94a3b8);
    display: flex;
    gap: 0.375rem;
  }
  .details-sep { opacity: 0.4; }
  .details-description {
    font-size: 0.75rem;
    color: var(--text-secondary, #94a3b8);
    line-height: 1.5;
    margin: 0;
  }
  .connected-section { display: flex; flex-direction: column; gap: 0.3rem; }
  .connected-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .connected-entity {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0.2rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    transition: all 0.1s;
  }
  .connected-entity:hover { background: var(--hover-overlay, rgba(255,255,255,0.05)); color: var(--text-primary, #f1f5f9); }
  .ce-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ce-count { font-size: 0.6rem; color: var(--text-muted, #64748b); }

  @media (max-width: 768px) {
    .sidebar { display: none; }
    .details-panel { width: 100%; max-height: 40vh; }
  }
</style>
