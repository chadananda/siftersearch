<script>
  import { createEventDispatcher } from 'svelte';
  import ReligionIcon from '../ReligionIcon.svelte';

  let { religions = [], selectedReligion = null, selectedCollection = null } = $props();

  const dispatch = createEventDispatcher();
  let expandedReligion = $state(null);

  function handleReligionClick(religion) {
    if (expandedReligion === religion.name) {
      // Already expanded — collapse it
      expandedReligion = null;
    } else {
      // Expand and select
      expandedReligion = religion.name;
      dispatch('select', {
        religion: religion.name,
        collection: null,
        node: { node_type: 'religion', name: religion.name, slug: religion.slug }
      });
    }
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
</script>

<div class="flex-1 overflow-y-auto py-2">
  {#each religions as religion}
    {@const isExpanded = expandedReligion === religion.name}
    {@const isSelected = selectedReligion === religion.name && !selectedCollection}
    <div class="mb-1">
      <button
        class="w-full py-1.5 px-3 border-l-2 border-l-accent flex justify-between items-center text-[0.8125rem] font-medium text-left cursor-pointer transition-all
               {isExpanded ? 'bg-accent text-white' : isSelected ? 'bg-accent/20' : 'bg-surface-2 hover:bg-surface-3 text-primary'}"
        onclick={() => handleReligionClick(religion)}
      >
        <span class="flex items-center gap-1.5 flex-1 truncate">
          <span class="w-5 h-5 flex items-center justify-center shrink-0 {isExpanded ? 'text-white' : 'text-accent'}">
            <ReligionIcon religion={religion.name} size="sm" />
          </span>
          <span class="truncate">{religion.name}</span>
        </span>
        <span class="text-[0.625rem] font-semibold tabular-nums {isExpanded ? 'text-white/70' : 'text-muted'}">
          {religion.count.toLocaleString()}
        </span>
      </button>

      {#if isExpanded && religion.collections?.length > 0}
        <div class="bg-surface-1 border-l-[3px] border-l-accent/30">
          {#each religion.collections as collection}
            {@const collSelected = selectedReligion === religion.name && selectedCollection === collection.name}
            <button
              class="w-full flex items-center justify-between py-2 px-3 pl-6 text-[0.8125rem] text-left cursor-pointer transition-all border-b border-border-subtle last:border-b-0
                     {collSelected ? 'bg-accent/10 text-accent' : 'text-secondary hover:bg-surface-2 hover:text-primary'}"
              onclick={() => selectCollection(religion, collection)}
            >
              <span class="truncate">{collection.name}</span>
              <span class="text-[0.6875rem] font-medium px-1.5 py-0.5 rounded shrink-0 ml-2
                           {collSelected ? 'bg-accent text-white' : 'bg-surface-2 text-muted'}">
                {collection.count}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
