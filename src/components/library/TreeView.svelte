<script>
  import { createEventDispatcher } from 'svelte';

  let { religions = [], selectedReligion = null, selectedCollection = null } = $props();

  const dispatch = createEventDispatcher();
  let expandedReligion = $state(null);

  function toggleReligion(religionName) {
    expandedReligion = expandedReligion === religionName ? null : religionName;
  }

  function selectReligion(religion) {
    dispatch('select', {
      religion: religion.name,
      collection: null,
      node: { node_type: 'religion', name: religion.name, slug: religion.slug }
    });
  }

  function selectCollection(religion, collection) {
    dispatch('select', {
      religion: religion.name,
      collection: collection.name,
      node: {
        node_type: 'collection',
        name: collection.name,
        slug: collection.slug,
        religionSlug: religion.slug,
        religionName: religion.name
      }
    });
  }

  $effect(() => {
    if (selectedReligion && expandedReligion !== selectedReligion) {
      expandedReligion = selectedReligion;
    }
  });
</script>

<div class="flex-1 overflow-y-auto py-2">
  {#each religions as religion}
    {@const isExpanded = expandedReligion === religion.name}
    {@const isSelected = selectedReligion === religion.name && !selectedCollection}
    <div class="mb-1">
      <button
        class="w-full py-2.5 px-4 border-l-[3px] border-l-accent flex justify-between items-center text-sm font-medium text-left cursor-pointer transition-all
               {isExpanded ? 'bg-accent text-white' : isSelected ? 'bg-accent/20' : 'bg-surface-2 hover:bg-surface-3 text-primary'}"
        onclick={() => { toggleReligion(religion.name); selectReligion(religion); }}
      >
        <span class="flex-1 truncate">{religion.name}</span>
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full min-w-[2.5rem] text-center
                     {isExpanded ? 'bg-white/15' : 'bg-surface-3 text-muted'}">
          {religion.count.toLocaleString()}
        </span>
      </button>

      {#if isExpanded && religion.collections?.length > 0}
        <div class="flex flex-wrap gap-1.5 p-2 pl-3 bg-surface-1 border-l-[3px] border-l-accent/30">
          {#each religion.collections as collection}
            {@const collSelected = selectedReligion === religion.name && selectedCollection === collection.name}
            <button
              class="flex items-center gap-1.5 py-1.5 px-2.5 rounded-full text-[0.8125rem] cursor-pointer transition-all whitespace-nowrap
                     {collSelected ? 'bg-accent/15 text-accent border border-accent' : 'bg-surface-2 border border-border-subtle text-secondary hover:bg-surface-3 hover:text-primary hover:border-border'}"
              onclick={() => selectCollection(religion, collection)}
            >
              <span class="max-w-[140px] truncate">{collection.name}</span>
              <span class="text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded
                           {collSelected ? 'bg-accent text-white' : 'bg-accent/20 text-accent'}">
                {collection.count}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
