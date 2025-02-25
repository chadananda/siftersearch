<script>
  const { path, size = 20 } = $props();

  function handleClick(event) {
    console.log('Icon clicked');
    event.stopPropagation();
  }
</script>

<svg 
  xmlns="http://www.w3.org/2000/svg"
  width={size} 
  height={size} 
  viewBox="0 0 24 24" 
  fill="none" 
  stroke="currentColor" 
  stroke-width="2" 
  stroke-linecap="round" 
  stroke-linejoin="round"
  class="shrink-0 pointer-events-none"
  on:click={handleClick}
>
  <path d={path} />
</svg>
