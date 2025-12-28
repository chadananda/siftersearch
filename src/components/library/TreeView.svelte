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
        <span class="flex items-center gap-3 flex-1 truncate">
          {#if religion.name?.toLowerCase().includes('baha')}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="1.699 1.631 19.772 19.847" class="w-9 h-9 {isExpanded ? 'text-white' : 'text-accent'}">
              <path d="M11.5,3.48029005 L9.86707145,6.23402656 C9.74619801,6.437865 9.49883302,6.52885196 9.27468556,6.45192074 L6.25338496,5.414959 L6.76953271,8.59284101 C6.80718408,8.8246576 6.67842221,9.05143482 6.4600597,9.13788926 L3.4533676,10.3283036 L5.8859769,12.4198707 C6.06475776,12.5735871 6.11185819,12.8313093 5.99900337,13.0383241 L4.42725354,15.9214579 L7.62386698,15.9270008 C7.86471473,15.9274184 8.07103871,16.0994803 8.1147113,16.3363358 L8.70947825,19.5620159 L11.1773193,17.4770613 C11.3636425,17.3196462 11.6363575,17.3196462 11.8226807,17.4770613 L14.2905217,19.5620159 L14.8852887,16.3363358 C14.9289613,16.0994803 15.1352853,15.9274184 15.376133,15.9270008 L18.5727465,15.9214579 L17.0009966,13.0383241 C16.8881418,12.8313093 16.9352422,12.5735871 17.1140231,12.4198707 L19.5466324,10.3283036 L16.5399403,9.13788926 C16.3215778,9.05143482 16.1928159,8.8246576 16.2304673,8.59284101 L16.746615,5.414959 L13.7253144,6.45192074 C13.501167,6.52885196 13.253802,6.437865 13.1329285,6.23402656 L11.5,3.48029005 Z M9.21446299,5.3739917 L11.0699285,2.24497344 C11.2636165,1.91834219 11.7363835,1.91834219 11.9300715,2.24497344 L13.785537,5.3739917 L17.2116856,4.19807926 C17.5690519,4.07542508 17.9281055,4.37821709 17.8675327,4.75115899 L17.2820118,8.35616644 L20.6840597,9.70311074 C21.0337251,9.84155081 21.1111381,10.3019466 20.8259769,10.5471293 L18.0724866,12.9145911 L19.8530034,16.1806759 C20.0344569,16.5135245 19.7939622,16.9193419 19.414867,16.9199992 L15.7933689,16.9262788 L15.1177113,20.5906642 C15.0480968,20.9682142 14.5965827,21.1297021 14.3033193,20.8819387 L11.5,18.5135554 L8.69668074,20.8819387 C8.40341733,21.1297021 7.95190324,20.9682142 7.8822887,20.5906642 L7.20663109,16.9262788 L3.58513302,16.9199992 C3.2060378,16.9193419 2.96554309,16.5135245 3.14699663,16.1806759 L4.92751342,12.9145911 L2.1740231,10.5471293 C1.88886186,10.3019466 1.96627494,9.84155081 2.3159403,9.70311074 L5.71798824,8.35616644 L5.13246729,4.75115899 C5.07189452,4.37821709 5.43094815,4.07542508 5.78831444,4.19807926 L9.21446299,5.3739917 Z" fill="currentColor"/>
            </svg>
          {:else if religion.symbol}
            <span class="text-4xl leading-none {isExpanded ? 'text-white' : 'text-accent'}">{religion.symbol}</span>
          {/if}
          <span class="truncate">{religion.name}</span>
        </span>
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full min-w-[2.5rem] text-center
                     {isExpanded ? 'bg-white/20 text-white' : 'bg-accent/20 text-accent'}">
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
