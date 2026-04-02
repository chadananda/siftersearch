<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';

  // Religion options
  const RELIGIONS = [
    "Baha'i", 'Buddhist', 'Christian', 'Confucian',
    'Hindu', 'Islam', 'Jain', 'Judaism', 'Tao', 'Zoroastrian'
  ];

  // Entity type colors
  const TYPE_COLORS = {
    person: '#3b82f6',
    concept: '#22c55e',
    place: '#ef4444',
    event: '#f97316',
    document: '#a855f7',
    organization: '#6b7280',
  };

  const ALL_TYPES = Object.keys(TYPE_COLORS);

  // State
  let selectedReligion = $state(RELIGIONS[0]);
  let graphData = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let selectedNode = $state(null);
  let searchQuery = $state('');
  let enabledTypes = $state(new Set(ALL_TYPES));
  let svgEl = $state(null);
  let containerEl = $state(null);

  // Derived: filtered nodes/links
  let filteredData = $derived(() => {
    if (!graphData) return null;
    const nodes = graphData.nodes.filter(n => enabledTypes.has(n.type));
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
    return { nodes, links };
  });

  // Derived: entity counts by type
  let typeCounts = $derived(() => {
    if (!graphData) return {};
    return ALL_TYPES.reduce((acc, t) => {
      acc[t] = graphData.nodes.filter(n => n.type === t).length;
      return acc;
    }, {});
  });

  // Derived: connected entities for selected node
  let connectedEntities = $derived(() => {
    if (!selectedNode || !graphData) return [];
    const links = graphData.links.filter(l => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      return src === selectedNode.id || tgt === selectedNode.id;
    });
    return links.map(l => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      const otherId = src === selectedNode.id ? tgt : src;
      return graphData.nodes.find(n => n.id === otherId);
    }).filter(Boolean);
  });

  // Fetch graph data for selected religion
  async function loadGraph(religion) {
    loading = true;
    error = null;
    graphData = null;
    selectedNode = null;
    try {
      const slug = religion.toLowerCase().replace("'", '').replace(/\s+/g, '-');
      const res = await fetch(`/api/graph/${slug}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      graphData = data;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // Node radius from mention_count
  function nodeRadius(n) {
    const count = n.mention_count ?? 1;
    return Math.max(8, Math.min(40, 8 + Math.sqrt(count) * 2));
  }

  // Build D3 force simulation
  function buildGraph(data) {
    if (!svgEl || !containerEl) return;
    d3.select(svgEl).selectAll('*').remove();
    const w = containerEl.clientWidth || 800;
    const h = containerEl.clientHeight || 600;

    const svg = d3.select(svgEl)
      .attr('width', w)
      .attr('height', h);

    // Zoom/pan layer
    const g = svg.append('g');
    svg.call(d3.zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', (e) => g.attr('transform', e.transform))
    );

    // Compute weight range for edge opacity
    const weights = data.links.map(l => l.weight ?? 1);
    const minW = Math.min(...weights), maxW = Math.max(...weights);
    const opacityScale = d3.scaleLinear().domain([minW, maxW]).range([0.15, 0.7]).clamp(true);

    // Clone links/nodes so D3 can mutate them
    const nodes = data.nodes.map(n => ({ ...n }));
    const links = data.links.map(l => ({ ...l }));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 4));

    // Draw edges
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', d => opacityScale(d.weight ?? 1))
      .attr('stroke-width', 1.5);

    // Draw nodes
    const nodeGroup = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on('click', (e, d) => { e.stopPropagation(); selectedNode = d; });

    nodeGroup.append('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => TYPE_COLORS[d.type] ?? '#6b7280')
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    nodeGroup.append('text')
      .text(d => d.name?.length > 14 ? d.name.slice(0, 12) + '…' : (d.name ?? ''))
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('font-size', '10px')
      .attr('fill', 'var(--text-secondary)')
      .attr('pointer-events', 'none');

    // Dismiss selection on svg click
    svg.on('click', () => { selectedNode = null; });

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Highlight search matches
    $effect(() => {
      const q = searchQuery.trim().toLowerCase();
      nodeGroup.select('circle')
        .attr('stroke', d => (q && d.name?.toLowerCase().includes(q)) ? '#facc15' : '#fff')
        .attr('stroke-width', d => (q && d.name?.toLowerCase().includes(q)) ? 3 : 1.5);
    });
  }

  // Re-render when filteredData changes
  $effect(() => {
    const data = filteredData();
    if (data && svgEl) buildGraph(data);
  });

  // Load on religion change
  $effect(() => {
    loadGraph(selectedReligion);
  });

  function toggleType(t) {
    const next = new Set(enabledTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    enabledTypes = next;
  }

  onMount(() => {
    // Trigger initial resize observation
    if (containerEl) {
      const ro = new ResizeObserver(() => {
        const data = filteredData();
        if (data && svgEl) buildGraph(data);
      });
      ro.observe(containerEl);
      return () => ro.disconnect();
    }
  });
</script>

<div class="graph-page">
  <!-- Header -->
  <div class="header">
    <h1>Knowledge Graph Explorer</h1>
    <!-- Religion tabs -->
    <div class="religion-tabs" role="tablist">
      {#each RELIGIONS as religion}
        <button
          role="tab"
          aria-selected={selectedReligion === religion}
          class="tab-btn"
          class:active={selectedReligion === religion}
          onclick={() => { selectedReligion = religion; }}
        >{religion}</button>
      {/each}
    </div>
  </div>

  <div class="workspace">
    <!-- Left sidebar: controls + stats -->
    <aside class="sidebar">
      <!-- Search -->
      <div class="panel">
        <label class="panel-label" for="graph-search">Highlight Entity</label>
        <input
          id="graph-search"
          type="text"
          class="search-input"
          placeholder="Search entities..."
          bind:value={searchQuery}
        />
      </div>

      <!-- Type filters -->
      <div class="panel">
        <div class="panel-label">Entity Types</div>
        {#each ALL_TYPES as t}
          <label class="type-filter">
            <input
              type="checkbox"
              checked={enabledTypes.has(t)}
              onchange={() => toggleType(t)}
            />
            <span class="type-dot" style="background:{TYPE_COLORS[t]}"></span>
            <span class="type-name">{t}</span>
            <span class="type-count">{typeCounts()[t] ?? 0}</span>
          </label>
        {/each}
      </div>

      <!-- Stats -->
      {#if graphData}
        <div class="panel stats-panel">
          <div class="panel-label">Graph Stats</div>
          <div class="stat-row"><span>Entities</span><strong>{graphData.nodes.length}</strong></div>
          <div class="stat-row"><span>Relations</span><strong>{graphData.links.length}</strong></div>
        </div>
      {/if}
    </aside>

    <!-- Graph canvas -->
    <div class="graph-container" bind:this={containerEl}>
      {#if loading}
        <div class="overlay"><div class="spinner"></div><span>Loading graph…</span></div>
      {:else if error}
        <div class="overlay empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          <p>No graph data available</p>
          <small>The graph API for {selectedReligion} is not yet connected.</small>
        </div>
      {:else if !graphData}
        <div class="overlay empty-state">
          <p>Select a tradition to explore.</p>
        </div>
      {:else}
        <svg bind:this={svgEl} class="graph-svg"></svg>
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
        {#if selectedNode.religion}
          <div class="details-meta">Religion: <strong>{selectedNode.religion}</strong></div>
        {/if}
        {#if selectedNode.mention_count != null}
          <div class="details-meta">Mentions: <strong>{selectedNode.mention_count}</strong></div>
        {/if}
        {#if selectedNode.description}
          <p class="details-description">{selectedNode.description}</p>
        {/if}
        {#if connectedEntities().length > 0}
          <div class="connected-section">
            <div class="panel-label">Connected ({connectedEntities().length})</div>
            <ul class="connected-list">
              {#each connectedEntities() as entity}
                <li>
                  <button
                    class="connected-entity"
                    onclick={() => { selectedNode = entity; }}
                  >
                    <span class="type-dot" style="background:{TYPE_COLORS[entity.type] ?? '#6b7280'}"></span>
                    {entity.name}
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
    background: var(--surface-0);
    overflow: hidden;
  }
  .header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-1);
    flex-shrink: 0;
  }
  h1 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.5rem;
  }
  .religion-tabs {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  .tab-btn {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    border-radius: 1rem;
    border: 1px solid var(--border-default);
    background: var(--surface-2);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { background: var(--surface-3); color: var(--text-primary); }
  .tab-btn.active {
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    border-color: var(--accent-primary);
  }
  .workspace {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .sidebar {
    width: 13rem;
    flex-shrink: 0;
    border-right: 1px solid var(--border-default);
    background: var(--surface-0);
    overflow-y: auto;
    padding: 0.75rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .panel { display: flex; flex-direction: column; gap: 0.375rem; }
  .panel-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 0.125rem;
  }
  .search-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    font-size: 0.8rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 0.375rem;
    color: var(--text-primary);
    outline: none;
  }
  .search-input:focus { border-color: var(--input-border-focus); }
  .type-filter {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.125rem 0;
  }
  .type-filter input { cursor: pointer; }
  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .type-name { flex: 1; }
  .type-count {
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .stats-panel { margin-top: auto; }
  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--text-secondary);
    padding: 0.125rem 0;
  }
  .stat-row strong { color: var(--text-primary); }
  .graph-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: var(--surface-0);
  }
  .graph-svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .empty-state { gap: 0.5rem; }
  .empty-icon { color: var(--text-muted); opacity: 0.5; }
  .empty-state small { font-size: 0.75rem; opacity: 0.7; }
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .details-panel {
    width: 14rem;
    flex-shrink: 0;
    border-left: 1px solid var(--border-default);
    background: var(--surface-1);
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .details-header { display: flex; align-items: center; justify-content: space-between; }
  .type-badge {
    font-size: 0.65rem;
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
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }
  .close-btn:hover { color: var(--text-primary); background: var(--hover-overlay); }
  .details-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.3;
  }
  .details-meta { font-size: 0.75rem; color: var(--text-secondary); }
  .details-meta strong { color: var(--text-primary); }
  .details-description {
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }
  .connected-section { display: flex; flex-direction: column; gap: 0.375rem; }
  .connected-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.125rem; }
  .connected-entity {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0.25rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.1s;
  }
  .connected-entity:hover { background: var(--hover-overlay); color: var(--text-primary); }
</style>
