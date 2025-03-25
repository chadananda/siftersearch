<!--
  MockClerkProvider.svelte
  A simple mock of the ClerkProvider component for development mode
-->
<script>
  // Accept the same props as the real ClerkProvider
  const { publishableKey, options, children } = $props();
</script>

<!-- Just render the children directly -->
{@render children?.()}
